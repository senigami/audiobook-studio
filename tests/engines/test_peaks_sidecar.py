"""Unit tests for compute_peaks_sidecar (app.engines.audio_ops) and its
supporting probe_audio_stream_info helper (app.utils.subprocess_utils).

Per R2 (mock boundaries only), these tests mock only subprocess.run — the
real external process boundary — never compute_peaks_sidecar or
probe_audio_stream_info themselves.
"""
from __future__ import annotations

import array
from pathlib import Path
from types import SimpleNamespace

from app.engines.audio_ops import compute_peaks_sidecar
from app.utils.subprocess_utils import probe_audio_stream_info


def _floats_to_bytes(values: list[float]) -> bytes:
    return array.array("f", values).tobytes()


def _fake_run_factory(*, duration_stdout="2.0\n", duration_returncode=0,
                       stream_stdout="44100\n1\n", stream_returncode=0,
                       ffmpeg_stdout=b"", ffmpeg_returncode=0):
    """Builds a fake subprocess.run that dispatches on the ffprobe/ffmpeg
    command shape, mirroring the real command construction in
    probe_audio_duration / probe_audio_stream_info / compute_peaks_sidecar."""

    def fake_run(cmd, **kwargs):
        if cmd[0] == "ffprobe":
            entries = cmd[cmd.index("-show_entries") + 1]
            if entries == "format=duration":
                return SimpleNamespace(stdout=duration_stdout, returncode=duration_returncode)
            if entries == "stream=sample_rate,channels":
                return SimpleNamespace(stdout=stream_stdout, returncode=stream_returncode)
            raise AssertionError(f"unexpected ffprobe entries: {entries}")
        if cmd[0] == "ffmpeg":
            return SimpleNamespace(stdout=ffmpeg_stdout, returncode=ffmpeg_returncode)
        raise AssertionError(f"unexpected cmd: {cmd}")

    return fake_run


class _FakePath:
    """Duck-typed stand-in for wav_path that lets .stat() return distinct
    values on successive calls (simulating a concurrent re-render mid-read),
    without globally monkeypatching pathlib.Path.stat for the whole process."""

    def __init__(self, real_path: Path, stats: list):
        self._real = real_path
        self._stats = iter(stats)

    def stat(self):
        return next(self._stats)

    def __str__(self):
        return str(self._real)

    @property
    def name(self):
        return self._real.name


# --- compute_peaks_sidecar: schema + bucket math ---------------------------

def test_compute_peaks_sidecar_bucket_math_and_schema(tmp_path, monkeypatch):
    wav = tmp_path / "chapter.wav"
    wav.write_bytes(b"fake wav bytes")

    # duration=2.0s, PEAKS_PER_SEC=8 -> num_peaks=16; 48 samples -> bucket_size=3.
    samples = [0.1, -0.9, 0.05, -0.99, 0.01, 0.02] + [0.0] * 42
    assert len(samples) == 48

    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(ffmpeg_stdout=_floats_to_bytes(samples)),
    )

    result = compute_peaks_sidecar(wav)

    assert result is not None
    assert result["version"] == 1
    assert result["duration_sec"] == 2.0
    assert result["sample_rate"] == 44100
    assert result["channels"] == 1
    assert result["peaks_per_sec"] == 8
    assert len(result["peaks"]) == 16
    assert result["peaks"][0] == 0.9
    assert result["peaks"][1] == 0.99
    assert result["peaks"][2:] == [0.0] * 14

    stat = wav.stat()
    assert result["source"] == {
        "filename": "chapter.wav",
        "size_bytes": stat.st_size,
        "mtime_ns": stat.st_mtime_ns,
    }


def test_compute_peaks_sidecar_clamps_values_to_zero_one_range(tmp_path, monkeypatch):
    wav = tmp_path / "clipped.wav"
    wav.write_bytes(b"fake wav bytes")

    # duration=1.0s -> num_peaks=8; 8 samples -> bucket_size=1 (one sample per peak).
    samples = [1.5, -1.5, 0.5, -0.5, 2.0, -2.0, 0.999, -0.999]

    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(
            duration_stdout="1.0\n",
            ffmpeg_stdout=_floats_to_bytes(samples),
        ),
    )

    result = compute_peaks_sidecar(wav)

    assert result is not None
    peaks = result["peaks"]
    assert len(peaks) == 8
    assert all(0.0 <= p <= 1.0 for p in peaks)
    assert peaks[0] == 1.0  # abs(1.5) clamped to 1.0
    assert peaks[2] == 0.5
    assert peaks[6] == 0.999


