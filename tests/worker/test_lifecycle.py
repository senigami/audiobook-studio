import time
import pytest
from unittest.mock import patch
from pathlib import Path
from app.models import Job
from app.jobs.worker import worker_loop

def test_worker_loop_skipped_or_failed(mock_q, sample_job):
    """Test skipped and failed scenarios in worker_loop."""
    # 1. Skipped (output exists)
    mock_q.get.side_effect = ["test_job_1", "test_job_2", Exception("Stop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job, "test_job_2": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.jobs.worker._output_exists", side_effect=[True, False]):

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

def test_worker_loop_crash(mock_q):
    """Test the top-level exception handler in worker_loop."""
    mock_q.get.side_effect = ["test_job_1"]

    with patch("app.jobs.worker.get_jobs", side_effect=Exception("Fatal Error")), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker_helpers.update_job") as mock_update_helper:

        with patch("app.jobs.worker.traceback.format_exc", return_value="stacktrace"):
            try:
                # Use side effect to stop after the catch
                mock_q.get.side_effect = ["test_job_1", Exception("Stop")]
                worker_loop(mock_q)
            except Exception as e:
                if str(e) != "Stop": raise e

        # Check that update_job was called with status="failed"
        mock_update_helper.assert_any_call("test_job_1", status="failed", finished_at=pytest.approx(time.time(), abs=2), progress=1.0, error="Worker crashed.")
