"""Immutable artifact cache helpers."""

from .models import RenderArtifactModel


def publish_artifact(
    *,
    artifact: RenderArtifactModel,
    destination_path: str,
    replace_existing: bool = False,
) -> RenderArtifactModel:
    """Describe atomic publication of a rendered artifact into cache storage.

    Args:
        artifact: Render artifact being published.
        destination_path: Final cache path the artifact should be written to.
        replace_existing: Whether an existing artifact path may be replaced.

    Returns:
        RenderArtifactModel: Published artifact shell with final cache location.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _prepare_publish_target(
        artifact=artifact,
        destination_path=destination_path,
        replace_existing=replace_existing,
    )
    _ = _write_manifest_sidecar(artifact=artifact, destination_path=destination_path)
    raise NotImplementedError


def _prepare_publish_target(
    *,
    artifact: RenderArtifactModel,
    destination_path: str,
    replace_existing: bool,
) -> str:
    """Describe the cache-path preparation needed before artifact publication.

    Args:
        artifact: Render artifact being published.
        destination_path: Requested final cache path.
        replace_existing: Whether an existing path may be replaced.

    Returns:
        str: Final publish path after path validation and collision checks.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = artifact
    raise NotImplementedError


def _write_manifest_sidecar(
    *, artifact: RenderArtifactModel, destination_path: str
) -> str:
    """Describe manifest sidecar publication beside the cached artifact.

    Args:
        artifact: Render artifact whose manifest should be written.
        destination_path: Artifact cache path used to derive the sidecar path.

    Returns:
        str: Sidecar manifest path that would be written.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = artifact
    raise NotImplementedError
