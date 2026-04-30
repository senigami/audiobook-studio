"""Chapter segmentation helpers."""

from __future__ import annotations

from collections.abc import Sequence

from .models import ProductionBlockModel


def segment_chapter_text(
    *,
    chapter_id: str,
    raw_text: str,
    prior_blocks: Sequence[ProductionBlockModel] | None = None,
) -> list[ProductionBlockModel]:
    """Segment raw chapter text into editorial blocks."""

    candidate_blocks = _split_text_by_editorial_rules(raw_text=raw_text)
    reconciled = _reconcile_segment_identity(chapter_id=chapter_id, prior_blocks=candidate_blocks)
    if prior_blocks is None:
        return reconciled
    return _merge_with_prior_blocks(chapter_id=chapter_id, candidate_blocks=reconciled, prior_blocks=prior_blocks)


def _split_text_by_editorial_rules(*, raw_text: str) -> list[ProductionBlockModel]:
    """Split chapter text on blank lines into ordered blocks."""

    blocks: list[ProductionBlockModel] = []
    chunks = [chunk.strip() for chunk in raw_text.replace("\r\n", "\n").split("\n\n") if chunk.strip()]
    if not chunks and raw_text.strip():
        chunks = [raw_text.strip()]
    for index, chunk in enumerate(chunks):
        blocks.append(
            ProductionBlockModel(
                id=f"segment_{index + 1}",
                chapter_id="",
                order_index=index,
                stable_key=f"segment_{index + 1}",
                text=chunk,
                normalized_text=chunk,
            )
        )
    return blocks


def _reconcile_segment_identity(
    *,
    chapter_id: str,
    prior_blocks: Sequence[ProductionBlockModel],
) -> list[ProductionBlockModel]:
    """Attach chapter ownership and preserve identity for segmented blocks."""

    reconciled: list[ProductionBlockModel] = []
    for index, block in enumerate(prior_blocks):
        reconciled.append(
            ProductionBlockModel(
                id=block.id or f"{chapter_id}_block_{index + 1}",
                chapter_id=chapter_id,
                order_index=block.order_index if block.order_index is not None else index,
                stable_key=block.stable_key or f"{chapter_id}_block_{index + 1}",
                text=block.text,
                normalized_text=block.normalized_text or block.text,
                character_id=block.character_id,
                voice_assignment_id=block.voice_assignment_id,
                render_revision_hash=block.render_revision_hash,
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
    return reconciled


def _merge_with_prior_blocks(
    *,
    chapter_id: str,
    candidate_blocks: Sequence[ProductionBlockModel],
    prior_blocks: Sequence[ProductionBlockModel],
) -> list[ProductionBlockModel]:
    """Carry forward prior metadata when the current text still aligns."""

    prior_by_text = {block.stable_text: block for block in prior_blocks}
    merged: list[ProductionBlockModel] = []
    for index, block in enumerate(candidate_blocks):
        prior = prior_by_text.get(block.stable_text)
        if prior is None:
            merged.append(block)
            continue
        merged.append(
            ProductionBlockModel(
                id=prior.id,
                chapter_id=chapter_id,
                order_index=index,
                stable_key=prior.stable_key or block.stable_key,
                text=block.text,
                normalized_text=prior.normalized_text or block.normalized_text,
                character_id=prior.character_id,
                voice_assignment_id=prior.voice_assignment_id,
                render_revision_hash=prior.render_revision_hash,
                last_rendered_artifact_id=prior.last_rendered_artifact_id,
                status=prior.status,
                last_error=prior.last_error,
                resolved_engine_id=prior.resolved_engine_id,
                resolved_engine_version=prior.resolved_engine_version,
                synthesis_settings=prior.synthesis_settings,
                normalization_settings=prior.normalization_settings,
                post_processing_settings=prior.post_processing_settings,
                estimated_work_weight=prior.estimated_work_weight,
            )
        )
    return merged
