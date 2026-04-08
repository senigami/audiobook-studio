"""Progress service boundary.

This module will own weighted progress math, parent aggregation, and progress
reconciliation events.
"""

from .broadcaster import broadcast_progress
from .eta import estimate_eta_seconds
from .reconciliation import reconcile_work_item


class ProgressService:
    """Placeholder progress-service entry points.

    Intended flow:
    - reconcile work before execution
    - compute weighted progress and ETA
    - broadcast normalized progress events
    """

    def __init__(self, *, reconcile_fn, eta_fn, broadcaster):
        self.reconcile_fn = reconcile_fn
        self.eta_fn = eta_fn
        self.broadcaster = broadcaster

    def reconcile(
        self,
        *,
        job_id: str,
        task_revision_id: str,
        artifact_hash: str | None = None,
    ) -> dict[str, object]:
        """Reconcile queued work with current revision-safe artifacts.

        Args:
            job_id: Stable job identifier being reconciled.
            task_revision_id: Revision identifier that the job intends to
                satisfy.
            artifact_hash: Optional artifact hash already linked to the job.

        Returns:
            dict[str, object]: Placeholder reconciliation result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.reconcile_fn
        _ = (job_id, task_revision_id, artifact_hash)
        raise NotImplementedError("Studio 2.0 reconciliation is not implemented yet.")

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

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.eta_fn
        _ = self._normalize_monotonic_progress(
            job_id=job_id,
            completed_units=completed_units,
            total_units=total_units,
        )
        _ = observed_cps
        raise NotImplementedError("Studio 2.0 ETA estimation is not implemented yet.")

    def publish(
        self,
        *,
        job_id: str,
        status: str,
        progress: float | None = None,
        eta_seconds: int | None = None,
        message: str | None = None,
        waiting_reason: str | None = None,
    ) -> None:
        """Publish normalized progress updates for queue and chapter surfaces.

        Args:
            job_id: Stable job identifier being updated.
            status: Canonical live job status.
            progress: Optional normalized progress percentage or ratio.
            eta_seconds: Optional remaining seconds estimate.
            message: Optional user-facing status message.
            waiting_reason: Optional resource wait explanation for queue UI.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        payload = self._build_progress_payload(
            job_id=job_id,
            status=status,
            progress=progress,
            eta_seconds=eta_seconds,
            message=message,
            waiting_reason=waiting_reason,
        )
        _ = self.broadcaster
        _ = payload
        raise NotImplementedError("Studio 2.0 progress publishing is not implemented yet.")

    def _normalize_monotonic_progress(
        self,
        *,
        job_id: str,
        completed_units: int,
        total_units: int,
    ) -> float:
        """Describe the monotonic-progress contract used by the UI.

        Args:
            job_id: Stable job identifier being updated.
            completed_units: Number of completed units reported so far.
            total_units: Total number of expected progress units.

        Returns:
            float: Monotonic progress value suitable for UI smoothing.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = job_id
        raise NotImplementedError("Studio 2.0 monotonic progress normalization is not implemented yet.")

    def _build_progress_payload(
        self,
        *,
        job_id: str,
        status: str,
        progress: float | None,
        eta_seconds: int | None,
        message: str | None,
        waiting_reason: str | None,
    ) -> dict[str, object]:
        """Describe the canonical payload sent to live frontend listeners.

        Args:
            job_id: Stable job identifier being updated.
            status: Canonical live job status.
            progress: Optional normalized progress value.
            eta_seconds: Optional remaining seconds estimate.
            message: Optional user-facing status message.
            waiting_reason: Optional queue wait explanation.

        Returns:
            dict[str, object]: Broadcast-ready progress payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = (job_id, status, progress, eta_seconds, message, waiting_reason)
        raise NotImplementedError("Studio 2.0 progress payload building is not implemented yet.")


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
