from unittest.mock import patch
from pathlib import Path
from app.jobs.worker import worker_loop

def test_worker_loop_resumption(mock_q, sample_job):
    """Test job resumption progress and ETA adjustment."""
    mock_q.get.side_effect = ["test_job_1", Exception("StopLoop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job") as mock_update, \
         patch("app.jobs.worker.get_performance_metrics", return_value={"xtts_cps": 10.0}), \
         patch("app.jobs.worker.get_project_text_dir", create=True) as mock_text_dir, \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="A" * 1000), \
         patch("app.jobs.worker._calculate_group_resume_state", return_value=(0.67, 2, 3)), \
         patch("app.jobs.worker.handle_xtts_job"), \
         patch("app.jobs.worker._output_exists", return_value=False):

        mock_text_dir.return_value = Path("/tmp")

        try:
            worker_loop(mock_q)
        except Exception as e:
            if str(e) != "StopLoop": raise e

        # Find the call to update_job with initial state
        prep_call = [c for c in mock_update.call_args_list if c.kwargs.get('status') == "preparing"][0]
        assert prep_call.kwargs['progress'] == 0.0
        assert prep_call.kwargs['started_at'] is None
        assert prep_call.kwargs['completed_render_groups'] == 2
        assert prep_call.kwargs['render_group_count'] == 3
        assert prep_call.kwargs['active_render_group_index'] == 0

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

def test_worker_loop_observable_fallback_on_db_error(mock_q, caplog, sample_job):
    """Fallback paths should be observable via DEBUG logging when DB fails."""
    mock_q.get.side_effect = ["test_job_1", Exception("Stop")]

    with patch("app.jobs.worker.get_jobs", return_value={"test_job_1": sample_job}), \
         patch("app.jobs.worker.update_job"), \
         patch("app.jobs.worker.get_project_text_dir", create=True, return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.read_text", return_value="Hello"), \
         patch("app.jobs.worker.get_performance_metrics", return_value={}), \
         patch("app.db.chapters.get_chapter_segments_counts", side_effect=Exception("DB Failure Simulation")), \
         patch("app.jobs.worker.handle_xtts_job"), \
         patch("app.jobs.worker._output_exists", return_value=False):

        import logging
        with caplog.at_level(logging.DEBUG):
            try:
                worker_loop(mock_q)
            except Exception as e:
                if str(e) != "Stop": raise e

        # Assert that the specific debug log for ETA fallback was triggered
        assert "Failed to calculate segment count from DB for ETA" in caplog.text
        assert "DB Failure Simulation" in caplog.text
