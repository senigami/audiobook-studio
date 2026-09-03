from app.orchestration.progress.broadcaster import broadcast_progress, configure_progress_broadcaster


def test_broadcast_progress_uses_configured_sink():
    captured: list[tuple[dict[str, object], str]] = []

    def sink(payload: dict[str, object], channel: str) -> None:
        captured.append((payload, channel))

    configure_progress_broadcaster(sink)
    try:
        payload = {"type": "studio_job_event", "job_id": "job-1", "status": "running"}
        broadcast_progress(payload=payload, channel="jobs")
        assert captured == [(payload, "jobs")]
    finally:
        configure_progress_broadcaster(None)


def test_broadcast_progress_supports_manager_style_adapter():
    captured: list[dict[str, object]] = []

    def manager_like_broadcast(message: dict[str, object]) -> None:
        captured.append(message)

    configure_progress_broadcaster(lambda payload, _channel: manager_like_broadcast(payload))
    try:
        payload = {"type": "studio_job_event", "job_id": "job-2", "status": "running"}
        broadcast_progress(payload=payload, channel="jobs")
        assert captured == [payload]
    finally:
        configure_progress_broadcaster(None)
