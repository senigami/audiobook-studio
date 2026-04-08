"""Chapter repository boundary."""

from typing import Protocol


class ChapterRepository(Protocol):
    """Persistence contract for chapter and block data."""

    def get(self, chapter_id: str): ...
    def save(self, chapter): ...

