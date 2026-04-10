"""Progress service boundary.

This module owns weighted progress math, ETA smoothing, and meaningful-event
gating for the live websocket path.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping

from .broadcaster import broadcast_progress
from .eta import estimate_eta_seconds
from .reconciliation import reconcile_work_item

INTENDED_UPSTREAM_CALLERS = (
    "app.orchestration.scheduler.orchestrator",
    "app.orchestration.tasks",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.orchestration.progress.reconciliation.reconcile_work_item",
    "app.orchestration.progress.eta.estimate_eta_seconds",
    "app.orchestration.progress.broadcaster.broadcast_progress",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.engines",
    "app.db.queue",
)


class ProgressService:
    """Progress-service entry points.

    Intended flow:
    - reconcile work before execution
    - compute weighted progress and ETA
    - broadcast normalized progress events
    """

    def __init__(
        self,
        *,
        reconcile_fn,
        eta_fn,
        broadcaster,
        clock: Callable[[], float] | None = None,
        min_progress_delta: float = 0.01,
        max_silence_seconds: float = 10.0,
    ):
        self.reconcile_fn = reconcile_fn
        self.eta_fn = eta_fn
        self.broadcaster = broadcaster
        self.clock = clock or time.time
        self.min_progress_delta = max(0.0, float(min_progress_delta))
        self.max_silence_seconds = max(1.0, float(max_silence_seconds))
        self._last_payload_by_job: dict[str, dict[str, object]] = {}
        self._last_emit_at_by_job: dict[str, float] = {}
        self._last_progress_by_job: dict[str, float] = {}

    def reconcile(
        self,
        *,
        job_id: str,
        task_revision_id: str,
        artifact_hash: str | None = None,
        scope: str = "job",
        requested_revision: Mapping[str, object] | None = None,
        artifact_manifest: object | None = None,
        artifact_lookup: Callable[[dict[str, object]], object | None] | None = None,
    ) -> dict[str, object]:
        """Reconcile queued work with current revision-safe artifacts.

        Args:
            job_id: Stable job identifier being reconciled.
            task_revision_id: Revision identifier that the job intends to
                satisfy.
            artifact_hash: Optional artifact hash already linked to the job.
            scope: Requested work scope such as job, chapter, block, or export.
            requested_revision: Revision context used to validate artifacts.
            artifact_manifest: Optional manifest already resolved by caller.
            artifact_lookup: Optional callback used to resolve a manifest when
                the caller only has a job snapshot or identifier context.

        Returns:
            dict[str, object]: Reconciliation result payload.
        """
        return self.reconcile_fn(
            job_id=job_id,
            task_revision_id=task_revision_id,
            artifact_hash=artifact_hash,
            scope=scope,
            requested_revision=requested_revision,
            artifact_manifest=artifact_manifest,
            artifact_lookup=artifact_lookup,
        )

    def estimate_eta(
        self,
        *,
        job_id: str,
        completed_units: int,
        total_units: int,
        observed_cps: float | None = None,
    ) -> int | None:
        """Estimate ETA from current progress and historical throughput.

        Args:
            job_id: Stable job identifier being estimated.
            completed_units: Number of completed progress units.
            total_units: Total number of progress units.
        observed_cps: Optional observed characters-per-second or equivalent
            throughput measurement from the active run.

        Returns:
            int | None: Estimated remaining seconds, or None when insufficient
            data is available.
        """
        _ = self._normalize_monotonic_progress(
            job_id=job_id,
            completed_units=completed_units,
            total_units=total_units,
            persist=False,
        )
        return self.eta_fn(
            completed_units=completed_units,
            total_units=total_units,
            observed_cps=observed_cps,
        )

    def publish(
        self,
        *,
        job_id: str,
        status: str,
        scope: str = "job",
        parent_job_id: str | None = None,
        progress: float | None = None,
        eta_seconds: int | None = None,
        eta_confidence: str | None = None,
        message: str | None = None,
        reason_code: str | None = None,
        waiting_reason: str | None = None,
        started_at: float | None = None,
        updated_at: float | None = None,
        active_render_batch_id: str | None = None,
        active_render_batch_progress: float | None = None,
        force: bool = False,
    ) -> dict[str, object] | None:
        """Publish normalized progress updates for queue and chapter surfaces.

        Args:
            job_id: Stable job identifier being updated.
            status: Canonical live job status.
            scope: Normalized event scope.
            parent_job_id: Optional parent task/job identifier.
            progress: Optional normalized progress percentage or ratio.
            eta_seconds: Optional remaining seconds estimate.
            eta_confidence: Optional ETA confidence hint.
            message: Optional user-facing status message.
            reason_code: Optional machine-readable reason for the current state.
            waiting_reason: Optional resource wait explanation for queue UI.
            started_at: Optional run start timestamp.
            updated_at: Optional event timestamp.
            active_render_batch_id: Optional active grouped-render identifier.
            active_render_batch_progress: Optional progress for the active batch.
            force: Emit even if the payload is unchanged.

        Returns:
            dict[str, object] | None: The emitted payload, or ``None`` when the
            update was coalesced as non-meaningful.
        """
        payload = self._build_progress_payload(
            job_id=job_id,
            scope=scope,
            parent_job_id=parent_job_id,
            status=status,
            progress=progress,
            eta_seconds=eta_seconds,
            eta_confidence=eta_confidence,
            message=message,
            reason_code=reason_code,
            waiting_reason=waiting_reason,
            started_at=started_at,
            updated_at=updated_at,
            active_render_batch_id=active_render_batch_id,
            active_render_batch_progress=active_render_batch_progress,
        )
        if not force and not self._should_emit(payload):
            return None

        self._last_payload_by_job[job_id] = payload
        self._last_emit_at_by_job[job_id] = float(payload["updated_at"])
        if isinstance(payload.get("progress"), (int, float)):
            self._last_progress_by_job[job_id] = float(payload["progress"])
        self.broadcaster(payload=payload, channel="jobs")
        return payload

    def _normalize_monotonic_progress(
        self,
        *,
        job_id: str,
        completed_units: int,
        total_units: int,
        persist: bool = True,
    ) -> float:
        """Describe the monotonic-progress contract used by the UI.

        Args:
            job_id: Stable job identifier being updated.
            completed_units: Number of completed units reported so far.
            total_units: Total number of expected progress units.

        Returns:
            float: Monotonic progress value suitable for UI smoothing.

        The return value never moves backward relative to the last accepted
        value for the same job.
        """
        total = max(int(total_units), 0)
        completed = max(min(int(completed_units), total), 0)
        if total == 0:
            normalized = 0.0
        else:
            normalized = completed / total
        normalized = max(0.0, min(normalized, 1.0))

        previous = self._last_progress_by_job.get(job_id)
        if previous is not None and normalized < previous:
            normalized = previous

        normalized = round(normalized, 2)
        if persist:
            self._last_progress_by_job[job_id] = normalized
        return normalized

    def _build_progress_payload(
        self,
        *,
        job_id: str,
        scope: str,
        parent_job_id: str | None,
        status: str,
        progress: float | None,
        eta_seconds: int | None,
        eta_confidence: str | None,
        message: str | None,
        reason_code: str | None,
        waiting_reason: str | None,
        started_at: float | None,
        updated_at: float | None,
        active_render_batch_id: str | None,
        active_render_batch_progress: float | None,
    ) -> dict[str, object]:
        """Describe the canonical payload sent to live frontend listeners.

        Args:
            job_id: Stable job identifier being updated.
            scope: Normalized event scope.
            parent_job_id: Optional parent task/job identifier.
            status: Canonical live job status.
            progress: Optional normalized progress value.
            eta_seconds: Optional remaining seconds estimate.
            eta_confidence: Optional ETA confidence hint.
            message: Optional user-facing status message.
            reason_code: Optional machine-readable reason for the state.
            waiting_reason: Optional queue wait explanation.
            started_at: Optional run start timestamp.
            updated_at: Optional event timestamp.
            active_render_batch_id: Optional active grouped-render identifier.
            active_render_batch_progress: Optional active batch progress.

        Returns:
            dict[str, object]: Broadcast-ready progress payload.
        """
        now = float(updated_at if updated_at is not None else self.clock())
        normalized_progress = None
        if progress is not None:
            normalized_progress = round(max(0.0, min(float(progress), 1.0)), 2)

        payload: dict[str, object] = {
            "type": "studio_job_event",
            "job_id": str(job_id),
            "scope": scope,
            "status": status,
            "updated_at": now,
        }
        if parent_job_id is not None:
            payload["parent_job_id"] = parent_job_id
        if normalized_progress is not None:
            payload["progress"] = normalized_progress
        if eta_seconds is not None:
            payload["eta_seconds"] = max(0, int(eta_seconds))
        if eta_confidence is not None:
            payload["eta_confidence"] = eta_confidence
        else:
            payload["eta_confidence"] = "stable" if status in {"running", "finalizing", "done"} else "estimating"
        if message is not None:
            payload["message"] = message
        if reason_code is None:
            reason_code = waiting_reason
        if reason_code is not None:
            payload["reason_code"] = reason_code
        if started_at is not None:
            payload["started_at"] = started_at
        if active_render_batch_id is not None:
            payload["active_render_batch_id"] = active_render_batch_id
        if active_render_batch_progress is not None:
            payload["active_render_batch_progress"] = round(max(0.0, min(float(active_render_batch_progress), 1.0)), 2)
        return payload

    def _should_emit(self, payload: dict[str, object]) -> bool:
        job_id = str(payload["job_id"])
        previous = self._last_payload_by_job.get(job_id)
        if previous is None:
            return True

        if payload.get("status") != previous.get("status"):
            return True
        if payload.get("reason_code") != previous.get("reason_code"):
            return True
        if payload.get("message") != previous.get("message"):
            return True
        if payload.get("started_at") != previous.get("started_at"):
            return True
        if payload.get("active_render_batch_id") != previous.get("active_render_batch_id"):
            return True
        if payload.get("active_render_batch_progress") != previous.get("active_render_batch_progress"):
            previous_batch_progress = previous.get("active_render_batch_progress")
            current_batch_progress = payload.get("active_render_batch_progress")
            if isinstance(previous_batch_progress, (int, float)) and isinstance(current_batch_progress, (int, float)):
                if abs(float(current_batch_progress) - float(previous_batch_progress)) >= self.min_progress_delta:
                    return True
            elif previous_batch_progress != current_batch_progress:
                return True
        if payload.get("eta_confidence") != previous.get("eta_confidence"):
            return True

        previous_progress = previous.get("progress")
        current_progress = payload.get("progress")
        if isinstance(previous_progress, (int, float)) and isinstance(current_progress, (int, float)):
            if current_progress < previous_progress and payload.get("status") not in {"queued", "preparing"}:
                payload["progress"] = previous_progress
                current_progress = previous_progress
            if abs(float(current_progress) - float(previous_progress)) >= self.min_progress_delta:
                return True

        previous_eta = previous.get("eta_seconds")
        current_eta = payload.get("eta_seconds")
        if isinstance(previous_eta, int) and isinstance(current_eta, int):
            if abs(current_eta - previous_eta) >= 1:
                return True

        last_emit_at = self._last_emit_at_by_job.get(job_id)
        now = float(payload.get("updated_at") or self.clock())
        if last_emit_at is None:
            return True
        return (now - last_emit_at) >= self.max_silence_seconds


def create_progress_service() -> ProgressService:
    """Create the progress-service shell with helper dependency wiring.

    Returns:
        ProgressService: Progress-service shell ready for future orchestration.
    """
    return ProgressService(
        reconcile_fn=reconcile_work_item,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcast_progress,
    )
