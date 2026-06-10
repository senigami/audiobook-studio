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

    segment_running_event = next(
        e for e in orc.published
        if e["status"] == "running" and e.get("active_segment_id") == "seg-1"
    )
    assert segment_running_event["eta_seconds"] == 25
    assert segment_running_event["started_at"] is not None


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

    # Progress values published should be:
    # 1. 0.0 (from START_SYNTHESIS)
    # 2. 0.0 (from START_SEGMENT)
    # 3. 0.0 (from initial segment progress parsed)
    # 4. 0.225 (from 50% segment progress)
    # 5. 0.45 (from 100% segment progress)
    # 6. 0.45 (remains at 0.45 because of monotonicity clamp, NOT 0.09)
    progress_values = [p["progress"] for p in running_events]
    assert progress_values == [0.0, 0.0, 0.0, 0.225, 0.45, 0.45]


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
    assert segment_complete["progress"] == 0.45
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
