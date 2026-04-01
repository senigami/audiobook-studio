import pytest
import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
from app.jobs.handlers.xtts import handle_xtts_job, _group_job_progress
from app.models import Job

@pytest.fixture(autouse=True)
def mock_path_methods():
    with patch("pathlib.Path.write_text"), \
         patch("pathlib.Path.unlink"), \
         patch("pathlib.Path.exists", return_value=True):
        yield

@pytest.fixture
def mock_job():
    return Job(
        id="test_jid",
        engine="xtts",
        chapter_file="c1.wav",
        chapter_id="chap_123",
        status="running",
        is_bake=False,
        segment_ids=None,
        safe_mode=True,
        make_mp3=True,
        created_at=time.time()
    )

@pytest.fixture
def mock_params():
    return {
        "jid": "test_jid",
        "start": time.time(),
        "on_output": MagicMock(),
        "cancel_check": MagicMock(return_value=False),
        "default_sw": "default.wav",
        "speed": 1.0,
        "pdir": Path("/tmp/xtts"),
        "out_wav": Path("/tmp/xtts/c1.wav"),
        "out_mp3": Path("/tmp/xtts/c1.mp3"),
        "text": "Fallback text"
    }

def test_handle_xtts_standard_full(mock_job, mock_params):
    """Test standard chapter generation path."""
    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": "char1", "speaker_profile_name": "Narrator", "character_speaker_profile_name": "Narrator", "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.get_speaker_wavs", return_value="spk.wav"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.wav_to_mp3", return_value=0), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        assert mock_job.status == "running"

def test_handle_xtts_bake_mode(mock_job, mock_params):
    """Test chapter baking path."""
    mock_job.is_bake = True

    segs = [
        {"id": "1", "text_content": "T1", "audio_status": "done", "audio_file_path": "s1.wav", "character_id": "c1"},
        {"id": "2", "text_content": "T2", "audio_status": "queued", "audio_file_path": None, "character_id": "c1"}
    ]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.stitch_segments", return_value=0), \
         patch("app.jobs.handlers.xtts.wav_to_mp3", return_value=0), \
         patch("app.jobs.handlers.xtts.get_audio_duration", return_value=10.0), \
         patch("app.db.update_queue_item"), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.jobs.handlers.xtts.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(j=mock_job, **mock_params)
        mock_params["on_output"].assert_any_call("Baking Chapter chap_123 starting...\n")

def test_handle_xtts_segments_mode(mock_job, mock_params):
    """Test specific segments generation path."""
    mock_job.segment_ids = ["seg1"]
    segs = [{"id": "seg1", "text_content": "T1", "character_id": "c1", "speaker_profile_name": "S1"}]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.jobs.handlers.xtts.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(j=mock_job, **mock_params)

def test_handle_xtts_cancel(mock_job, mock_params):
    """Test cancellation check."""
    mock_params["cancel_check"].return_value = True

    with patch("app.jobs.handlers.xtts.update_job") as mock_update:
        handle_xtts_job(j=mock_job, **mock_params)

def test_handle_xtts_failed_stitch(mock_job, mock_params):
    """Test baking failure during stitch."""
    mock_job.is_bake = True
    segs = [{"id": "1", "text_content": "T1", "audio_status": "done", "audio_file_path": "s1.wav", "character_id": "c1"}]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("app.jobs.handlers.xtts.stitch_segments", return_value=1), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update:

        handle_xtts_job(j=mock_job, **mock_params)
        mock_update.assert_any_call(mock_params["jid"], status="failed", error="Stitching failed (rc=1)")

def test_handle_xtts_no_mp3(mock_job, mock_params):
    """Test standard path without MP3 conversion."""
    mock_job.make_mp3 = False
    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update, \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        # Check if done was called at least once
        done_calls = [c for c in mock_update.call_args_list if c[1].get('status') == 'done']
        assert len(done_calls) > 0
        assert done_calls[0][1]['progress'] == 1.0

def test_handle_xtts_empty_segments(mock_job, mock_params):
    """Test segment mode with empty list after filtering."""
    mock_job.segment_ids = [999] # Non-empty to enter elif
    with patch("app.db.get_chapter_segments", return_value=[]), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update:
        handle_xtts_job(j=mock_job, **mock_params)
        # Empty segs_to_gen calls update_job with status="done"
        mock_update.assert_any_call("test_jid", status="done", progress=1.0)

def test_handle_xtts_mp3_fail(mock_job, mock_params):
    """Test path where MP3 conversion fails."""
    mock_job.make_mp3 = True
    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0), \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.wav_to_mp3", return_value=1), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update, \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        # Should finish with error message but status="done"
        error_done_calls = [c for c in mock_update.call_args_list if c[1].get('status') == 'done' and 'error' in c[1]]
        assert len(error_done_calls) > 0
        assert "MP3 conversion failed" in error_done_calls[0][1]['error']

def test_handle_xtts_no_custom_segments(mock_job, mock_params):
    """Test standard chapter generation when no segments have custom characters."""
    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", return_value=0) as mock_gen, \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.wav_to_mp3", return_value=0), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        assert mock_gen.called


def test_group_job_progress_blends_active_segment_into_total_progress():
    assert _group_job_progress(0, 4, 0.5, limit=0.9) == 0.11
    assert _group_job_progress(2, 4, 0.75, limit=0.9) == 0.62
    assert _group_job_progress(1, 2, 1.0, limit=1.0) == 1.0
