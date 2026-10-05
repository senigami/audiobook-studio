"""Voice-input resolution stays inside the request (audit task 005).

The server-side engine must never reach into Studio internals
(app.engines.voice_engines / app.db) to guess storage paths; reference
audio arrives via voice_ref, settings["voice_profile_dir"], or script
entries — nothing else.
"""
from pathlib import Path
from unittest.mock import patch

from studio_plugin_sdk.types import TTSRequest
from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin


def _request(tmp_path, settings):
    return TTSRequest(
        text="Hello world",
        output_path=str(tmp_path / "out.wav"),
        voice_ref=None,
        settings=settings,
    )


def test_resolve_voice_inputs_does_not_fall_back_to_studio_internals(tmp_path):
    plugin = XttsPlugin()
    req = _request(tmp_path, {"voice_profile_id": "Test"})

    with patch(
        "app.engines.voice_engines.resolve_voice_preview_inputs",
        return_value=("studio-resolved.wav", tmp_path),
    ) as studio_resolver:
        speaker_wav, profile_dir = plugin._resolve_voice_inputs(req)

    studio_resolver.assert_not_called()
    assert speaker_wav is None
    assert profile_dir is None


def test_resolve_voice_inputs_uses_request_supplied_profile_dir(tmp_path):
    plugin = XttsPlugin()
    profile_dir = tmp_path / "voices" / "Test"
    profile_dir.mkdir(parents=True)
    req = _request(tmp_path, {"voice_profile_dir": str(profile_dir)})

    speaker_wav, resolved = plugin._resolve_voice_inputs(req)

    assert speaker_wav is None
    assert resolved == Path(profile_dir)


def test_resolve_voice_inputs_prefers_voice_ref(tmp_path):
    plugin = XttsPlugin()
    req = TTSRequest(
        text="Hello world",
        output_path=str(tmp_path / "out.wav"),
        voice_ref=str(tmp_path / "ref.wav"),
        settings={},
    )

    speaker_wav, resolved = plugin._resolve_voice_inputs(req)

    assert speaker_wav == str(tmp_path / "ref.wav")
    assert resolved is None
