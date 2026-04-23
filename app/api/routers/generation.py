import time
import uuid
import logging
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from ...chunk_groups import build_chapter_queue_title, build_segment_job_title
from ...db import (
    add_to_queue as db_add_to_queue, get_chapter_segments,
    get_connection
)
from ...jobs import enqueue, cancel as cancel_job_worker, set_paused, clear_job_queue
from ...models import Job
from ...state import put_job, update_job, get_settings, get_jobs
from ...config import XTTS_OUT_DIR, find_existing_project_dir, find_existing_project_subdir
from ...voice_engines import resolve_tts_engine_for_profiles, normalize_tts_engine
from ...engines.bridge import create_voice_bridge
from ..ws import broadcast_chapter_updated, broadcast_queue_update

router = APIRouter(prefix="/api", tags=["generation"])
logger = logging.getLogger(__name__)


def _engine_usable_error(engine_id: str):
    display_name = engine_id.capitalize()
    if engine_id == "voxtral":
        display_name = "Voxtral"
    return JSONResponse(
        {
            "status": "error",
            "message": f"Enable {display_name} in Settings to use these voices."
        },
        status_code=400,
    )


def _single_job_title(chapter_file: str, engine: str) -> str:
    base_name = Path(chapter_file or "").stem.strip() or Path(chapter_file or "").name.strip() or "Untitled"
    action = {
        "voxtral": "Generating Voxtral audio for",
        "mixed": "Generating mixed audio for",
    }.get(engine, "Generating audio for")
    return f"{action} {base_name}"


def _resolved_segment_profiles(chapter_id: str, only_segment_ids: Optional[set[str]] = None) -> list[Optional[str]]:
    segments = get_chapter_segments(chapter_id)
    if only_segment_ids:
        segments = [segment for segment in segments if segment["id"] in only_segment_ids]
    return [segment.get("speaker_profile_name") for segment in segments]

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
            cursor.execute("SELECT title, text_content, sort_order FROM chapters WHERE id = ?", (chapter_id,))
            c_item = cursor.fetchone()

        if c_item:
            title, text_content, sort_order = c_item
            display_title = build_chapter_queue_title(title, sort_order)
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
                _resolved_segment_profiles(chapter_id),
                default_profile=active_profile,
                fallback_engine=settings.get("default_engine"),
            )
            bridge = create_voice_bridge()
            engines_to_check = mixed_engines if mixed_engines else [resolved_engine]
            for eid in engines_to_check:
                if eid != "xtts" and not bridge.is_engine_enabled(eid):
                    return _engine_usable_error(eid)
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
                custom_title=display_title,
                speaker_profile=active_profile,
                is_bake=has_bakeable_segments
            )

            put_job(j)
            update_job(
                qid,
                force_broadcast=True,
                status="queued",
                progress=0.0,
                started_at=None,
                finished_at=None,
                active_segment_id=None,
                active_segment_progress=0.0,
                project_id=project_id,
                chapter_id=chapter_id,
                chapter_file=temp_filename,
                engine=queue_engine,
                speaker_profile=active_profile,
                is_bake=has_bakeable_segments,
                custom_title=display_title,
            )
            enqueue(j)
            broadcast_chapter_updated(chapter_id)
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
        cursor.execute("SELECT project_id, title, sort_order FROM chapters WHERE id = ?", (chapter_id,))
        chapter = cursor.fetchone()
        if not chapter:
            return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
        project_id = chapter["project_id"]
        display_title = build_chapter_queue_title(chapter["title"], chapter["sort_order"])

    segs = get_chapter_segments(chapter_id)
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        _resolved_segment_profiles(chapter_id),
        default_profile=active_profile,
        fallback_engine=settings.get("default_engine"),
    )
    bridge = create_voice_bridge()
    engines_to_check = mixed_engines if mixed_engines else [resolved_engine]
    for eid in engines_to_check:
        if eid != "xtts" and not bridge.is_engine_enabled(eid):
            return _engine_usable_error(eid)

    queue_engine = "mixed" if mixed_engines or resolved_engine == "voxtral" else resolved_engine

    jid = f"bake-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        project_id=project_id,
        chapter_id=chapter_id,
        chapter_file=f"{chapter_id}_0.txt",
        engine=queue_engine,
        status="queued",
        created_at=time.time(),
        is_bake=True,
        bypass_pause=True,
        speaker_profile=active_profile,
        custom_title=display_title,
    )
    put_job(j)
    update_job(
        jid,
        force_broadcast=True,
        status="queued",
        progress=0.0,
        started_at=None,
        finished_at=None,
        active_segment_id=None,
        active_segment_progress=0.0,
        custom_title=display_title,
    )
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
    broadcast_chapter_updated(chapter_id)
    return JSONResponse({"status": "ok"})

