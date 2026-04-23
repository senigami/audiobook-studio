"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.

Phase 5 migration note:
    When ``USE_TTS_SERVER=true``, the bridge routes all synthesis and preview
    calls through the TTS Server HTTP client instead of calling engine adapters
    in-process.  All callers see the same interface regardless of which path is
    active.  The legacy in-process path remains the default.
"""

from __future__ import annotations

from typing import Any

from app.core.feature_flags import use_tts_server
from app.engines.errors import (
    EngineNotReadyError,
    EngineRequestError,
    EngineUnavailableError,
)
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
    "app.engines.tts_client.TtsClient",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.db",
    "app.jobs",
)


class VoiceBridge:
    """Routes voice requests to the correct engine adapter or TTS Server.

    When ``USE_TTS_SERVER`` is enabled the bridge calls the TTS Server over
    HTTP.  Otherwise it dispatches directly to the in-process engine adapter.
    The caller-facing contract is identical in both modes.
    """

    def __init__(self, *, registry_loader, tts_client_factory=None):
        self.registry_loader = registry_loader
        self._tts_client_factory = tts_client_factory

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Route a synthesis request through the registry.

        Args:
            request: Canonical synthesis request payload from orchestration.

        Returns:
            dict[str, object]: Synthesis result payload.
        """
        if use_tts_server():
            return self._synthesize_via_tts_server(request)

        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.synthesize(request)

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Route a preview/test request through the registry.

        Args:
            request: Canonical preview request payload from the voice domain.

        Returns:
            dict[str, object]: Preview result payload.
        """
        if use_tts_server():
            return self._preview_via_tts_server(request)

        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.preview(request)

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Route a voice-asset build request through the registry.

        Args:
            request: Canonical voice-asset build payload from the voice domain.

        Returns:
            dict[str, object]: Voice-asset build result payload.

        Raises:
            NotImplementedError: TTS Server path does not yet support asset builds.
        """
        if use_tts_server():
            raise NotImplementedError(
                "build_voice_asset is not yet implemented via TTS Server path."
            )

        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.build_voice_asset(request)

    def describe_registry(self) -> list[dict[str, object]]:
        """Return discovery metadata for all registered engines."""
        from app.state import get_settings  # noqa: PLC0415

        if use_tts_server():
            return self._describe_registry_via_tts_server()

        registry = self.registry_loader()
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}

        results = []
        for registration in registry.values():
            data = registration.to_dict()
            engine_id = registration.manifest.engine_id
            # Default to enabled for built-ins/verified, disabled for others
            default_enabled = registration.manifest.built_in or registration.manifest.verified
            data["enabled"] = bool(enabled_plugins.get(engine_id, default_enabled))
            results.append(data)

        return results

    def update_engine_settings(
        self, engine_id: str, settings: dict[str, Any]
    ) -> dict[str, Any]:
        """Update and persist settings for an engine.

        Args:
            engine_id: Target engine identifier.
            settings: Partial or full settings to merge.

        Returns:
            dict[str, Any]: Status and updated settings.
        """
        if use_tts_server():
            return self._get_tts_client().update_settings(engine_id, settings)

        from app.state import get_settings, update_settings  # noqa: PLC0415

        updates: dict[str, Any] = {}

        normalized_engine_id = engine_id.lower()

        # Handle generic enablement toggle
        enabled_val = settings.get("enabled")
        if enabled_val is None and "voxtral" in normalized_engine_id:
             enabled_val = settings.get("voxtral_enabled")

        if enabled_val is not None:
            # Enforcement: unverified plugins cannot be turned on
            if bool(enabled_val):
                registry = self.registry_loader()
                registration = registry.get(engine_id)
                if registration and not (registration.manifest.built_in or registration.manifest.verified):
                    raise EngineUnavailableError(
                        f"Cannot enable unverified engine {engine_id}. Verification required."
                    )

            current_settings = get_settings()
            enabled_plugins = dict(current_settings.get("enabled_plugins") or {})
            enabled_plugins[engine_id] = bool(enabled_val)
            updates["enabled_plugins"] = enabled_plugins
            if "voxtral" in normalized_engine_id:
                 updates["voxtral_enabled"] = bool(enabled_val)

        if "voxtral" in normalized_engine_id:
            for key in {"mistral_api_key", "voxtral_model"}:
                if key in settings:
                    updates[key] = settings[key]

        if updates:
            update_settings(updates)
            return {"ok": True, "settings": get_settings()}

        if not updates and settings:
             # If no updates were identified but settings were provided, 
             # the engine doesn't support these settings or isn't handled yet.
             raise NotImplementedError(
                f"update_engine_settings is not yet implemented for in-process engine {engine_id!r} "
                f"with settings keys: {list(settings.keys())}"
            )

        return {"ok": True, "settings": get_settings()}

    def refresh_plugins(self) -> dict[str, Any]:
        """Re-scan for new plugins (TTS Server path only)."""
        if use_tts_server():
            return self._get_tts_client().refresh_plugins()

        return {
            "ok": True,
            "message": "Plugin refresh is only supported when running with TTS Server.",
            "loaded_count": len(self.registry_loader()),
        }

    # ------------------------------------------------------------------
    # TTS Server path
    # ------------------------------------------------------------------

    def _get_tts_client(self):
        """Return a TtsClient connected to the active TTS Server."""
        if self._tts_client_factory is not None:
            return self._tts_client_factory()
        # Default: get the client from the global watchdog.
        from app.engines.watchdog import _global_watchdog  # noqa: PLC0415
        if _global_watchdog is None:
            raise EngineUnavailableError(
                "TTS Server watchdog has not been started. "
                "Ensure the Studio boot sequence initialised the watchdog."
            )
        return _global_watchdog.get_client()

    def _synthesize_via_tts_server(
        self, request: dict[str, object]
    ) -> dict[str, object]:
        """Route synthesis to the TTS Server and adapt the response."""
        from app.engines.tts_client import TtsServerError  # noqa: PLC0415

        engine_id = self._extract_engine_id(request)
        client = self._get_tts_client()

        try:
            result = client.synthesize(
                engine_id=engine_id,
                text=str(request.get("script_text", "")),
                output_path=str(request.get("output_path", "")),
                voice_ref=request.get("reference_audio_path") or None,  # type: ignore[arg-type]
                settings=self._extract_synthesis_settings(request),
                language=str(request.get("language", "en")),
            )
        except TtsServerError as exc:
            raise EngineUnavailableError(
                f"TTS Server synthesis failed: {exc}"
            ) from exc

        return {
            "status": "ok",
            "bridge": "tts-server-bridge",
            "engine_id": engine_id,
            "ephemeral": False,
            "audio_path": result.get("output_path"),
            "audio_format": self._infer_format(str(request.get("output_path", ""))),
            "request_fingerprint": request.get("request_fingerprint"),
            "synthesis_request": {
                "engine_id": engine_id,
                "script_text": request.get("script_text"),
                "output_path": request.get("output_path"),
            },
            "tts_server_result": result,
        }

    def _preview_via_tts_server(
        self, request: dict[str, object]
    ) -> dict[str, object]:
        """Route preview to the TTS Server and adapt the response."""
        from app.engines.tts_client import TtsServerError  # noqa: PLC0415

        engine_id = self._extract_engine_id(request)
        client = self._get_tts_client()

        try:
            result = client.preview(
                engine_id=engine_id,
                text=str(request.get("script_text", "")),
                output_path=str(request.get("output_path", "")),
                voice_ref=request.get("reference_audio_path") or None,  # type: ignore[arg-type]
                settings=self._extract_synthesis_settings(request),
                language=str(request.get("language", "en")),
            )
        except TtsServerError as exc:
            raise EngineUnavailableError(
                f"TTS Server preview failed: {exc}"
            ) from exc

        return {
            "status": "ok",
            "bridge": "tts-server-preview-bridge",
            "engine_id": engine_id,
            "ephemeral": True,
            "audio_path": result.get("output_path"),
            "audio_format": "wav",
            "tts_server_result": result,
        }

    def _describe_registry_via_tts_server(self) -> list[dict[str, object]]:
        """Return engine list from the TTS Server."""
        from app.engines.tts_client import TtsServerError  # noqa: PLC0415

        client = self._get_tts_client()
        try:
            return client.get_engines()
        except TtsServerError as exc:
            raise EngineUnavailableError(
                f"Could not retrieve engine list from TTS Server: {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _extract_engine_id(self, request: dict[str, object]) -> str:
        engine_id = str(request.get("engine_id") or "").strip()
        if not engine_id:
            raise EngineRequestError("Voice requests must include engine_id.")
        return engine_id

    @staticmethod
    def _extract_synthesis_settings(
        request: dict[str, object],
    ) -> dict[str, object]:
        """Extract per-request synthesis settings for the TTS Server path."""
        settings: dict[str, object] = {}
        if "voice_profile_id" in request:
            settings["voice_profile_id"] = request["voice_profile_id"]
        if "voice_asset_id" in request:
            settings["voice_asset_id"] = request["voice_asset_id"]
        if "speed" in request:
            settings["speed"] = request["speed"]
        if "safe_mode" in request:
            settings["safe_mode"] = request["safe_mode"]
        if "output_format" in request:
            settings["output_format"] = request["output_format"]
        return settings

    @staticmethod
    def _infer_format(output_path: str) -> str:
        return "mp3" if output_path.lower().endswith(".mp3") else "wav"

    # ------------------------------------------------------------------
    # In-process (legacy) path helpers
    # ------------------------------------------------------------------

    def _resolve_registration(
        self, *, request: dict[str, object]
    ) -> EngineRegistrationModel:
        """Resolve the concrete engine adapter for a canonical request."""
        engine_id = self._extract_engine_id(request)
        registry = self.registry_loader()
        try:
            return registry[engine_id]
        except KeyError as exc:
            raise EngineRequestError(f"Unknown voice engine: {engine_id}") from exc

    def _validate_request(
        self, *, registration: EngineRegistrationModel, request: dict[str, object]
    ) -> None:
        """Validate request before engine execution begins."""
        _ = request
        if registration.manifest.engine_id != str(request.get("engine_id") or "").strip():
            raise EngineRequestError("Request engine_id does not match the registered engine.")

        from app.state import get_settings  # noqa: PLC0415
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}

        default_enabled = registration.manifest.built_in or registration.manifest.verified
        if not bool(enabled_plugins.get(registration.manifest.engine_id, default_enabled)):
            raise EngineUnavailableError(
                f"Engine {registration.manifest.engine_id} is disabled in Settings."
            )

        if not registration.health.available:
            raise EngineUnavailableError(
                f"Engine {registration.manifest.engine_id} is unavailable: "
                f"{registration.health.message or 'unknown'}"
            )
        if not registration.health.ready:
            raise EngineNotReadyError(
                f"Engine {registration.manifest.engine_id} is not ready: "
                f"{registration.health.message or 'unknown'}"
            )
        registration.engine.validate_request(request)


def create_voice_bridge() -> VoiceBridge:
    """Create the voice bridge with registry dependency wiring.

    Returns:
        VoiceBridge: Bridge used by voice and orchestration services.
    """
    return VoiceBridge(registry_loader=load_engine_registry)
