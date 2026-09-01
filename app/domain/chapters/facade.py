"""Domain facade for the Phase 7 production-block bridge."""

from __future__ import annotations

# Re-export public API from specialized modules


from .helpers import (
    RevisionMismatch,
    _load_chapter_row,
    _load_segment_rows,
    _normalize_segment_status,
    _aggregate_status,
    _clean_optional_text,
    _resolved_speaker_profile_name,
    _segment_assignment,
    _segment_contains_paragraph_break,
    _stable_batch_id,
    _build_base_revision_id,
    _resolve_engine_from_profile,
)

from .assets import (
    export_chapter_audio,
    _resolve_canonical_wav_path,
)

from .operations import (
    get_script_view_payload,
    save_script_assignments,
    get_resync_preview,
    compact_script_view,
    MergeChunkLimitExceeded,
    _build_script_batch,
    _apply_range_assignment,
    _split_segment_at_offset,
)


# Compatibility for Phase 7 bridge

