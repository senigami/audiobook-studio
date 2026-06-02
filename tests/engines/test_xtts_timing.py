import pytest
import time
from unittest.mock import MagicMock, patch
from app.db.performance import get_render_history
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult

class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self):
        self.published = []
    def _publish(self, **kwargs):
        self.published.append(kwargs)

def test_xtts_render_persists_true_chunk_count(clean_db):
    """Regression proving a 2-chunk XTTS render persists segment_count=2, not 9."""
    orc = MockOrchestrator()
    
    # Task with 9 segment ids (sentences)
    task = MagicMock()
    task.engine_id = "xtts"
    task.segment_ids = [f"s{i}" for i in range(1, 10)]
    task.prefers_local_execution = False
    task.to_bridge_request.return_value = {"task_id": "xtts-timing-test-1"}
    
    context = TaskContext(
        task_id="xtts-timing-test-1",
        task_type="synthesis",
        payload={
            "engine_id": "xtts",
            "script_text": "Sentence 1. Sentence 2. Sentence 3. Sentence 4. Sentence 5. Sentence 6. Sentence 7. Sentence 8. Sentence 9.",
            "segment_ids": task.segment_ids,
            "voice_profile_id": "vp1",
        }
    )
    task.describe.return_value = context

    # 2 true render chunks
    timing_payload = {
        "engine_activity_started_at": 1000.0,
        "chapter_render_started_at": 1005.0,
        "chapter_render_completed_at": 1025.0,
        "segments": [
            {"segment_id": "group1", "render_started_at": 1005.0, "render_completed_at": 1015.0},
            {"segment_id": "group2", "render_started_at": 1015.0, "render_completed_at": 1025.0},
        ]
    }
    
    result_val = TaskResult(status="completed")
    object.__setattr__(result_val, "timing", timing_payload)

    # Mock get_handler to return a handler that returns result_val
    def mock_handler(**kwargs):
        # We need a job in the DB state so synthesis_duration_seconds can be fetched
        from app.db.models import Job
        from app.db.state import put_job
        job = Job(
            id="xtts-timing-test-1",
            engine="xtts",
            status="done",
            created_at=time.time(),
            synthesis_duration_seconds=20.0,
        )
        put_job(job)
        return result_val

    with patch("app.engines.watchdog.get_watchdog", return_value=None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=mock_handler):
        
        orc._dispatch(task=task, context=context)

    history = get_render_history()
    assert len(history) == 1
    # MUST be 2 true render chunks, not 9 fallback sentences
    assert history[0]["segment_count"] == 2


def test_seconds_per_segment_derived_from_true_chunk_count(clean_db):
    """Regression proving seconds_per_segment is derived from the true render chunk count."""
    orc = MockOrchestrator()
    task = MagicMock()
    task.engine_id = "xtts"
    task.segment_ids = [f"s{i}" for i in range(1, 10)]
    task.prefers_local_execution = False
    task.to_bridge_request.return_value = {"task_id": "xtts-timing-test-2"}
    
    context = TaskContext(
        task_id="xtts-timing-test-2",
        task_type="synthesis",
        payload={
            "engine_id": "xtts",
            "script_text": "Sentence 1. Sentence 2. Sentence 3. Sentence 4. Sentence 5. Sentence 6. Sentence 7. Sentence 8. Sentence 9.",
            "segment_ids": task.segment_ids,
            "voice_profile_id": "vp1",
        }
    )
    task.describe.return_value = context

    # 2 segments, total render duration = 20.0 seconds
    timing_payload = {
        "engine_activity_started_at": 1000.0,
        "chapter_render_started_at": 1005.0,
        "chapter_render_completed_at": 1025.0,
        "segments": [
            {"segment_id": "group1", "render_started_at": 1005.0, "render_completed_at": 1015.0},
            {"segment_id": "group2", "render_started_at": 1015.0, "render_completed_at": 1025.0},
        ]
    }
    
    result_val = TaskResult(status="completed")
    object.__setattr__(result_val, "timing", timing_payload)

    def mock_handler(**kwargs):
        from app.db.models import Job
        from app.db.state import put_job
        job = Job(
            id="xtts-timing-test-2",
            engine="xtts",
            status="done",
            created_at=time.time(),
            synthesis_duration_seconds=20.0,
        )
        put_job(job)
        return result_val

    with patch("app.engines.watchdog.get_watchdog", return_value=None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=mock_handler):
        
        orc._dispatch(task=task, context=context)

    history = get_render_history()
    assert len(history) == 1
    # duration_seconds = 25.0. Segment count = 2. seconds_per_segment = 25.0 / 2 = 12.5
    assert history[0]["seconds_per_segment"] == 12.5


