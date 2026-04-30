import time
from unittest.mock import patch
from pathlib import Path
from app.models import Job
from app.jobs.worker import worker_loop
from app.jobs import _estimate_seconds

def test_worker_loop_xtts_updates_learned_cps_from_completed_chapter_runs(mock_q, sample_job):
    """Completed XTTS chapter runs should feed the learned CPS metric."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    def fake_handler(*args, **kwargs):
        sample_job.synthesis_started_at = time.time() - 10
        sample_job.finished_at = time.time()
        sample_job.status = "done"
        return "done"

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="A" * 1000), \
         patch("app.jobs.worker.handle_xtts_job", side_effect=fake_handler), \
         patch("app.jobs.worker_metrics.update_performance_metrics") as mock_update_perf, \
         patch("app.jobs.worker._output_exists", return_value=False), \
         patch("app.jobs.worker.get_speaker_wavs", return_value=[]), \
         patch("app.jobs.worker.get_speaker_settings", return_value={"speed": 1.0}):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        mock_update_perf.assert_called_once()
        assert "xtts_cps" in mock_update_perf.call_args.kwargs

def test_worker_loop_mixed_updates_learned_cps_from_completed_chapter_runs(mock_q):
    sample_job = Job(
        id="mixed_job",
        engine="mixed",
        chapter_file="chapter1.txt",
        chapter_id="chap_1",
        status="queued",
        created_at=time.time(),
        project_id="proj_1",
        speaker_profile="Voice1"
    )
    mock_q.get.side_effect = ["mixed_job", Exception("StopLoop")]

    def fake_handler(*args, **kwargs):
        sample_job.synthesis_started_at = time.time() - 20
        sample_job.finished_at = time.time()
        sample_job.status = "done"
        return "done"

    with patch("app.jobs.worker.get_jobs", return_value={"mixed_job": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="B" * 2000), \
         patch("app.jobs.worker.handle_mixed_job", side_effect=fake_handler), \
         patch("app.jobs.worker_metrics.update_performance_metrics") as mock_update_perf, \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise e

        mock_update_perf.assert_called_once()
        assert "xtts_cps" in mock_update_perf.call_args.kwargs

def test_prediction_logic():
    # Test the calculation in jobs.py if we can
    # 20 chars at 10 cps = 2 + (1*3) + 4 = 9
    assert _estimate_seconds(20, 10) == 9
    assert _estimate_seconds(200, 10) == 20 + 3 + 4 # 27
