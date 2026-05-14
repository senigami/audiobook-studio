import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult
from app.engines.watchdog import TtsServerWatchdog

class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self):
        self.progress_service = MagicMock()
        self.voice_bridge = MagicMock()
    def _publish(self, **kwargs):
        pass

def test_grouped_segment_saved_updates_all_ids():
    """Verify that [SEGMENT_SAVED] updates all group member IDs in one bulk write."""
    orc = MockOrchestrator()
    wd = TtsServerWatchdog()

    class GroupedTask(StudioTask):
        def __init__(self):
            # Script entry with multiple IDs
            self.script = [
                {
                    "id": "s1", 
                    "ids": ["s1", "s2", "s3"], 
                    "text": "Sentences 1, 2, and 3.", 
                    "save_path": "group1.wav",
                    "weight": 100
                }
            ]
        def describe(self):
            return TaskContext(task_id="job-1", task_type="synthesis", chapter_id="chap-1")
        @property
        def prefers_local_execution(self) -> bool: return True
        def run(self):
            # Emit marker
            wd._broadcast_log("[SEGMENT_SAVED] group1.wav job-1", "job-1")
            return TaskResult(status="completed")

    task = GroupedTask()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.db.update_segments_bulk") as mock_update_seg, \
         patch("app.api.ws.broadcast_segments_updated") as mock_broadcast_segments:

        # We need to use the real _dispatch to build path_to_ids
        orc._dispatch(task=task, context=task.describe())

        mock_update_seg.assert_called_once()
        mock_broadcast_segments.assert_called_once_with("chap-1")
        args, kwargs = mock_update_seg.call_args
        assert args[0] == ["s1", "s2", "s3"]
        assert kwargs["audio_status"] == "done"
        assert kwargs["audio_file_path"] == "group1.wav"
        assert "audio_generated_at" in kwargs
