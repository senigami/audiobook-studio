from pathlib import Path
from typing import Any, Optional
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse, FileResponse
from ...engines.bridge import create_voice_bridge

router = APIRouter(prefix="/api/engines", tags=["engines"])


@router.get("")
def list_engines():
    """List all registered TTS engines and their health/manifests."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.describe_registry()
    except EngineUnavailableError as exc:
        # We no longer fall back to the local registry in production.
        # This prevents masking TTS Server failures.
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)


@router.put("/{engine_id}/settings")
def update_engine_settings(engine_id: str, settings: dict[str, Any] = Body(...)):
    """Update settings for a specific engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        result = bridge.update_engine_settings(engine_id, settings)
        return JSONResponse(result)
    except EngineUnavailableError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)
    except NotImplementedError:
        return JSONResponse({"status": "error", "message": "Feature not implemented"}, status_code=501)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"Engine settings update failed: {exc}")
        return JSONResponse({"status": "error", "message": "Failed to update engine settings"}, status_code=500)


@router.delete("/{engine_id}/settings/{setting_key}")
def clear_engine_setting(engine_id: str, setting_key: str):
    """Clear a read-only computed setting for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        result = bridge.clear_engine_setting(engine_id, setting_key)
        return JSONResponse(result)
    except EngineUnavailableError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"Engine setting reset failed: {exc}")
        return JSONResponse({"status": "error", "message": "Failed to reset engine setting"}, status_code=500)


@router.post("/refresh")
def refresh_plugins():
    """Trigger a plugin re-scan (TTS Server path only)."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        result = bridge.refresh_plugins()
        return JSONResponse(result)
    except EngineUnavailableError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"Plugin refresh failed: {exc}")
        return JSONResponse({"status": "error", "message": "Failed to refresh plugins"}, status_code=500)


@router.post("/{engine_id}/verify")
def verify_engine(engine_id: str):
    """Trigger verification for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.verify_engine(engine_id)
    except EngineUnavailableError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)


@router.get("/{engine_id}/test/audio")
def get_test_audio(engine_id: str):
    """Retrieve the latest test audio for an engine."""
    from ...engines.registry import load_engine_registry  # noqa: PLC0415
    registry = load_engine_registry()
    reg = registry.get(engine_id)
    if not reg:
        return JSONResponse({"ok": False, "message": "Engine not found"}, status_code=404)

    plugin_dir = _resolve_plugin_dir(engine_id=engine_id, module_path=reg.manifest.module_path)
    if not plugin_dir:
        return JSONResponse({"ok": False, "message": "Could not resolve plugin directory"}, status_code=404)
    audio_path = plugin_dir / "assets" / "test_output.wav"

    if not audio_path.exists():
        return JSONResponse({"ok": False, "message": "No test audio found"}, status_code=404)
    return FileResponse(audio_path, media_type="audio/wav")


@router.post("/{engine_id}/test")
def test_engine(engine_id: str):
    """Run a self-contained synthesis test on the engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()

    try:
        # 1. Trigger the self-contained test run on the TTS Server
        res = bridge.run_test(engine_id)
        if not res.get("ok"):
            return JSONResponse({"ok": False, "message": f"Test failed: {res.get('message')}"}, status_code=400)

        from ...engines.registry import load_engine_registry  # noqa: PLC0415
        registry = load_engine_registry()
        reg = registry.get(engine_id)
        if not reg:
             return JSONResponse({"ok": False, "message": "Engine not found"}, status_code=404)

        plugin_dir = _resolve_plugin_dir(engine_id=engine_id, module_path=reg.manifest.module_path)
        if not plugin_dir:
             return JSONResponse({"ok": False, "message": "Could not resolve plugin directory"}, status_code=404)
        output_path = plugin_dir / "assets" / "test_output.wav"

        if not output_path.exists():
             return JSONResponse({"ok": False, "message": "Test passed but output audio not found in plugin folder"}, status_code=404)

        import json
        import time

        last_test_path = plugin_dir / "assets" / "last_test.json"
        last_test_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "ok": True,
            "audio_url": f"/api/engines/{engine_id}/test/audio",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        last_test_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        return JSONResponse(payload)

    except EngineUnavailableError as exc:
        return JSONResponse({"ok": False, "message": str(exc)}, status_code=503)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("Engine test failed")
        return JSONResponse({"ok": False, "message": f"Engine test failed: {exc}"}, status_code=500)


@router.post("/{engine_id}/install")
def install_engine_dependencies(engine_id: str):
    """Trigger dependency installation for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.install_dependencies(engine_id)
    except EngineUnavailableError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)


@router.delete("/{engine_id}")
def remove_engine_plugin(engine_id: str):
    """Remove an engine plugin."""
    bridge = create_voice_bridge()
    return bridge.remove_plugin(engine_id)


@router.get("/{engine_id}/logs")
def get_engine_logs(engine_id: str):
    """Fetch logs for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.get_logs(engine_id)
    except EngineUnavailableError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=503)


@router.post("/install")
def install_plugin():
    """Request plugin installation instructions or trigger install."""
    bridge = create_voice_bridge()
    return bridge.install_plugin()


# Removed self-contained resolution helpers; they are now owned by the plugins.


def _is_generated_sample_name(sample_name: str) -> bool:
    sample_path = Path(sample_name)
    return sample_path.name == sample_name and sample_name in {"sample.wav", "sample.mp3"}


def _resolve_plugin_dir(*, engine_id: str, module_path: str) -> Optional[Path]:
    from app.core.config import PLUGINS_DIR  # noqa: PLC0415

    parts = module_path.split(".")
    if len(parts) > 1 and parts[0] == "plugins":
        return PLUGINS_DIR / parts[1]

    safe_engine_id = "".join(ch for ch in engine_id if ch.isalnum() or ch in ("-", "_"))
    if safe_engine_id:
        return PLUGINS_DIR / f"tts_{safe_engine_id}"

    return None
