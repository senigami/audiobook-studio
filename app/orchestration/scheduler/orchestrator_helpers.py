"""Internal implementation helpers for the Studio 2.0 TaskOrchestrator.

This module composes OrchestratorHelpersMixin from three focused sub-modules:
  - orchestrator_eta.py     — duration/ETA estimation
  - orchestrator_publish.py — progress publication, context-to-job, output relay
  - (dispatch + reconcile remain here — they are tightly coupled closure state)

All names that tests patch via
  "app.orchestration.scheduler.orchestrator_helpers.<name>"
remain importable from this module (re-export façade where needed).

W-PAR task 003 (per-segment dispatch isolation, INV-6): ``_dispatch`` is a
thin fan-out driver that calls ``_dispatch_segment`` once per script group.
Today (cap=1 / N=1 fan-out) there is exactly one group's worth of dispatch
work per chapter task, so this is behavior-neutral (INV-1, the ship-dark
gate) — the per-segment timing/marker/load closure state that used to live
directly in ``_dispatch`` now lives in ``_dispatch_segment``'s own local
scope, isolated by Python closure semantics rather than shared mutable
scalars. Wiring fan-out > 1 into the live dispatch path (tts_mixed/handler.py,
orchestrator.submit()) is explicitly out of scope here — that integration is
owned by task 005 / the enable-gate, not 003.
"""

from __future__ import annotations

import inspect
import logging
import time
from dataclasses import dataclass
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

# W-PAR: whether to emit the chapter-level ``active_segments_map`` on progress
# frames. Was kept OFF (task 003/005) until task 008 wired genuine fan-out > 1
# and a real parent-side multi-entry aggregation (see
# ``ChapterSynthesisTask._current_active_segments_map`` in
# ``app.orchestration.tasks.segment_synthesis``, imported by that module from
# HERE so there is a single flag/source of truth). At cap=1 there is only ever
# one active segment, fully conveyed by ``active_segment_id`` — this module's
# own single-child ``_dispatch_segment`` call site (``_current_active_segments_map``
# below) still returns ``None`` in that case by construction (never more than
# one entry), so cap=1 stays byte-identical (INV-1). Flipped ON 2026-07-03
# (W-PAR 008): the earlier cap=1 bug this flag guarded against (stale
# ``preparing`` entries from the cold-start model-load window leaking into the
# frontend's map-branch, "black all at once") only ever occurred from a
# REDUNDANT single-entry map at cap=1 — genuine multi-entry maps from real
# concurrent children are the intended, additive (INV-1/INV-9) C2 contract.
_EMIT_ACTIVE_SEGMENTS_MAP = True


@dataclass
class SegmentResult:
    """Per-segment dispatch outcome (W-PAR 003).

    Returned by ``_dispatch_segment``; carries the isolated per-segment
    timing/marker/load state so a thin parent ``_dispatch`` (or a future
    multi-group fan-out, task 005) can aggregate chapter-level stats and
    ``active_segments_map`` without reaching into shared mutable closure
    scalars (INV-6).
    """

    task_result: TaskResult
    timing: dict[str, Any]
    marker_state: dict[str, Any]
    segment_load_observed: set
    segment_starts: dict[str, float]
    segment_announced: dict[str, float]


