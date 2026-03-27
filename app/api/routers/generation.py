import time
import uuid
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from ...db import (
    add_to_queue as db_add_to_queue, get_chapter_segments,
    get_connection
)
from ...jobs import enqueue, cancel as cancel_job_worker, set_paused, clear_job_queue
from ...models import Job
from ...state import put_job, update_job, get_settings, get_jobs
from ...config import XTTS_OUT_DIR, find_existing_project_dir, find_existing_project_subdir
from ...voice_engines import resolve_tts_engine_for_profiles, normalize_tts_engine
from ..ws import broadcast_queue_update

router = APIRouter(prefix="/api", tags=["generation"])
logger = logging.getLogger(__name__)


def _voxtral_configured(settings: Optional[dict] = None) -> bool:
    active_settings = settings or get_settings()
    return bool(str(active_settings.get("mistral_api_key") or "").strip()) and bool(active_settings.get("voxtral_enabled"))


def _voxtral_disabled_error():
    return JSONResponse(
        {
            "status": "error",
            "message": "Enable Voxtral in Settings and add a Mistral API key to use cloud voices."
        },
        status_code=400,
    )

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
        settings = get_settings()

        qid = db_add_to_queue(project_id, chapter_id, split_part)
        if not qid:
            # Already in queue? Return existing ID if possible
            from ...db import get_queue
            existing = [item for item in get_queue() if item['chapter_id'] == chapter_id and item['status'] not in ('done', 'failed', 'cancelled')]
            if existing:
                broadcast_queue_update()
                return JSONResponse({"status": "ok", "queue_id": existing[0]['id']})
            return JSONResponse({"status": "error", "message": "Chapter already in queue"}, status_code=400)

        # Sync with legacy worker
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT title, text_content FROM chapters WHERE id = ?", (chapter_id,))
            c_item = cursor.fetchone()

        if c_item:
            title, text_content = c_item
            project_dir = find_existing_project_dir(project_id)
            if not project_dir:
                raise ValueError(f"Project directory not found for {project_id}")
            text_dir = find_existing_project_subdir(project_id, "text") or (project_dir / "text")
            text_dir.mkdir(parents=True, exist_ok=True)
            temp_filename = f"{chapter_id}_{split_part}.txt"
            temp_path = text_dir / temp_filename
            temp_path.write_text(text_content or "", encoding="utf-8", errors="replace")

            segs = get_chapter_segments(chapter_id)
            pdir = find_existing_project_subdir(project_id, "audio") or (project_dir / "audio")
            project_audio_files = {
                entry.name
                for entry in pdir.iterdir()
                if entry.is_file()
            } if pdir.exists() else set()
            xtts_audio_files = {
                entry.name
                for entry in XTTS_OUT_DIR.iterdir()
                if entry.is_file()
            } if XTTS_OUT_DIR.exists() else set()
            has_bakeable_segments = any(
                s.get("audio_status") == "done"
                and s.get("audio_file_path")
                and (
                    s["audio_file_path"] in project_audio_files
                    or s["audio_file_path"] in xtts_audio_files
                )
                for s in segs
            )
            resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
                [s.get("speaker_profile_name") for s in segs],
                default_profile=active_profile,
                fallback_engine=settings.get("default_engine"),
            )
            if (mixed_engines or resolved_engine == "voxtral") and not _voxtral_configured(settings):
                return _voxtral_disabled_error()
            queue_engine = "mixed" if mixed_engines else resolved_engine

            j = Job(
                id=qid, 
                project_id=project_id,
                chapter_id=chapter_id,
                engine=queue_engine,
                chapter_file=temp_filename, 
                status="queued",
                created_at=time.time(),
                safe_mode=bool(settings.get("safe_mode", True)),
                make_mp3=bool(settings.get("make_mp3", False)),
                bypass_pause=False,
                custom_title=title,
                speaker_profile=active_profile,
                is_bake=has_bakeable_segments
            )

            put_job(j)
            update_job(qid, force_broadcast=True, status="queued", project_id=project_id, chapter_id=chapter_id, custom_title=title)
            enqueue(j)
            broadcast_queue_update()

        return JSONResponse({"status": "ok", "queue_id": qid})
    except Exception:
        logger.warning(
            "Failed to queue chapter %s for project %s",
            chapter_id,
            project_id,
            exc_info=True,
        )
        return JSONResponse({"status": "error", "message": "Failed to queue chapter"}, status_code=400)

