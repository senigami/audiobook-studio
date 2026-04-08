"""Project snapshot helpers.

Snapshots will record the project state needed for safe reload, export, and
restore flows.
"""

from collections.abc import Sequence

from .models import ProjectModel, ProjectSnapshotModel


def build_project_snapshot(
    *,
    project: ProjectModel,
    revision_id: str,
    chapter_ids: Sequence[str],
    artifact_hashes: Sequence[str],
) -> ProjectSnapshotModel:
    """Assemble the revision-safe snapshot contract for a project.

    Args:
        project: Project entity being snapshotted.
        revision_id: Stable revision identifier captured at snapshot time.
        chapter_ids: Ordered chapter identifiers included in the snapshot.
        artifact_hashes: Artifact hashes considered valid for this revision.

    Returns:
        ProjectSnapshotModel: Snapshot contract ready for repository storage.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _collect_snapshot_chapter_ids(chapter_ids=chapter_ids)
    _ = _collect_snapshot_artifact_hashes(artifact_hashes=artifact_hashes)
    raise NotImplementedError


def validate_project_snapshot(
    snapshot: ProjectSnapshotModel, *, expected_project_id: str | None = None
) -> None:
    """Validate that a snapshot still matches its expected project context.

    Args:
        snapshot: Snapshot contract to validate.
        expected_project_id: Optional project identifier that the snapshot must
            match.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = expected_project_id
    raise NotImplementedError


def _collect_snapshot_chapter_ids(*, chapter_ids: Sequence[str]) -> list[str]:
    """Normalize ordered chapter identifiers before snapshot assembly.

    Args:
        chapter_ids: Ordered chapter identifiers to preserve in the snapshot.

    Returns:
        list[str]: Normalized chapter identifier list.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError


def _collect_snapshot_artifact_hashes(*, artifact_hashes: Sequence[str]) -> list[str]:
    """Normalize artifact hashes before snapshot assembly.

    Args:
        artifact_hashes: Revision-safe artifact hashes linked to the snapshot.

    Returns:
        list[str]: Normalized artifact hash list.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
