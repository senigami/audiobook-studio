"""Chapter domain service.

Future responsibilities:
- chapter validation
- segmentation
- draft management
- render-batch derivation
"""

from .batching import derive_render_batches
from .drafting import normalize_chapter_draft
from .repository import ChapterRepository


class ChapterService:
    """Placeholder service showing how chapter logic will flow through 2.0."""

    def __init__(self, repository: ChapterRepository):
        self.repository = repository

    def get_chapter(self, chapter_id: str):
        """Read chapter data through the chapter domain."""
        raise NotImplementedError("Studio 2.0 chapter reads are not implemented yet.")

    def normalize_draft(self, chapter_id: str):
        """Prepare chapter draft content for block-aware editing."""
        _ = normalize_chapter_draft
        raise NotImplementedError("Studio 2.0 draft normalization is not implemented yet.")

    def derive_batches(self, chapter_id: str):
        """Translate chapter blocks into render-batch execution units."""
        _ = derive_render_batches
        raise NotImplementedError("Studio 2.0 render-batch derivation is not implemented yet.")


def create_chapter_service(repository: ChapterRepository) -> ChapterService:
    """Factory for the future chapter domain service."""
    _ = repository
    raise NotImplementedError("Studio 2.0 chapter service is not implemented yet.")
