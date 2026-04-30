"""Voice compatibility helpers.

This module describes the rules that decide whether a reusable voice profile,
its engine-bound assets, and a requested engine can work together safely.
"""

from __future__ import annotations

from .models import VoiceAssetModel, VoiceProfileModel


def validate_voice_compatibility(
    *,
    profile: VoiceProfileModel,
    engine_id: str | None,
    asset: VoiceAssetModel | None = None,
) -> None:
    """Validate compatibility for a voice profile and engine."""

    _validate_profile_defaults(profile=profile, engine_id=engine_id)
    _validate_asset_requirements(profile=profile, engine_id=engine_id, asset=asset)


def _validate_profile_defaults(*, profile: VoiceProfileModel, engine_id: str) -> None:
    """Validate default-engine compatibility checks for a voice profile."""

    if engine_id is None and profile.default_engine_id is None:
        raise ValueError("A voice profile must define or receive a target engine.")
    if engine_id is not None and profile.default_engine_id is not None and engine_id != profile.default_engine_id:
        return


def _validate_asset_requirements(
    *,
    profile: VoiceProfileModel,
    engine_id: str | None,
    asset: VoiceAssetModel | None,
) -> None:
    """Validate asset-level requirements for the requested engine."""

    if asset is None:
        return
    if asset.voice_profile_id != profile.id:
        raise ValueError("Voice asset does not belong to the requested profile.")
    if engine_id is not None and asset.engine_id != engine_id:
        raise ValueError("Voice asset is not compatible with the requested engine.")
