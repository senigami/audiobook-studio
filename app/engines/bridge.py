"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from __future__ import annotations

from app.engines.registry import load_engine_registry
from app.engines.models import EngineRegistrationModel

INTENDED_UPSTREAM_CALLERS = (
    "app.domain.voices.preview",
    "app.orchestration.scheduler.orchestrator",
    "app.orchestration.tasks",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.engines.registry.load_engine_registry",
    "app.engines.voice.base.BaseVoiceEngine",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.db",
    "app.jobs",
)


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
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.synthesize(request)

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Route a preview/test request through the registry.

        Args:
            request: Canonical preview request payload from the voice domain.

        Returns:
            dict[str, object]: Placeholder preview result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.preview(request)

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Route a voice-asset build request through the registry.

        Args:
            request: Canonical voice-asset build payload from the voice domain.

        Returns:
            dict[str, object]: Placeholder voice-asset build result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.build_voice_asset(request)

    def describe_registry(self) -> list[dict[str, object]]:
        """Return discovery metadata for all registered engines."""

        registry = self.registry_loader()
        return [registration.to_dict() for registration in registry.values()]

    def _resolve_registration(
        self, *, request: dict[str, object]
    ) -> EngineRegistrationModel:
        """Resolve the concrete engine adapter for a canonical request.

        Args:
            request: Canonical request payload that includes engine identity.

        Returns:
            EngineRegistrationModel: Adapter registration selected from the registry.

        Raises:
            KeyError: If the requested engine is not registered.
            ValueError: If the request omits an engine identifier.
        """
        engine_id = str(request.get("engine_id") or "").strip()
        if not engine_id:
            raise ValueError("Voice requests must include engine_id.")
        registry = self.registry_loader()
        try:
            return registry[engine_id]
        except KeyError as exc:
            raise KeyError(f"Unknown voice engine: {engine_id}") from exc

    def _validate_request(
        self, *, registration: EngineRegistrationModel, request: dict[str, object]
    ) -> None:
        """Describe request validation before engine execution begins.

        Args:
            registration: Concrete engine adapter selected for the request.
            request: Canonical request payload being routed.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        _ = request
        if registration.manifest.engine_id != str(request.get("engine_id") or "").strip():
            raise ValueError("Request engine_id does not match the registered engine.")
        if not registration.health.available:
            raise RuntimeError(
                f"Engine {registration.manifest.engine_id} is unavailable: {registration.health.message or 'unknown'}"
            )
        if not registration.health.ready:
            raise RuntimeError(
                f"Engine {registration.manifest.engine_id} is not ready: {registration.health.message or 'unknown'}"
            )
        registration.engine.validate_request(request)


def create_voice_bridge() -> VoiceBridge:
    """Create the voice bridge shell with registry dependency wiring.

    Returns:
        VoiceBridge: Bridge shell used by voice and orchestration services.
    """
    return VoiceBridge(registry_loader=load_engine_registry)
