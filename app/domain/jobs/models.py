"""Job domain models.

These models describe canonical job state independently from live progress
overlays or worker-local runtime assumptions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class JobModel:
    """Canonical queue job identity and persisted job state."""

    id: str
    job_type: str
    status: str
    project_id: str | None = None
    chapter_id: str | None = None
    render_batch_id: str | None = None
    parent_job_id: str | None = None
    resource_profile: str | None = None
    priority: int = 0
    attempt_count: int = 0
    max_attempts: int = 3
    payload_json: dict[str, Any] = field(default_factory=dict)
    reason_code: str | None = None
    reason_detail: str | None = None
    recovered_from_interruption: bool = False
    engine_id: str | None = None
    engine_version: str | None = None
    created_at: datetime = field(default_factory=_utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
