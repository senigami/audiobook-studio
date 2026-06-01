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
    assert payload1["source"].endswith("test_active_segment_progress_guard")
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
    assert payload2["source"].endswith("test_active_segment_progress_guard")
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

            # Verify that the broadcast was completely suppressed
            assert mock_broadcast.call_count == 0


def test_progress_service_chapter_progress_sends_canonical_envelope():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # Publish a chapter progress event
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.45,
        grouped_progress=0.4,
        eta_seconds=120,
        message="Synthesizing...",
    )

    # Verify that the broadcaster received a lifecycle transition plus a canonical chapters.progress envelope.
    assert len(broadcast_events) == 2
    events_by_topic = {e[0]["topic"]: (e[0], e[1]) for e in broadcast_events}
    assert "jobs.lifecycle" in events_by_topic
    assert "chapters.progress" in events_by_topic

    lifecycle_event, lifecycle_channel = events_by_topic["jobs.lifecycle"]
    assert lifecycle_channel == "jobs"
    assert lifecycle_event["eventKind"] == "job_lifecycle"
    assert lifecycle_event["payload"]["reasonCode"] == "START_SYNTHESIS"

    event, channel = events_by_topic["chapters.progress"]
    assert channel == "jobs"
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "chapters.progress"
    assert event["eventKind"] == "chapter_progress"
    assert event["ids"] == {
        "projectId": "proj-1",
        "chapterId": "chap-1",
        "jobId": "job-chap-1",
        "segmentId": None
    }
    assert event["payload"]["status"] == "running"
    assert event["payload"]["progress"] == 0.45
    assert event["payload"]["groupedProgress"] == 0.4
    assert event["payload"]["grouped_progress"] == 0.4
    assert event["payload"]["etaSeconds"] == 120
    assert event["payload"]["eta_seconds"] == 120
    assert event["payload"]["message"] == "Synthesizing..."


def test_progress_service_segment_progress_sends_canonical_envelope():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # Publish a segment progress event
    service.publish(
        job_id="job-seg-1",
        status="running",
        scope="segment",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.75,
        eta_seconds=15,
        message="Synthesizing segment...",
    )

    # Verify that the broadcaster received a lifecycle transition plus a canonical segment progress envelope.
    assert len(broadcast_events) == 2
    lifecycle_event, lifecycle_channel = broadcast_events[0]
    assert lifecycle_channel == "jobs"
    assert lifecycle_event["topic"] == "jobs.lifecycle"
    assert lifecycle_event["eventKind"] == "job_lifecycle"
    assert lifecycle_event["payload"]["reasonCode"] == "START_SYNTHESIS"

    event, channel = broadcast_events[1]
    assert channel == "jobs"
    assert event["type"] == "studio_event"
    assert event["version"] == 1
    assert event["topic"] == "segments.progress"
    assert event["eventKind"] == "segment_progress"
    assert event["ids"] == {
        "projectId": "proj-1",
        "chapterId": "chap-1",
        "jobId": "job-seg-1",
        "segmentId": "job-seg-1"
    }
    assert event["payload"]["status"] == "running"
    assert event["payload"]["progress"] == 0.75
    assert event["payload"]["activeSegmentId"] == "job-seg-1"
    assert event["payload"]["activeSegmentProgress"] == 0.75
    assert event["payload"]["active_segment_id"] == "job-seg-1"
    assert event["payload"]["active_segment_progress"] == 0.75
    assert event["payload"]["etaSeconds"] == 15
    assert event["payload"]["eta_seconds"] == 15
    assert event["payload"]["message"] == "Synthesizing segment..."


