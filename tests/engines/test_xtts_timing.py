import pytest
import time
import os
import uuid
import importlib
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from app.db.core import init_db
from app.db.performance import get_render_history
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult

@pytest.fixture
def clean_db(tmp_path):
    # Use a unique DB path for this test
    db_path = tmp_path / f"test_performance_{uuid.uuid4().hex}.db"
    studio_db_path = tmp_path / f"test_studio_{uuid.uuid4().hex}.db"
    os.environ["DB_PATH"] = str(db_path)
    os.environ["STUDIO_DB_PATH"] = str(studio_db_path)

    # Force reload of db.core to pick up the new DB_PATHs
    import app.db.core
    importlib.reload(app.db.core)

    init_db()

    yield db_path

    # Cleanup
    if db_path.exists():
        try:
            os.unlink(db_path)
        except OSError:
            pass
    if studio_db_path.exists():
        try:
            os.unlink(studio_db_path)
        except OSError:
            pass


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


def test_sample_runs_live_progress_without_log_markers(clean_db, tmp_path):
    """Proving SampleBuildTask and SampleTestTask produce live progress without any log markers."""
    from app.orchestration.tasks.sample_build import SampleBuildTask

    orc = MockOrchestrator()
    output_wav = tmp_path / "test_sample_output.mp3"

    task = SampleBuildTask(
        task_id="sample-progress-test",
        speaker_profile="feeling-lucky",
        engine_id="xtts",
        output_path=output_wav,
        test_text="This is a test voice sample.",
    )

    context = task.describe()

    # Mock task.run to do nothing and return completed status
    task.run = MagicMock(return_value=TaskResult(status="completed"))

    # Run the orchestrator dispatch
    with patch("app.engines.watchdog.get_watchdog", return_value=None):
        orc._dispatch(task=task, context=context)

    # We should have received running progress updates immediately (since marker_driven is False)
    # and not be waiting for any START_SYNTHESIS log markers.
    running_updates = [p for p in orc.published if p.get("status") == "running"]
    assert len(running_updates) > 0
    # The first update should start at progress 0.0
    assert running_updates[0]["progress"] == 0.0


def test_persisted_sample_includes_audio_duration_and_model_load_seconds(clean_db, tmp_path):
    """Proving the persisted render sample includes audio_duration_seconds and model_load_seconds."""
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.db.performance import get_render_history

    orc = MockOrchestrator()
    output_wav = tmp_path / "sample_test_out.mp3"
    # Create a dummy audio file so probe_audio_duration can find it
    output_wav.write_text("dummy audio content")

    task = SampleBuildTask(
        task_id="sample-perf-test",
        speaker_profile="feeling-lucky",
        engine_id="xtts",
        output_path=output_wav,
        test_text="This is a test voice sample for performance metrics.",
    )
    context = task.describe()

    # Stub synthesize to return ok with timing
    timing_payload = {
        "engine_activity_started_at": 1000.0,
        "chapter_render_started_at": 1005.0,
        "chapter_render_completed_at": 1025.0,
        "segments": []
    }

    # Mock probe_audio_duration to return a dummy duration
    with patch("app.utils.subprocess_utils.probe_audio_duration", return_value=12.34), \
         patch("app.engines.watchdog.get_watchdog", return_value=None):

        # Mock the handler or bridge so the task returns result with timing
        result_val = TaskResult(status="completed")
        object.__setattr__(result_val, "timing", timing_payload)
        task.run = MagicMock(return_value=result_val)

        orc._dispatch(task=task, context=context)

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    # Assert model_load_seconds is populated (not chapter_load_seconds)
    assert "model_load_seconds" in sample
    assert sample["model_load_seconds"] == 5.0
    assert "chapter_load_seconds" not in sample

    # Assert audio_duration_seconds is captured
    assert sample["audio_duration_seconds"] == 12.34


def test_persisted_sample_prefers_structured_timing_for_model_load_seconds(clean_db, tmp_path):
    """Regression proving model_load_seconds falls back to structured timing even when a perf job object exists."""
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.db.performance import get_render_history

    orc = MockOrchestrator()
    output_wav = tmp_path / "sample_structured_timing_out.mp3"
    output_wav.write_text("dummy audio content")

    task = SampleBuildTask(
        task_id="sample-perf-structured-test",
        speaker_profile="feeling-lucky",
        engine_id="xtts",
        output_path=output_wav,
        test_text="This is a test voice sample for structured timing metrics.",
    )
    context = task.describe()

    timing_payload = {
        "engine_activity_started_at": 1000.0,
        "chapter_render_started_at": 1005.0,
        "chapter_render_completed_at": 1025.0,
        "segments": [],
        "model_load_seconds": 5.0,
        "sum_segment_render_seconds": 20.0,
    }
    perf_job_obj = SimpleNamespace(render_group_count=1)

    with patch("app.utils.subprocess_utils.probe_audio_duration", return_value=12.34), \
         patch("app.engines.watchdog.get_watchdog", return_value=None), \
         patch("app.db.state.get_jobs", return_value={context.task_id: perf_job_obj}):

        result_val = TaskResult(status="completed")
        object.__setattr__(result_val, "timing", timing_payload)
        task.run = MagicMock(return_value=result_val)

        orc._dispatch(task=task, context=context)

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]

    assert sample["model_load_seconds"] == 5.0
    assert sample["audio_duration_seconds"] == 12.34


