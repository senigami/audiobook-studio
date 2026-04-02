import pytest
import time
import os
import threading
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
from app.models import Job
from app.jobs.worker import worker_loop

@pytest.fixture
def mock_q():
    q = MagicMock()
    return q

@pytest.fixture
def sample_job():
    return Job(
        id="test_job_1",
        engine="xtts",
        chapter_file="chapter1.txt",
        chapter_id="chap_1",
        status="queued",
        created_at=time.time(),
        project_id="proj_1"
    )

def test_worker_loop_xtts_basic(mock_q, sample_job):
    """Test basic XTTS job processing flow in worker_loop."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello world"), \
         patch("app.jobs.worker.handle_xtts_job") as mock_handle, \
         patch("app.jobs.worker._output_exists", return_value=False), \
         patch("app.jobs.worker.get_speaker_wavs", return_value=[]), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"speed": 1.0}):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        # Verify handle_xtts_job was called
        assert mock_handle.called

def test_worker_loop_xtts_segments(mock_q, sample_job):
    """Test XTTS job with segment_ids."""
    sample_job.segment_ids = ["s1", "s2"]
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=False), \
         patch("app.db.get_connection") as mock_conn, \
         patch("app.jobs.worker.handle_xtts_job"):

        mock_text_dir.return_value = Path("/tmp")
        # Mock DB response for segment length
        mock_conn.return_value.__enter__.return_value.cursor.return_value.fetchone.return_value = [100]

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        # Verify it tried to fetch segment lengths
        assert mock_conn.called

def test_worker_loop_resumption(mock_q, sample_job):
    """Test job resumption progress and ETA adjustment."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="A" * 1000), \
         patch("app.jobs.worker._calculate_group_resume_progress", return_value=0.67), \
         patch("app.jobs.worker.handle_xtts_job"), \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        # Find the call to update_job with initial state
        prep_call = [c for c in mock_update.call_args_list if c.kwargs.get('status') == "preparing"][0]
        assert prep_call.kwargs['progress'] == 0.67
        assert prep_call.kwargs['started_at'] is not None

def test_worker_loop_audiobook_engine(mock_q):
    """Test audiobook assembly job flow."""
    j = Job(id="ajob", engine="audiobook", chapter_file="book.mp3", status="queued", created_at=time.time(), progress=0.0)
    mock_q.get.side_effect = ["ajob", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"ajob": j}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"audiobook_speed_multiplier": 1.0}), \
         patch("app.jobs.worker.get_project_audio_dir", create=True) as mock_audio_dir, \
         patch("os.listdir", return_value=["1.wav", "2.wav"]), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("app.jobs.worker._output_exists", return_value=False), \
         patch("app.jobs.worker.handle_audiobook_job") as mock_handle:

        mock_audio_dir.return_value = Path("/tmp/audio")
        mock_stat.return_value.st_size = 10 * 1024 * 1024 # 10MB each

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        assert mock_handle.called