def test_progress_service_dual_progress_emission():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # Publish progress update containing both chapter progress and active segment progress
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.45,
        grouped_progress=0.4,
        eta_seconds=120,
        message="Synthesizing segment 2...",
        active_segment_id="seg-2",
        active_segment_progress=0.6,
        render_group_count=10,
        completed_render_groups=1,
        active_render_group_index=2,
    )

    # We expect THREE events: jobs.lifecycle first, segments.progress second, chapters.progress third
    assert len(broadcast_events) == 3

    # 1. Lifecycle event
    lifecycle_event, lifecycle_channel = broadcast_events[0]
    assert lifecycle_channel == "jobs"
    assert lifecycle_event["topic"] == "jobs.lifecycle"
    assert lifecycle_event["eventKind"] == "job_lifecycle"
    assert lifecycle_event["payload"]["reasonCode"] == "START_SYNTHESIS"

    # 2. Segment progress event
    seg_event, seg_channel = broadcast_events[1]
    assert seg_channel == "jobs"
    assert seg_event["topic"] == "segments.progress"
    assert seg_event["eventKind"] == "segment_progress"
    assert seg_event["ids"]["segmentId"] == "seg-2"
    assert seg_event["payload"]["status"] == "running"
    assert seg_event["payload"]["progress"] == 0.6
    assert seg_event["payload"]["segmentIndex"] == 2
    assert seg_event["payload"]["segmentCount"] == 10

    # 3. Chapter progress event
    chap_event, chap_channel = broadcast_events[2]
    assert chap_channel == "jobs"
    assert chap_event["topic"] == "chapters.progress"
    assert chap_event["eventKind"] == "chapter_progress"
    assert chap_event["ids"]["chapterId"] == "chap-1"
    assert chap_event["payload"]["status"] == "running"
    assert chap_event["payload"]["progress"] == 0.45

def test_progress_service_segment_eta_isolated_from_chapter_eta():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    service.publish(
        job_id="job-dual-eta",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.44,
        eta_seconds=22,
        active_segment_id="seg-1",
        active_segment_progress=1.0,
        active_segment_eta_seconds=0,
        render_group_count=2,
        completed_render_groups=0,
        active_render_group_index=0,
    )

    lifecycle_event = broadcast_events[0][0]
    seg_event = broadcast_events[1][0]
    chap_event = broadcast_events[2][0]

    assert lifecycle_event["topic"] == "jobs.lifecycle"
    assert seg_event["topic"] == "segments.progress"
    assert seg_event["payload"]["progress"] == 1.0
    assert seg_event["payload"]["eta_seconds"] == 0

    assert chap_event["topic"] == "chapters.progress"
    assert chap_event["payload"]["progress"] == 0.44
    assert chap_event["payload"]["eta_seconds"] == 22


def test_progress_service_completed_segment_does_not_inherit_chapter_eta():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    service.publish(
        job_id="job-complete-segment",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.44,
        eta_seconds=22,
        active_segment_id="seg-1",
        active_segment_progress=1.0,
        render_group_count=2,
        completed_render_groups=0,
        active_render_group_index=0,
    )

    lifecycle_event = broadcast_events[0][0]
    seg_event = broadcast_events[1][0]
    chap_event = broadcast_events[2][0]

    assert lifecycle_event["topic"] == "jobs.lifecycle"
    assert seg_event["topic"] == "segments.progress"
    assert seg_event["payload"]["progress"] == 1.0
    assert seg_event["payload"]["eta_seconds"] is None

    assert chap_event["topic"] == "chapters.progress"
    assert chap_event["payload"]["progress"] == 0.44
    assert chap_event["payload"]["eta_seconds"] == 22


def test_progress_service_segment_completion_matching_outcome():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # 1. Start a segment
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id="seg-1",
        active_segment_progress=0.5,
    )
    broadcast_events.clear()

    # 2. Complete the segment while the job is still running (clears active segment)
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id=None,
    )

    # Expect segment completion and chapter progress only (status did not change).
    assert len(broadcast_events) == 2
    seg_event = broadcast_events[0][0]
    assert seg_event["topic"] == "segments.progress"
    assert seg_event["ids"]["segmentId"] == "seg-1"
    assert seg_event["payload"]["status"] == "done"
    assert seg_event["payload"]["progress"] == 1.0

    chap_event = broadcast_events[1][0]
    assert chap_event["topic"] == "chapters.progress"

    # 3. Start another segment
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id="seg-2",
        active_segment_progress=0.8,
    )
    broadcast_events.clear()

    # 4. Fail the job while the segment is active
    service.publish(
        job_id="job-chap-1",
        status="failed",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id=None,
        message="Failure reason"
    )

    # Expect lifecycle completion, segment completion event to MATCH the job outcome, and chapter progress.
    assert len(broadcast_events) == 3
    lifecycle_event = broadcast_events[0][0]
    assert lifecycle_event["topic"] == "jobs.lifecycle"
    assert lifecycle_event["payload"]["status"] == "failed"

    seg_event = broadcast_events[1][0]
    assert seg_event["topic"] == "segments.progress"
    assert seg_event["ids"]["segmentId"] == "seg-2"
    assert seg_event["payload"]["status"] == "failed"

    chap_event = broadcast_events[2][0]
    assert chap_event["topic"] == "chapters.progress"
    assert chap_event["payload"]["status"] == "failed"


