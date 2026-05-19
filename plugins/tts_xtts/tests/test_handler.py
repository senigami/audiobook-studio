import os
import pytest
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
from plugins.tts_xtts.plugin.studio import handler as xtts_handler
from plugins.tts_xtts.plugin.studio.handler import handle_xtts_job, _group_job_progress
from app.db.models import Job

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
    with patch("plugins.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": "char1", "speaker_profile_name": "Narrator", "character_speaker_profile_name": "Narrator", "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"), \
         patch("plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("plugins.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        assert mock_job.status == "running"


def test_xtts_handler_exports_logger():
    assert hasattr(xtts_handler, "logger")

def test_handle_xtts_bake_mode(mock_job, mock_params):
    """Test chapter baking path."""
    mock_job.is_bake = True

    segs = [
        {"id": "1", "text_content": "T1", "audio_status": "done", "audio_file_path": "s1.wav", "character_id": "c1"},
        {"id": "2", "text_content": "T2", "audio_status": "queued", "audio_file_path": None, "character_id": "c1"}
    ]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("plugins.tts_xtts.plugin.studio.bake.generate_via_bridge", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_audio_duration", return_value=10.0), \
         patch("app.db.update_queue_item"), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(j=mock_job, **mock_params)
        mock_params["on_output"].assert_any_call("Baking Chapter chap_123 starting...\n")

def test_handle_xtts_bake_recovers_single_segment_output_when_stitch_leaves_no_file(mock_job, mock_params, tmp_path):
    """A successful stitch should still yield a chapter file even if the stitch helper does not materialize it."""
    mock_job.is_bake = True
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    segs = [
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "unprocessed", "audio_file_path": None},
    ]

    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    (pdir / "segments" / "s1.wav").write_bytes(b"audio")

    def update_segment_side_effect(segment_id, broadcast=True, **updates):
        for segment in segs:
            if segment["id"] == segment_id:
                segment.update(updates)
                break
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if on_output:
            on_output("[SEGMENT_SAVED] " + str(pdir / "segments" / "s1.wav"))
        return 0

    def path_exists(self):
        return os.path.exists(self)

    with patch("pathlib.Path.exists", new=path_exists), \
         patch("app.db.get_chapter_segments", side_effect=lambda chapter_id: segs), \
         patch("app.db.update_segment", side_effect=update_segment_side_effect), \
         patch("app.db.get_connection"), \
         patch("app.db.update_queue_item") as mock_update_queue, \
         patch("plugins.tts_xtts.plugin.studio.bake.generate_via_bridge", side_effect=generate_side_effect), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_audio_duration", return_value=10.0), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, "default.wav", 1.0,
            pdir, out_wav, out_mp3
        )

    assert out_wav.exists()
    mock_update_queue.assert_called_with("test_job", "done", audio_length_seconds=10.0, output_file="output.wav")

def test_handle_xtts_standard_recovers_single_segment_output_when_stitch_leaves_no_file(mock_job, mock_params, tmp_path):
    """The standard chapter path should also keep a successful single-segment stitch."""
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"

    segs = [
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "unprocessed", "audio_file_path": None},
    ]

    (pdir / "segments").mkdir(parents=True, exist_ok=True)
    (pdir / "segments" / "s1.wav").write_bytes(b"audio")

    def update_segment_side_effect(segment_id, broadcast=True, **updates):
        for segment in segs:
            if segment["id"] == segment_id:
                segment.update(updates)
                break
        return True

    def generate_side_effect(**kwargs):
        on_output = kwargs.get("on_output")
        if on_output:
            on_output("[SEGMENT_SAVED] " + str(pdir / "segments" / "s1.wav"))
        return 0

    def path_exists(self):
        return os.path.exists(self)

    with patch("pathlib.Path.exists", new=path_exists), \
         patch("app.db.get_chapter_segments", side_effect=lambda chapter_id: segs), \
         patch("app.db.update_segment", side_effect=update_segment_side_effect), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segments_status_bulk"), \
         patch("plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", side_effect=generate_side_effect), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_audio_duration", return_value=10.0), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, "default.wav", 1.0,
            pdir, out_wav, out_mp3, text="Fallback text"
        )

    assert out_wav.exists()

