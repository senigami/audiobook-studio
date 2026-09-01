from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Iterable, Optional

from ..db.core import get_connection
from ..db.segments import segment_text_hash
from ..engines.voice_engines import resolve_profile_engine
from ..engines.behavior import (
    get_text_chunk_limit,
    get_text_split_target,
    get_sanitize_categories,
    has_behavior,
)


def load_chunk_segments(chapter_id: str) -> list[dict]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.text_content,
                   s.character_id,
                   s.id,
                   s.segment_order,
                   s.speaker_profile_name,
                   c.speaker_profile_name AS character_speaker_profile_name,
                   s.audio_status,
                   s.audio_file_path
            FROM chapter_segments s
            LEFT JOIN characters c ON s.character_id = c.id
            WHERE s.chapter_id = ?
            ORDER BY s.segment_order
            """,
            (chapter_id,),
        )
        return [dict(row) for row in cursor.fetchall()]


def resolve_segment_profile_name(segment: dict, default_profile: str | None) -> str | None:
    return (
        segment.get("speaker_profile_name")
        or segment.get("character_speaker_profile_name")
        or default_profile
    )


def build_chunk_groups(
    segments: list[dict],
    default_profile: str | None,
    *,
    engine_cache: Optional[dict[str | None, str]] = None,
) -> list[dict]:
    groups: list[dict] = []
    engine_cache = engine_cache if engine_cache is not None else {}

    for segment in segments:
        text = (segment.get("text_content") or "").strip()
        if not text:
            continue

        profile_name = resolve_segment_profile_name(segment, default_profile)
        cache_key = profile_name or None
        if cache_key in engine_cache:
            engine = engine_cache[cache_key]
        else:
            engine = resolve_profile_engine(profile_name, "unknown")
            engine_cache[cache_key] = engine
        text_length = len(text)

        last_group = groups[-1] if groups else None
        if (
            last_group
            and last_group["character_id"] == segment.get("character_id")
            and last_group["profile_name"] == profile_name
            and last_group["engine"] == engine
            and (last_group["text_length"] + text_length + 1) <= get_text_chunk_limit(engine)
        ):
            last_group["segments"].append(segment)
            last_group["text_length"] += text_length + 1
            last_group["text_parts"].append(text)
            continue

        groups.append(
            {
                "character_id": segment.get("character_id"),
                "profile_name": profile_name,
                "engine": engine,
                "segments": [segment],
                "text_parts": [text],
                "text_length": text_length,
            }
        )

    return groups


def segment_row_as_group(
    segment: dict,
    default_profile: str | None,
    *,
    engine_cache: Optional[dict[str | None, str]] = None,
) -> dict:
    """Wrap a single ``chapter_segments`` row as a one-row chunk-group dict.

    Post-#232 Task 005b, a row IS the render unit by construction (grouping
    now happens once, at row-creation time, inside ``sync_chapter_segments``)
    -- this exists only so the many consumers built against the historical
    ``build_chunk_groups`` group-dict shape (``character_id``/``profile_name``/
    ``engine``/``segments``/``text_parts``/``text_length``) don't each need an
    independent rewrite. Never merges rows; callers that need every row of a
    chapter wrapped this way should use ``rows_as_groups``.
    """
    text = (segment.get("text_content") or "").strip()
    profile_name = resolve_segment_profile_name(segment, default_profile)
    engine_cache = engine_cache if engine_cache is not None else {}
    cache_key = profile_name or None
    if cache_key in engine_cache:
        engine = engine_cache[cache_key]
    else:
        engine = resolve_profile_engine(profile_name, "unknown")
        engine_cache[cache_key] = engine
    return {
        "character_id": segment.get("character_id"),
        "profile_name": profile_name,
        "engine": engine,
        "segments": [segment],
        "text_parts": [text],
        "text_length": len(text),
    }


def rows_as_groups(segments: list[dict], default_profile: str | None) -> list[dict]:
    """Wrap each non-blank row of ``segments`` as its own one-row group.

    Drop-in replacement for ``build_chunk_groups(segments, default_profile)``
    at every call site that must NOT re-derive grouping at read/render time
    (#232 Task 005b) -- a ``chapter_segments`` row is already the render unit,
    so there is no merging left to do, only the per-row engine resolution
    downstream consumers (e.g. ``handle_mixed_job``'s engine dispatch) still
    depend on.
    """
    engine_cache: dict[str | None, str] = {}
    return [
        segment_row_as_group(segment, default_profile, engine_cache=engine_cache)
        for segment in segments
        if (segment.get("text_content") or "").strip()
    ]


def group_wav_path(chapter_dir: Path, group: dict) -> Path:
    """Canonical on-disk WAV path for a rendered chunk group.

    The group's leader (first member) segment id names the file --
    ``chapter_dir / "segments" / f"{leader_id}.wav"``. Single source of
    truth shared by ``build_script_entry_for_group`` (the stitcher's
    script-entry builder) and the orchestrator's timing-sidecar generator
    (``_emit_chapter_timing_sidecar``) so the two never drift apart.
    """
    return chapter_dir / "segments" / f"{group['segments'][0]['id']}.wav"


def build_script_entry_for_group(
    group: dict,
    chapter_dir: Path,
    *,
    default_profile: Optional[str] = None,
    safe_mode: bool = True,
) -> dict[str, Any]:
    """Build a single orchestrator ``script`` entry for one chunk group.

    Extracted (W-PAR 008, R2) from ``app.api.routers.generation``'s
    ``_build_script_for_chapter`` per-group loop body so both the live
    chapter-script builder AND the per-child synthetic-task path (W-PAR 008's
    ``ChapterSynthesisTask``/``SegmentSynthesisTask`` reuse of
    ``_dispatch_segment``) share one script-entry shape — no duplicate logic.

    The returned dict is the shape ``_dispatch_segment``
    (``orchestration/scheduler/orchestrator_helpers.py``) reads for weighted
    progress tracking: ``id``, ``ids``, ``save_path`` (absolute), ``weight``,
    ``text``, ``engine``, plus optional ``speaker_wav``/``voice_profile_dir``.

    Args:
        group: A ``build_chunk_groups`` chunk-group dict.
        chapter_dir: The chapter's asset directory (segment WAVs are written
            under ``chapter_dir / "segments"``).
        default_profile: Fallback engine-resolution profile when the group
            itself does not carry a resolved ``engine``.
        safe_mode: Whether to sanitize/split the group's joined text before
            it reaches the engine.

    Returns:
        dict[str, Any]: One orchestrator script entry for this group.
    """
    from ..db.speakers import get_profile_wavs, get_profile_dir  # noqa: PLC0415

    first = group["segments"][0]
    profile_name = group["profile_name"]
    engine_id = group.get("engine") or resolve_profile_engine(profile_name, default_profile)

    # Resolve voice details
    try:
        sw = get_profile_wavs(profile_name) if profile_name else None
        # Standard single-sample resolution for bridge transport
        if sw and "," in sw:
            sw = sw.split(",")[0]
    except Exception:
        sw = None

    vdir = None
    if profile_name:
        try:
            vdir = str(get_profile_dir(profile_name))
        except Exception:
            vdir = None

    processed = " ".join(group["text_parts"]).strip()
    if safe_mode:
        if has_behavior(engine_id, "sanitize_text"):
            from ..utils.text.textops import sanitize_text  # noqa: PLC0415
            processed = sanitize_text(processed, get_sanitize_categories(engine_id))
        from ..utils.text.textops import safe_split_long_sentences  # noqa: PLC0415
        processed = safe_split_long_sentences(processed, target=get_text_split_target(engine_id))

    # V2 segment path: chapters/{chapter_id}/segments/{first_segment_id}.wav
    # The orchestrator uses absolute paths for bridge transport
    seg_out = group_wav_path(chapter_dir, group)

    # Write-back fingerprint guard (#232 Task 003, INV-2): capture, per
    # member segment, the exact (text_hash, character_id,
    # speaker_profile_name) the guard will re-check at write-back time.
    # speaker_profile_name is the RAW column (not the resolved
    # engine/profile above) -- comparing raw-to-raw at both ends is what
    # makes the guard correct for a fallback-voiced segment whose column is
    # NULL (see 003's task file for why comparing raw-vs-resolved is wrong).
    fingerprints = {
        s["id"]: {
            "text_hash": segment_text_hash(s.get("text_content") or ""),
            "character_id": s.get("character_id"),
            "speaker_profile_name": s.get("speaker_profile_name"),
        }
        for s in group["segments"]
    }

    script_entry: dict[str, Any] = {
        "text": processed,
        "speaker_wav": sw,
        "id": first["id"],
        "ids": [s["id"] for s in group["segments"]],
        "save_path": str(seg_out.absolute()),
        "weight": max(1, len(processed)),  # Store weight for orchestrator progress tracking
        "engine": engine_id,
        "fingerprints": fingerprints,
    }
    if vdir:
        script_entry["voice_profile_dir"] = vdir

    return script_entry


def get_chunk_group_indexes_for_segment_ids(
    chapter_id: str,
    segment_ids: Iterable[str],
    default_profile: Optional[str] = None,
) -> list[int]:
    """1-based ordinal position (among non-blank rows, in row order) of every
    row in ``segment_ids``.

    Post-#232 Task 005b: a row IS a render group by construction, so this
    reads ``chapter_segments`` rows directly instead of recomputing groups
    via ``build_chunk_groups`` -- the numbering is identical to before
    (build_chunk_groups no longer merges distinct rows either), just derived
    without the redundant regroup. ``default_profile`` is accepted for
    backward-compatible call signatures but no longer used.
    """
    target_ids = {segment_id for segment_id in segment_ids if segment_id}
    if not target_ids:
        return []

    indexes: list[int] = []
    ordinal = 0
    for segment in load_chunk_segments(chapter_id):
        if not (segment.get("text_content") or "").strip():
            continue
        ordinal += 1
        if segment["id"] in target_ids:
            indexes.append(ordinal)
    return indexes


def format_chunk_group_label(group_indexes: Iterable[int]) -> Optional[str]:
    indexes = sorted({index for index in group_indexes if index > 0})
    if not indexes:
        return None
    if len(indexes) == 1:
        return f"segment #{indexes[0]}"

    first = indexes[0]
    last = indexes[-1]
    if indexes == list(range(first, last + 1)):
        return f"segments #{first}-{last}"

    return "segments " + ", ".join(f"#{index}" for index in indexes)


def build_chapter_queue_title(chapter_title: str, sort_order: Optional[int] = None) -> str:
    title = (chapter_title or "").strip() or "Untitled Chapter"
    if sort_order is None or sort_order <= 0:
        return title

    part_number = sort_order + 1
    if re.search(rf"\b(?:part|chapter)\s*{part_number}\b", title, re.IGNORECASE):
        return title
    return f"{title} • Part {part_number}"


def build_segment_job_title(
    chapter_title: str,
    chapter_id: str,
    segment_ids: Iterable[str],
    default_profile: Optional[str] = None,
) -> str:
    label = format_chunk_group_label(
        get_chunk_group_indexes_for_segment_ids(
            chapter_id=chapter_id,
            segment_ids=segment_ids,
            default_profile=default_profile,
        )
    )
    if not label:
        return chapter_title
    return f"{chapter_title}: {label}"
