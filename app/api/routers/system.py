import uuid
import time
import json
import shutil
import anyio
import logging
from pathlib import Path
from typing import Optional, List, Any
from fastapi import APIRouter, Form, UploadFile, File, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from ... import config
from ...state import get_settings, update_settings, get_jobs, put_job, update_job
from ...jobs import paused, set_paused, cleanup_and_reconcile, enqueue
from ...db import list_speakers
from ...db.performance import get_render_stats, reset_render_stats
from ...models import Job
from ...pathing import safe_basename, safe_join_flat
from ..utils import read_preview
# Compatibility for tests that monkeypatch these
UPLOAD_DIR = config.UPLOAD_DIR
CHAPTER_DIR = config.CHAPTER_DIR
COVER_DIR = config.COVER_DIR
AUDIOBOOK_DIR = config.AUDIOBOOK_DIR
VOICES_DIR = config.VOICES_DIR
XTTS_OUT_DIR = config.XTTS_OUT_DIR

logger = logging.getLogger(__name__)


def get_upload_dir() -> Path:
    return UPLOAD_DIR


def get_chapter_dir() -> Path:
    return CHAPTER_DIR


def get_cover_dir() -> Path:
    return COVER_DIR


def get_audiobook_dir() -> Path:
    return AUDIOBOOK_DIR


def get_voices_dir() -> Path:
    return VOICES_DIR


def get_xtts_out_dir() -> Path:
    return XTTS_OUT_DIR

router = APIRouter(prefix="/api", tags=["system"])


def _build_runtime_services(request: Request) -> list[dict[str, Any]]:
    from ...engines.watchdog import get_watchdog

    services: list[dict[str, Any]] = []
    api_base_url = str(request.base_url).rstrip("/")
    services.append({
        "id": "backend",
        "label": "Backend API",
        "kind": "api",
        "url": api_base_url,
        "port": request.url.port,
        "healthy": True,
        "pingable": True,
        "status": "online",
        "message": "Responding to Studio API requests.",
        "can_restart": False,
    })

    watchdog = get_watchdog()
    if watchdog is None:
        services.append({
            "id": "tts_server",
            "label": "TTS Server",
            "kind": "tts_server",
            "url": None,
            "port": None,
            "healthy": False,
            "pingable": False,
            "status": "not running",
            "message": "The TTS Server watchdog has not started yet.",
            "can_restart": False,
        })
    else:
        healthy = watchdog.is_healthy()
        services.append({
            "id": "tts_server",
            "label": "TTS Server",
            "kind": "tts_server",
            "url": watchdog.get_url(),
            "port": watchdog.get_port(),
            "healthy": healthy,
            "pingable": healthy,
            "status": "healthy" if healthy else "unhealthy",
            "message": "Loaded plugins responded successfully." if healthy else "The TTS Server has stopped responding to health checks.",
            "can_restart": True,
            "circuit_open": watchdog.is_circuit_open(),
        })

    return services

