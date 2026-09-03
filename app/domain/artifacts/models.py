"""Artifact domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class ArtifactOutputModel:
    """Audio output metadata stored in the artifact manifest."""

    duration_ms: int
    sample_rate: int
    channels: int


@dataclass
class RenderArtifactModel:
    """Immutable audio artifact stored after synthesis completes."""

    id: str
    artifact_hash: str
    manifest_path: str
    audio_path: str
    created_at: datetime = field(default_factory=_utc_now)


@dataclass
class ArtifactManifestModel:
    """Manifest fields used to validate whether an artifact is still current."""

    manifest_version: int
    artifact_hash: str
    request_fingerprint: str
    engine_id: str
    engine_version: str | None
    voice_asset_id: str | None
    block_revision_hash: str
    text_hash: str
    settings_hash: str
    output: ArtifactOutputModel
    source_revision_id: str
    chapter_id: str | None = None
    project_id: str | None = None
    created_at: datetime = field(default_factory=_utc_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "manifest_version": self.manifest_version,
            "artifact_hash": self.artifact_hash,
            "request_fingerprint": self.request_fingerprint,
            "engine": {
                "id": self.engine_id,
                "version": self.engine_version,
            },
            "voice_asset_id": self.voice_asset_id,
            "block_revision_hash": self.block_revision_hash,
            "text_hash": self.text_hash,
            "settings_hash": self.settings_hash,
            "output": {
                "duration_ms": self.output.duration_ms,
                "sample_rate": self.output.sample_rate,
                "channels": self.output.channels,
            },
            "source_revision_id": self.source_revision_id,
            "chapter_id": self.chapter_id,
            "project_id": self.project_id,
            "created_at": self.created_at.isoformat(),
        }
