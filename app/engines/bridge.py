"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.feature_flags import use_tts_server
from app.engines.registry import load_engine_registry
from app.engines.bridge_local import LocalBridgeHandler
from app.engines.bridge_remote import RemoteBridgeHandler

logger = logging.getLogger(__name__)


class VoiceBridge:
    """Routes voice requests to the correct engine adapter or TTS Server.

    When ``USE_TTS_SERVER`` is enabled the bridge calls the TTS Server over
    HTTP. Otherwise it dispatches directly to the in-process engine adapter.
    """

    def __init__(self, *, registry_loader, tts_client_factory=None):
        self.local = LocalBridgeHandler(registry_loader=registry_loader)
        self.remote = RemoteBridgeHandler(tts_client_factory=tts_client_factory)

    @property
    def registry_loader(self):
        """Getter for legacy test monkeypatching."""
        return self.local.registry_loader

    @registry_loader.setter
    def registry_loader(self, value):
        """Setter for legacy test monkeypatching."""
        self.local.registry_loader = value

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route synthesis request."""
        if use_tts_server():
            return self.remote.synthesize(request)
        return self.local.synthesize(request)

    def preview(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route preview request."""
        if use_tts_server():
            return self.remote.preview(request)
        return self.local.preview(request)

    def build_voice_asset(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route voice-asset build request."""
        if use_tts_server():
            raise NotImplementedError("build_voice_asset is not yet implemented via TTS Server path.")
        return self.local.build_voice_asset(request)

    def is_engine_enabled(self, engine_id: str) -> bool:
        """Check whether an engine is enabled in settings."""
        from app.state import get_settings
        registry = self.local.registry_loader()
        registration = registry.get(engine_id)
        if not registration:
            return False

        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}
        default_enabled = registration.manifest.built_in or registration.manifest.verified
        return bool(enabled_plugins.get(engine_id, default_enabled))

    def get_synthesis_plan(self, request: dict[str, Any]) -> Any:
        """Query an engine for its preferred synthesis plan."""
        if use_tts_server():
            return self.remote.get_synthesis_plan(request)
        return self.local.get_synthesis_plan(request)

    def check_readiness(
        self, engine_id: str, profile_id: str, settings: dict[str, Any], profile_dir: str | None
    ) -> tuple[bool, str]:
        """Check if a voice profile is ready."""
        if use_tts_server():
            return True, "Assumed ready (TTS Server)"
        return self.local.check_readiness(engine_id, profile_id, settings, profile_dir)

    def describe_registry(self) -> list[dict[str, Any]]:
        """Return discovery metadata for all registered engines."""
        if use_tts_server():
            return self.remote.describe_registry()
        return self.local.describe_registry()

    def update_engine_settings(self, engine_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Update and persist settings for an engine."""
        if use_tts_server():
            return self.remote.update_settings(engine_id, settings)
        return self.local.update_engine_settings(engine_id, settings)

    def refresh_plugins(self) -> dict[str, Any]:
        """Re-scan for new plugins."""
        if use_tts_server():
            return self.remote.refresh_plugins()
        return {
            "ok": True,
            "message": "Plugin refresh is only supported when running with TTS Server.",
            "loaded_count": len(self.local.registry_loader()),
        }

    def verify_engine(self, engine_id: str) -> dict[str, Any]:
        """Trigger verification synthesis."""
        if use_tts_server():
            return self.remote.verify_engine(engine_id)
        return {"ok": False, "message": "Engine verification is only supported via TTS Server path."}

    def install_dependencies(self, engine_id: str) -> dict[str, Any]:
        """Trigger dependency installation."""
        return {"ok": False, "message": f"In-process dependency install not implemented for {engine_id}."}

    def remove_plugin(self, engine_id: str) -> dict[str, Any]:
        """Uninstall a plugin."""
        return {"ok": False, "message": f"Plugin removal not implemented for {engine_id}."}

    def install_plugin(self) -> dict[str, Any]:
        """Provide instructions for manual install."""
        return {
            "ok": False,
            "message": "Automated plugin installation is not yet supported. Please place plugin folders in the 'plugins/' directory manually and click 'Refresh Plugins'.",
        }

    def get_logs(self, engine_id: str) -> dict[str, Any]:
        """Fetch recent logs for an engine."""
        return {"ok": True, "logs": "Log streaming coming in a later update."}


def create_voice_bridge() -> VoiceBridge:
    """Create the voice bridge with registry dependency wiring."""
    return VoiceBridge(registry_loader=load_engine_registry)
