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


class MockSkipRegistryBridgeTask(MockBridgeTask):
    """Mirrors ``_SyntheticSegmentTask``'s routing contract (W-PAR 008 R1): a
    fan-out child must always route via ``prefers_local_execution``/
    ``to_bridge_request``, never the legacy per-engine registry handler —
    even when its ``engine_id`` happens to have one registered."""

    skip_registry_dispatch = True


def test_fanout_child_bypasses_registry_handler_even_when_engine_has_one(orchestrator):
    """R1: a synthetic fan-out child (skip_registry_dispatch=True) must route
    through the bridge, not a legacy engine handler registered for the same
    engine_id — regardless of registry contents. Before the fix, the registry
    lookup in _dispatch_segment ran unconditionally and won every time an
    engine (e.g. xtts, voxtral) had a legacy handler registered, silently
    dead-coding the isolated per-group bridge path W-PAR 008 built."""
    task = MockSkipRegistryBridgeTask("test_job_fanout", engine_id="registry_engine")

    mock_handler = MagicMock(return_value=("done", "handled by registry"))
    reg = JobHandlerRegistry()
    reg.register_engine("registry_engine", mock_handler)

    orchestrator.voice_bridge.synthesize.return_value = {"status": "ok", "message": "handled by bridge"}

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry", return_value=reg):
        context = task.describe()
        result = orchestrator._dispatch(task=task, context=context)

    mock_handler.assert_not_called()
    orchestrator.voice_bridge.synthesize.assert_called_once()
    assert result.status == "completed"
    assert result.message == "handled by bridge"


def test_normal_task_without_marker_still_uses_registry_handler(orchestrator):
    """Regression control (INV-1): a task with NO skip_registry_dispatch marker
    (the default for every existing task type) must keep using the registry
    handler exactly as before — the bypass is opt-in, not a behavior change
    for anything else."""
    task = MockBridgeTask("test_job_normal", engine_id="registry_engine")
    assert not getattr(task, "skip_registry_dispatch", False)

    mock_handler = MagicMock(return_value=("done", "handled by registry"))
    reg = JobHandlerRegistry()
    reg.register_engine("registry_engine", mock_handler)

    with patch("app.orchestration.scheduler.orchestrator_helpers.get_handler_registry", return_value=reg):
        context = task.describe()
        result = orchestrator._dispatch(task=task, context=context)

    mock_handler.assert_called_once()
    assert result.status == "completed"
    assert result.message == "handled by registry"


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
