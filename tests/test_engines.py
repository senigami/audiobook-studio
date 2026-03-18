import pytest
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, ANY
from app.engines import (
    run_cmd_stream, wav_to_mp3, convert_to_wav, xtts_generate, 
    xtts_generate_script, get_audio_duration, get_speaker_latent_path,
    stitch_segments, terminate_all_subprocesses
)

@pytest.fixture
def mock_on_output():
    return MagicMock()

@pytest.fixture
def mock_cancel_check():
    return MagicMock(return_value=False)

def test_run_cmd_stream_success(mock_on_output, mock_cancel_check):
    with patch("subprocess.Popen") as mock_popen, \
         patch("selectors.DefaultSelector") as mock_selector:

        mock_proc = MagicMock()
        # Return characters then empty strings forever to avoid StopIteration
        mock_proc.stdout.read.side_effect = list("hello\n") + [""] * 100
        # Poll returns None then 0
        mock_proc.poll.side_effect = [None] * 6 + [0] * 100
        mock_proc.returncode = 0
        mock_popen.return_value = mock_proc

        mock_selector_inst = mock_selector.return_value
        mock_selector_inst.select.return_value = [True]

        rc = run_cmd_stream("test-cmd", mock_on_output, mock_cancel_check)

        assert rc == 0
        mock_on_output.assert_any_call("hello\n")

def test_assemble_audiobook(mock_on_output, mock_cancel_check):
    with patch("app.engines.run_cmd_stream", return_value=0), \
         patch("app.engines.get_audio_duration", return_value=5.0), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.write_text"), \
         patch("pathlib.Path.unlink"), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("os.listdir", return_value=["c1.wav"]):

        mock_stat.return_value.st_mtime = 1000

        from app.engines import assemble_audiobook
        rc = assemble_audiobook(
            input_folder=Path("/tmp/in"),
            book_title="Test Book",
            output_m4b=Path("/tmp/out.m4b"),
            on_output=mock_on_output,
            cancel_check=mock_cancel_check,
            author="Author",
            narrator="Narrator"
        )
        assert rc == 0

def test_generate_video_sample(mock_on_output, mock_cancel_check):
    with patch("app.engines.run_cmd_stream", return_value=0), \
         patch("pathlib.Path.exists", return_value=True):
        from app.engines import generate_video_sample
        rc = generate_video_sample(
            input_audio=Path("in.wav"),
            output_video=Path("out.mp4"),
            logo_path=Path("logo.png"),
            on_output=mock_on_output,
            cancel_check=mock_cancel_check
        )
        assert rc == 0

def test_run_cmd_stream_cancel(mock_on_output, mock_cancel_check):
    mock_cancel_check.return_value = True
    with patch("subprocess.Popen") as mock_popen, \
         patch("selectors.DefaultSelector"):
        mock_proc = MagicMock()
        mock_popen.return_value = mock_proc

        rc = run_cmd_stream("test-cmd", mock_on_output, mock_cancel_check)

        assert rc == 1
        mock_proc.terminate.assert_called_once()

def test_wav_to_mp3():
    with patch("app.engines.run_cmd_stream", return_value=0) as mock_run:
        rc = wav_to_mp3(Path("in.wav"), Path("out.mp3"))
        assert rc == 0
        mock_run.assert_called_once()
        assert "ffmpeg" in mock_run.call_args[0][0]

