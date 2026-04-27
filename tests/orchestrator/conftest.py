"""Shared fixtures for orchestrator tests."""

from __future__ import annotations

from unittest.mock import MagicMock
import pytest

from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.resources import ResourceClaim


@pytest.fixture
def progress_service():
    """Return a mock ProgressService with a default reconcile result."""
    svc = MagicMock()
    svc.publish.return_value = None
    svc.reconcile.return_value = {
        "artifact_state": "missing",
        "can_reuse": False,
    }
    return svc


@pytest.fixture
def voice_bridge():
    """Return a mock VoiceBridge with a default synthesize result."""
    bridge = MagicMock()
    bridge.synthesize.return_value = {
        "status": "ok",
        "output_path": "/tmp/out.wav",
    }
    return bridge


@pytest.fixture
def orchestrator(progress_service, voice_bridge):
    """Return a TaskOrchestrator with mocked dependencies."""
    return TaskOrchestrator(progress_service=progress_service, voice_bridge=voice_bridge)


@pytest.fixture
def make_task():
    """Factory fixture for creating mock StudioTasks."""
    def _make(
        task_id="t1",
        task_type="api_synthesis",
        source="api",
        result: TaskResult | None = None,
        validate_raises: Exception | None = None,
        resource_claim: ResourceClaim | None = None,
    ) -> MagicMock:
        task = MagicMock(spec=StudioTask)
        task.task_id = task_id

        ctx = TaskContext(task_id=task_id, task_type=task_type, source=source)
        task.describe.return_value = ctx

        if validate_raises:
            task.validate.side_effect = validate_raises
        else:
            task.validate.return_value = None

        task.run.return_value = result or TaskResult(status="completed")
        task.on_cancel.return_value = None
        task.resource_claim = resource_claim or ResourceClaim.none()
        return task
    return _make
