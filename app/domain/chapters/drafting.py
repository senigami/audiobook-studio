"""Chapter draft helpers."""

from __future__ import annotations

from collections.abc import Sequence
import json
from hashlib import sha256

from .models import ChapterDraftModel, ProductionBlockModel
from .segmentation import segment_chapter_text


def normalize_chapter_draft(
    *,
    chapter_id: str,
    raw_text: str,
    existing_blocks: Sequence[ProductionBlockModel] | None = None,
    revision_id: str | None = None,
) -> ChapterDraftModel:
    """Normalize chapter text into stable editorial blocks."""

    candidate_blocks = segment_chapter_text(
        chapter_id=chapter_id,
        raw_text=raw_text,
        prior_blocks=existing_blocks,
    )
    merged_blocks = _merge_existing_block_metadata(
        candidate_blocks=candidate_blocks,
        existing_blocks=existing_blocks or [],
    )
    stabilized_blocks = _stabilize_block_keys(
        chapter_id=chapter_id,
        blocks=merged_blocks,
        revision_id=revision_id,
    )
    return ChapterDraftModel(
        chapter_id=chapter_id,
        revision_id=revision_id or _build_revision_id(chapter_id=chapter_id, blocks=stabilized_blocks),
        blocks=stabilized_blocks,
    )


def _split_text_into_candidate_blocks(*, raw_text: str) -> list[ProductionBlockModel]:
    """Split raw chapter text into candidate editorial blocks."""

    return segment_chapter_text(chapter_id="", raw_text=raw_text, prior_blocks=None)


def _merge_existing_block_metadata(
    *,
    candidate_blocks: Sequence[ProductionBlockModel],
    existing_blocks: Sequence[ProductionBlockModel],
) -> list[ProductionBlockModel]:
    """Carry forward block metadata when edits preserve semantic identity."""

    merged: list[ProductionBlockModel] = []
    by_text = {block.stable_text: block for block in existing_blocks}
    for block in candidate_blocks:
        existing = by_text.get(block.stable_text)
        if existing is None:
            merged.append(block)
            continue
        merged.append(
            ProductionBlockModel(
                id=existing.id,
                chapter_id=existing.chapter_id,
                order_index=block.order_index,
                stable_key=existing.stable_key,
                text=block.text,
                normalized_text=existing.normalized_text or block.normalized_text,
                character_id=existing.character_id,
                voice_assignment_id=existing.voice_assignment_id,
                render_revision_hash=existing.render_revision_hash,
                last_rendered_artifact_id=existing.last_rendered_artifact_id,
                status=existing.status,
                last_error=existing.last_error,
                resolved_engine_id=existing.resolved_engine_id,
                resolved_engine_version=existing.resolved_engine_version,
                synthesis_settings=existing.synthesis_settings,
                normalization_settings=existing.normalization_settings,
                post_processing_settings=existing.post_processing_settings,
                estimated_work_weight=existing.estimated_work_weight,
            )
        )
    return merged


def _stabilize_block_keys(
    *,
    chapter_id: str,
    blocks: Sequence[ProductionBlockModel],
    revision_id: str | None,
) -> list[ProductionBlockModel]:
    """Assign or preserve stable keys so block identity survives edits."""

    stabilized: list[ProductionBlockModel] = []
    for index, block in enumerate(blocks):
        stable_key = block.stable_key or f"{chapter_id}_block_{index + 1}"
        block_id = block.id or f"{chapter_id}_{stable_key}"
        revision_payload = {
            "chapter_id": chapter_id,
            "revision_id": revision_id,
            "stable_key": stable_key,
            "text": block.stable_text,
            "voice_assignment_id": block.voice_assignment_id,
            "engine_id": block.resolved_engine_id,
            "engine_version": block.resolved_engine_version,
            "synthesis_settings": block.synthesis_settings,
            "normalization_settings": block.normalization_settings,
            "post_processing_settings": block.post_processing_settings,
        }
        stabilized.append(
            ProductionBlockModel(
                id=block_id,
                chapter_id=chapter_id,
                order_index=index,
                stable_key=stable_key,
                text=block.text,
                normalized_text=block.normalized_text or block.text,
                character_id=block.character_id,
                voice_assignment_id=block.voice_assignment_id,
                render_revision_hash="sha256:" + sha256(
                    json.dumps(revision_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode(
                        "utf-8"
                    )
                ).hexdigest(),
                last_rendered_artifact_id=block.last_rendered_artifact_id,
                status=block.status,
                last_error=block.last_error,
                resolved_engine_id=block.resolved_engine_id,
                resolved_engine_version=block.resolved_engine_version,
                synthesis_settings=block.synthesis_settings,
                normalization_settings=block.normalization_settings,
                post_processing_settings=block.post_processing_settings,
                estimated_work_weight=block.estimated_work_weight,
            )
        )
    return stabilized


def _build_revision_id(*, chapter_id: str, blocks: Sequence[ProductionBlockModel]) -> str:
    payload = {
        "chapter_id": chapter_id,
        "blocks": [block.render_revision_hash or block.stable_text for block in blocks],
    }
    return "rev_" + sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()[:16]
