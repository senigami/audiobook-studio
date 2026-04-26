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
        """Publish a progress event through the ProgressService."""
        try:
            # self.progress_service must be available on the target class
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
