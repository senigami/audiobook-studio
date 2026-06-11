import pytest
from unittest.mock import MagicMock, patch
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.jobs.registry import JobHandlerRegistry

class MockTask(StudioTask):
    def __init__(self, task_id, engine_id="mock_engine"):
        self.task_id = task_id
        self.engine_id = engine_id
        self.submitted_at = 0
        self.local = False

    @property
    def prefers_local_execution(self):
        return self.local

    def validate(self): pass
    def describe(self):
        return TaskContext(task_id=self.task_id, task_type="mock", payload={"engine_id": self.engine_id})
    def run(self):
        return TaskResult(status="completed", message="task.run called")

@pytest.fixture
def orchestrator():
    ps = MagicMock()
    vb = MagicMock()
    return TaskOrchestrator(progress_service=ps, voice_bridge=vb)

def test_dispatch_uses_registry_handler(orchestrator):
    task = MockTask("test_job", engine_id="registry_engine")

    mock_handler = MagicMock(return_value=("done", "handled by registry"))

    # We need to mock get_handler_registry to return our registry with the handler
    reg = JobHandlerRegistry()
    reg.register_engine("registry_engine", mock_handler)

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry", return_value=reg):
        # We need to mock _reconcile_task and reserve_task_resources because we are testing _dispatch indirectly via submit
        # Or just test _dispatch directly if possible
        context = task.describe()
        result = orchestrator._dispatch(task=task, context=context)

        assert result.status == "completed"
        assert result.message == "handled by registry"
        mock_handler.assert_called_once()

def test_dispatch_falls_back_to_task_run_if_no_handler(orchestrator):
    task = MockTask("test_job", engine_id="unknown_engine")
    # Mark it for local execution so it doesn't fail early in _dispatch
    task.local = True

    reg = JobHandlerRegistry()

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry", return_value=reg):
        context = task.describe()
        result = orchestrator._dispatch(task=task, context=context)

        assert result.status == "completed"
        assert result.message == "task.run called"


class MockBridgeTask(MockTask):
    def to_bridge_request(self):
        return {"engine_id": self.engine_id, "script_text": "hi", "output_path": "/tmp/out.wav"}


def test_completed_bridge_dispatch_survives_malformed_timing_payload(orchestrator):
    # Audit task 003: stats recording is best-effort bookkeeping — a TypeError
    # while deriving timing from the raw bridge result must not convert a
    # completed synthesis into a failed TaskResult.
    task = MockBridgeTask("test_job_timing", engine_id="bridge_engine")

    orchestrator.voice_bridge.synthesize.return_value = {
        "status": "ok",
        "timing": {
            "engine_activity_started_at": None,
            "chapter_render_started_at": "not-a-timestamp",
            "chapter_render_completed_at": "also-not-a-timestamp",
            "segments": [],
        },
    }

    reg = JobHandlerRegistry()
    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry", return_value=reg):
        context = task.describe()
        result = orchestrator._dispatch(task=task, context=context)

    assert result.status == "completed"
