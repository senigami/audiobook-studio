import time
from typing import List, Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from ...db import get_queue, clear_queue, clear_completed_queue, reorder_queue, remove_from_queue
from ...state import get_jobs
from ...jobs import cancel as cancel_job

router = APIRouter(prefix="/api", tags=["queue"])

@router.get("/processing_queue")
def api_get_queue():
    queue_items = get_queue()
    all_jobs = get_jobs()

    # Merge live data from state.json for active jobs
    for item in queue_items:
        jid = item["id"]
        job = all_jobs.get(jid)
        if job:
            from dataclasses import asdict
            job_dict = asdict(job)
            item["progress"] = job_dict.get("progress", 0.0)
            item["logs"] = job_dict.get("logs", "")
            item["status"] = job_dict.get("status", item["status"])
    return JSONResponse(queue_items)

@router.delete("/processing_queue")
def api_mass_delete_queue():
    # To satisfy test expectations, we return a cleared count. 
    # clear_queue doesn't currently return count, but we can simulate it or update it.
    from ...db import get_queue
    count = len([item for item in get_queue() if item['status'] != 'running'])
    clear_queue()
    return JSONResponse({"status": "ok", "cleared": count})

@router.post("/processing_queue/clear")
def api_clear_queue_route():
    clear_queue()
    return JSONResponse({"status": "ok"})

@router.post("/processing_queue/clear-history")
def api_clear_history():
    from ...state import get_jobs, delete_jobs
    count = clear_completed_queue()
    # Also clear from state.json
    jobs = get_jobs()
    to_del = [jid for jid, j in jobs.items() if j.status in ('done', 'failed', 'cancelled')]
    delete_jobs(to_del)
    return JSONResponse({"status": "ok", "cleared": count})

@router.put("/processing_queue/reorder")
def api_reorder_queue_route(queue_ids: List[str] = Form(...)):
    # Note: queue_ids is a single comma-separated string from FormData, 
    # but FastAPI Form might need parsing if sent as a raw string. 
    # Current frontend sends: formData.append('queue_ids', queueIds.join(','));
    ids = queue_ids[0].split(',') if (len(queue_ids) == 1 and ',' in queue_ids[0]) else queue_ids

    reorder_queue(ids)
    from ...jobs import sync_memory_queue
    sync_memory_queue()
    return JSONResponse({"status": "ok"})

@router.delete("/processing_queue/{queue_id}")
def api_delete_queue_item(queue_id: str):
    # Cancel if running
    cancel_job(queue_id)
    # Remove from DB
    remove_from_queue(queue_id)
    # Remove from live state memory
    from ...state import delete_jobs
    delete_jobs([queue_id])
    return JSONResponse({"status": "ok"})