def test_handle_xtts_segments_mode(mock_job, mock_params):
    """Test specific segments generation path."""
    mock_job.segment_ids = ["seg1"]
    segs = [{"id": "seg1", "text_content": "T1", "character_id": "c1", "speaker_profile_name": "S1"}]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("plugins.tts_xtts.plugin.studio.segments.generate_via_bridge", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
         patch("plugins.tts_xtts.plugin.studio.handler.get_speaker_wavs", return_value="spk.wav"):

        handle_xtts_job(j=mock_job, **mock_params)

def test_handle_xtts_cancel(mock_job, mock_params):
    """Test cancellation check."""
    mock_params["cancel_check"].return_value = True

    with patch("plugins.tts_xtts.plugin.studio.handler.update_job") as mock_update:
        handle_xtts_job(j=mock_job, **mock_params)

def test_handle_xtts_failed_stitch(mock_job, mock_params):
    """Test baking failure during stitch."""
    mock_job.is_bake = True
    segs = [{"id": "1", "text_content": "T1", "audio_status": "done", "audio_file_path": "s1.wav", "character_id": "c1"}]

    with patch("app.db.get_chapter_segments", return_value=segs), \
         patch("plugins.tts_xtts.plugin.studio.bake.generate_via_bridge", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", return_value=1), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job") as mock_update:

        handle_xtts_job(j=mock_job, **mock_params)
        mock_update.assert_any_call(mock_params["jid"], status="failed", error="Stitching failed (rc=1)")

def test_handle_xtts_no_mp3(mock_job, mock_params):
    """Test standard path without MP3 conversion."""
    mock_job.make_mp3 = False
    with patch("plugins.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job") as mock_update, \
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
         patch("plugins.tts_xtts.plugin.studio.handler.update_job") as mock_update:
        handle_xtts_job(j=mock_job, **mock_params)
        # Empty segs_to_gen calls update_job with status="done"
        mock_update.assert_any_call("test_jid", status="done", progress=1.0)

def test_handle_xtts_mp3_fail(mock_job, mock_params):
    """Test path where MP3 conversion fails."""
    mock_job.make_mp3 = True
    with patch("plugins.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("plugins.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=1), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job") as mock_update, \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        # Should finish with error message but status="done"
        error_done_calls = [c for c in mock_update.call_args_list if c[1].get('status') == 'done' and 'error' in c[1]]
        assert len(error_done_calls) > 0
        assert "MP3 conversion failed" in error_done_calls[0][1]['error']

def test_handle_xtts_no_custom_segments(mock_job, mock_params):
    """Test standard chapter generation when no segments have custom characters."""
    with patch("plugins.tts_xtts.plugin.studio.handler.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection"), \
         patch("app.db.update_segment"), \
         patch("plugins.tts_xtts.plugin.studio.standard_handler.generate_via_bridge", return_value=0) as mock_gen, \
         patch("plugins.tts_xtts.plugin.studio.handler.stitch_segments", side_effect=lambda *_args, **_kwargs: (mock_params["out_wav"].write_text("wav"), 0)[1]), \
         patch("plugins.tts_xtts.plugin.studio.handler.wav_to_mp3", return_value=0), \
         patch("plugins.tts_xtts.plugin.studio.handler.update_job"), \
         patch("app.db.update_segments_status_bulk"):
        handle_xtts_job(j=mock_job, **mock_params)
        assert mock_gen.called


def test_group_job_progress_blends_active_segment_into_total_progress():
    assert _group_job_progress(0, 4, 0.5, limit=0.9) == 0.11
    assert _group_job_progress(2, 4, 0.75, limit=0.9) == 0.62
    assert _group_job_progress(1, 2, 1.0, limit=1.0) == 1.0


def test_group_job_progress_tracks_render_group_units():
    assert _group_job_progress(0, 2, 0.5, limit=0.9) == 0.23
    assert _group_job_progress(1, 2, 0.5, limit=0.9) == 0.68


def test_group_job_progress_weights_short_groups_less():
    assert _group_job_progress(1, 3, 0.0, limit=0.9, group_weights=[500, 450, 50]) == 0.45
    assert _group_job_progress(2, 3, 0.0, limit=0.9, group_weights=[500, 450, 50]) == 0.85
    assert _group_job_progress(2, 3, 0.5, limit=0.9, group_weights=[500, 450, 50]) == 0.88
