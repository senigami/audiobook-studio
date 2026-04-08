"""Job domain models.

These models describe canonical job state independently from live progress
overlays or worker-local runtime assumptions.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class JobModel:
    """Canonical queue job identity and persisted job state."""

    id: str
    task_type: str
    status: str
    project_id: Optional[str] = None
    chapter_id: Optional[str] = None
    parent_job_id: Optional[str] = None
