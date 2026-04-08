"""Job domain for Studio 2.0."""

from .models import JobModel
from .service import create_job_service

__all__ = ["JobModel", "create_job_service"]
