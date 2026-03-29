import re
from typing import Iterable, Optional

from .db.core import get_connection
from .voice_engines import resolve_profile_engine

CHUNK_CHAR_LIMIT = 500


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


def build_chunk_groups(segments: list[dict], default_profile: str | None) -> list[dict]:
    groups: list[dict] = []

    for segment in segments:
        text = (segment.get("text_content") or "").strip()
        if not text:
            continue

        profile_name = resolve_segment_profile_name(segment, default_profile)
        engine = resolve_profile_engine(profile_name, "xtts")
        text_length = len(text)

        last_group = groups[-1] if groups else None
        if (
            last_group
            and last_group["character_id"] == segment.get("character_id")
            and last_group["profile_name"] == profile_name
            and last_group["engine"] == engine
            and (last_group["text_length"] + text_length + 1) <= CHUNK_CHAR_LIMIT
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


def get_chunk_group_indexes_for_segment_ids(
    chapter_id: str,
    segment_ids: Iterable[str],
    default_profile: Optional[str] = None,
) -> list[int]:
    target_ids = {segment_id for segment_id in segment_ids if segment_id}
    if not target_ids:
        return []

    groups = build_chunk_groups(load_chunk_segments(chapter_id), default_profile)
    indexes: list[int] = []
    for group_index, group in enumerate(groups, start=1):
        if any(segment["id"] in target_ids for segment in group["segments"]):
            indexes.append(group_index)
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
