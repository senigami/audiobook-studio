import pytest
import time
from app.orchestration.scheduler.eta import calculate_predicted_progress
from app.db.models import Job

def test_calculate_predicted_progress_xtts_preparing():
    """XTTS jobs should be capped at prepare_limit if synthesis hasn't started, unless resuming."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="preparing", created_at=0.0)
    job.progress = 0.0

    # 1. Synthesis not started, should hold at current_p (0.0)
    job.started_at = None
    now = 100.0
    start = 99.0 # 1s elapsed
    eta = 100

    # Logic changed: now returns current_p (0.0) instead of animating
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.0

    # 2. Progress should STILL be 0.0 even after more time
    now = 110.0 # 11s elapsed
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.0

    # 3. Resumption case: already at 0.10 progress from previous run
    job.progress = 0.10
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.10 # Should not go BACKWARDS to 0.05

def test_calculate_predicted_progress_xtts_running():
    """XTTS jobs should use start_time consistently once synthesis starts."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="running", created_at=0.0)
    job.progress = 0.1
    job.started_at = 90.0

    now = 120.0
    start = 80.0 # Adjusted start time (progress 0.1 * eta 100 = 10s offset from 90s? No, adjusted start is the "logical" 0 point)
    eta = 100

    # elapsed = 120 - 80 = 40. 40/100 = 0.4
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.4

def test_calculate_predicted_progress_finalizing():
    """Progress should freeze during finalizing."""
    job = Job(id="j1", engine="xtts", chapter_file="c1.txt", status="finalizing", created_at=0.0)
    job.progress = 0.95

    now = 200.0
    start = 100.0
    eta = 50

    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.95

def test_calculate_predicted_progress_caps():
    """Progress should respect the provided limits."""
    job = Job(id="j1", engine="audiobook", chapter_file="b1", status="running", created_at=0.0)
    job.progress = 0.0

    now = 1000.0
    start = 100.0 # 900s elapsed
    eta = 100     # 900% progress vs eta

    # Should cap at 0.85 by default
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.85

    # Custom limit
    res = calculate_predicted_progress(job, now, start, eta, limit=0.99)
    assert res == 0.99

def test_calculate_predicted_progress_regression_protection():
    """Progress should never move backwards."""
    job = Job(id="j1", engine="audiobook", chapter_file="b1", status="running", created_at=0.0)
    job.progress = 0.8 # Already at 80%

    now = 110.0
    start = 100.0 # 10s elapsed
    eta = 100     # 10% calculated progress

    # Should return current_p (0.8) instead of calculated (0.1)
    res = calculate_predicted_progress(job, now, start, eta)
    assert res == 0.8


def test_active_segment_progress_guard():
    from app.orchestration.progress.service import ProgressService
    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=lambda **kwargs: None
    )

    # When active_segment_id is None, active_segment_progress must NOT be included in the payload
    payload1 = service._build_progress_payload(
        job_id="test-job",
        scope="job",
        parent_job_id=None,
        status="running",
        progress=0.5,
        eta_seconds=10,
        eta_confidence=None,
        message=None,
        reason_code=None,
        waiting_reason=None,
        started_at=None,
        updated_at=None,
        active_render_batch_id=None,
        active_render_batch_progress=None,
        active_segment_id=None,
        active_segment_progress=0.4,
    )
    assert "active_segment_progress" not in payload1
    assert "active_segment_id" not in payload1

    # When active_segment_id is provided, active_segment_progress should be included
    payload2 = service._build_progress_payload(
        job_id="test-job",
        scope="job",
        parent_job_id=None,
        status="running",
        progress=0.5,
        eta_seconds=10,
        eta_confidence=None,
        message=None,
        reason_code=None,
        waiting_reason=None,
        started_at=None,
        updated_at=None,
        active_render_batch_id=None,
        active_render_batch_progress=None,
        active_segment_id="seg1",
        active_segment_progress=0.4,
    )
    assert payload2.get("active_segment_id") == "seg1"
    assert payload2.get("active_segment_progress") == 0.4


