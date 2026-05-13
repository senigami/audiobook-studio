import time
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from dataclasses import asdict
from ...db.state import get_jobs, update_job as state_update_job

from ..utils import probe_audiobook_metadata


router = APIRouter(prefix="/api", tags=["jobs"])

@router.get("/jobs")
def api_jobs():
    """Returns jobs explicitly tracked in the active state."""
    all_jobs = get_jobs()

    # Only return jobs explicitly tracked in state
    jobs = [asdict(j) for j in all_jobs.values()]
    jobs.sort(key=lambda j: j.get('created_at', 0))


    # bandwidth optimization
    for j in jobs:
        if j.get('status') == 'running':
            continue
        if 'log' in j:
            del j['log']

    return JSONResponse(jobs[:400])

@router.get("/active_job")
def api_active_job():
    jobs = get_jobs()
    for job in jobs.values():
        if job.status == "running":
            return JSONResponse(asdict(job))
    return JSONResponse(None)

@router.get("/jobs/{job_id}")
def api_get_job(job_id: str):
    jobs = get_jobs()
    if job_id in jobs:
        return JSONResponse(asdict(jobs[job_id]))
    return JSONResponse({"status": "error", "message": "Job not found"}, status_code=404)

@router.post("/cancel")
def cancel(job_id: str = Form(...)):
    from ...orchestration.scheduler.orchestrator import create_orchestrator
    orchestrator = create_orchestrator()
    success = orchestrator.cancel(job_id)
    if success:
        return JSONResponse({"status": "ok", "message": f"Job {job_id} cancelled"})
    else:
        # Fallback to cancel the job directly in state if the orchestrator doesn't know about it.
        from ...db.state import get_jobs, update_job
        jobs = get_jobs()
        if job_id in jobs:
            update_job(job_id, status="cancelled", force_broadcast=True)
            return JSONResponse({"status": "ok", "message": f"Job {job_id} cancelled via state fallback"})
        return JSONResponse({"status": "error", "message": f"Job {job_id} not found"}, status_code=404)

@router.post("/jobs/update-title")
def update_job_title(chapter_file: str = Form(...), new_title: str = Form(...)):
    jobs = get_jobs()
    count = 0
    for jid, job in jobs.items():
        if job.chapter_file == chapter_file:
            job.custom_title = new_title
            state_update_job(jid, custom_title=new_title)
            count += 1
    return JSONResponse({"status": "ok", "updated": count})
