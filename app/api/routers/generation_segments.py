"""Segment-level render submission.

Split out of the former monolithic ``generation.py`` (Task 003 — API router
split).
"""
from __future__ import annotations
import time
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from ...domain.chunk_groups import build_chapter_queue_title, build_segment_job_title
from ...db import get_connection, get_chapter, get_project
from ...db.queue import upsert_queue_row
from ...db.models import Job
from ...db.state import put_job, get_settings
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.synthesis import SynthesisTask
from ...engines.voice_engines import resolve_tts_engine_for_profiles
from ..ws import broadcast_chapter_updated, broadcast_queue_update
from .generation_shared import (
    _resolved_segment_profiles,
    _validate_generation_engines,
    _ensure_engines_enabled,
    _engines_for_profiles,
)

router = APIRouter(tags=["generation"])
logger = logging.getLogger(__name__)


@router.post("/segments/generate")
def api_generate_segments(
    background_tasks: BackgroundTasks,
    segment_ids: str = Form(...),
    speaker_profile: Optional[str] = Form(None)
):
    """Queues generation for specific segments."""
    sids = [s.strip() for s in segment_ids.split(",") if s.strip()]
    if not sids:
        return JSONResponse({"status": "error", "message": "No segment IDs provided"}, status_code=400)

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

    settings = get_settings()
    _chapter_row = get_chapter(chapter_id) or {}
    _chapter_default = (_chapter_row.get("speaker_profile_name") or "").strip() or None
    _project_row = get_project(project_id) or {}
    _project_default = (_project_row.get("speaker_profile_name") or "").strip() or None
    effective_default = (
        speaker_profile
        or _chapter_default
        or _project_default
        or (settings.get("default_speaker_profile") or "").strip() or None
    )
    seg_profiles = _resolved_segment_profiles(chapter_id, set(sids))
    has_unassigned = any(not p for p in seg_profiles)
    if has_unassigned and not effective_default:
        return JSONResponse({"status": "error", "message": "No voice available — assign a speaker to this chapter's text or set a default voice in Settings."}, status_code=400)
    active_profile = effective_default or next((p for p in seg_profiles if p), None)

    validation_error = _validate_generation_engines(chapter_id, active_profile, seg_profiles)
    if validation_error:
        return validation_error

    segment_profiles = seg_profiles
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        segment_profiles,
        default_profile=active_profile,
        fallback_engine=settings.get("default_engine"),
    )
    engines_to_check = _engines_for_profiles(segment_profiles, settings.get("default_engine")) or [resolved_engine]
    engine_error = _ensure_engines_enabled(engines_to_check)
    if engine_error:
        return engine_error
    # Performance-tab segment generation should always use the chunk-aware mixed handler
    # so displayed groups render as one unit even when they are pure single-engine renders.
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
    from ...db.chapters import cleanup_chapter_audio_files
    cleanup_chapter_audio_files(project_id, chapter_id, delete_chapter_outputs=True)


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
    upsert_queue_row(
        jid,
        project_id=project_id,
        chapter_id=chapter_id,
        status="queued",
        custom_title=segment_custom_title,
        engine=queue_engine,
        segment_ids=sids,
    )

    orchestrator = create_orchestrator()
    task = SynthesisTask(
        task_id=job.id,
        engine_id=queue_engine,
        script_text="",
        output_path=job.chapter_file,
        project_id=project_id,
        chapter_id=chapter_id,
        voice_profile_id=active_profile,
        custom_title=segment_custom_title,
        segment_ids=sids,
        safe_mode=bool(settings.get("safe_mode", True)),
        make_mp3=bool(settings.get("make_mp3", False)),
    )
    background_tasks.add_task(orchestrator.submit, task)

    broadcast_queue_update()
    return JSONResponse({"status": "success", "job_id": job.id})
