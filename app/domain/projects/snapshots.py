"""Project snapshot helpers.

Snapshots record the project state needed for safe reload, export, and restore
flows.
"""

from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Sequence
from pathlib import Path

from .models import ProjectModel, ProjectSnapshotModel


def build_project_snapshot(
    *,
    project: ProjectModel,
    revision_id: str,
    chapter_ids: Sequence[str],
    artifact_hashes: Sequence[str],
) -> ProjectSnapshotModel:
    """Assemble the revision-safe snapshot contract for a project."""

    normalized_chapter_ids = _collect_snapshot_chapter_ids(chapter_ids=chapter_ids)
    normalized_artifact_hashes = _collect_snapshot_artifact_hashes(artifact_hashes=artifact_hashes)
    snapshot_id = _build_snapshot_id(
        project_id=project.id,
        revision_id=revision_id,
        chapter_ids=normalized_chapter_ids,
        artifact_hashes=normalized_artifact_hashes,
    )
    metadata_json = {
        "project_title": project.title,
        "author": project.author,
        "series": project.series,
        "cover_asset_ref": project.cover_asset_ref,
        "default_voice_id": project.default_voice_id,
        "default_output_preset": project.default_output_preset,
        "pronunciation_profile_id": project.pronunciation_profile_id,
        "chapter_count": len(normalized_chapter_ids),
        "artifact_count": len(normalized_artifact_hashes),
    }
    snapshot = ProjectSnapshotModel(
        id=snapshot_id,
        project_id=project.id,
        label=f"{project.title} snapshot",
        source_revision=revision_id,
        metadata_json=metadata_json,
        chapter_ids=normalized_chapter_ids,
        artifact_hashes=normalized_artifact_hashes,
    )
    validate_project_snapshot(snapshot, expected_project_id=project.id)
    return snapshot


def validate_project_snapshot(
    snapshot: ProjectSnapshotModel, *, expected_project_id: str | None = None
) -> None:
    """Validate that a snapshot still matches its expected project context."""

    if expected_project_id is not None and snapshot.project_id != expected_project_id:
        raise ValueError("Snapshot does not belong to the expected project.")
    _assert_portable_metadata(snapshot.metadata_json)


def _collect_snapshot_chapter_ids(*, chapter_ids: Sequence[str]) -> list[str]:
    ids = [chapter_id.strip() for chapter_id in chapter_ids if chapter_id and chapter_id.strip()]
    return list(dict.fromkeys(ids))


def _collect_snapshot_artifact_hashes(*, artifact_hashes: Sequence[str]) -> list[str]:
    hashes = [artifact_hash.strip() for artifact_hash in artifact_hashes if artifact_hash and artifact_hash.strip()]
    return list(dict.fromkeys(hashes))


def _build_snapshot_id(
    *,
    project_id: str,
    revision_id: str,
    chapter_ids: Sequence[str],
    artifact_hashes: Sequence[str],
) -> str:
    payload = {
        "project_id": project_id,
        "revision_id": revision_id,
        "chapter_ids": list(chapter_ids),
        "artifact_hashes": list(artifact_hashes),
    }
    return "snap_" + hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    ).hexdigest()[:16]


def _assert_portable_metadata(metadata: dict[str, object]) -> None:
    for key, value in metadata.items():
        if isinstance(value, dict):
            _assert_portable_metadata(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    _assert_portable_metadata(item)
        elif isinstance(value, str) and "path" in key.lower() and _looks_like_absolute_path(value):
            raise ValueError("Snapshot metadata must not depend on absolute paths.")


def _looks_like_absolute_path(value: str) -> bool:
    return os.path.isabs(value) or Path(value).drive != ""
