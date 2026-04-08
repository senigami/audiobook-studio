"""Voice sample helpers.

Sample flows are intentionally separated from project rendering so sample
creation, voice tests, and library previews can evolve independently.
"""

from .models import VoicePreviewRequestModel, VoiceProfileModel


def build_voice_sample_request(
    *,
    profile: VoiceProfileModel,
    script_text: str,
    engine_id: str | None = None,
) -> VoicePreviewRequestModel:
    """Describe how a reusable voice sample request should be assembled.

    Args:
        profile: Reusable voice identity that the sample should use.
        script_text: Preview or sample script text selected by the user.
        engine_id: Optional explicit engine override for the sample flow.

    Returns:
        VoicePreviewRequestModel: Canonical sample request payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = _resolve_sample_engine(profile=profile, engine_id=engine_id)
    raise NotImplementedError


def _resolve_sample_engine(
    *, profile: VoiceProfileModel, engine_id: str | None
) -> str | None:
    """Describe engine resolution rules for preview and sample flows.

    Args:
        profile: Reusable voice identity that the sample should use.
        engine_id: Optional explicit engine override from the caller.

    Returns:
        str | None: Engine identifier the sample flow should target.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = profile
    raise NotImplementedError
