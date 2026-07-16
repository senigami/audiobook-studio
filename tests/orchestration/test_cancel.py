"""Tests for TaskOrchestrator.cancel() logic."""

from __future__ import annotations

import threading

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


class TestOrchestratorCancelWaitingTask:
    """COR-B-2: cancel() must also find a task still spinning in submit()'s
    resource-admission wait loop (registered in `_waiting`, not yet
    `_active`), not just an already-dispatched active task.

    R1 revert-check: pre-fix, `cancel()` only ever checked `self._active` —
    there was no `_waiting` registry at all, so `orchestrator._waiting`
    doesn't exist on that code (AttributeError) / `cancel()` unconditionally
    returns False for a task that only exists here.
    """

    def test_cancel_waiting_task_returns_true(self, orchestrator, make_task):
        task = make_task("w1")
        stop_event = threading.Event()
        orchestrator._waiting["w1"] = (task, stop_event)

        result = orchestrator.cancel("w1")

        assert result is True
        assert stop_event.is_set(), "cancel() must signal the waiting task's stop_event"

    def test_cancel_waiting_task_calls_on_cancel(self, orchestrator, make_task):
        task = make_task("w2")
        orchestrator._waiting["w2"] = (task, threading.Event())
        orchestrator.cancel("w2")
        task.on_cancel.assert_called_once()

    def test_cancel_waiting_task_removes_from_waiting_registry(self, orchestrator, make_task):
        task = make_task("w3")
        orchestrator._waiting["w3"] = (task, threading.Event())
        orchestrator.cancel("w3")
        assert "w3" not in orchestrator._waiting

    def test_cancel_waiting_task_does_not_release_resources_never_reserved(self, orchestrator, make_task):
        """A waiting task never acquired a resource slot — cancel() must not
        call release_task_resources for it (nothing to release)."""
        from unittest.mock import patch

        task = make_task("w4")
        orchestrator._waiting["w4"] = (task, threading.Event())
        with patch("app.orchestration.scheduler.orchestrator.release_task_resources") as mock_release:
            orchestrator.cancel("w4")
        mock_release.assert_not_called()

    def test_cancel_waiting_task_publishes_cancelling_then_cancelled(self, orchestrator, progress_service, make_task):
        task = make_task("w5")
        orchestrator._waiting["w5"] = (task, threading.Event())
        orchestrator.cancel("w5")
        statuses = [c.kwargs["status"] for c in progress_service.publish.call_args_list]
        assert "cancelling" in statuses
        assert statuses[-1] == "cancelled"
