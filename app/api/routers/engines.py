from pathlib import Path
from typing import Any
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse, FileResponse
from ...engines.bridge import create_voice_bridge

router = APIRouter(prefix="/api/engines", tags=["engines"])


@router.get("")
def list_engines():
    """List all registered TTS engines and their health/manifests."""
    bridge = create_voice_bridge()
    return bridge.describe_registry()


@router.put("/{engine_id}/settings")
def update_engine_settings(engine_id: str, settings: dict[str, Any] = Body(...)):
    """Update settings for a specific engine."""
    bridge = create_voice_bridge()
    try:
        result = bridge.update_engine_settings(engine_id, settings)
        return JSONResponse(result)
    except NotImplementedError:
        return JSONResponse({"status": "error", "message": "Feature not implemented"}, status_code=501)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"Engine settings update failed: {exc}")
        return JSONResponse({"status": "error", "message": "Failed to update engine settings"}, status_code=500)


@router.post("/refresh")
def refresh_plugins():
    """Trigger a plugin re-scan (TTS Server path only)."""
    bridge = create_voice_bridge()
    try:
        result = bridge.refresh_plugins()
        return JSONResponse(result)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"Plugin refresh failed: {exc}")
        return JSONResponse({"status": "error", "message": "Failed to refresh plugins"}, status_code=500)


@router.post("/{engine_id}/verify")
def verify_engine(engine_id: str):
    """Trigger verification for an engine."""
    bridge = create_voice_bridge()
    return bridge.verify_engine(engine_id)


@router.post("/{engine_id}/test")
def test_engine(engine_id: str):
    """Run a real sample render or a minimal playable voice sample path."""
    bridge = create_voice_bridge()

    # Resolve the default voice for testing
    from app.tts_server.verification import _resolve_default_voice_reference # noqa: PLC0415
    voice_ref, error = _resolve_default_voice_reference()

    # If no default voice, look for a bundled sample in the plugin directory
    if error:
        registry = bridge.local.registry_loader()
        reg = registry.get(engine_id)
        if reg:
            plugin_dir = Path(reg.manifest.module_path.replace(".", "/") + ".py").parent
            bundled = plugin_dir / "sample.wav"
            if bundled.exists():
                voice_ref = str(bundled)
                error = None

    if error:
        return JSONResponse({"ok": False, "message": f"Test failed: {error}"}, status_code=400)

    res = bridge.preview(engine_id, {
        "script_text": "This is a test of the synthesis engine. How do I sound?",
        "voice_profile_id": "Default", # Placeholder
        "voice_ref": voice_ref,
        "output_format": "wav"
    })

    if res.get("status") == "ok" or res.get("ok"):
        audio_path = res.get("audio_path")
        if audio_path and Path(audio_path).exists():
            return FileResponse(audio_path, media_type="audio/wav")

    return JSONResponse({"ok": False, "message": res.get("message") or "Test synthesis failed."}, status_code=500)


@router.post("/{engine_id}/install")
def install_engine_dependencies(engine_id: str):
    """Trigger dependency installation for an engine."""
    bridge = create_voice_bridge()
    return bridge.install_dependencies(engine_id)


@router.delete("/{engine_id}")
def remove_engine_plugin(engine_id: str):
    """Remove an engine plugin."""
    bridge = create_voice_bridge()
    return bridge.remove_plugin(engine_id)


@router.get("/{engine_id}/logs")
def get_engine_logs(engine_id: str):
    """Fetch logs for an engine."""
    bridge = create_voice_bridge()
    return bridge.get_logs(engine_id)


@router.post("/install")
def install_plugin():
    """Request plugin installation instructions or trigger install."""
    bridge = create_voice_bridge()
    return bridge.install_plugin()
