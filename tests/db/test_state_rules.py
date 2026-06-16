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

def test_reset_to_preparing_from_terminal_status():
    # Rule: terminal → preparing must apply the status AND clear reset fields (spec §3.5)
    # Mirrors test_reset_to_queued_from_terminal_status; passes None reset values explicitly
    # so that the terminal_reset branch clears them (same pattern as requeue).
    for terminal in ["done", "failed", "cancelled"]:
        job = Job(
            id=f"test_reset_prep_{terminal}",
            engine="xtts",
            chapter_file="c1.txt",
            status=terminal,
            progress=1.0,
            finished_at=time.time(),
            error="some error",
            eta_seconds=99,
            eta_basis="remaining_from_update",
            estimated_end_at=time.time(),
            created_at=time.time(),
        )
        put_job(job)

        update_job(
            f"test_reset_prep_{terminal}",
            status="preparing",
            progress=0.0,
            finished_at=None,
            error=None,
            eta_seconds=None,
        )
        state = load_state()
        j = state["jobs"][f"test_reset_prep_{terminal}"]
        assert j["status"] == "preparing", f"Expected status='preparing' after terminal={terminal!r} reset, got {j['status']!r}"
        assert j["progress"] == 0.0
        assert j["finished_at"] is None, "finished_at must be cleared on terminal reset"
        assert j["error"] is None, "error must be cleared on terminal reset"
        assert j["eta_seconds"] is None, "eta_seconds must be cleared on terminal reset"


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


def test_active_segment_progress_forced_to_zero_when_id_is_none():
    job = Job(
        id="test_active_seg",
        engine="xtts",
        chapter_file="c1.txt",
        status="running",
        progress=0.0,
        active_segment_id=None,
        active_segment_progress=0.0,
        created_at=time.time()
    )
    put_job(job)

    # 1. Update job with progress but with id=None
    update_job("test_active_seg", active_segment_id=None, active_segment_progress=0.5)
    state = load_state()
    assert state["jobs"]["test_active_seg"]["active_segment_id"] is None
    assert state["jobs"]["test_active_seg"]["active_segment_progress"] == 0.0

    # 2. Update job with progress and id=some-id, should be allowed
    update_job("test_active_seg", active_segment_id="some-id", active_segment_progress=0.7)
    state = load_state()
    assert state["jobs"]["test_active_seg"]["active_segment_id"] == "some-id"
    assert state["jobs"]["test_active_seg"]["active_segment_progress"] == 0.7

    # 3. Update job setting id to None, progress should be reset
    update_job("test_active_seg", active_segment_id=None)
    state = load_state()
    assert state["jobs"]["test_active_seg"]["active_segment_id"] is None
    assert state["jobs"]["test_active_seg"]["active_segment_progress"] == 0.0


def test_active_segment_eta_fields():
    job = Job(
        id="test_active_seg_eta",
        engine="xtts",
        chapter_file="c1.txt",
        status="running",
        progress=0.0,
        active_segment_id="some-id",
        active_segment_progress=0.5,
        created_at=time.time()
    )
    put_job(job)

    # 1. Update job with active segment ETA fields
    update_job(
        "test_active_seg_eta",
        active_segment_eta_seconds=15,
        active_segment_eta_basis="remaining_from_update",
        active_segment_updated_at=12345.6
    )

    state = load_state()
    j_dict = state["jobs"]["test_active_seg_eta"]
    # These assertions should fail because the fields are not yet defined on Job model or handled in state_jobs
    assert j_dict.get("active_segment_eta_seconds") == 15
    assert j_dict.get("active_segment_eta_basis") == "remaining_from_update"
    assert j_dict.get("active_segment_updated_at") == 12345.6

    # 2. Update job setting id to None, active segment ETA fields should be cleared
    update_job("test_active_seg_eta", active_segment_id=None)
    state = load_state()
    j_dict = state["jobs"]["test_active_seg_eta"]
    assert j_dict.get("active_segment_id") is None
    assert j_dict.get("active_segment_eta_seconds") is None
    assert j_dict.get("active_segment_eta_basis") is None
    assert j_dict.get("active_segment_updated_at") is None


def test_chapter_queue_updates_do_not_overwrite_active_segment_eta():
    job = Job(
        id="test_preserve_seg_eta",
        engine="xtts",
        chapter_file="c1.txt",
        status="running",
        progress=0.1,
        active_segment_id="seg-123",
        active_segment_progress=0.4,
        active_segment_eta_seconds=15,
        active_segment_eta_basis="remaining_from_update",
        active_segment_updated_at=1000.0,
        created_at=time.time()
    )
    put_job(job)

    # Now simulate a chapter update (e.g. chapters.progress or queue update)
    # which has progress=0.2 and chapter eta_seconds=120, but doesn't mention segments.
    update_job(
        "test_preserve_seg_eta",
        progress=0.2,
        eta_seconds=120,
        eta_basis="remaining_from_update"
    )

    state = load_state()
    j_dict = state["jobs"]["test_preserve_seg_eta"]
    # Chapter fields should update
    assert j_dict["progress"] == 0.2
    assert j_dict["eta_seconds"] == 120

    # Active segment fields must be preserved and untouched
    assert j_dict["active_segment_id"] == "seg-123"
    assert j_dict["active_segment_progress"] == 0.4
    assert j_dict["active_segment_eta_seconds"] == 15
    assert j_dict["active_segment_eta_basis"] == "remaining_from_update"
    assert j_dict["active_segment_updated_at"] == 1000.0



