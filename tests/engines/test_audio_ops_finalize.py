"""Unit tests for finalize_sample_artifact in app.engines.audio_ops."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest


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


# --- _ffmpeg_concat_entry quoting (S11 regression guard) -------------------
#
# Context: the security audit (final_release/12 S11) claimed the shell-style
# `'\''` escaping was invalid for ffmpeg's concat demuxer and recommended
# switching to double-quoted paths. Empirically (ffmpeg 8.0.1) the OPPOSITE is
# true: the current `'\''` escaping is the documented ffmpeg-utils quoting and
# concatenates apostrophe filenames correctly, while double-quoted paths FAIL
# ("Impossible to open '\"plain.wav\"'"). These tests lock the correct behavior
# in so the audit's bad fix can't be applied later.

def test_ffmpeg_concat_entry_plain_path(tmp_path):
    """A plain path is wrapped in single quotes for the concat list."""
    from app.engines.audio_ops import _ffmpeg_concat_entry

    entry = _ffmpeg_concat_entry(tmp_path / "plain.wav")
    assert entry.startswith("file '")
    assert entry.endswith("plain.wav'\n")
    assert '"' not in entry  # never emit double-quoted paths (S11)


def test_ffmpeg_concat_entry_escapes_apostrophe(tmp_path):
    """An apostrophe is escaped using ffmpeg-utils quoting: ' -> '\\'' —
    NOT double-quoting (which ffmpeg's concat demuxer cannot open)."""
    from app.engines.audio_ops import _ffmpeg_concat_entry

    entry = _ffmpeg_concat_entry(tmp_path / "O'Brien.wav")
    assert "'\\''" in entry  # the apostrophe is escaped, not left bare
    assert entry.startswith("file '") and entry.endswith("'\n")
    assert '"' not in entry  # never emit double-quoted paths (S11)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_stitch_segments_handles_apostrophe_filename(tmp_path):
    """End-to-end: stitch_segments concatenates an apostrophe-named wav via the
    real ffmpeg concat path (proves the _ffmpeg_concat_entry quoting works)."""
    from app.engines.audio_ops import stitch_segments

    def _silence(dest: Path):
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
             "anullsrc=r=44100:cl=mono", "-t", "0.1", str(dest)],
            check=True,
        )

    plain = tmp_path / "plain.wav"
    apostrophe = tmp_path / "O'Brien.wav"
    _silence(plain)
    _silence(apostrophe)

    out = tmp_path / "stitched.wav"
    rc = stitch_segments(tmp_path, [plain, apostrophe], out, lambda _s: None, lambda: False)

    assert rc == 0, "ffmpeg concat must succeed with an apostrophe in a segment filename"
    assert out.exists() and out.stat().st_size > 0
