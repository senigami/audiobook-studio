import time
from typing import List, Optional
from dataclasses import asdict
from pydantic import BaseModel
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from ...db import get_queue, clear_queue, clear_completed_queue, reorder_queue, remove_from_queue
from ...db.state import get_jobs

from ..ws import broadcast_queue_update

router = APIRouter(prefix="/api", tags=["queue"])
ACTIVE_JOB_STATUSES = {"queued", "preparing", "running", "finalizing"}
TERMINAL_JOB_STATUSES = {"done", "failed", "cancelled"}
_LIVE_QUEUE_JOB_FIELDS = (
    "progress",
    "status",
    "started_at",
    "updated_at",
    "eta_seconds",
    "segment_ids",
    "engine",
    "custom_title",
    "active_segment_id",
    "active_segment_progress",
    "render_group_count",
    "completed_render_groups",
    "active_render_group_index",
    "total_render_weight",
    "completed_render_weight",
    "active_render_group_weight",
    "grouped_progress",
    "reason_code",
    "active_render_batch_id",
    "active_render_batch_progress",
)


def _merge_live_queue_job(item: dict, job) -> None:
    job_dict = asdict(job)
    for field in _LIVE_QUEUE_JOB_FIELDS:
        value = job_dict.get(field)
        if value is not None:
            item[field] = value



@router.get("/processing_queue")
def api_get_queue():
    from ...db import reconcile_queue_status
    from ...db.reconcile import reconcile_all_chapter_statuses

    # ensure_workers() - Decommissioned for V2
    queue_items = get_queue()
    all_jobs = get_jobs()
    active_jobs = {
        job_id: job
        for job_id, job in all_jobs.items()
        if getattr(job, "status", None) in ACTIVE_JOB_STATUSES
    }
    active_ids = list(active_jobs.keys())
    active_chapter_ids = {
        job.chapter_id
        for job in active_jobs.values()
        if getattr(job, "chapter_id", None)
    }
    terminal_job_statuses = {
        job_id: job.status
        for job_id, job in all_jobs.items()
        if getattr(job, "status", None) in TERMINAL_JOB_STATUSES
    }

    needs_reconcile = any(
        (
            item["status"] in ("queued", "preparing", "running", "finalizing")
            and (
                item["id"] not in active_ids
                or item["id"] in terminal_job_statuses
            )
        )
        for item in queue_items
    )
    if needs_reconcile:
        reconcile_queue_status(active_ids, terminal_job_statuses)
        reconcile_all_chapter_statuses(active_chapter_ids)
        queue_items = get_queue()

    active_queue_chapter_ids = {
        item["chapter_id"]
        for item in queue_items
        if item.get("chapter_id") and item.get("status") in ACTIVE_JOB_STATUSES
    }

    # Merge live data from state.json for active jobs
    now = time.time()
    for item in queue_items:
        jid = item["id"]
        job = all_jobs.get(jid)
        if job:
            _merge_live_queue_job(item, job)
    return JSONResponse(queue_items)

@router.delete("/processing_queue")
def api_mass_delete_queue():
    from ...db import get_queue
    from ...db.state import get_jobs, delete_jobs
    count = len([item for item in get_queue() if item['status'] != 'running'])
    clear_queue()
    # Clear all non-running jobs from in-memory state too
    jobs = get_jobs()
    to_del = [jid for jid, j in jobs.items() if j.status in ('queued', 'done', 'failed', 'cancelled')]
    delete_jobs(to_del)
    broadcast_queue_update()
    return JSONResponse({"status": "ok", "message": "processes stopped", "cleared": count})

@router.post("/processing_queue/clear")
def api_clear_queue_route():
    clear_queue()
    broadcast_queue_update()
    return JSONResponse({"status": "ok"})

@router.post("/processing_queue/clear_completed")
def api_clear_completed():
    from ...db.state import get_jobs, delete_jobs
    count = clear_completed_queue()
    # Also clear from state.json
    jobs = get_jobs()
    to_del = [jid for jid, j in jobs.items() if j.status in ('done', 'failed', 'cancelled')]
    delete_jobs(to_del)
    broadcast_queue_update()
    return JSONResponse({"status": "ok", "cleared": count})

class ReorderRequest(BaseModel):
    queue_ids: List[str]

@router.put("/processing_queue/reorder")
def api_reorder_queue_route(request: ReorderRequest):
    reorder_queue(request.queue_ids)
    # sync_memory_queue() - Decommissioned for V2
    broadcast_queue_update()
    return JSONResponse({"status": "ok"})

@router.delete("/processing_queue/{queue_id}")
def api_delete_queue_item(queue_id: str):
    # Cancel if running
    from ...orchestration.scheduler.orchestrator import create_orchestrator
    orchestrator = create_orchestrator()
    if not orchestrator.cancel(queue_id):
        from ...db.state import get_jobs, update_job
        jobs = get_jobs()
        if queue_id in jobs:
            update_job(queue_id, status="cancelled", force_broadcast=True)
    # Remove from DB
    remove_from_queue(queue_id)
    # Remove from live state memory
    from ...db.state import delete_jobs
    delete_jobs([queue_id])
    broadcast_queue_update()
    return JSONResponse({"status": "ok"})
