import time
from unittest.mock import patch
from pathlib import Path
from app.jobs.worker import worker_loop
from app.state import update_job

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
         patch("app.jobs.worker.get_speaker_settings", return_value={"speed": 1.0}):

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
        start_synthesis_call = mock_update.call_args_list[-1]
        assert start_synthesis_call.kwargs["status"] == "running"
        assert start_synthesis_call.kwargs["progress"] == 0.0

        # Repeated group starts must not reseed the chapter run.
        mock_update.reset_mock()
        previous_started_at = sample_job.started_at
        on_out("[START_SYNTHESIS]")
        mock_update.assert_not_called()
        assert sample_job.started_at == previous_started_at

        # Generic tqdm-style percentages should not be treated as authoritative job progress.
        mock_update.reset_mock()
        sample_job.synthesis_started_at = time.time()
        on_out("Processing | 50% [########    ]")
        assert sample_job.progress == 0.0
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

def test_worker_progress_update():
    from app.models import Job
    from app.state import put_job, add_job_listener
    # 1. Create a dummy job
    jid = "test_progress_job"
    j = Job(
        id=jid,
        engine="xtts",
        chapter_file="nonexistent.txt",
        status="queued",
        created_at=time.time(),
        progress=0.0
    )
    put_job(j)

    updates_received = []
    def listener(job_id, updates):
        if job_id == jid:
            updates_received.append(updates)

    add_job_listener(listener)

    # Simulate what on_output does
    update_job(jid, progress=0.25)

    assert len(updates_received) > 0
    assert updates_received[0]["progress"] == 0.25
