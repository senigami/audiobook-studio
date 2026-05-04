"""Internal implementation helpers for the Studio 2.0 TaskOrchestrator."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from app.orchestration.tasks.base import TaskResult

if TYPE_CHECKING:
    from app.orchestration.tasks.base import StudioTask, TaskContext

logger = logging.getLogger(__name__)


class OrchestratorHelpersMixin:
    """Internal implementation details for TaskOrchestrator.

    Extracted to keep orchestrator.py focused on high-level workflows.
    """

    def _reconcile_task(self, context: TaskContext) -> dict[str, Any]:
        """Call Phase 4 reconciliation for the task's work scope."""
        payload = context.payload or {}
        task_revision_id = (
            payload.get("task_revision_id")
            or payload.get("source_revision_id")
            or context.task_id
        )

        try:
            # self.progress_service must be available on the target class
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
        """Dispatch the task to execution through the orchestrator-owned bridge."""
        # Attach a progress reporter that redirects task-internal updates to our publisher.
        def task_progress_reporter(progress: float, message: str | None, reason_code: str | None):
            self._publish(
                context=context,
                status="running",
                progress=progress,
                message=message,
                reason_code=reason_code,
            )

        task.set_progress_reporter(task_progress_reporter)

        # Emit initial 'running' event with historical ETA BEFORE the blocking call starts.
        # This satisfies the requirement to have ETA from the start.
        started_at = time.time()
        expected_duration = 0.0
        try:
             # Try to get duration from task if available
             text = context.payload.get("test_text") or context.payload.get("script_text", "")
             engine_id = context.payload.get("engine_id", "synthesis")
             expected_duration = task.get_expected_duration(text, engine_id)
        except Exception:
             expected_duration = 25.0

        self._publish(
            context=context,
            status="running",
            progress=0.0,
            started_at=started_at,
            eta_seconds=int(expected_duration),
            message="Starting execution...",
            force=True
        )

        # If the task exposes a bridge request, route through the injected bridge.
        bridge_request_fn = getattr(task, "to_bridge_request", None)
        if callable(bridge_request_fn):
            try:
                request = bridge_request_fn()
                # self.voice_bridge must be available on the target class
                result = self.voice_bridge.synthesize(request)
                ok = result.get("status", "ok") == "ok"
                return TaskResult(
                    status="completed" if ok else "failed",
                    message=result.get("message"),
                )
            except Exception as exc:
                logger.exception("Task %s: bridge dispatch raised.", context.task_id)
                from app.engines.bridge_remote import EngineUnavailableError
                is_retriable = isinstance(exc, EngineUnavailableError)
                return TaskResult(status="failed", message=str(exc), retriable=is_retriable)

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
        eta_seconds: int | None = None,
        message: str | None = None,
        reason_code: str | None = None,
        waiting_reason: str | None = None,
        started_at: float | None = None,
        allow_progress_regression: bool = False,
        force: bool = False,
    ) -> None:
        """Publish a progress event through the ProgressService and sync with state."""
        state_status = "done" if status == "completed" else status
        state_progress = progress
        if state_progress is None:
            if state_status == "done":
                state_progress = 1.0
            elif context.task_type in {"sample_build", "sample_test"}:
                # Provide synthetic progress fallbacks for voice tasks ONLY if no task-reported progress is available
                progress_map = {
                    "queued": 0.0,
                    "preparing": 0.0,
                    "running": 0.0, # start at 0.0, real task will report progress via heartbeat
                    "finalizing": 0.9,
                }
                state_progress = progress_map.get(state_status, 0.0)
            else:
                state_progress = 0.0
        finished_at = time.time() if state_status in {"done", "failed", "cancelled"} else None
        updated_at = time.time()
        try:
            # Sync with the persistent state.json for UI visibility and polling.
            # We import lazily to stay behind the state boundary.
            from app.state import get_jobs, put_job, update_job, Job  # noqa: PLC0415

            # Anti-Regression: If this is an update to an existing job, don't allow progress to regress
            # unless the status itself has regressed (e.g. requeued).
            existing_job = get_jobs().get(context.task_id)
            if existing_job and state_status == existing_job.status and state_progress is not None:
                if state_progress < (existing_job.progress or 0.0):
                    state_progress = existing_job.progress

            # self.progress_service must be available on the target class
            self.progress_service.publish(
                job_id=context.task_id,
                status=state_status,
                parent_job_id=context.project_id,
                progress=state_progress,
                eta_seconds=eta_seconds,
                message=message,
                reason_code=reason_code,
                waiting_reason=waiting_reason,
                started_at=started_at,
                allow_progress_regression=allow_progress_regression,
                force=force,
                updated_at=updated_at,
            )

            # Initialize job state if this is the first event (usually 'queued')
            if not existing_job:
                job = Job(
                    id=context.task_id,
                    engine=getattr(context, "task_type", "synthesis"),  # type: ignore[arg-type]
                    status=state_status,  # type: ignore[arg-type]
                    created_at=time.time(),
                    updated_at=updated_at,
                    started_at=started_at,
                    project_id=context.project_id,
                    chapter_id=context.chapter_id,
                    speaker_profile=context.payload.get("speaker_profile"),
                    progress=state_progress or 0.0,
                    finished_at=finished_at,
                    error=message if state_status == "failed" else None,
                )
                put_job(job)
            else:
                updates: dict[str, object | None] = {
                    "status": state_status,
                    "progress": state_progress,
                    "message": message,
                    "reason_code": reason_code,
                    "updated_at": updated_at,
                }
                if started_at is not None:
                    updates["started_at"] = started_at
                if finished_at is not None:
                    updates["finished_at"] = finished_at
                if state_status == "failed":
                    updates["error"] = message or "Task failed."
                elif state_status == "done":
                    updates["error"] = None
                update_job(context.task_id, force_broadcast=force, **updates)


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