def test_progress_service_segment_handoff_completion_uses_segment_saved_command():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    service.publish(
        job_id="job-handoff",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id="seg-1",
        active_segment_progress=0.8,
        reason_code="SEGMENT_PROGRESS",
        has_segment_support=True,
    )
    broadcast_events.clear()

    service.publish(
        job_id="job-handoff",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id="seg-2",
        active_segment_progress=0.0,
        reason_code="START_SEGMENT",
        has_segment_support=True,
    )

    completion_event = broadcast_events[0][0]
    next_segment_event = broadcast_events[1][0]

    assert completion_event["topic"] == "segments.progress"
    assert completion_event["ids"]["segmentId"] == "seg-1"
    assert completion_event["payload"]["status"] == "done"
    assert completion_event["payload"]["progress"] == 1.0
    assert completion_event["payload"]["reasonCode"] == "SEGMENT_SAVED"

    assert next_segment_event["topic"] == "segments.progress"
    assert next_segment_event["ids"]["segmentId"] == "seg-2"
    assert next_segment_event["payload"]["reasonCode"] == "START_SEGMENT"


def test_progress_service_emits_active_segment_eta_only_updates():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster,
        monotonic_clock=lambda: 100.0,
    )

    service.publish(
        job_id="job-segment-eta-only",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id="seg-1",
        active_segment_progress=0.2,
        active_segment_eta_seconds=40,
        reason_code="SEGMENT_PROGRESS",
        has_segment_support=True,
    )
    broadcast_events.clear()

    service.publish(
        job_id="job-segment-eta-only",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        active_segment_id="seg-1",
        active_segment_progress=0.2,
        active_segment_eta_seconds=25,
        reason_code="SEGMENT_PROGRESS",
        has_segment_support=True,
    )

    assert len(broadcast_events) == 2
    segment_event = broadcast_events[0][0]
    chapter_event = broadcast_events[1][0]
    assert segment_event["topic"] == "segments.progress"
    assert segment_event["payload"]["eta_seconds"] == 25
    assert chapter_event["topic"] == "chapters.progress"


def test_meaningful_chapter_progress_emits_chapter_progress():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # 1. First emission: goes from None to running (status change)
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.10,
    )
    broadcast_events.clear()

    # 2. Second emission: status is still running, but progress changes to 0.52 (meaningful progress tick)
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.52,
    )

    # We expect only chapters.progress for the tick.
    events_by_topic = {e[0]["topic"]: e[0] for e in broadcast_events}
    assert "chapters.progress" in events_by_topic
    chapter_event = events_by_topic["chapters.progress"]
    assert chapter_event["eventKind"] == "chapter_progress"
    assert chapter_event["payload"]["progress"] == 0.52
    assert chapter_event["payload"]["status"] == "running"


def test_segment_progress_does_not_emit_queue_item_status():
    from app.orchestration.progress.service import ProgressService
    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # 1. First emission: running status
    service.publish(
        job_id="job-chap-1",
        status="running",
        scope="chapter",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.10,
    )
    broadcast_events.clear()

    # 2. Segment progress update (scope="segment")
    service.publish(
        job_id="job-seg-1",
        status="running",
        scope="segment",
        parent_job_id="proj-1",
        chapter_id="chap-1",
        progress=0.25,
    )

    # Segment progress should emit segments.progress, but NOT queue.items status updates
    events_by_topic = {e[0]["topic"]: e[0] for e in broadcast_events}
    assert "segments.progress" in events_by_topic
    assert "queue.items" not in events_by_topic


