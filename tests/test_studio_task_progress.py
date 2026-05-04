import pytest
import time
from unittest.mock import MagicMock, patch
from app.orchestration.tasks.base import StudioTask, TaskContext, TaskResult
from app.orchestration.scheduler.orchestrator import TaskOrchestrator
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin

class MockTask(StudioTask):
    def validate(self): pass
    def describe(self): return TaskContext(task_id="test", task_type="mock")
    def run(self):
        self.report_progress(0.25, message="Step 1")
        self.report_progress(0.75, message="Step 2")
        return TaskResult(status="completed")
    def on_cancel(self): pass

def test_studio_task_progress_reporter_mechanism():
    """Prove StudioTask.report_progress() is no-op without a reporter and invokes a reporter when attached."""
    task = MockTask()

    # No reporter - should not raise
    task.report_progress(0.5, "test")

    # With reporter
    mock_callback = MagicMock()
    task.set_progress_reporter(mock_callback)
    task.report_progress(0.5, "test", "CODE")

    mock_callback.assert_called_once_with(0.5, "test", "CODE")

def test_orchestrator_attaches_progress_reporter(monkeypatch):
    """Prove orchestrator dispatch attaches a reporter that calls _publish."""
    mock_progress = MagicMock()
    orchestrator = TaskOrchestrator(progress_service=mock_progress, voice_bridge=MagicMock())

    task = MockTask()
    context = task.describe()

    # We want to catch the calls to mock_progress.publish
    # _publish calls progress_service.publish

    with patch.object(orchestrator, "_publish") as mock_publish:
        orchestrator._dispatch(task=task, context=context)

        # Verify that mock_publish was called with progress updates from the task
        # MockTask reports 0.25 and 0.75
        publish_calls = [call for call in mock_publish.call_args_list if call.kwargs.get("progress") in [0.25, 0.75]]
        assert len(publish_calls) >= 2
        assert publish_calls[0].kwargs["progress"] == 0.25
        assert publish_calls[0].kwargs["message"] == "Step 1"
        assert publish_calls[1].kwargs["progress"] == 0.75
        assert publish_calls[1].kwargs["message"] == "Step 2"

def test_publish_preserves_started_at():
    """Prove that a later update with no started_at does not erase an existing started_at."""
    from app.state import put_job, get_jobs, update_job, Job
    import app.state

    # Mock put_job and update_job to use a local dict for testing
    jobs_db = {}
    def mock_put_job(j): jobs_db[j.id] = j
    def mock_get_jobs(): return jobs_db
    def mock_update_job(jid, **kwargs):
        if jid in jobs_db:
            for k, v in kwargs.items():
                if hasattr(jobs_db[jid], k):
                    setattr(jobs_db[jid], k, v)

    with patch("app.state.put_job", side_effect=mock_put_job), \
         patch("app.state.get_jobs", side_effect=mock_get_jobs), \
         patch("app.state.update_job", side_effect=mock_update_job):

        mock_progress = MagicMock()
        mixin = OrchestratorHelpersMixin()
        mixin.progress_service = mock_progress

        context = TaskContext(task_id="started_test", task_type="test")

        # 1. First publish with started_at
        start_time = 123456789.0
        mixin._publish(context=context, status="running", started_at=start_time)

        assert jobs_db["started_test"].started_at == start_time
        assert jobs_db["started_test"].updated_at is not None

        # 2. Second publish WITHOUT started_at (e.g. intermediate progress)
        last_updated = jobs_db["started_test"].updated_at
        time.sleep(0.01)
        mixin._publish(context=context, status="running", progress=0.5)

        # Should still have the original started_at and NEWER updated_at
        assert jobs_db["started_test"].started_at == start_time
        assert jobs_db["started_test"].progress == 0.5
        assert jobs_db["started_test"].updated_at > last_updated

