"""Internal implementation helpers for the Studio 2.0 TaskOrchestrator."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Optional

from app.orchestration.progress.eta import estimate_eta_seconds
from app.orchestration.tasks.base import TaskResult
from app.utils.render_trace import trace
from app.jobs.registry import get_handler_registry, initialize_default_handlers
from app.db.models import Job

if TYPE_CHECKING:
    from app.orchestration.tasks.base import StudioTask, TaskContext

logger = logging.getLogger(__name__)


class OrchestratorHelpersMixin:
    """Internal implementation details for TaskOrchestrator.

    Extracted to keep orchestrator.py focused on high-level workflows.
    """

    def _reconcile_task(self, context: TaskContext) -> dict[str, Any]:
        """Call Phase 4 reconciliation for the task's work scope."""
        payload = context.payload or {}
        task_revision_id = (
            payload.get("task_revision_id")
            or payload.get("source_revision_id")
            or context.task_id
        )

        try:
            # self.progress_service must be available on the target class
            result = self.progress_service.reconcile(
                job_id=context.task_id,
                task_revision_id=str(task_revision_id),
                scope=payload.get("scope", "job"),
                requested_revision=payload.get("requested_revision"),
                artifact_hash=payload.get("artifact_hash"),
            )
        except Exception:
            logger.exception(
                "Reconciliation failed for task %s; defaulting to queue.",
                context.task_id,
            )
            return {"decision": "queue", "unresolved_count": 1, "artifact_state": "unknown"}

        artifact_state = result.get("artifact_state", "unknown")
        can_reuse = result.get("can_reuse", False)

        if can_reuse or artifact_state == "valid":
            decision = "reuse"
        elif artifact_state == "stale":
            decision = "rerender"
        else:
            decision = "queue"

        return {
            "decision": decision,
            "artifact_state": artifact_state,
            "can_reuse": can_reuse,
            "unresolved_count": 0 if decision == "reuse" else 1,
            "reconciliation": result,
        }

    def _dispatch(self, *, task: StudioTask, context: TaskContext) -> TaskResult:
        """Dispatch the task to execution through the orchestrator-owned bridge."""
        # Render start is separate from preparation. Marker-driven tasks anchor this
        # on engine markers so model loading does not pollute render duration metrics.
        timing = {
            "engine_activity_started_at": None,
            "render_started_at": None,
            "first_start_segment_at": None,
            "chapter_render_completed_at": None,
            "sum_segment_render_seconds": 0.0,
            "model_load_seconds": None,
            "inter_group_overhead_seconds": None,
            "chapter_post_start_window": None,
            "chapter_wall_duration": None,
            "synthesis_duration_seconds": None,
        }
        segment_starts = {}
        marker_state = {
            "start_synthesis_emitted": False,
            "start_segment_ids": set(),
        }
        marker_driven = bool(getattr(task, "is_marker_driven", False))
        expected_duration = self._estimate_task_duration(task=task, context=context)

        engine_id = context.payload.get("engine_id") or getattr(task, "engine_id", "synthesis")
        calibrated_cps = None
        try:
            from app.db.state import get_performance_metrics  # noqa: PLC0415
            from app.orchestration.scheduler.eta import get_calibrated_model_params  # noqa: PLC0415
            from app.tts_server.performance_settings import (  # noqa: PLC0415
                filter_history_for_engine_model,
                resolve_engine_settings_model,
            )

            perf = get_performance_metrics()
            all_history = perf.get("render_history") or []
            tts_model = resolve_engine_settings_model(engine_id)
            history = filter_history_for_engine_model(all_history, engine_id, tts_model)
            params = get_calibrated_model_params(history)
            if params:
                calibrated_cps = params[0]
        except Exception:
            pass

        def task_progress_reporter(progress: float, message: str | None, reason_code: str | None, status: str = "running"):
            # Non-marker tasks start when they first report running. Marker-driven
            # tasks should only fall back here for real positive progress if a
            # START_SYNTHESIS marker was missed.
            if (
                status == "running"
                and timing["render_started_at"] is None
                and (not marker_driven or progress > 0.0)
            ):
                timing["render_started_at"] = time.time()

            self._publish(
                context=context,
                status=status,
                progress=progress,
                message=message,
                reason_code=reason_code,
                started_at=timing["render_started_at"],
            )

        task.set_progress_reporter(task_progress_reporter)

        def record_render_stats_if_completed(result: TaskResult, raw_result: dict | None = None) -> None:
            if result.status != "completed":
                return

            timing_payload = None
            from app.db.state import get_jobs  # noqa: PLC0415
            perf_job_obj = get_jobs().get(context.task_id)

            if raw_result is not None and isinstance(raw_result, dict):
                timing_payload = raw_result.get("timing")
                if timing_payload is None:
                    tts_server_res = raw_result.get("tts_server_result")
                    if isinstance(tts_server_res, dict):
                        timing_payload = tts_server_res.get("timing")
            if timing_payload is None and hasattr(result, "timing"):
                timing_payload = getattr(result, "timing")

            def get_val(obj, key):
                if isinstance(obj, dict):
                    return obj.get(key)
                return getattr(obj, key, None)

            if timing_payload is not None:
                engine_act_start = get_val(timing_payload, "engine_activity_started_at")
                chap_render_start = get_val(timing_payload, "chapter_render_started_at")
                chap_render_completed = get_val(timing_payload, "chapter_render_completed_at")
                segments_raw = get_val(timing_payload, "segments")

                # Normalize segments list to a list of dicts to handle any mixing of types
                segments = []
                if segments_raw:
                    for s in segments_raw:
                        s_start = get_val(s, "render_started_at")
                        s_end = get_val(s, "render_completed_at")
                        if s_start is not None and s_end is not None:
                            segments.append({
                                "render_started_at": s_start,
                                "render_completed_at": s_end
                            })

                if chap_render_start is not None and chap_render_completed is not None:
                    model_load_seconds = 0.0
                    if engine_act_start is not None:
                        model_load_seconds = chap_render_start - engine_act_start

                    synthesis_duration_seconds = chap_render_completed - chap_render_start

                    if segments:
                        sum_segment_render_seconds = sum(
                            max(0.0, s["render_completed_at"] - s["render_started_at"])
                            for s in segments
                        )
                    else:
                        sum_segment_render_seconds = synthesis_duration_seconds

                    if segments:
                        first_segment_start = min(s["render_started_at"] for s in segments)
                        last_segment_end = max(s["render_completed_at"] for s in segments)
                        inter_group_overhead_seconds = max(0.0, (last_segment_end - first_segment_start) - sum_segment_render_seconds)
                    else:
                        inter_group_overhead_seconds = 0.0

                    duration_seconds = chap_render_completed - (engine_act_start or chap_render_start)

                    timing["engine_activity_started_at"] = engine_act_start
                    timing["render_started_at"] = chap_render_start
                    timing["chapter_render_completed_at"] = chap_render_completed
                    timing["sum_segment_render_seconds"] = sum_segment_render_seconds
                    timing["model_load_seconds"] = model_load_seconds
                    timing["inter_group_overhead_seconds"] = inter_group_overhead_seconds
                    timing["chapter_wall_duration"] = duration_seconds
                    timing["synthesis_duration_seconds"] = synthesis_duration_seconds

                    try:
                        from app.db.state import update_job
                        update_job(
                            context.task_id,
                            engine_activity_started_at=engine_act_start,
                            started_at=chap_render_start,
                            chapter_render_completed_at=chap_render_completed,
                            sum_segment_render_seconds=sum_segment_render_seconds,
                            model_load_seconds=model_load_seconds,
                            inter_group_overhead_seconds=inter_group_overhead_seconds,
                            chapter_wall_duration=duration_seconds,
                            synthesis_duration_seconds=synthesis_duration_seconds,
                            finished_at=chap_render_completed
                        )
                    except Exception:
                        pass

            if timing.get("chapter_wall_duration") is not None:
                duration_seconds = timing["chapter_wall_duration"]
                started_at = timing.get("engine_activity_started_at") or timing.get("render_started_at")
                completed_at_val = timing.get("chapter_render_completed_at") or time.time()
            else:
                started_at = timing["render_started_at"]
                if started_at is None:
                    duration_seconds = max(0.0, time.monotonic() - float(getattr(task, "submitted_at", time.monotonic())))
                else:
                    duration_seconds = max(0.0, time.time() - started_at)
                completed_at_val = time.time()

            if duration_seconds <= 0:
                return

            payload = context.payload or {}
            script_text = str(payload.get("script_text") or payload.get("test_text") or "")
            chars = len(script_text)
            if chars <= 0:
                return

            # Resolve segment count: prioritize actual timing segments if available,
            # otherwise fall back to canonical job state segment_ids
            timing_segments = None
            if timing_payload is not None:
                timing_segments = get_val(timing_payload, "segments")

            if timing_segments and isinstance(timing_segments, list):
                segment_count = max(1, len(timing_segments))
            else:
                script = payload.get("script") or getattr(task, "script", None)
                if script and isinstance(script, list):
                    segment_count = max(1, len(script))
                elif perf_job_obj and getattr(perf_job_obj, "render_group_count", 0) > 0:
                    segment_count = max(1, perf_job_obj.render_group_count)
                elif context.task_type in ("sample_build", "sample_test"):
                    segment_count = 1
                else:
                    from app.engines.behavior import supports_segment_rendering  # noqa: PLC0415
                    engine_id_val = str(payload.get("engine_id") or getattr(task, "engine_id", ""))
                    if engine_id_val and supports_segment_rendering(engine_id_val):
                        segment_count = 1
                    else:
                        segment_ids = payload.get("segment_ids") or getattr(task, "segment_ids", None) or []
                        segment_count = max(1, len(segment_ids) if isinstance(segment_ids, list) else 1)

            render_group_count = len(getattr(task, "script", None) or [])
            word_count = len(script_text.split())
            synthesis_settings = payload.get("synthesis_settings") if isinstance(payload.get("synthesis_settings"), dict) else {}
            tts_model = synthesis_settings.get("model") or payload.get("model")
            output_path = str(payload.get("output_path") or "")
            audio_duration_seconds = None
            if output_path:
                try:
                    from app.utils.subprocess_utils import probe_audio_duration  # noqa: PLC0415

                    audio_file = Path(output_path)
                    if audio_file.exists():
                        audio_duration_seconds = probe_audio_duration(audio_file)
                except Exception:
                    logger.debug(
                        "Could not probe completed audio duration for task %s.",
                        context.task_id,
                        exc_info=True,
                    )

            try:
                from app.db.performance import record_render_sample  # noqa: PLC0415
                synthesis_dur = (getattr(perf_job_obj, "synthesis_duration_seconds", None) if perf_job_obj else None) or timing.get("synthesis_duration_seconds")
                model_load_seconds = (
                    getattr(perf_job_obj, "model_load_seconds", None)
                    if perf_job_obj else None
                ) or (
                    getattr(perf_job_obj, "chapter_load_seconds", None)
                    if perf_job_obj else None
                ) or timing.get("model_load_seconds")

                if model_load_seconds is None:
                    job_engine_started = (
                        getattr(perf_job_obj, "engine_activity_started_at", None)
                        if perf_job_obj else None
                    ) or timing.get("engine_activity_started_at")
                    job_render_started = (
                        getattr(perf_job_obj, "started_at", None)
                        if perf_job_obj else None
                    ) or timing.get("render_started_at")
                    if job_engine_started is not None and job_render_started is not None:
                        try:
                            model_load_seconds = max(0.0, float(job_render_started) - float(job_engine_started))
                        except (TypeError, ValueError):
                            model_load_seconds = None

                record_render_sample(
                    engine=str(payload.get("engine_id") or getattr(task, "engine_id", "")),
                    tts_model=tts_model,
                    chars=chars,
                    word_count=word_count,
                    segment_count=segment_count,
                    duration_seconds=round(duration_seconds, 2),
                    job_id=context.task_id,
                    project_id=context.project_id,
                    chapter_id=context.chapter_id,
                    speaker_profile=payload.get("voice_profile_id"),
                    render_group_count=render_group_count,
                    started_at=started_at,
                    audio_duration_seconds=audio_duration_seconds,
                    completed_at=completed_at_val,
                    synthesis_duration_seconds=synthesis_dur,
                    model_load_seconds=model_load_seconds,
                    sum_segment_render_seconds=(
                        getattr(perf_job_obj, "sum_segment_render_seconds", None)
                        if perf_job_obj else None
                    ) or timing.get("sum_segment_render_seconds"),
                )
            except Exception:
                logger.warning(
                    "Failed to record render performance sample for task %s.",
                    context.task_id,
                    exc_info=True,
                )

        self._publish(
            context=context,
            status="preparing",
            progress=0.0,
            started_at=None,
            message="Preparing synthesis resources...",
            force=False,
        )

        # If the task exposes a bridge request, route through the injected bridge.
        bridge_request_fn = getattr(task, "to_bridge_request", None)
        from app.engines.watchdog import get_watchdog
        wd = get_watchdog()

        # Pre-calculate weights for grouped progress tracking
        script = getattr(task, "script", None)
        path_to_ids = {}  # type: dict[str, list[str]]
        id_to_weight = {}
        total_weight = 0
        if script:
            for entry in script:
                eid = entry.get("id")
                spath = entry.get("save_path")
                # Grouped segments may share a save_path.
                # If 'ids' is provided in the script entry, it's a group.
                eids = entry.get("ids") or ([eid] if eid else [])

                # Use length of text as weight if not provided
                w = entry.get("weight") or max(1, len(entry.get("text", "")))

                if eids:
                    # Apply weight to the group as a whole
                    id_to_weight[eids[0]] = w
                    total_weight += w
                    if spath:
                        if spath not in path_to_ids:
                            path_to_ids[spath] = []
                        path_to_ids[spath].extend(eids)
        trace(
            "orchestrator.dispatch_start",
            job_id=context.task_id,
            project_id=context.project_id,
            chapter_id=context.chapter_id,
            task_type=context.task_type,
            marker_driven=marker_driven,
            script_group_count=len(script or []),
            total_weight=total_weight,
            path_to_ids=path_to_ids,
            id_to_weight=id_to_weight,
        )

        # Volatile state for the log_listener closure
        completed_weight = [0.0]
        completed_group_count = [0]
        active_seg_id = [None]
        active_seg_progress = [0.0]
        active_render_group_index = [0]
        max_progress = [0.0]
        group_index_by_leader: dict[str, int] = {}

        for group_index, entry in enumerate(script or []):
            eids = entry.get("ids") or []
            if not eids:
                continue
            group_index_by_leader[eids[0]] = group_index

        render_group_count = len(script or [])

        def _get_grouped_progress() -> float:
            """Compute weighted progress across all render groups."""
            if total_weight <= 0:
                return 0.0
            active_w = id_to_weight.get(active_seg_id[0], 0) if active_seg_id[0] else 0
            # Scale to 0.90 to leave room for stitching/finalizing
            raw = (completed_weight[0] + (active_seg_progress[0] * active_w)) / total_weight
            val = round(min(0.99, raw * 0.90), 4)
            if val > max_progress[0]:
                max_progress[0] = val
            return max_progress[0]

        def log_listener(line: str, line_task_id: Optional[str] = None):
            # If a task_id is present in the line, it MUST match ours.
            if line_task_id and line_task_id != context.task_id:
                return

            engine_id = None
            if context and context.payload:
                engine_id = context.payload.get("engine_id")
            if not engine_id:
                engine_id = getattr(task, "engine_id", None)
            plugin_id = engine_id

            try:
                from app.api.ws import broadcast_tts_log_line
                plugin_short_name = None
                plugin_id = engine_id
                if engine_id:
                    try:
                        from app.engines.registry import load_engine_registry
                        registry = load_engine_registry()
                        registration = registry.get(engine_id)
                        if registration and registration.manifest:
                            plugin_short_name = registration.manifest.display_name
                    except Exception:
                        pass
                    if not plugin_short_name:
                        plugin_short_name = engine_id[:10] if len(engine_id) > 10 else engine_id

                broadcast_tts_log_line(
                    job_id=context.task_id,
                    project_id=context.project_id,
                    chapter_id=context.chapter_id,
                    line=line,
                    source="app.orchestration.scheduler.orchestrator_helpers.log_listener",
                    plugin_id=plugin_id,
                    plugin_short_name=plugin_short_name,
                )
            except Exception:
                logger.exception("Failed to broadcast TTS log line for task %s", context.task_id)

            from app.engines.behavior import match_timing_marker
            matched_marker = match_timing_marker(plugin_id or engine_id, line)
            now_time = time.time()

            if matched_marker == "ENGINE_ACTIVITY_STARTED":
                if timing.get("engine_activity_started_at") is None:
                    timing["engine_activity_started_at"] = now_time
                    try:
                        from app.db.state import update_job
                        update_job(context.task_id, engine_activity_started_at=now_time)
                    except Exception:
                        pass

            if matched_marker == "START_SYNTHESIS" or "[START_SYNTHESIS]" in line:
                if marker_state["start_synthesis_emitted"]:
                    return
                marker_state["start_synthesis_emitted"] = True
                if timing["render_started_at"] is None:
                    timing["render_started_at"] = now_time
                trace(
                    "orchestrator.marker_start_synthesis",
                    job_id=context.task_id,
                    line=line,
                    render_started_at=timing["render_started_at"],
                    expected_duration=expected_duration,
                )
                self._publish(
                    context=context,
                    status="running",
                    progress=0.0,
                    eta_seconds=self._duration_to_eta_seconds(expected_duration),
                    started_at=timing["render_started_at"],
                    message="Synthesis in progress...",
                    render_group_count=render_group_count,
                    completed_render_groups=completed_group_count[0],
                    active_render_group_index=active_render_group_index[0],
                    total_render_weight=total_weight,
                    completed_render_weight=completed_weight[0],
                    active_render_group_weight=id_to_weight.get(active_seg_id[0], 0) if active_seg_id[0] else 0,
                    grouped_progress=_get_grouped_progress(),
                    force=False,
                )

            if matched_marker == "START_SEGMENT" or "[START_SEGMENT]" in line:
                if timing.get("first_start_segment_at") is None:
                    timing["first_start_segment_at"] = now_time
                    try:
                        from app.db.state import update_job
                        update_job(context.task_id, first_start_segment_at=now_time)
                    except Exception:
                        pass
                if timing.get("engine_activity_started_at") is not None and timing.get("model_load_seconds") is None:
                    timing["model_load_seconds"] = now_time - timing["engine_activity_started_at"]
                    try:
                        from app.db.state import update_job
                        update_job(context.task_id, model_load_seconds=timing["model_load_seconds"])
                    except Exception:
                        pass

                try:
                    # [START_SEGMENT] {segment_id}
                    if "[START_SEGMENT]" in line:
                        sid = line.split("[START_SEGMENT]")[1].strip().split()[0]
                    else:
                        sid = active_seg_id[0] or (list(marker_state["start_segment_ids"])[-1] if marker_state["start_segment_ids"] else "unknown")

                    if sid in marker_state["start_segment_ids"]:
                        return
                    marker_state["start_segment_ids"].add(sid)
                    active_seg_id[0] = sid
                    active_seg_progress[0] = 0.0
                    segment_starts[sid] = now_time
                    active_render_group_index[0] = group_index_by_leader.get(sid, active_render_group_index[0])
                    trace(
                        "orchestrator.marker_start_segment",
                        job_id=context.task_id,
                        segment_id=sid,
                        grouped_progress=_get_grouped_progress(),
                        completed_weight=completed_weight[0],
                        total_weight=total_weight,
                        active_weight=id_to_weight.get(sid, 0),
                        line=line,
                    )
                    remaining_fraction = (
                        (total_weight - completed_weight[0]) / total_weight
                        if total_weight > 0 else 1.0
                    )
                    remaining_eta = (
                        int(round(expected_duration * remaining_fraction))
                        if expected_duration is not None and expected_duration > 0
                        else None
                    )
                    self._publish(
                        context=context,
                        status="running",
                        progress=_get_grouped_progress(),
                        eta_seconds=self._duration_to_eta_seconds(remaining_eta),
                        active_segment_eta_seconds=self._estimate_active_segment_eta_seconds(
                            expected_duration=expected_duration,
                            total_weight=total_weight,
                            active_weight=id_to_weight.get(sid, 0),
                            active_progress=0.0,
                            started_at=segment_starts.get(sid),
                            calibrated_cps=calibrated_cps,
                        ),
                        reason_code="START_SEGMENT",
                        message=f"Rendering segment {sid}...",
                        started_at=timing["render_started_at"],
                        active_segment_id=sid,
                        render_group_count=render_group_count,
                        completed_render_groups=completed_group_count[0],
                        active_render_group_index=active_render_group_index[0],
                        total_render_weight=total_weight,
                        completed_render_weight=completed_weight[0],
                        active_render_group_weight=id_to_weight.get(sid, 0),
                        grouped_progress=_get_grouped_progress(),
                    )
                except (IndexError, ValueError):
                    pass

            from app.engines.behavior import parse_engine_progress
            engine_id = context.payload.get("engine_id") or ""
            raw_progress = parse_engine_progress(engine_id, line)

            if raw_progress is not None:
                if timing["render_started_at"] is None:
                    timing["render_started_at"] = time.time()
                try:
                    if total_weight > 0:
                        active_seg_progress[0] = raw_progress
                        p = _get_grouped_progress()
                    else:
                        p = raw_progress
                        # Scale progress for tasks that have post-synthesis phases
                        if context.task_type in {"sample_build", "sample_test"}:
                            p = p * 0.70

                    eta_seconds = self._observed_remaining_seconds(
                        started_at=timing["render_started_at"],
                        progress=p,
                        expected_duration=expected_duration,
                    )
                    active_segment_eta_seconds = self._estimate_active_segment_eta_seconds(
                        expected_duration=expected_duration,
                        total_weight=total_weight,
                        active_weight=id_to_weight.get(active_seg_id[0], 0) if active_seg_id[0] else 0,
                        active_progress=raw_progress if (total_weight > 0 and active_seg_id[0] is not None) else p,
                        started_at=segment_starts.get(active_seg_id[0]) if active_seg_id[0] else None,
                        calibrated_cps=calibrated_cps,
                    )
                    trace(
                        "orchestrator.marker_progress",
                        job_id=context.task_id,
                        segment_id=active_seg_id[0],
                        raw_segment_progress=raw_progress,
                        published_progress=p,
                        eta_seconds=eta_seconds,
                        active_segment_eta_seconds=active_segment_eta_seconds,
                        completed_weight=completed_weight[0],
                        total_weight=total_weight,
                        active_weight=id_to_weight.get(active_seg_id[0], 0) if active_seg_id[0] else 0,
                        line=line,
                    )

                    self._publish(
                        context=context,
                        status="running",
                        progress=p,
                        eta_seconds=eta_seconds,
                        active_segment_eta_seconds=active_segment_eta_seconds,
                        eta_confidence="recomputing" if eta_seconds is not None else None,
                        reason_code="SEGMENT_PROGRESS",
                        started_at=timing["render_started_at"],
                        message="Synthesizing...",
                        active_segment_id=active_seg_id[0],
                        active_segment_progress=raw_progress if (total_weight > 0 and active_seg_id[0] is not None) else 0.0,
                        render_group_count=render_group_count,
                        completed_render_groups=completed_group_count[0],
                        active_render_group_index=active_render_group_index[0],
                        total_render_weight=total_weight,
                        completed_render_weight=completed_weight[0],
                        active_render_group_weight=id_to_weight.get(active_seg_id[0], 0) if active_seg_id[0] else 0,
                        grouped_progress=_get_grouped_progress(),
                    )
                except Exception:
                    pass

            if matched_marker == "SEGMENT_SAVED" or "[SEGMENT_SAVED]" in line:
                try:
                    # [SEGMENT_SAVED] {path}
                    if "[SEGMENT_SAVED]" in line:
                        saved_path = line.split("[SEGMENT_SAVED]")[1].strip().split()[0]
                    else:
                        saved_path = active_seg_id[0] or "unknown.wav"
                    sids = path_to_ids.get(saved_path)
                    if not sids:
                        # Fallback: try to find by filename if path doesn't match exactly
                        fname = Path(saved_path).name
                        for p, i in path_to_ids.items():
                            if Path(p).name == fname:
                                sids = i
                                break

                    if sids:
                        # Use the first ID (leader) for weight tracking
                        leader_id = sids[0]
                        w = id_to_weight.get(leader_id, 0)
                        completed_weight[0] += w
                        completed_group_count[0] += 1
                        active_seg_id[0] = None
                        active_seg_progress[0] = 0.0
                        active_render_group_index[0] = group_index_by_leader.get(leader_id, active_render_group_index[0])
                        trace(
                            "orchestrator.marker_segment_saved",
                            job_id=context.task_id,
                            saved_path=saved_path,
                            segment_ids=sids,
                            leader_id=leader_id,
                            completed_weight=completed_weight[0],
                            total_weight=total_weight,
                            grouped_progress=_get_grouped_progress(),
                            line=line,
                        )

                        # Capture timing
                        if leader_id in segment_starts:
                            seg_dur = now_time - segment_starts[leader_id]
                            timing["sum_segment_render_seconds"] += seg_dur
                            try:
                                from app.db.state import update_job
                                update_job(context.task_id, sum_segment_render_seconds=timing["sum_segment_render_seconds"])
                            except Exception:
                                pass

                        # Update segment database state for all members of the group
                        try:
                            from app.db import update_segments_bulk
                            update_segments_bulk(
                                sids,
                                audio_status="done",
                                audio_file_path=Path(saved_path).name,
                                audio_generated_at=time.time(),
                            )
                            from app.api.ws import broadcast_segments_updated
                            if context.chapter_id:
                                broadcast_segments_updated(context.chapter_id)
                        except Exception:
                            logger.exception("Failed to update segments %s on [SEGMENT_SAVED]", sids)

                        self._publish(
                            context=context,
                            status="running",
                            progress=_get_grouped_progress(),
                            reason_code="SEGMENT_SAVED",
                            message=f"Completed segment {leader_id}",
                            started_at=timing["render_started_at"],
                            active_segment_id=None,
                            render_group_count=render_group_count,
                            completed_render_groups=completed_group_count[0],
                            active_render_group_index=active_render_group_index[0],
                            total_render_weight=total_weight,
                            completed_render_weight=completed_weight[0],
                            active_render_group_weight=0,
                            grouped_progress=_get_grouped_progress(),
                        )
                except (IndexError, ValueError):
                    pass

            if matched_marker == "CHAPTER_SYNTHESIS_COMPLETE":
                if timing.get("chapter_render_completed_at") is None:
                    timing["chapter_render_completed_at"] = now_time
                    try:
                        from app.db.state import update_job
                        update_job(context.task_id, chapter_render_completed_at=now_time)
                    except Exception:
                        pass

                # Derive final timing variables!
                if timing["engine_activity_started_at"] is not None:
                    timing["chapter_wall_duration"] = now_time - timing["engine_activity_started_at"]
                elif timing["render_started_at"] is not None:
                    timing["chapter_wall_duration"] = now_time - timing["render_started_at"]

                if timing["render_started_at"] is not None:
                    timing["synthesis_duration_seconds"] = now_time - timing["render_started_at"]

                if timing["first_start_segment_at"] is not None:
                    timing["chapter_post_start_window"] = now_time - timing["first_start_segment_at"]

                if timing["chapter_post_start_window"] is not None:
                    timing["inter_group_overhead_seconds"] = max(0.0, timing["chapter_post_start_window"] - timing["sum_segment_render_seconds"])

                try:
                    from app.db.state import update_job
                    update_job(
                        context.task_id,
                        chapter_wall_duration=timing["chapter_wall_duration"],
                        chapter_post_start_window=timing["chapter_post_start_window"],
                        inter_group_overhead_seconds=timing["inter_group_overhead_seconds"],
                        synthesis_duration_seconds=timing["synthesis_duration_seconds"]
                    )
                except Exception:
                    pass

        if wd:
            wd.register_log_listener(log_listener)

        # 1. Try registry-based dispatch (Plugin handlers or generic kind handlers)
        reg = get_handler_registry()
        j = self._context_to_job(context)
        handler = reg.get_handler(j)

        if handler:
            if not marker_driven:
                if timing["render_started_at"] is None:
                    timing["render_started_at"] = time.time()
                self._publish(
                    context=context,
                    status="running",
                    progress=0.0,
                    started_at=timing["render_started_at"],
                )

            # Execute via registry handler
            try:
                # Registry handlers usually take (jid, job, start, on_output, cancel_check)
                # or (jid, job, on_output, cancel_check). We adapt here.
                start_time = timing["render_started_at"] or time.time()

                # Inspect handler or just try with start
                import inspect
                sig = inspect.signature(handler)

                kwargs = {
                    "jid": context.task_id,
                    "j": j,
                    "on_output": self._relay_output_wrapper(task),
                    "cancel_check": lambda: getattr(task, "_cancelled", False),
                }
                has_kwargs = any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values())
                if "text" in sig.parameters or has_kwargs:
                    kwargs["text"] = getattr(task, "script_text", getattr(task, "text", None))
                if "start" in sig.parameters or has_kwargs:
                    kwargs["start"] = start_time

                result_val = handler(**kwargs)


                # Convert handler result to TaskResult
                handler_name = getattr(handler, "__name__", str(handler))
                result = None
                if isinstance(result_val, TaskResult):
                    result = result_val
                elif isinstance(result_val, tuple) and len(result_val) == 2:
                    status, message = result_val
                    result = TaskResult(
                        status="completed" if status == "done" else status,
                        message=message,
                    )
                else:
                    from app.db import state
                    jobs = state.get_jobs()
                    job_obj = jobs.get(context.task_id)
                    if job_obj and job_obj.status == "done":
                        result = TaskResult(status="completed")
                    elif job_obj and job_obj.status == "failed":
                        msg = job_obj.error or "Unknown failure"
                        result = TaskResult(status="failed", message=msg)
                    elif result_val == 0:
                        result = TaskResult(status="completed")
                    elif isinstance(result_val, int) and result_val != 0:
                        err_msg = f"Handler failed with exit code {result_val}"
                        if job_obj and job_obj.error:
                            err_msg = f"{err_msg}: {job_obj.error}"
                        result = TaskResult(status="failed", message=err_msg)
                    else:
                        msg = "Handler finished without 'done' status"
                        if job_obj and job_obj.error:
                            msg = job_obj.error
                        elif isinstance(result_val, str):
                            msg = result_val
                        result = TaskResult(status="failed", message=msg)

                if result is None:
                    result = TaskResult(status="failed", message=f"Handler returned unexpected type: {type(result_val)}")

                if result.status == "failed":
                    engine_id = getattr(j, "engine", "unknown")
                    kind = getattr(context, "task_type", "unknown")
                    debug_info = f" [Handler: {handler_name} | Engine: {engine_id} | Kind: {kind}]"
                    msg = result.message or "Failed"
                    if debug_info not in msg:
                        msg = f"{msg}{debug_info}"
                    result = TaskResult(status="failed", message=msg, retriable=result.retriable)

                record_render_stats_if_completed(result, raw_result=result_val)
                if wd:
                    wd.unregister_log_listener(log_listener)
                return result
            except Exception as e:
                logger.exception("Task %s: registry handler raised.", context.task_id)
                import traceback
                tb_summary = "".join(traceback.format_exception_only(type(e), e)).strip()
                handler_name = getattr(handler, "__name__", str(handler))
                engine_id = getattr(j, "engine", "unknown")
                kind = getattr(context, "task_type", "unknown")
                if wd:
                    wd.unregister_log_listener(log_listener)
                return TaskResult(
                    status="failed",
                    message=f"Handler raised exception: {tb_summary} [Handler: {handler_name} | Engine: {engine_id} | Kind: {kind}]",
                )

        try:
            # 2. Local fallback if explicitly opted-out of bridge dispatch
            if getattr(task, "prefers_local_execution", False):
                if not marker_driven:
                    if timing["render_started_at"] is None:
                        timing["render_started_at"] = time.time()
                    self._publish(
                        context=context,
                        status="running",
                        progress=0.0,
                        started_at=timing["render_started_at"],
                    )

                result = task.run()
                if result.status == "failed":
                    engine_id = getattr(j, "engine", "unknown")
                    kind = getattr(context, "task_type", "unknown")
                    debug_info = f" [Engine: {engine_id} | Kind: {kind}]"
                    msg = result.message or "Failed"
                    if debug_info not in msg:
                        msg = f"{msg}{debug_info}"
                    result = TaskResult(status="failed", message=msg, retriable=result.retriable)
                record_render_stats_if_completed(result)
                return result

            # 3. Bridge-backed dispatch
            elif callable(bridge_request_fn):
                request = bridge_request_fn()
                if request is not None:
                    try:
                        # self.voice_bridge must be available on the target class
                        result = self.voice_bridge.synthesize(request)
                        ok = result.get("status", "ok") == "ok"
                        task_result = TaskResult(
                            status="completed" if ok else "failed",
                            message=result.get("message"),
                        )
                        if not ok:
                            engine_id = getattr(j, "engine", "unknown")
                            kind = getattr(context, "task_type", "unknown")
                            debug_info = f" [Engine: {engine_id} | Kind: {kind}]"
                            msg = task_result.message or "Bridge synthesis failed"
                            if debug_info not in msg:
                                msg = f"{msg}{debug_info}"
                            task_result = TaskResult(status="failed", message=msg, retriable=task_result.retriable)
                        record_render_stats_if_completed(task_result, raw_result=result)
                        return task_result
                    except Exception as exc:
                        print(f"\n[DEBUG] Caught exc: {type(exc)}: {exc}")
                        logger.exception("Task %s: bridge dispatch raised.", context.task_id)
                        from app.engines.errors import EngineUnavailableError
                        print(f"[DEBUG] EngineUnavailableError class: {EngineUnavailableError}")
                        is_retriable = isinstance(exc, EngineUnavailableError)
                        print(f"[DEBUG] is_retriable: {is_retriable}")
                        import traceback
                        tb_summary = "".join(traceback.format_exception_only(type(exc), exc)).strip()
                        engine_id = getattr(j, "engine", "unknown")
                        kind = getattr(context, "task_type", "unknown")
                        return TaskResult(
                            status="failed",
                            message=f"Bridge raised exception: {tb_summary} [Engine: {engine_id} | Kind: {kind}]",
                            retriable=is_retriable
                        )
                else:
                    engine_id = getattr(j, "engine", "unknown")
                    kind = getattr(context, "task_type", "unknown")
                    return TaskResult(
                        status="failed",
                        message=f"Task requires a voice bridge but returned no request payload. [Engine: {engine_id} | Kind: {kind}]"
                    )

            engine_id = getattr(j, "engine", "unknown")
            kind = getattr(context, "task_type", "unknown")
            return TaskResult(
                status="failed",
                message=f"Task type {context.task_type} has no handler and no bridge fallback. [Engine: {engine_id} | Kind: {kind}]"
            )
        except Exception as exc:
            logger.exception("Task %s: dispatch raised an exception.", context.task_id)
            import traceback
            tb_summary = "".join(traceback.format_exception_only(type(exc), exc)).strip()
            engine_id = getattr(j, "engine", "unknown")
            kind = getattr(context, "task_type", "unknown")
            return TaskResult(
                status="failed",
                message=f"Dispatch error: {tb_summary} [Engine: {engine_id} | Kind: {kind}]"
            )
        finally:
            if wd:
                wd.unregister_log_listener(log_listener)

    def _estimate_task_duration(self, *, task: StudioTask, context: TaskContext) -> float | None:
        """Estimate render duration without publishing it during preparation."""
        try:
            text = context.payload.get("test_text") or context.payload.get("script_text", "")
            engine_id = context.payload.get("engine_id", "synthesis")
            duration = task.get_expected_duration(text, engine_id)
            return float(duration) if duration else None
        except Exception:
            return None

    @staticmethod
    def _duration_to_eta_seconds(duration: float | None) -> int | None:
        """Normalize an optional duration estimate for websocket payloads."""
        if duration is None or duration <= 0:
            return None
        return max(1, int(round(duration)))

    @staticmethod
    def _observed_remaining_seconds(*, started_at: float | None, progress: float, expected_duration: float | None = None) -> int | None:
        """Estimate remaining render time from raw engine progress."""
        if started_at is None or progress <= 0:
            return None
        if progress >= 0.995:
            return 1
        elapsed = max(0.0, time.time() - started_at)
        if elapsed <= 0:
            return None
        extrapolated = elapsed * (1.0 - progress) / progress

        if expected_duration is not None and progress < 0.15:
            alpha = progress / 0.15
            remaining = alpha * extrapolated + (1 - alpha) * expected_duration
        else:
            remaining = extrapolated

        return max(1, int(round(remaining)))

    @staticmethod
    def _estimate_active_segment_eta_seconds(
        *,
        expected_duration: float | None,
        total_weight: int | float,
        active_weight: int | float,
        active_progress: float,
        started_at: float | None = None,
        calibrated_cps: float | None = None,
    ) -> int | None:
        """Estimate ETA for the active render group, not the whole chapter."""
        active_total = max(int(active_weight), 0)
        if active_total <= 0:
            return OrchestratorHelpersMixin._duration_to_eta_seconds(expected_duration)

        progress = max(0.0, min(float(active_progress), 1.0))
        completed_units = max(0, min(int(round(active_total * progress)), active_total))

        baseline_cps = None
        if calibrated_cps is not None:
            baseline_cps = calibrated_cps
        elif expected_duration is not None and expected_duration > 0 and total_weight > 0:
            baseline_cps = float(total_weight) / float(expected_duration)
        else:
            from app.engines.behavior import DEFAULT_BASELINE_ENGINE_CPS
            baseline_cps = DEFAULT_BASELINE_ENGINE_CPS

        observed_cps = None
        if started_at is not None and progress > 0:
            elapsed = max(0.0, time.time() - started_at)
            if elapsed > 0:
                observed_cps = (active_total * progress) / elapsed

        return estimate_eta_seconds(
            completed_units=completed_units,
            total_units=active_total,
            observed_cps=observed_cps,
            baseline_cps=baseline_cps,
        )

    def _publish(
        self,
        *,
        context: TaskContext,
        status: str,
        progress: float | None = None,
        eta_seconds: int | None = None,
        active_segment_eta_seconds: int | None = None,
        eta_confidence: str | None = None,
        message: str | None = None,
        reason_code: str | None = None,
        waiting_reason: str | None = None,
        started_at: float | None = None,
        active_segment_id: str | None = None,
        active_segment_progress: float | None = None,
        render_group_count: int | None = None,
        completed_render_groups: int | None = None,
        active_render_group_index: int | None = None,
        total_render_weight: int | None = None,
        completed_render_weight: int | None = None,
        active_render_group_weight: int | None = None,
        grouped_progress: float | None = None,
        allow_progress_regression: bool = False,
        force: bool = False,
    ) -> None:
        """Publish a progress event through the ProgressService and sync with state."""
        state_status = "done" if status == "completed" else status
        if state_status == "finalizing":
            state_status = "running"

        # Resolve has_segment_support capability from engine
        has_segment_support = False
        if context.payload:
            engine_id = context.payload.get("engine_id") or context.payload.get("engine")
            if engine_id:
                from app.engines.behavior import uses_segment_orchestration, supports_segment_rendering
                has_segment_support = bool(
                    uses_segment_orchestration(engine_id) or supports_segment_rendering(engine_id)
                )

        # Stop 0% synthesis_progress from flipping status to running prematurely
        has_started = (started_at is not None)
        if not has_started:
            try:
                from app.db.state import get_jobs  # noqa: PLC0415
                existing_job = get_jobs().get(context.task_id)
                if existing_job and existing_job.started_at is not None:
                    has_started = True
            except Exception:
                pass

        if state_status == "running" and reason_code in ("synthesis_progress", "SEGMENT_PROGRESS") and (progress is None or progress == 0.0):
            if not has_started:
                state_status = "preparing"

        if has_started and state_status == "preparing":
            state_status = "running"
        state_progress = progress
        if state_progress is None:
            if state_status == "done":
                state_progress = 1.0
            elif context.task_type in {"sample_build", "sample_test"}:
                # Provide synthetic progress fallbacks for voice tasks ONLY if no task-reported progress is available
                progress_map = {
                    "queued": 0.0,
                    "preparing": 0.0,
                    "running": 0.0, # start at 0.0, real task will report progress via heartbeat
                    "finalizing": 0.9,
                }
                state_progress = progress_map.get(state_status, 0.0)
            else:
                state_progress = 0.0
        # Safety: Do not emit eta_seconds=0 for active jobs; it's better to show no ETA than a false zero.
        if eta_seconds == 0 and state_status not in {"done", "failed", "cancelled"}:
            eta_seconds = None

        finished_at = time.time() if state_status in {"done", "failed", "cancelled"} else None
        updated_at = time.time()
        trace(
            "orchestrator.publish",
            job_id=context.task_id,
            project_id=context.project_id,
            chapter_id=context.chapter_id,
            status=state_status,
            progress=state_progress,
            eta_seconds=eta_seconds,
            active_segment_eta_seconds=active_segment_eta_seconds,
            eta_confidence=eta_confidence,
            reason_code=reason_code,
            message=message,
            started_at=started_at,
            active_segment_id=active_segment_id,
            active_segment_progress=active_segment_progress,
            force=force,
        )
        try:
            # Sync with the persistent state.json for UI visibility and polling.
            # We import lazily to stay behind the state boundary.
            from app.db.state import get_jobs, put_job, update_job, Job  # noqa: PLC0415

            # Anti-Regression: If this is an update to an existing job, don't allow progress to regress
            # unless the status itself has regressed (e.g. requeued).
            existing_job = get_jobs().get(context.task_id)
            if existing_job and state_status == existing_job.status and state_progress is not None:
                if state_progress < (existing_job.progress or 0.0):
                    state_progress = existing_job.progress

            # self.progress_service must be available on the target class
            self.progress_service.publish(
                job_id=context.task_id,
                status=state_status,
                scope="segment" if (context.payload and context.payload.get("segment_ids")) else "chapter",
                parent_job_id=context.project_id,
                chapter_id=context.chapter_id,
                progress=state_progress,
                eta_seconds=eta_seconds,
                eta_confidence=eta_confidence,
                message=message,
                reason_code=reason_code,
                waiting_reason=waiting_reason,
                started_at=started_at,
                active_segment_id=active_segment_id,
                active_segment_progress=active_segment_progress,
                active_segment_eta_seconds=active_segment_eta_seconds,
                render_group_count=render_group_count,
                completed_render_groups=completed_render_groups,
                active_render_group_index=active_render_group_index,
                total_render_weight=total_render_weight,
                completed_render_weight=completed_render_weight,
                active_render_group_weight=active_render_group_weight,
                grouped_progress=grouped_progress,
                allow_progress_regression=allow_progress_regression,
                force=force,
                updated_at=updated_at,
                has_segment_support=has_segment_support,
            )

            # Initialize job state if this is the first event (usually 'queued')
            if not existing_job:
                job = Job(
                    id=context.task_id,
                    engine=getattr(context, "task_type", "synthesis"),  # type: ignore[arg-type]
                    status=state_status,  # type: ignore[arg-type]
                    created_at=time.time(),
                    updated_at=updated_at,
                    started_at=started_at,
                    project_id=context.project_id,
                    chapter_id=context.chapter_id,
                    speaker_profile=context.payload.get("speaker_profile"),
                    progress=state_progress or 0.0,
                    finished_at=finished_at,
                    error=message if state_status == "failed" else None,
                    eta_seconds=eta_seconds,
                    eta_confidence=eta_confidence,
                    active_segment_id=active_segment_id,
                    active_segment_progress=active_segment_progress,
                    active_segment_eta_seconds=active_segment_eta_seconds,
                    active_segment_eta_basis="remaining_from_update" if active_segment_eta_seconds is not None else None,
                    active_segment_updated_at=updated_at if active_segment_eta_seconds is not None else None,
                    render_group_count=render_group_count,
                    completed_render_groups=completed_render_groups,
                    active_render_group_index=active_render_group_index,
                    total_render_weight=total_render_weight,
                    completed_render_weight=completed_render_weight,
                    active_render_group_weight=active_render_group_weight,
                    grouped_progress=grouped_progress,
                    has_segment_support=has_segment_support,
                )
                put_job(job)
            else:
                updates: dict[str, object | None] = {
                    "status": state_status,
                    "progress": state_progress,
                    "message": message,
                    "reason_code": reason_code,
                    "updated_at": updated_at,
                    "active_segment_id": active_segment_id,
                    "active_segment_progress": active_segment_progress,
                    "active_segment_eta_seconds": active_segment_eta_seconds,
                    "active_segment_eta_basis": "remaining_from_update" if active_segment_eta_seconds is not None else None,
                    "active_segment_updated_at": updated_at if active_segment_eta_seconds is not None else None,
                    "render_group_count": render_group_count,
                    "completed_render_groups": completed_render_groups,
                    "active_render_group_index": active_render_group_index,
                    "total_render_weight": total_render_weight,
                    "completed_render_weight": completed_render_weight,
                    "active_render_group_weight": active_render_group_weight,
                    "grouped_progress": grouped_progress,
                    "has_segment_support": has_segment_support,
                }
                if eta_seconds is not None:
                    updates["eta_seconds"] = eta_seconds
                if eta_confidence is not None:
                    updates["eta_confidence"] = eta_confidence
                if started_at is not None:
                    updates["started_at"] = started_at
                if finished_at is not None:
                    updates["finished_at"] = finished_at
                if state_status == "failed":
                    updates["error"] = message or "Task failed."
                elif state_status == "done":
                    updates["error"] = None
                    # Ensure chapter-level audio is linked by propagating output filenames
                    output_path = context.payload.get("output_path")
                    if output_path:
                        from pathlib import Path
                        fname = Path(output_path).name
                        if fname.lower().endswith(".mp3"):
                            updates["output_mp3"] = fname
                        else:
                            updates["output_wav"] = fname
                update_job(context.task_id, force_broadcast=force, skip_studio_job_event=True, skip_job_updated=True, **updates)



        except Exception:
            logger.exception(
                "Failed to publish progress event for task %s (status=%s).",
                context.task_id,
                status,
            )

    def _context_to_job(self, context: TaskContext) -> Job:
        """Convert a TaskContext into a Job shim for the legacy handler registry."""
        payload = context.payload or {}
        engine_id = str(payload.get("engine_id") or payload.get("engine") or "")
        from app.engines.behavior import uses_segment_orchestration, supports_segment_rendering
        has_segment_support = bool(
            uses_segment_orchestration(engine_id) or supports_segment_rendering(engine_id)
        )
        return Job(
            id=context.task_id,
            engine=engine_id,
            kind=str(context.task_type),
            status="running",
            created_at=context.submitted_at or time.time(),
            project_id=context.project_id,
            chapter_id=context.chapter_id,
            chapter_file=str(payload.get("chapter_file") or Path(payload.get("output_path", "")).name),
            speaker_profile=payload.get("voice_profile_id") or payload.get("speaker_profile"),
            safe_mode=payload.get("safe_mode", True),
            make_mp3=payload.get("make_mp3", False),
            is_bake=payload.get("is_bake", False),
            segment_ids=payload.get("segment_ids"),
            custom_title=payload.get("custom_title") or payload.get("book_title"),
            author_meta=payload.get("author") or payload.get("author_meta"),
            narrator_meta=payload.get("narrator") or payload.get("narrator_meta"),
            chapter_list=payload.get("chapters"),
            cover_path=str(payload.get("cover_path")) if payload.get("cover_path") else None,
            has_segment_support=has_segment_support,
        )

    def _relay_output_wrapper(self, task: StudioTask) -> Callable[[str], None]:
        """Return a callback that relays output lines to the orchestrator's log listener."""
        def on_output(line: str) -> None:
            if not line.strip():
                return
            # Use the task's internal relay if available
            relay = getattr(task, "_relay_output", None)
            if callable(relay):
                relay(line)
            else:
                # Fallback: broadcast directly to watchdog
                from app.engines.watchdog import get_watchdog
                wd = get_watchdog()
                if wd:
                    wd._broadcast_log(line, task_id=task.task_id)
        return on_output


def _claim_to_dict(claim: object | None) -> dict[str, object]:
    """Convert a ResourceClaim to the dict format expected by reserve_task_resources."""
    if claim is None:
        return {}
    return {
        "gpu": getattr(claim, "gpu", False),
        "vram_mb": getattr(claim, "vram_mb", 0),
        "cpu_heavy": getattr(claim, "cpu_heavy", False),
        "exclusive": getattr(claim, "exclusive", False),
    }
