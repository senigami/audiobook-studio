from __future__ import annotations
import time
import uuid
import logging
from pathlib import Path
from typing import Any, List, Optional
from fastapi import APIRouter, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from ...domain.chunk_groups import build_chapter_queue_title, build_segment_job_title
from ...db import (
    add_to_queue as db_add_to_queue, get_chapter_segments,
    get_connection
)

from ...orchestration.scheduler.resources import set_paused
from ...db.models import Job
from ...db.state import put_job, update_job, get_settings, get_jobs
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.synthesis import SynthesisTask
from ...engines.voice_engines import resolve_profile_engine, resolve_tts_engine_for_profiles, normalize_tts_engine
from ...engines.bridge import create_voice_bridge
from ...engines.behavior import (
    supports_bake_rendering,
    supports_mixed_rendering,
    supports_standard_rendering,
    uses_segment_orchestration,
    get_text_split_target,
    has_behavior,
)
from ...domain.chunk_groups import build_chunk_groups
from ...utils.text.textops import sanitize_text, safe_split_long_sentences
from ...core.config import (
    get_chapter_dir, resolve_chapter_asset_path
)
from ...utils.render_trace import trace
from ..ws import broadcast_chapter_updated, broadcast_queue_update

router = APIRouter(prefix="/api", tags=["generation"])
logger = logging.getLogger(__name__)


def _engine_usable_error(engine_id: str):
    if not engine_id:
        return JSONResponse(
            {
                "status": "error",
                "message": "No TTS engine is currently configured for this voice profile. Please select an engine in Settings."
            },
            status_code=400,
        )

    from ...engines.bridge import create_voice_bridge
    bridge = create_voice_bridge()
    registry = {entry.get("engine_id"): entry for entry in bridge.describe_registry()}
    entry = registry.get(engine_id)
    display_name = (entry.get("display_name") if entry else None) or engine_id.capitalize() or "this engine"

    return JSONResponse(
        {
            "status": "error",
            "message": f"Enable {display_name} in Settings to use these voices."
        },
        status_code=400,
    )




def _resolved_segment_profiles(chapter_id: str, only_segment_ids: Optional[set[str]] = None) -> list[Optional[str]]:
    segments = get_chapter_segments(chapter_id)
    if only_segment_ids:
        segments = [segment for segment in segments if segment["id"] in only_segment_ids]
    return [segment.get("speaker_profile_name") for segment in segments]


def _ensure_engines_enabled(engine_ids: list[str]) -> Optional[JSONResponse]:
    bridge = create_voice_bridge()
    registry = {entry.get("engine_id"): entry for entry in bridge.describe_registry()}
    for engine_id in engine_ids:
        if not engine_id:
            return _engine_usable_error(engine_id)
        entry = registry.get(engine_id)
        if not entry:
            if not bridge.is_engine_enabled(engine_id):
                return _engine_usable_error(engine_id)
            continue
        if entry.get("can_enable") is False:
            return JSONResponse(
                {
                    "status": "error",
                    "message": entry.get("enablement_message") or f"Enable {engine_id} in Settings to use these voices.",
                },
                status_code=400,
            )
        if not bridge.is_engine_enabled(engine_id):
            return _engine_usable_error(engine_id)
    return None


def _build_script_for_chapter(chapter_id: str, project_id: str, default_profile: str, safe_mode: bool = True) -> list[dict[str, Any]]:
    """Build a structured script payload for segment-orchestrated engines."""
    from ...db.segments import get_chapter_segments
    from ...db.speakers import get_profile_wavs, get_profile_dir

    segments = get_chapter_segments(chapter_id)
    groups = build_chunk_groups(segments, default_profile)
    chapter_dir = get_chapter_dir(project_id, chapter_id)

    script = []
    for group in groups:
        first = group["segments"][0]
        profile_name = group["profile_name"]

        # Resolve voice details
        try:
            sw = get_profile_wavs(profile_name) if profile_name else None
            # Standard single-sample resolution for bridge transport
            if sw and "," in sw:
                sw = sw.split(",")[0]
        except Exception:
            sw = None

        vdir = None
        if profile_name:
            try:
                vdir = str(get_profile_dir(profile_name))
            except Exception:
                vdir = None

        processed = " ".join(group["text_parts"]).strip()
        if safe_mode:
            engine_id = group.get("engine") or resolve_profile_engine(profile_name, default_profile)
            if has_behavior(engine_id, "sanitize_text"):
                processed = sanitize_text(processed)
            processed = safe_split_long_sentences(processed, target=get_text_split_target(engine_id))

        # V2 segment path: chapters/{chapter_id}/segments/{first_segment_id}.wav
        # The orchestrator uses absolute paths for bridge transport
        seg_out = chapter_dir / "segments" / f"{first['id']}.wav"

        script_entry = {
            "text": processed,
            "speaker_wav": sw,
            "id": first["id"],
            "ids": [s["id"] for s in group["segments"]],
            "save_path": str(seg_out.absolute()),
            "weight": max(1, len(processed)), # Store weight for orchestrator progress tracking
        }
        if vdir:
            script_entry["voice_profile_dir"] = vdir

        script.append(script_entry)

    trace(
        "generation.script_built",
        project_id=project_id,
        chapter_id=chapter_id,
        default_profile=default_profile,
        safe_mode=safe_mode,
        segment_count=len(segments),
        script_group_count=len(script),
        groups=[
            {
                "id": entry.get("id"),
                "ids": entry.get("ids"),
                "save_path": entry.get("save_path"),
                "weight": entry.get("weight"),
                "text_len": len(str(entry.get("text") or "")),
                "has_speaker_wav": bool(entry.get("speaker_wav")),
                "has_voice_profile_dir": bool(entry.get("voice_profile_dir")),
            }
            for entry in script
        ],
    )

    return script


