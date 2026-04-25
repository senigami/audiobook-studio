"""Compatibility helpers for the Phase 7 production-block bridge."""

from __future__ import annotations

import json
import re
import time
import uuid
from collections.abc import Mapping, Sequence
from hashlib import sha256
from pathlib import Path
from typing import Any

from app.config import XTTS_OUT_DIR, find_existing_project_subdir
from app.db.core import _db_lock, get_connection
from app.db.segments import sync_chapter_segments
from app.pathing import safe_basename, safe_join_flat
from app.textops import compute_chapter_metrics, split_sentences, SENT_CHAR_LIMIT


class CompatibilityRevisionMismatch(Exception):
    """Raised when the caller saves against a stale chapter revision."""

    def __init__(self, expected_revision_id: str, actual_revision_id: str):
        super().__init__(
            f"Base revision mismatch: expected {expected_revision_id}, got {actual_revision_id}"
        )
        self.expected_revision_id = expected_revision_id
        self.actual_revision_id = actual_revision_id


def get_production_blocks_payload(chapter_id: str) -> dict[str, Any]:
    """Build the compatibility production-block payload for a chapter."""

    with _db_lock:
        with get_connection() as conn:
            chapter_row = _load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")
            segment_rows = _load_segment_rows(conn, chapter_id)

    blocks = _group_segments_into_blocks(chapter_id=chapter_id, segment_rows=segment_rows)
    render_batches = _derive_render_batches(chapter_id=chapter_id, blocks=blocks)
    return {
        "chapter_id": chapter_id,
        "base_revision_id": _build_base_revision_id(chapter_row, segment_rows),
        "blocks": blocks,
        "render_batches": render_batches,
    }


def get_script_view_payload(chapter_id: str) -> dict[str, Any]:
    """Build the Phase 7 Script View read model payload for a chapter."""
    from app.textops import sanitize_for_xtts

    with _db_lock:
        with get_connection() as conn:
            chapter_row = _load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")
            segment_rows = _load_segment_rows(conn, chapter_id)

    spans = []
    paragraphs = []
    current_paragraph_span_ids = []

    for index, row in enumerate(segment_rows):
        text = str(row.get("text_content") or "")
        sanitized = _clean_optional_text(row.get("sanitized_text"))
        if sanitized is None:
            sanitized = sanitize_for_xtts(text)

        span_id = str(row["id"])
        span_payload = {
            "id": span_id,
            "paragraph_id": f"p_{span_id}",  # Placeholder
            "order_index": row.get("segment_order", index),
            "text": text,
            "sanitized_text": sanitized,
            "character_id": _clean_optional_text(row.get("character_id")),
            "speaker_profile_name": _resolved_speaker_profile_name(row),
            "status": _normalize_segment_status(row.get("audio_status")),
            "audio_file_path": _clean_optional_text(row.get("audio_file_path")),
            "audio_generated_at": row.get("audio_generated_at"),
            "char_count": len(text),
            "sanitized_char_count": len(sanitized),
        }
        spans.append(span_payload)
        current_paragraph_span_ids.append(span_id)

        if _segment_contains_paragraph_break(row):
            p_id = f"para_{current_paragraph_span_ids[0]}"
            paragraphs.append({"id": p_id, "span_ids": current_paragraph_span_ids})
            current_paragraph_span_ids = []

    if current_paragraph_span_ids:
        p_id = f"para_{current_paragraph_span_ids[0]}"
        paragraphs.append({"id": p_id, "span_ids": current_paragraph_span_ids})

    # Group spans into compatible render batches
    from app.engines.bridge import create_voice_bridge
    bridge = create_voice_bridge()
    chunk_cache = {}

    render_batches = []
    current_batch_spans = []
    current_batch_len = 0
    prev_sig = None

    for span in spans:
        sig = (span["character_id"], span["speaker_profile_name"])
        span_len = span["sanitized_char_count"]

        if sig not in chunk_cache:
            eid = _resolve_engine_from_profile(span["speaker_profile_name"])
            try:
                plan = bridge.get_synthesis_plan({"engine_id": eid})
                chunk_cache[sig] = plan.chunk_size or SENT_CHAR_LIMIT
            except Exception:
                # Handle disabled/missing engines gracefully by falling back to default limit
                chunk_cache[sig] = SENT_CHAR_LIMIT

        chunk_limit = chunk_cache[sig]

        if current_batch_spans:
            if sig != prev_sig or (current_batch_len + span_len > chunk_limit):
                render_batches.append(
                    _build_script_batch(
                        chapter_id=chapter_id,
                        spans=current_batch_spans,
                        order_index=len(render_batches),
                    )
                )
                current_batch_spans = []
                current_batch_len = 0

        current_batch_spans.append(span)
        current_batch_len += span_len
        prev_sig = sig

    if current_batch_spans:
        render_batches.append(
            _build_script_batch(
                chapter_id=chapter_id,
                spans=current_batch_spans,
                order_index=len(render_batches),
            )
        )

    return {
        "chapter_id": chapter_id,
        "base_revision_id": _build_base_revision_id(chapter_row, segment_rows),
        "paragraphs": paragraphs,
        "spans": spans,
        "render_batches": render_batches,
    }


