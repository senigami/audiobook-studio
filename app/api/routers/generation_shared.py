"""Shared, non-route helpers used by the generation_* router modules.

Split out of the former monolithic ``generation.py`` (Task 003 — API router
split). These are internal building blocks for chapter/segment render
submission: engine-usability validation and chapter-synthesis task
construction. No routes live here.
"""
from __future__ import annotations
import logging
from pathlib import Path
from typing import Any, List, Optional
from fastapi.responses import JSONResponse
from ...db.state import get_settings
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.synthesis import SynthesisTask
from ...orchestration.tasks.segment_synthesis import (
    ChapterSynthesisTask,
    make_dispatch_segment_bridge_call,
)
from ...engines.voice_engines import resolve_profile_engine
from ...engines.bridge import create_voice_bridge
from ...engines.behavior import uses_segment_orchestration
from ...domain.chunk_groups import build_chunk_groups, build_script_entry_for_group
from ...core.config import get_chapter_dir
from ...utils.render_trace import trace

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
        from ...db.state import update_job
        import time

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
    seen_profiles: set[str] = set()
    seen_engines: set[str] = set()
    for profile_name in profile_names:
        if not profile_name or profile_name in seen_profiles:
            continue
        seen_profiles.add(profile_name)
        engine_id = resolve_profile_engine(profile_name, fallback_engine)
        if engine_id in seen_engines:
            continue
        seen_engines.add(engine_id)
        engines.append(engine_id)
    return engines