def _engines_for_profiles(profile_names: list[Optional[str]], fallback_engine: Optional[str]) -> list[str]:
    engines: list[str] = []
    seen: set[str] = set()
    for profile_name in profile_names:
        if not profile_name:
            continue
        engine_id = resolve_profile_engine(profile_name, fallback_engine)
        if not engine_id:
            continue
        if engine_id in seen:
            continue
        seen.add(engine_id)
        engines.append(engine_id)
    return engines

@router.post("/processing_queue")
def api_add_to_queue(
    background_tasks: BackgroundTasks,
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

            temp_path = chapter_dir / temp_filename
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
                _resolved_segment_profiles(chapter_id),
                default_profile=active_profile,
                fallback_engine=settings.get("default_engine"),
            )
            engines_to_check = _engines_for_profiles(
                _resolved_segment_profiles(chapter_id),
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
            update_job(
                qid,
                status="queued",
                progress=0.0,
                active_segment_id=None,
                active_segment_progress=0.0,
                error=None,
                warning_count=0,
                force_broadcast=True
            )

            make_mp3 = bool(settings.get("make_mp3", False))
            audio_filename = f"{Path(temp_filename).stem}.mp3" if make_mp3 else f"{Path(temp_filename).stem}.wav"

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
            task = SynthesisTask(
                task_id=qid,
                engine_id=queue_engine,
                script_text=text_content or "",  # Required for single-engine bridge synthesis
                output_path=output_path,
                project_id=project_id,
                chapter_id=chapter_id,
                voice_profile_id=active_profile,
                voice_ref=voice_ref,
                custom_title=display_title,
                is_bake=has_bakeable_segments,
                safe_mode=bool(settings.get("safe_mode", True)),
                make_mp3=make_mp3,
                synthesis_settings=synthesis_settings,
                script=_build_script_for_chapter(chapter_id, project_id, active_profile, safe_mode=bool(settings.get("safe_mode", True))) if uses_segment_orchestration(queue_engine) else None
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
    active_profile = settings.get("default_speaker_profile")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT project_id, title, sort_order, text_content FROM chapters WHERE id = ?", (chapter_id,))
        chapter = cursor.fetchone()
        if not chapter:
            return JSONResponse({"status": "error", "message": "Chapter not found"}, status_code=404)
        project_id = chapter["project_id"]
        text_content = chapter["text_content"]
        display_title = build_chapter_queue_title(chapter["title"], chapter["sort_order"])

    segs = get_chapter_segments(chapter_id)
    resolved_engine, mixed_engines = resolve_tts_engine_for_profiles(
        _resolved_segment_profiles(chapter_id),
        default_profile=active_profile,
        fallback_engine=settings.get("default_engine"),
    )
    engines_to_check = _engines_for_profiles(
        _resolved_segment_profiles(chapter_id),
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

    make_mp3 = bool(settings.get("make_mp3", False))
    audio_filename = f"{chapter_id}_0.mp3" if make_mp3 else f"{chapter_id}_0.wav"

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
    task = SynthesisTask(
        task_id=jid,
        engine_id=queue_engine,
        script_text=text_content or "",
        output_path=output_path,
        project_id=project_id,
        chapter_id=chapter_id,
        voice_profile_id=active_profile,
        voice_ref=voice_ref,
        custom_title=display_title,
        is_bake=True,
        make_mp3=make_mp3,
        synthesis_settings=synthesis_settings,
        script=_build_script_for_chapter(chapter_id, project_id, active_profile, safe_mode=bool(settings.get("safe_mode", True))) if uses_segment_orchestration(queue_engine) else None
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
    from ...db.state import get_jobs, delete_jobs
    from ...db import clear_queue

    # 1. Cancel in orchestrator
    orchestrator = create_orchestrator()
    jobs = get_jobs()
    for jid in jobs.keys():
        orchestrator.cancel(jid)

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
    orchestrator = create_orchestrator()
    jobs = get_jobs()
    for jid, job in jobs.items():
        if job.get("chapter_id") == chapter_id and job.get("status") in ["queued", "running", "preparing"]:
            if not orchestrator.cancel(jid):
                update_job(jid, status="cancelled", force_broadcast=True)
    broadcast_chapter_updated(chapter_id)
    return JSONResponse({"status": "ok"})



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
    segment_profiles = _resolved_segment_profiles(chapter_id, set(sids))
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
    update_job(
        job.id,
        force_broadcast=True,
        status="queued",
        progress=0.0,
        active_segment_id=None,
        active_segment_progress=0.0,
        error=None,
        warning_count=0,
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
