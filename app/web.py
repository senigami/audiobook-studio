import asyncio
import os
import sys
import threading
from typing import Optional, List
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .config import (
    BASE_DIR, XTTS_OUT_DIR, AUDIOBOOK_DIR, VOICES_DIR, SAMPLES_DIR, 
    UPLOAD_DIR, CHAPTER_DIR, REPORT_DIR, COVER_DIR, ASSETS_DIR, PROJECTS_DIR,
    FRONTEND_DIST
)
from .db import init_db
from .api import projects, chapters, voices, queue, settings, generation, system, analysis, jobs, migration, manager

app = FastAPI()

# --- Static File Serving ---
# --- Static File Serving ---
app.mount("/out/xtts", StaticFiles(directory=str(XTTS_OUT_DIR)), name="out_xtts")
app.mount("/out/audiobook", StaticFiles(directory=str(AUDIOBOOK_DIR)), name="out_audiobook")
app.mount("/out/voices", StaticFiles(directory=str(VOICES_DIR)), name="out_voices")
app.mount("/out/samples", StaticFiles(directory=str(SAMPLES_DIR)), name="out_samples")
app.mount("/out/covers", StaticFiles(directory=str(COVER_DIR)), name="out_covers")
app.mount("/projects", StaticFiles(directory=str(PROJECTS_DIR)), name="projects")

# Serve React build if it exists
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

# --- Legacy Route Aliases (MUST be before routers to avoid 405 conflicts) ---
@app.post("/upload")
async def legacy_upload(request: Request):
    from .api.routers.system import upload
    form = await request.form()
    return await upload(
        file=form.get("file"),
        mode=form.get("mode", "parts"),
        max_chars=form.get("max_chars")
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
        cover=form.get("cover")
    )

@app.post("/settings")
@app.post("/api/settings")
async def legacy_save_settings(request: Request):
    from .api.routers.system import save_settings
    form = await request.form()
    return save_settings(
        safe_mode=form.get("safe_mode"),
        make_mp3=form.get("make_mp3")
    )

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

@app.post("/api/processing_queue/clear_completed")
async def legacy_clear_completed():
    from .api.routers.queue import api_clear_history
    return api_clear_history()

@app.post("/api/chapter/reset")
async def legacy_chapter_reset(request: Request):
    from .api.routers.chapters import reset_chapter_legacy
    form = await request.form()
    return reset_chapter_legacy(form.get("chapter_file"))

@app.delete("/api/chapter/{filename}")
async def legacy_delete_chapter(filename: str):
    from .api.routers.chapters import api_delete_legacy_chapter
    return api_delete_legacy_chapter(filename)

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
        print(f"WS error: {e}")
        manager.disconnect(websocket)

# --- Lifecycle Events ---
@app.on_event("startup")
def startup_event():
    # Capture the main event loop
    try:
        _main_loop[0] = asyncio.get_running_loop()
    except RuntimeError:
        pass # Handle case where loop isn't running yet

    # Initialize DB
    init_db()

    # Ensure directories exist
    for d in [XTTS_OUT_DIR, AUDIOBOOK_DIR, VOICES_DIR, SAMPLES_DIR, UPLOAD_DIR, CHAPTER_DIR, REPORT_DIR, COVER_DIR, ASSETS_DIR, PROJECTS_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    # Recovery: Delete queued/running jobs on startup (clean slate)
    from .state import get_jobs, delete_jobs
    jobs = get_jobs()
    to_del = [jid for jid, j in jobs.items() if j.status in ("queued", "running")]
    if to_del:
        delete_jobs(to_del)

@app.on_event("shutdown")
def shutdown_event():
    from .engines import terminate_all_subprocesses
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
