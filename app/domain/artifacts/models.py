"""Artifact domain models."""

from dataclasses import dataclass


@dataclass
class RenderArtifactModel:
    """Placeholder for immutable render artifacts."""

    id: str
    artifact_hash: str
    audio_path: str