def test_segment_block_eta_math():
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from unittest.mock import patch

    # Test case 1: baseline CPS only
    eta = OrchestratorHelpersMixin._estimate_active_segment_eta_seconds(
        expected_duration=10.0,
        total_weight=1000,
        active_weight=200,
        active_progress=0.5,
        started_at=None
    )
    # total_weight = 1000, expected = 10 -> baseline_cps = 100
    # active_weight = 200, progress = 0.5 -> completed = 100, remaining = 100
    # remaining / baseline_cps = 100 / 100 = 1.0 -> 1s
    assert eta == 1

    # Test case 2: observed CPS only (no baseline)
    with patch("time.time", return_value=1005.0):
        started_at = 1000.0 # exactly 5 seconds elapsed
        eta = OrchestratorHelpersMixin._estimate_active_segment_eta_seconds(
            expected_duration=None,
            total_weight=0,
            active_weight=200,
            active_progress=0.25,
            started_at=started_at
        )
        # active_weight = 200, progress = 0.25 -> completed = 50, remaining = 150
        # elapsed = 5s -> observed_cps = 50 / 5 = 10
        # remaining / observed_cps = 150 / 10 = 15s
        assert eta == 15


def test_segment_block_eta_100_percent():
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    eta = OrchestratorHelpersMixin._estimate_active_segment_eta_seconds(
        expected_duration=10.0,
        total_weight=1000,
        active_weight=200,
        active_progress=1.0,
        started_at=None
    )
    assert eta == 0


def test_segment_block_eta_uses_calibrated_cps():
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    # Test case: baseline CPS is provided via calibrated_cps directly
    # expected_duration is 10.0, total_weight = 1000 -> if it derived it, baseline_cps = 100
    # But we pass calibrated_cps = 50.0
    # active_weight = 200, progress = 0.5 -> completed = 100, remaining = 100
    # remaining / calibrated_cps = 100 / 50.0 = 2.0 -> 2s
    eta = OrchestratorHelpersMixin._estimate_active_segment_eta_seconds(
        expected_duration=10.0,
        total_weight=1000,
        active_weight=200,
        active_progress=0.5,
        started_at=None,
        calibrated_cps=50.0
    )
    assert eta == 2


def test_progress_service_coerces_preparing_after_started_at():
    from app.orchestration.progress.service import ProgressService

    broadcast_events = []

    def dummy_broadcaster(*, payload: dict, channel: str):
        broadcast_events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=lambda **kwargs: 10,
        broadcaster=dummy_broadcaster
    )

    # Legitimate preparing before started_at
    service.publish(
        job_id="job-coerced-test",
        status="preparing",
        scope="chapter",
        parent_job_id="proj-coerced",
        chapter_id="chap-coerced",
        progress=0.0,
        message="Preparing...",
    )

    events_by_topic = {e[0]["topic"]: e[0] for e in broadcast_events}
    assert events_by_topic["jobs.lifecycle"]["payload"]["status"] == "preparing"
    assert events_by_topic["chapters.progress"]["payload"]["status"] == "preparing"

    broadcast_events.clear()

    # START_SYNTHESIS: running with started_at
    service.publish(
        job_id="job-coerced-test",
        status="running",
        scope="chapter",
        parent_job_id="proj-coerced",
        chapter_id="chap-coerced",
        progress=0.0,
        started_at=1780106056.0,
        reason_code="START_SYNTHESIS",
    )

    broadcast_events.clear()

    # Subsequent preparing status (rollback) should be coerced to running
    service.publish(
        job_id="job-coerced-test",
        status="preparing",
        scope="chapter",
        parent_job_id="proj-coerced",
        chapter_id="chap-coerced",
        progress=0.0,
    )

    # No jobs.lifecycle should be emitted because status did not change (it stayed "running")
    # chapters.progress should be emitted with status "running"
    assert len(broadcast_events) == 1
    event = broadcast_events[0][0]
    assert event["topic"] == "chapters.progress"
    assert event["payload"]["status"] == "running"