# --- compute_peaks_sidecar: failure modes -> None, never raise -------------

def test_compute_peaks_sidecar_duration_probe_failure_returns_none(tmp_path, monkeypatch):
    wav = tmp_path / "bad.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(duration_stdout="", duration_returncode=1),
    )

    assert compute_peaks_sidecar(wav) is None


def test_compute_peaks_sidecar_stream_info_failure_returns_none(tmp_path, monkeypatch):
    wav = tmp_path / "bad.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(stream_stdout="", stream_returncode=1),
    )

    assert compute_peaks_sidecar(wav) is None


def test_compute_peaks_sidecar_ffmpeg_failure_returns_none(tmp_path, monkeypatch):
    wav = tmp_path / "bad.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(ffmpeg_returncode=1, ffmpeg_stdout=b""),
    )

    assert compute_peaks_sidecar(wav) is None


def test_compute_peaks_sidecar_subprocess_exception_returns_none(tmp_path, monkeypatch):
    wav = tmp_path / "bad.wav"
    wav.write_bytes(b"fake wav bytes")

    def raising_run(*_args, **_kwargs):
        raise OSError("ffprobe not found")

    monkeypatch.setattr("subprocess.run", raising_run)

    assert compute_peaks_sidecar(wav) is None


# --- compute_peaks_sidecar: concurrent-write race guard --------------------

def test_compute_peaks_sidecar_stat_mismatch_returns_none(tmp_path, monkeypatch):
    """A stat() mismatch between the pre-read and post-read snapshot means a
    concurrent re-render rewrote the file mid-compute — must return None
    rather than stamp a torn read as valid data."""
    real_wav = tmp_path / "racing.wav"
    real_wav.write_bytes(b"fake wav bytes")

    samples = [0.1] * 16
    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(
            duration_stdout="1.0\n",
            ffmpeg_stdout=_floats_to_bytes(samples),
        ),
    )

    stat_before = SimpleNamespace(st_size=100, st_mtime_ns=1_000)
    stat_after = SimpleNamespace(st_size=999, st_mtime_ns=2_000)  # rewritten mid-read
    fake_path = _FakePath(real_wav, [stat_before, stat_after])

    assert compute_peaks_sidecar(fake_path) is None


def test_compute_peaks_sidecar_stat_match_returns_data(tmp_path, monkeypatch):
    """Sanity companion to the mismatch test: identical before/after stats
    let the sidecar through, proving the guard only trips on a real change."""
    real_wav = tmp_path / "stable.wav"
    real_wav.write_bytes(b"fake wav bytes")

    samples = [0.1] * 16
    monkeypatch.setattr(
        "subprocess.run",
        _fake_run_factory(
            duration_stdout="1.0\n",
            ffmpeg_stdout=_floats_to_bytes(samples),
        ),
    )

    stable_stat = SimpleNamespace(st_size=100, st_mtime_ns=1_000)
    fake_path = _FakePath(real_wav, [stable_stat, stable_stat])

    result = compute_peaks_sidecar(fake_path)

    assert result is not None
    assert result["source"]["size_bytes"] == 100
    assert result["source"]["mtime_ns"] == 1_000


# --- probe_audio_stream_info: mirrors probe_audio_duration's shape ---------

def test_probe_audio_stream_info_success(tmp_path, monkeypatch):
    wav = tmp_path / "audio.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(stdout="48000\n2\n", returncode=0),
    )

    assert probe_audio_stream_info(wav) == (48000, 2)


def test_probe_audio_stream_info_nonzero_returncode_returns_zeros(tmp_path, monkeypatch):
    wav = tmp_path / "audio.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(stdout="", returncode=1),
    )

    assert probe_audio_stream_info(wav) == (0, 0)


def test_probe_audio_stream_info_malformed_output_returns_zeros(tmp_path, monkeypatch):
    wav = tmp_path / "audio.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(stdout="only-one-line\n", returncode=0),
    )

    assert probe_audio_stream_info(wav) == (0, 0)


def test_probe_audio_stream_info_non_numeric_output_returns_zeros(tmp_path, monkeypatch):
    wav = tmp_path / "audio.wav"
    wav.write_bytes(b"fake wav bytes")

    monkeypatch.setattr(
        "subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(stdout="not-a-number\nalso-not\n", returncode=0),
    )

    assert probe_audio_stream_info(wav) == (0, 0)
