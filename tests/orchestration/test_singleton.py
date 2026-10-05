import pytest
from unittest.mock import patch, MagicMock
from app.orchestration.scheduler.orchestrator import create_orchestrator, TaskOrchestrator
from app.orchestration.tasks.base import StudioTask, TaskContext

def test_create_orchestrator_returns_singleton():
    """create_orchestrator should return the same instance across calls."""
    # Reset singleton state if any
    import app.orchestration.scheduler.orchestrator as orch_mod
    orch_mod._GLOBAL_ORCHESTRATOR = None

    o1 = create_orchestrator()
    o2 = create_orchestrator()
    assert o1 is o2
    assert isinstance(o1, TaskOrchestrator)


def test_singleton_orchestrator_cancellation_routing():
    """Active tasks in singleton orchestrator should be cancelable across separate API invocations."""
    import app.orchestration.scheduler.orchestrator as orch_mod
    orch_mod._GLOBAL_ORCHESTRATOR = None

    # Get singleton orchestrator
    orchestrator = create_orchestrator()

    # Mock dependencies
    orchestrator.progress_service = MagicMock()

    # Create a mock active task
    task = MagicMock(spec=StudioTask)
    task.task_id = "job-12345"
    task.describe.return_value = TaskContext(
        task_id="job-12345",
        task_type="api_synthesis",
        source="api",
        project_id="p1",
        chapter_id="c1",
    )

    # Register task as active
    orchestrator._active["job-12345"] = task

    # Separately fetch the orchestrator (simulating a separate API call context)
    o2 = create_orchestrator()

    # Call cancel
    res = o2.cancel("job-12345")

    # Verify cancellation was successful and called task.on_cancel()
    assert res is True
    task.on_cancel.assert_called_once()
    assert "job-12345" not in o2._active
