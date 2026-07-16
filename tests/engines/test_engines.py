import pytest
import os
import signal
import subprocess
import sys
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch, ANY
from app.engines.proc_utils import (
    run_cmd_stream,
    _active_processes,
    terminate_all_subprocesses,
    cleanup_orphaned_tts_server_processes,
    write_tts_server_runtime_marker,
    load_tts_server_runtime_marker,
    clear_tts_server_runtime_marker,
)
from app.engines.audio_ops import wav_to_mp3, convert_to_wav, get_audio_duration, stitch_segments, _ffmpeg_concat_entry
from app.engines.audiobook_utils import _create_temp_manifest

@pytest.fixture
def mock_on_output():
    return MagicMock()

@pytest.fixture
def mock_cancel_check():
    return MagicMock(return_value=False)

def test_run_cmd_stream_success(mock_on_output, mock_cancel_check):
    with patch("subprocess.Popen") as mock_popen:

        mock_proc = MagicMock()
        # Return characters then empty strings forever to avoid StopIteration
        mock_proc.stdout.read.side_effect = list("hello\n") + [""] * 100
        # Poll returns None then 0
        mock_proc.poll.side_effect = [None] * 6 + [0] * 100
        mock_proc.returncode = 0
        mock_popen.return_value = mock_proc

        rc = run_cmd_stream("test-cmd", mock_on_output, mock_cancel_check)

        assert rc == 0
        mock_on_output.assert_any_call("hello\n")

def test_assemble_audiobook(mock_on_output, mock_cancel_check):
    with patch("app.engines.proc_utils.run_cmd_stream", return_value=0), \
         patch("app.engines.audio_ops.get_audio_duration", return_value=5.0), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.write_text"), \
         patch("pathlib.Path.unlink"), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("os.listdir", return_value=["c1.wav"]):

        mock_stat.return_value.st_mtime = 1000

        from app.engines.audiobook_utils import assemble_audiobook
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
    with patch("app.engines.proc_utils.run_cmd_stream", return_value=0), \
         patch("pathlib.Path.exists", return_value=True):
        from app.engines.video_utils import generate_video_sample
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
    with patch("subprocess.Popen") as mock_popen:
        mock_proc = MagicMock()
        mock_popen.return_value = mock_proc

        rc = run_cmd_stream("test-cmd", mock_on_output, mock_cancel_check)

        assert rc == 1
        mock_proc.terminate.assert_called_once()

def test_wav_to_mp3():
    with patch("app.engines.proc_utils.run_cmd_stream", return_value=0) as mock_run:
        rc = wav_to_mp3(Path("in.wav"), Path("out.mp3"))
        assert rc == 0
        mock_run.assert_called_once()
        assert "ffmpeg" in mock_run.call_args[0][0]


def test_get_audio_duration():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value.stdout = " 10.5 \n"
        d = get_audio_duration(Path("test.wav"))
        assert d == 10.5


def test_convert_to_wav_passes_timeout():
    with patch("app.engines.audio_ops.subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        rc = convert_to_wav(Path("in.mp3"), Path("out.wav"))
        assert rc == 0
        _, kwargs = mock_run.call_args
        assert kwargs.get("timeout") == 300


def test_convert_to_wav_surfaces_clean_error_on_timeout():
    """BP-2: a wedged ffmpeg must never hang the caller forever — a
    subprocess.TimeoutExpired must be caught and surfaced as a clean failure
    (non-zero return code), not an unhandled exception."""
    with patch("app.engines.audio_ops.subprocess.run") as mock_run:
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="ffmpeg", timeout=300)
        rc = convert_to_wav(Path("in.mp3"), Path("out.wav"))
        assert rc != 0


def test_create_temp_manifest_uses_system_temp_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    manifest = _create_temp_manifest("out_", ".list.txt")
    try:
        assert manifest.exists()
        assert manifest.parent != tmp_path
    finally:
        manifest.unlink(missing_ok=True)


def test_ffmpeg_concat_entry_normalizes_windowsish_paths(tmp_path):
    path = tmp_path / "nested dir" / "clip's test.wav"
    path.parent.mkdir(parents=True)
    path.write_text("x")

    entry = _ffmpeg_concat_entry(path)

    assert entry.startswith("file '")
    assert "\\\\" not in entry
    assert "nested dir" in entry
    assert entry.endswith("'\n")


def test_assemble_audiobook_no_files(mock_on_output, mock_cancel_check):
    with patch("os.listdir", return_value=[]):
        from app.engines.audiobook_utils import assemble_audiobook
        rc = assemble_audiobook(Path("."), "Title", Path("out.m4b"), mock_on_output, mock_cancel_check)
        assert rc == 1
        mock_on_output.assert_any_call("No audio files found to combine.\n")

