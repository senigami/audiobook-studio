import pytest
import time
import json
import os
from pathlib import Path
from unittest.mock import patch, MagicMock, ANY
from app.state import update_job, load_state, put_job, clear_all_jobs, STATE_FILE
from app.jobs import requeue
from app.models import Job

@pytest.fixture(autouse=True)
def clean_state(tmp_path):
    with patch("app.state.STATE_FILE", tmp_path / "state.json"):
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
    job = Job(id="test_status_regress", engine="xtts", chapter_file="c1.txt", status="finalizing", progress=0.9, created_at=time.time())
    put_job(job)

    # status_priority = {"done": 5, "failed": 5, "cancelled": 5, "finalizing": 4, "running": 3, "preparing": 2, "queued": 1, None: 0}
    # finalizing (4) -> running (3) should be blocked
    update_job("test_status_regress", status="running")
    state = load_state()
    assert state["jobs"]["test_status_regress"]["status"] == "finalizing"

    # finalizing (4) -> done (5) should be allowed
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

    with patch("app.jobs.job_queue.put"):
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
