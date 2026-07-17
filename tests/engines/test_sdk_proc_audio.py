"""Task 03 — SDK proc/audio mechanism moves; app wrappers inject policy.

Identity: app.engines.proc_utils re-exports the SDK implementations (one module
object per function). Wrapper: app.engines.audio_ops.wav_to_mp3 injects
MP3_QUALITY (and the app-resolved runner) into the SDK function.
"""

from pathlib import Path
from unittest.mock import patch


def test_run_cmd_stream_identity():
    import app.engines.proc_utils as app_proc
    import studio_plugin_sdk.proc as sdk_proc

    assert app_proc.run_cmd_stream is sdk_proc.run_cmd_stream


def test_coerce_subprocess_output_identity():
    import studio_plugin_sdk.proc as sdk_proc
    from app.utils import subprocess_utils

    assert subprocess_utils.coerce_subprocess_output is sdk_proc.coerce_subprocess_output


def test_active_processes_registry_identity():
    """terminate_all_subprocesses must operate on the same set run_cmd_stream fills."""
    import app.engines.proc_utils as app_proc
    import studio_plugin_sdk.proc as sdk_proc

    assert app_proc._active_processes is sdk_proc._active_processes
    assert app_proc.terminate_all_subprocesses is sdk_proc.terminate_all_subprocesses


def test_sdk_proc_has_no_app_imports():
    import studio_plugin_sdk.audio as sdk_audio
    import studio_plugin_sdk.proc as sdk_proc

    for mod in (sdk_proc, sdk_audio):
        source = Path(mod.__file__).read_text(encoding="utf-8")
        assert "from app" not in source and "import app" not in source, mod.__name__


def test_app_wav_to_mp3_injects_mp3_quality():
    """The app wrapper passes MP3_QUALITY policy into the SDK mechanism (R2: SDK fn is the boundary)."""
    from app.core.config import MP3_QUALITY
    from app.engines.audio_ops import wav_to_mp3

    with patch("studio_plugin_sdk.audio.wav_to_mp3", return_value=0) as sdk_fn:
        rc = wav_to_mp3(Path("in.wav"), Path("out.mp3"))

    assert rc == 0
    assert sdk_fn.call_count == 1
    assert sdk_fn.call_args.kwargs["quality"] == MP3_QUALITY


def test_app_wav_to_mp3_injects_app_runner():
    """Patching app.engines.proc_utils.run_cmd_stream must still intercept wav_to_mp3's ffmpeg call."""
    from app.engines.audio_ops import wav_to_mp3

    with patch("app.engines.proc_utils.run_cmd_stream", return_value=0) as mock_run:
        rc = wav_to_mp3(Path("in.wav"), Path("out.mp3"))

    assert rc == 0
    assert mock_run.call_count == 1
    cmd = mock_run.call_args.args[0]
    assert cmd[0] == "ffmpeg" and str(Path("out.mp3")) in cmd


def test_sdk_wav_to_mp3_builds_ffmpeg_cmd_with_quality():
    import studio_plugin_sdk.audio as sdk_audio

    with patch("studio_plugin_sdk.proc.run_cmd_stream", return_value=0) as mock_run:
        rc = sdk_audio.wav_to_mp3(Path("in.wav"), Path("out.mp3"), quality=3)

    assert rc == 0
    cmd = mock_run.call_args.args[0]
    assert cmd[0] == "ffmpeg"
    assert cmd[cmd.index("-q:a") + 1] == "3"
