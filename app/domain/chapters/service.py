"""Chapter domain service.

Future responsibilities:
- chapter validation
- segmentation
- draft management
- render-batch derivation
"""

from __future__ import annotations

from collections.abc import Sequence

from .models import ChapterDraftModel, ChapterModel, ProductionBlockModel, RenderBatchModel
from .batching import derive_render_batches
from .drafting import normalize_chapter_draft
from .repository import ChapterRepository

INTENDED_UPSTREAM_CALLERS = (
    "app.api.routers.chapters",
    "app.api.routers.projects",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.domain.chapters.repository.ChapterRepository",
    "app.domain.chapters.drafting.normalize_chapter_draft",
    "app.domain.chapters.batching.derive_render_batches",
    "app.domain.chapters.segmentation.segment_chapter_text",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.db.chapters",
    "app.db.segments",
    "app.jobs",
    "app.engines",
)


class ChapterService:
    """Placeholder service showing how chapter logic will flow through 2.0."""

    def __init__(self, repository: ChapterRepository):
        self.repository = repository

    def list_chapters(self, project_id: str) -> list[ChapterModel]:
        """List the ordered chapters for a project.

        Args:
            project_id: Stable project identifier.

        Returns:
            list[ChapterModel]: Project chapter summaries in display order.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return list(self.repository.list_by_project(project_id))

    def get_chapter(
        self, chapter_id: str, *, include_blocks: bool = False
    ) -> ChapterModel:
        """Read chapter data through the chapter domain.

        Args:
            chapter_id: Stable chapter identifier.
            include_blocks: Whether block data is required with chapter
                metadata for the caller's workflow.

        Returns:
            ChapterModel: Requested chapter metadata.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        chapter = self._load_chapter(chapter_id=chapter_id)
        if include_blocks:
            _ = self._load_blocks(chapter_id=chapter_id)
        return chapter

    def normalize_draft(
        self,
        chapter_id: str,
        *,
        raw_text: str,
        revision_id: str | None = None,
    ) -> ChapterDraftModel:
        """Prepare raw chapter text for block-aware editing.

        Args:
            chapter_id: Stable chapter identifier.
            raw_text: Raw editor text or imported chapter text.
            revision_id: Optional existing revision identifier to reconcile with
                stored block state.

        Returns:
            ChapterDraftModel: Normalized editor draft with stable block keys.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        existing_blocks = self._load_blocks(chapter_id=chapter_id)
        return normalize_chapter_draft(
            chapter_id=chapter_id,
            raw_text=raw_text,
            existing_blocks=existing_blocks,
            revision_id=revision_id,
        )

    def save_blocks(
        self,
        chapter_id: str,
        *,
        blocks: Sequence[ProductionBlockModel],
        revision_id: str | None = None,
    ) -> ChapterDraftModel:
        """Persist block-aware edits back to the chapter draft boundary.

        Args:
            chapter_id: Stable chapter identifier.
            blocks: Ordered editorial blocks after user edits.
            revision_id: Optional revision identifier being replaced or updated.

        Returns:
            ChapterDraftModel: Saved draft shell for downstream reconciliation.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        draft = self._prepare_saved_draft(
            chapter_id=chapter_id,
            blocks=blocks,
            revision_id=revision_id,
        )
        self.repository.save_blocks(chapter_id, draft.blocks)
        return self.repository.save_draft(draft)

    def derive_batches(
        self, chapter_id: str, *, block_ids: Sequence[str] | None = None
    ) -> list[RenderBatchModel]:
        """Translate editorial blocks into render-batch execution units.

        Args:
            chapter_id: Stable chapter identifier.
            block_ids: Optional explicit block subset; absent means derive all
                eligible batches for the chapter revision.

        Returns:
            list[RenderBatchModel]: Ordered execution units for synthesis.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        chapter = self._load_chapter(chapter_id=chapter_id)
        blocks = self._load_blocks(chapter_id=chapter_id)
        return derive_render_batches(chapter=chapter, blocks=blocks, block_ids=block_ids)

    def _load_chapter(self, *, chapter_id: str) -> ChapterModel:
        """Load chapter metadata before domain operations run.

        Args:
            chapter_id: Stable chapter identifier.

        Returns:
            ChapterModel: Loaded chapter metadata.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        chapter = self.repository.get(chapter_id)
        if chapter is None:
            raise KeyError(f"Chapter not found: {chapter_id}")
        return chapter

    def _load_blocks(self, *, chapter_id: str) -> list[ProductionBlockModel]:
        """Load ordered editorial blocks for chapter-level operations.

        Args:
            chapter_id: Stable chapter identifier.

        Returns:
            list[ProductionBlockModel]: Blocks for the requested chapter.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return list(self.repository.list_blocks(chapter_id))

    def _prepare_saved_draft(
        self,
        *,
        chapter_id: str,
        blocks: Sequence[ProductionBlockModel],
        revision_id: str | None,
    ) -> ChapterDraftModel:
        """Prepare normalized draft payload before persistence.

        Args:
            chapter_id: Stable chapter identifier.
            blocks: Ordered editorial blocks after user edits.
            revision_id: Optional revision being updated.

        Returns:
            ChapterDraftModel: Draft payload ready for repository storage.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        ordered_blocks = sorted(list(blocks), key=lambda block: (block.order_index, block.id))
        revision = revision_id or (ordered_blocks[0].render_revision_hash if ordered_blocks else None) or "draft"
        return ChapterDraftModel(chapter_id=chapter_id, revision_id=revision, blocks=ordered_blocks)


def create_chapter_service(repository: ChapterRepository) -> ChapterService:
    """Create the chapter-domain service shell.

    Args:
        repository: Persistence adapter implementing the chapter repository
            contract.

    Returns:
        ChapterService: Service shell with repository dependency wiring.
    """
    return ChapterService(repository=repository)
