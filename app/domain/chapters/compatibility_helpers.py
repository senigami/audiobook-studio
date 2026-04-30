from __future__ import annotations
import json
import re
from collections.abc import Sequence
from hashlib import sha256
from typing import Any
from pathlib import Path

from app.db.core import get_connection
from app.textops import SENT_CHAR_LIMIT

class CompatibilityRevisionMismatch(Exception):
    """Raised when the caller saves against a stale chapter revision."""

    def __init__(self, expected_revision_id: str, actual_revision_id: str):
        super().__init__(
            f"Base revision mismatch: expected {expected_revision_id}, got {actual_revision_id}"
        )
        self.expected_revision_id = expected_revision_id
        self.actual_revision_id = actual_revision_id


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


def _derive_block_status(source_rows: Sequence[dict[str, Any]]) -> str:
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


def _clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _resolved_speaker_profile_name(segment_row: dict[str, Any]) -> str | None:
    return _clean_optional_text(segment_row.get("speaker_profile_name")) or _clean_optional_text(
        segment_row.get("character_speaker_profile_name")
    )


def _segment_assignment(segment_row: dict[str, Any]) -> tuple[str | None, str | None]:
    return (
        _clean_optional_text(segment_row.get("character_id")),
        _resolved_speaker_profile_name(segment_row),
    )


def _segment_contains_paragraph_break(segment_row: dict[str, Any]) -> bool:
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


def _build_base_revision_id(chapter_row: dict[str, Any], segment_rows: Sequence[dict[str, Any]]) -> str:
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


def _resolve_engine_from_profile(profile_name: str | None) -> str:
    """Resolve the engine ID for a given speaker profile name."""
    from app.jobs.speaker import get_speaker_settings
    try:
        settings = get_speaker_settings(profile_name or "")
        engine = str(settings.get("engine") or "").strip().lower()
        return engine or "unknown"
    except Exception:
        return "unknown"


def _normalize_block_payload(block: dict[str, Any], *, order_index: int) -> dict[str, Any]:
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


def _reconstruct_raw_text(blocks: Sequence[dict[str, Any]]) -> str:
    texts = [str(block.get("text") or "").strip() for block in blocks if str(block.get("text") or "").strip()]
    return "\n\n".join(texts)
