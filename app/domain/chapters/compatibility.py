"""Compatibility helpers for the Phase 7 production-block bridge."""

from __future__ import annotations

import json
import re
import time
from collections.abc import Mapping, Sequence
from hashlib import sha256
from pathlib import Path
from typing import Any

from app.config import XTTS_OUT_DIR, find_existing_project_subdir
from app.db.core import _db_lock, get_connection
from app.db.segments import sync_chapter_segments
from app.pathing import safe_basename, safe_join_flat
from app.textops import compute_chapter_metrics, split_sentences


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

    if block_index < len(existing_blocks):
        return existing_blocks[block_index]

    return None


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
    project_id = _clean_optional_text(chapter_row.get("project_id"))
    audio_dir = find_existing_project_subdir(project_id, "audio") if project_id else XTTS_OUT_DIR
    if not audio_dir or not audio_dir.exists():
        return None

    audio_files = {
        entry.name: entry.resolve()
        for entry in audio_dir.iterdir()
        if entry.is_file() and entry.suffix.lower() in {".wav", ".mp3", ".m4a"}
    }

    candidates: list[str] = []
    audio_file_path = _clean_optional_text(chapter_row.get("audio_file_path"))
    if audio_file_path:
        safe_name = safe_basename(audio_file_path)
        if safe_name.lower().endswith(".wav"):
            candidates.append(safe_name)
    candidates.extend([f"{chapter_id}.wav", f"{chapter_id}_0.wav"])

    for candidate in candidates:
        path = audio_files.get(candidate)
        if path and path.suffix.lower() == ".wav":
            return path

    return None
