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
    get_connection, get_chapter, get_project
)
from ...db.queue import upsert_queue_row

from ...orchestration.scheduler.resources import set_paused
from ...db.models import Job
from ...db.state import put_job, update_job, get_settings, get_jobs
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.synthesis import SynthesisTask
from ...orchestration.tasks.segment_synthesis import (
    ChapterSynthesisTask,
    make_dispatch_segment_bridge_call,
)
from ...engines.voice_engines import resolve_profile_engine, resolve_tts_engine_for_profiles, normalize_tts_engine
from ...engines.bridge import create_voice_bridge
from ...engines.behavior import (
    supports_bake_rendering,
    supports_mixed_rendering,
    supports_standard_rendering,
    uses_segment_orchestration,
)
from ...domain.chunk_groups import build_chunk_groups
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
    from app.domain.chunk_groups import load_chunk_segments, resolve_segment_profile_name
    segments = load_chunk_segments(chapter_id)
    if only_segment_ids:
        segments = [s for s in segments if s["id"] in only_segment_ids]
    return [resolve_segment_profile_name(s, None) for s in segments]


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


def _validate_generation_engines(
    chapter_id: str,
    active_profile: Optional[str],
    seg_profiles: list[Optional[str]],
) -> Optional[JSONResponse]:
    """Validate that every engine implied by ``seg_profiles`` (plus
    ``active_profile``) is usable. ``seg_profiles`` must be the caller's
    already-resolved ``_resolved_segment_profiles(chapter_id, ...)`` result —
    this function does not re-query it (BE-5: dedupe repeated resolution)."""
    from app.engines.voice_engines import resolve_profile_engine
    from app.engines.bridge import create_voice_bridge

    settings = get_settings()
    profiles = set()
    if active_profile:
        profiles.add(active_profile)
    for p in seg_profiles:
        if p:
            profiles.add(p)

    bridge = create_voice_bridge()
    registry = {entry.get("engine_id"): entry for entry in bridge.describe_registry()}

    for profile in profiles:
        engine_id = resolve_profile_engine(profile, fallback_engine=settings.get("default_engine"))
        if not engine_id:
            return JSONResponse(
                {
                    "status": "error",
                    "message": f"No TTS engine is currently configured for voice profile '{profile}'. Please select an engine in Settings."
                },
                status_code=400,
            )

        entry = registry.get(engine_id)
        display_name = (entry.get("display_name") if entry else None) or engine_id.capitalize() or "this engine"

        # Check if can_enable is False
        if entry and entry.get("can_enable") is False:
            return JSONResponse(
                {
                    "status": "error",
                    "message": entry.get("enablement_message") or f"Enable {display_name} in Settings to use these voices.",
                },
                status_code=400,
            )

        # Check if disabled
        if not bridge.is_engine_enabled(engine_id) or (entry and not entry.get("enabled")):
            return JSONResponse(
                {
                    "status": "error",
                    "message": f"Engine {display_name} is disabled. Enable {display_name} in Settings to use these voices."
                },
                status_code=400,
            )

        # Check if needs setup or invalid config
        if entry:
            status = entry.get("status")
            if status in ("needs_setup", "invalid_config"):
                return JSONResponse(
                    {
                        "status": "error",
                        "message": f"Engine {engine_id} is not ready (status: {status}). Please configure {display_name} in Settings."
                    },
                    status_code=400,
                )

    return None


def _build_script_for_chapter(chapter_id: str, project_id: str, default_profile: str, safe_mode: bool = True) -> list[dict[str, Any]]:
    """Build a structured script payload for segment-orchestrated engines."""
    from ...db.segments import get_chapter_segments
    from ...domain.chunk_groups import build_script_entry_for_group

    segments = get_chapter_segments(chapter_id)
    groups = build_chunk_groups(segments, default_profile)
    chapter_dir = get_chapter_dir(project_id, chapter_id)

    script = [
        build_script_entry_for_group(
            group, chapter_dir, default_profile=default_profile, safe_mode=safe_mode,
        )
        for group in groups
    ]

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


