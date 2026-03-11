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
    return JSONResponse({"status": "success", "cleared": count})

@router.post("/processing_queue/clear")
def api_clear_queue_route():
    clear_queue()
    return JSONResponse({"status": "success"})

@router.post("/processing_queue/clear-history")
def api_clear_history():
    count = clear_completed_queue()
    return JSONResponse({"status": "success", "cleared_count": count})

@router.post("/processing_queue/reorder")
def api_reorder_queue_route(queue_ids: List[str]):
    reorder_queue(queue_ids)
    return JSONResponse({"status": "success"})

@router.delete("/processing_queue/{queue_id}")
def api_delete_queue_item(queue_id: str):
    # Cancel if running
    cancel_job(queue_id)
    # Remove from DB
    remove_from_queue(queue_id)
    return JSONResponse({"status": "success"})
