import asyncio
import os
import sys
import threading
import logging
from typing import Optional, List
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .config import (
    VOICES_DIR, UPLOAD_DIR, REPORT_DIR, COVER_DIR, PROJECTS_DIR,
    FRONTEND_DIST
)
from .db import init_db
from .api import projects, chapters, voices, queue, settings, generation, system, analysis, jobs, migration, manager, engines
from .api.tts_api import tts_app
from .api.routers.analysis import AnalysisError

logger = logging.getLogger(__name__)

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}

app = FastAPI()


def _install_windows_disconnect_handler(loop: asyncio.AbstractEventLoop) -> None:
    previous_handler = loop.get_exception_handler()

    def handle_exception(active_loop: asyncio.AbstractEventLoop, context):
        exc = context.get("exception")
        message = str(context.get("message", ""))
        is_windows_disconnect = (
            isinstance(exc, ConnectionResetError)
            and getattr(exc, "winerror", None) == 10054
        )

        if is_windows_disconnect and "_ProactorBasePipeTransport._call_connection_lost" in message:
            logger.debug("Suppressed Windows client disconnect during streamed response: %s", exc)
            return

        if previous_handler is not None:
            previous_handler(active_loop, context)
        else:
            active_loop.default_exception_handler(context)

    loop.set_exception_handler(handle_exception)


def _contained_root_file(root: Path, filename: str) -> Optional[Path]:
    if not filename or Path(filename).name != filename:
        return None
    base_dir = os.path.abspath(os.path.normpath(os.fspath(root)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, filename)))
    if not fullpath.startswith(base_dir + os.sep):
        return None
    candidate = Path(fullpath)
    if not candidate.is_file():
        return None
    return candidate


def _contained_file(root: Path, relative_path: str) -> Optional[Path]:
    if not root.exists() or not relative_path:
        return None
    normalized_parts = [part for part in Path(relative_path).parts if part not in ("", ".", "/")]
    if not normalized_parts or any(part == ".." for part in normalized_parts):
        return None
    base_dir = os.path.abspath(os.path.normpath(os.fspath(root)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, *normalized_parts)))
    if not fullpath.startswith(base_dir + os.sep):
        return None
    candidate = Path(fullpath)
    if not candidate.is_file():
        return None
    return candidate


def _frontend_dist_file(full_path: str) -> Optional[Path]:
    # 1. Try exact match (e.g. "assets/foo.js" or "favicon.ico")
    file = _contained_file(FRONTEND_DIST, full_path)
    if file:
        return file

    # 2. Try stripping known route prefixes if it looks like an asset (e.g. "settings/assets/foo.js")
    # This handles deep-linked SPA reloads where the browser might request assets relatively.
    if "/" in full_path:
        parts = full_path.split("/")
        # If it looks like a deep link into assets or other dist files
        if any(p in {"assets", "docs", "static"} for p in parts):
            # Find the index of the first known asset directory
            for i, p in enumerate(parts):
                if p in {"assets", "docs", "static"}:
                    candidate_path = "/".join(parts[i:])
                    file = _contained_file(FRONTEND_DIST, candidate_path)
                    if file:
                        return file

    return None


def _frontend_index_response(index_file: Path) -> FileResponse:
    return FileResponse(index_file, headers=_NO_CACHE_HEADERS)

