"""Chapter domain models for Studio 2.0."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ChapterModel:
    """Chapter metadata and revision identity."""

    id: str
    project_id: str
    title: str
    order_index: int = 0
    source_revision: str | None = None
    active_draft_revision: str | None = None
    status: str = "draft"
    word_count: int = 0
    character_count: int = 0
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)
