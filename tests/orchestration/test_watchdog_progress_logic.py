import pytest
import time
from typing import Optional, Any
from unittest.mock import MagicMock, patch
from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult

class MockStream:
    def __init__(self, lines):
        self.lines = lines
    def __iter__(self):
        return iter(self.lines)
    def close(self):
        pass

# 1. Proving multiple watchdog listeners receive lines without overwriting each other.
def test_watchdog_multiple_listeners():
    wd = TtsServerWatchdog()
    received_1 = []
    received_2 = []

    def listener_1(line: str, task_id: Optional[str] = None):
        received_1.append((line, task_id))
    def listener_2(line: str, task_id: Optional[str] = None):
        received_2.append((line, task_id))

    wd.register_log_listener(listener_1)
    wd.register_log_listener(listener_2)

    mock_stream = MockStream([
        "[START_SYNTHESIS] job-1\n",
        "[PROGRESS] 50% job-1\n"
    ])
    wd._drain_stream(None, "stdout", mock_stream)

    assert len(received_1) == 2
    assert len(received_2) == 2
    assert received_1 == received_2
    assert received_1[0][1] == "job-1"

# 2. Proving unregistration removes only the intended listener.
def test_watchdog_unregistration():
    wd = TtsServerWatchdog()
    received_1 = []
    received_2 = []

    def listener_1(line: str, task_id: Optional[str] = None):
        received_1.append(line)
    def listener_2(line: str, task_id: Optional[str] = None):
        received_2.append(line)

    wd.register_log_listener(listener_1)
    wd.register_log_listener(listener_2)

    wd._drain_stream(None, "stdout", MockStream(["line1\n"]))
    assert len(received_1) == 1
    assert len(received_2) == 1

    wd.unregister_log_listener(listener_1)
    wd._drain_stream(None, "stdout", MockStream(["line2\n"]))

    assert len(received_1) == 1
    assert len(received_2) == 2

# 3. Proving a SampleBuildTask custom run path receives correlated markers before synthesize returns.
class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self, voice_bridge):
        self.voice_bridge = voice_bridge
        self.published = []
    def _publish(self, **kwargs):
        self.published.append(kwargs)

class MockSampleBuildTask(StudioTask):
    def __init__(self, bridge):
        self.bridge = bridge
    def describe(self):
        return TaskContext(task_id="build-1", task_type="sample_build", payload={"script_text": "hello"})
    @property
    def prefers_local_execution(self) -> bool:
        return True
    def run(self):
        # In a real task, this blocks.
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


class MarkerDrivenNoopTask(StudioTask):
    @property
    def is_marker_driven(self) -> bool:
        return True

    def describe(self):
        return TaskContext(
            task_id="build-noop",
            task_type="sample_build",
            payload={"test_text": "short render", "engine_id": "voice_engine"},
        )

    @property
    def prefers_local_execution(self) -> bool:
        return True

    def get_expected_duration(self, text: str, engine_id: str) -> float:
        return 22.0

    def run(self):
        return TaskResult(status="completed")


def test_marker_driven_preparing_has_no_render_timing():
    orc = MockOrchestrator(voice_bridge=MagicMock())
    task = MarkerDrivenNoopTask()
    context = task.describe()
    wd = TtsServerWatchdog()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd):
        orc._dispatch(task=task, context=context)

    preparing_event = next(e for e in orc.published if e["status"] == "preparing")
    assert preparing_event["progress"] == 0.0
    assert preparing_event.get("started_at") is None
    assert preparing_event.get("eta_seconds") is None
    assert preparing_event.get("estimated_end_at") is None


def test_dispatch_unregisters_watchdog_listener_for_registry_handler():
    orc = MockOrchestrator(voice_bridge=MagicMock())
    wd = TtsServerWatchdog()

    class RegistryTask(StudioTask):
        def validate(self):
            pass

        def describe(self):
            return TaskContext(task_id="registry-job", task_type="synthesis", payload={"engine_id": "xtts"})

        @property
        def prefers_local_execution(self) -> bool:
            return False

        def run(self):
            raise AssertionError("registry handler path should not call run()")

        def on_cancel(self):
            pass

    def registry_handler(**_kwargs):
        return TaskResult(status="completed")

    task = RegistryTask()
    context = task.describe()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry") as mock_registry:
        mock_registry.return_value.get_handler.return_value = registry_handler
        result = orc._dispatch(task=task, context=context)

    assert result.status == "completed"
    assert wd._log_listeners == []

