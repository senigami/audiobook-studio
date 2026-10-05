"""Chapter-level render submission: enqueue-for-render and bake.

Split out of the former monolithic ``generation.py`` (Task 003 — API router
split).
"""
from __future__ import annotations
import time
import uuid
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from ...domain.chunk_groups import build_chapter_queue_title
from ...db import (
    add_to_queue as db_add_to_queue, get_chapter_segments,
    get_connection, get_chapter, get_project
)
from ...db.queue import upsert_queue_row

from ...db.models import Job
from ...db.state import put_job, get_settings
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...engines.voice_engines import resolve_tts_engine_for_profiles
from ...engines.behavior import supports_bake_rendering
from ...core.config import get_chapter_dir
from ...utils.render_trace import trace
from ..ws import broadcast_chapter_updated, broadcast_queue_update
from .generation_shared import (
    _resolved_segment_profiles,
    _validate_generation_engines,
    _ensure_engines_enabled,
    _engines_for_profiles,
    _build_chapter_synthesis_task,
)

router = APIRouter(tags=["generation"])
logger = logging.getLogger(__name__)


@router.post("/processing_queue")
def api_add_to_queue(
    background_tasks: BackgroundTasks,
    project_id: str = Form(...),
    chapter_id: str = Form(...),
    split_part: int = Form(0),
    speaker_profile: Optional[str] = Form(None),
    force_rerender: bool = Form(False)
):
    try:
        settings = get_settings()
        # Resolve a working voice. Priority chain:
        #   explicit pick → chapter default → book/project default → global default
        # `active_profile` is the FALLBACK for segments that have no voice of their
        # own (the script builder and engine resolution already honor each segment's
        # `speaker_profile_name`). Block ONLY when some segment is unassigned AND
        # there is no default at ANY level — never fall back to an arbitrary voice.
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
        seg_profiles = _resolved_segment_profiles(chapter_id)
        has_unassigned = any(not p for p in seg_profiles)
        if has_unassigned and not effective_default:
            return JSONResponse({"status": "error", "message": "No voice available — assign a speaker to this chapter's text or set a default voice in Settings."}, status_code=400)
        active_profile = effective_default or next((p for p in seg_profiles if p), None)

        validation_error = _validate_generation_engines(chapter_id, active_profile, seg_profiles)
        if validation_error:
            return validation_error

        qid = db_add_to_queue(project_id, chapter_id, split_part)
        if not qid:
            # Already in queue? Return existing ID if possible
            from ...db import get_queue
            existing = [item for item in get_queue() if item['chapter_id'] == chapter_id and item['status'] not in ('done', 'failed', 'cancelled')]
            if existing:
                broadcast_queue_update()
                return JSONResponse({"status": "ok", "queue_id": existing[0]['id']})
            return JSONResponse({"status": "error", "message": "Chapter already in queue"}, status_code=400)

        # Sync with job database
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT title, text_content, sort_order FROM chapters WHERE id = ?", (chapter_id,))
            c_item = cursor.fetchone()

        if c_item:
            title, text_content, sort_order = c_item
            display_title = build_chapter_queue_title(title, sort_order)

            # Use v2 nested chapter directory for temporary text assets
            chapter_dir = get_chapter_dir(project_id, chapter_id)
            chapter_dir.mkdir(parents=True, exist_ok=True)

            if split_part == 0:
                temp_filename = "chapter.txt"
            else:
                temp_filename = f"chapter_{split_part}.txt"

            from ...utils.pathing import secure_join_flat as _secure_join_flat
            temp_path = _secure_join_flat(chapter_dir, temp_filename)
            temp_path.write_text(text_content or "", encoding="utf-8", errors="replace")

            segs = get_chapter_segments(chapter_id)
            # Check for bakeable segments in the nested segments directory
            from ...utils.pathing import secure_join_flat
            nested_seg_dir = secure_join_flat(chapter_dir, "segments")

            nested_audio_files = {
                entry.name
                for entry in nested_seg_dir.iterdir()
                if entry.is_file()
            } if nested_seg_dir.exists() else set()

            has_bakeable_segments = any(
                s.get("audio_status") == "done"
                and s.get("audio_file_path")
                and s["audio_file_path"] in nested_audio_files
                for s in segs
            )

            resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
                seg_profiles,
                default_profile=active_profile,
                fallback_engine=settings.get("default_engine"),
            )
            engines_to_check = _engines_for_profiles(
                seg_profiles,
                settings.get("default_engine"),
            ) or [resolved_engine]
            engine_error = _ensure_engines_enabled(engines_to_check)
            if engine_error:
                return engine_error
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
            upsert_queue_row(
                qid,
                project_id=project_id,
                chapter_id=chapter_id,
                split_part=split_part,
                status="queued",
                custom_title=display_title,
                engine=queue_engine,
            )

            make_mp3 = bool(settings.get("make_mp3", False))
            audio_filename = f"{Path(temp_filename).stem}.wav"

            # Resolve voice directory/reference for single-engine bridge synthesis
            voice_ref = None
            synthesis_settings = {}
            if queue_engine != "mixed" and active_profile:
                from app.engines.voice_engines import resolve_voice_preview_inputs
                speaker_wav, vdir = resolve_voice_preview_inputs(active_profile)
                voice_ref = speaker_wav
                if vdir:
                    synthesis_settings["voice_profile_dir"] = str(vdir)

            canonical_chapter_dir = get_chapter_dir(project_id, chapter_id)
            output_path = str(canonical_chapter_dir / audio_filename)

            orchestrator = create_orchestrator()
            task = _build_chapter_synthesis_task(
                task_id=qid,
                engine_id=queue_engine,
                chapter_id=chapter_id,
                project_id=project_id,
                output_path=output_path,
                active_profile=active_profile,
                text_content=text_content or "",
                voice_ref=voice_ref,
                display_title=display_title,
                is_bake=has_bakeable_segments,
                safe_mode=bool(settings.get("safe_mode", True)),
                make_mp3=make_mp3,
                synthesis_settings=synthesis_settings,
                force_rerender=force_rerender,
            )
            trace(
                "generation.enqueue_chapter",
                job_id=qid,
                project_id=project_id,
                chapter_id=chapter_id,
                engine_id=queue_engine,
                text_len=len(text_content or ""),
                output_path=output_path,
                active_profile=active_profile,
                has_voice_ref=bool(voice_ref),
                synthesis_settings=synthesis_settings,
                script_group_count=len(task.script or []),
            )
            background_tasks.add_task(orchestrator.submit, task)

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
def api_bake_chapter(chapter_id: str, background_tasks: BackgroundTasks):
    settings = get_settings()

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT project_id, title, sort_order, text_content FROM chapters WHERE id = ?", (chapter_id,))
        chapter = cursor.fetchone()
        if not chapter:
            return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
        project_id = chapter["project_id"]
        text_content = chapter["text_content"]
        display_title = build_chapter_queue_title(chapter["title"], chapter["sort_order"])

    _chapter_row = get_chapter(chapter_id) or {}
    _chapter_default = (_chapter_row.get("speaker_profile_name") or "").strip() or None
    _project_row = get_project(project_id) or {}
    _project_default = (_project_row.get("speaker_profile_name") or "").strip() or None
    effective_default = (
        _chapter_default
        or _project_default
        or (settings.get("default_speaker_profile") or "").strip() or None
    )
    seg_profiles = _resolved_segment_profiles(chapter_id)
    has_unassigned = any(not p for p in seg_profiles)
    if has_unassigned and not effective_default:
        return JSONResponse({"status": "error", "message": "No voice available — assign a speaker to this chapter's text or set a default voice in Settings."}, status_code=400)
    active_profile = effective_default or next((p for p in seg_profiles if p), None)

    segs = get_chapter_segments(chapter_id)
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        seg_profiles,
        default_profile=active_profile,
        fallback_engine=settings.get("default_engine"),
    )
    validation_error = _validate_generation_engines(chapter_id, active_profile, seg_profiles)
    if validation_error:
        return validation_error

    engines_to_check = _engines_for_profiles(
        seg_profiles,
        settings.get("default_engine"),
    ) or [resolved_engine]
    engine_error = _ensure_engines_enabled(engines_to_check)
    if engine_error:
        return engine_error

    # Force mixed engine if the resolved engine doesn't support bake natively,
    # or if we actually have mixed voices.
    queue_engine = "mixed" if mixed_engines or not supports_bake_rendering(resolved_engine) else resolved_engine

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
    upsert_queue_row(
        jid,
        project_id=project_id,
        chapter_id=chapter_id,
        status="queued",
        custom_title=display_title,
        engine=queue_engine,
    )

    make_mp3 = bool(settings.get("make_mp3", False))
    audio_filename = f"{chapter_id}_0.wav"

    # Resolve voice directory/reference for single-engine bridge synthesis
    voice_ref = None
    synthesis_settings = {}
    if queue_engine != "mixed" and active_profile:
        from app.engines.voice_engines import resolve_voice_preview_inputs
        speaker_wav, vdir = resolve_voice_preview_inputs(active_profile)
        voice_ref = speaker_wav
        if vdir:
            synthesis_settings["voice_profile_dir"] = str(vdir)

    canonical_chapter_dir = get_chapter_dir(project_id, chapter_id)
    output_path = str(canonical_chapter_dir / audio_filename)

    orchestrator = create_orchestrator()
    task = _build_chapter_synthesis_task(
        task_id=jid,
        engine_id=queue_engine,
        chapter_id=chapter_id,
        project_id=project_id,
        output_path=output_path,
        active_profile=active_profile,
        text_content=text_content or "",
        voice_ref=voice_ref,
        display_title=display_title,
        is_bake=True,
        safe_mode=bool(settings.get("safe_mode", True)),
        make_mp3=make_mp3,
        synthesis_settings=synthesis_settings,
    )
    trace(
        "generation.bake_chapter",
        job_id=jid,
        project_id=project_id,
        chapter_id=chapter_id,
        engine_id=queue_engine,
        text_len=len(text_content or ""),
        output_path=output_path,
        active_profile=active_profile,
        has_voice_ref=bool(voice_ref),
        synthesis_settings=synthesis_settings,
        script_group_count=len(task.script or []),
    )
    background_tasks.add_task(orchestrator.submit, task)

    return JSONResponse({"status": "ok", "job_id": jid})
