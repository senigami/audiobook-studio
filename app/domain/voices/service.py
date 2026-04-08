"""Voice domain service.

This will eventually own voice profile creation, compatibility checks, and
profile-level defaults. Engine-specific work stays behind the bridge.
"""

from .preview import preview_voice_profile


class VoiceService:
    """Placeholder service showing voice-domain responsibilities."""

    def get_voice_profile(self, voice_profile_id: str):
        """Read voice profile data through the future domain service."""
        raise NotImplementedError("Studio 2.0 voice profile reads are not implemented yet.")

    def run_preview(self, voice_profile_id: str):
        """Delegate preview/test requests through the voice domain."""
        _ = preview_voice_profile
        raise NotImplementedError("Studio 2.0 voice preview is not implemented yet.")


def create_voice_service() -> VoiceService:
    """Factory for the future voice domain service."""
    raise NotImplementedError("Studio 2.0 voice service is not implemented yet.")
