"""Task orchestrator for Studio 2.0.

This is the Phase 5 centerpiece: a real implementation of submit(), recover(),
and cancel() that uses Phase 4 reconciliation as the source of truth.

Ownership model
---------------
- The orchestrator owns **job execution lifecycle**: submit, cancel, recover,
  dispatch, and progress publication.
- The watchdog owns **TTS Server process lifecycle**: spawn, heartbeat, restart.
- The VoiceBridge owns **engine routing**: HTTP vs in-process.

These responsibilities must not bleed into each other.

Legacy isolation
----------------
When ``USE_STUDIO_ORCHESTRATOR=true``, Studio 2.0 jobs are handled here.
They must not enter the ``app.jobs`` worker loop. Compatibility adapters are
explicit and removable; the orchestrator must not silently depend on legacy
startup or loop behavior.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from app.engines.bridge import create_voice_bridge
from app.orchestration.progress.service import create_progress_service
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult

from .policies import choose_next_task
from .recovery import load_recoverable_task_contexts
from .resources import reserve_task_resources, release_task_resources

logger = logging.getLogger(__name__)

INTENDED_UPSTREAM_CALLERS = (
    "app.api.routers.queue",
    "app.api.routers.projects",
    "app.api.routers.chapters",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.orchestration.tasks.base.StudioTask",
    "app.orchestration.progress.service.create_progress_service",
    "app.orchestration.scheduler.resources.reserve_task_resources",
    "app.orchestration.scheduler.recovery.load_recoverable_task_contexts",
    "app.orchestration.scheduler.policies.choose_next_task",
    "app.engines.bridge.create_voice_bridge",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.jobs.worker",
    "app.jobs.core",
    "app.db.queue",
)


class TaskOrchestrator:
    """Studio 2.0 task orchestrator.

    Handles scheduling, dispatch, reconciliation, recovery, cancellation,
    and progress publication for all Studio 2.0 tasks.

    All progress events flow through the injected ``ProgressService``.
    All synthesis requests flow through the injected ``VoiceBridge``.
    Neither is accessed directly — both are injectable for testing.
    """

    def __init__(self, *, progress_service, voice_bridge):
        self.progress_service = progress_service
        self.voice_bridge = voice_bridge
        # Active task registry: task_id → StudioTask
        self._active: dict[str, StudioTask] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def submit(self, task: StudioTask) -> str:
        """Submit a task through the orchestrator.

        Submission flow:
        1. Validate the task payload.
        2. Publish ``queued`` event.
        3. Reconcile: call Phase 4 reconciliation per batch in scope.
           - ``can_reuse=True``  → publish skip/reuse event, do not dispatch.
           - ``artifact_state="stale"``  → publish rerender event, dispatch.
           - ``artifact_state="missing"`` → dispatch as new work.
        4. Reserve resources (admission control).
        5. Publish ``preparing → running`` transition.
        6. Dispatch to VoiceBridge.
        7. Publish ``finalizing → completed`` or ``→ failed``.

        Args:
            task: Any ``StudioTask`` subclass.

        Returns:
            str: The task ID used by queue and progress surfaces.

        Raises:
            ValueError: If task validation fails.
            RuntimeError: If resources cannot be reserved.
        """
        # Step 1 — validate
        try:
            task.validate()
        except Exception as exc:
            raise ValueError(f"Task validation failed for {getattr(task, 'task_id', '?')}: {exc}") from exc

        context = task.describe()
        task_id = context.task_id

        # Step 2 — publish queued
        self._publish(
            context=context,
            status="queued",
            message="Task accepted, reconciling batches.",
            reason_code="submitted",
        )

        # Step 3 — reconcile per batch
        reconcile_result = self._reconcile_task(context)
        decision = reconcile_result.get("decision", "queue")

        if decision == "reuse":
            # All batches are already valid — nothing to render.
            self._publish(
                context=context,
                status="completed",
                progress=1.0,
                message="All artifacts are current — no synthesis required.",
                reason_code="artifact_reused",
            )
            logger.info("Task %s: all artifacts valid, skipped dispatch.", task_id)
            return task_id

        if decision == "rerender":
            self._publish(
                context=context,
                status="preparing",
                message="Stale artifacts detected — scheduling rerender.",
                reason_code="artifact_stale",
            )
        else:
            # "queue" — new work
            self._publish(
                context=context,
                status="preparing",
                message="Preparing synthesis resources.",
                reason_code="new_work",
            )

        # Step 4 — reserve resources
        claim_dict = _claim_to_dict(getattr(task, "resource_claim", None))
        claim_dict["task_id"] = task_id  # needed by GpuAdmissionGate
        reservation = reserve_task_resources(
            task_type=context.task_type,
            resource_claims=claim_dict,
        )
        if not reservation.get("admitted", True):
            waiting_reason = reservation.get("waiting_reason", "Resources unavailable.")
            self._publish(
                context=context,
                status="waiting_for_resources",
                waiting_reason=waiting_reason,
            )
            logger.warning("Task %s: resource admission failed: %s", task_id, waiting_reason)
            # Return task_id — the caller should re-submit via the policy queue.
            return task_id

        # Step 5 — running
        self._active[task_id] = task
        self._publish(
            context=context,
            status="running",
            started_at=time.time(),
            message="Synthesis in progress.",
            reason_code="dispatching",
        )

        # Step 6 — dispatch
        try:
            result = self._dispatch(task=task, context=context)
        finally:
            # Always release resources — even if dispatch raises.
            release_task_resources(task_id=task_id, resource_claims=claim_dict)
            self._active.pop(task_id, None)

        if result.status == "completed":
            self._publish(
                context=context,
                status="finalizing",
                progress=0.99,
                message="Synthesis complete, finalizing outputs.",
            )
            self._publish(
                context=context,
                status="completed",
                progress=1.0,
                message="Task completed successfully.",
                reason_code="synthesis_ok",
                force=True,
            )
        else:
            self._publish(
                context=context,
                status="failed",
                message=result.message or "Task failed.",
                reason_code="synthesis_error",
                force=True,
            )

        return task_id

    def recover(self) -> list[str]:
        """Recover interrupted Studio 2.0 jobs after a restart.

        Recovery flow:
        1. Discover interrupted jobs via ``load_recoverable_task_contexts()``.
        2. For each recovered context, call Phase 4 reconciliation per batch.
        3. Reuse already-valid artifacts — do NOT re-render them.
        4. Resume only unresolved work.
        5. Publish recovery-specific progress transitions.

        Returns:
            list[str]: Task IDs of jobs that were recovered and resumed.
        """
        recovered_ids: list[str] = []

        contexts = load_recoverable_task_contexts()
        if not contexts:
            return recovered_ids

        logger.info("Recovery: found %d interrupted task(s).", len(contexts))

        for context in contexts:
            task_id = context.task_id
            prior_status = context.payload.get("_recovered_from_status", "unknown")

            # Publish recovery reset event — allow progress regression because we
            # are explicitly resetting state from a previous run.
            self.progress_service.publish(
                job_id=task_id,
                status="preparing",
                message=f"Recovering from interrupted {prior_status} state.",
                reason_code="recovery_resumed",
                allow_progress_regression=True,
                force=True,
            )

            # Reconcile this job's work scope against current artifacts.
            reconcile_result = self._reconcile_task(context)
            decision = reconcile_result.get("decision", "queue")

            if decision == "reuse":
                # All batches are still valid — complete without re-rendering.
                self.progress_service.publish(
                    job_id=task_id,
                    status="completed",
                    progress=1.0,
                    message="All artifacts already valid — recovery complete without re-synthesis.",
                    reason_code="recovery_reused",
                    force=True,
                )
                logger.info("Recovery: task %s — all artifacts valid, skipped.", task_id)
                recovered_ids.append(task_id)
                continue

            # Unresolved work remains — re-queue with recovery priority.
            self.progress_service.publish(
                job_id=task_id,
                status="queued",
                message="Unresolved batches re-queued after recovery.",
                reason_code="recovery_requeued",
                allow_progress_regression=True,
                force=True,
            )
            logger.info(
                "Recovery: task %s — decision=%s, re-queued %d unresolved batch(es).",
                task_id,
                decision,
                reconcile_result.get("unresolved_count", 0),
            )
            recovered_ids.append(task_id)

        return recovered_ids

    def cancel(self, task_id: str) -> bool:
        """Cancel a scheduled or running task.

        Cancel flow:
        1. Look up the active task.
        2. Publish ``cancelling`` transition.
        3. Call ``task.on_cancel()`` to release task-level resources.
        4. Release scheduler resources.
        5. Publish ``cancelled`` terminal event.

        Args:
            task_id: Stable task identifier to cancel.

        Returns:
            bool: True if the task was found and cancelled, False if not found.
        """
        task = self._active.pop(task_id, None)

        if task is None:
            logger.warning("cancel(%s): task not found in active registry.", task_id)
            return False

        context = task.describe()

        # Publish cancelling transition.
        self._publish(
            context=context,
            status="cancelling",
            message="Cancellation requested.",
            reason_code="user_cancel",
            force=True,
        )

        # Allow the task to clean up its own resources.
        try:
            task.on_cancel()
        except Exception:
            logger.exception("Task %s: on_cancel() raised an exception.", task_id)

        # Release any scheduler resources held by this task.
        claim_dict = _claim_to_dict(getattr(task, "resource_claim", None))
        claim_dict["task_id"] = task_id
        release_task_resources(task_id=task_id, resource_claims=claim_dict)

        # Terminal cancellation event.
        self._publish(
            context=context,
            status="cancelled",
            message="Task cancelled.",
            reason_code="cancelled_ok",
            force=True,
        )
        logger.info("Task %s cancelled.", task_id)
        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _reconcile_task(self, context: TaskContext) -> dict[str, Any]:
        """Call Phase 4 reconciliation for the task's work scope.

        Uses the ProgressService's reconcile method which wraps
        ``reconcile_work_item()`` from Phase 4.

        The result includes a ``decision`` key:
        - ``"reuse"``   — all batches have valid artifacts
        - ``"rerender"`` — some batches have stale artifacts
        - ``"queue"``   — some batches have missing artifacts

        Args:
            context: Task identity and payload from ``task.describe()``.

        Returns:
            dict: Reconciliation summary with ``decision`` and batch details.
        """
        payload = context.payload or {}
        task_revision_id = (
            payload.get("task_revision_id")
            or payload.get("source_revision_id")
            or context.task_id
        )

        try:
            result = self.progress_service.reconcile(
                job_id=context.task_id,
                task_revision_id=str(task_revision_id),
                scope=payload.get("scope", "job"),
                requested_revision=payload.get("requested_revision"),
                artifact_hash=payload.get("artifact_hash"),
            )
        except Exception:
            logger.exception(
                "Reconciliation failed for task %s; defaulting to queue.",
                context.task_id,
            )
            return {"decision": "queue", "unresolved_count": 1, "artifact_state": "unknown"}

        artifact_state = result.get("artifact_state", "unknown")
        can_reuse = result.get("can_reuse", False)

        if can_reuse or artifact_state == "valid":
            decision = "reuse"
        elif artifact_state == "stale":
            decision = "rerender"
        else:
            decision = "queue"

        return {
            "decision": decision,
            "artifact_state": artifact_state,
            "can_reuse": can_reuse,
            "unresolved_count": 0 if decision == "reuse" else 1,
            "reconciliation": result,
        }

    def _dispatch(self, *, task: StudioTask, context: TaskContext) -> TaskResult:
        """Dispatch the task to execution through the orchestrator-owned bridge.

        For tasks that implement ``to_bridge_request()`` (the standard synthesis
        contract), the orchestrator routes the request through its injected
        ``voice_bridge``.  This keeps engine-routing ownership in the
        orchestrator and makes transport control consistent.

        Tasks that do not implement ``to_bridge_request()`` are dispatched via
        ``task.run()`` directly — they own their own execution.

        Args:
            task: The validated, admitted task.
            context: Task identity and metadata.

        Returns:
            TaskResult: Execution outcome.
        """
        # If the task exposes a bridge request, route through the injected bridge.
        bridge_request_fn = getattr(task, "to_bridge_request", None)
        if callable(bridge_request_fn):
            try:
                request = bridge_request_fn()
                result = self.voice_bridge.synthesize(request)
                ok = result.get("status", "ok") == "ok"
                return TaskResult(
                    status="completed" if ok else "failed",
                    message=result.get("message"),
                )
            except Exception as exc:
                logger.exception("Task %s: bridge dispatch raised.", context.task_id)
                return TaskResult(status="failed", message=str(exc))

        # Fallback: let the task manage its own execution.
        try:
            return task.run()
        except Exception as exc:
            logger.exception("Task %s: dispatch raised an exception.", context.task_id)
            return TaskResult(status="failed", message=str(exc))

    def _publish(
        self,
        *,
        context: TaskContext,
        status: str,
        progress: float | None = None,
        message: str | None = None,
        reason_code: str | None = None,
        waiting_reason: str | None = None,
        started_at: float | None = None,
        allow_progress_regression: bool = False,
        force: bool = False,
    ) -> None:
        """Publish a progress event through the ProgressService.

        Args:
            context: Task identity.
            status: Canonical queue status string.
            progress: Optional normalized progress (0–1).
            message: Optional user-facing status message.
            reason_code: Optional machine-readable reason.
            waiting_reason: Optional resource-wait explanation.
            started_at: Optional wall-clock start timestamp.
            allow_progress_regression: Pass through to ProgressService.
            force: Emit even if payload is unchanged.
        """
        try:
            self.progress_service.publish(
                job_id=context.task_id,
                status=status,
                parent_job_id=context.project_id,
                progress=progress,
                message=message,
                reason_code=reason_code,
                waiting_reason=waiting_reason,
                started_at=started_at,
                allow_progress_regression=allow_progress_regression,
                force=force,
            )
        except Exception:
            logger.exception(
                "Failed to publish progress event for task %s (status=%s).",
                context.task_id,
                status,
            )


def _claim_to_dict(claim: object | None) -> dict[str, object]:
    """Convert a ResourceClaim to the dict format expected by reserve_task_resources."""
    if claim is None:
        return {}
    return {
        "gpu": getattr(claim, "gpu", False),
        "vram_mb": getattr(claim, "vram_mb", 0),
        "cpu_heavy": getattr(claim, "cpu_heavy", False),
    }


def create_orchestrator() -> TaskOrchestrator:
    """Create the TaskOrchestrator with production dependency wiring.

    Returns:
        TaskOrchestrator: Ready for use by API route handlers and boot sequence.
    """
    return TaskOrchestrator(
        progress_service=create_progress_service(),
        voice_bridge=create_voice_bridge(),
    )
