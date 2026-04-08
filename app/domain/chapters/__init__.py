"""Chapter domain for Studio 2.0.

Owns chapter drafts, production blocks, segmentation, and render batching.
"""

from .models import ChapterDraftModel, ChapterModel, ProductionBlockModel, RenderBatchModel
from .segmentation import segment_chapter_text
from .service import create_chapter_service

__all__ = [
    "ChapterDraftModel",
    "ChapterModel",
    "ProductionBlockModel",
    "RenderBatchModel",
    "segment_chapter_text",
    "create_chapter_service",
]
