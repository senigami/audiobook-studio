"""Project export helpers.

This module will own export intent and export manifest assembly for projects.
"""

from collections.abc import Sequence

from app.domain.artifacts.manifest import build_artifact_manifest

from .models import ProjectExportManifestModel, ProjectModel


def build_project_export_manifest(
    *,
    project: ProjectModel,
    format_id: str,
    chapter_ids: Sequence[str],
    include_cover_art: bool = True,
) -> ProjectExportManifestModel:
    """Build the export intent payload for a project export request.

    Args:
        project: Project being exported.
        format_id: Export target identifier.
        chapter_ids: Ordered chapter identifiers included in the export.
        include_cover_art: Whether cover art should be included if supported.

    Returns:
        ProjectExportManifestModel: Export payload for downstream assembly.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _resolve_export_chapter_ids(chapter_ids=chapter_ids)
    _ = _resolve_export_artifacts(project=project, chapter_ids=chapter_ids)
    raise NotImplementedError


def resolve_project_export_inputs(
    *,
    project_id: str,
    format_id: str,
    chapter_ids: Sequence[str] | None = None,
    include_cover_art: bool = True,
) -> dict[str, object]:
    """Resolve export inputs before manifest assembly begins.

    Args:
        project_id: Project identifier requested for export.
        format_id: Export target identifier.
        chapter_ids: Optional explicit chapter subset; absent means whole
            project export.
        include_cover_art: Whether cover art should be included if available.

    Returns:
        dict[str, object]: Normalized export input payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (project_id, format_id, chapter_ids, include_cover_art)
    raise NotImplementedError


def _resolve_export_chapter_ids(*, chapter_ids: Sequence[str]) -> list[str]:
    """Normalize the ordered chapter list included in an export.

    Args:
        chapter_ids: Requested chapter identifiers.

    Returns:
        list[str]: Normalized chapter identifier list.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError


def _resolve_export_artifacts(
    *, project: ProjectModel, chapter_ids: Sequence[str]
) -> list[dict[str, object]]:
    """Describe the artifact set an export will need to assemble.

    Args:
        project: Project being exported.
        chapter_ids: Ordered chapter identifiers included in the export.

    Returns:
        list[dict[str, object]]: Artifact requests to be satisfied by the
        artifact domain or export worker.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = build_artifact_manifest
    raise NotImplementedError
