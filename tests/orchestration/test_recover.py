"""Tests for TaskOrchestrator.recover() logic."""

from __future__ import annotations

from unittest.mock import patch
import pytest

from app.orchestration.tasks.base import TaskContext


class TestOrchestratorRecover:
    def test_empty_context_list_returns_empty(self, orchestrator):
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[],
        ):
            result = orchestrator.recover()
        assert result == []

    def test_valid_artifacts_complete_without_dispatch(self, orchestrator, progress_service):
        ctx = TaskContext(
            task_id="recovered-1",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running", "engine_id": "xtts", "script_text": "text", "output_path": "/tmp/out.wav"},
        )
        progress_service.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            recovered = orchestrator.recover()

        assert "recovered-1" in recovered
        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        assert "completed" in statuses
        assert "recovery_reused" in [
            c.kwargs.get("reason_code") for c in progress_service.publish.call_args_list
        ]

    def test_unresolved_artifacts_requeued_not_redispatched(self, orchestrator, progress_service):
        ctx = TaskContext(
            task_id="recovered-2",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running", "engine_id": "xtts", "script_text": "text", "output_path": "/tmp/out.wav"},
        )
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            recovered = orchestrator.recover()

        assert "recovered-2" in recovered
        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        # Should be preparing (recovery reset) then queued (re-queued), NOT running/completed.
        assert "preparing" in statuses
        assert "queued" in statuses
        assert "running" not in statuses

    def test_recovery_uses_allow_progress_regression(self, orchestrator, progress_service):
        """Recovery must allow progress to go backward (reset from prior run)."""
        ctx = TaskContext(
            task_id="r-regress",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running", "engine_id": "xtts", "script_text": "text", "output_path": "/tmp/out.wav"},
        )
        progress_service.reconcile.return_value = {"artifact_state": "valid", "can_reuse": True}
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            orchestrator.recover()

        regression_calls = [
            c for c in progress_service.publish.call_args_list
            if c.kwargs.get("allow_progress_regression") is True
        ]
        assert len(regression_calls) >= 1

    def test_recovery_publishes_recovery_resumed_reason(self, orchestrator, progress_service):
        ctx = TaskContext(
            task_id="r-reason",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running", "engine_id": "xtts", "script_text": "text", "output_path": "/tmp/out.wav"},
        )
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            orchestrator.recover()

        reason_codes = [
            c.kwargs.get("reason_code") for c in progress_service.publish.call_args_list
        ]
        assert "recovery_resumed" in reason_codes

    def test_multiple_contexts_all_recovered(self, orchestrator, progress_service):
        contexts = [
            TaskContext(task_id=f"r-{i}", task_type="synthesis", source="ui",
                        payload={"_recovered_from_status": "running", "engine_id": "xtts", "script_text": "text", "output_path": "/tmp/out.wav"})
            for i in range(3)
        ]
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=contexts,
        ):
            recovered = orchestrator.recover()

        assert len(recovered) == 3


class TestRecoveryThreadIsolation:
    """recover() spawns daemon submit threads; they must not outlive a test.

    A leaked recovery thread runs a full submit() — including the late-bound
    ``record_render_sample`` import — inside whatever ``unittest.mock.patch``
    window the next test has open, corrupting its call counts. This was the
    CI-only ``assert 2 == 1`` flake in
    test_submit.py::test_completed_bridge_task_records_render_stats
    (run 27325303292, 2026-06-11).
    """

    def test_recovery_threads_do_not_survive_isolation_join(self, orchestrator, progress_service):
        import threading

        from tests.orchestration.conftest import join_recovery_threads

        # Park the recovery thread inside the bridge call so it is provably
        # still alive when recover() returns (explicit sync per R4 — no sleeps).
        thread_in_bridge = threading.Event()
        release_bridge = threading.Event()

        def gated_synthesize(request):
            thread_in_bridge.set()
            release_bridge.wait(timeout=10)
            return {"status": "ok"}

        orchestrator.voice_bridge.synthesize.side_effect = gated_synthesize
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}

        ctx = TaskContext(
            task_id="leak-check-1",
            task_type="synthesis",
            source="ui",
            payload={
                "_recovered_from_status": "running",
                "engine_id": "xtts",
                "script_text": "text",
                "output_path": "/tmp/out.wav",
            },
        )
        # Force the bridge dispatch path regardless of which registry handlers
        # earlier tests in the session may have registered. The patch must stay
        # open while the background thread dispatches, so it wraps the join too.
        with patch(
            "app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None
        ), patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            orchestrator.recover()

            assert thread_in_bridge.wait(timeout=10), "recovery thread never reached the bridge"
            # recover() has returned but its submit thread is still alive —
            # exactly the leaked state a test would leave behind.
            assert any(t.name.startswith("recovery-") for t in threading.enumerate())

            release_bridge.set()
            survivors = join_recovery_threads()

        # After the isolation join (run by the autouse fixture between tests),
        # no recovery thread may remain to pollute the next patch window.
        assert survivors == []
        assert not any(t.name.startswith("recovery-") for t in threading.enumerate())