def test_observed_remaining_seconds_early_blending():
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from unittest.mock import patch

    started_at = 1000.0

    # Mocking time.time to simulate 10s elapsed
    with patch("time.time", return_value=1010.0):
        # Progress 0.05 is early (< 0.15)
        # Expected duration is 40s
        # Without blending: extrapolated remaining = 10 * (1 - 0.05) / 0.05 = 190s.
        # With blending:
        # alpha = 0.05 / 0.15 = 1/3
        # blended = (1/3) * 190 + (2/3) * 40 = 63.33 + 26.67 = 90s
        eta = OrchestratorHelpersMixin._observed_remaining_seconds(
            started_at=started_at,
            progress=0.05,
            expected_duration=40.0
        )
        assert eta == 90

        # Progress >= 0.15 should not blend (100% extrapolated)
        # Extrapolated remaining at 0.20 progress = 10 * (1 - 0.2) / 0.2 = 40s
        eta_no_blend = OrchestratorHelpersMixin._observed_remaining_seconds(
            started_at=started_at,
            progress=0.20,
            expected_duration=100.0
        )
        assert eta_no_blend == 40


def test_update_job_early_eta_blending(tmp_path):
    from app.db.state import update_job, put_job, load_state, clear_all_jobs
    from unittest.mock import patch
    with patch("app.db.state.STATE_FILE", tmp_path / "state.json"):
        clear_all_jobs()

        # Create a job with an initial static eta
        start_time = 1000.0
        job = Job(
            id="blend_job",
            engine="xtts",
            status="running",
            progress=0.0,
            created_at=start_time,
            started_at=start_time,
            eta_seconds=40,
            eta_basis="remaining_from_update",
            estimated_end_at=start_time + 40
        )
        put_job(job)

        # Update job with progress 0.05, elapsed time 10s
        with patch("time.time", return_value=1010.0):
            update_job("blend_job", progress=0.05)

        state = load_state()
        updated_job = state["jobs"]["blend_job"]
        # Extrapolated = 10 * 19 = 190
        # Blended = (0.05/0.15)*190 + (0.1/0.15)*40 = 63.3 + 26.6 = 90
        assert updated_job["eta_seconds"] == 90


def test_terminal_job_drops_updates(tmp_path):
    from app.db.state import update_job, put_job, load_state, clear_all_jobs
    from unittest.mock import patch
    with patch("app.db.state.STATE_FILE", tmp_path / "state.json"):
        clear_all_jobs()

        # Create a job that is already cancelled
        job = Job(
            id="term_job",
            engine="xtts",
            status="cancelled",
            progress=1.0,
            created_at=1000.0,
        )
        put_job(job)

        # Try updating the job with progress=0.5, active_segment_id='seg1'
        update_job("term_job", progress=0.5, active_segment_id="seg1")

        # Verify that the update was dropped, and progress remains 1.0, and active_segment_id is not updated
        state = load_state()
        j = state["jobs"]["term_job"]
        assert j["status"] == "cancelled"
        assert j["progress"] == 1.0
        assert j.get("active_segment_id") is None


def test_skip_studio_job_event(tmp_path):
    from app.db.state import update_job, put_job, load_state, clear_all_jobs
    from app.api.ws import broadcast_job_updated
    from unittest.mock import patch, MagicMock
    from dataclasses import asdict

    with patch("app.db.state.STATE_FILE", tmp_path / "state.json"):
        clear_all_jobs()

        # Create a job
        job = Job(
            id="test_skip",
            engine="xtts",
            status="running",
            progress=0.1,
            created_at=1000.0,
        )
        put_job(job)

        # Mock ws manager.broadcast
        mock_broadcast = MagicMock()
        with patch("app.api.ws.manager.broadcast", mock_broadcast):
            # Call broadcast_job_updated directly with skip_studio_job_event=True
            broadcast_job_updated("test_skip", {"progress": 0.2, "skip_studio_job_event": True}, current_job=asdict(job))

            # Verify that only one broadcast was made (job_updated), and studio_job_event was skipped
            assert mock_broadcast.call_count == 1
            call_arg = mock_broadcast.call_args[0][0]
            assert call_arg["type"] == "job_updated"
            # Ensure skip_studio_job_event is NOT in the broadcast updates payload
            assert "skip_studio_job_event" not in call_arg["updates"]