def test_publish_monotonic_progress():
    """Prove that progress does not regress within the same status."""
    from app.state import put_job, get_jobs, update_job, Job
    jobs_db = {}
    def mock_put_job(j): jobs_db[j.id] = j
    def mock_get_jobs(): return jobs_db
    def mock_update_job(jid, **kwargs):
        if jid in jobs_db:
            for k, v in kwargs.items():
                if hasattr(jobs_db[jid], k):
                    setattr(jobs_db[jid], k, v)

    with patch("app.state.put_job", side_effect=mock_put_job), \
         patch("app.state.get_jobs", side_effect=mock_get_jobs), \
         patch("app.state.update_job", side_effect=mock_update_job):

        mixin = OrchestratorHelpersMixin()
        mixin.progress_service = MagicMock()
        context = TaskContext(task_id="mono_test", task_type="test")

        # 1. Start with 0.3 (synthetic running default)
        mixin._publish(context=context, status="running", progress=0.3)
        assert jobs_db["mono_test"].progress == 0.3

        # 2. Lower progress from task (0.1) should NOT overwrite 0.3
        mixin._publish(context=context, status="running", progress=0.1)
        assert jobs_db["mono_test"].progress == 0.3

        # 3. Higher progress (0.4) SHOULD overwrite
        mixin._publish(context=context, status="running", progress=0.4)
        assert jobs_db["mono_test"].progress == 0.4

def test_progress_heartbeat():
    """Verify that progress_heartbeat context manager emits updates and reaches near cap."""
    from app.orchestration.tasks.base import StudioTask
    import threading
    import time

    class MockTask(StudioTask):
        def run(self):
            # Simulate a 0.3s blocking call with a heartbeat
            # expected_duration=0.1 so it should reach cap almost immediately
            with self.progress_heartbeat(start=0.30, cap=0.60, interval=0.1, expected_duration=0.1, message="Heartbeating"):
                time.sleep(0.3)
            return TaskResult(status="completed")

    reporter_calls = []
    def mock_reporter(prog, msg, code):
        reporter_calls.append((prog, msg, code))

    task = MockTask()
    task.set_progress_reporter(mock_reporter)

    task.run()

    # Check that we got multiple heartbeat calls
    heartbeat_calls = [c for c in reporter_calls if c[2] == "heartbeat"]
    assert len(heartbeat_calls) > 0

    # Check that progress reached near cap
    max_prog = max(c[0] for c in heartbeat_calls)
    assert max_prog >= 0.58 # Should be very close to 0.6
    assert max_prog <= 0.60

    # Check monotonicity
    last_prog = 0.29
    for prog, msg, code in heartbeat_calls:
        assert prog >= last_prog
        assert prog <= 0.60
        last_prog = prog

    # Verify heartbeat thread stopped
    time.sleep(0.2)
    assert any("heartbeat" in t.name for t in threading.enumerate()) == False

def test_progress_heartbeat_non_advancing():
    """Verify that progress_heartbeat with advance_progress=False stays at start value."""
    from app.orchestration.tasks.base import StudioTask
    import time

    class MockTask(StudioTask):
        def run(self):
            # Simulate a 0.3s blocking call with a non-advancing heartbeat
            with self.progress_heartbeat(start=0.0, cap=0.0, interval=0.1, advance_progress=False, message="Capped"):
                time.sleep(0.3)
            return TaskResult(status="completed")

    reporter_calls = []
    def mock_reporter(prog, msg, code):
        reporter_calls.append((prog, msg, code))

    task = MockTask()
    task.set_progress_reporter(mock_reporter)

    task.run()

    # Check that we got multiple heartbeat_capped calls
    heartbeat_calls = [c for c in reporter_calls if c[2] == "heartbeat_capped"]
    assert len(heartbeat_calls) > 0

    # Check that progress stayed at 0.0
    for prog, msg, code in heartbeat_calls:
        assert prog == 0.0
        assert msg == "Capped"

