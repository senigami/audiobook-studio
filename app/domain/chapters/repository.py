"""Chapter repository boundary."""

from typing import Iterable, Protocol

from .models import ChapterDraftModel, ChapterModel, ProductionBlockModel


class ChapterRepository(Protocol):
    """Persistence contract for chapter and block data."""

    def get(self, chapter_id: str) -> ChapterModel | None:
        """Load one chapter by stable chapter identifier."""

    def list_by_project(self, project_id: str) -> Iterable[ChapterModel]:
        """List chapters belonging to a single project."""

    def list_blocks(self, chapter_id: str) -> Iterable[ProductionBlockModel]:
        """Load editorial blocks for a chapter in stable order."""

    def get_draft(
        self, chapter_id: str, revision_id: str | None = None
    ) -> ChapterDraftModel | None:
        """Load a normalized draft for the requested chapter revision."""

    def save(self, chapter: ChapterModel) -> ChapterModel:
        """Persist chapter metadata and return the stored chapter."""

    def save_blocks(
        self, chapter_id: str, blocks: Iterable[ProductionBlockModel]
    ) -> None:
        """Persist normalized block ordering for the target chapter."""

    def save_draft(self, draft: ChapterDraftModel) -> ChapterDraftModel:
        """Persist normalized editor draft state and return the saved draft."""
