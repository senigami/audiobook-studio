"""Voice compatibility helpers.

This module describes the rules that decide whether a reusable voice profile,
its engine-bound assets, and a requested engine can work together safely.
"""

from .models import VoiceAssetModel, VoiceProfileModel


def validate_voice_compatibility(
    *,
    profile: VoiceProfileModel,
    engine_id: str,
    asset: VoiceAssetModel | None = None,
) -> None:
    """Describe compatibility validation for a voice profile and engine.

    Args:
        profile: Reusable voice identity being evaluated.
        engine_id: Target engine identifier requested by the caller.
        asset: Optional engine-bound asset already associated with the profile.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _validate_profile_defaults(profile=profile, engine_id=engine_id)
    _ = _validate_asset_requirements(profile=profile, engine_id=engine_id, asset=asset)
    raise NotImplementedError


def _validate_profile_defaults(*, profile: VoiceProfileModel, engine_id: str) -> None:
    """Describe default-engine compatibility checks for a voice profile.

    Args:
        profile: Reusable voice identity being evaluated.
        engine_id: Target engine identifier requested by the caller.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (profile, engine_id)
    raise NotImplementedError


def _validate_asset_requirements(
    *,
    profile: VoiceProfileModel,
    engine_id: str,
    asset: VoiceAssetModel | None,
) -> None:
    """Describe asset-level requirements for the requested engine.

    Args:
        profile: Reusable voice identity being evaluated.
        engine_id: Target engine identifier requested by the caller.
        asset: Optional engine-bound asset already associated with the profile.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (profile, engine_id, asset)
    raise NotImplementedError
