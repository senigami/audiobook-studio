import time
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from dataclasses import asdict
from ...state import get_jobs, update_job as state_update_job
from ...jobs import cancel as cancel_job_worker
from ...config import XTTS_OUT_DIR
from ..utils import legacy_list_chapters

router = APIRouter(prefix="/api", tags=["jobs"])

@router.get("/jobs")
def api_jobs():
    """Returns jobs from state, augmented with file-based auto-discovery and progress."""
    all_jobs = get_jobs()

    jobs_dict = {j.id: asdict(j) for j in all_jobs.values()}

    # Dynamic progress update based on time
    now = time.time()
    for j in jobs_dict.values():
        if j.get('status') in ('preparing', 'running') and j.get('started_at') and j.get('eta_seconds'):
            if (j.get('active_segment_progress') or 0) > 0:
                continue
            elapsed = now - j['started_at']
            time_prog = min(0.99, elapsed / float(j['eta_seconds']))
            j['progress'] = max(j.get('progress', 0.0), time_prog)

    # Auto-discovery
    chapters = [p.name for p in legacy_list_chapters()]
    for c in chapters:
        existing = next(
            (
                job for job in jobs_dict.values()
                if job.get("chapter_file") == c
                and job.get("status") == "done"
                and (job.get("output_mp3") or job.get("output_wav"))
            ),
            None,
        )
        if existing:
            continue

        stem = Path(c).stem
        x_mp3 = (XTTS_OUT_DIR / f"{stem}.mp3")
        x_wav = (XTTS_OUT_DIR / f"{stem}.wav")

        found_job = {}
        if x_mp3.exists():
            found_job.update({"status": "done", "engine": "xtts", "output_mp3": x_mp3.name})
        if x_wav.exists():
            found_job.update({"engine": "xtts", "output_wav": x_wav.name})
            if not found_job.get("status"):
                found_job["status"] = "done"

        if found_job:
            found_job["log"] = "Job auto-discovered from existing files."
            if existing:
                existing.update(found_job)
            else:
                jobs_dict[f"discovered-{c}"] = {
                    "id": f"discovered-{c}",
                    "chapter_file": c,
                    "progress": 1.0,
                    "created_at": 0,
                    **found_job
                }

    jobs = list(jobs_dict.values())
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
    cancel_job_worker(job_id)
    return JSONResponse({"status": "ok", "message": f"Job {job_id} cancelled"})

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