def _normalize_segment_status(status: Any) -> str:
    s = str(status or "unprocessed").lower()
    if s == "done":
        return "rendered"
    if s == "processing":
        return "rendering"
    if s in {"failed", "error"}:
        return "failed"
    if s in {"queued", "preparing", "finalizing"}:
        return "queued"
    return "draft"


def _build_script_batch(
    *, chapter_id: str, spans: Sequence[Mapping[str, Any]], order_index: int
) -> dict[str, Any]:
    span_ids = [str(span["id"]) for span in spans]
    status = _aggregate_status([span.get("status") for span in spans])
    return {
        "id": _stable_batch_id(chapter_id=chapter_id, block_ids=span_ids, order_index=order_index),
        "span_ids": span_ids,
        "status": status,
        "estimated_work_weight": max(1, len(spans)),
    }


def save_production_blocks_payload(
    chapter_id: str,
    *,
    blocks: Sequence[Mapping[str, Any]],
    base_revision_id: str | None = None,
) -> dict[str, Any]:
    """Persist editable production blocks through the compatibility bridge."""

    normalized_blocks = [_normalize_block_payload(block, order_index=index) for index, block in enumerate(blocks)]
    raw_text = _reconstruct_raw_text(normalized_blocks)

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            chapter_row = _load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

            current_segments = _load_segment_rows(conn, chapter_id)
            current_base_revision_id = _build_base_revision_id(chapter_row, current_segments)
            if base_revision_id and base_revision_id != current_base_revision_id:
                raise CompatibilityRevisionMismatch(current_base_revision_id, base_revision_id)

            existing_blocks = _group_segments_into_blocks(chapter_id=chapter_id, segment_rows=current_segments)
            metrics = compute_chapter_metrics(raw_text)
            cursor.execute(
                """
                UPDATE chapters
                SET text_content = ?,
                    text_last_modified = ?,
                    audio_status = 'unprocessed',
                    audio_file_path = NULL,
                    audio_generated_at = NULL,
                    audio_length_seconds = NULL,
                    char_count = ?,
                    word_count = ?,
                    predicted_audio_length = ?
                WHERE id = ?
                """,
                (
                    raw_text,
                    time.time(),
                    metrics["char_count"],
                    metrics["word_count"],
                    metrics["predicted_audio_length"],
                    chapter_id,
                ),
            )

            sync_chapter_segments(chapter_id, raw_text, conn=conn)

            updated_segments = _load_segment_rows(conn, chapter_id)
            _preserve_segment_assignments(
                cursor=cursor,
                chapter_id=chapter_id,
                updated_segments=updated_segments,
                normalized_blocks=normalized_blocks,
                existing_blocks=existing_blocks,
            )
            conn.commit()

    return get_production_blocks_payload(chapter_id)



