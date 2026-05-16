"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.engines.registry import load_engine_registry
from app.engines.bridge_remote import RemoteBridgeHandler


logger = logging.getLogger(__name__)


class VoiceBridge:
    """Routes voice requests to the correct engine adapter or TTS Server.

    The Studio 2.0 runtime always routes through the TTS Server over HTTP.
    """

    def __init__(self, *, registry_loader, tts_client_factory=None):
        self._registry_loader = registry_loader
        self.remote = RemoteBridgeHandler(tts_client_factory=tts_client_factory)

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route synthesis request."""
        return self.remote.synthesize(request)

    def cancel(self, task_id: str) -> bool:
        """Signal the remote bridge to cancel a specific task."""
        return self.remote.cancel(task_id)

    def build_voice_asset(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route voice-asset build request."""
        raise NotImplementedError("build_voice_asset is not yet implemented via the TTS Server path.")

    def is_engine_enabled(self, engine_id: str) -> bool:
        """Check whether an engine is enabled in settings."""
        registry = self._registry_loader()
        registration = registry.get(engine_id)
        if not registration:
            return False

        from app.db.state import get_settings
        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}
        default_enabled = registration.manifest.built_in or registration.manifest.verified
        return bool(enabled_plugins.get(engine_id, default_enabled))

    def get_synthesis_plan(self, request: dict[str, Any]) -> Any:
        """Query an engine for its preferred synthesis plan."""
        return self.remote.get_synthesis_plan(request)

    def verify_engine(self, engine_id: str) -> dict[str, Any]:
        """Trigger remote engine verification."""
        return self.remote.verify_engine(engine_id)

    def run_test(self, engine_id: str) -> dict[str, Any]:
        """Trigger remote engine self-contained test."""
        return self.remote.run_test(engine_id)

    def check_readiness(
        self, engine_id: str, profile_id: str, settings: dict[str, Any], profile_dir: str | None
    ) -> tuple[bool, str]:
        """Check if a voice profile is ready."""
        return True, "Assumed ready (TTS Server)"

    def describe_registry(self) -> list[dict[str, Any]]:
        """Return discovery metadata for all registered engines."""
        from .errors import EngineUnavailableError
        try:
            results = self.remote.describe_registry()
        except EngineUnavailableError as exc:
            # Fall back to local registry via our loader
            registry = self._registry_loader()
            results = [reg.to_dict() for reg in registry.values()]
            for data in results:
                # Mark as unavailable because the remote bridge (synthesis path) is down
                data["health"]["available"] = False
                data["health"]["ready"] = False
                data["health"]["status"] = "unavailable"
                data["health"]["message"] = f"TTS Server unavailable: {exc}"
                # Sync top-level status/message for UI compatibility
                data["status"] = "unavailable"
                data["health_message"] = data["health"]["message"]
                data["setup_message"] = data["health"]["message"]

        # Enrich with the latest plugin-local test metadata.
        from app.core.config import PLUGINS_DIR  # noqa: PLC0415
        for data in results:
            engine_id = data.get("engine_id")
            if not engine_id:
                continue
            safe_id = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in str(engine_id))
            meta_path = PLUGINS_DIR / f"tts_{safe_id}" / "assets" / "last_test.json"
            if meta_path.exists():
                try:
                    data["last_test"] = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    pass
        return results

    def update_engine_settings(self, engine_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Update and persist settings for an engine."""
        return self.remote.update_settings(engine_id, settings)

    def clear_engine_setting(self, engine_id: str, setting_key: str) -> dict[str, Any]:
        """Clear a read-only computed setting for an engine."""
        return self.remote.clear_setting(engine_id, setting_key)

    def refresh_plugins(self) -> dict[str, Any]:
        """Re-scan for new plugins."""
        return self.remote.refresh_plugins()

    def preview(
        self,
        engine_id_or_request: str | dict[str, Any],
        request: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Route preview request.

        Most callers pass a complete request payload containing ``engine_id``.
        The Settings engine test endpoint passes ``engine_id`` separately; this
        method normalizes both call shapes before routing.
        """
        if request is None:
            payload = dict(engine_id_or_request)
        else:
            payload = dict(request)
            payload.setdefault("engine_id", str(engine_id_or_request))

        return self.remote.preview(payload)

    def install_dependencies(self, engine_id: str) -> dict[str, Any]:
        """Trigger dependency installation."""
        return self.remote.install_dependencies(engine_id)

    def remove_plugin(self, engine_id: str) -> dict[str, Any]:
        """Uninstall a plugin."""
        return self.remote.delete_engine(engine_id)

    def import_plugin(self, file_content: bytes, filename: str) -> dict[str, Any]:
        """Import a plugin from a zip file."""
        return self.remote.import_plugin(file_content, filename)

    def install_plugin(self) -> dict[str, Any]:
        """Provide instructions for manual install."""
        return {
            "ok": False,
            "message": "Automated plugin installation is not yet supported. Please place plugin folders in the 'plugins/' directory manually and click 'Refresh Plugins'.",
        }

    def get_logs(self, engine_id: str) -> dict[str, Any]:
        """Fetch recent logs for an engine."""
        from .watchdog import get_watchdog # noqa: PLC0415
        watchdog = get_watchdog()

        logs = ""
        if watchdog:
            logs = watchdog.get_logs()

        if not logs:
            from app.core.config import BASE_DIR # noqa: PLC0415
            log_dir = BASE_DIR / "logs"

            msg = "Direct log streaming is not available in the UI."
            if log_dir.exists():
                msg += f" Please check the '{log_dir}' directory for detailed engine and server output."
            else:
                msg += " No 'logs/' directory was found in your Studio root."

            return {
                "ok": False,
                "logs": msg,
                "message": msg,
                "engine_id": engine_id,
            }

        return {
            "ok": True,
            "logs": logs,
            "message": "Logs retrieved from TTS Server buffer.",
            "engine_id": engine_id,
        }

def create_voice_bridge() -> VoiceBridge:
    """Create the voice bridge with registry dependency wiring."""
    return VoiceBridge(registry_loader=load_engine_registry)
