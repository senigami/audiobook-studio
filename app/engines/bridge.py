"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from app.engines.voice.base import BaseVoiceEngine
from app.engines.registry import load_engine_registry


class VoiceBridge:
    """Placeholder bridge surface for synthesis and preview/test calls."""

    def __init__(self, *, registry_loader):
        self.registry_loader = registry_loader

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Route a synthesis request through the registry.

        Args:
            request: Canonical synthesis request payload from orchestration.

        Returns:
            dict[str, object]: Placeholder synthesis result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        engine = self._resolve_engine(request=request)
        _ = self._validate_request(engine=engine, request=request)
        raise NotImplementedError("Studio 2.0 synthesis routing is not implemented yet.")

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Route a preview/test request through the registry.

        Args:
            request: Canonical preview request payload from the voice domain.

        Returns:
            dict[str, object]: Placeholder preview result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        engine = self._resolve_engine(request=request)
        _ = self._validate_request(engine=engine, request=request)
        raise NotImplementedError("Studio 2.0 preview routing is not implemented yet.")

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Route a voice-asset build request through the registry.

        Args:
            request: Canonical voice-asset build payload from the voice domain.

        Returns:
            dict[str, object]: Placeholder voice-asset build result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        engine = self._resolve_engine(request=request)
        _ = self._validate_request(engine=engine, request=request)
        raise NotImplementedError("Studio 2.0 voice-asset routing is not implemented yet.")

    def _resolve_engine(self, *, request: dict[str, object]) -> BaseVoiceEngine:
        """Resolve the concrete engine adapter for a canonical request.

        Args:
            request: Canonical request payload that includes engine identity.

        Returns:
            BaseVoiceEngine: Engine adapter selected from the registry.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = self.registry_loader()
        raise NotImplementedError("Studio 2.0 engine resolution is not implemented yet.")

    def _validate_request(
        self, *, engine: BaseVoiceEngine, request: dict[str, object]
    ) -> None:
        """Describe request validation before engine execution begins.

        Args:
            engine: Concrete engine adapter selected for the request.
            request: Canonical request payload being routed.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = (engine, request)
        raise NotImplementedError("Studio 2.0 bridge request validation is not implemented yet.")


def create_voice_bridge() -> VoiceBridge:
    """Create the voice bridge shell with registry dependency wiring.

    Returns:
        VoiceBridge: Bridge shell used by voice and orchestration services.
    """
    return VoiceBridge(registry_loader=load_engine_registry)
