"""Single-Process (local) voice bridge handler."""

from __future__ import annotations
import logging
from typing import Any, Callable

from app.engines.errors import (
    EngineNotReadyError,
    EngineRequestError,
    EngineUnavailableError,
)
from app.engines.models import EngineRegistrationModel
from app.engines.enablement import can_enable_engine
from app.engines.bridge_utils import extract_engine_id

logger = logging.getLogger(__name__)


class LocalBridgeHandler:
    """Handles voice requests via Single-Process engine adapters."""

    def __init__(self, registry_loader: Callable[[], dict[str, EngineRegistrationModel]]):
        self.registry_loader = registry_loader

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route synthesis through a local engine."""
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)

        engine = registration.engine
        h = engine.hooks()

        # Hook: preprocess_request
        h.preprocess_request(request)

        # Hook: select_voice
        profile_id = str(request.get("voice_profile_id") or "").strip()
        settings = request.get("settings") or {}
        if profile_id:
            resolved = h.select_voice(profile_id, settings)
            if resolved:
                request["voice_id"] = resolved

        result = engine.synthesize(request)

        # Hook: postprocess_audio
        if result.get("status") == "ok" and result.get("audio_path"):
            h.postprocess_audio(str(result["audio_path"]), settings)

        return result

    def preview(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route preview through a local engine."""
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)

        engine = registration.engine
        h = engine.hooks()

        # Hook: preprocess_request
        h.preprocess_request(request)

        # Hook: select_voice
        profile_id = str(request.get("voice_profile_id") or "").strip()
        settings = request.get("settings") or {}
        if profile_id:
            resolved = h.select_voice(profile_id, settings)
            if resolved:
                request["voice_id"] = resolved

        result = engine.preview(request)

        # Hook: postprocess_audio
        if result.get("status") == "ok" and result.get("audio_path"):
            h.postprocess_audio(str(result["audio_path"]), settings)

        return result

    def build_voice_asset(self, request: dict[str, Any]) -> dict[str, Any]:
        """Build a voice asset locally."""
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        return registration.engine.build_voice_asset(request)

    def get_synthesis_plan(self, request: dict[str, Any]) -> Any:
        """Query a local engine for its synthesis plan."""
        registration = self._resolve_registration(request=request)
        self._validate_request(registration=registration, request=request)
        from app.engines.voice.sdk import TTSRequest
        req = TTSRequest(
            engine_id=registration.manifest.engine_id,
            script_text=str(request.get("script_text", "")),
            output_path=str(request.get("output_path", "")),
            voice_profile_id=str(request.get("voice_profile_id", "")),
            language=str(request.get("language", "en")),
            settings=request.get("settings", {}),
        )
        return registration.engine.hooks().plan_synthesis(req)

    def check_readiness(
        self, engine_id: str, profile_id: str, settings: dict[str, Any], profile_dir: str | None
    ) -> tuple[bool, str]:
        """Check if a local engine and profile are ready."""
        registry = self.registry_loader()
        registration = registry.get(engine_id)
        if not registration:
            return False, f"Engine {engine_id} not found"

        return registration.engine.hooks().check_readiness(profile_id, settings, profile_dir)

    def describe_registry(self) -> list[dict[str, Any]]:
        """Return metadata for local engines."""
        from app.state import get_settings
        registry = self.registry_loader()
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}

        results = []
        for registration in registry.values():
            data = registration.to_dict()
            engine_id = registration.manifest.engine_id
            default_enabled = registration.manifest.built_in or registration.manifest.verified
            data["enabled"] = bool(enabled_plugins.get(engine_id, default_enabled))
            can_enable, reason = can_enable_engine(
                engine_id,
                current_settings=settings,
                built_in=registration.manifest.built_in,
                verified=registration.manifest.verified,
                status=registration.health.status,
            )
            data["can_enable"] = can_enable
            data["enablement_message"] = reason
            results.append(data)

        return results

    def update_engine_settings(self, engine_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Update settings for a local engine."""
        from app.state import get_settings, update_settings

        updates: dict[str, Any] = {}
        normalized_engine_id = engine_id.lower()

        # Handle generic enablement toggle
        enabled_val = settings.get("enabled")
        if enabled_val is None and "voxtral" in normalized_engine_id:
             enabled_val = settings.get("voxtral_enabled")

        if enabled_val is not None:
            if bool(enabled_val):
                registry = self.registry_loader()
                registration = registry.get(engine_id)
                current_settings = get_settings()
                can_enable, reason = can_enable_engine(
                    engine_id,
                    current_settings=current_settings,
                    built_in=bool(registration.manifest.built_in) if registration else False,
                    verified=bool(registration.manifest.verified) if registration else False,
                    status=getattr(registration.health, "status", None) if registration else None,
                )
                if not can_enable:
                    raise EngineUnavailableError(reason or f"Cannot enable engine {engine_id}.")

            current_settings = get_settings()
            enabled_plugins = dict(current_settings.get("enabled_plugins") or {})
            enabled_plugins[engine_id] = bool(enabled_val)
            updates["enabled_plugins"] = enabled_plugins
            if "voxtral" in normalized_engine_id:
                 updates["voxtral_enabled"] = bool(enabled_val)

        from .behavior import required_settings_for
        reqs = required_settings_for(engine_id)
        for req in reqs:
            key = req["name"]
            if key in settings:
                updates[key] = settings[key]

        if updates:
            update_settings(updates)
            return {"ok": True, "settings": get_settings()}

        if not updates and settings:
             raise NotImplementedError(
                f"update_engine_settings is not yet implemented for in-process engine {engine_id!r} "
                f"with settings keys: {list(settings.keys())}"
            )

        return {"ok": True, "settings": get_settings()}

    def _resolve_registration(self, *, request: dict[str, Any]) -> EngineRegistrationModel:
        """Resolve engine adapter."""
        engine_id = extract_engine_id(request)
        registry = self.registry_loader()
        try:
            return registry[engine_id]
        except KeyError as exc:
            raise EngineRequestError(f"Unknown voice engine: {engine_id}") from exc

    def _validate_request(self, *, registration: EngineRegistrationModel, request: dict[str, Any]) -> None:
        """Validate request against registration health and enablement."""
        if registration.manifest.engine_id != str(request.get("engine_id") or "").strip():
            raise EngineRequestError("Request engine_id does not match the registered engine.")

        from app.state import get_settings
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}

        default_enabled = registration.manifest.built_in or registration.manifest.verified
        if not bool(enabled_plugins.get(registration.manifest.engine_id, default_enabled)):
            raise EngineUnavailableError(f"Engine {registration.manifest.engine_id} is disabled in Settings.")

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
