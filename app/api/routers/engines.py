from pathlib import Path
from typing import Any
from uuid import uuid4
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
        # During startup the managed TTS Server can still be warming up.
        # Fall back to the local registry metadata so Settings can load
        # without surfacing a transient error.
        return bridge.local.describe_registry()


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
    from app.config import ENGINE_TEST_DIR  # noqa: PLC0415
    safe_engine_id = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in engine_id)
    audio_path = ENGINE_TEST_DIR / safe_engine_id / "last_test.wav"
    if not audio_path.exists():
        return JSONResponse({"ok": False, "message": "No test audio found"}, status_code=404)
    return FileResponse(audio_path, media_type="audio/wav")


@router.post("/{engine_id}/test")
def test_engine(engine_id: str):
    """Run a real sample render or a minimal playable voice sample path."""
    from ...engines.errors import EngineUnavailableError
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

    try:
        from app.config import ENGINE_TEST_DIR  # noqa: PLC0415
        import json
        import time

        safe_engine_id = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in engine_id)
        engine_test_root = ENGINE_TEST_DIR / safe_engine_id
        engine_test_root.mkdir(parents=True, exist_ok=True)

        output_path = engine_test_root / "last_test.wav"
        res = bridge.preview(engine_id, {
            "script_text": "This is a test of the synthesis engine. How do I sound?",
            "voice_profile_id": "Default", # Placeholder
            "voice_ref": voice_ref,
            "reference_audio_path": voice_ref,
            "output_path": str(output_path),
            "output_format": "wav"
        })
    except EngineUnavailableError as exc:
        return JSONResponse({"ok": False, "message": str(exc)}, status_code=503)

    if res.get("status") == "ok" or res.get("ok"):
        audio_path = res.get("audio_path")
        if audio_path and Path(audio_path).exists():
            generated_at = time.time()
            meta = {
                "ok": True,
                "engine_id": engine_id,
                "audio_url": f"/api/engines/{engine_id}/test/audio?t={generated_at}",
                "generated_at": generated_at,
                "message": "Test sample generated successfully."
            }
            (engine_test_root / "last_test.json").write_text(json.dumps(meta), encoding="utf-8")
            return JSONResponse(meta)

    return JSONResponse({"ok": False, "message": res.get("message") or "Test synthesis failed."}, status_code=500)


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
