"""Compatibility facade for the Phase 7 production-block bridge."""

from __future__ import annotations

# Re-export public API from specialized modules
from app.config import find_existing_project_subdir as _find_existing_project_subdir
from app.textops import SENT_CHAR_LIMIT as _SENT_CHAR_LIMIT

from .compatibility_helpers import (
    CompatibilityRevisionMismatch,
    _load_chapter_row,
    _load_segment_rows,
    _normalize_segment_status,
    _aggregate_status,
    _derive_block_status,
    _clean_optional_text,
    _resolved_speaker_profile_name,
    _segment_assignment,
    _segment_contains_paragraph_break,
    _stable_block_id,
    _stable_batch_id,
    _build_base_revision_id,
    _resolve_engine_from_profile,
    _normalize_block_payload,
    _reconstruct_raw_text,
)

from .compatibility_assets import (
    export_chapter_audio,
    _resolve_canonical_wav_path,
)

from .compatibility_blocks import (
    _group_segments_into_blocks,
    _build_block,
    _derive_render_batches,
    _build_render_batch,
    _preserve_segment_assignments,
    _fallback_block_for_update,
)

from .compatibility_ops import (
    get_production_blocks_payload,
    get_script_view_payload,
    save_production_blocks_payload,
    save_script_assignments,
    get_resync_preview,
    compact_script_view,
    _build_script_batch,
    _apply_range_assignment,
    _split_segment_at_offset,
)

find_existing_project_subdir = _find_existing_project_subdir
SENT_CHAR_LIMIT = _SENT_CHAR_LIMIT
