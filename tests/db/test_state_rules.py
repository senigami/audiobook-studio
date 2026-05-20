import pytest
import time
import json
import os
from pathlib import Path
from unittest.mock import patch, MagicMock, ANY
from app.db.state import update_job, load_state, put_job, clear_all_jobs, STATE_FILE, requeue
from app.db.models import Job

@pytest.fixture(autouse=True)
def clean_state(tmp_path):
    with patch("app.db.state.STATE_FILE", tmp_path / "state.json"):
        clear_all_jobs()
        yield


def test_progress_rounding_rule():
    job = Job(id="test_rounding", engine="xtts", chapter_file="c1.txt", status="running", progress=0.0, created_at=time.time())
    put_job(job)

    # Rule 3.20: Progress must be rounded to exactly 2 decimal places
    update_job("test_rounding", progress=0.12345)
    state = load_state()
    assert state["jobs"]["test_rounding"]["progress"] == 0.12

    update_job("test_rounding", progress=0.1256)
    state = load_state()
    assert state["jobs"]["test_rounding"]["progress"] == 0.13


def test_update_job_stamps_updated_at_for_state_and_broadcast():
    job = Job(id="test_updated_at", engine="xtts", chapter_file="c1.txt", status="running", progress=0.0, created_at=time.time())
    put_job(job)

    events = []

    def listener(job_id, updates, current_job):
        events.append((job_id, updates, current_job))

    with patch("app.db.state._JOB_LISTENERS", [listener]):
        update_job("test_updated_at", progress=0.25)

    state = load_state()
    updated_at = state["jobs"]["test_updated_at"]["updated_at"]
    assert isinstance(updated_at, float)
    assert events[0][1]["updated_at"] == updated_at
    assert events[0][2]["updated_at"] == updated_at

def test_progress_regression_protection():
    job = Job(id="test_regress", engine="xtts", chapter_file="c1.txt", status="running", progress=0.5, created_at=time.time())
    put_job(job)

    # Attempting to regress progress
    update_job("test_regress", progress=0.4)
    state = load_state()
    assert state["jobs"]["test_regress"]["progress"] == 0.5 # Should stay at 0.5

    # Advancing progress
    update_job("test_regress", progress=0.6)
    state = load_state()
    assert state["jobs"]["test_regress"]["progress"] == 0.6

def test_status_regression_protection():
    job = Job(id="test_status_regress", engine="xtts", chapter_file="c1.txt", status="running", progress=0.9, created_at=time.time())
    put_job(job)

    # running (3) -> preparing (2) should be blocked
    update_job("test_status_regress", status="preparing")
    state = load_state()
    assert state["jobs"]["test_status_regress"]["status"] == "running"

    # running (3) -> done (5) should be allowed
    update_job("test_status_regress", status="done")
    state = load_state()
    assert state["jobs"]["test_status_regress"]["status"] == "done"


def test_reset_to_queued_from_terminal_status():
    # Rule: Allow regression only if explicitly resetting (e.g. back to queued from a terminal state)
    for terminal in ["done", "failed", "cancelled"]:
        job = Job(id=f"test_reset_{terminal}", engine="xtts", chapter_file="c1.txt", status=terminal, progress=1.0, created_at=time.time())
        put_job(job)

        update_job(f"test_reset_{terminal}", status="queued", progress=0.0)
        state = load_state()
        assert state["jobs"][f"test_reset_{terminal}"]["status"] == "queued"
        assert state["jobs"][f"test_reset_{terminal}"]["progress"] == 0.0

def test_force_broadcast_overrides_protection():
    job = Job(id="test_force", engine="xtts", chapter_file="c1.txt", status="done", progress=1.0, created_at=time.time())
    put_job(job)

    # Normal regression blocked
    update_job("test_force", status="running", progress=0.5)
    state = load_state()
    assert state["jobs"]["test_force"]["status"] == "done"

    # Force broadcast allows it
    update_job("test_force", status="running", progress=0.5, force_broadcast=True)
    state = load_state()
    assert state["jobs"]["test_force"]["status"] == "running"
    assert state["jobs"]["test_force"]["progress"] == 0.5

def test_requeue_clean_slate():
    # Rule 3.22: Clean Slate Protocol
    job = Job(
        id="test_requeue", 
        engine="xtts", 
        chapter_file="c1.txt", 
        status="done", 
        progress=1.0, 
        log="some logs",
        started_at=time.time(),
        finished_at=time.time(),
        error="some error",
        warning_count=5,
        created_at=time.time()
    )
    put_job(job)

    requeue("test_requeue")

    state = load_state()
    j = state["jobs"]["test_requeue"]
    assert j["status"] == "queued"
    assert j["progress"] == 0.0
    assert j["log"] == ""
    assert j["started_at"] is None
    assert j["finished_at"] is None
    assert j["error"] is None
    assert j["warning_count"] == 0


def test_finalizing_status_mapped_to_running():
    job = Job(id="test_finalizing_mapping", engine="xtts", chapter_file="c1.txt", status="finalizing", progress=0.9, created_at=time.time())
    put_job(job)

    # After put_job, status should be remapped to running
    state = load_state()
    assert state["jobs"]["test_finalizing_mapping"]["status"] == "running"

    # If we call update_job with finalizing, it should also map to running
    update_job("test_finalizing_mapping", status="finalizing", progress=0.95)
    state = load_state()
    assert state["jobs"]["test_finalizing_mapping"]["status"] == "running"
    assert state["jobs"]["test_finalizing_mapping"]["progress"] == 0.95


def test_eta_projection_uses_clamped_progress():
    started_at = 1000.0
    job = Job(
        id="test_eta_clamp",
        engine="xtts",
        chapter_file="c1.txt",
        status="running",
        progress=0.44,
        started_at=started_at,
        created_at=started_at,
    )
    put_job(job)

    # 1. Update at t = 1010.0 with progress = 0.44
    # Expected elapsed = 10.0
    # Projected ETA = 10.0 * (1 - 0.44) / 0.44 = 12.72s -> 13s
    update_job("test_eta_clamp", progress=0.44, updated_at=1010.0)
    state = load_state()
    assert state["jobs"]["test_eta_clamp"]["progress"] == 0.44
    assert state["jobs"]["test_eta_clamp"]["eta_seconds"] == 13

    # 2. Now update at t = 1020.0 with progress = 0.08 (which is a regression)
    # Regression guard should clamp progress to 0.44.
    # If the ETA projection uses the clamped progress (0.44):
    # Expected elapsed = 20.0
    # Projected ETA = 20.0 * (1 - 0.44) / 0.44 = 25.45s -> 26s.
    # So we assert that the computed eta_seconds is 26, NOT 230!
    update_job("test_eta_clamp", progress=0.08, updated_at=1020.0)
    state = load_state()
    assert state["jobs"]["test_eta_clamp"]["progress"] == 0.44
    assert state["jobs"]["test_eta_clamp"]["eta_seconds"] == 26


