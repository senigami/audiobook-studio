from tests.orchestration.test_progress_service_emit_race import _make_local_service


def test_emit_gate_drops_a_waiting_frame_for_a_finished_job():
    svc, _, _, _ = _make_local_service()

    allowed = svc._should_emit_unlocked(
        payload={"status": "waiting_for_resources"},
        previous={"status": "done"},
        last_emit_tick=None,
    )

    assert allowed is False


def test_emit_gate_still_lets_a_finished_job_re_enter_as_queued():
    svc, _, _, _ = _make_local_service()

    allowed = svc._should_emit_unlocked(
        payload={"status": "queued"},
        previous={"status": "done"},
        last_emit_tick=None,
    )

    assert allowed is True
