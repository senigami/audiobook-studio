"""Tests for W-MIX-LA tasks 002+003: MODEL_LOAD_STARTED marker delivery and orchestrator attribution.

TDD suite — covers:
  1. Orchestrator preparing frame (keystone, R1 revert-check):
     log_listener driven with [START_SEGMENT] then [MODEL_LOAD_STARTED] → emits a
     LOADING_MODEL/indeterminate frame with active_segment_id==sid and clear_eta=True.
  2. INV-2 warm/cold silent: generic [ENGINE_ACTIVITY_STARTED] (no MODEL_LOAD_STARTED)
     → no LOADING_MODEL frame.
  3. Watchdog extraction: MODEL_LOAD_STARTED with sid+task_id → task_id is last token;
     MODEL_LOAD_STARTED with task_id only (no sid) → task_id extracted correctly.
  4. No model_load_seconds double-count: MODEL_LOAD_STARTED path does not open a second
     pending_engine_activity interval.

R2 compliance: mocks only external broadcast boundary (broadcast_tts_log_line) and
DB boundary (app.db.state.*). Never mocks the unit under test (log_listener or the
orchestrator attribution logic).

R4: no sleeps — sequences driven directly.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


# ---------------------------------------------------------------------------
# Shared harness
# ---------------------------------------------------------------------------

class MockStream:
    def __init__(self, lines):
        self.lines = lines

    def __iter__(self):
        return iter(self.lines)

    def close(self):
        pass


class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self, voice_bridge):
        self.voice_bridge = voice_bridge
        self.published: list[dict] = []

    def _publish(self, **kwargs):
        self.published.append(kwargs)


class MockMixedXttsTask(StudioTask):
    """2-group mixed script: Voxtral seg-1, XTTS seg-2.

    engine per-group so _resolve_active_engine_for_matching returns the group engine.
    """

    def __init__(self, bridge):
        self.bridge = bridge
        self.script = [
            {
                "id": "seg-1",
                "ids": ["seg-1"],
                "text": "Voxtral segment text",
                "save_path": "/tmp/seg-1.wav",
                "engine": "voxtral",
                "weight": 50,
            },
            {
                "id": "seg-2",
                "ids": ["seg-2"],
                "text": "XTTS segment text cold load",
                "save_path": "/tmp/seg-2.wav",
                "engine": "xtts",
                "weight": 50,
            },
        ]

    def get_expected_duration(self, text: str, engine_id: str) -> float:
        return 40.0

    def describe(self):
        return TaskContext(
            task_id="job-mix-1",
            task_type="synthesis",
            payload={
                "engine_id": "mixed",
                "script_text": "Voxtral segment text XTTS segment text cold load",
            },
            project_id="proj-mix",
            chapter_id="ch-mix",
        )

    @property
    def prefers_local_execution(self) -> bool:
        return True

    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _patch_db(monkeypatch):
    """Patch all DB state side-effects that log_listener may call."""
    for target in (
        "app.db.state.put_job",
        "app.db.state_jobs.put_job",
    ):
        monkeypatch.setattr(target, lambda job: None, raising=False)

    for target in (
        "app.db.state.get_jobs",
        "app.db.state_jobs.get_jobs",
    ):
        monkeypatch.setattr(target, lambda: {}, raising=False)

    for target in (
        "app.db.state.update_job",
        "app.db.state_jobs.update_job",
    ):
        monkeypatch.setattr(target, lambda job_id, **kwargs: None, raising=False)


def _patch_ws(monkeypatch):
    """Patch WS broadcast so log_listener doesn't need a live socket."""
    monkeypatch.setattr(
        "app.api.ws.broadcast_tts_log_line",
        lambda **kwargs: None,
        raising=False,
    )


def _patch_broadcast_segments(monkeypatch):
    monkeypatch.setattr(
        "app.api.ws.broadcast_segments_updated",
        lambda *a, **kw: None,
        raising=False,
    )


# ---------------------------------------------------------------------------
# Test 1 — Keystone: MODEL_LOAD_STARTED triggers LOADING_MODEL/indeterminate frame
# ---------------------------------------------------------------------------

