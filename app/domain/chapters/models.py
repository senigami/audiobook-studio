"""Chapter and production-block domain models.

Phase 1 note:
- These models describe the Studio 2.0 chapter boundary only.
- The current chapter and segment implementation remains legacy-backed for now.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ChapterModel:
    """Chapter metadata and revision identity."""

    id: str
    project_id: str
    title: str
    chapter_number: Optional[int] = None
    revision_id: Optional[str] = None


@dataclass
class ProductionBlockModel:
    """Editorial block that the user works with in the chapter editor."""

    id: str
    chapter_id: str
    text: str
    stable_key: Optional[str] = None
    voice_profile_id: Optional[str] = None
    render_state: str = "draft"


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
    engine_id: Optional[str] = None
    voice_profile_id: Optional[str] = None
