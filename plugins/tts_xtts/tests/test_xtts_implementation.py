import pytest
import os
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
from plugins.tts_xtts.plugin.core.implementation import (
    xtts_generate, xtts_generate_script, get_speaker_latent_path,
    migrate_speaker_latent_to_profile
)

@pytest.fixture
def mock_on_output():
    return MagicMock()

@pytest.fixture
def mock_cancel_check():
    return MagicMock(return_value=False)

def test_xtts_generate_success(mock_on_output, mock_cancel_check):
    with patch("plugins.tts_xtts.plugin.core.implementation.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("plugins.tts_xtts.plugin.core.implementation.run_cmd_stream", return_value=0) as mock_run:
        mock_activate.exists.return_value = True

        rc = xtts_generate("Hello", Path("out.wav"), True, mock_on_output, mock_cancel_check, speaker_wav="spk.wav", voice_profile_dir=Path("/tmp/voices/VoiceA"))
        assert rc == 0
        assert "--voice_profile_dir" in mock_run.call_args[0][0]

def test_xtts_generate_voice_profile_only(mock_on_output, mock_cancel_check):
    with patch("plugins.tts_xtts.plugin.core.implementation.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("plugins.tts_xtts.plugin.core.implementation.run_cmd_stream", return_value=0) as mock_run:
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
    import builtins
    original_import = builtins.__import__
    def mocked_import(name, *args, **kwargs):
        if name == 'TTS':
            raise ImportError("Mocked")
        return original_import(name, *args, **kwargs)

    with patch("plugins.tts_xtts.plugin.core.implementation.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("builtins.__import__", side_effect=mocked_import):
        mock_activate.exists.return_value = False
        rc = xtts_generate("Hello", Path("out.wav"), True, mock_on_output, mock_cancel_check, speaker_wav="spk.wav")
        assert rc == 1
        # The expected message has been updated in the product code
        msg = mock_on_output.call_args_list[-1][0][0]
        assert "XTTS activate not found" in msg
        assert "'TTS' not found in current environment" in msg

def test_xtts_generate_script_includes_voice_profile_dir(mock_on_output, mock_cancel_check, tmp_path):
    with patch("plugins.tts_xtts.plugin.core.implementation.XTTS_ENV_ACTIVATE") as mock_activate, \
         patch("plugins.tts_xtts.plugin.core.implementation.run_cmd_stream", return_value=0) as mock_run:
        mock_activate.exists.return_value = True

        script = [{"text": "Hello", "save_path": "chunk.wav", "voice_profile_dir": "/tmp/voices/VoiceA"}]
        script_json_path = tmp_path / "script.json"
        script_json_path.write_text(json.dumps(script))

        rc = xtts_generate_script(script_json_path=script_json_path, out_wav=Path("out.wav"), on_output=mock_on_output, cancel_check=mock_cancel_check, voice_profile_dir=Path("/tmp/voices/VoiceA"))
        assert rc == 0

        cmd = mock_run.call_args[0][0]
        assert "--voice_profile_dir" in cmd
        assert str(script_json_path) in cmd

def test_get_speaker_latent_path_multi():
    # It uses os.path.abspath internally
    p = get_speaker_latent_path("v1.wav, v2.wav")
    assert str(p).endswith(".pth")
    assert "voices" in str(p)

def test_get_speaker_latent_path_none():
    assert get_speaker_latent_path(None) is None
    assert get_speaker_latent_path("") is None

def test_get_speaker_latent_path_profile_scoped(tmp_path):
    profile_dir = tmp_path / "voices" / "VoiceA"
    profile_dir.mkdir(parents=True)
    path = get_speaker_latent_path("/tmp/reference.wav", voice_profile_dir=profile_dir)
    assert path == profile_dir / "latent.pth"

def test_migrate_speaker_latent_to_profile(tmp_path):
    # We need to mock get_speaker_latent_path to return a path we control that exists
    cached_latent = tmp_path / "cached.pth"
    cached_latent.write_text("latent")

    target_dir = tmp_path / "VoiceA"
    target_dir.mkdir()

    with patch("plugins.tts_xtts.plugin.core.implementation.get_speaker_latent_path", return_value=cached_latent):
        migrate_speaker_latent_to_profile("ref.wav", target_dir)

    assert (target_dir / "latent.pth").exists()
    assert (target_dir / "latent.pth").read_text() == "latent"