def test_sample_build_receives_markers_live():
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = MockSampleBuildTask(bridge)
    context = task.describe()

    wd = TtsServerWatchdog()
    # Mock get_watchdog to return our local wd
    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):
        # Simulate synthesis emitting logs while blocking
        def side_effect(*args, **kwargs):
            with patch.object(OrchestratorHelpersMixin, "_observed_remaining_seconds", return_value=10):
                wd._drain_stream(None, "stdout", MockStream([
                    "[START_SYNTHESIS] build-1\n",
                    "[PROGRESS] 50% build-1\n"
                ]))
                return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect

        # This calls _dispatch which sets up the listener
        orc._dispatch(task=task, context=context)

    # Verify that we got progress updates from the LOG markers, NOT just the task completion
    # SampleBuildTask doesn't call report_progress in our mock, so only log markers count.
    progress_events = [p for p in orc.published if p.get("status") == "running"]
    assert len(progress_events) >= 2
    assert any(p["progress"] == 0.0 for p in progress_events) # START_SYNTHESIS
    # Voice-sample progress is reported unscaled: 50% -> 0.50
    assert any(pytest.approx(p["progress"]) == 0.50 for p in progress_events)
    marker_progress = next(p for p in progress_events if pytest.approx(p["progress"]) == 0.50)
    assert marker_progress["eta_seconds"] == 10
    assert marker_progress["reason_code"] == "SEGMENT_PROGRESS"

# (tests 4 and 5 deleted — MOCKED-OUT/WRONG-SCENARIO)
# test_log_listener_task_id_filtering: re-implemented the listener closure locally;
#   never called app code. Real filtering coverage exists in test_sample_build_receives_markers_live.
# test_progress_scaling_math: re-implemented the scaling math locally with a stale 0.7 factor
#   that contradicts the production contract (voice samples are NOT scaled; see
#   test_voice_sample_unscaled_progress in test_progress_logic.py). WRONG-SCENARIO.

# 6. Proving started_at is NOT set during preparing, and IS set upon START_SYNTHESIS.
def test_started_at_marker_driven():
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    # Mocking task.get_expected_duration to avoid real calls
    task = MagicMock()
    task.get_expected_duration.return_value = 25.0
    task.is_marker_driven = True # Explicitly set for mock
    task.prefers_local_execution = False
    task.is_chapter_fanout = False  # Explicitly set for mock (W-PAR 008 R4 dispatch branch)
    task.to_bridge_request.return_value = {"task_id": "job-1"}
    task.describe.return_value = TaskContext(task_id="job-1", task_type="synthesis")
    context = task.describe()

    wd = TtsServerWatchdog()
    with patch("app.engines.watchdog.get_watchdog", return_value=wd):
        def side_effect(*args, **kwargs):
            # Emit START_SYNTHESIS followed by START_SEGMENT to verify the
            # segment handoff carries the same predicted ETA seed.
            wd._drain_stream(
                None,
                "stdout",
                MockStream(["[START_SYNTHESIS] job-1\n", "[START_SEGMENT] seg-1\n"]),
            )
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect

        # We need a mock progress_service on our MockOrchestrator because OrchestratorHelpersMixin calls it
        orc.progress_service = MagicMock()

        # Simulate the 'preparing' event that submit() usually emits
        orc._publish(context=context, status="preparing", started_at=None)

        orc._dispatch(task=task, context=context)

    # Verify events
    preparing_event = next(e for e in orc.published if e["status"] == "preparing")
    assert preparing_event["started_at"] is None

    running_event = next(e for e in orc.published if e["status"] == "running")
    assert running_event["started_at"] is not None
    assert running_event["started_at"] > 0
    assert running_event["eta_seconds"] == 25

    # SEGMENT_PENDING (announce) frame: under the refined contract this frame is
    # ETA-neutral — it preserves the prior chapter ETA rather than clearing it.
    # Suspension only fires when a real model-load marker is detected (see
    # ENGINE_ACTIVITY_STARTED branch). Assert the new correct contract.
    segment_pending_event = next(
        e for e in orc.published
        if e["status"] == "running" and e.get("active_segment_id") == "seg-1"
        and e.get("reason_code") == "SEGMENT_PENDING"
    )
    assert segment_pending_event["eta_seconds"] is None
    assert not segment_pending_event.get("clear_eta")
    assert not segment_pending_event.get("indeterminate")
    assert segment_pending_event["started_at"] is not None