class OrchestratorHelpersMixin(OrchestratorEtaMixin, OrchestratorPublishMixin):
    """Internal implementation details for TaskOrchestrator.

    Extracted to keep orchestrator.py focused on high-level workflows.
    Sub-behaviours live in orchestrator_eta.py and orchestrator_publish.py;
    this module owns _reconcile_task, the thin _dispatch fan-out driver, and
    _dispatch_segment (which carries the per-segment closure of timing/marker/
    load state — W-PAR 003, INV-6).
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
        """Thin fan-out driver (W-PAR 003): dispatch one script group at a time.

        W-PAR 008 (R4, owner ruling): a chapter fan-out coordinator
        (``ChapterSynthesisTask``, marked via ``is_chapter_fanout = True``)
        renders NOTHING itself — it only spawns concurrent
        ``SegmentSynthesisTask`` children, each of which reuses
        ``_dispatch_segment`` independently (via
        ``make_dispatch_segment_bridge_call``). Routing the PARENT through
        ``_dispatch_segment`` as well would register an idle log_listener for
        a task that emits no engine markers and publish a confusing
        "Loading voice model…" frame — so the parent bypasses
        ``_dispatch_segment`` entirely and calls ``task.run()`` directly.

        For every other task (including the per-child synthetic tasks, which
        do NOT set ``is_chapter_fanout``), today's single dispatch unit still
        delegates straight to ``_dispatch_segment`` and returns its
        ``TaskResult``, byte-identical to the pre-003 single-``_dispatch``
        path (INV-1).
        """
        if getattr(task, "is_chapter_fanout", False):
            return task.run()
        result = self._dispatch_segment(task=task, context=context)
        return result.task_result

    def _dispatch_segment(self, *, task: StudioTask, context: TaskContext) -> SegmentResult:
        """Dispatch one segment/group's worth of work with fully isolated
        per-segment timing/marker/load state (W-PAR 003, INV-6).

        Every mutable scalar/dict/set below (``timing``, ``segment_starts``,
        ``segment_announced``, ``segment_load_observed``, ``marker_state``,
        ``pending_engine_activity``, ``load_state``, and the ``active_seg_*``
        cells) lives in THIS call's local scope — isolated by Python closure
        semantics, not by keying a shared dict on ``segment_id``. Two
        concurrent invocations of this method (once fan-out > 1 is wired,
        task 005) cannot observe or corrupt each other's state.
        """
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
        segment_load_observed = set()
        marker_state = {
            "start_synthesis_emitted": False,
            "start_segment_ids": set(),
        }
        pending_engine_activity = {
            "started_at": None,
            "activity_after_start_segment": False,
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

        # W-MIX-LA 006 — proactive warm-state check.
        # If the TTS server reports this engine is cold, pre-compute the expected
        # load term from DB history so we can publish an honest initial ETA before
        # any synthesis output arrives. Fail-open: any exception → term stays None
        # and the reactive MODEL_LOAD_STARTED path handles it if a load occurs.
        load_state: dict = {"term": None, "checked_at": None}
        try:
            from app.engines.watchdog import get_server_health  # noqa: PLC0415
            from app.db.performance import expected_model_load_seconds  # noqa: PLC0415
            _health = get_server_health()
            if _health is not None:
                for _eng_info in _health.get("engines", []):
                    if _eng_info.get("engine_id") == engine_id:
                        if _eng_info.get("model_warm") is False:
                            try:
                                _tts_model_for_load = tts_model
                            except NameError:
                                _tts_model_for_load = None
                            _load_secs = expected_model_load_seconds(engine_id, _tts_model_for_load)
                            if _load_secs is not None and _load_secs > 0:
                                load_state["term"] = _load_secs
                                load_state["checked_at"] = time.time()
                        break
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
            force=True,
            clear_eta=True,
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
            # Report the TRUE synthesis fraction. Clamp below 1.0 until terminal
            # reconciliation forces 100% (so the bar never reads "done" mid-render),
            # but do NOT scale it down by an arbitrary factor — that showed a
            # fabricated percentage (e.g. 90% when synthesis was actually complete).
            raw = (completed_weight[0] + (active_seg_progress[0] * active_w)) / total_weight
            val = round(min(0.99, raw), 4)
            if val > max_progress[0]:
                max_progress[0] = val
            return max_progress[0]

        def _current_active_segments_map(*, phase: str, sid: str | None, progress: float | None, eta_seconds: int | None = None, reason_code: str | None = None, indeterminate: bool | None = None) -> dict[str, dict] | None:
            """Build the C2 ``active_segments_map`` snapshot for THIS call's
            active segment (W-PAR 003).

            Today (N=1 fan-out) one ``_dispatch_segment`` call tracks exactly
            one active segment at a time, so the map has at most one entry —
            additive-only (INV-1): omitted entirely when there is no active
            segment to report, so cap=1 frames with no segment context are
            unaffected. Once fan-out > 1 is wired (task 005), the parent
            aggregates one ``SegmentResult``-derived entry per concurrent
            child into this same shape.

            Deferred to task 008 (see ``_EMIT_ACTIVE_SEGMENTS_MAP``): at cap=1
            the single active segment is fully conveyed by ``active_segment_id``,
            and a redundant single-entry map leaked stale ``preparing`` state
            into the frontend on cold starts. Returns ``None`` until fan-out > 1
            is live.
            """
            if not _EMIT_ACTIVE_SEGMENTS_MAP:
                return None
            if not sid:
                return None
            entry: dict[str, object] = {
                "phase": phase,
                "progress": round(float(progress), 4) if progress is not None else 0.0,
                "eta_seconds": eta_seconds,
            }
            if reason_code is not None:
                entry["reason_code"] = reason_code
            if indeterminate is not None:
                entry["indeterminate"] = bool(indeterminate)
            return {sid: entry}

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
                active_segments_map=_current_active_segments_map(
                    phase="rendering", sid=sid, progress=0.0, reason_code="START_SEGMENT",
                ),
            )

        def _resolve_active_engine_for_matching() -> str:
            """Resolve marker/progress matching from the active render group when available."""
            job_engine_id = ""
            if context and context.payload:
                job_engine_id = context.payload.get("engine_id") or ""
            if not job_engine_id:
                job_engine_id = getattr(task, "engine_id", "") or ""

            if not script or not active_seg_id[0]:
                return job_engine_id

            candidate_indices: list[int] = []
            leader_index = group_index_by_leader.get(active_seg_id[0])
            if leader_index is not None:
                candidate_indices.append(leader_index)
            if active_render_group_index[0] not in candidate_indices:
                candidate_indices.append(active_render_group_index[0])

            for index in candidate_indices:
                if index is None or index < 0 or index >= len(script):
                    continue
                group_engine = script[index].get("engine")
                if group_engine:
                    return str(group_engine)
            return job_engine_id

        def _match_timing_marker_with_job_fallback(
            *, active_engine_id: str, job_engine_id: str, line: str
        ) -> tuple[str | None, str | None]:
            """Prefer active-engine timing markers, then fall back to the job engine."""
            from app.engines.behavior import match_timing_marker

            candidate_engine_ids: list[str] = []
            for candidate in (active_engine_id, job_engine_id):
                candidate = str(candidate or "").strip()
                if candidate and candidate not in candidate_engine_ids:
                    candidate_engine_ids.append(candidate)

            for candidate_engine_id in candidate_engine_ids:
                matched = match_timing_marker(candidate_engine_id, line)
                if matched is not None:
                    return matched, candidate_engine_id
            return None, None

        def _active_engine_has_specific_activity_marker(engine_id: str) -> bool:
            """Return True when the active engine declares a real load marker.

            Mixed and Voxtral both expose the generic bracketed placeholder
            ``[ENGINE_ACTIVITY_STARTED]``. That marker is emitted by the mixed
            handler before every group and must not be treated as a model-load
            observation for synthesis-timing fallback.
            """
            if not engine_id:
                return False
            from app.engines.behavior import get_timing_markers

            markers = get_timing_markers(engine_id).get("ENGINE_ACTIVITY_STARTED") or []
            for marker in markers:
                marker_text = str(marker).strip()
                if marker_text and marker_text != "[ENGINE_ACTIVITY_STARTED]":
                    return True
            return False

        def _close_pending_engine_activity_interval(*, confirmed_at: float, require_post_announce_confirmation: bool) -> None:
            pending_started_at = pending_engine_activity.get("started_at")
            if pending_started_at is None:
                return
            activity_after_start_segment = bool(pending_engine_activity.get("activity_after_start_segment"))
            if activity_after_start_segment != require_post_announce_confirmation:
                return

            # Re-armable across render groups: a later, genuine model-load window
            # (e.g. a cold XTTS group) must never be masked by an earlier group
            # whose activity window was ~0 — a Voxtral group or a warm XTTS group
            # that loads no model. The handler emits [ENGINE_ACTIVITY_STARTED]
            # before *every* group, so a single-shot latch would let the first
            # group (whatever its engine) claim the job's model-load slot and hide
            # the real load. Keep the largest window observed — the dominant load —
            # so capture is correct regardless of group order. Per-group sampling /
            # accumulation and the sole-writer split are W2 (task 002); this only
            # ensures the job-level window reflects the real load.
            window_seconds = max(0.0, confirmed_at - float(pending_started_at))
            existing = timing.get("model_load_seconds")
            if existing is None or window_seconds > existing:
                timing["model_load_seconds"] = window_seconds
                timing["engine_activity_started_at"] = float(pending_started_at)
                try:
                    from app.db.state import update_job
                    update_job(
                        context.task_id,
                        model_load_seconds=window_seconds,
                        engine_activity_started_at=float(pending_started_at),
                    )
                except Exception:
                    pass

            pending_engine_activity["started_at"] = None
            pending_engine_activity["activity_after_start_segment"] = False

        def _active_segment_is_announced_and_unconfirmed() -> bool:
            sid = active_seg_id[0]
            if not sid:
                return False
            return sid in segment_announced and sid not in segment_starts

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

            active_engine_id = _resolve_active_engine_for_matching()

            matched_marker, matched_marker_engine = _match_timing_marker_with_job_fallback(
                active_engine_id=active_engine_id,
                job_engine_id=engine_id or "",
                line=line,
            )

            # [MODEL_LOAD_STARTED] is a dedicated, engine-agnostic real-load marker (emitted
            # only by the engine wrapper on an actual cold load). The per-engine manifest match
            # above fails for mixed jobs (active engine resolves to "mixed", whose manifest has
            # no MODEL_LOAD_STARTED), so recognize it directly regardless of engine resolution.
            if matched_marker is None and "[MODEL_LOAD_STARTED]" in line:
                matched_marker = "MODEL_LOAD_STARTED"

            now_time = time.time()

            if matched_marker == "ENGINE_ACTIVITY_STARTED":
                if timing.get("engine_activity_started_at") is None:
                    timing["engine_activity_started_at"] = now_time
                    try:
                        from app.db.state import update_job
                        update_job(context.task_id, engine_activity_started_at=now_time)
                    except Exception:
                        pass
                pending_engine_activity["started_at"] = now_time
                pending_engine_activity["activity_after_start_segment"] = _active_segment_is_announced_and_unconfirmed()
                if (
                    active_seg_id[0]
                    and matched_marker_engine == active_engine_id
                    and _active_engine_has_specific_activity_marker(active_engine_id)
                ):
                    segment_load_observed.add(active_seg_id[0])
                    # A real model-load window opened for the active segment — suspend the ETA
                    # and flip to indeterminate for its duration (forced so the bar updates with
                    # no progress delta). Warm groups never reach here (no specific load marker),
                    # so they don't flash. Pacing resumes from a fresh ETA at engine confirmation.
                    self._publish(
                        context=context,
                        status="running",
                        progress=_get_grouped_progress(),
                        eta_seconds=None,
                        clear_eta=True,
                        indeterminate=True,
                        loading_elapsed_seconds=max(0.0, now_time - float(pending_engine_activity["started_at"])) if pending_engine_activity.get("started_at") else 0.0,
                        active_segment_eta_seconds=None,
                        reason_code="LOADING_MODEL",
                        message="Loading voice model…",
                        started_at=timing["render_started_at"],
                        active_segment_id=active_seg_id[0],
                        render_group_count=render_group_count,
                        completed_render_groups=completed_group_count[0],
                        active_render_group_index=active_render_group_index[0],
                        total_render_weight=total_weight,
                        completed_render_weight=completed_weight[0],
                        active_render_group_weight=id_to_weight.get(active_seg_id[0], 0),
                        grouped_progress=_get_grouped_progress(),
                        force=True,
                        active_segments_map=_current_active_segments_map(
                            phase="preparing", sid=active_seg_id[0], progress=0.0,
                            reason_code="LOADING_MODEL", indeterminate=True,
                        ),
                    )

            if matched_marker == "MODEL_LOAD_STARTED":
                # Dedicated real-load marker emitted by the XTTS wrapper only when
                # the worker's cold-load line is observed (never on warm reuse or Voxtral).
                # Real-load-only by construction → INV-2 safe; no extra gate needed.
                # Parse sid: tokens after [MODEL_LOAD_STARTED]; if 2+ tokens, sid=first;
                # if 1 token (just task_id), fall back to active_seg_id[0].
                _mls_sid: Optional[str] = None
                try:
                    _mls_parts = line.split("[MODEL_LOAD_STARTED]", 1)
                    if len(_mls_parts) > 1:
                        _mls_tokens = _mls_parts[1].strip().split()
                        if len(_mls_tokens) >= 2:
                            _mls_sid = _mls_tokens[0]
                        elif len(_mls_tokens) == 1:
                            # Only task_id present; fall through to active_seg_id below.
                            _mls_sid = None
                except Exception:
                    pass
                if _mls_sid is None:
                    _mls_sid = active_seg_id[0]

                if _mls_sid:
                    segment_load_observed.add(_mls_sid)

                # Attribution fallback for the dispatch-time (job-level) cold load:
                # the marker carries only the task_id and no segment has been
                # announced yet, so _mls_sid is None. Skipping the publish here
                # left the whole load window with NO loading signal at all — no
                # indeterminate frame, no reconciled ETA, no segment for the text
                # preparing pulse (owner-observed regression 2026-07-02). Attribute
                # the frame to the first render group's leader (UI-attribution
                # only — segment_load_observed / segment_starts are NOT touched,
                # so render-timing and W2 stats stay driven by real markers).
                _mls_attr_sid = _mls_sid
                if _mls_attr_sid is None and script:
                    _mls_eids0 = (script[0].get("ids") or []) if len(script) > 0 else []
                    if _mls_eids0:
                        _mls_attr_sid = _mls_eids0[0]

                # W-MIX-LA 006 — reconcile or inject load term instead of clearing ETA.
                if load_state["term"] is not None and load_state["checked_at"] is not None:
                    _elapsed_since_check = max(0.0, now_time - load_state["checked_at"])
                    _remaining_load = max(0.0, load_state["term"] - _elapsed_since_check)
                    _synth_remaining = self._duration_to_eta_seconds(expected_duration) or 0
                    _mls_eta: int | None = max(1, _synth_remaining + int(round(_remaining_load)))
                    _mls_clear = False
                else:
                    try:
                        from app.db.performance import expected_model_load_seconds  # noqa: PLC0415
                        try:
                            _fb_tts_model = tts_model
                        except NameError:
                            _fb_tts_model = None
                        _fb_load = expected_model_load_seconds(engine_id, _fb_tts_model)
                        if _fb_load is not None and _fb_load > 0:
                            _synth_remaining = self._duration_to_eta_seconds(expected_duration) or 0
                            _mls_eta = max(1, _synth_remaining + int(round(_fb_load)))
                            load_state["term"] = _fb_load
                            load_state["checked_at"] = now_time
                            _mls_clear = False
                        else:
                            _mls_eta = None
                            _mls_clear = True
                    except Exception:
                        _mls_eta = None
                        _mls_clear = True
                # Durable-status honesty: before START_SYNTHESIS the job is still
                # 'preparing' (dispatch-time cold load); publishing 'running' here
                # would flip the durable status early. Mid-chapter loads (a later
                # group's cold load) keep INV-1 monotonic 'running'.
                _mls_status = "running" if marker_state["start_synthesis_emitted"] else "preparing"
                self._publish(
                    context=context,
                    status=_mls_status,
                    progress=_get_grouped_progress(),
                    eta_seconds=_mls_eta,
                    clear_eta=_mls_clear,
                    indeterminate=True,
                    loading_elapsed_seconds=max(0.0, now_time - float(pending_engine_activity["started_at"])) if pending_engine_activity.get("started_at") else 0.0,
                    active_segment_eta_seconds=None,
                    reason_code="LOADING_MODEL",
                    message="Loading voice model…",
                    started_at=timing["render_started_at"],
                    active_segment_id=_mls_attr_sid,
                    render_group_count=render_group_count,
                    completed_render_groups=completed_group_count[0],
                    active_render_group_index=active_render_group_index[0],
                    total_render_weight=total_weight,
                    completed_render_weight=completed_weight[0],
                    active_render_group_weight=id_to_weight.get(_mls_attr_sid, 0) if _mls_attr_sid else 0,
                    grouped_progress=_get_grouped_progress(),
                    force=True,
                    active_segments_map=_current_active_segments_map(
                        phase="preparing", sid=_mls_attr_sid, progress=0.0,
                        eta_seconds=_mls_eta, reason_code="LOADING_MODEL", indeterminate=True,
                    ),
                )
                # Do NOT open a new pending_engine_activity interval here —
                # the generic [ENGINE_ACTIVITY_STARTED] already opened it;
                # this marker only emits the frame (avoids double model_load_seconds).

            if matched_marker == "START_SYNTHESIS" or "[START_SYNTHESIS]" in line:
                _close_pending_engine_activity_interval(
                    confirmed_at=now_time,
                    require_post_announce_confirmation=True,
                )
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
                # W-MIX-LA 006 — load is complete; clear the load term so subsequent
                # ETA frames show synthesis-only time.
                load_state["term"] = None
                load_state["checked_at"] = None
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
                    # Load window is over — explicitly clear the flag (overlay
                    # merges retain the last present value; omission ≠ false).
                    indeterminate=False,
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
                    active_segments_map=_current_active_segments_map(
                        phase="rendering", sid=active_seg_id[0], progress=0.0,
                    ),
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
                _close_pending_engine_activity_interval(
                    confirmed_at=now_time,
                    require_post_announce_confirmation=False,
                )

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
                    # Publish SEGMENT_PENDING (announce): engine has not confirmed yet.
                    # eta_seconds=None preserves the prior chapter ETA (no clear_eta, no
                    # indeterminate, no force) so warm single-engine renders don't flash.
                    # ETA suspension only fires when a real model-load marker is detected
                    # (see ENGINE_ACTIVITY_STARTED branch below).
                    # active_segment_eta_seconds is None so the UI does not start pacing.
                    # The canonical START_SEGMENT frame is emitted at engine confirmation
                    # (START_SYNTHESIS or first PROGRESS line).
                    self._publish(
                        context=context,
                        status="running",
                        progress=_get_grouped_progress(),
                        eta_seconds=None,
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
                        active_segments_map=_current_active_segments_map(
                            phase="preparing", sid=sid, progress=0.0, reason_code="SEGMENT_PENDING",
                        ),
                    )
                    # Never confirm at announce: a prior START_SYNTHESIS belongs to an
                    # earlier group's subprocess in mixed renders. Confirmation comes
                    # only from the engine — its own START_SYNTHESIS or first PROGRESS.
                except (IndexError, ValueError):
                    pass

            from app.engines.behavior import parse_engine_progress
            raw_progress = parse_engine_progress(active_engine_id or engine_id, line)

            if raw_progress is not None:
                _close_pending_engine_activity_interval(
                    confirmed_at=now_time,
                    require_post_announce_confirmation=True,
                )
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

                    # Chapter ETA: observed-rate remaining (§4A.8). elapsed × (1-p)/p
                    # self-corrects — a render slower than calibration grows the ETA
                    # instead of flooring — and is whole-chapter (chapter render start
                    # + grouped progress p), with an early blend toward expected_duration
                    # for p < 0.15. This is the "observed" term enrich()'s §4A.8 crossfade
                    # weights from calculated→observed as progress rises.
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
                        active_segments_map=_current_active_segments_map(
                            phase="rendering",
                            sid=active_seg_id[0],
                            progress=raw_progress if (total_weight > 0 and active_seg_id[0] is not None) else p,
                            eta_seconds=eta_seconds,
                            reason_code="SEGMENT_PROGRESS",
                        ),
                    )
                except Exception:
                    pass

            if matched_marker == "SEGMENT_SAVED" or "[SEGMENT_SAVED]" in line:
                # A cancelled render must not write segment 'done' state. cancel()
                # sets task._cancelled synchronously (on_cancel) before the chapter
                # reset clears the segments, so any straggler [SEGMENT_SAVED] from
                # the not-yet-stopped engine subprocess that arrives after the reset
                # would otherwise resurrect audio_status='done' and make the next
                # render reuse stale audio. Drop it. (Mirrored in the xtts handler's
                # chapter_on_output for the in-thread write path.)
                if getattr(task, "_cancelled", False):
                    return
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

                        # Capture timing: prefer engine-confirmed start. Only fall back to
                        # announce time for engines that never emitted a load window or
                        # confirmation signal (for example Voxtral).
                        started = segment_starts.get(leader_id)
                        if started is None and leader_id not in segment_load_observed:
                            started = segment_announced.get(leader_id)
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
                            # Only re-anchor the ETA when we have a REAL calibrated rate.
                            # No calibration → leave _saved_eta None (no ETA) rather than
                            # fabricating a countdown from a hardcoded default rate.
                            _cps = calibrated_cps if (calibrated_cps and calibrated_cps > 0) else None
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
                            active_segments_map=_current_active_segments_map(
                                phase="done", sid=leader_id, progress=1.0, reason_code="SEGMENT_SAVED",
                            ),
                        )
                        # NOTE: intentionally do NOT discard leader_id from
                        # segment_load_observed here. It is a "load observed this
                        # render" latch consumed by the CHAPTER_SYNTHESIS_COMPLETE
                        # terminal block below: if a group loaded a model but its
                        # segment was saved without engine confirmation, the
                        # terminal wall-time fallback must stay suppressed so a
                        # load-inclusive duration never re-enters synthesis time
                        # (INV-3). Discarding here defeated that guard for any
                        # saved segment. The per-leader announce-fallback check
                        # above is unaffected (each leader is saved once).
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

                if timing["sum_segment_render_seconds"] > 0:
                    timing["synthesis_duration_seconds"] = timing["sum_segment_render_seconds"]
                elif timing["render_started_at"] is not None and not segment_load_observed:
                    timing["synthesis_duration_seconds"] = now_time - timing["render_started_at"]
                else:
                    timing["synthesis_duration_seconds"] = None

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

        def _finish(result: TaskResult) -> SegmentResult:
            """Wrap a TaskResult with this call's isolated per-segment state
            (W-PAR 003). Every ``return`` below routes through this so callers
            always get the full SegmentResult regardless of which dispatch
            path (registry handler / local execution / bridge) produced it.
            """
            return SegmentResult(
                task_result=result,
                timing=timing,
                marker_state=marker_state,
                segment_load_observed=segment_load_observed,
                segment_starts=segment_starts,
                segment_announced=segment_announced,
            )

        if wd:
            wd.register_log_listener(log_listener)
            # Stash the listener + watchdog on the task so cancel() can unregister
            # it synchronously: a cancelled job's listener should stop processing
            # the engine's straggler output (progress noise, and — guarded above —
            # segment 'done' writes) the moment the user cancels, not whenever the
            # subprocess finally stops. The dispatch-exit unregisters below are the
            # normal-completion path; double-unregister is a no-op.
            setattr(task, "_log_listener", log_listener)
            setattr(task, "_watchdog", wd)

        # W-MIX-LA 006 — publish initial ETA with load term before synthesis starts.
        if load_state["term"] is not None and expected_duration is not None:
            self._publish(
                context=context,
                status="preparing",
                eta_seconds=max(1, int(round(expected_duration + load_state["term"]))),
                reason_code="pre_load_eta",
                message="Preparing synthesis resources…",
            )

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
                return _finish(result)
            except Exception as e:
                logger.exception("Task %s: registry handler raised.", context.task_id)
                import traceback
                tb_summary = "".join(traceback.format_exception_only(type(e), e)).strip()
                handler_name = getattr(handler, "__name__", str(handler))
                engine_id = getattr(j, "engine", "unknown")
                kind = getattr(context, "task_type", "unknown")
                if wd:
                    wd.unregister_log_listener(log_listener)
                return _finish(TaskResult(
                    status="failed",
                    message=f"Handler raised exception: {tb_summary} [Handler: {handler_name} | Engine: {engine_id} | Kind: {kind}]",
                ))

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
                return _finish(result)

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
                        return _finish(task_result)
                    except Exception as exc:
                        logger.exception("Task %s: bridge dispatch raised.", context.task_id)
                        from app.engines.errors import EngineUnavailableError
                        is_retriable = isinstance(exc, EngineUnavailableError)
                        import traceback
                        tb_summary = "".join(traceback.format_exception_only(type(exc), exc)).strip()
                        engine_id = getattr(j, "engine", "unknown")
                        kind = getattr(context, "task_type", "unknown")
                        return _finish(TaskResult(
                            status="failed",
                            message=f"Bridge raised exception: {tb_summary} [Engine: {engine_id} | Kind: {kind}]",
                            retriable=is_retriable
                        ))
                else:
                    engine_id = getattr(j, "engine", "unknown")
                    kind = getattr(context, "task_type", "unknown")
                    return _finish(TaskResult(
                        status="failed",
                        message=f"Task requires a voice bridge but returned no request payload. [Engine: {engine_id} | Kind: {kind}]"
                    ))

            engine_id = getattr(j, "engine", "unknown")
            kind = getattr(context, "task_type", "unknown")
            return _finish(TaskResult(
                status="failed",
                message=f"Task type {context.task_type} has no handler and no bridge fallback. [Engine: {engine_id} | Kind: {kind}]"
            ))
        except Exception as exc:
            logger.exception("Task %s: dispatch raised an exception.", context.task_id)
            import traceback
            tb_summary = "".join(traceback.format_exception_only(type(exc), exc)).strip()
            engine_id = getattr(j, "engine", "unknown")
            kind = getattr(context, "task_type", "unknown")
            return _finish(TaskResult(
                status="failed",
                message=f"Dispatch error: {tb_summary} [Engine: {engine_id} | Kind: {kind}]"
            ))
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
        # W-PAR task 001: propagate engine_class and cap so reserve_task_resources
        # routes to the EngineClassSemaphore path (not the legacy gpu/exclusive gates).
        # Without these the semaphore is never reached for real tasks.
        "engine_class": getattr(claim, "engine_class", ""),
        "cap": getattr(claim, "cap", 1),
    }
