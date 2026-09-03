"""Queue-level render controls: pause/resume, cancel-all, cancel-chapter.

Split out of the former monolithic ``generation.py`` (Task 003 — API router
split).
"""
from __future__ import annotations
import logging
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from ...orchestration.scheduler.resources import set_paused
from ...db.state import update_job, get_jobs
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ..ws import broadcast_chapter_updated, broadcast_queue_update

router = APIRouter(tags=["generation"])
logger = logging.getLogger(__name__)


@router.post("/generation/pause")
def pause_queue():
    set_paused(True)
    return JSONResponse({"status": "ok"})

@router.post("/generation/resume")
def resume_queue():
    set_paused(False)
    return JSONResponse({"status": "ok"})

@router.post("/generation/cancel-all")
def cancel_pending():
    from ...db.state import get_jobs, delete_jobs
    from ...db import clear_queue

    # 1. Cancel in orchestrator
    orchestrator = create_orchestrator()
    jobs = get_jobs()
    for jid in jobs.keys():
        orchestrator.cancel(jid)

    # 2. Clear state.json
    jobs = get_jobs()
    delete_jobs(list(jobs.keys()))

    # 3. Clear DB processing_queue
    clear_queue()

    # 4. Notify UI
    broadcast_queue_update()

    return JSONResponse({"status": "ok", "message": "processes stopped"})

@router.post("/chapters/{chapter_id}/cancel")
def cancel_chapter_generation(chapter_id: str):
    orchestrator = create_orchestrator()
    jobs = get_jobs()
    for jid, job in jobs.items():
        if job.get("chapter_id") == chapter_id and job.get("status") in ["queued", "running", "preparing"]:
            if not orchestrator.cancel(jid):
                update_job(jid, status="cancelled", force_broadcast=True)
    broadcast_chapter_updated(chapter_id)
    return JSONResponse({"status": "ok"})
