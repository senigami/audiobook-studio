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
from typing import Optional

from app.engines.bridge import create_voice_bridge
from app.orchestration.progress.service import create_progress_service
from app.orchestration.tasks.base import StudioTask, TaskResult

from .policies import choose_next_task
from .recovery import load_recoverable_task_contexts
from .resources import reserve_task_resources, release_task_resources

from .orchestrator_helpers import OrchestratorHelpersMixin, _claim_to_dict

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


class TaskOrchestrator(OrchestratorHelpersMixin):
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
        max_attempts = 3
        attempt = 0
        result = TaskResult(status="failed", message="Unknown error")

        while attempt < max_attempts:
            attempt += 1
            try:
                result = self._dispatch(task=task, context=context)
                if result.status == "completed":
                    break

                # Check if it's a retriable error (e.g. infrastructure failure)
                if not getattr(result, "retriable", False):
                    break

                if attempt < max_attempts:
                    logger.warning(
                        "Task %s: retriable failure (attempt %d/%d): %s. Retrying in 2s...",
                        task_id, attempt, max_attempts, result.message
                    )
                    time.sleep(2.0)
                else:
                    logger.error(
                        "Task %s: retriable failure exceeded max attempts (%d).",
                        task_id, max_attempts
                    )
            except Exception as exc:
                logger.exception("Task %s: unexpected dispatch exception.", task_id)
                result = TaskResult(status="failed", message=str(exc))
                break

        # Final cleanup - always release resources after all attempts
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
            reason_code = "synthesis_error_retriable" if getattr(result, "retriable", False) else "synthesis_error"
            self._publish(
                context=context,
                status="failed",
                message=result.message or "Task failed.",
                reason_code=reason_code,
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
                message="Unresolved batches re-queued after recovery. Resuming...",
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

            # Reconstruct and re-submit for execution.
            try:
                task = self._reconstruct_task(context)
                if task:
                    import threading
                    # We run submission in a background thread so recovery doesn't block boot.
                    threading.Thread(
                        target=self.submit,
                        args=(task,),
                        daemon=True,
                        name=f"recovery-{task_id}"
                    ).start()
                    logger.info("Recovery: task %s — submission triggered in background.", task_id)
                else:
                    logger.warning("Recovery: task %s — could not reconstruct task object; skipping submission.", task_id)
            except Exception:
                logger.exception("Recovery: task %s — failed to trigger re-submission.", task_id)

            recovered_ids.append(task_id)

        return recovered_ids

    def _reconstruct_task(self, context: TaskContext) -> StudioTask | None:
        """Internal helper to reconstruct a StudioTask from a context."""
        task_type = context.task_type

        try:
            if task_type == "api_synthesis":
                from app.orchestration.tasks.api_synthesis import ApiSynthesisTask
                return ApiSynthesisTask.from_task_context(context)
            elif task_type == "synthesis":
                from app.orchestration.tasks.synthesis import SynthesisTask
                return SynthesisTask.from_task_context(context)
            elif task_type == "mixed_synthesis":
                from app.orchestration.tasks.mixed_synthesis import MixedSynthesisTask
                return MixedSynthesisTask.from_task_context(context)
            # Add other task types as needed...
        except Exception:
            logger.exception("Failed to reconstruct task of type %s", task_type)

        return None

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


def create_orchestrator() -> TaskOrchestrator:
    """Create the TaskOrchestrator with production dependency wiring.

    Returns:
        TaskOrchestrator: Ready for use by API route handlers and boot sequence.
    """
    return TaskOrchestrator(
        progress_service=create_progress_service(),
        voice_bridge=create_voice_bridge(),
    )