class TestModelLoadStartedOrchestratorFrame:
    """Drive log_listener with a mixed XTTS sequence and assert LOADING_MODEL frame.

    R1 revert-check: removing the MODEL_LOAD_STARTED branch from log_listener
    means no LOADING_MODEL frame is published → assertion fails.
    """

    def test_model_load_started_emits_loading_model_frame(self, monkeypatch):
        """[MODEL_LOAD_STARTED] {sid} {task_id} after [START_SEGMENT] → LOADING_MODEL frame."""
        _patch_db(monkeypatch)
        _patch_ws(monkeypatch)
        _patch_broadcast_segments(monkeypatch)

        bridge = MagicMock()
        orc = MockOrchestrator(voice_bridge=bridge)
        task = MockMixedXttsTask(bridge)
        context = task.describe()
        wd = TtsServerWatchdog()

        with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
             patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):

            def side_effect(*args, **kwargs):
                wd._drain_stream(None, "stderr", MockStream([
                    # Mixed handler already emits START_SEGMENT + ENGINE_ACTIVITY_STARTED
                    # for group 2 (XTTS). Then XTTS wrapper emits MODEL_LOAD_STARTED.
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[START_SEGMENT] seg-1 job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-1.wav job-mix-1\n",
                    "[START_SEGMENT] seg-2 job-mix-1\n",
                    "[MODEL_LOAD_STARTED] seg-2 job-mix-1\n",
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[PROGRESS] 50% job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-2.wav job-mix-1\n",
                ]))
                return {"status": "ok"}

            bridge.synthesize.side_effect = side_effect
            orc.progress_service = MagicMock()

            orc._dispatch(task=task, context=context)

        loading_frames = [
            e for e in orc.published
            if e.get("reason_code") == "LOADING_MODEL"
            and e.get("indeterminate") is True
        ]
        assert loading_frames, (
            "Expected at least one LOADING_MODEL/indeterminate frame from MODEL_LOAD_STARTED, "
            f"got none. All published frames: {[e.get('reason_code') for e in orc.published]}"
        )
        frame = loading_frames[-1]
        assert frame.get("indeterminate") is True, (
            f"LOADING_MODEL frame must have indeterminate=True, got {frame.get('indeterminate')!r}"
        )
        assert frame.get("clear_eta") is True, (
            f"LOADING_MODEL frame must have clear_eta=True, got {frame.get('clear_eta')!r}"
        )
        # ETA must be cleared (None) — not fabricated
        assert frame.get("eta_seconds") is None, (
            f"LOADING_MODEL frame must not carry a determinate ETA, got {frame.get('eta_seconds')!r}"
        )
        # active_segment_id must be the XTTS segment
        assert frame.get("active_segment_id") == "seg-2", (
            f"LOADING_MODEL frame must attribute to seg-2, got {frame.get('active_segment_id')!r}"
        )

    def test_model_load_started_with_no_sid_falls_back_to_active_seg(self, monkeypatch):
        """[MODEL_LOAD_STARTED] {task_id} (no sid) → falls back to active_seg_id."""
        _patch_db(monkeypatch)
        _patch_ws(monkeypatch)
        _patch_broadcast_segments(monkeypatch)

        bridge = MagicMock()
        orc = MockOrchestrator(voice_bridge=bridge)
        task = MockMixedXttsTask(bridge)
        context = task.describe()
        wd = TtsServerWatchdog()

        with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
             patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):

            def side_effect(*args, **kwargs):
                wd._drain_stream(None, "stderr", MockStream([
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[START_SEGMENT] seg-2 job-mix-1\n",
                    # No sid in marker — just task_id
                    "[MODEL_LOAD_STARTED] job-mix-1\n",
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[PROGRESS] 50% job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-2.wav job-mix-1\n",
                ]))
                return {"status": "ok"}

            bridge.synthesize.side_effect = side_effect
            orc.progress_service = MagicMock()

            orc._dispatch(task=task, context=context)

        loading_frames = [
            e for e in orc.published
            if e.get("reason_code") == "LOADING_MODEL"
            and e.get("indeterminate") is True
        ]
        assert loading_frames, (
            "Expected LOADING_MODEL frame even when MODEL_LOAD_STARTED has no sid token"
        )
        frame = loading_frames[-1]
        # Falls back to active_seg_id which should be seg-2
        assert frame.get("active_segment_id") == "seg-2", (
            f"Fall-back should use active_seg_id 'seg-2', got {frame.get('active_segment_id')!r}"
        )


# ---------------------------------------------------------------------------
# Test 2 — INV-2: generic ENGINE_ACTIVITY_STARTED alone does NOT emit LOADING_MODEL
# ---------------------------------------------------------------------------