def test_xtts_generate_success(mock_on_output, mock_cancel_check):
    with patch("app.engines.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("app.engines.run_cmd_stream", return_value=0) as mock_run:
        mock_activate.exists.return_value = True

        rc = xtts_generate("Hello", Path("out.wav"), True, mock_on_output, mock_cancel_check, speaker_wav="spk.wav", voice_profile_dir=Path("/tmp/voices/VoiceA"))
        assert rc == 0
        assert "--voice_profile_dir" in mock_run.call_args[0][0]

def test_xtts_generate_voice_profile_only(mock_on_output, mock_cancel_check):
    with patch("app.engines.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("app.engines.run_cmd_stream", return_value=0) as mock_run:
        mock_activate.exists.return_value = True

        rc = xtts_generate(
            "Hello",
            Path("out.wav"),
            True,
            mock_on_output,
            mock_cancel_check,
            speaker_wav=None,
            voice_profile_dir=Path("/tmp/voices/VoiceA"),
        )
        assert rc == 0
        cmd = mock_run.call_args[0][0]
        assert "--speaker_wav" not in cmd
        assert "--voice_profile_dir" in cmd

def test_xtts_generate_no_activate(mock_on_output, mock_cancel_check):
    with patch("app.engines.XTTS_ENV_ACTIVATE") as mock_activate:
        mock_activate.exists.return_value = False
        rc = xtts_generate("Hello", Path("out.wav"), True, mock_on_output, mock_cancel_check, speaker_wav="spk.wav")
        assert rc == 1
        mock_on_output.assert_any_call("[error] XTTS activate not found: " + str(mock_activate) + "\n")

def test_get_audio_duration():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value.stdout = " 10.5 \n"
        d = get_audio_duration(Path("test.wav"))
        assert d == 10.5

def test_get_speaker_latent_path_multi():
    p = get_speaker_latent_path("v1.wav, v2.wav")
    assert p is not None


def test_migrate_speaker_latent_to_profile(tmp_path, monkeypatch):
    from app.engines import migrate_speaker_latent_to_profile

    legacy_latent = tmp_path / "legacy.pth"
    legacy_latent.write_text("legacy latent")
    profile_dir = tmp_path / "voices" / "VoiceA"

    monkeypatch.setattr("app.engines.get_speaker_latent_path", lambda *_args, **_kwargs: legacy_latent)

    migrated = migrate_speaker_latent_to_profile("ref.wav", profile_dir)
    assert migrated == profile_dir / "latent.pth"
    assert migrated.exists()
    assert migrated.read_text() == "legacy latent"

def test_assemble_audiobook_no_files(mock_on_output, mock_cancel_check):
    with patch("os.listdir", return_value=[]):
        from app.engines import assemble_audiobook
        rc = assemble_audiobook(Path("."), "Title", Path("out.m4b"), mock_on_output, mock_cancel_check)
        assert rc == 1
        mock_on_output.assert_any_call("No audio files found to combine.\n")

def test_assemble_audiobook_encode_fail(mock_on_output, mock_cancel_check):
    # side_effect for exists: [False] (m4a not there), then True for rest (files, cleanup)
    exists_vals = [False] + [True] * 50
    with patch("app.engines.run_cmd_stream", side_effect=[1]), \
         patch("app.engines.get_audio_duration", return_value=5.0), \
         patch("pathlib.Path.exists", side_effect=exists_vals), \
         patch("pathlib.Path.stat"), \
         patch("os.listdir", return_value=["c1.wav"]):

        from app.engines import assemble_audiobook
        rc = assemble_audiobook(Path("."), "Title", Path("out.m4b"), mock_on_output, mock_cancel_check)
        assert rc == 1

@pytest.fixture(autouse=True)
def mock_audio_ops():
    with patch("os.unlink", return_value=None), \
         patch("app.engines.XTTS_ENV_ACTIVATE") as mock_act:
        mock_act.exists.return_value = True
        yield

def test_generate_video_sample_no_audio(mock_on_output, mock_cancel_check):
    with patch("pathlib.Path.exists", return_value=False):
        from app.engines import generate_video_sample
        rc = generate_video_sample(Path("no.wav"), Path("out.mp4"), None, mock_on_output, mock_cancel_check)
        assert rc == 1

def test_generate_video_sample_no_logo(mock_on_output, mock_cancel_check):
    with patch("app.engines.run_cmd_stream", return_value=0), \
         patch("pathlib.Path.exists", side_effect=[True, False, True, True]):
        from app.engines import generate_video_sample
        rc = generate_video_sample(Path("in.wav"), Path("out.mp4"), Path("no-logo.png"), mock_on_output, mock_cancel_check)
        assert rc == 0

def test_stitch_segments_no_segs(mock_on_output, mock_cancel_check):
    rc = stitch_segments(Path("."), [], Path("out.wav"), mock_on_output, mock_cancel_check)
    assert rc == 1

def test_xtts_generate_raw_mode(mock_on_output, mock_cancel_check):
    with patch("app.engines.run_cmd_stream", return_value=0):
        rc = xtts_generate("Hello", Path("out.wav"), False, mock_on_output, mock_cancel_check, speaker_wav="spk.wav")
        assert rc == 0


def test_xtts_generate_script_includes_voice_profile_dir(mock_on_output, mock_cancel_check):
    with patch("app.engines.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("app.engines.run_cmd_stream", return_value=0) as mock_run:
        mock_activate.exists.return_value = True

        rc = xtts_generate_script(
            Path("script.json"),
            Path("out.wav"),
            mock_on_output,
            mock_cancel_check,
            speed=1.0,
            voice_profile_dir=Path("/tmp/voices/VoiceA"),
        )
        assert rc == 0
        assert "--voice_profile_dir" in mock_run.call_args[0][0]
        assert " . " in mock_run.call_args[0][0]
        assert " source " not in mock_run.call_args[0][0]


def test_xtts_inference_can_run_from_outside_repo(tmp_path):
    script = Path(__file__).resolve().parents[1] / "app" / "xtts_inference.py"
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        cwd=tmp_path,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0
    assert "XTTS Streaming Inference Script" in result.stdout

def test_get_speaker_latent_path_none():
    assert get_speaker_latent_path(None) is None
    assert get_speaker_latent_path("") is None


def test_get_speaker_latent_path_profile_scoped(tmp_path):
    profile_dir = tmp_path / "voices" / "VoiceA"
    profile_dir.mkdir(parents=True)
    path = get_speaker_latent_path("/tmp/reference.wav", voice_profile_dir=profile_dir)
    assert path == profile_dir / "latent.pth"

def test_get_audio_duration_fail():
    with patch("subprocess.run", side_effect=Exception("fail")):
        assert get_audio_duration(Path("fail.wav")) == 0.0

def test_assemble_audiobook_chapter_titles(mock_on_output, mock_cancel_check):
    with patch("app.engines.run_cmd_stream", return_value=0), \
         patch("app.engines.get_audio_duration", return_value=5.0), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.write_text"), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("os.listdir", return_value=["c1.wav"]):

        mock_stat.return_value.st_mtime = 1000
        from app.engines import assemble_audiobook
        titles = {"c1.txt": "Chapter 1 Title"}
        rc = assemble_audiobook(
            input_folder=Path("/tmp/in"),
            book_title="Test Book",
            output_m4b=Path("/tmp/out.m4b"),
            on_output=mock_on_output,
            cancel_check=mock_cancel_check,
            chapter_titles=titles
        )
        assert rc == 0

def test_run_cmd_stream_heartbeat(mock_on_output, mock_cancel_check):
    with patch("subprocess.Popen") as mock_popen, \
         patch("selectors.DefaultSelector") as mock_selector, \
         patch("time.time") as mock_time:

        mock_selector_inst = mock_selector.return_value
        mock_selector_inst.select.return_value = []
        mock_time.side_effect = [1000.0, 1002.0, 1004.0, 1006.0, 1008.0, 1010.0]

        mock_proc = MagicMock()
        mock_proc.poll.side_effect = [None, 0]
        mock_popen.return_value = mock_proc

        run_cmd_stream("cmd", mock_on_output, mock_cancel_check)
        mock_on_output.assert_any_call("")

def test_terminate_all_subprocesses():
    from app.engines import _active_processes
    mock_proc = MagicMock()
    _active_processes.add(mock_proc)
    terminate_all_subprocesses()
    mock_proc.terminate.assert_called_once()
    assert len(_active_processes) == 0
