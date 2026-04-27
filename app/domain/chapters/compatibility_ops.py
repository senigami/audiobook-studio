import time
import uuid
from collections.abc import Mapping, Sequence
from typing import Any

from app.db.core import _db_lock, get_connection
from app.db.segments import sync_chapter_segments
from app.textops import compute_chapter_metrics
from . import compatibility_helpers as helpers
from . import compatibility_blocks as blocks_module

def get_production_blocks_payload(chapter_id: str) -> dict[str, Any]:
    """Build the compatibility production-block payload for a chapter."""
    with _db_lock:
        with get_connection() as conn:
            chapter_row = helpers._load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")
            segment_rows = helpers._load_segment_rows(conn, chapter_id)

    block_list = blocks_module._group_segments_into_blocks(chapter_id=chapter_id, segment_rows=segment_rows)
    render_batches = blocks_module._derive_render_batches(chapter_id=chapter_id, blocks=block_list)
    return {
        "chapter_id": chapter_id,
        "base_revision_id": helpers._build_base_revision_id(chapter_row, segment_rows),
        "blocks": block_list,
        "render_batches": render_batches,
    }


def get_script_view_payload(chapter_id: str) -> dict[str, Any]:
    """Build the Phase 7 Script View read model payload for a chapter."""
    from app.textops import sanitize_for_xtts
    from . import compatibility as compatibility_facade

    with _db_lock:
        with get_connection() as conn:
            chapter_row = helpers._load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")
            segment_rows = helpers._load_segment_rows(conn, chapter_id)

    spans = []
    paragraphs = []
    current_paragraph_span_ids = []

    for index, row in enumerate(segment_rows):
        text = str(row.get("text_content") or "")
        sanitized = helpers._clean_optional_text(row.get("sanitized_text"))
        if sanitized is None:
            sanitized = sanitize_for_xtts(text)

        span_id = str(row["id"])
        span_payload = {
            "id": span_id,
            "paragraph_id": f"p_{span_id}",  # Placeholder
            "order_index": row.get("segment_order", index),
            "text": text,
            "sanitized_text": sanitized,
            "character_id": helpers._clean_optional_text(row.get("character_id")),
            "speaker_profile_name": helpers._resolved_speaker_profile_name(row),
            "status": helpers._normalize_segment_status(row.get("audio_status")),
            "audio_file_path": helpers._clean_optional_text(row.get("audio_file_path")),
            "audio_generated_at": row.get("audio_generated_at"),
            "char_count": len(text),
            "sanitized_char_count": len(sanitized),
        }
        spans.append(span_payload)
        current_paragraph_span_ids.append(span_id)

        if helpers._segment_contains_paragraph_break(row):
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
            eid = helpers._resolve_engine_from_profile(span["speaker_profile_name"])
            try:
                plan = bridge.get_synthesis_plan({"engine_id": eid})
                chunk_cache[sig] = plan.chunk_size or compatibility_facade.SENT_CHAR_LIMIT
            except Exception:
                chunk_cache[sig] = compatibility_facade.SENT_CHAR_LIMIT

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
        "base_revision_id": helpers._build_base_revision_id(chapter_row, segment_rows),
        "paragraphs": paragraphs,
        "spans": spans,
        "render_batches": render_batches,
    }


def _build_script_batch(
    *, chapter_id: str, spans: Sequence[Mapping[str, Any]], order_index: int
) -> dict[str, Any]:
    span_ids = [str(span["id"]) for span in spans]
    status = helpers._aggregate_status([span.get("status") for span in spans])
    return {
        "id": helpers._stable_batch_id(chapter_id=chapter_id, block_ids=span_ids, order_index=order_index),
        "span_ids": span_ids,
        "status": status,
        "estimated_work_weight": max(1, len(spans)),
    }


