"""Job repository boundary."""

from typing import Iterable, Protocol

from .models import JobModel


class JobRepository(Protocol):
    """Persistence contract for canonical job records."""

    def get(self, job_id: str) -> JobModel | None:
        """Load one job by stable job identifier."""

    def list_active(self) -> Iterable[JobModel]:
        """List active or resumable jobs."""

    def save(self, job: JobModel) -> JobModel:
        """Persist job state and return the stored job."""
