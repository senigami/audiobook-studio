"""Voice bridge for Studio 2.0.

This is the only place that should route a voice request to a concrete engine
implementation.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.core.feature_flags import use_tts_server
from app.engines.registry import load_engine_registry
from app.engines.bridge_local import LocalBridgeHandler
from app.engines.bridge_remote import RemoteBridgeHandler
from app.engines.voice.base import BaseVoiceEngine
from app.engines.voice.sdk import TTSRequest, TTSResult
from app.state import get_settings, update_settings

logger = logging.getLogger(__name__)


class VoiceBridge:
    """Routes voice requests to the correct engine adapter or TTS Server.

    When ``USE_TTS_SERVER`` is enabled the bridge calls the TTS Server over
    HTTP. Otherwise it dispatches directly to the Single-Process engine adapter.
    """

    def __init__(self, *, registry_loader, tts_client_factory=None):
        self._legacy_local = LocalBridgeHandler(registry_loader=registry_loader)
        self.remote = RemoteBridgeHandler(tts_client_factory=tts_client_factory)

    @property
    def registry_loader(self):
        """Getter for legacy test monkeypatching."""
        return self._legacy_local.registry_loader

    @registry_loader.setter
    def registry_loader(self, value):
        """Setter for legacy test monkeypatching."""
        self._legacy_local.registry_loader = value

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route synthesis request."""
        if use_tts_server():
            return self.remote.synthesize(request)

        logger.warning("Synthesis routing to legacy local bridge. This path is deprecated.")
        return self._legacy_local.synthesize(request)

    def build_voice_asset(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route voice-asset build request."""
        if use_tts_server():
            raise NotImplementedError("build_voice_asset is not yet implemented via TTS Server path.")
        return self._legacy_local.build_voice_asset(request)

    def is_engine_enabled(self, engine_id: str) -> bool:
        """Check whether an engine is enabled in settings."""
        from app.state import get_settings
        registry = self._legacy_local.registry_loader()
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
        return self._legacy_local.get_synthesis_plan(request)

    def check_readiness(
        self, engine_id: str, profile_id: str, settings: dict[str, Any], profile_dir: str | None
    ) -> tuple[bool, str]:
        """Check if a voice profile is ready."""
        if use_tts_server():
            return True, "Assumed ready (TTS Server)"
        return self._legacy_local.check_readiness(engine_id, profile_id, settings, profile_dir)

    def describe_registry(self) -> list[dict[str, Any]]:
        """Return discovery metadata for all registered engines."""
        if use_tts_server():
            results = self.remote.describe_registry()
        else:
            results = self._legacy_local.describe_registry()

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
        if use_tts_server():
            return self.remote.update_settings(engine_id, settings)
        return self._legacy_local.update_engine_settings(engine_id, settings)

    def refresh_plugins(self) -> dict[str, Any]:
        """Re-scan for new plugins."""
        if use_tts_server():
            return self.remote.refresh_plugins()

        # For local path, we just clear the registry cache
        from app.engines.registry import load_engine_registry # noqa: PLC0415
        if hasattr(load_engine_registry, "cache_clear"):
            load_engine_registry.cache_clear()

        return {
            "ok": True,
            "message": "Local plugin registry cache cleared (Legacy path).",
            "loaded_count": len(self._legacy_local.registry_loader()),
        }

    def verify_engine(self, engine_id: str) -> dict[str, Any]:
        """Trigger verification synthesis."""
        if use_tts_server():
            return self.remote.verify_engine(engine_id)

        # Local path: use the verification runner directly
        from app.tts_server.verification import verify_plugin # noqa: PLC0415
        from app.tts_server.plugin_loader import LoadedPlugin # noqa: PLC0415

        registry = self._legacy_local.registry_loader()
        reg = registry.get(engine_id)
        if not reg:
            return {"ok": False, "message": f"Engine '{engine_id}' not found in local registry."}

        # Wrap the local engine. Legacy engines (XTTS, Voxtral) need a shim
        # to look like StudioTTSEngine for the verification runner.
        engine_wrapper = reg.engine
        if not hasattr(engine_wrapper, "check_env"):
            engine_wrapper = _LegacyEngineShim(reg.engine)

        plugin = LoadedPlugin(
            folder_name=engine_id,
            plugin_dir=Path(reg.manifest.module_path).parent,
            manifest=reg.manifest,
            engine=engine_wrapper
        )
        result = verify_plugin(plugin)
        if result.ok:
            # Update the in-memory manifest verified flag
            object.__setattr__(reg.manifest, "verified", True)

            # Persist the verified state in settings
            settings = get_settings()
            verified_plugins = dict(settings.get("verified_plugins") or {})
            verified_plugins[engine_id] = True
            update_settings(verified_plugins=verified_plugins)

        return {"ok": result.ok, "message": result.error if not result.ok else "Verified successfully", "duration_sec": result.duration_sec}

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

        if use_tts_server():
            return self.remote.preview(payload)
        return self._legacy_local.preview(payload)

    def install_dependencies(self, engine_id: str) -> dict[str, Any]:
        """Trigger dependency installation."""
        if use_tts_server():
            return self.remote.install_dependencies(engine_id)

        registry = self._legacy_local.registry_loader()
        reg = registry.get(engine_id)
        if not reg:
            return {"ok": False, "message": f"Engine '{engine_id}' not found in local registry."}

        # Resolve the requirements file path
        req_path = Path(reg.manifest.module_path.replace(".", "/") + ".py").parent / "requirements.txt"

        if not req_path.exists() and engine_id == "xtts":
            # Fallback for bundled XTTS requirements
            from app.config import BASE_DIR # noqa: PLC0415
            req_path = BASE_DIR / "app/engines/voice/xtts/requirements.txt"

        if not req_path.exists():
            return {"ok": False, "message": f"No requirements.txt found for engine '{engine_id}'."}

        import sys
        import subprocess

        python_exe = sys.executable
        logger.info("Installing dependencies for %s using %s ...", engine_id, python_exe)

        try:
            # We use -m pip to ensure we use the pip associated with the current python
            process = subprocess.run(
                [python_exe, "-m", "pip", "install", "-r", str(req_path)],
                capture_output=True,
                text=True,
                check=False
            )
            if process.returncode == 0:
                return {
                    "ok": True,
                    "message": f"Dependencies installed successfully for {engine_id}.",
                    "stdout": process.stdout
                }
            else:
                return {
                    "ok": False,
                    "message": f"Failed to install dependencies for {engine_id}.",
                    "stdout": process.stdout,
                    "stderr": process.stderr
                }
        except Exception as exc:
            return {
                "ok": False,
                "message": f"Error running dependency installation: {exc}"
            }

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