@router.post("/generation/bake/{chapter_id}")
def api_bake_chapter(chapter_id: str):
    settings = get_settings()
    active_profile = settings.get("default_speaker_profile")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
        chapter = cursor.fetchone()
        if not chapter:
            return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
        project_id = chapter["project_id"]

    segs = get_chapter_segments(chapter_id)
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        [s.get("speaker_profile_name") for s in segs],
        default_profile=active_profile,
        fallback_engine=settings.get("default_engine"),
    )
    if (mixed_engines or resolved_engine == "voxtral") and not _voxtral_configured(settings):
        return _voxtral_disabled_error()

    jid = f"bake-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        project_id=project_id,
        chapter_id=chapter_id,
        chapter_file=f"{chapter_id}_0.txt",
        engine="mixed" if mixed_engines else resolved_engine,
        status="queued",
        created_at=time.time(),
        is_bake=True,
        bypass_pause=True,
        speaker_profile=active_profile,
    )
    put_job(j)
    update_job(jid, force_broadcast=True, status="queued")
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

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
    from ...state import get_jobs, delete_jobs
    from ...db import clear_queue

    # 1. Clear worker memory
    clear_job_queue()

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
    jobs = get_jobs()
    for jid, job in jobs.items():
        if job.get("chapter_id") == chapter_id and job.get("status") in ["queued", "running", "preparing"]:
            cancel_job_worker(jid)
    return JSONResponse({"status": "ok"})

@router.post("/generation/enqueue-single")
def enqueue_single(chapter_file: str = Form(...), engine: str = Form("xtts")):
    jid = f"job-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        chapter_file=chapter_file,
        engine=normalize_tts_engine(engine, engine),
        status="queued",
        created_at=time.time(),
        speaker_profile=get_settings().get("default_speaker_profile")
    )
    put_job(j)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.post("/segments/generate")
def api_generate_segments(segment_ids: str = Form(...)):
    """Queues generation for specific segments."""
    sids = [s.strip() for s in segment_ids.split(",") if s.strip()]
    if not sids:
        return JSONResponse({"status": "error", "message": "No segment IDs provided"}, status_code=400)

    from ...db import get_connection
    # Find chapter_id from first segment to group them
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT chapter_id FROM chapter_segments WHERE id = ?", (sids[0],))
        row = cursor.fetchone()
        if not row:
            return JSONResponse({"status": "error", "message": "Segment not found"}, status_code=404)
        chapter_id = row['chapter_id']

        # Get project_id for output paths
        cursor.execute("SELECT project_id, title FROM chapters WHERE id = ?", (chapter_id,))
        chap = cursor.fetchone()
        project_id = chap['project_id']
        chapter_title = chap['title']

    import uuid
    import time

    settings = get_settings()
    requested_segments = [s for s in get_chapter_segments(chapter_id) if s["id"] in set(sids)]
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        [s.get("speaker_profile_name") for s in requested_segments],
        default_profile=settings.get("default_speaker_profile"),
        fallback_engine=settings.get("default_engine"),
    )
    if (mixed_engines or resolved_engine == "voxtral") and not _voxtral_configured(settings):
        return _voxtral_disabled_error()
    queue_engine = "mixed" if mixed_engines else resolved_engine

    jid = f"job-{uuid.uuid4().hex[:8]}"
    job = Job(
        id=jid,
        engine=queue_engine,
        chapter_file=f"{chapter_title}.txt", # Fallback name
        status="queued",
        created_at=time.time(),
        project_id=project_id,
        chapter_id=chapter_id,
        segment_ids=sids,
        speaker_profile=settings.get("default_speaker_profile")
    )

    # Physical Cleanup: Delete existing full-chapter audio files to prevent reconciliation "blink"
    from ... import config
    project_audio_dir = config.find_existing_project_subdir(project_id, "audio") if project_id else config.XTTS_OUT_DIR
    if not project_audio_dir:
        project_audio_dir = config.get_project_dir(project_id) / "audio"
    for p in project_audio_dir.iterdir() if project_audio_dir.exists() else ():
        if (
            p.is_file()
            and p.name.startswith(chapter_id)
            and p.suffix.lower() in ('.wav', '.mp3', '.m4a')
        ):
            try:
                p.unlink()
            except Exception:
                logger.warning("Failed to remove stale chapter audio file %s", p, exc_info=True)

    # Update chapter status to processing to ensure UI reflects the work
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE chapters SET audio_status = 'processing', audio_file_path = NULL WHERE id = ?", (chapter_id,))
        conn.commit()

    put_job(job)
    enqueue(job)
    broadcast_queue_update()
    return JSONResponse({"status": "success", "job_id": job.id})
