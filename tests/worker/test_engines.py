import time
from unittest.mock import patch
from pathlib import Path
from app.models import Job
from app.jobs.worker import worker_loop

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