def save_production_blocks_payload(
    chapter_id: str,
    *,
    blocks_payload: Sequence[Mapping[str, Any]] | None = None,
    blocks: Sequence[Mapping[str, Any]] | None = None,
    base_revision_id: str | None = None,
) -> dict[str, Any]:
    """Persist editable production blocks through the compatibility bridge."""
    if blocks_payload is None:
        if blocks is None:
            raise TypeError("save_production_blocks_payload() missing required keyword-only argument: 'blocks'")
        blocks_payload = blocks
    elif blocks is not None:
        raise TypeError("save_production_blocks_payload() received both 'blocks_payload' and 'blocks'")

    normalized_blocks = [helpers._normalize_block_payload(block, order_index=index) for index, block in enumerate(blocks_payload)]
    raw_text = helpers._reconstruct_raw_text(normalized_blocks)

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            chapter_row = helpers._load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

            current_segments = helpers._load_segment_rows(conn, chapter_id)
            current_base_revision_id = helpers._build_base_revision_id(chapter_row, current_segments)
            if base_revision_id and base_revision_id != current_base_revision_id:
                raise helpers.CompatibilityRevisionMismatch(current_base_revision_id, base_revision_id)

            existing_blocks = blocks_module._group_segments_into_blocks(chapter_id=chapter_id, segment_rows=current_segments)
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

            updated_segments = helpers._load_segment_rows(conn, chapter_id)
            blocks_module._preserve_segment_assignments(
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
            chapter_row = helpers._load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

            current_segments = helpers._load_segment_rows(conn, chapter_id)
            current_base_revision_id = helpers._build_base_revision_id(chapter_row, current_segments)
            if base_revision_id and base_revision_id != current_base_revision_id:
                raise helpers.CompatibilityRevisionMismatch(current_base_revision_id, base_revision_id)

            for range_req in (range_assignments or []):
                _apply_range_assignment(conn, chapter_id, range_req)

            flat_assignments: list[tuple[str | None, str | None, str]] = []
            for entry in assignments:
                char_id = helpers._clean_optional_text(entry.get("character_id"))
                prof_name = helpers._clean_optional_text(entry.get("speaker_profile_name"))
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

    with get_connection() as conn:
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

    preserved_indices = set()

    for i, sent in enumerate(new_sentences):
        if i < len(existing) and (existing[i].get("text_content") or "").strip() == sent.strip():
            preserved_indices.add(i)
            if existing[i].get("character_id"):
                preserved_count += 1

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
            chapter_row = helpers._load_chapter_row(conn, chapter_id)
            if chapter_row is None:
                raise KeyError(f"Chapter not found: {chapter_id}")

            current_segments = helpers._load_segment_rows(conn, chapter_id)
            current_base_revision_id = helpers._build_base_revision_id(chapter_row, current_segments)
            if base_revision_id and base_revision_id != current_base_revision_id:
                raise helpers.CompatibilityRevisionMismatch(current_base_revision_id, base_revision_id)

            if not current_segments:
                return get_script_view_payload(chapter_id)

            segments = [dict(s) for s in current_segments]
            i = 0
            merged_any = False
            while i < len(segments) - 1:
                s1 = segments[i]
                s2 = segments[i + 1]

                char1 = helpers._clean_optional_text(s1.get("character_id"))
                char2 = helpers._clean_optional_text(s2.get("character_id"))
                prof1 = helpers._resolved_speaker_profile_name(s1)
                prof2 = helpers._resolved_speaker_profile_name(s2)

                is_compatible = (char1 == char2 and prof1 == prof2)
                if is_compatible and helpers._segment_contains_paragraph_break(s1):
                    is_compatible = False

                if is_compatible:
                    new_text = (s1.get("text_content") or "") + (s2.get("text_content") or "")
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
                    cursor.execute("DELETE FROM chapter_segments WHERE id = ?", (s2["id"],))
                    cursor.execute(
                        "UPDATE chapter_segments SET segment_order = segment_order - 1 WHERE chapter_id = ? AND segment_order > ?",
                        (chapter_id, s2["segment_order"])
                    )
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
    character_id = helpers._clean_optional_text(range_req.get("character_id"))
    speaker_profile_name = helpers._clean_optional_text(range_req.get("speaker_profile_name"))

    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
    initial_ids = [row[0] for row in cursor.fetchall()]

    try:
        start_idx = initial_ids.index(start_span_id)
        end_idx = initial_ids.index(end_span_id)
    except ValueError:
        return

    if start_idx > end_idx:
        return

    assign_ids = []

    if start_span_id == end_span_id:
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (start_span_id,))
        row = cursor.fetchone()
        if not row: return
        text = row["text_content"] or ""

        left_id = start_span_id
        if 0 < end_offset < len(text):
            _split_segment_at_offset(conn, chapter_id, left_id, end_offset)

        if 0 < start_offset < len(text):
            _, mid_id = _split_segment_at_offset(conn, chapter_id, left_id, start_offset)
            assign_ids = [mid_id]
        else:
            assign_ids = [left_id]
    else:
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (end_span_id,))
        row = cursor.fetchone()
        end_text = row["text_content"] if row else ""
        if 0 < end_offset < len(end_text):
            _split_segment_at_offset(conn, chapter_id, end_span_id, end_offset)

        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (start_span_id,))
        row = cursor.fetchone()
        start_text = row["text_content"] if row else ""
        target_start_id = start_span_id
        if 0 < start_offset < len(start_text):
            _, res_right_id = _split_segment_at_offset(conn, chapter_id, start_span_id, start_offset)
            target_start_id = res_right_id

        cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
        ordered_ids = [row[0] for row in cursor.fetchall()]
        try:
            s_idx = ordered_ids.index(target_start_id)
            e_idx = ordered_ids.index(end_span_id)
            assign_ids = ordered_ids[s_idx : e_idx + 1]
        except ValueError:
            return

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
