"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.engines.registry import load_engine_registry
from app.engines.bridge_remote import RemoteBridgeHandler
from app.state import get_settings

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

    def build_voice_asset(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route voice-asset build request."""
        raise NotImplementedError("build_voice_asset is not yet implemented via the TTS Server path.")

    def is_engine_enabled(self, engine_id: str) -> bool:
        """Check whether an engine is enabled in settings."""
        registry = self._registry_loader()
        registration = registry.get(engine_id)
        if not registration:
            return False

        settings = get_settings()
        enabled_plugins = settings.get("enabled_plugins") or {}
        default_enabled = registration.manifest.built_in or registration.manifest.verified
        return bool(enabled_plugins.get(engine_id, default_enabled))

    def get_synthesis_plan(self, request: dict[str, Any]) -> Any:
        """Query an engine for its preferred synthesis plan."""
        return self.remote.get_synthesis_plan(request)

    def check_readiness(
        self, engine_id: str, profile_id: str, settings: dict[str, Any], profile_dir: str | None
    ) -> tuple[bool, str]:
        """Check if a voice profile is ready."""
        return True, "Assumed ready (TTS Server)"

    def describe_registry(self) -> list[dict[str, Any]]:
        """Return discovery metadata for all registered engines."""
        results = self.remote.describe_registry()

        # Enrich with last test results
        from app.config import ENGINE_TEST_DIR  # noqa: PLC0415
        import json
        if ENGINE_TEST_DIR.exists():
            for data in results:
                engine_id = data.get("engine_id")
                if not engine_id:
                    continue
                safe_id = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in engine_id)
                meta_path = ENGINE_TEST_DIR / safe_id / "last_test.json"
                if meta_path.exists():
                    try:
                        data["last_test"] = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:
                        pass
        return results

    def update_engine_settings(self, engine_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Update and persist settings for an engine."""
        return self.remote.update_settings(engine_id, settings)

    def refresh_plugins(self) -> dict[str, Any]:
        """Re-scan for new plugins."""
        return self.remote.refresh_plugins()

    def verify_engine(self, engine_id: str) -> dict[str, Any]:
        """Trigger verification synthesis."""
        return self.remote.verify_engine(engine_id)

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
        return {"ok": False, "message": f"Plugin removal not implemented for {engine_id}."}

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
            from app.config import BASE_DIR # noqa: PLC0415
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

class _LegacyEngineShim:
    """Shim to make BaseVoiceEngine look like StudioTTSEngine for verification."""
    def __init__(self, engine: BaseVoiceEngine):
        self.engine = engine

    def check_env(self) -> tuple[bool, str]:
        health = self.engine.describe_health()
        return health.ready, health.message or "OK"

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        try:
            # BaseVoiceEngine.validate_request takes a dict
            self.engine.validate_request({
                "script_text": req.text,
                "output_path": req.output_path,
                "voice_profile_id": "Default",
                "voice_ref": req.voice_ref,
                "engine_id": getattr(self.engine, "manifest", None).engine_id if hasattr(self.engine, "manifest") else None
            })
            return True, "OK"
        except Exception as exc:
            return False, str(exc)

    def synthesize(self, req: TTSRequest) -> dict[str, Any]:
        # BaseVoiceEngine.synthesize takes a dict and returns a dict
        return self.engine.synthesize({
            "script_text": req.text,
            "output_path": req.output_path,
            "voice_profile_id": "Default",
            "voice_ref": req.voice_ref
        })


def create_voice_bridge() -> VoiceBridge:
    """Create the voice bridge with registry dependency wiring."""
    return VoiceBridge(registry_loader=load_engine_registry)