def test_on_output_logic(mock_q, sample_job):
    """Test the internal on_output callback logic."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    # We want to intercept the on_output function passed to handle_xtts_job
    captured_on_output = []

    def fake_handler(jid, j, start, on_output, *args, **kwargs):
        captured_on_output.append(on_output)

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello"), \
         patch("app.jobs.worker.handle_xtts_job", side_effect=fake_handler), \
         patch("app.jobs.worker._output_exists", return_value=False), \
         patch("app.jobs.worker.get_speaker_wavs", return_value=[]), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("app.jobs.worker.update_performance_metrics"):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        on_out = captured_on_output[0]

        # Test [START_SYNTHESIS]
        mock_update.reset_mock()
        on_out("[START_SYNTHESIS]")
        assert sample_job.status == "running"

        # Generic tqdm-style percentages should not be treated as authoritative job progress.
        mock_update.reset_mock()
        sample_job.synthesis_started_at = time.time()
        on_out("Processing | 50% [########    ]")
        assert sample_job.progress == 0.05
        mock_update.assert_not_called()

        # Test character limit warning
        mock_update.reset_mock()
        on_out("exceeds the character limit of 250")
        assert sample_job.warning_count == 1

        # Test log accumulation (Simplified: No longer checking for 'log' in update_job)
        mock_update.reset_mock()
        on_out("Normal log line")

        # Hugging Face / tqdm-style download lines should be surfaced verbatim without synthetic progress updates.
        download_line = "model.safetensors: 71%|###5 | 6.62G/9.36G [05:07<01:03, 42.8MB/s]"
        on_out(download_line)
        mock_update.assert_not_called()

def test_worker_loop_xtts_bake(mock_q, sample_job):
    """Test XTTS job with is_bake=True."""
    sample_job.is_bake = True
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=False), \
         patch("app.db.get_connection") as mock_conn, \
         patch("app.jobs.worker.handle_xtts_job"):

        mock_text_dir.return_value = Path("/tmp")
        mock_conn.return_value.__enter__.return_value.cursor.return_value.fetchone.return_value = [500]

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        assert mock_conn.called


def test_worker_loop_voxtral_dispatches_handler(mock_q):
    sample_job = Job(
        id="voxtral_job",
        engine="voxtral",
        chapter_file="chapter1.txt",
        chapter_id="chap_1",
        status="queued",
        created_at=time.time(),
        project_id="proj_1",
        speaker_profile="Voice1"
    )
    mock_q.get.side_effect = ["voxtral_job", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"voxtral_job": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
        patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello world"), \
         patch("app.jobs.worker.handle_voxtral_job", return_value="done") as mock_handle, \
         patch("app.jobs.worker._mark_queue_failed") as mock_failed, \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise e

        assert mock_handle.called
        mock_failed.assert_not_called()

def test_worker_loop_voxtral_does_not_resume_from_segment_completion(mock_q):
    sample_job = Job(
        id="voxtral_job",
        engine="voxtral",
        chapter_file="chapter1.txt",
        chapter_id="chap_1",
        status="queued",
        created_at=time.time(),
        project_id="proj_1",
        speaker_profile="Voice1"
    )
    mock_q.get.side_effect = ["voxtral_job", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"voxtral_job": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello world"), \
         patch("app.db.chapters.get_chapter_segments_counts", return_value=(10, 10)) as mock_counts, \
         patch("app.jobs.worker.handle_voxtral_job", return_value="done"), \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise e

        prep_call = [c for c in mock_update.call_args_list if c.kwargs.get('status') == "preparing"][0]
        assert prep_call.kwargs['progress'] == 0.0
        assert prep_call.kwargs['started_at'] is None
        mock_counts.assert_not_called()

def test_worker_loop_skipped_or_failed(mock_q, sample_job):
    """Test skipped and failed scenarios in worker_loop."""
    # 1. Skipped (output exists)
    mock_q.get.side_effect = ["test_job_1", "test_job_2", Exception("Stop")]

    # We need to make sure text_path exists or mocked as existing
    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job, "test_job_2": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker._output_exists", side_effect=[True, False]):

        # test_job_1: skipped
        # test_job_2: will fail on file not found (if we mock exists=False)

        try: worker_loop(mock_q)
        except Exception as e:
            if str(e) != "Stop": raise e

        # Check for done update
        skipped_calls = [c for c in mock_update.call_args_list if c.kwargs.get('status') == "done"]
        assert len(skipped_calls) > 0

    # 2. Failed (file not found)
    mock_q.get.reset_mock()
    mock_q.get.side_effect = ["test_job_3", Exception("Stop")]
    j_fail = Job(id="test_job_3", engine="xtts", chapter_file="fail.txt", status="queued", created_at=time.time())

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_3": j_fail}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=False), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker._output_exists", return_value=False):

        try: worker_loop(mock_q)
        except Exception as e:
            if str(e) != "Stop": raise e

        failed_calls = [c for c in mock_update.call_args_list if c.kwargs.get('status') == "failed"]
        assert len(failed_calls) > 0

def test_worker_pause_logic(mock_q, sample_job):
    """Test pause and bypass_pause logic."""
    from app.jobs.core import pause_flag
    pause_flag.set()

    sample_job.bypass_pause = True
    mock_q.get.side_effect = ["test_job_1", Exception("Stop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="H"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker._output_exists", return_value=True):

        try: worker_loop(mock_q)
        except Exception as e:
            if str(e) != "Stop": raise e

    pause_flag.clear()

def test_worker_resumption_error_handling(mock_q, sample_job):
    """Test the try-except block in resumption logic."""
    mock_q.get.side_effect = ["test_job_1", Exception("Stop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="H"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.db.chapters.get_chapter_segments_counts", side_effect=Exception("DB Error")), \
         patch("app.jobs.worker._output_exists", return_value=True):

        try: worker_loop(mock_q)
        except Exception as e:
            if str(e) != "Stop": raise e

        # The worker should continue past the DB error and still emit progress updates.
        assert mock_update.called

def test_on_output_blank_xtts_heartbeat_does_not_broadcast_predicted_progress(mock_q, sample_job):
    """XTTS jobs should not emit synthetic websocket progress on blank heartbeats."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]
    captured_on_output = []
    def fake_handler(jid, j, start, on_output, *args, **kwargs): captured_on_output.append(on_output)

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello"), \
         patch("app.jobs.worker.handle_xtts_job", side_effect=fake_handler), \
         patch("app.jobs.worker._output_exists", return_value=False), \
         patch("app.jobs.worker.get_speaker_wavs", return_value=[]), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"speed": 1.0}), \
         patch("app.jobs.worker.calculate_predicted_progress", return_value=0.15):

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise e

        on_out = captured_on_output[0]
        # Simulate empty line (predictive update)
        mock_update.reset_mock()
        sample_job._last_broadcast_p = 0.0
        on_out("") 

        mock_update.assert_not_called()

def test_worker_loop_crash(mock_q):
    """Test the top-level exception handler in worker_loop."""
    mock_q.get.side_effect = ["test_job_1"]

    # Make get_jobs raise an exception to trigger the outer try-except
    with patch("app.jobs.worker.get_jobs", side_effect=Exception("Fatal Error")), \
         patch("app.jobs.worker.update_job") as mock_update:

        # This will raise Exception("Fatal Error") inside the while loop,
        # which should be caught by the outer except Exception.
        # But wait, the outer except is INSIDE the while loop in worker.py!
        # Line 18: def worker_loop(q):
        # Line 19:   while True:
        # Line 20:     jid = q.get()
        # Line 21:     try:
        # ...
        # Line 237:    except Exception:

        # So it should catch it and continue. We raise Stop to exit.
        with patch("app.jobs.worker.traceback.format_exc", return_value="stacktrace"):
            try:
                # Use side effect to stop after the catch
                mock_q.get.side_effect = ["test_job_1", Exception("Stop")]
                worker_loop(mock_q)
            except Exception as e:
                if str(e) != "Stop": raise e

        # Check that update_job was called with status="failed"
        mock_update.assert_any_call("test_job_1", status="failed", finished_at=pytest.approx(time.time(), abs=2), progress=1.0, error="Worker crashed.")

class AnyStringWith:
    def __init__(self, substring): self.substring = substring
    def __eq__(self, other): return isinstance(other, str) and self.substring in other
