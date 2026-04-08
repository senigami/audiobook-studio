"""Artifact domain models."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class RenderArtifactModel:
    """Immutable audio artifact stored after synthesis completes."""

    id: str
    artifact_hash: str
    audio_path: str
    manifest_hash: Optional[str] = None


@dataclass
class ArtifactManifestModel:
    """Manifest fields used to validate whether an artifact is still current."""

    manifest_version: int
    artifact_hash: str
    content_hash: str
    source_revision_id: str
    engine_id: str
    engine_version: Optional[str] = None
    model_revision: Optional[str] = None
    voice_profile_id: Optional[str] = None
    chapter_id: Optional[str] = None
