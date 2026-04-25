"""Project export helpers.

This module will own export intent and export manifest assembly for projects.
"""

from __future__ import annotations
from collections.abc import Sequence

from .models import ProjectExportManifestModel, ProjectModel


def build_project_export_manifest(
    *,
    project: ProjectModel,
    format_id: str,
    chapter_ids: Sequence[str],
    include_cover_art: bool = True,
    include_audio: bool = True,
    snapshot_id: str | None = None,
) -> ProjectExportManifestModel:
    """Build the export intent payload for a project export request."""

    normalized_chapter_ids = _resolve_export_chapter_ids(chapter_ids=chapter_ids)
    _ = _resolve_export_artifacts(project=project, chapter_ids=normalized_chapter_ids)

    return ProjectExportManifestModel(
        project_id=project.id,
        format_id=format_id,
        chapter_ids=normalized_chapter_ids,
        include_cover_art=include_cover_art,
        include_audio=include_audio,
        snapshot_id=snapshot_id,
    )


def resolve_project_export_inputs(
    *,
    project_id: str,
    format_id: str,
    chapter_ids: Sequence[str] | None = None,
    include_cover_art: bool = True,
) -> dict[str, object]:
    """Resolve export inputs before manifest assembly begins."""
    return {
        "project_id": project_id,
        "format_id": format_id,
        "chapter_ids": list(chapter_ids) if chapter_ids else [],
        "include_cover_art": include_cover_art,
    }


def _resolve_export_chapter_ids(*, chapter_ids: Sequence[str]) -> list[str]:
    """Normalize the ordered chapter list included in an export."""
    ids = [cid.strip() for cid in chapter_ids if cid and cid.strip()]
    return list(dict.fromkeys(ids)) # Maintain order, remove duplicates


def _resolve_export_artifacts(
    *, project: ProjectModel, chapter_ids: Sequence[str]
) -> list[dict[str, object]]:
    """Describe the artifact set an export will need to assemble."""
    # Placeholder for future artifact domain integration
    artifacts = []
    if project.cover_asset_ref:
        artifacts.append({
            "type": "cover",
            "ref": project.cover_asset_ref,
            "portable_path": "cover.jpg"
        })

    for cid in chapter_ids:
        artifacts.append({
            "type": "chapter_audio",
            "chapter_id": cid,
            "portable_path": f"chapters/{cid}.wav"
        })

    return artifacts
