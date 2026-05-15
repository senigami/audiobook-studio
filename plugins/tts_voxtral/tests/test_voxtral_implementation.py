from pathlib import Path
from unittest.mock import patch
import base64

import pytest

from plugins.tts_voxtral.plugin.core.implementation import VoxtralError, resolve_reference_audio_path, voxtral_generate
from plugins.tts_voxtral.plugin.server.engine import VoxtralPlugin
from app.engines.voice.sdk import TTSRequest


class FakeResponse:
    def __init__(self, status_code=200, content=b"", headers=None, json_payload=None, text=""):
        self.status_code = status_code
        self.content = content
        self.headers = headers or {}
        self._json_payload = json_payload
        self.text = text

    def json(self):
        if self._json_payload is None:
            raise ValueError("No JSON payload")
        return self._json_payload


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def post(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.response

    def get(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.response


def test_resolve_reference_audio_path_prefers_configured_sample(tmp_path):
    profile_dir = tmp_path / "VoiceA"
    profile_dir.mkdir()
    preferred = profile_dir / "clip2.wav"
    fallback = profile_dir / "clip1.wav"
    fallback.write_bytes(b"a")
    preferred.write_bytes(b"b")

    result = resolve_reference_audio_path("VoiceA", "clip2.wav", voice_profile_dir=profile_dir)

    assert result == preferred


def test_voxtral_generate_requires_api_key(tmp_path):
    with patch("plugins.tts_voxtral.plugin.core.implementation.resolve_mistral_api_key", return_value=None):
        with pytest.raises(VoxtralError, match="Missing Mistral API key"):
            voxtral_generate("Hello", tmp_path / "out.wav", profile_name="VoiceA")


def test_voxtral_generate_writes_wav_response(tmp_path):
    out_wav = tmp_path / "out.wav"
    ref_audio = tmp_path / "ref.wav"
    ref_audio.write_bytes(b"ref")
    wav_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt "
    client = FakeClient(FakeResponse(status_code=200, content=wav_bytes, headers={"content-type": "audio/wav"}))

    with patch("plugins.tts_voxtral.plugin.core.implementation.resolve_reference_audio_path", return_value=ref_audio), \
         patch("plugins.tts_voxtral.plugin.core.implementation.httpx.Client", return_value=client):
        rc = voxtral_generate("Hello", out_wav, profile_name="VoiceA", settings={"mistral_api_key": "test-key"})

    assert rc == 0
    assert out_wav.read_bytes() == wav_bytes
    _, kwargs = client.calls[0]
    assert kwargs["headers"]["Content-Type"] == "application/json"
    assert kwargs["json"]["model"] == "voxtral-mini-tts-2603"
    assert kwargs["json"]["response_format"] == "wav"
    assert kwargs["json"]["ref_audio"]


def test_extract_audio_bytes_supports_audio_data_key():
    from plugins.tts_voxtral.plugin.core.implementation import _extract_audio_bytes

    wav_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt "
    response = FakeResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        json_payload={"audio_data": base64.b64encode(wav_bytes).decode("ascii")},
    )

    assert _extract_audio_bytes(response) == wav_bytes


def test_voxtral_generate_converts_non_wav_audio(tmp_path):
    out_wav = tmp_path / "out.wav"
    ref_audio = tmp_path / "ref.wav"
    ref_audio.write_bytes(b"ref")
    client = FakeClient(FakeResponse(status_code=200, content=b"ID3fake-mp3", headers={"content-type": "audio/mpeg"}))

    def fake_convert(in_file: Path, out_wav: Path):
        out_wav.write_bytes(b"RIFFconvertedWAVE")
        return 0

    with patch("plugins.tts_voxtral.plugin.core.implementation.resolve_reference_audio_path", return_value=ref_audio), \
         patch("plugins.tts_voxtral.plugin.core.implementation.httpx.Client", return_value=client), \
         patch("plugins.tts_voxtral.plugin.core.implementation._convert_to_wav", side_effect=fake_convert):
        rc = voxtral_generate("Hello", out_wav, profile_name="VoiceA", settings={"mistral_api_key": "test-key"})

    assert rc == 0
    assert out_wav.read_bytes() == b"RIFFconvertedWAVE"


def test_resolve_voxtral_model_upgrades_short_default():
    from plugins.tts_voxtral.plugin.core.implementation import resolve_voxtral_model

    assert resolve_voxtral_model(settings={"voxtral_model": "voxtral-tts"}) == "voxtral-mini-tts-2603"


def test_list_mistral_models_uses_saved_settings_key(monkeypatch):
    from plugins.tts_voxtral.plugin.core import implementation

    implementation._models_cache = {"data": [], "timestamp": 0.0, "api_key_hash": ""}
    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)
    response = FakeResponse(
        status_code=200,
        json_payload={"data": [{"id": "mistral-tts-latest"}]},
    )
    client = FakeClient(response)

    with patch("plugins.tts_voxtral.plugin.core.implementation.httpx.Client", return_value=client):
        models = implementation.list_mistral_models(settings={"mistral_api_key": "saved-key"}, strict=True)

    assert models == ["mistral-tts-latest"]
    _, kwargs = client.calls[0]
    assert kwargs["headers"]["Authorization"] == "Bearer saved-key"


def test_voxtral_verify_passes_saved_settings_to_model_check(monkeypatch):
    seen = {}

    def fake_list_models(*, settings=None, strict=False):
        seen["settings"] = settings
        seen["strict"] = strict
        return ["mistral-tts-latest"]

    monkeypatch.delenv("MISTRAL_API_KEY", raising=False)

    with patch("plugins.tts_voxtral.plugin.core.implementation.list_mistral_models", side_effect=fake_list_models):
        result = VoxtralPlugin().verify(
            TTSRequest(
                text="hello",
                output_path="out.wav",
                settings={"mistral_api_key": "saved-key"},
            )
        )

    assert result.ok is True
    assert seen == {"settings": {"mistral_api_key": "saved-key"}, "strict": True}
