"""Tests for XttsPlugin.check_output duration sanity rule."""

from __future__ import annotations

import struct
import wave
from pathlib import Path

import pytest

from studio_plugin_sdk.types import TTSRequest, TTSResult


def _make_wav(path: Path, duration_secs: float, sample_rate: int = 22050) -> None:
    """Write a minimal valid WAV file with the given duration."""
    n_frames = int(duration_secs * sample_rate)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * n_frames)


@pytest.fixture
def engine():
    from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
    return XttsPlugin()


def _req(text: str, output_path: str, threshold: float | None = None) -> TTSRequest:
    settings = {} if threshold is None else {"max_chars_per_second": threshold}
    return TTSRequest(
        text=text,
        output_path=output_path,
        settings=settings,
    )


def _result(output_path: str, duration: float | None) -> TTSResult:
    return TTSResult(ok=True, output_path=output_path, duration_sec=duration)


class TestXttsCheckOutputDurationRule:
    def test_zero_duration_in_result_rejected(self, engine, tmp_path):
        wav = tmp_path / "zero.wav"
        _make_wav(wav, 0.0)
        req = _req("hello world", str(wav))
        res = _result(str(wav), duration=0.0)
        ok, reason = engine.check_output(req, res)
        assert not ok
        assert "zero duration" in reason

    def test_zero_duration_probed_from_file_rejected(self, engine, tmp_path):
        """duration_sec=None triggers file probe; zero-frame WAV must be rejected."""
        wav = tmp_path / "zero_probe.wav"
        _make_wav(wav, 0.0)
        req = _req("hello world", str(wav))
        res = _result(str(wav), duration=None)
        ok, reason = engine.check_output(req, res)
        assert not ok
        assert "zero duration" in reason

    def test_absurdly_short_duration_rejected(self, engine, tmp_path):
        """300 chars in 2s implies 150 chars/sec — far beyond the 60/sec cap."""
        wav = tmp_path / "short.wav"
        _make_wav(wav, 2.0)
        text = "a" * 300
        req = _req(text, str(wav))
        res = _result(str(wav), duration=2.0)
        ok, reason = engine.check_output(req, res)
        assert not ok
        assert "truncated" in reason or "too short" in reason

    def test_realistic_speech_rate_accepted_at_default_threshold(self, engine, tmp_path):
        """REGRESSION: real speech is ~12-15 chars/sec. 300 chars / 22s (13.6/sec)
        MUST pass with default settings — the initial implementation shipped a
        3.0 chars/sec default that rejected every real render."""
        wav = tmp_path / "real.wav"
        _make_wav(wav, 22.0)
        text = "a" * 300
        req = _req(text, str(wav))
        res = _result(str(wav), duration=22.0)
        ok, reason = engine.check_output(req, res)
        assert ok, f"realistic 13.6 chars/sec audio must pass default QA: {reason}"

    def test_normal_duration_accepted(self, engine, tmp_path):
        """Explicit threshold: 60 chars / 25s = 2.4 chars/sec, well under a 60/sec cap."""
        wav = tmp_path / "normal.wav"
        _make_wav(wav, 25.0)
        text = "a" * 60
        req = _req(text, str(wav), threshold=60.0)
        res = _result(str(wav), duration=25.0)
        ok, reason = engine.check_output(req, res)
        assert ok
        assert reason == "OK"

    def test_threshold_zero_disables_check(self, engine, tmp_path):
        """Setting threshold to 0 disables the chars/sec check entirely."""
        wav = tmp_path / "disabled.wav"
        _make_wav(wav, 0.1)
        text = "a" * 60
        req = _req(text, str(wav), threshold=0.0)
        res = _result(str(wav), duration=0.1)
        ok, _ = engine.check_output(req, res)
        assert ok

    def test_empty_text_not_rejected_for_speed(self, engine, tmp_path):
        """Zero-length text means the chars/sec threshold can't apply (no chars)."""
        wav = tmp_path / "empty_text.wav"
        _make_wav(wav, 1.0)
        req = _req("", str(wav))
        res = _result(str(wav), duration=1.0)
        ok, _ = engine.check_output(req, res)
        assert ok

    def test_default_threshold_is_conservative(self, engine, tmp_path):
        """Engine uses the 60 chars/sec default cap when the setting is absent:
        300 chars in 1s (300/sec) is rejected, and the cap matches settings_schema."""
        import json
        from pathlib import Path as _P
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        schema = json.loads((_P("tts_engines/tts_xtts/settings_schema.json")).read_text())
        assert schema["properties"]["max_chars_per_second"]["default"] == 60.0
        engine2 = XttsPlugin()
        wav = tmp_path / "default_thresh.wav"
        _make_wav(wav, 1.0)
        req = TTSRequest(text="a" * 300, output_path=str(wav), settings={})
        res = _result(str(wav), duration=1.0)
        ok, reason = engine2.check_output(req, res)
        assert not ok