def test_persisted_sample_falls_back_to_job_timestamps_for_model_load_seconds(clean_db, tmp_path):
    """Regression proving a one-segment sample still persists model_load_seconds from job timestamps when timing payload is absent."""
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.db.performance import get_render_history

    orc = MockOrchestrator()
    output_wav = tmp_path / "sample_job_timestamp_fallback_out.mp3"
    output_wav.write_text("dummy audio content")

    task = SampleBuildTask(
        task_id="sample-perf-job-fallback-test",
        speaker_profile="feeling-lucky",
        engine_id="xtts",
        output_path=output_wav,
        test_text="This is a test voice sample for timestamp fallback metrics.",
    )
    context = task.describe()

    perf_job_obj = SimpleNamespace(
        engine_activity_started_at=1000.0,
        started_at=1005.0,
        synthesis_duration_seconds=20.0,
        render_group_count=1,
    )

    with patch("app.utils.subprocess_utils.probe_audio_duration", return_value=12.34), \
         patch("app.engines.watchdog.get_watchdog", return_value=None), \
         patch("app.db.state.get_jobs", return_value={context.task_id: perf_job_obj}):

        task.run = MagicMock(return_value=TaskResult(status="completed"))
        orc._dispatch(task=task, context=context)

    history = get_render_history()
    assert len(history) == 1
    sample = history[0]
    assert sample["model_load_seconds"] == 5.0
    assert sample["audio_duration_seconds"] == 12.34


def test_sample_runs_always_non_marker_driven(clean_db):
    """Proving SampleBuildTask and SampleTestTask always report False for is_marker_driven, regardless of engine capability."""
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.orchestration.tasks.sample_test import SampleTestTask

    # "dummy-engine" does NOT support segment rendering
    task_build = SampleBuildTask(
        task_id="test-build",
        speaker_profile="feeling-lucky",
        engine_id="dummy-engine",
        output_path="out.mp3",
        test_text="test",
    )
    task_test = SampleTestTask(
        task_id="test-test",
        speaker_profile="feeling-lucky",
        engine_id="dummy-engine",
        output_path="out.mp3",
        test_text="test",
    )

    assert task_build.is_marker_driven is False
    assert task_test.is_marker_driven is False


def test_xtts_diagnostics_live_tee_stderr(capsys):
    """TDD regression: plugin-originated diagnostics must be forwarded to sys.stderr immediately, while maintaining on_output callback."""
    from plugins.tts_xtts.plugin.core.implementation import xtts_generate
    from pathlib import Path

    callback_lines = []
    def mock_on_output(line):
        callback_lines.append(line)

    with patch("plugins.tts_xtts.plugin.core.implementation.run_cmd_stream", return_value=0):
        rc = xtts_generate(
            text="hello",
            out_wav=Path("dummy.wav"),
            safe_mode=True,
            on_output=mock_on_output,
            cancel_check=lambda: False,
            speaker_wav="dummy.wav",
        )

    assert rc == 0
    # The callback must receive the diagnostics line
    assert any("Launching XTTS inference..." in line for line in callback_lines)
    # The captured stderr must also contain the diagnostics line immediately (live tee)
    captured = capsys.readouterr()
    assert "Launching XTTS inference...\n" in captured.err


def test_xtts_diagnostics_live_tee_no_duplicate(capsys):
    """TDD regression: raw child-process output should not be duplicated on sys.stderr."""
    from plugins.tts_xtts.plugin.core.proc_utils import run_cmd_stream

    callback_lines = []
    def mock_on_output(line):
        callback_lines.append(line)

    mock_proc = MagicMock()
    mock_proc.poll.return_value = 0
    mock_proc.returncode = 0
    mock_proc.stdout = MagicMock()

    output_bytes = list(b"[START_SEGMENT] seg-1\n")
    def side_effect_read(n):
        if output_bytes:
            return bytes([output_bytes.pop(0)])
        return b""
    mock_proc.stdout.read.side_effect = side_effect_read

    with patch("subprocess.Popen", return_value=mock_proc):
        run_cmd_stream("dummy_cmd", mock_on_output, lambda: False)

    captured = capsys.readouterr()
    # The subprocess output should go to stdout (via run_cmd_stream stdout writer)
    assert "[START_SEGMENT] seg-1\n" in captured.out
    # But it must NOT be duplicated to stderr by any plugin diagnostics helper
    assert "[START_SEGMENT] seg-1\n" not in captured.err


