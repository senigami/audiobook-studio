from pathlib import Path
from unittest.mock import patch

import pytest

from app.engines_voxtral import VoxtralError, resolve_reference_audio_path, voxtral_generate


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


def test_resolve_reference_audio_path_prefers_configured_sample(tmp_path):
    profile_dir = tmp_path / "VoiceA"
    profile_dir.mkdir()
    preferred = profile_dir / "clip2.wav"
    fallback = profile_dir / "clip1.wav"
    fallback.write_bytes(b"a")
    preferred.write_bytes(b"b")

    with patch("app.jobs.speaker.get_voice_profile_dir", return_value=profile_dir):
        result = resolve_reference_audio_path("VoiceA", "clip2.wav")

    assert result == preferred


def test_voxtral_generate_requires_api_key(tmp_path):
    with patch("app.engines_voxtral.get_settings", return_value={}):
        with pytest.raises(VoxtralError, match="Missing Mistral API key"):
            voxtral_generate("Hello", tmp_path / "out.wav", profile_name="VoiceA")


def test_voxtral_generate_writes_wav_response(tmp_path):
    out_wav = tmp_path / "out.wav"
    ref_audio = tmp_path / "ref.wav"
    ref_audio.write_bytes(b"ref")
    wav_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt "
    client = FakeClient(FakeResponse(status_code=200, content=wav_bytes, headers={"content-type": "audio/wav"}))

    with patch("app.engines_voxtral.get_settings", return_value={"mistral_api_key": "test-key"}), \
         patch("app.engines_voxtral.resolve_reference_audio_path", return_value=ref_audio), \
         patch("app.engines_voxtral.httpx.Client", return_value=client):
        rc = voxtral_generate("Hello", out_wav, profile_name="VoiceA")

    assert rc == 0
    assert out_wav.read_bytes() == wav_bytes


def test_voxtral_generate_converts_non_wav_audio(tmp_path):
    out_wav = tmp_path / "out.wav"
    ref_audio = tmp_path / "ref.wav"
    ref_audio.write_bytes(b"ref")
    client = FakeClient(FakeResponse(status_code=200, content=b"ID3fake-mp3", headers={"content-type": "audio/mpeg"}))

    def fake_convert(src: Path, dest: Path):
        dest.write_bytes(b"RIFFconvertedWAVE")
        return 0

    with patch("app.engines_voxtral.get_settings", return_value={"mistral_api_key": "test-key"}), \
         patch("app.engines_voxtral.resolve_reference_audio_path", return_value=ref_audio), \
         patch("app.engines_voxtral.httpx.Client", return_value=client), \
         patch("app.engines_voxtral.convert_to_wav", side_effect=fake_convert):
        rc = voxtral_generate("Hello", out_wav, profile_name="VoiceA")

    assert rc == 0
    assert out_wav.read_bytes() == b"RIFFconvertedWAVE"
