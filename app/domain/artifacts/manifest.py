"""Artifact manifest helpers.

The manifest is what lets Studio 2.0 tell a valid artifact from stale output.
"""

from .models import ArtifactManifestModel


def build_artifact_manifest(
    *,
    manifest_version: int = 1,
    content_hash: str,
    source_revision_id: str,
    engine_id: str,
    engine_version: str | None = None,
    model_revision: str | None = None,
    voice_profile_id: str | None = None,
    chapter_id: str | None = None,
) -> ArtifactManifestModel:
    """Build the validation manifest for a rendered artifact.

    Args:
        manifest_version: Version of the artifact manifest schema and hashing
            contract.
        content_hash: Hash of the synthesized content inputs.
        source_revision_id: Source revision that produced the artifact.
        engine_id: Engine identifier used for synthesis.
        engine_version: Optional engine wrapper or runtime version identifier.
        model_revision: Optional engine model revision or model hash used for
            synthesis consistency checks.
        voice_profile_id: Optional voice profile identifier used for synthesis.
        chapter_id: Optional chapter identifier owning the artifact.

    Returns:
        ArtifactManifestModel: Validation manifest stored beside the artifact.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _build_manifest_hash_input(
        manifest_version=manifest_version,
        content_hash=content_hash,
        source_revision_id=source_revision_id,
        engine_id=engine_id,
        engine_version=engine_version,
        model_revision=model_revision,
        voice_profile_id=voice_profile_id,
        chapter_id=chapter_id,
    )
    raise NotImplementedError


def _build_manifest_hash_input(
    *,
    manifest_version: int,
    content_hash: str,
    source_revision_id: str,
    engine_id: str,
    engine_version: str | None,
    model_revision: str | None,
    voice_profile_id: str | None,
    chapter_id: str | None,
) -> str:
    """Describe the deterministic fields that feed artifact manifest hashing.

    Args:
        manifest_version: Version of the artifact manifest schema and hashing
            contract.
        content_hash: Hash of the synthesized content inputs.
        source_revision_id: Source revision that produced the artifact.
        engine_id: Engine identifier used for synthesis.
        engine_version: Optional engine wrapper or runtime version identifier.
        model_revision: Optional engine model revision or model hash used for
            synthesis consistency checks.
        voice_profile_id: Optional voice profile identifier used for synthesis.
        chapter_id: Optional chapter identifier owning the artifact.

    Returns:
        str: Deterministic manifest-hash input string.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError
