"""Voice domain service.

This will eventually own voice profile creation, compatibility checks, and
profile-level defaults. Engine-specific work stays behind the bridge.
"""

from __future__ import annotations

from .models import VoicePreviewRequestModel, VoiceProfileModel
from .compatibility import validate_voice_compatibility
from .preview import preview_voice_profile
from .repository import VoiceRepository
from .samples import build_voice_sample_request

INTENDED_UPSTREAM_CALLERS = (
    "app.api.routers.voices",
    "app.api.routers.projects",
    "app.api.routers.chapters",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.domain.voices.repository.VoiceRepository",
    "app.domain.voices.compatibility.validate_voice_compatibility",
    "app.domain.voices.samples.build_voice_sample_request",
    "app.domain.voices.preview.preview_voice_profile",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.db.speakers",
    "app.jobs",
    "app.voice_engines",
)


class VoiceService:
    """Placeholder service showing voice-domain responsibilities."""

    def __init__(self, repository: VoiceRepository):
        self.repository = repository

    def list_voice_profiles(self) -> list[VoiceProfileModel]:
        """List reusable voice profiles for picker and editor surfaces.

        Returns:
            list[VoiceProfileModel]: Installed or available voice identities.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return list(self.repository.list_profiles())

    def get_voice_profile(self, voice_profile_id: str) -> VoiceProfileModel:
        """Read one reusable voice identity through the domain service.

        Args:
            voice_profile_id: Stable voice profile identifier.

        Returns:
            VoiceProfileModel: Requested voice identity and defaults.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        return self._load_voice_profile(voice_profile_id=voice_profile_id)

    def validate_profile_engine_compatibility(
        self,
        *,
        voice_profile_id: str,
        engine_id: str | None = None,
    ) -> None:
        """Validate that a voice profile can be used with a target engine.

        Args:
            voice_profile_id: Stable voice profile identifier.
            engine_id: Optional explicit engine identifier. When omitted, the
                profile's default engine will be evaluated.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        profile = self._load_voice_profile(voice_profile_id=voice_profile_id)
        validate_voice_compatibility(
            profile=profile,
            engine_id=engine_id or profile.default_engine_id,
            asset=self.repository.get_asset(profile.id, engine_id or profile.default_engine_id or ""),
        )

    def run_preview(self, request: VoicePreviewRequestModel) -> dict[str, object]:
        """Delegate preview or test synthesis requests through the voice domain.

        Args:
            request: Preview request contract containing profile, script, and
                optional engine overrides.

        Returns:
            dict[str, object]: Placeholder preview result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        resolved_request = self._resolve_preview_request(request=request)
        return preview_voice_profile(request=resolved_request)

    def _load_voice_profile(self, *, voice_profile_id: str) -> VoiceProfileModel:
        """Load one voice profile before validation or preview operations.

        Args:
            voice_profile_id: Stable voice profile identifier.

        Returns:
            VoiceProfileModel: Requested voice profile entity.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        profile = self.repository.get_profile(voice_profile_id)
        if profile is None:
            raise KeyError(f"Voice profile not found: {voice_profile_id}")
        return profile

    def _resolve_preview_request(
        self, *, request: VoicePreviewRequestModel
    ) -> VoicePreviewRequestModel:
        """Normalize preview request fields before bridge-level routing.

        Args:
            request: Raw preview request contract.

        Returns:
            VoicePreviewRequestModel: Normalized preview request payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        profile = self._load_voice_profile(voice_profile_id=request.voice_profile_id)
        return build_voice_sample_request(
            profile=profile,
            script_text=request.script_text,
            engine_id=request.engine_id,
        )


def create_voice_service(repository: VoiceRepository) -> VoiceService:
    """Create the voice-domain service shell for future API wiring.

    Args:
        repository: Persistence adapter implementing the voice repository
            contract.

    Returns:
        VoiceService: Service shell exposing future voice-domain entry points.
    """
    return VoiceService(repository=repository)
