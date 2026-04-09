"""Voice sample helpers.

Sample flows are intentionally separated from project rendering so sample
creation, voice tests, and library previews can evolve independently.
"""

from __future__ import annotations

from .models import VoicePreviewRequestModel, VoiceProfileModel


def build_voice_sample_request(
    *,
    profile: VoiceProfileModel,
    script_text: str,
    engine_id: str | None = None,
) -> VoicePreviewRequestModel:
    """Assemble a reusable voice sample request."""

    return VoicePreviewRequestModel(
        voice_profile_id=profile.id,
        script_text=script_text.strip(),
        engine_id=_resolve_sample_engine(profile=profile, engine_id=engine_id),
    )


def _resolve_sample_engine(
    *, profile: VoiceProfileModel, engine_id: str | None
) -> str | None:
    """Describe engine resolution rules for preview and sample flows.

    Args:
        profile: Reusable voice identity that the sample should use.
        engine_id: Optional explicit engine override from the caller.

    Returns:
        str | None: Engine identifier the sample flow should target.

    """
    resolved_engine = (engine_id or "").strip()
    return resolved_engine or profile.default_engine_id
