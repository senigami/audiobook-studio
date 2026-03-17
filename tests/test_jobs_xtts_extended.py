import pytest
import json
import time
from pathlib import Path
from unittest.mock import patch, MagicMock, ANY
from app.jobs.handlers.xtts import handle_xtts_job
from app.models import Job

@pytest.fixture
def mock_job():
    return Job(
        id="test_job",
        engine="xtts",
        chapter_file="chapter.txt",
        status="running",
        project_id="proj1",
        chapter_id="chap1",
        created_at=time.time()
    )

def test_handle_xtts_job_bake(mock_job, tmp_path):
    mock_job.is_bake = True
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    segs = [
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "done", "audio_file_path": "seg_s1.wav"},
        {"id": "s2", "character_id": "c1", "text_content": "Text 2", "audio_status": "unprocessed", "audio_file_path": None}
    ]

    # Create the done segment file
    (pdir / "seg_s1.wav").write_text("audio")
    # Also create the output wav so exists() returns true
    out_wav.write_text("output")

    # Local imports in handle_xtts_job: patch the source (app.db)
    # Module imports in xtts.py: patch the target module (app.jobs.handlers.xtts)
    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("app.db.update_segment") as mock_update_seg, \
         patch("app.db.get_connection"), \
         patch("app.db.update_queue_item") as mock_update_queue, \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0) as mock_gen_script, \
         patch("app.jobs.handlers.xtts.stitch_segments", return_value=0) as mock_stitch, \
         patch("app.jobs.handlers.xtts.get_audio_duration", return_value=10.0) as mock_duration, \
         patch("app.jobs.handlers.xtts.update_job") as mock_update_job:

        # Simulate xtts_generate_script progress
        def side_effect(*args, **kwargs):
            on_output = kwargs.get("on_output")
            if on_output:
                on_output("[SEGMENT_SAVED] " + str(pdir / "seg_s2.wav"))
            return 0
        mock_gen_script.side_effect = side_effect

        handle_xtts_job(
            "test_job", mock_job, time.time(), 
            print, lambda: False, "default.wav", 1.0, 
            pdir, out_wav, out_mp3
        )

        assert mock_gen_script.called
        assert mock_stitch.called
        mock_update_queue.assert_called_with("test_job", "done", audio_length_seconds=10.0)

def test_handle_xtts_job_segments(mock_job, tmp_path):
    mock_job.segment_ids = ["s1"]
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    all_segs = [
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "unprocessed"}
    ]

    with patch("app.db.get_chapter_segments", return_value=all_segs), \
         patch("app.db.update_segment") as mock_update_seg, \
         patch("app.db.get_connection"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0) as mock_gen_script, \
         patch("app.jobs.handlers.xtts.update_job") as mock_update_job:

        handle_xtts_job(
            "test_job", mock_job, time.time(), 
            print, lambda: False, "default.wav", 1.0, 
            pdir, out_wav, out_mp3
        )

        assert mock_update_job.called

def test_handle_xtts_job_standard_with_mp3(mock_job, tmp_path):
    mock_job.make_mp3 = True
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"
    out_wav.write_text("wav")
    out_mp3.write_text("mp3")

    with patch("app.db.get_connection") as mock_conn, \
         patch("app.db.update_segments_status_bulk"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.wav_to_mp3", return_value=0), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update_job:

        cursor = mock_conn.return_value.__enter__.return_value.cursor.return_value
        cursor.fetchall.side_effect = [
            [], # segments_data
            [{"id": "s1"}] # sids
        ]

        handle_xtts_job(
            "test_job", mock_job, time.time(), 
            print, lambda: False, "default.wav", 1.0, 
            pdir, out_wav, out_mp3, text="Hello"
        )

        # Verify status became 'done'
        mock_update_job.assert_any_call("test_job", status="done", finished_at=ANY, progress=1.0, output_wav="output.wav", output_mp3="output.mp3")

def test_handle_xtts_job_cancel(mock_job, tmp_path):
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    with patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update_job:

        handle_xtts_job(
            "test_job", mock_job, time.time(), 
            print, lambda: True, "default.wav", 1.0, 
            pdir, out_wav, out_mp3, text="Hello"
        )

        mock_update_job.assert_any_call("test_job", status="cancelled", finished_at=ANY, progress=1.0, error="Cancelled.")
