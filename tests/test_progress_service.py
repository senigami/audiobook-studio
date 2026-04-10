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
    )
    assert emitted is not None
    assert emitted["progress"] == 0.2
    assert events == [(emitted, "jobs")]

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    throttled = service.publish(
        job_id="job-1",
        status="running",
        progress=0.204,
        eta_seconds=30,
        message="Rendering",
    )
    assert throttled is None
    assert len(events) == 1

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    emitted_again = service.publish(
        job_id="job-1",
        status="running",
        progress=0.28,
        eta_seconds=29,
        message="Rendering",
    )
    assert emitted_again is not None
    assert emitted_again["progress"] == 0.28
    assert len(events) == 2


def test_publish_emits_heartbeat_after_silence():
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(
        job_id="job-2",
        status="running",
        progress=0.4,
        eta_seconds=20,
        message="Rendering",
    )
    assert len(events) == 1

    wall_now["value"] += 11.0
    monotonic_now["value"] += 11.0
    repeated = service.publish(
        job_id="job-2",
        status="running",
        progress=0.4,
        eta_seconds=20,
        message="Rendering",
    )
    assert repeated is not None
    assert len(events) == 2


def test_publish_allows_explicit_progress_regression_for_recovery():
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(
        job_id="job-3",
        status="running",
        progress=0.85,
        eta_seconds=8,
        message="Rendering",
    )
    assert len(events) == 1

    wall_now["value"] += 1.0
    monotonic_now["value"] += 1.0
    blocked_reset_event = service.publish(
        job_id="job-3",
        status="preparing",
        progress=0.0,
        eta_seconds=None,
        message="Recovering",
        reason_code="recovery_reconcile",
    )

    assert blocked_reset_event is not None
    assert blocked_reset_event["progress"] == 0.85
    assert blocked_reset_event["reason_code"] == "recovery_reconcile"
    assert len(events) == 2

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
    )

    assert reset_event is not None
    assert reset_event["progress"] == 0.0
    assert reset_event["reason_code"] == "recovery_reconcile"
    assert len(events) == 3


def test_monotonic_progress_and_eta_selection():
    service, _, _, _ = _make_service()

    assert service._normalize_monotonic_progress(job_id="job-3", completed_units=2, total_units=10) == 0.2
    assert service._normalize_monotonic_progress(job_id="job-3", completed_units=1, total_units=10) == 0.2
    assert estimate_eta_seconds(completed_units=80, total_units=100, observed_cps=1.0, baseline_cps=0.5) == 20
    assert estimate_eta_seconds(completed_units=80, total_units=100, observed_cps=0.05, baseline_cps=0.5) == 40
    assert _select_eta_baseline(observed_cps=0.05, baseline_cps=0.5) == 0.5


def test_estimate_eta_does_not_advance_published_progress_floor():
    service, _, _, _ = _make_service()

    eta = service.estimate_eta(job_id="job-4", completed_units=8, total_units=10, observed_cps=1.0)
    assert eta == 2
    assert "job-4" not in service._last_progress_by_job

    emitted = service.publish(job_id="job-4", status="running", progress=0.4, eta_seconds=eta)
    assert emitted is not None
    assert emitted["progress"] == 0.4


def test_publish_queued_reset_clears_progress_floor_without_explicit_flag():
    service, events, wall_now, monotonic_now = _make_service()

    service.publish(
        job_id="job-5",
        status="done",
        progress=1.0,
        eta_seconds=0,
        message="Finished",
    )
    assert len(events) == 1

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
    assert len(events) == 2