def test_assemble_audiobook_encode_fail(mock_on_output, mock_cancel_check):
    def fake_exists(self):
        return self.suffix != ".m4a"

    with patch("app.engines.proc_utils.run_cmd_stream", side_effect=[1]), \
         patch("app.engines.audio_ops.get_audio_duration", return_value=5.0), \
         patch("pathlib.Path.exists", new=fake_exists), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("os.listdir", return_value=["c1.wav"]):
        mock_stat.return_value.st_mtime = 1.0

        from app.engines.audiobook_utils import assemble_audiobook
        rc = assemble_audiobook(Path("."), "Title", Path("out.m4b"), mock_on_output, mock_cancel_check)
        assert rc == 1

@pytest.fixture(autouse=True)
def mock_audio_ops():
    with patch("os.unlink", return_value=None):
        yield

def test_generate_video_sample_no_audio(mock_on_output, mock_cancel_check):
    with patch("pathlib.Path.exists", return_value=False):
        from app.engines.video_utils import generate_video_sample
        rc = generate_video_sample(Path("no.wav"), Path("out.mp4"), None, mock_on_output, mock_cancel_check)
        assert rc == 1

def test_generate_video_sample_no_logo(mock_on_output, mock_cancel_check):
    with patch("app.engines.proc_utils.run_cmd_stream", return_value=0), \
         patch("pathlib.Path.exists", side_effect=[True, False, True, True]):
        from app.engines.video_utils import generate_video_sample
        rc = generate_video_sample(Path("in.wav"), Path("out.mp4"), Path("no-logo.png"), mock_on_output, mock_cancel_check)
        assert rc == 0

def test_stitch_segments_no_segs(mock_on_output, mock_cancel_check):
    rc = stitch_segments(Path("."), [], Path("out.wav"), mock_on_output, mock_cancel_check)
    assert rc == 1

def test_get_audio_duration_fail():
    with patch("subprocess.run", side_effect=Exception("fail")):
        assert get_audio_duration(Path("fail.wav")) == 0.0

def test_assemble_audiobook_chapter_titles(mock_on_output, mock_cancel_check):
    with patch("app.engines.proc_utils.run_cmd_stream", return_value=0), \
         patch("app.engines.audio_ops.get_audio_duration", return_value=5.0), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("pathlib.Path.write_text"), \
         patch("pathlib.Path.stat") as mock_stat, \
         patch("os.listdir", return_value=["c1.wav"]):

        mock_stat.return_value.st_mtime = 1000
        from app.engines.audiobook_utils import assemble_audiobook
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
         patch("time.time") as mock_time:

        mock_time.side_effect = [1000.0, 1002.0, 1004.0, 1006.0, 1008.0, 1010.0]

        mock_proc = MagicMock()
        mock_proc.stdout.read.side_effect = [""] * 10
        mock_proc.poll.side_effect = [None, 0]
        mock_popen.return_value = mock_proc

        run_cmd_stream("cmd", mock_on_output, mock_cancel_check)
        mock_on_output.assert_any_call("")

def test_terminate_all_subprocesses():
    mock_proc = MagicMock()
    mock_proc.pid = None
    _active_processes.add(mock_proc)
    terminate_all_subprocesses()
    mock_proc.terminate.assert_called_once()
    assert len(_active_processes) == 0


def test_cleanup_orphaned_tts_server_processes_only_targets_orphans():
    ps_output = "\n".join(
        [
            "111 1 /usr/bin/python -u /repo/tts_server.py --port 7862 --plugins-dir /repo/plugins",
            "222 99 /usr/bin/python -u /repo/tts_server.py --port 7862 --plugins-dir /repo/plugins",
            "333 1 /usr/bin/python -u /repo/other.py",
        ]
    )

    with patch("subprocess.run") as mock_run, patch("os.kill") as mock_kill:
        mock_run.return_value.stdout = ps_output
        killed = cleanup_orphaned_tts_server_processes(
            server_script="/repo/tts_server.py",
            plugins_dir="/repo/plugins",
        )

    assert killed == 1
    mock_kill.assert_any_call(111, signal.SIGTERM)
    assert not any(call.args == (222, signal.SIGTERM) for call in mock_kill.call_args_list)
    assert not any(call.args == (333, signal.SIGTERM) for call in mock_kill.call_args_list)


def test_tts_server_runtime_marker_round_trip(tmp_path):
    marker_path = tmp_path / "tts_server_runtime.json"

    written = write_tts_server_runtime_marker(
        pid=12345,
        port=7862,
        server_script="/repo/tts_server.py",
        plugins_dir="/repo/plugins",
        marker_path=marker_path,
    )

    assert written == marker_path
    data = load_tts_server_runtime_marker(marker_path)
    assert data is not None
    assert data["pid"] == 12345
    assert data["port"] == 7862
    assert data["server_script"] == "/repo/tts_server.py"
    assert data["plugins_dir"] == "/repo/plugins"

    clear_tts_server_runtime_marker(marker_path=marker_path)
    assert not os.path.exists(marker_path)
    assert load_tts_server_runtime_marker(marker_path) is None
