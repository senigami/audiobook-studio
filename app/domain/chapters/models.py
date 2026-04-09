"""Chapter and production-block domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


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


@dataclass
class ProductionBlockModel:
    """Editorial block that the user works with in the chapter editor."""

    id: str
    chapter_id: str
    order_index: int
    stable_key: str
    text: str
    normalized_text: str | None = None
    character_id: str | None = None
    voice_assignment_id: str | None = None
    render_revision_hash: str | None = None
    last_rendered_artifact_id: str | None = None
    status: str = "draft"
    last_error: str | None = None
    resolved_engine_id: str | None = None
    resolved_engine_version: str | None = None
    synthesis_settings: dict[str, Any] = field(default_factory=dict)
    normalization_settings: dict[str, Any] = field(default_factory=dict)
    post_processing_settings: dict[str, Any] = field(default_factory=dict)
    estimated_work_weight: int = 1

    @property
    def stable_text(self) -> str:
        """Return the normalized text when available, otherwise the source text."""

        return self.normalized_text or self.text


@dataclass
class ChapterDraftModel:
    """Normalized block-aware draft prepared for the editor surface."""

    chapter_id: str
    revision_id: str
    blocks: list[ProductionBlockModel] = field(default_factory=list)


@dataclass
class RenderBatchModel:
    """Execution unit derived from one or more adjacent production blocks."""

    id: str
    chapter_id: str
    block_ids: list[str] = field(default_factory=list)
    stable_batch_key: str | None = None
    resolved_engine_id: str | None = None
    resolved_engine_version: str | None = None
    resolved_voice_assignment_id: str | None = None
    batch_revision_hash: str | None = None
    estimated_work_weight: int = 0
    status: str = "draft"
    last_error: str | None = None
    synthesis_settings: dict[str, Any] = field(default_factory=dict)
    normalization_settings: dict[str, Any] = field(default_factory=dict)
    post_processing_settings: dict[str, Any] = field(default_factory=dict)

    @property
    def block_count(self) -> int:
        return len(self.block_ids)
