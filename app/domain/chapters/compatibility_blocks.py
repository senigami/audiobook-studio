import logging
from collections.abc import Mapping, Sequence
from typing import Any

from app.textops import split_sentences
from . import compatibility_helpers as helpers

logger = logging.getLogger(__name__)

def _group_segments_into_blocks(
    *,
    chapter_id: str,
    segment_rows: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    current_rows: list[Mapping[str, Any]] = []
    previous_segment_had_paragraph_break = False

    for segment_row in segment_rows:
        segment_assignment = helpers._segment_assignment(segment_row)
        if current_rows:
            current_assignment = helpers._segment_assignment(current_rows[-1])
            if previous_segment_had_paragraph_break or segment_assignment != current_assignment:
                blocks.append(_build_block(chapter_id=chapter_id, source_rows=current_rows, order_index=len(blocks)))
                current_rows = []

        current_rows.append(segment_row)
        previous_segment_had_paragraph_break = helpers._segment_contains_paragraph_break(segment_row)

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
        "id": helpers._stable_block_id(chapter_id=chapter_id, source_segment_ids=source_segment_ids, order_index=order_index),
        "order_index": order_index,
        "text": text,
        "character_id": source_rows[0].get("character_id"),
        "speaker_profile_name": helpers._resolved_speaker_profile_name(source_rows[0]),
        "status": helpers._derive_block_status(source_rows),
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
    status = helpers._aggregate_status(block.get("status") for block in blocks)
    return {
        "id": helpers._stable_batch_id(chapter_id=chapter_id, block_ids=block_ids, order_index=order_index),
        "block_ids": block_ids,
        "status": status,
        "estimated_work_weight": max(1, sum(max(1, int(block.get("estimated_work_weight", 1))) for block in blocks)),
    }


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
        character_id = helpers._clean_optional_text(block.get("character_id"))
        speaker_profile_name = helpers._clean_optional_text(block.get("speaker_profile_name"))
        if character_id is None and fallback_block is not None:
            character_id = helpers._clean_optional_text(fallback_block.get("character_id"))
        if speaker_profile_name is None and fallback_block is not None:
            speaker_profile_name = helpers._clean_optional_text(fallback_block.get("speaker_profile_name"))

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
    block_id = helpers._clean_optional_text(block.get("id"))
    if block_id and block_id in old_blocks_by_id:
        return old_blocks_by_id[block_id]

    for source_segment_id in block.get("source_segment_ids", []):
        existing = old_blocks_by_segment_id.get(str(source_segment_id))
        if existing is not None:
            return existing

    return None
