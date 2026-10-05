"""Generation API facade — assembles chapter/queue/segment render routes.

Split (Task 003 — API router split) out of a single 859-line module into:
- ``generation_shared.py``  — non-route helpers (engine validation, task/script building)
- ``generation_chapters.py`` — chapter enqueue + bake routes
- ``generation_queue.py``    — pause/resume/cancel-all/cancel-chapter routes
- ``generation_segments.py`` — segment-level generate route

Names below are re-exported for backward compatibility with callers that
import directly from ``app.api.routers.generation`` (e.g.
``_build_chapter_synthesis_task`` used by tests).
"""
from __future__ import annotations
import logging
from fastapi import APIRouter

from . import generation_chapters, generation_queue, generation_segments
from .generation_shared import (
    _engine_usable_error,
    _resolved_segment_profiles,
    _ensure_engines_enabled,
    _validate_generation_engines,
    _build_script_for_chapter,
    _build_chapter_synthesis_task,
    _engines_for_profiles,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["generation"])
router.include_router(generation_chapters.router)
router.include_router(generation_queue.router)
router.include_router(generation_segments.router)

# Backward-compatible aliases for route handlers moved into sub-modules.
api_add_to_queue = generation_chapters.api_add_to_queue
api_bake_chapter = generation_chapters.api_bake_chapter
pause_queue = generation_queue.pause_queue
resume_queue = generation_queue.resume_queue
cancel_pending = generation_queue.cancel_pending
cancel_chapter_generation = generation_queue.cancel_chapter_generation
api_generate_segments = generation_segments.api_generate_segments