class MockScriptedTask(StudioTask):
    def __init__(self, bridge):
        self.bridge = bridge
        self.script = [
            {"id": "segA", "text": "hello 1234567", "save_path": "a.wav"},
            {"id": "segB", "text": "hello 1234567", "save_path": "b.wav"},
        ]
    def get_expected_duration(self, text: str, engine_id: str) -> float:
        return 24.0
    def describe(self):
        return TaskContext(
            task_id="script-1",
            task_type="synthesis",
            payload={"script_text": "hello 1234567 hello 1234567", "engine_id": "xtts"},
        )
    @property
    def prefers_local_execution(self) -> bool:
        return True
    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")

def test_log_listener_progress_is_monotonic():
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = MockScriptedTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):
        def side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SYNTHESIS] script-1\n",
                "[START_SEGMENT] segA\n",
                "[PROGRESS] 50% script-1\n",
                "[PROGRESS] 100% script-1\n",
                "[PROGRESS] 20% script-1\n",
            ]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect
        orc.progress_service = MagicMock()

        orc._dispatch(task=task, context=context)

    # Filter running events from orc.published
    running_events = [p for p in orc.published if p.get("status") == "running" and p.get("progress") is not None]

    # Progress values published should be (true fraction, no ×0.90 scaling):
    # segA weight=13, segB weight=13, total=26.
    # 1. 0.0 (from START_SYNTHESIS)
    # 2. 0.0 (from SEGMENT_PENDING announce at [START_SEGMENT])
    # 3. 0.0 (preparing downgrade republish)
    # 4. 0.25 (canonical START_SEGMENT — confirmation inside the first PROGRESS branch,
    #    grouped progress already includes the parsed 50%; 13*0.5/26=0.25)
    # 5. 0.25 (from 50% segment progress)
    # 6. 0.5  (from 100% segment progress; 13/26=0.5)
    # 7. 0.5  (remains at 0.5 because of monotonicity clamp, NOT 0.09)
    progress_values = [p["progress"] for p in running_events]
    assert progress_values == [0.0, 0.0, 0.0, 0.25, 0.25, 0.5, 0.5]


def test_start_segment_eta_uses_active_block_chars():
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = MockScriptedTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):
        def side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SYNTHESIS] script-1\n",
                "[START_SEGMENT] segA\n",
                # Canonical START_SEGMENT is emitted at engine confirmation (first PROGRESS)
                "[PROGRESS] 0% script-1\n",
            ]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect
        orc.progress_service = MagicMock()

        orc._dispatch(task=task, context=context)

    segment_start = next(
        e for e in orc.published
        if e.get("reason_code") == "START_SEGMENT" and e.get("active_segment_id") == "segA"
    )
    assert segment_start["eta_seconds"] == 24
    assert segment_start["active_segment_eta_seconds"] == 12


def test_segment_eta_uses_active_block_progress_not_chapter_progress():
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = MockScriptedTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None):
        def side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SYNTHESIS] script-1\n",
                "[START_SEGMENT] segA\n",
                "[PROGRESS] 100% script-1\n",
            ]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect
        orc.progress_service = MagicMock()

        orc._dispatch(task=task, context=context)

    segment_complete = next(
        e for e in orc.published
        if e.get("reason_code") == "SEGMENT_PROGRESS"
        and e.get("active_segment_id") == "segA"
        and e.get("active_segment_progress") == 1.0
    )
    # segA=13 chars of 26 total → true fraction 0.5 (no ×0.90 scaling)
    assert segment_complete["progress"] == 0.5
    assert segment_complete["eta_seconds"] is not None
    assert segment_complete["active_segment_eta_seconds"] == 0


