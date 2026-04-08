"""Voice domain models."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class VoiceProfileModel:
    """Placeholder for a reusable voice identity."""

    id: str
    name: str
    default_engine_id: Optional[str] = None


@dataclass
class VoiceAssetModel:
    """Placeholder for engine-specific voice asset data."""

    id: str
    voice_profile_id: str
    engine_id: str

