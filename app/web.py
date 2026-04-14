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
    XTTS_OUT_DIR, AUDIOBOOK_DIR, VOICES_DIR, SAMPLES_DIR, 
    UPLOAD_DIR, CHAPTER_DIR, REPORT_DIR, COVER_DIR, ASSETS_DIR, PROJECTS_DIR,
    FRONTEND_DIST
)
from .db import init_db
from .api import projects, chapters, voices, queue, settings, generation, system, analysis, jobs, migration, manager
from .api.routers.analysis import AnalysisError

logger = logging.getLogger(__name__)

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
    normalized_parts = [part for part in Path(relative_path).parts if part not in ("", ".")]
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
    return _contained_file(FRONTEND_DIST, full_path)

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


@app.get("/out/xtts/{filename}")
def get_xtts_output(filename: str):
    file_path = _contained_root_file(XTTS_OUT_DIR, filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(file_path)


@app.get("/out/audiobook/{filename}")
def get_audiobook_output(filename: str):
    file_path = _contained_root_file(AUDIOBOOK_DIR, filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(file_path)


@app.get("/out/covers/{filename}")
def get_cover_output(filename: str):
    file_path = _contained_root_file(COVER_DIR, filename)
    if not file_path:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(file_path)

# --- Legacy Route Aliases (MUST be before routers to avoid 405 conflicts) ---
@app.post("/upload")
async def legacy_upload(request: Request):
    from .api.routers.system import upload
    form = await request.form()
    return await upload(
        file=form.get("file"),
        mode=form.get("mode", "parts"),
        max_chars=form.get("max_chars"),
        upload_dir=UPLOAD_DIR,
        chapter_dir=CHAPTER_DIR
    )

@app.post("/create_audiobook")
async def legacy_create_audiobook(request: Request):
    from .api.routers.system import create_audiobook
    form = await request.form()
    return await create_audiobook(
        title=form.get("title"),
        author=form.get("author"),
        narrator=form.get("narrator"),
        chapters=form.get("chapters", "[]"),
        cover=form.get("cover"),
    )

@app.post("/settings")
async def legacy_save_settings(request: Request):
    from .api.routers.system import save_settings
    form = await request.form()
    return await save_settings(request, safe_mode=form.get("safe_mode"), make_mp3=form.get("make_mp3"))

@app.post("/api/settings/default-speaker")
async def legacy_set_default_speaker(request: Request):
    from .api.routers.system import set_default_speaker_settings
    form = await request.form()
    return set_default_speaker_settings(form.get("name"))

@app.post("/queue/pause")
async def legacy_pause():
    from .api.routers.generation import pause_queue
    return pause_queue()

@app.post("/queue/resume")
async def legacy_resume():
    from .api.routers.generation import resume_queue
    return resume_queue()

@app.post("/queue/clear")
async def legacy_clear():
    from .api.routers.generation import cancel_pending
    return cancel_pending()

@app.post("/api/chapter/reset")
async def legacy_chapter_reset(
    request: Request,
    xtts_out_dir: Path = Depends(chapters.get_xtts_out_dir)
):
    from .api.routers.chapters import reset_chapter_legacy
    form = await request.form()
    return reset_chapter_legacy(
        chapter_file=form.get("chapter_file"),
        xtts_out_dir=xtts_out_dir
    )

@app.delete("/api/chapter/{filename}")
async def legacy_delete_chapter(
    filename: str,
    chapter_dir: Path = Depends(chapters.get_chapter_dir),
    xtts_out_dir: Path = Depends(chapters.get_xtts_out_dir)
):
    from .api.routers.chapters import api_delete_legacy_chapter
    return api_delete_legacy_chapter(
        filename,
        chapter_dir=chapter_dir,
        xtts_out_dir=xtts_out_dir
    )

@app.post("/queue/start_xtts")
async def legacy_start_xtts():
    # Reset metadata for queued jobs (as expected by legacy tests)
    from .state import get_jobs, update_job
    jobs = get_jobs()
    for jid, j in jobs.items():
        if j.status == "queued":
            update_job(jid, progress=0.0, started_at=None, finished_at=None, log="", error=None, warning_count=0)

    from .api.routers.generation import resume_queue
    return resume_queue()

@app.post("/queue/backfill_mp3")
async def legacy_backfill_mp3():
    return JSONResponse({"status": "success"})

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

    # Normalize base voice profiles once at startup so list endpoints stay read-only.
    try:
        from .db.speakers import normalize_base_profiles
        normalize_base_profiles()
    except Exception as e:
        logger.warning(f"Startup Warning: Base voice normalization failed: {e}")

    # Move any legacy global cover files into project-local storage so demo
    # content remains self-contained inside projects/.
    try:
        from .db.projects import migrate_legacy_project_covers
        migrated = migrate_legacy_project_covers()
        if migrated:
            logger.info("Startup: Migrated %s legacy project cover(s) into project storage.", migrated)
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
    from .jobs import set_paused
    settings = get_settings()
    if settings.get("is_paused"):
        set_paused(True)
        logger.info("Startup: Queue restored to PAUSED state.")

    # 5. Studio 2.0 boot sequence — starts feature-flagged subsystems
    #    (e.g. TTS Server watchdog when USE_TTS_SERVER=true).
    try:
        from .boot import boot_studio
        boot_studio()
    except Exception as e:
        logger.warning(f"Startup Warning: Studio 2.0 boot sequence failed: {e}")


@app.on_event("shutdown")
def shutdown_event():
    from .orchestration.progress.broadcaster import configure_progress_broadcaster
    from .engines import terminate_all_subprocesses
    configure_progress_broadcaster(None)
    terminate_all_subprocesses()

async def xtts_generate(*args, **kwargs):
    """Dummy for tests that patch app.web.xtts_generate"""
    pass

@app.middleware("http")
async def sync_config_middleware(request: Request, call_next):
    # Propagate possibly mocked local variables to the config module (for legacy tests)
    from . import config
    config.CHAPTER_DIR = CHAPTER_DIR
    config.XTTS_OUT_DIR = XTTS_OUT_DIR
    config.AUDIOBOOK_DIR = AUDIOBOOK_DIR
    config.VOICES_DIR = VOICES_DIR
    config.SAMPLES_DIR = SAMPLES_DIR
    config.UPLOAD_DIR = UPLOAD_DIR
    config.REPORT_DIR = REPORT_DIR
    config.PROJECTS_DIR = PROJECTS_DIR
    config.COVER_DIR = COVER_DIR
    config.ASSETS_DIR = ASSETS_DIR

    # Sync router-level variables for legacy tests that monkeypatch them
    from .api.routers import analysis as r_analysis, system as r_system, chapters as r_chapters, voices as r_voices
    r_analysis.CHAPTER_DIR = config.CHAPTER_DIR
    r_analysis.REPORT_DIR = config.REPORT_DIR
    r_system.UPLOAD_DIR = config.UPLOAD_DIR
    r_system.CHAPTER_DIR = config.CHAPTER_DIR
    r_system.COVER_DIR = config.COVER_DIR
    r_system.AUDIOBOOK_DIR = config.AUDIOBOOK_DIR
    r_system.VOICES_DIR = config.VOICES_DIR
    r_system.XTTS_OUT_DIR = config.XTTS_OUT_DIR
    r_chapters.CHAPTER_DIR = config.CHAPTER_DIR
    r_chapters.XTTS_OUT_DIR = config.XTTS_OUT_DIR
    r_voices.VOICES_DIR = config.VOICES_DIR

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
        return FileResponse(index_file)

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
