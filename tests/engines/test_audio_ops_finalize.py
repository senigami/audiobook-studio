"""Unit tests for finalize_sample_artifact in app.engines.audio_ops."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch


def test_finalize_sample_artifact_success_converts_and_deletes_wav(tmp_path):
    """On successful conversion, WAV is deleted and MP3 path is returned."""
    wav = tmp_path / "sample.wav"
    wav.write_text("wav content")
    expected_mp3 = tmp_path / "sample.mp3"

    def fake_wav_to_mp3(in_wav, out_mp3, on_output=None, cancel_check=None):
        out_mp3.write_text("mp3 content")
        return 0

    with patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3):
        from app.engines.audio_ops import finalize_sample_artifact
        result = finalize_sample_artifact(wav)

    assert result == expected_mp3
    assert expected_mp3.exists()
    assert not wav.exists()


def test_finalize_sample_artifact_failure_keeps_wav(tmp_path):
    """On nonzero return code from wav_to_mp3, WAV is kept and WAV path is returned."""
    wav = tmp_path / "sample.wav"
    wav.write_text("wav content")

    def fake_wav_to_mp3_fail(in_wav, out_mp3, on_output=None, cancel_check=None):
        # Do NOT write mp3; return nonzero
        return 1

    with patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3_fail):
        from app.engines.audio_ops import finalize_sample_artifact
        result = finalize_sample_artifact(wav)

    assert result == wav
    assert wav.exists()
    assert not (tmp_path / "sample.mp3").exists()


def test_finalize_sample_artifact_missing_output_keeps_wav(tmp_path):
    """If wav_to_mp3 returns 0 but mp3 was not created, WAV is kept."""
    wav = tmp_path / "sample.wav"
    wav.write_text("wav content")

    def fake_wav_to_mp3_no_output(in_wav, out_mp3, on_output=None, cancel_check=None):
        # Return 0 but don't write anything
        return 0

    with patch("app.engines.audio_ops.wav_to_mp3", side_effect=fake_wav_to_mp3_no_output):
        from app.engines.audio_ops import finalize_sample_artifact
        result = finalize_sample_artifact(wav)

    assert result == wav
    assert wav.exists()


def test_finalize_sample_artifact_exception_keeps_wav(tmp_path):
    """If wav_to_mp3 raises, WAV is kept (graceful fallback)."""
    wav = tmp_path / "sample.wav"
    wav.write_text("wav content")

    with patch("app.engines.audio_ops.wav_to_mp3", side_effect=RuntimeError("ffmpeg not found")):
        from app.engines.audio_ops import finalize_sample_artifact
        result = finalize_sample_artifact(wav)

    assert result == wav
    assert wav.exists()
