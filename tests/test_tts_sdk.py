"""Tests for the TTS SDK contract types (TTSRequest, TTSResult)."""

from __future__ import annotations

import pytest

from app.engines.voice.sdk import TTSRequest, TTSResult


class TestTtsRequest:
    def test_minimal_construction(self):
        req = TTSRequest(text="Hello world", output_path="/tmp/out.wav")
        assert req.text == "Hello world"
        assert req.output_path == "/tmp/out.wav"
        assert req.voice_ref is None
        assert req.settings == {}
        assert req.language == "en"

    def test_full_construction(self):
        req = TTSRequest(
            text="Test",
            output_path="/tmp/out.wav",
            voice_ref="/tmp/ref.wav",
            settings={"speed": 1.5},
            language="es",
        )
        assert req.voice_ref == "/tmp/ref.wav"
        assert req.settings == {"speed": 1.5}
        assert req.language == "es"

    def test_is_frozen(self):
        req = TTSRequest(text="Test", output_path="/tmp/out.wav")
        with pytest.raises((AttributeError, TypeError)):
            req.text = "modified"  # type: ignore[misc]

    def test_settings_defaults_to_empty_dict(self):
        req = TTSRequest(text="x", output_path="/tmp/x.wav")
        assert req.settings == {}


class TestTtsResult:
    def test_success_construction(self):
        result = TTSResult(ok=True, output_path="/tmp/out.wav", duration_sec=2.5)
        assert result.ok is True
        assert result.output_path == "/tmp/out.wav"
        assert result.duration_sec == 2.5
        assert result.warnings == []
        assert result.error is None

    def test_failure_construction(self):
        result = TTSResult(ok=False, error="Synthesis failed")
        assert result.ok is False
        assert result.output_path is None
        assert result.error == "Synthesis failed"

    def test_warnings_list(self):
        result = TTSResult(ok=True, output_path="/tmp/x.wav", warnings=["slow model"])
        assert result.warnings == ["slow model"]

    def test_mutable(self):
        result = TTSResult(ok=False)
        result.ok = True  # TTSResult is mutable
        assert result.ok is True