def save_script_assignments(
    chapter_id: str,
    *,
    assignments: Sequence[Mapping[str, Any]],
    range_assignments: Sequence[Mapping[str, Any]] = None,
    base_revision_id: str | None = None,
) -> dict[str, Any]:
    """Apply speaker assignments to script spans and return the refreshed read model."""

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            chapter_row = _load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

            current_segments = _load_segment_rows(conn, chapter_id)
            current_base_revision_id = _build_base_revision_id(chapter_row, current_segments)
            if base_revision_id and base_revision_id != current_base_revision_id:
                raise CompatibilityRevisionMismatch(current_base_revision_id, base_revision_id)

            # 1. Handle range assignments (which may involve splitting)
            for range_req in (range_assignments or []):
                _apply_range_assignment(conn, chapter_id, range_req)

            # 2. Handle whole-span assignments
            flat_assignments: list[tuple[str | None, str | None, str]] = []
            for entry in assignments:
                char_id = _clean_optional_text(entry.get("character_id"))
                prof_name = _clean_optional_text(entry.get("speaker_profile_name"))
                span_ids = entry.get("span_ids") or []
                for sid in span_ids:
                    flat_assignments.append((char_id, prof_name, str(sid)))

            cursor.executemany(
                    """
                    UPDATE chapter_segments
                    SET character_id = ?,
                        speaker_profile_name = ?,
                        audio_status = CASE 
                            WHEN audio_status = 'done' AND (character_id IS NOT ? OR IFNULL(speaker_profile_name, '') IS NOT IFNULL(?, '')) THEN 'unprocessed'
                            ELSE audio_status
                        END
                    WHERE id = ? AND chapter_id = ?
                    """,
                    [(char_id, prof_name, char_id, prof_name, span_id, chapter_id) for char_id, prof_name, span_id in flat_assignments],
                )

    return get_script_view_payload(chapter_id)


def get_resync_preview(chapter_id: str, new_text: str) -> dict[str, Any]:
    """Calculates the impact of a source text resync without modifying the database."""
    from app.db.nlp import split_into_sentences
    from app.db.core import get_connection

    with get_connection() as conn:
        # 1. Get existing segments
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT s.text_content, s.character_id, s.speaker_profile_name, c.name as character_name
            FROM chapter_segments s
            LEFT JOIN characters c ON s.character_id = c.id
            WHERE s.chapter_id = ? 
            ORDER BY s.segment_order ASC
            """,
            (chapter_id,),
        )
        existing = [dict(row) for row in cursor.fetchall()]

    new_sentences = split_into_sentences(new_text)

    total_old = len(existing)
    total_new = len(new_sentences)
    preserved_count = 0
    lost_assignments_count = 0
    affected_character_names = set()

    # Track which old indices were preserved
    preserved_indices = set()

    # Mirror sync_chapter_segments logic for preservation
    for i, sent in enumerate(new_sentences):
        if i < len(existing) and (existing[i].get("text_content") or "").strip() == sent.strip():
            preserved_indices.add(i)
            if existing[i].get("character_id"):
                preserved_count += 1

    # Any assigned segment NOT preserved is "lost"
    for i, row in enumerate(existing):
        if i not in preserved_indices and row.get("character_id"):
            lost_assignments_count += 1
            affected_character_names.add(row.get("character_name") or "Unknown")

    return {
        "total_segments_before": total_old,
        "total_segments_after": total_new,
        "preserved_assignments_count": preserved_count,
        "lost_assignments_count": lost_assignments_count,
        "affected_character_names": sorted(list(affected_character_names)),
        "is_destructive": lost_assignments_count > 0 or (total_new < total_old and total_old > 0)
    }


def compact_script_view(chapter_id: str, base_revision_id: str | None = None) -> dict[str, Any]:
    """Merges adjacent compatible segments and returns refreshed payload."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            chapter_row = _load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

            current_segments = _load_segment_rows(conn, chapter_id)
            current_base_revision_id = _build_base_revision_id(chapter_row, current_segments)
            if base_revision_id and base_revision_id != current_base_revision_id:
                raise CompatibilityRevisionMismatch(current_base_revision_id, base_revision_id)

            if not current_segments:
                return get_script_view_payload(chapter_id)

            segments = [dict(s) for s in current_segments]
            i = 0
            merged_any = False
            while i < len(segments) - 1:
                s1 = segments[i]
                s2 = segments[i + 1]

                char1 = _clean_optional_text(s1.get("character_id"))
                char2 = _clean_optional_text(s2.get("character_id"))
                prof1 = _resolved_speaker_profile_name(s1)
                prof2 = _resolved_speaker_profile_name(s2)

                # Criteria: Same speaker and s1 doesn't end a paragraph
                is_compatible = (char1 == char2 and prof1 == prof2)
                if is_compatible and _segment_contains_paragraph_break(s1):
                    is_compatible = False

                if is_compatible:
                    new_text = (s1.get("text_content") or "") + (s2.get("text_content") or "")

                    # Update S1
                    cursor.execute(
                        """
                        UPDATE chapter_segments 
                        SET text_content = ?, 
                            audio_status = 'unprocessed', 
                            audio_file_path = NULL, 
                            audio_generated_at = NULL 
                        WHERE id = ?
                        """,
                        (new_text, s1["id"])
                    )
                    # Delete S2
                    cursor.execute("DELETE FROM chapter_segments WHERE id = ?", (s2["id"],))
                    # Shift following
                    cursor.execute(
                        "UPDATE chapter_segments SET segment_order = segment_order - 1 WHERE chapter_id = ? AND segment_order > ?",
                        (chapter_id, s2["segment_order"])
                    )

                    # Update local state
                    s1["text_content"] = new_text
                    for j in range(i + 2, len(segments)):
                        segments[j]["segment_order"] -= 1

                    segments.pop(i + 1)
                    merged_any = True
                else:
                    i += 1

            if merged_any:
                conn.commit()

    return get_script_view_payload(chapter_id)