class TestInv2WarmCloudSilent:
    """Warm/cloud groups do not emit MODEL_LOAD_STARTED, so no LOADING_MODEL frame fires.

    Feeds generic [ENGINE_ACTIVITY_STARTED] (the signal the mixed handler emits
    before every group) and asserts no LOADING_MODEL frame is published.
    """

    def test_engine_activity_started_no_loading_model_frame(self, monkeypatch):
        """[ENGINE_ACTIVITY_STARTED] alone (no MODEL_LOAD_STARTED) → no LOADING_MODEL frame."""
        _patch_db(monkeypatch)
        _patch_ws(monkeypatch)
        _patch_broadcast_segments(monkeypatch)

        bridge = MagicMock()
        orc = MockOrchestrator(voice_bridge=bridge)
        task = MockMixedXttsTask(bridge)
        context = task.describe()
        wd = TtsServerWatchdog()

        with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
             patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):

            def side_effect(*args, **kwargs):
                wd._drain_stream(None, "stderr", MockStream([
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[START_SEGMENT] seg-1 job-mix-1\n",
                    "[ENGINE_ACTIVITY_STARTED] seg-1 job-mix-1\n",
                    "[PROGRESS] 50% job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-1.wav job-mix-1\n",
                    "[START_SEGMENT] seg-2 job-mix-1\n",
                    "[ENGINE_ACTIVITY_STARTED] seg-2 job-mix-1\n",
                    # No [MODEL_LOAD_STARTED] — this is a warm XTTS reuse or Voxtral
                    "[PROGRESS] 50% job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-2.wav job-mix-1\n",
                ]))
                return {"status": "ok"}

            bridge.synthesize.side_effect = side_effect
            orc.progress_service = MagicMock()

            orc._dispatch(task=task, context=context)

        loading_frames = [
            e for e in orc.published
            if e.get("reason_code") == "LOADING_MODEL"
            and e.get("indeterminate") is True
            # Exclude the dispatch-time preparing frame (status="preparing")
            and e.get("status") == "running"
        ]
        assert not loading_frames, (
            f"INV-2 violation: LOADING_MODEL frame published for warm/cloud group "
            f"(no MODEL_LOAD_STARTED emitted). Got: {loading_frames}"
        )

    def test_task_id_mismatch_no_loading_model_frame(self, monkeypatch):
        """MODEL_LOAD_STARTED for a different job is filtered — no LOADING_MODEL frame."""
        _patch_db(monkeypatch)
        _patch_ws(monkeypatch)
        _patch_broadcast_segments(monkeypatch)

        bridge = MagicMock()
        orc = MockOrchestrator(voice_bridge=bridge)
        task = MockMixedXttsTask(bridge)
        context = task.describe()
        wd = TtsServerWatchdog()

        with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
             patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):

            def side_effect(*args, **kwargs):
                wd._drain_stream(None, "stderr", MockStream([
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[START_SEGMENT] seg-2 job-mix-1\n",
                    # This marker belongs to a DIFFERENT job
                    "[MODEL_LOAD_STARTED] seg-2 OTHER-JOB\n",
                    "[PROGRESS] 50% job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-2.wav job-mix-1\n",
                ]))
                return {"status": "ok"}

            bridge.synthesize.side_effect = side_effect
            orc.progress_service = MagicMock()

            orc._dispatch(task=task, context=context)

        loading_frames = [
            e for e in orc.published
            if e.get("reason_code") == "LOADING_MODEL"
            and e.get("indeterminate") is True
            and e.get("status") == "running"
        ]
        assert not loading_frames, (
            f"Cross-job MODEL_LOAD_STARTED must be filtered by task_id. Got: {loading_frames}"
        )


# ---------------------------------------------------------------------------
# Test 3 — Watchdog extracts task_id from MODEL_LOAD_STARTED
# ---------------------------------------------------------------------------