def test_watchdog_uses_readline_to_avoid_buffering():
    wd = TtsServerWatchdog()

    class ReadlineStream:
        def __init__(self, lines):
            self.lines = list(lines)
            self.readline_called = 0
            self.iter_called = 0

        def readline(self):
            self.readline_called += 1
            if self.lines:
                return self.lines.pop(0)
            return ""

        def __iter__(self):
            self.iter_called += 1
            return iter(self.lines)

        def close(self):
            pass

    stream = ReadlineStream(["line1\n", "line2\n"])
    wd._drain_stream(None, "stdout", stream)

    # We want it to have called readline, not __iter__
    assert stream.readline_called > 0
    assert stream.iter_called == 0


# --------------------------------------------------------------------------- #
# B8 regression: chapter progress must rise continuously within a render group #
# --------------------------------------------------------------------------- #

class TwoGroupScriptTask(StudioTask):
    """
    2-group script using the production script format (id + ids + save_path).
    Group 1 weight=50 (segments seg-A, seg-B), group 2 weight=50 (segment seg-C).
    Equal weights → completed-group fraction = 0.5 (true fraction, no ×0.90 scaling).
    """
    def __init__(self, bridge):
        self.bridge = bridge
        self.script = [
            {
                "id": "seg-A",
                "ids": ["seg-A", "seg-B"],
                "text": "Group one text.",
                "save_path": "/tmp/seg-A.wav",
                "weight": 50,
            },
            {
                "id": "seg-C",
                "ids": ["seg-C"],
                "text": "Group two text.",
                "save_path": "/tmp/seg-C.wav",
                "weight": 50,
            },
        ]

    def get_expected_duration(self, text: str, engine_id: str) -> float:
        return 20.0

    def describe(self):
        return TaskContext(
            task_id="job-b8",
            task_type="synthesis",
            payload={"script_text": "Group one text. Group two text.", "engine_id": "xtts"},
        )

    @property
    def prefers_local_execution(self) -> bool:
        return True

    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


