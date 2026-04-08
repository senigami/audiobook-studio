"""Chapter and production-block domain models.

This module will define chapter drafts, production blocks, and render-batch
references. The current chapter/segment behavior remains legacy-backed for now.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ChapterModel:
    """Placeholder for chapter-level state."""

    id: str
    project_id: str
    title: str


@dataclass
class ProductionBlockModel:
    """Placeholder for the editorial unit inside a chapter."""

    id: str
    chapter_id: str
    text: str
    stable_key: Optional[str] = None

