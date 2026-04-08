"""Base voice engine contract.

The long-term goal is for every engine implementation to conform to this
interface so the queue and UI never need engine-specific branches.
"""


class BaseVoiceEngine:
    """Placeholder base voice engine contract."""

    def validate_environment(self) -> None:
        """Check whether the engine can run in the current environment.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Validate an engine-specific request before synthesis or preview.

        Args:
            request: Engine-ready request payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Synthesize audio for a canonical voice request.

        Args:
            request: Engine-ready synthesis payload.

        Returns:
            dict[str, object]: Placeholder synthesis result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run preview or test synthesis for a lightweight voice request.

        Args:
            request: Engine-ready preview payload.

        Returns:
            dict[str, object]: Placeholder preview result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Build or refresh engine-specific voice assets for a profile.

        Args:
            request: Engine-ready voice-asset build payload.

        Returns:
            dict[str, object]: Placeholder asset-build result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError
