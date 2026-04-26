"""Tests for TaskOrchestrator.cancel() logic."""

from __future__ import annotations

import pytest


class TestOrchestratorCancel:
    def test_cancel_unknown_task_returns_false(self, orchestrator):
        assert orchestrator.cancel("nonexistent") is False

    def test_cancel_active_task_returns_true(self, orchestrator, make_task):
        task = make_task("c1")
        # Register in active by submitting first with reuse so it doesn't block
        orchestrator._active["c1"] = task
        result = orchestrator.cancel("c1")
        assert result is True

    def test_cancel_calls_on_cancel(self, orchestrator, make_task):
        task = make_task("c2")
        orchestrator._active["c2"] = task
        orchestrator.cancel("c2")
        task.on_cancel.assert_called_once()

    def test_cancel_removes_from_active(self, orchestrator, make_task):
        task = make_task("c3")
        orchestrator._active["c3"] = task
        orchestrator.cancel("c3")
        assert "c3" not in orchestrator._active

    def test_cancel_publishes_cancelling_then_cancelled(self, orchestrator, progress_service, make_task):
        task = make_task("c4")
        orchestrator._active["c4"] = task
        orchestrator.cancel("c4")
        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        assert "cancelling" in statuses
        cancelling_idx = statuses.index("cancelling")
        assert statuses[cancelling_idx + 1] == "cancelled"

    def test_cancel_on_cancel_exception_still_publishes_cancelled(self, orchestrator, progress_service, make_task):
        """on_cancel() raising must not prevent the cancelled terminal event."""
        task = make_task("c5")
        task.on_cancel.side_effect = RuntimeError("cleanup failed")
        orchestrator._active["c5"] = task
        orchestrator.cancel("c5")
        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        assert "cancelled" in statuses