def _apply_range_assignment(conn, chapter_id: str, range_req: Mapping[str, Any]):
    """Surgically split segments and apply assignment to a character range."""
    cursor = conn.cursor()

    start_span_id = range_req["start_span_id"]
    start_offset = range_req["start_offset"]
    end_span_id = range_req["end_span_id"]
    end_offset = range_req["end_offset"]
    character_id = _clean_optional_text(range_req.get("character_id"))
    speaker_profile_name = _clean_optional_text(range_req.get("speaker_profile_name"))

    # Load IDs to validate range
    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
    initial_ids = [row[0] for row in cursor.fetchall()]

    try:
        start_idx = initial_ids.index(start_span_id)
        end_idx = initial_ids.index(end_span_id)
    except ValueError:
        return # Invalid range

    if start_idx > end_idx:
        return # Invalid range

    assign_ids = []

    if start_span_id == end_span_id:
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (start_span_id,))
        row = cursor.fetchone()
        if not row: return
        text = row["text_content"] or ""

        left_id = start_span_id
        # Split at end first if partial
        if 0 < end_offset < len(text):
            _split_segment_at_offset(conn, chapter_id, left_id, end_offset)

        # Split at start if partial
        if 0 < start_offset < len(text):
            _, mid_id = _split_segment_at_offset(conn, chapter_id, left_id, start_offset)
            assign_ids = [mid_id]
        else:
            assign_ids = [left_id]
    else:
        # Cross-segment range
        # 1. Split end segment if partial
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (end_span_id,))
        row = cursor.fetchone()
        end_text = row["text_content"] if row else ""
        if 0 < end_offset < len(end_text):
            _split_segment_at_offset(conn, chapter_id, end_span_id, end_offset)
        # The assigned part starts at the beginning of end_span_id (the left part)

        # 2. Split start segment if partial
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (start_span_id,))
        row = cursor.fetchone()
        start_text = row["text_content"] if row else ""
        target_start_id = start_span_id
        if 0 < start_offset < len(start_text):
            _, res_right_id = _split_segment_at_offset(conn, chapter_id, start_span_id, start_offset)
            target_start_id = res_right_id

        # 3. Identify all IDs between target_start_id and end_span_id
        cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
        ordered_ids = [row[0] for row in cursor.fetchall()]
        try:
            s_idx = ordered_ids.index(target_start_id)
            e_idx = ordered_ids.index(end_span_id)
            assign_ids = ordered_ids[s_idx : e_idx + 1]
        except ValueError:
            return # Should not happen

    if assign_ids:
        cursor.executemany(
            """
            UPDATE chapter_segments
            SET character_id = ?,
                speaker_profile_name = ?,
                audio_status = 'unprocessed',
                audio_file_path = NULL,
                audio_generated_at = NULL
            WHERE id = ? AND chapter_id = ?
            """,
            [(character_id, speaker_profile_name, sid, chapter_id) for sid in assign_ids]
        )


