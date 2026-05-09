import pytest
import time
from typing import Optional
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

class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self, voice_bridge=None):
        self.voice_bridge = voice_bridge or MagicMock()
        self.published = []
        self.progress_service = MagicMock()
    def _publish(self, **kwargs):
        # In real code, _publish takes context as positional, but mixin uses it too.
        # We'll just capture everything.
        self.published.append(kwargs)

def test_watchdog_logs_listener_exceptions():
    wd = TtsServerWatchdog()

    def buggy_listener(line, task_id):
        raise ValueError("Buggy listener")

    wd.register_log_listener(buggy_listener)

    # We expect logger.exception to be called in the fixed version.
    # Currently it is 'pass'
    with patch("app.engines.watchdog.logger.exception") as mock_log_exc:
        wd._broadcast_log("test line", "job-1")
        assert mock_log_exc.called, "Expected logger.exception to be called for listener failure"

def test_markers_publish_running_updates_after_start_synthesis():
    orc = MockOrchestrator()
    wd = TtsServerWatchdog()

    class GroupedTask(StudioTask):
        def __init__(self):
            self.script = [
                {"id": "s1", "text": "one", "save_path": "s1.wav"},
                {"id": "s2", "text": "two", "save_path": "s2.wav"}
            ]
        def describe(self):
            return TaskContext(task_id="job-grouped", task_type="synthesis")

        @property
        def prefers_local_execution(self) -> bool: return True

        def run(self):
            # Emit markers while running!
            wd._broadcast_log("[START_SYNTHESIS] job-grouped", "job-grouped")
            wd._broadcast_log("[START_SEGMENT] s1 job-grouped", "job-grouped")
            wd._broadcast_log("[PROGRESS] 50% job-grouped", "job-grouped")
            wd._broadcast_log("[SEGMENT_SAVED] s1.wav job-grouped", "job-grouped")
            return TaskResult(status="completed")

    task = GroupedTask()
    context = task.describe()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd):
        orc._dispatch(task=task, context=context)

    running_events = [e for e in orc.published if e.get("status") == "running"]
    assert len(running_events) >= 4

    prog_event = next(e for e in running_events if e.get("reason_code") == "synthesis_progress")
    assert prog_event.get("active_segment_id") == "s1"
    assert prog_event.get("active_segment_progress") == 0.5

def test_grouped_segment_save_marks_all_group_members_done():
    orc = MockOrchestrator()
    wd = TtsServerWatchdog()

    class GroupedTask(StudioTask):
        def __init__(self):
            self.script = [
                {"id": "s1", "text": "part 1", "save_path": "group1.wav"},
                {"id": "s2", "text": "part 2", "save_path": "group1.wav"}
            ]
        def describe(self):
            return TaskContext(task_id="job-grouped", task_type="synthesis")

        @property
        def prefers_local_execution(self) -> bool: return True

        def run(self):
            wd._broadcast_log("[SEGMENT_SAVED] group1.wav job-grouped", "job-grouped")
            return TaskResult(status="completed")

    task = GroupedTask()
    context = task.describe()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.db.update_segments_bulk") as mock_update_seg:

        orc._dispatch(task=task, context=context)

        mock_update_seg.assert_called_once()
        updated_sids = mock_update_seg.call_args.args[0]
        assert updated_sids == ["s1", "s2"]
        assert mock_update_seg.call_args.kwargs["audio_status"] == "done"
        assert mock_update_seg.call_args.kwargs["audio_file_path"] == "group1.wav"
