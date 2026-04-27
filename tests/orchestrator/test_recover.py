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
            payload={"_recovered_from_status": "running"},
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
            payload={"_recovered_from_status": "running"},
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
            payload={"_recovered_from_status": "running"},
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
            payload={"_recovered_from_status": "running"},
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
                        payload={"_recovered_from_status": "running"})
            for i in range(3)
        ]
        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=contexts,
        ):
            recovered = orchestrator.recover()

        assert len(recovered) == 3
