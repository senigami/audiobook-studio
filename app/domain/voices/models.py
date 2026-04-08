"""Voice domain models.

Phase 1 note:
- These models describe voice identity and preview contracts.
- Engine-specific behavior remains behind the voice bridge boundary.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class VoiceProfileModel:
    """Reusable voice identity shared across chapters and preview flows."""

    id: str
    name: str
    default_engine_id: Optional[str] = None
    default_style_id: Optional[str] = None


@dataclass
class VoiceAssetModel:
    """Engine-specific voice asset or training output."""

    id: str
    voice_profile_id: str
    engine_id: str
    asset_ref: Optional[str] = None


@dataclass
class VoicePreviewRequestModel:
    """Preview/test request assembled before it reaches the engine bridge."""

    voice_profile_id: str
    script_text: str
    engine_id: Optional[str] = None
    reference_text: Optional[str] = None
    reference_audio_path: Optional[str] = None