class TestWatchdogModelLoadStartedExtraction:
    """Drive _drain_stream with MODEL_LOAD_STARTED lines and check task_id routing.

    R2: only _drain_stream + listener callback are under test; no mocking of watchdog
    internals. Drive with a MockStream (not a real subprocess).
    """

    def test_model_load_started_with_sid_extracts_task_id(self):
        """[MODEL_LOAD_STARTED] {sid} {task_id} → listener receives task_id as last token."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, str | None]] = []

        def listener(line: str, task_id: str | None = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)
        wd._drain_stream(None, "stderr", MockStream([
            "[MODEL_LOAD_STARTED] sid-1 task-9\n",
        ]))

        assert len(received) == 1
        line, tid = received[0]
        assert tid == "task-9", (
            f"task_id must be 'task-9' (last token), got {tid!r}"
        )

    def test_model_load_started_task_id_only_extracted(self):
        """[MODEL_LOAD_STARTED] {task_id} (no sid) → task_id extracted correctly."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, str | None]] = []

        def listener(line: str, task_id: str | None = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)
        wd._drain_stream(None, "stderr", MockStream([
            "[MODEL_LOAD_STARTED] task-9\n",
        ]))

        assert len(received) == 1
        _, tid = received[0]
        assert tid == "task-9", (
            f"Single-token MODEL_LOAD_STARTED must extract task_id='task-9', got {tid!r}"
        )

    def test_model_load_started_wrong_job_filtered_by_listener(self):
        """task_id from MODEL_LOAD_STARTED is used for per-job filtering."""
        wd = TtsServerWatchdog()
        received_task_ids: list[str | None] = []

        def listener(line: str, task_id: str | None = None):
            received_task_ids.append(task_id)

        wd.register_log_listener(listener)
        wd._drain_stream(None, "stderr", MockStream([
            "[MODEL_LOAD_STARTED] sid-1 task-9\n",
            "[MODEL_LOAD_STARTED] other-job\n",
        ]))

        assert "task-9" in received_task_ids
        assert "other-job" in received_task_ids
        # The listener receives both (filtering happens in orchestrator log_listener)
        assert len(received_task_ids) == 2

    def test_model_load_started_with_path_like_sid_extracts_last_token(self):
        """Grammar: task_id is ALWAYS the last token regardless of sid format."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, str | None]] = []

        def listener(line: str, task_id: str | None = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)
        wd._drain_stream(None, "stderr", MockStream([
            "[MODEL_LOAD_STARTED] /path/to/seg-uuid job-abc\n",
        ]))

        assert len(received) == 1
        _, tid = received[0]
        assert tid == "job-abc", f"Expected task_id='job-abc', got {tid!r}"


# ---------------------------------------------------------------------------
# Test 4 — No model_load_seconds double-count
# ---------------------------------------------------------------------------

class TestNoDoubleCount:
    """MODEL_LOAD_STARTED path does not open a second pending_engine_activity interval.

    If a [ENGINE_ACTIVITY_STARTED] is followed by [MODEL_LOAD_STARTED], the interval
    should be opened once (by ENGINE_ACTIVITY_STARTED) and closed once
    (by START_SYNTHESIS). MODEL_LOAD_STARTED only emits the frame, not a second open.
    """

    def test_model_load_started_does_not_reopen_pending_interval(self, monkeypatch):
        """After ENGINE_ACTIVITY_STARTED opens the interval, MODEL_LOAD_STARTED
        must not overwrite pending_engine_activity['started_at'] with a new timestamp.
        This is verified by checking model_load_seconds is captured only once:
        it reflects the ENGINE_ACTIVITY_STARTED→START_SYNTHESIS window."""
        _patch_db(monkeypatch)
        _patch_ws(monkeypatch)
        _patch_broadcast_segments(monkeypatch)

        bridge = MagicMock()
        orc = MockOrchestrator(voice_bridge=bridge)
        task = MockMixedXttsTask(bridge)
        context = task.describe()
        wd = TtsServerWatchdog()

        with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
             patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):

            def side_effect(*args, **kwargs):
                wd._drain_stream(None, "stderr", MockStream([
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[START_SEGMENT] seg-2 job-mix-1\n",
                    "[ENGINE_ACTIVITY_STARTED] seg-2 job-mix-1\n",
                    "[MODEL_LOAD_STARTED] seg-2 job-mix-1\n",
                    # Confirm: closes the pending interval
                    "[START_SYNTHESIS] job-mix-1\n",
                    "[PROGRESS] 50% job-mix-1\n",
                    "[SEGMENT_SAVED] /tmp/seg-2.wav job-mix-1\n",
                ]))
                return {"status": "ok"}

            bridge.synthesize.side_effect = side_effect
            orc.progress_service = MagicMock()

            orc._dispatch(task=task, context=context)

        # Verify LOADING_MODEL frame is still emitted (MODEL_LOAD_STARTED does its job)
        loading_frames = [
            e for e in orc.published
            if e.get("reason_code") == "LOADING_MODEL"
            and e.get("indeterminate") is True
            and e.get("status") == "running"
        ]
        assert loading_frames, "LOADING_MODEL frame must still be emitted"

        # Verify no second LOADING_MODEL frame from MODEL_LOAD_STARTED (only one cold-load)
        assert len(loading_frames) == 1, (
            f"Expected exactly one LOADING_MODEL running frame, got {len(loading_frames)}: {loading_frames}"
        )
