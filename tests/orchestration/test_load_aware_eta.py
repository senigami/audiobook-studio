"""Tests for W-MIX-LA 006 load-aware ETA (proactive + reactive paths).

R1 revert-check: on pre-006 code, MODEL_LOAD_STARTED always clears ETA (clear_eta=True,
eta_seconds=None). After 006, when history exists, it carries a numeric ETA instead.

Mock boundary (R2): external I/O only — get_server_health, expected_model_load_seconds,
TTS watchdog, DB performance. Never mock orchestrator_helpers internals.
R4: synchronous marker injection, no sleep.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------

class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self):
        self.voice_bridge = MagicMock()
        self.progress_service = MagicMock()
        self.published: list[dict] = []

    def _publish(self, **kwargs):
        self.published.append(kwargs)


class _SingleGroupTask(StudioTask):
    """Minimal marker-driven synthesis task with one segment."""

    def __init__(self, engine_id: str = "tts_xtts", expected_duration: float = 30.0):
        self._engine_id = engine_id
        self._expected_duration = expected_duration
        self.script = [
            {
                "id": "seg1",
                "ids": ["seg1"],
                "text": "x" * 500,
                "save_path": "/tmp/seg1.wav",
                "weight": 500,
            }
        ]

    @property
    def engine_id(self) -> str:
        return self._engine_id

    def get_expected_duration(self, text, engine_id):
        return self._expected_duration

    def describe(self):
        return TaskContext(
            task_id="test-task-006",
            task_type="synthesis",
            payload={
                "engine_id": self._engine_id,
                "script_text": "x" * 500,
            },
        )

    @property
    def prefers_local_execution(self) -> bool:
        return True

    def run(self):
        # Actual work is simulated by the synthesize side_effect registered by the harness.
        return TaskResult(status="completed")


def _make_cold_health(engine_id: str = "tts_xtts") -> dict:
    return {
        "status": "ok",
        "engines": [{"engine_id": engine_id, "status": "ready", "model_warm": False}],
    }


def _make_warm_health(engine_id: str = "tts_xtts") -> dict:
    return {
        "status": "ok",
        "engines": [{"engine_id": engine_id, "status": "ready", "model_warm": True}],
    }


def _run_dispatch_with_markers(
    orchestrator: MockOrchestrator,
    task: _SingleGroupTask,
    wd: TtsServerWatchdog,
    markers: list[str],
):
    """Run _dispatch, delivering marker lines synchronously via the watchdog's broadcast_log.

    The task uses ``prefers_local_execution=True`` so task.run() is invoked.
    We replace task.run() to fire the markers through the registered watchdog listeners
    and then return success.
    """
    context = task.describe()

    def _fake_run():
        for line in markers:
            wd._broadcast_log(line, task_id=None)
        return TaskResult(status="completed")

    task.run = _fake_run  # type: ignore[method-assign]

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda **kw: None), \
         patch("app.db.state.update_job", lambda job_id, **kwargs: None), \
         patch("app.db.state.get_jobs", return_value={}), \
         patch("app.db.state.get_performance_metrics", return_value={"render_history": []}), \
         patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value=None), \
         patch("app.tts_server.performance_settings.filter_history_for_engine_model", return_value=[]), \
         patch("app.orchestration.scheduler.eta.get_calibrated_model_params", return_value=None):
        orchestrator._dispatch(task=task, context=context)

    return orchestrator.published


# ---------------------------------------------------------------------------
# Proactive injection tests
# ---------------------------------------------------------------------------

class TestProactiveEtaInjection:
    def test_cold_engine_initial_eta_includes_load_term(self):
        """With model_warm=False + cold history, initial 'preparing' ETA = synthesis + load."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",
            "[START_SYNTHESIS] test-task-006",
            "[START_SEGMENT] seg1",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            _run_dispatch_with_markers(orc, task, wd, markers)

        pre_load_frames = [p for p in orc.published if p.get("reason_code") == "pre_load_eta"]
        assert pre_load_frames, "Expected a pre_load_eta frame"
        initial_eta = pre_load_frames[0]["eta_seconds"]
        assert initial_eta is not None
        assert initial_eta >= 50  # 30s synthesis + 25s load = 55s minimum

    def test_warm_engine_no_load_term_injected(self):
        """With model_warm=True, no pre_load_eta frame is published."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[START_SYNTHESIS] test-task-006",
            "[START_SEGMENT] seg1",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_warm_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            _run_dispatch_with_markers(orc, task, wd, markers)

        pre_load_frames = [p for p in orc.published if p.get("reason_code") == "pre_load_eta"]
        assert not pre_load_frames, "No pre_load_eta frame when engine is warm"

    def test_health_failure_no_load_term_fail_open(self):
        """If get_server_health() raises, no load term is injected (fail-open)."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[START_SYNTHESIS] test-task-006",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", side_effect=Exception("network error")):
            _run_dispatch_with_markers(orc, task, wd, markers)

        pre_load_frames = [p for p in orc.published if p.get("reason_code") == "pre_load_eta"]
        assert not pre_load_frames

    def test_no_history_no_load_term_injected(self):
        """Cold engine but no DB history → no pre_load_eta frame (honest, no fabrication)."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[START_SYNTHESIS] test-task-006",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=None):
            _run_dispatch_with_markers(orc, task, wd, markers)

        pre_load_frames = [p for p in orc.published if p.get("reason_code") == "pre_load_eta"]
        assert not pre_load_frames, "No pre_load_eta frame when no DB history exists"


# ---------------------------------------------------------------------------
# MODEL_LOAD_STARTED reconciliation tests
# ---------------------------------------------------------------------------

class TestModelLoadStartedReconciliation:
    def test_loading_model_frame_carries_eta_after_proactive_injection(self):
        """After proactive injection, MODEL_LOAD_STARTED emits ETA (not clear_eta=True)."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",
            "[START_SYNTHESIS] test-task-006",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            _run_dispatch_with_markers(orc, task, wd, markers)

        loading_model_frames = [p for p in orc.published if p.get("reason_code") == "LOADING_MODEL"]
        assert loading_model_frames, "Expected a LOADING_MODEL frame"
        lm = loading_model_frames[-1]
        assert not lm.get("clear_eta", False), "clear_eta must be False when load term exists"
        assert lm.get("eta_seconds") is not None, "eta_seconds must not be None when load term exists"
        # Double-count guard (the headline risk): the reconciled ETA must be the
        # synthesis remainder plus the SINGLE decaying load term — never synthesis
        # plus two full terms. With 30s synthesis + 25s term and ~0s elapsed, the
        # ceiling is 55s; a double-count would land near 80s.
        assert lm["eta_seconds"] <= 55, (
            f"reconciled ETA {lm['eta_seconds']}s exceeds synthesis+term ceiling (55s) "
            "— load term may be double-counted"
        )

    def test_loading_model_fallback_when_no_proactive_injection(self):
        """Without proactive injection, MODEL_LOAD_STARTED still injects load term reactively."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",
            "[START_SYNTHESIS] test-task-006",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        # Health says warm (or fails) → no proactive injection; fallback must kick in.
        with patch("app.engines.watchdog.get_server_health", return_value=_make_warm_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            _run_dispatch_with_markers(orc, task, wd, markers)

        loading_model_frames = [p for p in orc.published if p.get("reason_code") == "LOADING_MODEL"]
        assert loading_model_frames
        lm = loading_model_frames[-1]
        assert not lm.get("clear_eta", False), "fallback path should not clear ETA when history exists"
        assert lm.get("eta_seconds") is not None

    def test_loading_model_clears_eta_when_no_history(self):
        """When no DB history exists, MODEL_LOAD_STARTED still clears ETA (pre-006 behavior)."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",
            "[START_SYNTHESIS] test-task-006",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_warm_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=None):
            _run_dispatch_with_markers(orc, task, wd, markers)

        loading_model_frames = [p for p in orc.published if p.get("reason_code") == "LOADING_MODEL"]
        assert loading_model_frames
        # Check the REACTIVE frame ([-1]) from the [MODEL_LOAD_STARTED] marker, not the
        # early always-clear "preparing" frame ([0]) emitted before listener registration.
        lm = loading_model_frames[-1]
        # No history → fallback path returns None → clear_eta=True (pre-006 behavior preserved)
        assert lm.get("clear_eta", False), "clear_eta should be True when no history exists"
        assert lm.get("eta_seconds") is None

    def test_synthesis_only_measurement_unchanged(self):
        """W2 regression: the display-only load term never enters recorded stats.

        Two observable surfaces: (1) the recorded render sample's
        synthesis_duration_seconds / model_load_seconds come from real measured
        marker windows (near-zero in this synchronous harness), NOT the 25s
        DB-history estimate used for display; (2) no post-START_SYNTHESIS
        SEGMENT_PROGRESS frame carries a load-inflated ETA.
        """
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",
            "[START_SYNTHESIS] test-task-006",
            "[START_SEGMENT] seg1",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0), \
             patch("app.db.performance.record_render_sample") as record_sample:
            published = _run_dispatch_with_markers(orc, task, wd, markers)

        # Dispatch completed: at least a LOADING_MODEL and a pre_load_eta frame were published.
        assert any(p.get("reason_code") == "pre_load_eta" for p in published)
        assert any(p.get("reason_code") == "LOADING_MODEL" for p in published)
        # The recorded stats must come from real measured timing, never the display-only
        # 25s history term: in this synchronous harness both windows are near-zero.
        assert record_sample.called, "stats recording path did not run"
        recorded = record_sample.call_args.kwargs
        # The caller may pass the duration as synthesis_duration_seconds or (per the
        # record_render_sample fallback contract) as sum_segment_render_seconds.
        recorded_duration = (
            recorded.get("synthesis_duration_seconds")
            or recorded.get("sum_segment_render_seconds")
        )
        assert recorded_duration is not None, (
            f"no duration recorded — kwargs: {sorted(recorded.keys())}"
        )
        assert recorded_duration < 25.0, (
            f"recorded duration {recorded_duration}s looks inflated by the "
            "display-only load term"
        )
        recorded_load = recorded.get("model_load_seconds")
        assert recorded_load is None or recorded_load < 1.0, (
            f"recorded model_load_seconds={recorded_load} must be the real measured window, "
            "not the 25s DB-history display estimate"
        )
        # No SEGMENT_PROGRESS frame should carry an ETA inflated by the load term (25s).
        # After START_SYNTHESIS, load_state is cleared so synthesis frames are load-free.
        frames_checked = 0
        for frame in published:
            if frame.get("reason_code") == "SEGMENT_PROGRESS":
                eta = frame.get("eta_seconds")
                if eta is not None:
                    frames_checked += 1
                    assert eta < 60, (
                        f"SEGMENT_PROGRESS ETA {eta}s seems load-inflated; "
                        "load term should be cleared after START_SYNTHESIS"
                    )
        assert frames_checked >= 1, (
            "guard is vacuous: no SEGMENT_PROGRESS frame with an ETA was checked"
        )

    def test_start_synthesis_clears_load_state(self):
        """After START_SYNTHESIS, load_state is cleared: subsequent ETA frames are synthesis-only."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",
            "[START_SYNTHESIS] test-task-006",
            "[START_SEGMENT] seg1",
            "[PROGRESS] 50%",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            _run_dispatch_with_markers(orc, task, wd, markers)

        # The SEGMENT_PROGRESS frames after START_SYNTHESIS must not include the load term.
        # They are driven by _observed_remaining_seconds (synthesizing state) — the load
        # term should no longer inflate them. We check that no SEGMENT_PROGRESS frame has
        # an ETA greater than synthesis duration + some slack (i.e. not load-inflated).
        progress_frames = [p for p in orc.published if p.get("reason_code") == "SEGMENT_PROGRESS"]
        frames_with_eta = 0
        for frame in progress_frames:
            eta = frame.get("eta_seconds")
            if eta is not None:
                frames_with_eta += 1
                # Synthesis-only ETA should not be inflated by the 25s load term anymore
                assert eta < 60, (
                    f"SEGMENT_PROGRESS ETA {eta}s seems load-inflated (expected <60s synthesis-only)"
                )
        assert frames_with_eta >= 1, (
            "guard is vacuous: no SEGMENT_PROGRESS frame carried an ETA — the "
            "no-load-inflation assertion never ran"
        )


# ---------------------------------------------------------------------------
# 2026-07-02 live G0 regressions (owner render job-3ee72dea)
# ---------------------------------------------------------------------------

def _make_progress_service():
    """Minimal clock-injected ProgressService for enrich-level assertions."""
    from app.orchestration.progress.service import ProgressService
    from app.orchestration.progress.eta import estimate_eta_seconds

    wall_now = {"value": 100.0}
    return ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=lambda **kwargs: None,
        wall_clock=lambda: wall_now["value"],
        monotonic_clock=lambda: 500.0,
        max_silence_seconds=10.0,
    ), wall_now


class TestJobLevelLoadWindow:
    def test_job_level_model_load_publishes_loading_frame(self):
        """A sid-less (job-level) MODEL_LOAD_STARTED before START_SYNTHESIS must
        still publish the LOADING_MODEL frame, attributed to the first render
        group's leader, with status 'preparing' (durable status honesty).

        R1 revert-check: pre-fix, the publish was gated on `if _mls_sid:` — a
        dispatch-time cold load ([MODEL_LOAD_STARTED] <task_id> with no active
        segment) emitted NOTHING: no indeterminate signal, no reconciled ETA,
        no segment for the text preparing pulse (owner-observed 2026-07-02).
        """
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[MODEL_LOAD_STARTED] test-task-006",   # task_id only — no segment token
            "[START_SYNTHESIS] test-task-006",
            "[START_SEGMENT] seg1",
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            published = _run_dispatch_with_markers(orc, task, wd, markers)

        loading = [p for p in published if p.get("reason_code") == "LOADING_MODEL"]
        assert loading, (
            "job-level MODEL_LOAD_STARTED must publish a LOADING_MODEL frame "
            "(pre-fix: skipped entirely when no sid was resolvable)"
        )
        lm = loading[-1]
        assert lm.get("indeterminate") is True
        assert lm.get("status") == "preparing", (
            f"dispatch-time load precedes START_SYNTHESIS — status must stay "
            f"'preparing', got {lm.get('status')!r}"
        )
        assert lm.get("active_segment_id") == "seg1", (
            "frame must be attributed to the first render group's leader so the "
            f"text preparing pulse has a target, got {lm.get('active_segment_id')!r}"
        )
        # With history (25s) + expected duration (30s): reconciled ETA ≈ 55s.
        assert lm.get("eta_seconds") is not None and lm["eta_seconds"] >= 50

    def test_mid_chapter_model_load_keeps_running_status(self):
        """A cold load AFTER START_SYNTHESIS (mixed-render later group) keeps
        INV-1 monotonic durable status: the LOADING_MODEL frame stays 'running'."""
        orc = MockOrchestrator()
        task = _SingleGroupTask(expected_duration=30.0)
        wd = TtsServerWatchdog()

        markers = [
            "[ENGINE_ACTIVITY_STARTED]",
            "[START_SYNTHESIS] test-task-006",
            "[START_SEGMENT] seg1",
            "[MODEL_LOAD_STARTED] seg1 test-task-006",  # mid-chapter, sid-tagged
            "[PROGRESS] 100%",
            "[SEGMENT_SAVED] /tmp/seg1.wav",
        ]

        with patch("app.engines.watchdog.get_server_health", return_value=_make_cold_health()), \
             patch("app.db.performance.expected_model_load_seconds", return_value=25.0):
            published = _run_dispatch_with_markers(orc, task, wd, markers)

        loading = [p for p in published if p.get("reason_code") == "LOADING_MODEL"]
        assert loading
        assert loading[-1].get("status") == "running"


class TestEnrichPreparingEta:
    def test_preparing_frame_keeps_observed_eta(self):
        """§2.6 / I10 as amended by 1.8.0: a REAL incoming observed ETA on a
        'preparing' frame survives enrich (the pre-factored cold-load ETA).

        R1 revert-check: pre-fix, enrich nulled eta_observed for every
        non-'running' status, so the orchestrator's pre_load_eta frame reached
        the wire with etaSeconds null (observed live: frame 17 of job-3ee72dea)
        while the plugin's Path-B frame kept its ETA — inconsistent producers.
        """
        svc, _ = _make_progress_service()
        result = svc.enrich("prep-eta-job", {
            "status": "preparing",
            "progress": 0.0,
            "eta_seconds": 55,
            "reason_code": "pre_load_eta",
            "updated_at": 100.0,
        }, sample=True)
        assert result.get("eta_seconds") == 55, (
            f"preparing frame with a real observed ETA must keep it, "
            f"got {result.get('eta_seconds')!r}"
        )

    def test_queued_frame_still_suppresses_eta(self):
        """queued never carries a determinate ETA (unchanged half of I10)."""
        svc, _ = _make_progress_service()
        result = svc.enrich("queued-eta-job", {
            "status": "queued",
            "progress": 0.0,
            "eta_seconds": 55,
            "updated_at": 100.0,
        }, sample=True)
        assert result.get("eta_seconds") is None


class TestRunningMonotonicFloor:
    def test_running_progress_never_regresses(self):
        """§2.5 server-side monotonic floor: a later running frame with LOWER
        progress is clamped to the previous running floor.

        Mirrors production: the orchestrator publishes 0.99 through the full
        publish() path (which records the per-job floor), then the plugin's
        Path-B completion update goes through enrich() alone with 0.91.

        R1 revert-check: pre-fix, the plugin's completion-path update published
        progress 0.91 AFTER the orchestrator's 0.99 (frame 127 of job-3ee72dea),
        forcing a visible backward correction right before 'done'.
        """
        svc, wall = _make_progress_service()
        svc.publish(
            job_id="floor-job", status="running", progress=0.99,
            updated_at=100.0, force=True,
        )
        wall["value"] += 0.3
        result = svc.enrich("floor-job", {
            "status": "running", "progress": 0.91, "updated_at": 100.3,
        }, sample=True)
        assert result.get("progress") == 0.99, (
            f"running→running progress must not regress, got {result.get('progress')}"
        )

    def test_requeue_resets_progress(self):
        """A queued frame after running still resets (explicit reset paths kept)."""
        svc, wall = _make_progress_service()
        svc.enrich("requeue-job", {
            "status": "running", "progress": 0.8, "updated_at": 100.0,
        }, sample=True)
        wall["value"] += 0.3
        result = svc.enrich("requeue-job", {
            "status": "queued", "progress": 0.0, "updated_at": 100.3,
        }, sample=True)
        assert result.get("progress") == 0.0


class TestTerminalIndeterminateClear:
    def test_done_frame_carries_explicit_indeterminate_false(self):
        """Terminal frames must explicitly clear `indeterminate`: frontend
        overlay merges retain the last present value, so omission leaves a
        stale `true` from the load window behind (observed: durable job record
        still indeterminate:true after done, job-3ee72dea).

        R1 revert-check: pre-fix, terminal enrich left the field absent.
        """
        svc, _ = _make_progress_service()
        result = svc.enrich("term-ind-job", {
            "status": "done", "progress": 1.0, "updated_at": 100.0,
        }, sample=True)
        assert result.get("indeterminate") is False