def _split_segment_at_offset(conn, chapter_id: str, segment_id: str, offset: int) -> tuple[str, str]:
    """Splits a segment into two parts at a character offset. Returns (left_id, right_id)."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, text_content, segment_order, character_id, speaker_profile_name FROM chapter_segments WHERE id = ? AND chapter_id = ?", (segment_id, chapter_id))
    seg = cursor.fetchone()
    if not seg: return segment_id, segment_id

    text = seg["text_content"] or ""
    if offset <= 0 or offset >= len(text):
        return segment_id, segment_id

    left_text = text[:offset]
    right_text = text[offset:]

    right_id = f"split_{uuid.uuid4().hex[:12]}"
    order = seg["segment_order"]

    cursor.execute(
        "UPDATE chapter_segments SET text_content = ?, audio_status = 'unprocessed', audio_file_path = NULL, audio_generated_at = NULL WHERE id = ?",
        (left_text, segment_id)
    )
    cursor.execute(
        "UPDATE chapter_segments SET segment_order = segment_order + 1 WHERE chapter_id = ? AND segment_order > ?",
        (chapter_id, order)
    )
    cursor.execute(
        """
        INSERT INTO chapter_segments (
            id, chapter_id, segment_order, text_content, character_id, 
            speaker_profile_name, audio_status, audio_file_path, audio_generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            right_id, chapter_id, order + 1, right_text, seg["character_id"],
            seg["speaker_profile_name"], "unprocessed", None, None
        )
    )

    return segment_id, right_id


def export_chapter_audio(chapter_id: str, *, format: str) -> tuple[Path, str]:
    """Resolve or build the requested chapter export audio path."""

    with _db_lock:
        with get_connection() as conn:
            chapter_row = _load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

    wav_path = _resolve_canonical_wav_path(chapter_id=chapter_id, chapter_row=chapter_row)
    if wav_path is None:
        raise FileNotFoundError(
            "No canonical WAV exists for this chapter yet. Render the chapter first before exporting audio."
        )

    if format == "wav":
        return wav_path, "audio/wav"

    if format != "mp3":
        raise ValueError(f"Unsupported export format: {format}")

    mp3_path = safe_join_flat(wav_path.parent, f"{wav_path.stem}.mp3")
    if mp3_path.exists():
        return mp3_path, "audio/mpeg"

    temp_mp3_path = mp3_path.with_name(f".{mp3_path.name}.tmp")
    try:
        from app.engines import wav_to_mp3 as legacy_wav_to_mp3

        rc = legacy_wav_to_mp3(wav_path, temp_mp3_path)
        if rc != 0 or not temp_mp3_path.exists():
            raise RuntimeError("Failed to convert WAV to MP3 for export.")
        temp_mp3_path.replace(mp3_path)
        return mp3_path, "audio/mpeg"
    finally:
        if temp_mp3_path.exists():
            try:
                temp_mp3_path.unlink()
            except OSError:
                pass


def _load_chapter_row(conn, chapter_id: str) -> dict[str, Any] | None:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chapters WHERE id = ?", (chapter_id,))
    row = cursor.fetchone()
    return dict(row) if row else None


