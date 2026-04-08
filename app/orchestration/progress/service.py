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

    def reconcile(self, *args, **kwargs):
        _ = reconcile_work_item
        raise NotImplementedError("Studio 2.0 reconciliation is not implemented yet.")

    def estimate_eta(self, *args, **kwargs):
        _ = estimate_eta_seconds
        raise NotImplementedError("Studio 2.0 ETA estimation is not implemented yet.")

    def publish(self, *args, **kwargs):
        _ = broadcast_progress
        raise NotImplementedError("Studio 2.0 progress publishing is not implemented yet.")


def create_progress_service() -> ProgressService:
    """Factory for the future progress service."""
    raise NotImplementedError