@router.get("/home")
def api_home(
    request: Request,
    voices_dir: Path = Depends(get_voices_dir),
):
    """Returns initial data for the React SPA."""
    from .voices import list_speaker_profiles

    profiles = list_speaker_profiles()
    speakers = list_speakers()
    settings = get_settings()
    jobs = {j_id: job for j_id, job in get_jobs().items()}

    from ...db import list_projects
    projects = list_projects()

    from ...engines.bridge import create_voice_bridge
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        engines = bridge.describe_registry()
    except EngineUnavailableError:
        engines = []
    render_stats = get_render_stats()

    from ...engines.watchdog import get_watchdog
    watchdog = get_watchdog()

    if watchdog and watchdog.is_healthy():
        backend_mode = f"Managed Subprocess (TTS Server @ {watchdog.get_port()})"
    elif watchdog and watchdog.is_circuit_open():
        backend_mode = "Offline (Subprocess Crashed)"
    else:
        backend_mode = "Managed Subprocess (Starting/Initializing)"

    startup_ready = bool(watchdog and watchdog.is_healthy())
    if not watchdog:
        startup_message = "Starting Audiobook Studio Services"
        startup_detail = "Waiting for the TTS watchdog to initialize."
    elif not watchdog.is_healthy():
        if watchdog.is_circuit_open():
            startup_message = "Service Unavailable"
            startup_detail = "The TTS Server failed to start multiple times and is now offline."
        else:
            startup_message = "Starting Audiobook Studio Services"
            startup_detail = "Checking TTS plugins and runtime health."
    elif not engines:
        startup_message = "Audiobook Studio is ready."
        startup_detail = "TTS runtime is ready."
    else:
        startup_message = "Audiobook Studio is ready."
        startup_detail = "All services are available."

    return {
        "chapters": [],
        "jobs": jobs,
        "settings": settings,
        "engines": engines,
        "paused": paused(),
        "version": "2.0.0",
        "system_info": {
            "backend_mode": backend_mode,
            "orchestrator": "Studio 2.0",
            "api_base_url": str(request.base_url).rstrip("/"),
            "tts_server_url": watchdog.get_url() if (watchdog and watchdog.is_healthy()) else None,
            "startup_ready": startup_ready,
            "startup_message": startup_message,
            "startup_detail": startup_detail,
        },
        "runtime_services": _build_runtime_services(request),
        "narrator_ok": any(
            entry.is_dir() and entry.name == "Default"
            for entry in voices_dir.iterdir()
        ) if voices_dir.exists() else False,
        "speaker_profiles": profiles,
        "speakers": speakers,
        "projects": projects,
        "render_stats": render_stats,
    }


@router.post("/settings")
async def save_settings(
    request: Request,
    safe_mode: Optional[Any] = Form(None),
    enabled_plugins: Optional[str] = Form(None)
):
    updates = {}

    def to_bool(v):
        if isinstance(v, bool): return v
        s = str(v).lower()
        if s in ("true", "1", "on", "yes"): return True
        if s in ("false", "0", "off", "no"): return False
        return None

    # 1. Try JSON if content-type matches
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, dict):
                if "safe_mode" in body:
                    val = to_bool(body["safe_mode"])
                    if val is not None:
                        updates["safe_mode"] = val
                if "default_engine" in body and str(body["default_engine"]).strip():
                    updates["default_engine"] = str(body["default_engine"]).strip().lower()
                if "enabled_plugins" in body and isinstance(body["enabled_plugins"], dict):
                    updates["enabled_plugins"] = body["enabled_plugins"]
        except Exception:
            logger.warning("Failed to parse JSON settings payload", exc_info=True)

    try:
        form = await request.form()
    except Exception:
        form = None
    if form:
        if "safe_mode" not in updates and form.get("safe_mode") is not None:
            val = to_bool(form.get("safe_mode"))
            if val is not None:
                updates["safe_mode"] = val
        if "default_engine" not in updates and form.get("default_engine") is not None:
            updates["default_engine"] = str(form.get("default_engine") or "").strip().lower()
        if "enabled_plugins" not in updates and form.get("enabled_plugins") is not None:
            try:
                updates["enabled_plugins"] = json.loads(form.get("enabled_plugins"))
            except Exception:
                logger.warning("Failed to parse enabled_plugins from form")

    # 2. Try Form parameters (either from FastAPI's parsing or manual fallback)
    if "safe_mode" not in updates and safe_mode is not None:
        val = to_bool(safe_mode)
        if val is not None: updates["safe_mode"] = val

    if updates:
        update_settings(updates)

    return JSONResponse({"status": "ok", "settings": get_settings()})


@router.post("/system/render-stats/reset")
def api_reset_render_stats():
    stats = reset_render_stats()
    return JSONResponse({"status": "ok", "render_stats": stats})


@router.post("/system/tts-server/restart")
def api_restart_tts_server():
    from ...engines.watchdog import get_watchdog

    watchdog = get_watchdog()
    if watchdog is None:
        raise HTTPException(status_code=503, detail="TTS Server watchdog is not running.")
    watchdog.restart()
    return JSONResponse({"status": "ok", "message": "TTS Server restart requested."})








@router.post("/settings/default-speaker")
def set_default_speaker_settings(name: str = Form(...)):
    update_settings({"default_speaker_profile": name})
    return JSONResponse({"status": "ok"})
