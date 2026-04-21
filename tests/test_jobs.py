from app.jobs import (
    enqueue, requeue, cancel, clear_job_queue, 
    paused, toggle_pause, set_paused, _estimate_seconds, format_seconds,
    _output_exists, cleanup_and_reconcile, get_speaker_wavs, get_speaker_settings
)
from app.models import Job
import time
from unittest.mock import patch, MagicMock
import threading

def test_pause_states():
    set_paused(True)
    assert paused() is True
    toggle_pause()
    assert paused() is False

def test_estimate_seconds():
    # 10 chars at 10 cps = 1 + (1*3) + 4 = 8
    assert _estimate_seconds(10, 10.0) == 8
    assert format_seconds(65) == "1m 5s"
    assert format_seconds(3605) == "1h 0m 5s"

def test_queueing():
    job = Job(id="test_job", engine="xtts", chapter_file="none.txt", status="queued", created_at=0.0)
    with patch("app.jobs.put_job") as mock_put_job, \
         patch("app.jobs.job_queue") as mock_job_queue, \
         patch("app.jobs.assembly_queue") as mock_assembly_queue:
        enqueue(job)

    mock_put_job.assert_called_once_with(job)
    mock_job_queue.put.assert_called_once_with(job.id)
    mock_assembly_queue.put.assert_not_called()

def test_output_exists():
    with patch('pathlib.Path.exists', return_value=True), patch('pathlib.Path.stat'):
        assert _output_exists("xtts", "c1.txt") is True

def test_cleanup_and_reconcile():
    with patch('app.jobs.get_jobs', return_value={}), patch('app.state.delete_jobs'):
        res = cleanup_and_reconcile()
        assert res == []

def test_speaker_helpers():
    with patch('app.jobs.VOICES_DIR') as mock_dir:
        mock_dir.exists.return_value = True
        mock_dir.is_dir.return_value = True
        mock_dir.glob.return_value = []
        assert get_speaker_wavs("default") is None

    with patch('app.jobs.get_settings', return_value={"default_speaker_profile": "v2"}):
        settings = get_speaker_settings("default")

    assert settings["speed"] == 1.0
    assert settings["test_text"]


def test_speaker_helpers_resolve_uuid_profile(tmp_path):
    from app.jobs.speaker import get_speaker_wavs

    voices_dir = tmp_path / "voices"
    profile_dir = voices_dir / "v2"
    profile_dir.mkdir(parents=True)
    (profile_dir / "voice.wav").write_text("audio")
    (profile_dir / "sample.wav").write_text("audio")

    with patch("app.db.get_speaker", return_value={"default_profile_name": "v2"}) as mock_get_speaker, \
         patch("app.db.list_speakers", return_value=[]), \
         patch("app.jobs.speaker.VOICES_DIR", voices_dir):
        result = get_speaker_wavs("123e4567-e89b-12d3-a456-426614174000")

    assert result is not None
    assert "voice.wav" in result
    assert "sample.wav" not in result
    mock_get_speaker.assert_called_once_with("123e4567-e89b-12d3-a456-426614174000")


def test_ensure_workers_is_lock_protected_under_concurrency():
    from app.jobs import ensure_workers
    import app.jobs as jobs_module

    created_names: list[str] = []
    real_thread = threading.Thread

    class FakeThread:
        def __init__(self, target=None, args=(), name=None, daemon=None):
            self._alive = False
            self.name = name
            created_names.append(name)

        def start(self):
            self._alive = True

        def is_alive(self):
            return self._alive

    barrier = threading.Barrier(2)

    def call_ensure():
        barrier.wait()
        ensure_workers()

    with patch.object(jobs_module, "_worker_threads", {}), \
         patch.object(jobs_module.threading, "Thread", FakeThread):
        t1 = real_thread(target=call_ensure)
        t2 = real_thread(target=call_ensure)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

    assert created_names.count("SynthesisWorker") == 1
    assert created_names.count("AssemblyWorker") == 1