def test_sample_build_reaches_completion_without_context(clean_db, tmp_path):
    """Regression proving sample_build can synthesize and reaches completion without project/chapter context."""
    from app.orchestration.tasks.sample_build import SampleBuildTask
    from app.orchestration.tasks.base import TaskContext
    from unittest.mock import MagicMock, patch
    from plugins.tts_xtts.plugin.studio.adapter import xtts_dispatch_adapter
    from app.db.models import Job

    orc = MockOrchestrator()
    output_wav = tmp_path / "sample_out.mp3"

    task = SampleBuildTask(
        task_id="sample-build-no-ctx-test",
        speaker_profile="feeling-lucky",
        engine_id="xtts",
        output_path=output_wav,
        test_text="Hello from sample build without context.",
    )
    context = task.describe()

    assert context.project_id is None
    assert context.chapter_id is None

    job_shim = Job(
        id="sample-build-no-ctx-test",
        engine="xtts",
        kind="sample_build",
        status="running",
        created_at=time.time(),
        speaker_profile="feeling-lucky",
    )

    with patch("plugins.tts_xtts.plugin.studio.handler.handle_xtts_job") as mock_handle_job, \
         patch("app.db.speakers.get_profile_dir", return_value=tmp_path), \
         patch("app.db.speakers.get_profile_wavs", return_value=["dummy.wav"]), \
         patch("app.db.speakers.get_speaker_settings", return_value={"speed": 1.0, "test_text": "hello"}), \
         patch("app.db.state.update_job") as mock_update_job:

        xtts_dispatch_adapter(
            jid="sample-build-no-ctx-test",
            j=job_shim,
            start=time.time(),
            on_output=lambda x: None,
            cancel_check=lambda: False,
        )

        failed_calls = [c for c in mock_update_job.call_args_list if c[1].get("status") == "failed"]
        assert len(failed_calls) == 0
        assert mock_handle_job.called


def test_sample_test_reaches_completion_without_context(clean_db, tmp_path):
    """Regression proving sample_test can synthesize and reaches completion without project/chapter context."""
    from app.orchestration.tasks.sample_test import SampleTestTask
    from app.orchestration.tasks.base import TaskContext
    from unittest.mock import MagicMock, patch
    from plugins.tts_xtts.plugin.studio.adapter import xtts_dispatch_adapter
    from app.db.models import Job

    job_shim = Job(
        id="sample-test-no-ctx-test",
        engine="xtts",
        kind="sample_test",
        status="running",
        created_at=time.time(),
        speaker_profile="feeling-lucky",
    )

    with patch("plugins.tts_xtts.plugin.studio.handler.handle_xtts_job") as mock_handle_job, \
         patch("app.db.speakers.get_profile_dir", return_value=tmp_path), \
         patch("app.db.speakers.get_profile_wavs", return_value=["dummy.wav"]), \
         patch("app.db.speakers.get_speaker_settings", return_value={"speed": 1.0, "test_text": "hello"}), \
         patch("app.db.state.update_job") as mock_update_job:

        xtts_dispatch_adapter(
            jid="sample-test-no-ctx-test",
            j=job_shim,
            start=time.time(),
            on_output=lambda x: None,
            cancel_check=lambda: False,
        )

        failed_calls = [c for c in mock_update_job.call_args_list if c[1].get("status") == "failed"]
        assert len(failed_calls) == 0
        assert mock_handle_job.called


def test_chapter_bound_xtts_jobs_reject_missing_context(clean_db, tmp_path):
    """Regression proving chapter-bound XTTS jobs still reject missing project/chapter context."""
    from plugins.tts_xtts.plugin.studio.adapter import xtts_dispatch_adapter
    from app.db.models import Job
    from unittest.mock import patch

    job_shim = Job(
        id="chapter-job-no-ctx",
        engine="xtts",
        kind="synthesis",
        status="running",
        created_at=time.time(),
        speaker_profile="feeling-lucky",
        project_id=None,
        chapter_id=None,
    )

    with patch("app.db.state.update_job") as mock_update_job:
        xtts_dispatch_adapter(
            jid="chapter-job-no-ctx",
            j=job_shim,
            start=time.time(),
            on_output=lambda x: None,
            cancel_check=lambda: False,
        )

        failed_calls = [c for c in mock_update_job.call_args_list if c[1].get("status") == "failed"]
        assert len(failed_calls) == 1
        assert "context" in failed_calls[0][1].get("error", "")
