"""StudioTask base contract.

Every queueable unit in Studio 2.0 should derive from this boundary so the
orchestrator can remain task-type agnostic.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TaskContext:
    """Shared task metadata used by the orchestrator and progress services.

    Attributes:
        task_id: Stable unique identifier for this task (e.g. job UUID).
        task_type: Machine-readable task category (e.g. ``"synthesis"``,
            ``"api_synthesis"``).
        project_id: Optional owning project identifier.
        chapter_id: Optional owning chapter identifier.
        requested_by: Optional user or caller identifier.
        payload: Flexible task parameters passed between the submitter and the
            executor.  Keys and value types are task-type specific.
        source: Origination of the task.  ``"ui"`` for Studio-originated tasks,
            ``"api"`` for external API tasks.  Used by priority policies.
        submitted_at: Monotonic timestamp set at submission time.  Used for
            FIFO tie-breaking within priority buckets.
    """

    task_id: str
    task_type: str
    project_id: str | None = None
    chapter_id: str | None = None
    requested_by: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    source: str = "ui"
    submitted_at: float = field(default_factory=time.monotonic)


@dataclass(frozen=True)
class TaskResult:
    """Placeholder task result model used by future task implementations."""

    status: str
    message: str | None = None
    retriable: bool = False
    timing: dict[str, Any] | None = None



class StudioTask:
    """Task interface for all queueable Studio 2.0 work."""

    def set_progress_reporter(self, reporter: Any) -> None:
        """Attach a callback for reporting task-internal progress events.

        The reporter should expect (progress: float, message: str | None, reason_code: str | None).
        """
        setattr(self, "_progress_reporter", reporter)

    def report_progress(
        self,
        progress: float,
        message: str | None = None,
        reason_code: str | None = None,
    ) -> None:
        """Publish a progress event if a reporter is attached.

        Progress is clamped to [0.0, 1.0].
        """
        reporter = getattr(self, "_progress_reporter", None)
        if reporter:
            clamped = max(0.0, min(1.0, float(progress)))
            reporter(clamped, message, reason_code)

    def progress_heartbeat(
        self,
        start: float,
        cap: float,
        interval: float = 2.0,
        expected_duration: float = 25.0,
        message: str | None = None,
        reason_code: str | None = "heartbeat",
        advance_progress: bool = True,
    ):
        """Context manager to emit periodic progress updates while a blocking call runs.

        Useful for providing live feedback during synchronous operations like synthesis.
        """
        import threading
        from contextlib import contextmanager

        @contextmanager
        def _heartbeat_ctx():
            stop_event = threading.Event()
            current_progress = [start] # Use list for closure mutability
            start_time = time.monotonic()

            def _run():
                while not stop_event.wait(interval):
                    if not advance_progress:
                         # Send the same progress repeatedly to indicate activity without artificial movement
                         self.report_progress(start, message, reason_code)
                         continue

                    elapsed = time.monotonic() - start_time
                    # Linear ramp to cap over expected_duration, with quadratic ease-out
                    t = min(1.0, elapsed / max(0.1, expected_duration))
                    # Quadratic ease-out: progress moves faster initially
                    eased_t = 1 - (1 - t) * (1 - t)

                    new_progress = start + (cap - start) * eased_t

                    # Ensure monotonicity and visible delta
                    if new_progress > current_progress[0] + 0.001:
                        current_progress[0] = new_progress
                        self.report_progress(current_progress[0], message, reason_code)

            thread = threading.Thread(target=_run, name=f"heartbeat-{id(self)}", daemon=True)
            thread.start()


            try:
                yield
            finally:
                stop_event.set()
                thread.join(timeout=0.5)

        return _heartbeat_ctx()


    def get_expected_duration(self, text: str, engine_id: str) -> float | None:
        """Estimate the expected duration of a synthesis task based on historical metrics."""
        try:
            from app.db.state import get_performance_metrics  # noqa: PLC0415
            from app.orchestration.scheduler.eta import get_calibrated_model_params, calculate_chapter_startup_eta  # noqa: PLC0415
            from app.tts_server.performance_settings import (  # noqa: PLC0415
                filter_history_for_engine_model,
                resolve_engine_settings_model,
            )

            perf = get_performance_metrics()
            all_history = perf.get("render_history") or []
            tts_model = resolve_engine_settings_model(engine_id)
            history = filter_history_for_engine_model(all_history, engine_id, tts_model)

            params = get_calibrated_model_params(history)
            if not params:
                from app.engines.behavior import DEFAULT_BASELINE_ENGINE_CPS
                return float(len(text)) / float(DEFAULT_BASELINE_ENGINE_CPS)

            calibrated_cps, calibrated_overhead = params

            group_count = 1
            script = getattr(self, "script", None)
            if script is not None:
                group_count = len(script)
            else:
                chapter_id = getattr(self, "chapter_id", None)
                if chapter_id:
                    try:
                        from app.domain.chunk_groups import build_chunk_groups, load_chunk_segments, get_chunk_group_indexes_for_segment_ids  # noqa: PLC0415
                        segment_ids = getattr(self, "segment_ids", None)
                        voice_profile_id = getattr(self, "voice_profile_id", None)
                        if segment_ids:
                            indexes = get_chunk_group_indexes_for_segment_ids(chapter_id, segment_ids, voice_profile_id)
                            group_count = len(indexes) if indexes else 1
                        else:
                            segments = load_chunk_segments(chapter_id)
                            groups = build_chunk_groups(segments, voice_profile_id)
                            group_count = len(groups) if groups else 1
                    except Exception as exc:
                        import logging
                        logging.getLogger(__name__).warning("Failed to determine chunk group count fallback for chapter %s: %s", chapter_id, exc, exc_info=True)

            est = calculate_chapter_startup_eta(len(text), calibrated_cps, group_count, calibrated_overhead)
            return float(est)
        except Exception:
            return None


    def validate(self) -> None:
        """Validate task payload before it enters the scheduler."""
        raise NotImplementedError

    def describe(self) -> TaskContext:
        """Return the identifying metadata needed for scheduling."""
        raise NotImplementedError

    def run(self) -> TaskResult:
        """Execute the task body once resources have been reserved."""
        raise NotImplementedError

    def on_cancel(self) -> None:
        """Release task-level resources when a task is cancelled."""
        raise NotImplementedError

    @property
    def is_marker_driven(self) -> bool:
        """Return True if this task expects external START_SYNTHESIS log markers.

        If True, the orchestrator should suppress the generic 'running' event
        during dispatch and wait for the engine to report render start via logs.
        """
        return False

    @property
    def prefers_local_execution(self) -> bool:
        """Return True if this task should execute its run() method locally.

        If False (default), the orchestrator will try to use the voice bridge.
        """
        return False
