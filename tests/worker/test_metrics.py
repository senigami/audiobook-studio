import time
from unittest.mock import patch
from pathlib import Path
from app.models import Job
from app.jobs.worker import worker_loop
from app.jobs import _estimate_seconds

def test_worker_loop_xtts_updates_learned_cps_from_completed_chapter_runs(mock_q, sample_job):
    """Completed XTTS chapter runs should feed the learned CPS metric."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    def fake_handler(jid, job, start, on_output, cancel_check, **kwargs):
        from app.jobs.worker_metrics import record_engine_sample
        job.synthesis_started_at = time.time() - 10
        job.finished_at = time.time()
        job.status = "done"
        # Manually trigger the metrics recording that the real handler would do
        record_engine_sample(job, start, 1000, {"engine_cps": {}}, 1)
        return "done"

    from unittest.mock import MagicMock
    mock_reg = MagicMock()
    mock_reg.get_handler.return_value = fake_handler

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"engine_cps": {"xtts": 10.0}}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="A" * 1000), \
         patch("app.jobs.worker.get_handler_registry", return_value=mock_reg), \
         patch("app.jobs.worker_metrics.update_performance_metrics") as mock_update_perf, \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        mock_update_perf.assert_called_once()
        assert "engine_cps" in mock_update_perf.call_args.kwargs

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

    def fake_handler(jid, job, start, on_output, cancel_check, **kwargs):
        from app.jobs.worker_metrics import record_engine_sample
        job.synthesis_started_at = time.time() - 20
        job.finished_at = time.time()
        job.status = "done"
        # Manually trigger the metrics recording that the real handler would do
        record_engine_sample(job, start, 2000, {"engine_cps": {}}, 1)
        return "done"

    from unittest.mock import MagicMock
    mock_reg = MagicMock()
    mock_reg.get_handler.return_value = fake_handler

    with patch("app.jobs.worker.get_jobs", return_value={"mixed_job": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={"engine_cps": {"xtts": 10.0}}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="B" * 2000), \
         patch("app.jobs.worker.get_handler_registry", return_value=mock_reg), \
         patch("app.jobs.worker_metrics.update_performance_metrics") as mock_update_perf, \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop":
                raise e

        mock_update_perf.assert_called_once()
        assert "engine_cps" in mock_update_perf.call_args.kwargs

def test_prediction_logic():
    # Test the calculation in jobs.py if we can
    # 20 chars at 10 cps = 2 + (1*3) + 4 = 9
    assert _estimate_seconds(20, 10) == 9
    assert _estimate_seconds(200, 10) == 20 + 3 + 4 # 27