def test_fallback_paths_when_structured_timing_absent(clean_db):
    """Regression proving fallback paths still work when structured timing is absent."""
    orc = MockOrchestrator()
    task = MagicMock()
    task.engine_id = "xtts"
    task.segment_ids = [f"s{i}" for i in range(1, 4)] # 3 segments
    task.prefers_local_execution = False
    task.to_bridge_request.return_value = {"task_id": "xtts-timing-test-3"}
    task.script = [
        {"id": "group1", "text": "Sentence 1. Sentence 2."},
        {"id": "group2", "text": "Sentence 3."}
    ] # 2 true chunks/groups
    
    context = TaskContext(
        task_id="xtts-timing-test-3",
        task_type="synthesis",
        payload={
            "engine_id": "xtts",
            "script_text": "Sentence 1. Sentence 2. Sentence 3.",
            "segment_ids": task.segment_ids,
            "voice_profile_id": "vp1",
        }
    )
    task.describe.return_value = context

    # timing is completely absent
    result_val = TaskResult(status="completed")

    def mock_handler(**kwargs):
        from app.db.models import Job
        from app.db.state import put_job
        job = Job(
            id="xtts-timing-test-3",
            engine="xtts",
            status="done",
            created_at=time.time(),
            synthesis_duration_seconds=20.0,
        )
        put_job(job)
        return result_val

    with patch("app.engines.watchdog.get_watchdog", return_value=None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=mock_handler):
        
        orc._dispatch(task=task, context=context)

    history = get_render_history()
    assert len(history) == 1
    # Fallback to len(task.script) = 2, not 3
    assert history[0]["segment_count"] == 2

    # Now let's test absolute fallback to 1 when task.script is also absent
    del clean_db # reset db helper if needed, or we just write a second sample with another id
    task2 = MagicMock()
    task2.engine_id = "xtts"
    task2.segment_ids = [f"s{i}" for i in range(1, 4)]
    task2.prefers_local_execution = False
    task2.to_bridge_request.return_value = {"task_id": "xtts-timing-test-4"}
    task2.script = None

    context2 = TaskContext(
        task_id="xtts-timing-test-4",
        task_type="synthesis",
        payload={
            "engine_id": "xtts",
            "script_text": "Sentence 1. Sentence 2. Sentence 3.",
            "segment_ids": task2.segment_ids,
            "voice_profile_id": "vp1",
        }
    )
    task2.describe.return_value = context2

    def mock_handler2(**kwargs):
        from app.db.models import Job
        from app.db.state import put_job
        job = Job(
            id="xtts-timing-test-4",
            engine="xtts",
            status="done",
            created_at=time.time(),
            synthesis_duration_seconds=20.0,
        )
        put_job(job)
        return result_val

    with patch("app.engines.watchdog.get_watchdog", return_value=None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=mock_handler2):
        
        orc._dispatch(task=task2, context=context2)

    history2 = get_render_history()
    sample4 = next(h for h in history2 if h["job_id"] == "xtts-timing-test-4")
    # Must fallback to 1, not 3 (len(segment_ids))
    assert sample4["segment_count"] == 1

