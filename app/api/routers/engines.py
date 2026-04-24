from typing import Any
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
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
    except NotImplementedError as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=501)
    except Exception as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=500)


@router.post("/refresh")
def refresh_plugins():
    """Trigger a plugin re-scan (TTS Server path only)."""
    bridge = create_voice_bridge()
    try:
        result = bridge.refresh_plugins()
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=500)


@router.post("/{engine_id}/verify")
def verify_engine(engine_id: str):
    """Trigger verification for an engine."""
    bridge = create_voice_bridge()
    return bridge.verify_engine(engine_id)


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
