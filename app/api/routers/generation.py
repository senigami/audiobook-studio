import time
import uuid
from typing import List, Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from ...db import (
    add_to_queue as db_add_to_queue, get_chapter_segments, 
    update_segments_status_bulk, get_connection
)
from ...jobs import enqueue, cancel as cancel_job_worker, set_paused, clear_job_queue
from ...models import Job
from ...state import put_job, update_job, get_settings, get_jobs
from ...config import get_project_text_dir
from ..ws import broadcast_queue_update

router = APIRouter(prefix="/api", tags=["generation"])

@router.post("/processing_queue")
def api_add_to_queue(
    project_id: str = Form(...), 
    chapter_id: str = Form(...), 
    split_part: int = Form(0),
    speaker_profile: Optional[str] = Form(None)
):
    try:
        active_profile = speaker_profile or get_settings().get("default_speaker_profile")
        if not active_profile:
            return JSONResponse({"status": "error", "message": "No speaker profile selected and no default set. Please choose a voice first."}, status_code=400)

        qid = db_add_to_queue(project_id, chapter_id, split_part)
        if not qid:
            # Already in queue? Return existing ID if possible
            from ...db import get_queue
            existing = [item for item in get_queue() if item['chapter_id'] == chapter_id and item['status'] not in ('done', 'failed', 'cancelled')]
            if existing:
                return JSONResponse({"status": "success", "queue_id": existing[0]['id']})
            return JSONResponse({"status": "error", "message": "Chapter already in queue"}, status_code=400)

        # Sync with legacy worker
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT title, text_content FROM chapters WHERE id = ?", (chapter_id,))
            c_item = cursor.fetchone()

        if c_item:
            title, text_content = c_item
            text_dir = get_project_text_dir(project_id)
            temp_filename = f"{chapter_id}_{split_part}.txt"
            temp_path = text_dir / temp_filename
            temp_path.write_text(text_content or "", encoding="utf-8", errors="replace")

            segs = get_chapter_segments(chapter_id)
            has_segments = len(segs) > 0

            j = Job(
                id=qid, 
                project_id=project_id,
                chapter_id=chapter_id,
                engine="xtts",
                chapter_file=temp_filename, 
                status="queued",
                created_at=time.time(),
                safe_mode=bool(get_settings().get("safe_mode", True)),
                make_mp3=bool(get_settings().get("make_mp3", False)),
                bypass_pause=False,
                custom_title=title,
                speaker_profile=active_profile,
                is_bake=has_segments
            )

            if has_segments:
                s_ids = [s['id'] for s in segs if s.get('audio_status') != 'done']
                if s_ids:
                    update_segments_status_bulk(s_ids, chapter_id, "processing")

            put_job(j)
            update_job(qid, force_broadcast=True, status="queued")
            enqueue(j)
            broadcast_queue_update()

        return JSONResponse({"status": "success", "queue_id": qid})
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=400)

@router.post("/generation/bake/{chapter_id}")
def api_bake_chapter(chapter_id: str):
    jid = f"bake-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        chapter_id=chapter_id,
        engine="bake",
        status="queued",
        created_at=time.time(),
        bypass_pause=True
    )
    put_job(j)
    update_job(jid, force_broadcast=True, status="queued")
    enqueue(j)
    return JSONResponse({"status": "success", "job_id": jid})

@router.post("/generation/pause")
def pause_queue():
    set_paused(True)
    return JSONResponse({"status": "success"})

@router.post("/generation/resume")
def resume_queue():
    set_paused(False)
    return JSONResponse({"status": "success"})

@router.post("/generation/cancel-all")
def cancel_pending():
    clear_job_queue()
    return JSONResponse({"status": "success"})

@router.post("/chapters/{chapter_id}/cancel")
def cancel_chapter_generation(chapter_id: str):
    jobs = get_jobs()
    for jid, job in jobs.items():
        if job.get("chapter_id") == chapter_id and job.get("status") in ["queued", "running", "preparing"]:
            cancel_job_worker(jid)
    return JSONResponse({"status": "success"})

@router.post("/generation/enqueue-single")
def enqueue_single(chapter_file: str = Form(...), engine: str = Form("xtts")):
    jid = f"job-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        chapter_file=chapter_file,
        engine=engine,
        status="queued",
        created_at=time.time(),
        speaker_profile=get_settings().get("default_speaker_profile")
    )
    put_job(j)
    enqueue(j)
    return JSONResponse({"status": "success", "job_id": jid})