def test_b8_progress_advances_within_group2(monkeypatch):
    """B8 — chapter progress MUST advance continuously within a render group.

    Simulate a 2-group render:
      • Group 1 completes ([SEGMENT_SAVED]).
      • Group 2 starts ([START_SEGMENT] seg-C) then emits [PROGRESS] at 25 / 50 / 75%.

    Assert:
      1. After SEGMENT_SAVED for group 1, grouped_progress = completed-group fraction
         (0.5 for equal weights, true fraction). This is the "frozen" value from the bug.
      2. After each [PROGRESS] in group 2, grouped_progress STRICTLY exceeds the frozen
         value — i.e., progress advances within the group rather than staying frozen.
      3. active_segment_id is set to "seg-C" during the group-2 progress events.

    Revert-check: on pre-fix code where active_seg_id[0] is None or doesn't resolve a
    weight, all three group-2 PROGRESS events publish the same frozen value (0.5).
    """
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = TwoGroupScriptTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    # Mock DB / WS side effects that would be triggered by SEGMENT_SAVED handler
    monkeypatch.setattr("app.db.update_segments_bulk", lambda *a, **kw: None, raising=False)

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None):

        def side_effect(*args, **kwargs):
            # Drive the full 2-group marker sequence through the watchdog:
            #   [START_SYNTHESIS]  — engine confirmed
            #   [START_SEGMENT] seg-A — group 1 starts
            #   [PROGRESS] 100%   — group 1 completes synthesis
            #   [SEGMENT_SAVED]   — group 1 audio saved → completed_weight += 50
            #   [START_SEGMENT] seg-C — group 2 starts  → active_seg_id = "seg-C"
            #   [PROGRESS] 25%    — group 2 at 25%
            #   [PROGRESS] 50%    — group 2 at 50%
            #   [PROGRESS] 75%    — group 2 at 75%
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SYNTHESIS] job-b8\n",
                "[START_SEGMENT] seg-A job-b8\n",
                "[PROGRESS] 100% job-b8\n",
                "[SEGMENT_SAVED] /tmp/seg-A.wav job-b8\n",
                "[START_SEGMENT] seg-C job-b8\n",
                "[PROGRESS] 25% job-b8\n",
                "[PROGRESS] 50% job-b8\n",
                "[PROGRESS] 75% job-b8\n",
            ]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect
        orc.progress_service = MagicMock()

        orc._dispatch(task=task, context=context)

    running = [e for e in orc.published if e.get("status") == "running" and e.get("progress") is not None]

    # Find the SEGMENT_SAVED publish (group 1 completion — the "frozen" baseline)
    saved_events = [e for e in running if e.get("reason_code") == "SEGMENT_SAVED"]
    assert saved_events, "No SEGMENT_SAVED event published"
    frozen_progress = saved_events[-1]["progress"]

    # Find the SEGMENT_PROGRESS events for group 2
    group2_progress_events = [
        e for e in running
        if e.get("reason_code") == "SEGMENT_PROGRESS"
        and e.get("active_segment_id") == "seg-C"
    ]
    assert len(group2_progress_events) >= 3, (
        f"Expected >=3 SEGMENT_PROGRESS events for seg-C, got {len(group2_progress_events)}. "
        f"Published events: {[e.get('reason_code') for e in running]}"
    )

    # B8 core assertion: progress MUST rise above the frozen value
    group2_progress_values = [e["progress"] for e in group2_progress_events]
    assert all(p > frozen_progress for p in group2_progress_values), (
        f"B8 violation: group-2 progress did not advance above the group-1 completion "
        f"floor {frozen_progress}. Got: {group2_progress_values}. "
        f"active_segment_ids: {[e.get('active_segment_id') for e in group2_progress_events]}"
    )

    # Progress must be strictly increasing during group 2
    for i in range(1, len(group2_progress_values)):
        assert group2_progress_values[i] >= group2_progress_values[i - 1], (
            f"B8 violation: progress regressed from {group2_progress_values[i-1]} to "
            f"{group2_progress_values[i]} within group 2"
        )


# ---------------------------------------------------------------------------
# Merged-line tripwire (escaped defect, 2026-07-06): a physical line carrying
# more than one marker token can only arrive via an unsynchronized-write
# interleave — warn loudly rather than silently mis-parsing.
# ---------------------------------------------------------------------------


def test_merged_marker_line_logs_a_warning(caplog):
    """A physical line embedding two distinct marker tokens (the exact shape
    of two threads' unsynchronized stderr writes interleaving before either's
    trailing newline lands) must trigger a WARNING — the read-side half of the
    2026-07-06 fix (the write side is engine.py's _emit_stderr_atomic)."""
    wd = TtsServerWatchdog()
    received = []
    wd.register_log_listener(lambda line, task_id=None: received.append((line, task_id)))

    merged_line = "[START_SEGMENT] seg-foreign job-B[PROGRESS] 33% job-A\n"

    with caplog.at_level("WARNING", logger="app.engines.watchdog"):
        wd._drain_stream(None, "stdout", MockStream([merged_line]))

    warnings = [r for r in caplog.records if "merged/corrupted marker line" in r.message]
    assert warnings, f"Expected a merged-line warning; got log records: {[r.message for r in caplog.records]}"
    # Still dispatches the line (best-effort forwarding) — the tripwire is a
    # diagnostic, not a line-dropping filter.
    assert len(received) == 1


def test_clean_single_marker_line_does_not_warn(caplog):
    """A normal, single-marker line must never trigger the tripwire — no
    false positives on the golden path."""
    wd = TtsServerWatchdog()
    wd.register_log_listener(lambda line, task_id=None: None)

    with caplog.at_level("WARNING", logger="app.engines.watchdog"):
        wd._drain_stream(None, "stdout", MockStream(["[PROGRESS] 50% job-1\n"]))

    warnings = [r for r in caplog.records if "merged/corrupted marker line" in r.message]
    assert not warnings, f"Clean single-marker line must not trigger the tripwire: {[r.message for r in caplog.records]}"
