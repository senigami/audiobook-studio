"""Shared fixtures for orchestrator tests."""

from __future__ import annotations

import threading

from unittest.mock import MagicMock
import pytest

from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.resources import ResourceClaim


def join_recovery_threads(timeout: float = 10.0) -> list[str]:
    """Join any background ``recovery-*`` submit threads spawned by recover().

    TaskOrchestrator.recover() re-submits reconstructed tasks on daemon threads.
    A thread that outlives its test runs a full submit() — including the
    late-bound ``record_render_sample`` import — inside whatever patch window
    the *next* test has open, corrupting its mock call counts (observed as the
    CI-only ``assert 2 == 1`` flake in test_submit.py). Returns the names of
    any threads still alive after the join timeout.
    """
    for t in threading.enumerate():
        if t.name.startswith("recovery-"):
            t.join(timeout=timeout)
    return [t.name for t in threading.enumerate() if t.name.startswith("recovery-")]


@pytest.fixture(autouse=True)
def reset_global_orchestrator():
    # A recovery thread leaked by an earlier test (any module) must not run
    # inside this test's patch windows.
    join_recovery_threads()

    import app.orchestration.scheduler.orchestrator as orch_mod
    orch_mod._GLOBAL_ORCHESTRATOR = None

    # Clear job listeners to prevent cross-test pollution
    from app.db.state_helpers import _JOB_LISTENERS, _LISTENER_SNAPSHOT_SUPPORT
    _JOB_LISTENERS.clear()
    _LISTENER_SNAPSHOT_SUPPORT.clear()

    yield

    # Attribute any leak to the test that caused it instead of letting it
    # corrupt an innocent later test.
    leaked = join_recovery_threads()
    assert not leaked, f"recovery threads leaked past test teardown: {leaked}"

    orch_mod._GLOBAL_ORCHESTRATOR = None
    _JOB_LISTENERS.clear()
    _LISTENER_SNAPSHOT_SUPPORT.clear()


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
        task.is_marker_driven = False
        return task
    return _make
