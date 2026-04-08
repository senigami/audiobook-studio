"""Chapter domain for Studio 2.0.

Owns chapter drafts, production blocks, segmentation, and render batching.
"""

from .models import ChapterModel, ProductionBlockModel
from .service import create_chapter_service

__all__ = ["ChapterModel", "ProductionBlockModel", "create_chapter_service"]