def _load_segment_rows(conn, chapter_id: str) -> list[dict[str, Any]]:
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            s.*,
            c.speaker_profile_name AS character_speaker_profile_name
        FROM chapter_segments s
        LEFT JOIN characters c ON s.character_id = c.id
        WHERE s.chapter_id = ?
        ORDER BY s.segment_order ASC
        """,
        (chapter_id,),
    )
    return [dict(row) for row in cursor.fetchall()]


def _group_segments_into_blocks(
    *,
    chapter_id: str,
    segment_rows: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    current_rows: list[Mapping[str, Any]] = []
    previous_segment_had_paragraph_break = False

    for segment_row in segment_rows:
        segment_assignment = _segment_assignment(segment_row)
        if current_rows:
            current_assignment = _segment_assignment(current_rows[-1])
            if previous_segment_had_paragraph_break or segment_assignment != current_assignment:
                blocks.append(_build_block(chapter_id=chapter_id, source_rows=current_rows, order_index=len(blocks)))
                current_rows = []

        current_rows.append(segment_row)
        previous_segment_had_paragraph_break = _segment_contains_paragraph_break(segment_row)

    if current_rows:
        blocks.append(_build_block(chapter_id=chapter_id, source_rows=current_rows, order_index=len(blocks)))

    return blocks


def _build_block(
    *,
    chapter_id: str,
    source_rows: Sequence[Mapping[str, Any]],
    order_index: int,
) -> dict[str, Any]:
    source_segment_ids = [str(row["id"]) for row in source_rows]
    text = "".join(str(row.get("text_content") or "") for row in source_rows).rstrip()
    return {
        "id": _stable_block_id(chapter_id=chapter_id, source_segment_ids=source_segment_ids, order_index=order_index),
        "order_index": order_index,
        "text": text,
        "character_id": source_rows[0].get("character_id"),
        "speaker_profile_name": _resolved_speaker_profile_name(source_rows[0]),
        "status": _derive_block_status(source_rows),
        "source_segment_ids": source_segment_ids,
        "estimated_work_weight": max(1, len(source_rows)),
    }


def _derive_render_batches(
    *,
    chapter_id: str,
    blocks: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    batches: list[dict[str, Any]] = []
    current_blocks: list[Mapping[str, Any]] = []
    previous_signature: tuple[Any, Any] | None = None

    for block in blocks:
        signature = (block.get("character_id"), block.get("speaker_profile_name"))
        if current_blocks and signature != previous_signature:
            batches.append(_build_render_batch(chapter_id=chapter_id, blocks=current_blocks, order_index=len(batches)))
            current_blocks = []
        current_blocks.append(block)
        previous_signature = signature

    if current_blocks:
        batches.append(_build_render_batch(chapter_id=chapter_id, blocks=current_blocks, order_index=len(batches)))

    return batches


def _build_render_batch(
    *,
    chapter_id: str,
    blocks: Sequence[Mapping[str, Any]],
    order_index: int,
) -> dict[str, Any]:
    block_ids = [str(block["id"]) for block in blocks]
    status = _aggregate_status(block.get("status") for block in blocks)
    return {
        "id": _stable_batch_id(chapter_id=chapter_id, block_ids=block_ids, order_index=order_index),
        "block_ids": block_ids,
        "status": status,
        "estimated_work_weight": max(1, sum(max(1, int(block.get("estimated_work_weight", 1))) for block in blocks)),
    }


def _aggregate_status(statuses: Sequence[Any]) -> str:
    normalized = [str(status or "draft") for status in statuses]
    if any(status in {"failed", "error"} for status in normalized):
        return "failed"
    if any(status == "rendering" for status in normalized):
        return "rendering"
    if any(status == "queued" for status in normalized):
        return "queued"
    if all(status == "rendered" for status in normalized):
        return "rendered"
    if any(status == "stale" for status in normalized):
        return "stale"
    if any(status == "needs_review" for status in normalized):
        return "needs_review"
    return "draft"


def _derive_block_status(source_rows: Sequence[Mapping[str, Any]]) -> str:
    statuses = [str(row.get("audio_status") or "unprocessed") for row in source_rows]
    if any(status in {"failed", "error"} for status in statuses):
        return "failed"
    if any(status == "processing" for status in statuses):
        return "rendering"
    if any(status in {"queued", "preparing", "finalizing"} for status in statuses):
        return "queued"
    if all(status == "done" for status in statuses):
        return "rendered"
    if any(status == "done" for status in statuses):
        return "stale"
    return "draft"


def _preserve_segment_assignments(
    *,
    cursor,
    chapter_id: str,
    updated_segments: Sequence[Mapping[str, Any]],
    normalized_blocks: Sequence[Mapping[str, Any]],
    existing_blocks: Sequence[Mapping[str, Any]],
) -> None:
    if not updated_segments or not normalized_blocks:
        return

    old_blocks_by_id = {str(block["id"]): block for block in existing_blocks if block.get("id")}
    old_blocks_by_segment_id: dict[str, Mapping[str, Any]] = {}
    for block in existing_blocks:
        for source_segment_id in block.get("source_segment_ids", []):
            old_blocks_by_segment_id[str(source_segment_id)] = block

    segment_index = 0
    updates: list[tuple[str, str | None, str | None]] = []

    for block_index, block in enumerate(normalized_blocks):
        if segment_index >= len(updated_segments):
            break

        fallback_block = _fallback_block_for_update(
            block=block,
            block_index=block_index,
            old_blocks_by_id=old_blocks_by_id,
            old_blocks_by_segment_id=old_blocks_by_segment_id,
            existing_blocks=existing_blocks,
        )
        character_id = _clean_optional_text(block.get("character_id"))
        speaker_profile_name = _clean_optional_text(block.get("speaker_profile_name"))
        if character_id is None and fallback_block is not None:
            character_id = _clean_optional_text(fallback_block.get("character_id"))
        if speaker_profile_name is None and fallback_block is not None:
            speaker_profile_name = _clean_optional_text(fallback_block.get("speaker_profile_name"))

        if block_index == len(normalized_blocks) - 1:
            block_segments = list(updated_segments[segment_index:])
        else:
            expected_count = max(1, len(list(split_sentences(block["text"], preserve_gap=True))))
            block_segments = list(updated_segments[segment_index : segment_index + expected_count])
            segment_index += expected_count

        for segment_row in block_segments:
            updates.append((str(segment_row["id"]), character_id, speaker_profile_name))

    if not updates:
        return

    cursor.executemany(
        """
        UPDATE chapter_segments
        SET character_id = ?, speaker_profile_name = ?
        WHERE id = ? AND chapter_id = ?
        """,
        [(character_id, speaker_profile_name, segment_id, chapter_id) for segment_id, character_id, speaker_profile_name in updates],
    )


def _fallback_block_for_update(
    *,
    block: Mapping[str, Any],
    block_index: int,
    old_blocks_by_id: Mapping[str, Mapping[str, Any]],
    old_blocks_by_segment_id: Mapping[str, Mapping[str, Any]],
    existing_blocks: Sequence[Mapping[str, Any]],
) -> Mapping[str, Any] | None:
    block_id = _clean_optional_text(block.get("id"))
    if block_id and block_id in old_blocks_by_id:
        return old_blocks_by_id[block_id]

    for source_segment_id in block.get("source_segment_ids", []):
        existing = old_blocks_by_segment_id.get(str(source_segment_id))
        if existing is not None:
            return existing

    return None

def _resolve_engine_from_profile(profile_name: str | None) -> str:
    """Resolve the engine ID for a given speaker profile name."""
    from app.jobs.speaker import get_speaker_settings
    try:
        settings = get_speaker_settings(profile_name or "")
        engine = str(settings.get("engine") or "").strip().lower()
        return engine or "unknown"
    except Exception:
        return "unknown"


def _normalize_block_payload(block: Mapping[str, Any], *, order_index: int) -> dict[str, Any]:
    text = str(block.get("text") or "")
    source_segment_ids = [str(segment_id) for segment_id in block.get("source_segment_ids", []) if str(segment_id)]
    return {
        "id": _clean_optional_text(block.get("id")) or _stable_block_id(
            chapter_id="draft",
            source_segment_ids=source_segment_ids or [f"block-{order_index + 1}"],
            order_index=order_index,
        ),
        "order_index": order_index,
        "text": text.strip(),
        "character_id": _clean_optional_text(block.get("character_id")),
        "speaker_profile_name": _clean_optional_text(block.get("speaker_profile_name")),
        "status": str(block.get("status") or "draft"),
        "source_segment_ids": source_segment_ids,
    }


def _reconstruct_raw_text(blocks: Sequence[Mapping[str, Any]]) -> str:
    texts = [str(block.get("text") or "").strip() for block in blocks if str(block.get("text") or "").strip()]
    return "\n\n".join(texts)


def _segment_assignment(segment_row: Mapping[str, Any]) -> tuple[str | None, str | None]:
    return (
        _clean_optional_text(segment_row.get("character_id")),
        _resolved_speaker_profile_name(segment_row),
    )


def _resolved_speaker_profile_name(segment_row: Mapping[str, Any]) -> str | None:
    return _clean_optional_text(segment_row.get("speaker_profile_name")) or _clean_optional_text(
        segment_row.get("character_speaker_profile_name")
    )


def _segment_contains_paragraph_break(segment_row: Mapping[str, Any]) -> bool:
    text = str(segment_row.get("text_content") or "")
    return bool(re.search(r"[\r\n]", text))


def _stable_block_id(*, chapter_id: str, source_segment_ids: Sequence[str], order_index: int) -> str:
    payload = {
        "chapter_id": chapter_id,
        "source_segment_ids": list(source_segment_ids),
        "order_index": order_index,
    }
    digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()
    return f"block_{digest[:12]}"


def _stable_batch_id(*, chapter_id: str, block_ids: Sequence[str], order_index: int) -> str:
    payload = {
        "chapter_id": chapter_id,
        "block_ids": list(block_ids),
        "order_index": order_index,
    }
    digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()
    return f"batch_{digest[:12]}"


def _build_base_revision_id(chapter_row: Mapping[str, Any], segment_rows: Sequence[Mapping[str, Any]]) -> str:
    payload = {
        "chapter_id": chapter_row.get("id"),
        "text_content": chapter_row.get("text_content"),
        "text_last_modified": chapter_row.get("text_last_modified"),
        "segments": [
            {
                "id": row.get("id"),
                "segment_order": row.get("segment_order"),
                "text_content": row.get("text_content"),
                "character_id": row.get("character_id"),
                "speaker_profile_name": _resolved_speaker_profile_name(row),
                "audio_status": row.get("audio_status"),
            }
            for row in segment_rows
        ],
    }
    digest = sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")).hexdigest()
    return f"rev_{digest[:16]}"


def _clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _resolve_canonical_wav_path(*, chapter_id: str, chapter_row: Mapping[str, Any]) -> Path | None:
    from app import config

    project_id = _clean_optional_text(chapter_row.get("project_id"))
    audio_file_path = _clean_optional_text(chapter_row.get("audio_file_path"))

    # 1. Try resolution helper with explicit path
    resolved = config.resolve_chapter_asset_path(
        project_id, chapter_id, "audio", filename=audio_file_path
    )
    if resolved and resolved.suffix.lower() == ".wav":
        return resolved

    # 2. Try resolution helper with standard names
    resolved = config.resolve_chapter_asset_path(project_id, chapter_id, "audio")
    if resolved and resolved.suffix.lower() == ".wav":
        return resolved

    # 3. Fallback to legacy _0.wav pattern if not handled by standard resolution
    audio_dir = (
        find_existing_project_subdir(project_id, "audio") if project_id else XTTS_OUT_DIR
    )
    if audio_dir and audio_dir.exists():
        for candidate in (
            f"{chapter_id}.wav",
            f"{chapter_id}_0.wav",
            "chapter.wav",
        ):
            try:
                legacy_path = safe_join_flat(audio_dir, candidate)
                if legacy_path.exists():
                    return legacy_path
            except ValueError:
                continue

    return None
