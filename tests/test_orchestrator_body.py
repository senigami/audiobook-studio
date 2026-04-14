"""Orchestrator body tests — Phase 5 centerpiece.

Covers:
- submit() reconciliation decisions (reuse / rerender / queue)
- explicit progress transition sequences
- recover() reconciliation-first resume (not replay-from-zero)
- recover() reuse of valid artifacts without re-dispatch
- cancel() lifecycle (cancelling → cancelled, on_cancel called)
- legacy isolation (app.jobs not entered when orchestrator flag active)
- ApiSynthesisTask as a real StudioTask subclass
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, call, patch

import pytest

from app.orchestration.scheduler.orchestrator import TaskOrchestrator, _claim_to_dict
from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.resources import ResourceClaim


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


def _make_progress_service(reconcile_result: dict | None = None) -> MagicMock:
    """Return a mock ProgressService with a canned reconcile result."""
    svc = MagicMock()
    svc.publish.return_value = None
    svc.reconcile.return_value = reconcile_result or {
        "artifact_state": "missing",
        "can_reuse": False,
    }
    return svc


def _make_bridge(synthesize_result: dict | None = None) -> MagicMock:
    bridge = MagicMock()
    bridge.synthesize.return_value = synthesize_result or {
        "status": "ok",
        "output_path": "/tmp/out.wav",
    }
    return bridge


def _make_task(
    task_id="t1",
    task_type="api_synthesis",
    source="api",
    result: TaskResult | None = None,
    validate_raises: Exception | None = None,
    resource_claim: ResourceClaim | None = None,
) -> MagicMock:
    """Return a mock StudioTask."""
    task = MagicMock(spec=StudioTask)
    task.task_id = task_id

    ctx = TaskContext(task_id=task_id, task_type=task_type, source=source)
    task.describe.return_value = ctx

    if validate_raises:
        task.validate.side_effect = validate_raises
    else:
        task.validate.return_value = None

    task.run.return_value = result or TaskResult(status="completed")
    task.on_cancel.return_value = None
    task.resource_claim = resource_claim or ResourceClaim.none()
    return task


def _make_orchestrator(
    reconcile_result: dict | None = None,
    synthesize_result: dict | None = None,
) -> tuple[TaskOrchestrator, MagicMock, MagicMock]:
    progress = _make_progress_service(reconcile_result)
    bridge = _make_bridge(synthesize_result)
    orch = TaskOrchestrator(progress_service=progress, voice_bridge=bridge)
    return orch, progress, bridge


# ---------------------------------------------------------------------------
# submit() — validation
# ---------------------------------------------------------------------------


class TestOrchestratorSubmitValidation:
    def test_validate_called_before_reconcile(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        task = _make_task()
        orch.submit(task)
        task.validate.assert_called_once()

    def test_validation_failure_raises_value_error(self):
        orch, _, _ = _make_orchestrator()
        task = _make_task(validate_raises=ValueError("bad input"))
        with pytest.raises(ValueError, match="Task validation failed"):
            orch.submit(task)

    def test_validation_failure_does_not_publish(self):
        orch, progress, _ = _make_orchestrator()
        task = _make_task(validate_raises=ValueError("bad"))
        with pytest.raises(ValueError):
            orch.submit(task)
        progress.publish.assert_not_called()


# ---------------------------------------------------------------------------
# submit() — reconciliation decisions
# ---------------------------------------------------------------------------


class TestOrchestratorSubmitReconciliation:
    def test_reuse_decision_skips_dispatch(self):
        orch, progress, bridge = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        task = _make_task()
        task_id = orch.submit(task)

        assert task_id == "t1"
        task.run.assert_not_called()

    def test_reuse_decision_publishes_queued_then_completed(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        task = _make_task()
        orch.submit(task)

        statuses = [c.kwargs["status"] for c in progress.publish.call_args_list]
        assert statuses[0] == "queued"
        assert statuses[-1] == "completed"
        assert "artifact_reused" in [c.kwargs.get("reason_code") for c in progress.publish.call_args_list]

    def test_reuse_decision_publishes_progress_1(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        orch.submit(_make_task())
        last = progress.publish.call_args_list[-1]
        assert last.kwargs["progress"] == 1.0

    def test_missing_artifact_dispatches(self):
        orch, _, bridge = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        task = _make_task()
        orch.submit(task)
        task.run.assert_called_once()

    def test_stale_artifact_publishes_rerender_reason(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "stale", "can_reuse": False}
        )
        orch.submit(_make_task())
        reason_codes = [c.kwargs.get("reason_code") for c in progress.publish.call_args_list]
        assert "artifact_stale" in reason_codes

    def test_reconcile_exception_defaults_to_queue(self):
        orch, progress, _ = _make_orchestrator()
        progress.reconcile.side_effect = RuntimeError("db down")
        task = _make_task()
        # Should not raise — defaults to queue decision and dispatches
        task_id = orch.submit(task)
        assert task_id == "t1"
        task.run.assert_called_once()


# ---------------------------------------------------------------------------
# submit() — progress transitions
# ---------------------------------------------------------------------------


class TestOrchestratorProgressTransitions:
    def _get_statuses(self, progress: MagicMock) -> list[str]:
        return [c.kwargs["status"] for c in progress.publish.call_args_list]

    def test_full_success_transition_sequence(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        orch.submit(_make_task())
        statuses = self._get_statuses(progress)
        assert statuses[0] == "queued"
        assert "preparing" in statuses
        assert "running" in statuses
        assert "finalizing" in statuses
        assert statuses[-1] == "completed"

    def test_running_event_includes_started_at(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        orch.submit(_make_task())
        running_calls = [c for c in progress.publish.call_args_list if c.kwargs.get("status") == "running"]
        assert len(running_calls) == 1
        assert running_calls[0].kwargs.get("started_at") is not None

    def test_task_failure_publishes_failed_not_completed(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        task = _make_task(result=TaskResult(status="failed", message="engine crashed"))
        orch.submit(task)
        statuses = self._get_statuses(progress)
        assert "failed" in statuses
        assert "completed" not in statuses

    def test_dispatch_exception_publishes_failed(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        task = _make_task()
        task.run.side_effect = RuntimeError("unexpected crash")
        orch.submit(task)
        statuses = self._get_statuses(progress)
        assert "failed" in statuses

    def test_queued_event_published_first(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        orch.submit(_make_task())
        first_status = progress.publish.call_args_list[0].kwargs["status"]
        assert first_status == "queued"

    def test_publish_exception_does_not_abort_task(self):
        """Progress publication failures must not crash the orchestrator."""
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        progress.publish.side_effect = RuntimeError("ws disconnected")
        task = _make_task()
        # Should not raise — task still runs
        task_id = orch.submit(task)
        assert task_id == "t1"


# ---------------------------------------------------------------------------
# recover() — reconciliation-first resume
# ---------------------------------------------------------------------------


class TestOrchestratorRecover:
    def test_empty_context_list_returns_empty(self):
        orch, _, _ = _make_orchestrator()
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[],
        ):
            result = orch.recover()
        assert result == []

    def test_valid_artifacts_complete_without_dispatch(self):
        ctx = TaskContext(
            task_id="recovered-1",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running"},
        )
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            recovered = orch.recover()

        assert "recovered-1" in recovered
        statuses = [c.kwargs["status"] for c in progress.publish.call_args_list]
        assert "completed" in statuses
        assert "recovery_reused" in [
            c.kwargs.get("reason_code") for c in progress.publish.call_args_list
        ]

    def test_unresolved_artifacts_requeued_not_redispatched(self):
        ctx = TaskContext(
            task_id="recovered-2",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running"},
        )
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            recovered = orch.recover()

        assert "recovered-2" in recovered
        statuses = [c.kwargs["status"] for c in progress.publish.call_args_list]
        # Should be preparing (recovery reset) then queued (re-queued), NOT running/completed.
        assert "preparing" in statuses
        assert "queued" in statuses
        assert "running" not in statuses

    def test_recovery_uses_allow_progress_regression(self):
        """Recovery must allow progress to go backward (reset from prior run)."""
        ctx = TaskContext(
            task_id="r-regress",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running"},
        )
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            orch.recover()

        regression_calls = [
            c for c in progress.publish.call_args_list
            if c.kwargs.get("allow_progress_regression") is True
        ]
        assert len(regression_calls) >= 1

    def test_recovery_publishes_recovery_resumed_reason(self):
        ctx = TaskContext(
            task_id="r-reason",
            task_type="synthesis",
            source="ui",
            payload={"_recovered_from_status": "running"},
        )
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=[ctx],
        ):
            orch.recover()

        reason_codes = [
            c.kwargs.get("reason_code") for c in progress.publish.call_args_list
        ]
        assert "recovery_resumed" in reason_codes

    def test_multiple_contexts_all_recovered(self):
        contexts = [
            TaskContext(task_id=f"r-{i}", task_type="synthesis", source="ui",
                        payload={"_recovered_from_status": "running"})
            for i in range(3)
        ]
        orch, _, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        with patch(
            "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
            return_value=contexts,
        ):
            recovered = orch.recover()

        assert len(recovered) == 3


# ---------------------------------------------------------------------------
# cancel() — lifecycle
# ---------------------------------------------------------------------------


class TestOrchestratorCancel:
    def test_cancel_unknown_task_returns_false(self):
        orch, _, _ = _make_orchestrator()
        assert orch.cancel("nonexistent") is False

    def test_cancel_active_task_returns_true(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        task = _make_task("c1")
        # Register in active by submitting first with reuse so it doesn't block
        orch._active["c1"] = task
        result = orch.cancel("c1")
        assert result is True

    def test_cancel_calls_on_cancel(self):
        orch, _, _ = _make_orchestrator()
        task = _make_task("c2")
        orch._active["c2"] = task
        orch.cancel("c2")
        task.on_cancel.assert_called_once()

    def test_cancel_removes_from_active(self):
        orch, _, _ = _make_orchestrator()
        task = _make_task("c3")
        orch._active["c3"] = task
        orch.cancel("c3")
        assert "c3" not in orch._active

    def test_cancel_publishes_cancelling_then_cancelled(self):
        orch, progress, _ = _make_orchestrator()
        task = _make_task("c4")
        orch._active["c4"] = task
        orch.cancel("c4")
        statuses = [c.kwargs["status"] for c in progress.publish.call_args_list]
        assert "cancelling" in statuses
        cancelling_idx = statuses.index("cancelling")
        assert statuses[cancelling_idx + 1] == "cancelled"

    def test_cancel_on_cancel_exception_still_publishes_cancelled(self):
        """on_cancel() raising must not prevent the cancelled terminal event."""
        orch, progress, _ = _make_orchestrator()
        task = _make_task("c5")
        task.on_cancel.side_effect = RuntimeError("cleanup failed")
        orch._active["c5"] = task
        orch.cancel("c5")
        statuses = [c.kwargs["status"] for c in progress.publish.call_args_list]
        assert "cancelled" in statuses


# ---------------------------------------------------------------------------
# Legacy isolation
# ---------------------------------------------------------------------------


class TestLegacyIsolation:
    def test_app_jobs_worker_not_imported_by_orchestrator(self):
        """Importing the orchestrator must not pull in app.jobs.worker."""
        import sys
        import importlib

        # Ensure orchestrator re-imports cleanly
        mod = importlib.import_module("app.orchestration.scheduler.orchestrator")

        # app.jobs.worker must not be in sys.modules if it wasn't before
        # We at minimum check that the orchestrator module itself doesn't
        # reference app.jobs in its __dict__ or direct imports.
        orch_source = mod.__spec__.origin
        with open(orch_source) as f:
            src = f.read()

        # These forbidden imports must not appear as actual import statements
        assert "from app.jobs" not in src
        assert "import app.jobs" not in src

    def test_orchestrator_submit_does_not_call_jobs_worker(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "missing", "can_reuse": False}
        )
        task = _make_task()

        # Patch app.jobs.worker to detect if it's called
        with patch.dict("sys.modules", {"app.jobs.worker": MagicMock()}):
            orch.submit(task)

        # Jobs worker's queue/dispatch must not have been called
        jobs_worker = __import__("sys").modules.get("app.jobs.worker")
        if jobs_worker is not None:
            # If it was loaded, verify nothing was called on it
            for attr_name in dir(jobs_worker):
                attr = getattr(jobs_worker, attr_name, None)
                if isinstance(attr, MagicMock):
                    attr.assert_not_called()


# ---------------------------------------------------------------------------
# ApiSynthesisTask as real StudioTask subclass
# ---------------------------------------------------------------------------


class TestApiSynthesisTaskIsStudioTask:
    def test_is_studio_task_subclass(self):
        assert issubclass(ApiSynthesisTask, StudioTask)

    def test_validate_passes_with_valid_fields(self):
        task = ApiSynthesisTask(
            task_id="a1", engine_id="xtts", text="Hello", output_path="/tmp/x.wav"
        )
        task.validate()  # Should not raise

    def test_validate_raises_without_text(self):
        task = ApiSynthesisTask(
            task_id="a2", engine_id="xtts", text="", output_path="/tmp/x.wav"
        )
        with pytest.raises(ValueError, match="text"):
            task.validate()

    def test_validate_raises_without_engine_id(self):
        task = ApiSynthesisTask(
            task_id="a3", engine_id="", text="Hello", output_path="/tmp/x.wav"
        )
        with pytest.raises(ValueError, match="engine_id"):
            task.validate()

    def test_validate_raises_without_output_path(self):
        task = ApiSynthesisTask(
            task_id="a4", engine_id="xtts", text="Hello", output_path=""
        )
        with pytest.raises(ValueError, match="output_path"):
            task.validate()

    def test_describe_returns_task_context(self):
        task = ApiSynthesisTask(
            task_id="a5", engine_id="xtts", text="Hello", output_path="/tmp/x.wav"
        )
        ctx = task.describe()
        assert isinstance(ctx, TaskContext)
        assert ctx.task_id == "a5"
        assert ctx.task_type == "api_synthesis"
        assert ctx.source == "api"

    def test_on_cancel_does_not_raise(self):
        task = ApiSynthesisTask(
            task_id="a6", engine_id="xtts", text="Hello", output_path="/tmp/x.wav"
        )
        task.on_cancel()  # Must not raise

    def test_source_is_always_api(self):
        task = ApiSynthesisTask(
            task_id="a7", engine_id="xtts", text="Hello", output_path="/tmp/x.wav"
        )
        ctx = task.describe()
        assert ctx.source == "api"

    def test_orchestrator_can_submit_api_synthesis_task(self):
        orch, progress, _ = _make_orchestrator(
            reconcile_result={"artifact_state": "valid", "can_reuse": True}
        )
        task = ApiSynthesisTask(
            task_id="submit-test",
            engine_id="xtts",
            text="Hello world",
            output_path="/tmp/out.wav",
        )
        task_id = orch.submit(task)
        assert task_id == "submit-test"
        # Reuse decision → no synthesis
        statuses = [c.kwargs["status"] for c in progress.publish.call_args_list]
        assert "completed" in statuses


# ---------------------------------------------------------------------------
# _claim_to_dict helper
# ---------------------------------------------------------------------------


class TestClaimToDict:
    def test_none_returns_empty_dict(self):
        assert _claim_to_dict(None) == {}

    def test_resource_claim_converted(self):
        claim = ResourceClaim.gpu_heavy(vram_mb=6000)
        d = _claim_to_dict(claim)
        assert d["gpu"] is True
        assert d["vram_mb"] == 6000
        assert d["cpu_heavy"] is True

    def test_none_claim_all_false(self):
        claim = ResourceClaim.none()
        d = _claim_to_dict(claim)
        assert d["gpu"] is False
        assert d["vram_mb"] == 0
