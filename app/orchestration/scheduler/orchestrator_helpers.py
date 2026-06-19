"""Internal implementation helpers for the Studio 2.0 TaskOrchestrator.

This module composes OrchestratorHelpersMixin from three focused sub-modules:
  - orchestrator_eta.py     — duration/ETA estimation
  - orchestrator_publish.py — progress publication, context-to-job, output relay
  - (dispatch + reconcile remain here — they are tightly coupled closure state)

All names that tests patch via
  "app.orchestration.scheduler.orchestrator_helpers.<name>"
remain importable from this module (re-export façade where needed).
"""

from __future__ import annotations

import inspect
import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Optional

from app.orchestration.progress.eta import estimate_eta_seconds
from app.orchestration.tasks.base import TaskResult
from app.utils.render_trace import trace
from app.jobs.registry import get_handler_registry, initialize_default_handlers  # noqa: F401 (re-export for patch targets)
from app.db.models import Job

from app.orchestration.scheduler.orchestrator_eta import OrchestratorEtaMixin
from app.orchestration.scheduler.orchestrator_publish import OrchestratorPublishMixin

if TYPE_CHECKING:
    from app.orchestration.tasks.base import StudioTask, TaskContext

logger = logging.getLogger(__name__)


class OrchestratorHelpersMixin(OrchestratorEtaMixin, OrchestratorPublishMixin):
    """Internal implementation details for TaskOrchestrator.

    Extracted to keep orchestrator.py focused on high-level workflows.
    Sub-behaviours live in orchestrator_eta.py and orchestrator_publish.py;
    this module owns _reconcile_task and _dispatch (which carries a large
    closure that tightly captures local timing state).
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
        segment_announced = {}
        marker_state = {
            "start_synthesis_emitted": False,
            "start_segment_ids": set(),
        }
        marker_driven = bool(getattr(task, "is_marker_driven", False))
        expected_duration = self._estimate_task_duration(task=task, context=context)

        engine_id = context.payload.get("engine_id") or getattr(task, "engine_id", "synthesis")
        calibrated_cps = None
        calibrated_overhead = 0.0  # inter-group (model-reload) overhead seconds; gap factoring
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
                calibrated_overhead = max(0.0, float(params[1]))
        except Exception:
            pass

        def task_progress_reporter(progress: float, message: str | None, reason_code: str | None, status: str = "running"):
            # Non-marker tasks start when they first report running. Marker-driven
            # tasks should only fall back here for real positive progress if a
            # START_SYNTHESIS marker was missed.
            is_voice_sample = context.task_type in {"sample_build", "sample_test"}
            if (
                status == "running"
                and timing["render_started_at"] is None
                and (
                    (not marker_driven and not is_voice_sample)
                    or progress > 0.0
                )
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
            # Stats recording is best-effort bookkeeping: it must never be able
            # to convert a completed dispatch into a failed TaskResult, so the
            # entire body is failure-isolated.
            try:
                _record_render_stats_inner(result, raw_result)
            except Exception:
                logger.warning(
                    "Failed to record render performance sample for task %s.",
                    context.task_id,
                    exc_info=True,
                )

        def _record_render_stats_inner(result: TaskResult, raw_result: dict | None = None) -> None:
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
                elif perf_job_obj and (getattr(perf_job_obj, "render_group_count", 0) or 0) > 0:
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

                sum_segment_render_seconds = (
                    getattr(perf_job_obj, "sum_segment_render_seconds", None)
                    if perf_job_obj else None
                ) or timing.get("sum_segment_render_seconds")

                # Only record a calibration sample when REAL synthesis happened —
                # i.e. a synthesis duration was actually measured (markers, or the
                # accumulated per-segment render time). A reuse render (cached
                # per-segment audio re-stitched by ffmpeg — no synthesis markers,
                # so no synthesis duration) has none; recording it would corrupt
                # CPS/ETA calibration, and record_render_sample mandates a positive
                # synthesis duration (it raises otherwise — the "Failed to record
                # render performance sample" traceback the user saw). Skip it
                # quietly; the produced-metadata finalize below still runs.
                if (synthesis_dur is not None and synthesis_dur > 0) or (
                    sum_segment_render_seconds is not None and sum_segment_render_seconds > 0
                ):
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
                        sum_segment_render_seconds=sum_segment_render_seconds,
                    )
                else:
                    logger.debug(
                        "Skipping render performance sample for task %s: no synthesis "
                        "duration (reuse / stitch-only render).",
                        context.task_id,
                    )

                # Finalize produced metadata for the completed (incl. reused) chapter.
                try:
                    from app.db.state import update_job
                    update_job(
                        context.task_id,
                        force_broadcast=True,
                        finished_at=completed_at_val,
                        completed_at=completed_at_val,
                        audio_length_seconds=audio_duration_seconds,
                        produced_audio_length=audio_duration_seconds,
                        produced_chars=chars,
                        produced_segment_count=segment_count,
                    )
                except Exception:
                    pass
            except Exception:
                logger.warning(
                    "Failed to record render performance sample for task %s.",
                    context.task_id,
                    exc_info=True,
                )

        # Emit indeterminate "loading voice model" frame.  This covers the ~36s
        # XTTS cold-load window before the first [START_SEGMENT] marker arrives.
        # engine_activity_started_at may already be set if the engine sent its
        # activity marker before dispatch; if not, elapsed is 0.
        _loading_elapsed: float | None = None
        _engine_act_start = timing.get("engine_activity_started_at")
        if _engine_act_start is not None:
            _loading_elapsed = max(0.0, time.time() - _engine_act_start)
        self._publish(
            context=context,
            status="preparing",
            progress=0.0,
            started_at=None,
            message="Loading voice model…",
            reason_code="LOADING_MODEL",
            indeterminate=True,
            loading_elapsed_seconds=_loading_elapsed,
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

        def _publish_segment_started(sid: str) -> None:
            """Publish the canonical START_SEGMENT frame for *sid* at engine-confirmation time.

            Called from two places:
            1. [START_SYNTHESIS] branch — engine confirmed after announce (mixed-render pattern).
            2. First PROGRESS branch — engines that skip START_SYNTHESIS entirely.
            The clock (segment_starts[sid]) must already be set before calling this.
            """
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
                # Engine-confirmed clock: if a segment was already announced but not yet
                # confirmed (mixed-render: START_SEGMENT before model load), record the
                # engine-confirmed start time now so the model-load window is excluded.
                _pending_seg_id = active_seg_id[0] if active_seg_id[0] and active_seg_id[0] not in segment_starts else None
                if _pending_seg_id:
                    segment_starts[_pending_seg_id] = now_time
                if marker_state["start_synthesis_emitted"]:
                    # Subsequent START_SYNTHESIS (mixed renders emit one per group
                    # subprocess): still confirm the pending segment before deduping.
                    if _pending_seg_id:
                        _publish_segment_started(_pending_seg_id)
                    return
                marker_state["start_synthesis_emitted"] = True
                if timing["render_started_at"] is None:
                    timing["render_started_at"] = now_time

                # Sync the first segment with the REAL synthesis start. If no
                # [START_SEGMENT] marker has arrived yet (engines/builds that emit
                # only START_SYNTHESIS + PROGRESS + SEGMENT_SAVED, or a stale warm
                # worker), derive the first render group's leader so the running
                # frame below carries active_segment_id — mounting the segment
                # progress bar at 0% in lockstep with the queue going "running",
                # instead of first appearing seconds later at the first PROGRESS
                # tick (already a non-zero percent). UI-mount only: we do NOT set
                # segment_starts (the render-timing clock) or the START_SEGMENT
                # dedup set here, so a later real [START_SEGMENT] still records
                # announce/confirmation timing normally.
                if active_seg_id[0] is None and script:
                    _eids0 = (script[0].get("ids") or []) if len(script) > 0 else []
                    if _eids0:
                        active_seg_id[0] = _eids0[0]
                        active_seg_progress[0] = 0.0
                        active_render_group_index[0] = 0

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
                    progress=_get_grouped_progress(),
                    eta_seconds=self._duration_to_eta_seconds(expected_duration),
                    started_at=timing["render_started_at"],
                    message="Synthesis in progress...",
                    active_segment_id=active_seg_id[0],
                    active_segment_progress=0.0 if active_seg_id[0] else None,
                    render_group_count=render_group_count,
                    completed_render_groups=completed_group_count[0],
                    active_render_group_index=active_render_group_index[0],
                    total_render_weight=total_weight,
                    completed_render_weight=completed_weight[0],
                    active_render_group_weight=id_to_weight.get(active_seg_id[0], 0) if active_seg_id[0] else 0,
                    grouped_progress=_get_grouped_progress(),
                    force=False,
                )
                # If a segment was pending confirmation, now publish its canonical START_SEGMENT frame.
                if _pending_seg_id:
                    _publish_segment_started(_pending_seg_id)

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

                    # B8 diagnostic: log whether sid is in the weight table and
                    # whether the dedup guard fires.  Guarded by DEBUG level so
                    # production logs stay clean.
                    if logger.isEnabledFor(logging.DEBUG):
                        known_keys = list(id_to_weight.keys())
                        in_weight_table = sid in id_to_weight
                        dedup_would_fire = sid in marker_state["start_segment_ids"]
                        logger.debug(
                            "[B8-diag] START_SEGMENT received: sid=%r | "
                            "in_id_to_weight=%s | dedup_guard=%s | known_keys=%r",
                            sid,
                            in_weight_table,
                            dedup_would_fire,
                            known_keys,
                        )
                    if sid in marker_state["start_segment_ids"]:
                        return
                    marker_state["start_segment_ids"].add(sid)
                    active_seg_id[0] = sid
                    active_seg_progress[0] = 0.0
                    # Record announce time; segment_starts is set later upon engine confirmation
                    # (START_SYNTHESIS or first PROGRESS). This prevents model-load time from
                    # being counted as synthesis time in mixed renders.
                    segment_announced[sid] = now_time
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
                    # Publish SEGMENT_PENDING (announce): engine has not confirmed yet.
                    # active_segment_eta_seconds is None so the UI does not start pacing.
                    # The canonical START_SEGMENT frame is emitted at engine confirmation
                    # (START_SYNTHESIS or first PROGRESS line).
                    self._publish(
                        context=context,
                        status="running",
                        progress=_get_grouped_progress(),
                        eta_seconds=self._duration_to_eta_seconds(remaining_eta),
                        active_segment_eta_seconds=None,
                        reason_code="SEGMENT_PENDING",
                        message=f"Preparing engine for segment {sid}...",
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
                    # Never confirm at announce: a prior START_SYNTHESIS belongs to an
                    # earlier group's subprocess in mixed renders. Confirmation comes
                    # only from the engine — its own START_SYNTHESIS or first PROGRESS.
                except (IndexError, ValueError):
                    pass

            from app.engines.behavior import parse_engine_progress
            engine_id = context.payload.get("engine_id") or ""
            raw_progress = parse_engine_progress(engine_id, line)

            if raw_progress is not None:
                if timing["render_started_at"] is None:
                    timing["render_started_at"] = time.time()
                # Fallback: if the [START_SEGMENT] marker never reached us (e.g. a
                # stale engine build that still emits PROGRESS/SEGMENT_SAVED but not
                # START_SEGMENT), active_seg_id is None and the segment progress bar +
                # text highlight would never engage (service.py gates segment frames
                # on a non-null active_segment_id). Derive the active segment from the
                # known render-group structure — the active group is the next unsaved
                # one (completed_group_count). Only runs when None, so a real
                # START_SEGMENT marker always takes precedence; the block below then
                # sets segment_starts and publishes the canonical START_SEGMENT frame.
                if active_seg_id[0] is None and script:
                    _idx = min(completed_group_count[0], len(script) - 1)
                    _eids = (script[_idx].get("ids") or []) if 0 <= _idx < len(script) else []
                    if _eids:
                        active_seg_id[0] = _eids[0]
                        active_render_group_index[0] = _idx
                        # Register in the dedup set so a late real [START_SEGMENT] for
                        # this same group cannot re-enter its branch and reset progress.
                        marker_state["start_segment_ids"].add(active_seg_id[0])
                # Engine-confirmed clock fallback: engines that skip START_SYNTHESIS but emit
                # PROGRESS lines — confirm the segment start at first progress.
                _progress_confirmed_seg = None
                if active_seg_id[0] and active_seg_id[0] not in segment_starts:
                    segment_starts[active_seg_id[0]] = time.time()
                    _progress_confirmed_seg = active_seg_id[0]
                try:
                    if total_weight > 0:
                        active_seg_progress[0] = raw_progress
                        p = _get_grouped_progress()
                    else:
                        p = raw_progress

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

                    # If this is the first PROGRESS confirming an announced-but-unconfirmed
                    # segment, publish the canonical START_SEGMENT frame first.
                    if _progress_confirmed_seg:
                        _publish_segment_started(_progress_confirmed_seg)

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

                        # Capture timing: prefer engine-confirmed start; fall back to announce
                        # time for engines (e.g. Voxtral) that emit no confirmation signal.
                        started = segment_starts.get(leader_id) or segment_announced.get(leader_id)
                        if started is not None:
                            seg_dur = now_time - started
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

                        # Gap-aware ETA at segment completion: re-anchor the
                        # countdown to the synthesis time for the remaining groups
                        # PLUS the inter-group (model-reload) overhead, so the bar
                        # does not coast toward completion during the gap before the
                        # next group starts. (Wires the previously-dead
                        # calculate_chapter_remaining_eta; weight == char count.)
                        # Degrades to the overhead-free estimate when no calibration
                        # history exists (calibrated_overhead == 0).
                        _saved_eta: int | None = None
                        try:
                            from app.orchestration.scheduler.eta import calculate_chapter_remaining_eta  # noqa: PLC0415
                            from app.engines.behavior import DEFAULT_BASELINE_ENGINE_CPS  # noqa: PLC0415
                            _cps = calibrated_cps if (calibrated_cps and calibrated_cps > 0) else DEFAULT_BASELINE_ENGINE_CPS
                            _remaining_w = max(int(total_weight) - int(completed_weight[0]), 0)
                            _groups_remaining = max(render_group_count - completed_group_count[0], 0)
                            if _remaining_w > 0 and _cps and _cps > 0:
                                _saved_eta = calculate_chapter_remaining_eta(
                                    active_group_remaining_chars=0,
                                    remaining_chars=_remaining_w,
                                    cps=_cps,
                                    groups_remaining=_groups_remaining,
                                    inter_group_overhead=calibrated_overhead,
                                )
                        except Exception:
                            _saved_eta = None

                        self._publish(
                            context=context,
                            status="running",
                            progress=_get_grouped_progress(),
                            eta_seconds=_saved_eta,
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
                is_voice_sample = context.task_type in {"sample_build", "sample_test"}
                if not is_voice_sample:
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
                    is_voice_sample = context.task_type in {"sample_build", "sample_test"}
                    if not is_voice_sample:
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
                        logger.exception("Task %s: bridge dispatch raised.", context.task_id)
                        from app.engines.errors import EngineUnavailableError
                        is_retriable = isinstance(exc, EngineUnavailableError)
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