@router.post("/generation/enqueue-single")
def enqueue_single(chapter_file: str = Form(...), engine: str = Form("xtts")):
    normalized_engine = normalize_tts_engine(engine, engine)
    jid = f"job-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        chapter_file=chapter_file,
        engine=normalized_engine,
        status="queued",
        created_at=time.time(),
        speaker_profile=get_settings().get("default_speaker_profile"),
        custom_title=_single_job_title(chapter_file, normalized_engine),
    )
    put_job(j)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.post("/segments/generate")
def api_generate_segments(segment_ids: str = Form(...), speaker_profile: Optional[str] = Form(None)):
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
        cursor.execute("SELECT project_id, title, sort_order FROM chapters WHERE id = ?", (chapter_id,))
        chap = cursor.fetchone()
        project_id = chap['project_id']
        chapter_title = chap['title']
        chapter_display_title = build_chapter_queue_title(chap['title'], chap['sort_order'])

    import uuid
    import time

    settings = get_settings()
    active_profile = speaker_profile or settings.get("default_speaker_profile")
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        _resolved_segment_profiles(chapter_id, set(sids)),
        default_profile=active_profile,
        fallback_engine=settings.get("default_engine"),
    )
    bridge = create_voice_bridge()
    engines_to_check = mixed_engines if mixed_engines else [resolved_engine]
    for eid in engines_to_check:
        if eid != "xtts" and not bridge.is_engine_enabled(eid):
            return _engine_usable_error(eid)
    # Performance-tab segment generation should always use the chunk-aware mixed handler
    # so displayed groups render as one unit even when they are pure XTTS.
    queue_engine = "mixed"
    segment_custom_title = build_segment_job_title(
        chapter_title=chapter_title,
        chapter_id=chapter_id,
        segment_ids=sids,
        default_profile=active_profile,
    )

    jid = f"job-{uuid.uuid4().hex[:8]}"
    job = Job(
        id=jid,
        engine=queue_engine,
        chapter_file=f"{chapter_display_title}.txt", # Fallback name
        status="queued",
        created_at=time.time(),
        project_id=project_id,
        chapter_id=chapter_id,
        segment_ids=sids,
        speaker_profile=active_profile,
        custom_title=segment_custom_title,
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

    # Segment generation invalidates any existing chapter render, but it is not
    # itself a chapter-level render job. Keep the chapter unprocessed so the top
    # chapter controls do not enter a fake "working" state.
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE chapters
            SET audio_status = 'unprocessed',
                audio_file_path = NULL,
                audio_generated_at = NULL,
                audio_length_seconds = NULL
            WHERE id = ?
        """, (chapter_id,))
        conn.commit()
    broadcast_chapter_updated(chapter_id)

    put_job(job)
    update_job(
        job.id,
        force_broadcast=True,
        status="queued",
        progress=0.0,
        started_at=None,
        finished_at=None,
        active_segment_id=None,
        active_segment_progress=0.0,
        chapter_id=chapter_id,
        project_id=project_id,
        chapter_file=job.chapter_file,
        engine=queue_engine,
        segment_ids=sids,
        speaker_profile=active_profile,
        custom_title=segment_custom_title,
    )
    enqueue(job)
    broadcast_queue_update()
    return JSONResponse({"status": "success", "job_id": job.id})
