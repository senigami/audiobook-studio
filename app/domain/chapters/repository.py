"""Chapter repository boundary."""

from __future__ import annotations

from typing import Iterable, Protocol

from .models import ChapterModel


class ChapterRepository(Protocol):
    """Persistence contract for chapter data."""

    def get(self, chapter_id: str) -> ChapterModel | None:
        """Load one chapter by stable chapter identifier."""

    def list_by_project(self, project_id: str) -> Iterable[ChapterModel]:
        """List chapters belonging to a single project."""

    def save(self, chapter: ChapterModel) -> ChapterModel:
        """Persist chapter metadata and return the stored chapter."""
