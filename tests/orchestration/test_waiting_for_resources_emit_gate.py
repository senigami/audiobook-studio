from tests.orchestration.test_progress_service_emit_race import _make_local_service


def test_emit_gate_lets_a_finished_job_re_enter_as_waiting_for_resources():
    svc, _, _, _ = _make_local_service()

    allowed = svc._should_emit_unlocked(
        payload={"status": "waiting_for_resources"},
        previous={"status": "done"},
        last_emit_tick=None,
    )

    assert allowed is True
