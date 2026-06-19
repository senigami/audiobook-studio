from app.orchestration.progress.eta import estimate_eta_seconds, _select_eta_baseline
from app.orchestration.progress.service import ProgressService


def _make_service():
    events: list[tuple[dict[str, object], str]] = []
    wall_now = {"value": 100.0}
    monotonic_now = {"value": 500.0}

    def wall_clock() -> float:
        return wall_now["value"]

    def monotonic_clock() -> float:
        return monotonic_now["value"]

    def broadcaster(*, payload: dict[str, object], channel: str) -> None:
        events.append((payload, channel))

    service = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=10.0,
    )
    return service, events, wall_now, monotonic_now


def test_publish_throttles_small_progress_churn():
    service, events, wall_now, monotonic_now = _make_service()

    emitted = service.publish(
        job_id="job-1",
        status="running",
        progress=0.2,
        eta_seconds=30,
        message="Rendering",
        chapter_id="chapter-1",
    )
    assert emitted is not None
    # lifecycle + queue.items (row-status authority) + chapter-scoped progress
    assert len(events) == 3
    assert all(channel == "jobs" for _, channel in events)
    topics = [payload.get("topic") for payload, _ in events]
    assert "queue.items" in topics
    scoped = [payload for payload, _ in events if payload.get("topic") == "chapters.progress"]
    assert scoped and scoped[0]["payload"]["progress"] == 0.2
    assert scoped[0]["payload"]["status"] == "running"

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    throttled = service.publish(
        job_id="job-1",
        status="running",
        progress=0.204,
        eta_seconds=30,
        message="Rendering",
        chapter_id="chapter-1",
    )
    assert throttled is None
    assert len(events) == 3

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    emitted_again = service.publish(
        job_id="job-1",
        status="running",
        progress=0.28,
        eta_seconds=29,
        message="Rendering",
        chapter_id="chapter-1",
    )
    assert emitted_again is not None
    assert emitted_again["progress"] == 0.28
    # A meaningful progress advance now refreshes the queue row too (queue.items
    # is the row progress authority): queue.items + chapters.progress = +2 → 5.
    assert len(events) == 5
    assert [p for p, _ in events if p.get("topic") == "queue.items"][-1]["payload"]["progress"] == 0.28


def test_publish_emits_heartbeat_after_silence():
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(
        job_id="job-2",
        status="running",
        progress=0.4,
        eta_seconds=20,
        message="Rendering",
        chapter_id="chapter-2",
    )
    assert len(events) == 3

    wall_now["value"] += 11.0
    monotonic_now["value"] += 11.0
    repeated = service.publish(
        job_id="job-2",
        status="running",
        progress=0.4,
        eta_seconds=20,
        message="Rendering",
        chapter_id="chapter-2",
    )
    assert repeated is not None
    # Heartbeat after silence refreshes both the queue row and the chapter overlay.
    assert len(events) == 5


def test_publish_allows_explicit_progress_regression_for_recovery():
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(
        job_id="job-3",
        status="running",
        progress=0.85,
        eta_seconds=8,
        message="Rendering",
        chapter_id="chapter-3",
    )
    assert len(events) == 3

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    blocked_reset_event = service.publish(
        job_id="job-3",
        status="preparing",
        progress=0.0,
        eta_seconds=None,
        message="Recovering",
        reason_code="recovery_reconcile",
        chapter_id="chapter-3",
    )

    assert blocked_reset_event is not None
    assert blocked_reset_event["progress"] == 0.85
    assert blocked_reset_event["reason_code"] == "recovery_reconcile"
    assert len(events) == 6

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    reset_event = service.publish(
        job_id="job-3",
        status="preparing",
        progress=0.0,
        eta_seconds=None,
        message="Recovering",
        reason_code="recovery_reconcile",
        allow_progress_regression=True,
        chapter_id="chapter-3",
    )

    assert reset_event is not None
    assert reset_event["progress"] == 0.0
    assert reset_event["reason_code"] == "recovery_reconcile"
    # preparing→preparing is not a status change, but a job-scope frame still
    # refreshes the queue row + chapter overlay (+2 vs the old chapter-only +1).
    assert len(events) == 8


def test_monotonic_progress_and_eta_selection():
    service, _, _, _ = _make_service()

    assert service._normalize_monotonic_progress(job_id="job-3", completed_units=2, total_units=10) == 0.2
    assert service._normalize_monotonic_progress(job_id="job-3", completed_units=1, total_units=10) == 0.2
    assert estimate_eta_seconds(completed_units=80, total_units=100, observed_cps=1.0, baseline_cps=0.5) == 20
    assert estimate_eta_seconds(completed_units=80, total_units=100, observed_cps=0.05, baseline_cps=0.5) == 40
    assert _select_eta_baseline(observed_cps=0.05, baseline_cps=0.5) == 0.5


