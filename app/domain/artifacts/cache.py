"""Immutable artifact cache helpers."""

from __future__ import annotations

from pathlib import Path

from .models import RenderArtifactModel


def publish_artifact(
    *,
    artifact: RenderArtifactModel,
    destination_path: str,
    replace_existing: bool = False,
) -> RenderArtifactModel:
    """Describe atomic publication of a rendered artifact into cache storage."""

    final_path = _prepare_publish_target(
        artifact=artifact,
        destination_path=destination_path,
        replace_existing=replace_existing,
    )
    manifest_path = _write_manifest_sidecar(artifact=artifact, destination_path=final_path)
    return RenderArtifactModel(
        id=artifact.id,
        artifact_hash=artifact.artifact_hash,
        manifest_path=manifest_path,
        audio_path=final_path,
        created_at=artifact.created_at,
    )


def _prepare_publish_target(
    *,
    artifact: RenderArtifactModel,
    destination_path: str,
    replace_existing: bool,
) -> str:
    """Describe the cache-path preparation needed before artifact publication."""

    _ = artifact
    path = Path(destination_path).expanduser()
    if not path.name:
        raise ValueError("Artifact destination path must include a filename.")
    if not replace_existing and path.exists():
        raise FileExistsError(f"Artifact already exists at destination: {path}")
    return str(path)


def _write_manifest_sidecar(
    *, artifact: RenderArtifactModel, destination_path: str
) -> str:
    """Describe manifest sidecar publication beside the cached artifact."""

    _ = artifact
    path = Path(destination_path)
    return str(path.with_suffix(path.suffix + ".manifest.json"))