# --- Ensure mounted static roots exist before mounting ---
# StaticFiles raises at startup if the target directory is missing. These are the
# only directories that must exist at boot time. Other working directories
# (uploads, chapter text, reports) are created lazily by the endpoints that use
# them.
#
# VOICES_DIR and PROJECTS_DIR are mounted directly and must exist at startup.
for d in [VOICES_DIR, PROJECTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# --- Static File Serving ---
app.mount("/out/voices", StaticFiles(directory=str(VOICES_DIR)), name="out_voices")
app.mount("/projects", StaticFiles(directory=str(PROJECTS_DIR)), name="projects")

# Serve React build if it exists
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")



@app.get("/out/covers/{filename}")
def get_cover_output(filename: str):
    file_path = _contained_root_file(COVER_DIR, filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(file_path)

# --- WebSockets ---
_main_loop = [None]

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    if not _main_loop[0]:
        try:
            _main_loop[0] = asyncio.get_running_loop()
        except RuntimeError: pass
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(websocket)

@app.exception_handler(AnalysisError)
async def analysis_error_handler(request: Request, exc: AnalysisError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "message": exc.message}
    )

# --- Lifecycle Events ---
@app.on_event("startup")
def startup_event():
    # Capture the main event loop
    try:
        _main_loop[0] = asyncio.get_running_loop()
        if sys.platform.startswith("win"):
            _install_windows_disconnect_handler(_main_loop[0])
    except RuntimeError:
        pass # Handle case where loop isn't running yet

    # Initialize DB
    init_db()

    # Reconcile speaker metadata and default profile assignments during transition to v2 storage.
    try:
        from .db.migration import migrate_voice_profiles
        migrate_voice_profiles()
    except Exception as e:
        logger.warning(f"Startup Warning: Voice profile migration failed: {e}")


    # Move any shared global cover files into project-local storage so demo
    # assets are correctly partitioned in v2.
    try:
        from .db.migration import migrate_legacy_project_covers
        migrated = migrate_legacy_project_covers()
        if migrated > 0:
            logger.info("Startup: Migrated %s shared project cover(s) into project storage.", migrated)
    except Exception as e:
        logger.warning(f"Startup Warning: Project cover migration failed: {e}")

    # 1. Clear out any stuck jobs from state.json
    from .state import get_jobs, delete_jobs
    jobs = get_jobs()
    stuck_jids = [jid for jid, j in jobs.items() if j.status in ("queued", "running", "preparing", "finalizing")]
    if stuck_jids:
        delete_jobs(stuck_jids)
        logger.info(f"Startup: Cleared {len(stuck_jids)} stuck jobs from memory state.")

    # 2. Reconcile Database tables (Clear ghost indicators)
    try:
        from .db.reconcile import reconcile_all_chapter_statuses
        from .db.queue import reconcile_queue_status

        # Fresh job list after deletion
        remaining_jobs = get_jobs()
        active_statuses = {"queued", "preparing", "running", "finalizing"}
        terminal_statuses = {"done", "failed", "cancelled"}
        active_jobs = {
            jid: job
            for jid, job in remaining_jobs.items()
            if getattr(job, "status", None) in active_statuses
        }
        known_job_statuses = {
            jid: job.status
            for jid, job in remaining_jobs.items()
            if getattr(job, "status", None) in terminal_statuses
        }
        active_ids = list(active_jobs.keys())
        active_chapter_ids = {j.chapter_id for j in active_jobs.values() if j.chapter_id}

        reconcile_all_chapter_statuses(active_chapter_ids)
        reconcile_queue_status(active_ids, known_job_statuses)
        logger.info("Startup: Database reconciliation complete.")
    except Exception as e:
        logger.warning(f"Startup Warning: Database reconciliation failed: {e}")

    # 3. Register job listener for WebSocket updates
    from .state import add_job_listener
    from .api.ws import broadcast_job_updated
    from .orchestration.progress.broadcaster import configure_progress_broadcaster
    add_job_listener(broadcast_job_updated)
    configure_progress_broadcaster(lambda payload, _channel: manager.broadcast(payload))
    logger.info("Startup: Job listeners registered.")

    # 4. Restore Pause State
    from .state import get_settings
    from .orchestration.scheduler.resources import set_paused
    settings = get_settings()
    if settings.get("is_paused"):
        set_paused(True)
        logger.info("Startup: Queue restored to PAUSED state.")

    # 5. Studio 2.0 boot sequence — starts the TTS Server watchdog explicitly.
    #    Run in a background thread to prevent blocking the web server startup
    #    while engines are being verified.
    def _background_boot():
        try:
            from .boot import boot_studio
            boot_studio()
        except Exception as e:
            logger.warning(f"Startup Warning: Studio 2.0 boot sequence failed: {e}")

    threading.Thread(target=_background_boot, name="StudioBoot", daemon=True).start()


@app.on_event("shutdown")
def shutdown_event():
    from .orchestration.progress.broadcaster import configure_progress_broadcaster
    from .engines.proc_utils import terminate_all_subprocesses
    configure_progress_broadcaster(None)
    terminate_all_subprocesses()

async def tts_generate_stub(*args, **kwargs):
    """Dummy for tests that patch app.web.tts_generate_stub"""
    pass



@app.middleware("http")
async def lan_protection_middleware(request: Request, call_next):
    """Enforce 'local_only' vs 'lan' binding controls at the application level."""
    # Only protect the external TTS API and sensitive system endpoints.
    # The main UI is often bound to 0.0.0.0 for convenience, but the API
    # gateway should be explicit.
    if request.url.path.startswith("/api/v1/tts"):
        from app.state import get_settings  # noqa: PLC0415
        settings = get_settings()
        if not settings.get("lan_binding_enabled"):
            client_host = request.client.host if request.client else "127.0.0.1"
            # Basic loopback check.
            if client_host not in ("127.0.0.1", "localhost", "::1", "testclient"):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "LAN access to TTS API is disabled in Studio settings."}
                )

    return await call_next(request)

# --- Include Routers ---
app.include_router(projects.router)
app.include_router(chapters.router)
app.include_router(voices.router)
app.include_router(queue.router)
app.include_router(settings.router)
app.include_router(generation.router)
app.include_router(system.router)
app.include_router(analysis.router)
app.include_router(jobs.router)
app.include_router(migration.router)
app.include_router(engines.router)

# --- External TTS API ---
app.mount("/api/v1/tts", tts_app)

# --- Catch-all for React Router ---
@app.get("/{full_path:path}")
def catch_all(full_path: str):
    static_file = _frontend_dist_file(full_path)
    if static_file:
        return FileResponse(static_file)

    if full_path.startswith("api/") or "." in full_path.split("/")[-1]:
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return _frontend_index_response(index_file)

    # If no index, return a basic welcome for the API
    return JSONResponse({
        "name": "Audiobook Studio API",
        "status": "online",
        "frontend": "Not built/found",
        "endpoints": {
            "home": "/api/home",
            "jobs": "/api/jobs",
            "speaker_profiles": "/api/speaker-profiles"
        }
    })
