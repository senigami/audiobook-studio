"""Voice repository boundary.

Intended responsibility:
- hide persistence details for voice profiles and voice assets
- keep engine-specific assets separate from reusable voice identities
- give the voice domain a stable seam for profile CRUD and lookup flows

Phase 1 note:
- This is a contract scaffold only.
- Existing voice persistence behavior remains legacy-backed for now.
"""

from __future__ import annotations

from typing import Iterable, Protocol

from .models import VoiceAssetModel, VoiceProfileModel


class VoiceRepository(Protocol):
    """Persistence contract for voice profiles and engine-bound assets."""

    def get_profile(self, voice_profile_id: str) -> VoiceProfileModel | None:
        """Load one reusable voice profile by stable profile identifier."""

    def list_profiles(self) -> Iterable[VoiceProfileModel]:
        """List reusable voice profiles for picker and editor surfaces."""

    def save_profile(self, profile: VoiceProfileModel) -> VoiceProfileModel:
        """Persist profile metadata changes and return the stored profile."""

    def get_asset(
        self, voice_profile_id: str, engine_id: str
    ) -> VoiceAssetModel | None:
        """Load the engine-specific asset linked to a voice profile."""

    def list_assets_for_profile(self, voice_profile_id: str) -> Iterable[VoiceAssetModel]:
        """List engine-specific assets linked to one voice profile."""

    def save_asset(self, asset: VoiceAssetModel) -> VoiceAssetModel:
        """Persist an engine-specific asset record and return the stored asset."""
