"""Job domain service.

This module will own canonical job-state reads and state transitions that are
separate from live progress overlays.
"""

from __future__ import annotations

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
        job = self.repository.get(job_id)
        if job is None:
            raise KeyError(f"Job not found: {job_id}")
        return job


def create_job_service(repository: JobRepository) -> JobService:
    """Create the job-domain service shell.

    Args:
        repository: Persistence adapter implementing the job repository
            contract.

    Returns:
        JobService: Service shell with repository dependency wiring.
    """
    return JobService(repository=repository)