def test_estimate_eta_does_not_advance_published_progress_floor():
    service, _, _, _ = _make_service()

    service.publish(job_id="job-4", status="running", progress=0.7, eta_seconds=5)
    assert service._last_progress_by_job["job-4"] == 0.7

    eta = service.estimate_eta(job_id="job-4", completed_units=8, total_units=10, observed_cps=1.0)
    assert eta == 2
    assert service._last_progress_by_job["job-4"] == 0.7

    emitted = service.publish(job_id="job-4", status="running", progress=0.4, eta_seconds=eta)
    assert emitted is not None
    assert emitted["progress"] == 0.7


def test_publish_queued_reset_clears_progress_floor_without_explicit_flag():
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(
        job_id="job-5",
        status="done",
        progress=1.0,
        eta_seconds=0,
        message="Finished",
    )
    assert len(events) == 2

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    queued_event = service.publish(
        job_id="job-5",
        status="queued",
        progress=0.0,
        eta_seconds=None,
        message="Queued again",
    )

    assert queued_event is not None
    assert queued_event["progress"] == 0.0
    # done->queued is a status transition: lifecycle + queue.items emitted.
    assert len(events) == 4

def test_publish_includes_explicit_eta_basis():
    service, events, wall_now, _ = _make_service()

    wall_now["value"] = 1200.0
    emitted = service.publish(
        job_id="job-6",
        status="running",
        progress=0.4,
        eta_seconds=45,
    )

    assert emitted is not None
    assert emitted["eta_seconds"] == 45
    assert emitted["eta_basis"] == "remaining_from_update"
    # 1200 (now) + 45 (eta) = 1245
    assert emitted["estimated_end_at"] == 1245.0
    assert emitted["updated_at"] == 1200.0


def test_publish_includes_render_group_context():
    service, events, wall_now, _ = _make_service()

    wall_now["value"] = 1200.0
    emitted = service.publish(
        job_id="job-8",
        status="running",
        progress=0.44,
        render_group_count=2,
        completed_render_groups=1,
        active_render_group_index=1,
        total_render_weight=945,
        completed_render_weight=420,
        active_render_group_weight=525,
        grouped_progress=0.44,
        chapter_id="chapter-8",
    )

    assert emitted is not None
    assert emitted["render_group_count"] == 2
    assert emitted["completed_render_groups"] == 1
    assert emitted["active_render_group_index"] == 1
    assert emitted["total_render_weight"] == 945
    assert emitted["completed_render_weight"] == 420
    assert emitted["active_render_group_weight"] == 525
    assert len(events) == 3
    assert events[1][1] == "jobs"
    assert events[1][0]["payload"]["progress"] == 0.44
    assert events[1][0]["payload"]["status"] == "running"


def test_publish_remaps_finalizing_to_running():
    service, events, _, _ = _make_service()

    emitted = service.publish(
        job_id="job-7",
        status="finalizing",
        progress=0.91,
    )
    assert emitted is not None
    assert emitted["status"] == "running"
    assert emitted["progress"] == 0.91
    assert events[0][0]["payload"]["status"] == "finalizing"


def test_publish_status_transition_emits_queue_item_status():
    """Orchestrated transitions suppress the legacy ws job listener
    (skip_job_updated), so the progress service itself MUST mirror every
    status transition onto queue.items — the frontend row-status authority.
    Regression: queue rows froze at 'preparing' for entire renders because
    no queue_item_status frames were ever emitted for chapter jobs."""
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(job_id="job-q", status="running", scope="job",
                    parent_job_id="proj-1", chapter_id="chap-1", progress=0.1)
    queue_frames = [p for p, _ in events if p.get("topic") == "queue.items"]
    assert len(queue_frames) == 1
    assert queue_frames[0]["eventKind"] == "queue_item_status"
    assert queue_frames[0]["payload"]["status"] == "running"
    assert queue_frames[0]["ids"]["jobId"] == "job-q"

    # Progress-only update: the queue row is the progress authority, so a
    # meaningful progress advance (no status change) now ALSO emits queue.items
    # — otherwise the global queue row freezes at its last status's progress.
    events.clear()
    monotonic_now["value"] += 1.0
    service.publish(job_id="job-q", status="running", scope="job",
                    parent_job_id="proj-1", chapter_id="chap-1", progress=0.4)
    progress_queue_frames = [p for p, _ in events if p.get("topic") == "queue.items"]
    assert len(progress_queue_frames) == 1
    assert progress_queue_frames[0]["payload"]["progress"] == 0.4

    # Terminal transition: queue.items done frame.
    events.clear()
    monotonic_now["value"] += 1.0
    service.publish(job_id="job-q", status="completed", scope="job",
                    parent_job_id="proj-1", chapter_id="chap-1", progress=1.0)
    queue_frames = [p for p, _ in events if p.get("topic") == "queue.items"]
    assert len(queue_frames) == 1
    assert queue_frames[0]["payload"]["status"] == "done"