def test_orchestrator_publish_coerces_preparing_after_started_at():
    from app.db.state import put_job, get_jobs, update_job, Job
    from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
    from app.orchestration.tasks.base import TaskContext

    jobs_db = {}
    def mock_put_job(j): jobs_db[j.id] = j
    def mock_get_jobs(): return jobs_db
    def mock_update_job(jid, **kwargs):
        if jid in jobs_db:
            for k, v in kwargs.items():
                if hasattr(jobs_db[jid], k):
                    setattr(jobs_db[jid], k, v)

    from unittest.mock import patch, MagicMock
    with patch("app.db.state.put_job", side_effect=mock_put_job), \
         patch("app.db.state.get_jobs", side_effect=mock_get_jobs), \
         patch("app.db.state.update_job", side_effect=mock_update_job):

        mock_progress = MagicMock()
        mixin = OrchestratorHelpersMixin()
        mixin.progress_service = mock_progress

        context = TaskContext(task_id="orch_rollback_test", task_type="test")

        # Legitimate preparing before started_at
        mixin._publish(context=context, status="preparing", progress=0.0)
        assert jobs_db["orch_rollback_test"].status == "preparing"
        assert jobs_db["orch_rollback_test"].started_at is None

        # Start synthesis: status running with started_at
        start_time = 1780106056.0
        mixin._publish(context=context, status="running", started_at=start_time)
        assert jobs_db["orch_rollback_test"].status == "running"
        assert jobs_db["orch_rollback_test"].started_at == start_time

        # Subsequent preparing update (like 0% SEGMENT_PROGRESS)
        # Should NOT rollback to preparing in the DB or in the progress service publication
        mixin._publish(context=context, status="running", reason_code="SEGMENT_PROGRESS", progress=0.0)
        assert jobs_db["orch_rollback_test"].status == "running"

        # Verify that we called progress_service with status="running" instead of "preparing"
        # The last call to progress_service.publish should have status="running"
        last_publish_args = mock_progress.publish.call_args[1]
        assert last_publish_args["status"] == "running"


def test_chapter_job_with_parent_id_classified_as_chapter():
    from app.db.models import Job

    # 1. Job with explicit classification override
    j1 = Job(id="job-1", engine="xtts", status="running", created_at=time.time())
    j1.classification_override = "chapter"
    assert j1.classification == "chapter"

    # 2. Job with segment indicators
    j2 = Job(id="job-2", engine="xtts", status="running", created_at=time.time())
    j2.segment_ids = ["seg1", "seg2"]
    assert j2.classification == "segment"

    # 3. Job with chapter_id and a project parent job ID
    j3 = Job(id="job-3", engine="xtts", status="running", created_at=time.time())
    j3.chapter_id = "chap-123"
    j3.parent_job_id = "project-uuid-456"
    assert j3.classification == "chapter"

    # 4. Job with parent_job_id starting with 'job-' (fallback check)
    j4 = Job(id="job-4", engine="xtts", status="running", created_at=time.time())
    j4.parent_job_id = "job-parent-123"
    assert j4.classification == "segment"

    # 5. Generic job
    j5 = Job(id="job-5", engine="xtts", status="running", created_at=time.time())
    assert j5.classification == "job"

    # 6. Job with chapter_id and active_segment_id (returns chapter unless overridden)
    j6 = Job(id="job-6", engine="xtts", status="running", created_at=time.time())
    j6.chapter_id = "chap-123"
    j6.active_segment_id = "seg-1"
    assert j6.classification == "chapter"

    # 7. Job with chapter_id and active_segment_id but explicit segment override
    j7 = Job(id="job-7", engine="xtts", status="running", created_at=time.time())
    j7.chapter_id = "chap-123"
    j7.active_segment_id = "seg-1"
    j7.classification_override = "segment"
    assert j7.classification == "segment"
