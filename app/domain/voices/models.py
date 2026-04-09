"""Voice domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class VoiceProfileModel:
    """Reusable voice identity shared across chapters and preview flows."""

    id: str
    name: str
    default_engine_id: str | None = None
    capabilities: list[str] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass
class VoiceAssetModel:
    """Engine-specific voice asset or training output."""

    id: str
    voice_profile_id: str
    engine_id: str
    engine_version: str | None = None
    asset_type: str = "reference"
    path_ref: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    status: str = "ready"
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass
class VoicePreviewRequestModel:
    """Preview/test request assembled before it reaches the engine bridge."""

    voice_profile_id: str
    script_text: str
    engine_id: str | None = None
    reference_text: str | None = None
    reference_audio_path: str | None = None
    voice_asset_id: str | None = None
    output_format: str = "wav"
