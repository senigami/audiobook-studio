"""Job domain service.

This module will own canonical job-state reads and state transitions that are
separate from live progress overlays.
"""

from .models import JobModel
from .repository import JobRepository


class JobService:
    """Placeholder service for canonical job reads and transitions."""

    def __init__(self, repository: JobRepository):
        self.repository = repository

    def get_job(self, job_id: str) -> JobModel:
        """Load canonical job state through the job domain boundary.

        Args:
            job_id: Stable job identifier being requested.

        Returns:
            JobModel: Stored job state.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.repository
        raise NotImplementedError("Studio 2.0 job reads are not implemented yet.")


def create_job_service(repository: JobRepository) -> JobService:
    """Create the job-domain service shell.

    Args:
        repository: Persistence adapter implementing the job repository
            contract.

    Returns:
        JobService: Service shell with repository dependency wiring.
    """
    return JobService(repository=repository)