def _build_chapter_synthesis_task(
    *,
    task_id: str,
    engine_id: str,
    chapter_id: str,
    project_id: str,
    output_path: str,
    active_profile: Optional[str],
    text_content: str,
    voice_ref: Optional[str],
    display_title: str,
    is_bake: bool,
    safe_mode: bool,
    make_mp3: bool,
    synthesis_settings: dict,
    force_rerender: bool = False,
):
    """Construct the live chapter-render task (W-PAR 008 enable-gate).

    For engines using segment orchestration, this is a ``ChapterSynthesisTask``
    (concurrent fan-out via ``make_dispatch_segment_bridge_call`` — cap=1 by
    default per the engine manifest's ``max_concurrent_workers``, so behavior
    stays serial/byte-identical until a manifest actually raises it). Every
    other engine keeps today's sequential ``SynthesisTask`` path unchanged.

    ``is_bake`` mirrors ``handle_mixed_job``'s own semantics: when set, only
    groups that fail ``_group_needs_render`` are fanned out (INV-8), and the
    already-valid groups still reach the stitch barrier via
    ``_group_ready_audio_path`` (the same W-PAR 008 bug-fix contract used by
    recovery reconstruction). When unset, every group renders — matching
    today's non-bake sequential behavior byte-for-byte (INV-1).
    """
    if not uses_segment_orchestration(engine_id):
        return SynthesisTask(
            task_id=task_id,
            engine_id=engine_id,
            script_text=text_content or "",
            output_path=output_path,
            project_id=project_id,
            chapter_id=chapter_id,
            voice_profile_id=active_profile,
            voice_ref=voice_ref,
            custom_title=display_title,
            is_bake=is_bake,
            force_rerender=force_rerender,
            safe_mode=safe_mode,
            make_mp3=make_mp3,
            synthesis_settings=synthesis_settings,
            script=None,
        )

    from ...db.segments import get_chapter_segments as _get_chapter_segments
    from ...orchestration.tasks.synthesis import _manifest_resource_claim
    from plugins.tts_mixed.handler import _group_needs_render, _group_ready_audio_path

    chapter_dir = get_chapter_dir(project_id, chapter_id)
    segments = _get_chapter_segments(chapter_id)

    # The parent's own ThreadPoolExecutor bound must not be a SECOND cap
    # below the engine's real concurrency limit — the per-engine-class
    # semaphore (derived per-child from the SAME manifest) is the sole
    # admission gate. Mirroring the child's own cap resolution here means
    # raising a manifest's `max_concurrent_workers` alone is sufficient to
    # enable visible parallelism (no separate chapter-level knob). Mixed
    # chapters may mix engines per group; the parent pool bound is sized to
    # the largest declared cap so no single engine is throttled below its
    # own manifest limit by the parent's pool itself.
    try:
        groups = build_chunk_groups(segments, active_profile)
        engine_ids = {group.get("engine") or engine_id for group in groups} or {engine_id}
        max_concurrent_workers = max(
            (_manifest_resource_claim(eid).cap for eid in engine_ids), default=1,
        )
    except Exception:
        logger.warning("Chapter %s: failed to resolve manifest concurrency cap; defaulting to 1.", chapter_id, exc_info=True)
        max_concurrent_workers = 1

    needs_render_fn = None
    resolve_existing_output_fn = None
    if is_bake:
        def needs_render_fn(group: dict) -> bool:  # noqa: F811
            return _group_needs_render(group, chapter_dir)

        def resolve_existing_output_fn(group: dict) -> Optional[str]:  # noqa: F811
            existing = _group_ready_audio_path(group, chapter_dir)
            return str(existing) if existing else None

    def stitch_fn(paths: list[str]) -> None:
        from plugins.tts_mixed.handler import stitch_segments, _persist_mixed_chapter_output
        from ...db import get_connection as _get_connection, update_segments_status_bulk

        out_wav = Path(output_path)
        rc = stitch_segments(chapter_dir, [Path(p) for p in paths], out_wav, lambda _line: None, lambda: False)
        if rc != 0 or not out_wav.exists():
            # Raise-on-failure contract (review fix, W-PAR 008):
            # ChapterSynthesisTask.run() converts this into a failed
            # TaskResult so the orchestrator's terminal publish records the
            # failure. Previously this swallowed the failure and returned,
            # letting run() report "completed" — the terminal publish then
            # overwrote the failed job status with "done" despite no chapter
            # WAV existing on disk.
            logger.warning("Chapter %s: stitch failed (rc=%s) for task %s.", chapter_id, rc, task_id)
            raise RuntimeError(f"Stitching failed (rc={rc}).")

        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (chapter_id,))
            sids = [row["id"] for row in cursor.fetchall()]
            update_segments_status_bulk(sids, chapter_id, "done")

        _persist_mixed_chapter_output(task_id, chapter_id, out_wav)
        update_job(task_id, status="done", finished_at=time.time(), progress=1.0, output_wav=out_wav.name)

    task = ChapterSynthesisTask(
        task_id=task_id,
        engine_id=engine_id,
        chapter_id=chapter_id,
        project_id=project_id,
        output_path=output_path,
        script=segments,
        voice_profile_id=active_profile,
        max_concurrent_workers=max_concurrent_workers,
        safe_mode=safe_mode,
        needs_render_fn=needs_render_fn,
        resolve_existing_output_fn=resolve_existing_output_fn,
        stitch_fn=stitch_fn,
    )
    orchestrator = create_orchestrator()
    task._bridge_call = make_dispatch_segment_bridge_call(orchestrator)
    return task


def _engines_for_profiles(profile_names: list[Optional[str]], fallback_engine: Optional[str]) -> list[str]:
    engines: list[str] = []
    seen: set[str] = set()
    for profile_name in profile_names:
        if not profile_name:
            continue
        engine_id = resolve_profile_engine(profile_name, fallback_engine)
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
