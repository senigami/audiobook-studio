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
        {"id": "s1", "character_id": "c1", "text_content": "Text 1", "audio_status": "done", "audio_file_path": "chunk_s1.wav"},
        {"id": "s2", "character_id": "c1", "text_content": "Text 2", "audio_status": "unprocessed", "audio_file_path": None}
    ]

    # Create the done segment file
    (pdir / "chunk_s1.wav").write_text("audio")
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
                on_output("[SEGMENT_SAVED] " + str(pdir / "chunk_s2.wav"))
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

    captured = {}

    def inspect_script(*args, **kwargs):
        script_path = kwargs["script_json_path"]
        captured["script"] = json.loads(Path(script_path).read_text())
        return 0

    with patch("app.db.get_chapter_segments", return_value=all_segs), \
         patch("app.db.update_segment") as mock_update_seg, \
         patch("app.db.get_connection"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", side_effect=inspect_script) as mock_gen_script, \
         patch("app.jobs.handlers.xtts.update_job") as mock_update_job:

        handle_xtts_job(
            "test_job", mock_job, time.time(), 
            print, lambda: False, "default.wav", 1.0, 
            pdir, out_wav, out_mp3
        )

        assert mock_update_job.called
        assert captured["script"][0]["save_path"].endswith("/chunk_s1.wav")


def test_handle_xtts_job_segments_uses_default_voice_profile_dir_for_narrator(mock_job, tmp_path):
    mock_job.segment_ids = ["s1"]
    mock_job.speaker_profile = "Senigami"
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"
    captured = {}

    all_segs = [
        {
            "id": "s1",
            "character_id": None,
            "speaker_profile_name": None,
            "text_content": "Narrator text.",
            "audio_status": "unprocessed",
        }
    ]

    def inspect_script(*args, **kwargs):
        script_path = kwargs["script_json_path"]
        captured["script"] = json.loads(Path(script_path).read_text())
        return 0

    with patch("app.db.get_chapter_segments", return_value=all_segs), \
         patch("app.db.update_segment"), \
         patch("app.db.get_connection"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", side_effect=inspect_script), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.jobs.handlers.xtts.get_speaker_wavs", return_value=None), \
         patch("app.jobs.handlers.xtts.get_voice_profile_dir", return_value=Path("/tmp/voices/Senigami")):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, None, 1.0,
            pdir, out_wav, out_mp3
        )

    assert captured["script"][0]["voice_profile_dir"] == "/tmp/voices/Senigami"
    assert captured["script"][0]["speaker_wav"] is None


def test_handle_xtts_job_standard_mixed_latent_only_profiles_builds_script(mock_job, tmp_path):
    mock_job.segment_ids = None
    mock_job.speaker_profile = "Senigami"
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"
    captured = {}

    def inspect_script(*args, **kwargs):
        script_path = kwargs["script_json_path"]
        captured["script"] = json.loads(Path(script_path).read_text())
        for entry in captured["script"]:
            save_path = Path(entry["save_path"])
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_text("chunk")
        return 0

    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "n1", "text_content": "Narrator one.", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
            {"id": "n2", "text_content": "Narrator two.", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
            {"id": "c1", "text_content": "Character line.", "character_id": "char1", "speaker_profile_name": "Old Man - Angry", "character_speaker_profile_name": "Old Man - Angry", "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.update_segments_status_bulk"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", side_effect=inspect_script), \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (out_wav.write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.jobs.handlers.xtts.get_speaker_wavs", return_value=None), \
         patch("app.jobs.handlers.xtts.get_voice_profile_dir", side_effect=lambda name: Path(f"/tmp/voices/{name}")):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, None, 1.0,
            pdir, out_wav, out_mp3, text="Fallback text"
        )

    assert len(captured["script"]) == 2
    assert "Narrator one" in captured["script"][0]["text"]
    assert "Narrator two" in captured["script"][0]["text"]
    assert captured["script"][0]["save_path"].endswith("/chunk_n1.wav")
    assert captured["script"][0]["voice_profile_dir"] == "/tmp/voices/Senigami"
    assert captured["script"][0]["speaker_wav"] is None
    assert captured["script"][1]["text"] == "Character line."
    assert captured["script"][1]["save_path"].endswith("/chunk_c1.wav")
    assert captured["script"][1]["voice_profile_dir"] == "/tmp/voices/Old Man - Angry"
    assert captured["script"][1]["speaker_wav"] is None

def test_handle_xtts_job_standard_with_mp3(mock_job, tmp_path):
    mock_job.make_mp3 = True
    pdir = tmp_path / "project"
    pdir.mkdir()
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"
    out_wav.write_text("wav")
    out_mp3.write_text("mp3")

    def inspect_script(*args, **kwargs):
        script_path = kwargs["script_json_path"]
        script = json.loads(Path(script_path).read_text())
        for entry in script:
            Path(entry["save_path"]).write_text("chunk")
        return 0

    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection") as mock_conn, \
         patch("app.db.update_segments_status_bulk"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", side_effect=inspect_script), \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (out_wav.write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.wav_to_mp3", return_value=0), \
         patch("app.jobs.handlers.xtts.update_job") as mock_update_job:

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, "default.wav", 1.0, 
            pdir, out_wav, out_mp3, text="Hello"
        )

        # Verify status became 'done'
        mock_update_job.assert_any_call("test_job", status="done", finished_at=ANY, progress=1.0, output_wav="output.wav", output_mp3="output.mp3")


def test_handle_xtts_job_creates_missing_project_audio_dir(mock_job, tmp_path):
    mock_job.speaker_profile = "Senigami"
    pdir = tmp_path / "missing-project-audio"
    out_wav = pdir / "output.wav"
    out_mp3 = pdir / "output.mp3"
    captured = {}

    def inspect_script(*args, **kwargs):
        script_path = kwargs["script_json_path"]
        captured["script_path"] = Path(script_path)
        script = json.loads(captured["script_path"].read_text())
        for entry in script:
            Path(entry["save_path"]).write_text("chunk")
        return 0

    with patch("app.jobs.handlers.xtts.load_chunk_segments", return_value=[
            {"id": "s1", "text_content": "Hello", "character_id": None, "speaker_profile_name": None, "character_speaker_profile_name": None, "audio_status": "unprocessed", "audio_file_path": None},
        ]), \
         patch("app.db.get_connection") as mock_conn, \
         patch("app.db.update_segments_status_bulk"), \
         patch("app.db.update_segment"), \
         patch("app.jobs.handlers.xtts.xtts_generate_script", side_effect=inspect_script), \
         patch("app.jobs.handlers.xtts.stitch_segments", side_effect=lambda *_args, **_kwargs: (out_wav.write_text("wav"), 0)[1]), \
         patch("app.jobs.handlers.xtts.update_job"), \
         patch("app.jobs.handlers.xtts.get_speaker_wavs", return_value=None), \
         patch("app.jobs.handlers.xtts.get_voice_profile_dir", return_value=Path("/tmp/voices/Senigami")):

        handle_xtts_job(
            "test_job", mock_job, time.time(),
            print, lambda: False, None, 1.0,
            pdir, out_wav, out_mp3, text="Hello"
        )

    assert pdir.exists()
    assert captured["script_path"].parent == pdir

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
