"""Chapter repository boundary."""

from typing import Iterable, Protocol

from .models import ChapterModel, ProductionBlockModel


class ChapterRepository(Protocol):
    """Persistence contract for chapter and block data."""

    def get(self, chapter_id: str) -> ChapterModel | None: ...
    def list_blocks(self, chapter_id: str) -> Iterable[ProductionBlockModel]: ...
    def save(self, chapter: ChapterModel) -> ChapterModel: ...
    def save_blocks(self, chapter_id: str, blocks: Iterable[ProductionBlockModel]) -> None: ...
