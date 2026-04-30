"""Render-batch derivation helpers."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from typing import Any

from .models import ChapterModel, ProductionBlockModel, RenderBatchModel

MAX_BATCH_BLOCKS = 8
MAX_BATCH_CHARACTERS = 2400
MAX_BATCH_WEIGHT = 12


def derive_render_batches(
    *,
    chapter: ChapterModel,
    blocks: Sequence[ProductionBlockModel],
    block_ids: Sequence[str] | None = None,
) -> list[RenderBatchModel]:
    """Group editorial blocks into execution batches for synthesis."""

    eligible_blocks = _select_batch_candidate_blocks(blocks=blocks, block_ids=block_ids)
    grouped_blocks = _group_blocks_by_voice_and_engine(blocks=eligible_blocks)
    return _split_groups_by_limits(chapter=chapter, grouped_blocks=grouped_blocks)


def compute_block_text_hash(block: ProductionBlockModel) -> str:
    """Build the stable text hash that feeds revision validation."""

    return _sha256_text(block.stable_text)


def compute_block_revision_hash(block: ProductionBlockModel) -> str:
    """Build the render revision hash for a production block.

    The hash changes when the normalized text, voice assignment, engine
    selection, or synthesis-affecting settings change.
    """

    payload = {
        "text_hash": compute_block_text_hash(block),
        "stable_key": block.stable_key,
        "character_id": block.character_id,
        "voice_assignment_id": block.voice_assignment_id,
        "resolved_engine_id": block.resolved_engine_id,
        "resolved_engine_version": block.resolved_engine_version,
        "synthesis_settings": block.synthesis_settings,
        "normalization_settings": block.normalization_settings,
        "post_processing_settings": block.post_processing_settings,
    }
    return _sha256_json(payload)


def _select_batch_candidate_blocks(
    *,
    blocks: Sequence[ProductionBlockModel],
    block_ids: Sequence[str] | None,
) -> list[ProductionBlockModel]:
    if block_ids is None:
        candidates = list(blocks)
    else:
        wanted = set(block_ids)
        candidates = [block for block in blocks if block.id in wanted]
        missing = wanted.difference({block.id for block in candidates})
        if missing:
            raise ValueError(f"Unknown block ids requested for batching: {sorted(missing)}")
    return sorted(candidates, key=lambda block: (block.order_index, block.id))


def _group_blocks_by_voice_and_engine(
    *, blocks: Sequence[ProductionBlockModel]
) -> list[list[ProductionBlockModel]]:
    groups: list[list[ProductionBlockModel]] = []
    current_group: list[ProductionBlockModel] = []
    previous_signature: tuple[Any, ...] | None = None

    for block in blocks:
        signature = _block_compatibility_signature(block)
        if current_group and signature != previous_signature:
            groups.append(current_group)
            current_group = []
        current_group.append(block)
        previous_signature = signature

    if current_group:
        groups.append(current_group)

    return groups


def _split_groups_by_limits(
    *,
    chapter: ChapterModel,
    grouped_blocks: Sequence[Sequence[ProductionBlockModel]],
) -> list[RenderBatchModel]:
    batches: list[RenderBatchModel] = []
    for group in grouped_blocks:
        chunk: list[ProductionBlockModel] = []
        chunk_weight = 0
        chunk_characters = 0
        for block in group:
            block_weight = max(1, block.estimated_work_weight)
            block_characters = len(block.stable_text)
            if chunk and (
                len(chunk) >= MAX_BATCH_BLOCKS
                or chunk_weight + block_weight > MAX_BATCH_WEIGHT
                or chunk_characters + block_characters > MAX_BATCH_CHARACTERS
            ):
                batches.append(_build_render_batch(chapter=chapter, blocks=chunk))
                chunk = []
                chunk_weight = 0
                chunk_characters = 0
            chunk.append(block)
            chunk_weight += block_weight
            chunk_characters += block_characters
        if chunk:
            batches.append(_build_render_batch(chapter=chapter, blocks=chunk))
    return batches


def _build_render_batch(
    *, chapter: ChapterModel, blocks: Sequence[ProductionBlockModel]
) -> RenderBatchModel:
    batch_signature = {
        "chapter_id": chapter.id,
        "block_ids": [block.id for block in blocks],
        "block_revision_hashes": [compute_block_revision_hash(block) for block in blocks],
        "compatibility": _block_compatibility_signature(blocks[0]) if blocks else None,
    }
    stable_batch_key = _sha256_json(batch_signature)
    return RenderBatchModel(
        id=f"batch_{stable_batch_key[7:19]}",
        chapter_id=chapter.id,
        block_ids=[block.id for block in blocks],
        stable_batch_key=stable_batch_key,
        resolved_engine_id=blocks[0].resolved_engine_id if blocks else None,
        resolved_engine_version=blocks[0].resolved_engine_version if blocks else None,
        resolved_voice_assignment_id=blocks[0].voice_assignment_id if blocks else None,
        batch_revision_hash=_sha256_json(
            {
                "chapter_id": chapter.id,
                "stable_batch_key": stable_batch_key,
                "block_revision_hashes": [compute_block_revision_hash(block) for block in blocks],
                "compatibility": _block_compatibility_signature(blocks[0]) if blocks else None,
            }
        ),
        estimated_work_weight=sum(max(1, block.estimated_work_weight) for block in blocks),
        status="ready",
        synthesis_settings=blocks[0].synthesis_settings if blocks else {},
        normalization_settings=blocks[0].normalization_settings if blocks else {},
        post_processing_settings=blocks[0].post_processing_settings if blocks else {},
    )


def _block_compatibility_signature(block: ProductionBlockModel) -> tuple[Any, ...]:
    return (
        block.resolved_engine_id,
        block.resolved_engine_version,
        block.voice_assignment_id,
        block.character_id,
        _sha256_json(block.synthesis_settings),
        _sha256_json(block.normalization_settings),
        _sha256_json(block.post_processing_settings),
    )


def _sha256_text(value: str) -> str:
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def _sha256_json(payload: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()
