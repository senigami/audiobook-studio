"""Audio processing operations for engine execution."""

from __future__ import annotations

import array
import json
import logging
import math
import os
import subprocess
from pathlib import Path
from typing import Any, Callable

from app.core.config import MP3_QUALITY
from app.utils.subprocess_utils import probe_audio_duration, probe_audio_stream_info

logger = logging.getLogger(__name__)


def wav_to_mp3(
    in_wav: Path,
    out_mp3: Path,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> int:
    """Convert WAV to MP3 using FFmpeg.

    Thin wrapper over :func:`studio_plugin_sdk.audio.wav_to_mp3` (the
    mechanism): injects the app's MP3_QUALITY policy and the app-resolved
    runner (so patches of ``app.engines.proc_utils.run_cmd_stream`` still
    intercept the ffmpeg call). Public signature unchanged.
    """
    from studio_plugin_sdk import audio as sdk_audio

    from .proc_utils import run_cmd_stream
    return sdk_audio.wav_to_mp3(
        in_wav,
        out_mp3,
        quality=MP3_QUALITY,
        on_output=on_output,
        cancel_check=cancel_check,
        runner=run_cmd_stream,
    )


def convert_to_wav(in_file: Path, out_wav: Path) -> int:
    """Converts any audio file to a standard 22050Hz mono WAV (best for voice references)."""
    cmd = ["ffmpeg", "-y", "-i", str(in_file), "-ar", "22050", "-ac", "1", str(out_wav)]
    try:
        return subprocess.run(cmd, check=False, timeout=300).returncode
    except subprocess.TimeoutExpired:
        # A wedged ffmpeg on malformed/hostile input must never hang the caller
        # forever (BP-2). Surface a clean failure (non-zero rc) rather than an
        # unhandled exception, matching this function's -> int failure contract.
        logger.warning("convert_to_wav: ffmpeg timed out after 300s converting %s -> %s", in_file, out_wav)
        return 1


def get_audio_duration(file_path: Path) -> float:
    """Uses ffprobe to get the duration of an audio file in seconds."""
    try:
        return probe_audio_duration(file_path)
    except Exception:
        return 0.0


def finalize_sample_artifact(
    wav_path: Path,
    *,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> Path:
    """Convert a voice-sample WAV to MP3, delete the WAV on success, return the MP3 path.

    On conversion failure (nonzero return code or missing output), the WAV is kept and
    its path is returned so callers can still serve the preview.
    """
    import logging

    logger = logging.getLogger(__name__)

    mp3_path = wav_path.with_suffix(".mp3")
    try:
        rc = wav_to_mp3(wav_path, mp3_path, on_output=on_output, cancel_check=cancel_check)
    except Exception as exc:
        logger.warning("finalize_sample_artifact: wav_to_mp3 raised %s — keeping WAV %s", exc, wav_path)
        return wav_path

    if rc != 0 or not mp3_path.exists():
        logger.warning(
            "finalize_sample_artifact: conversion returned rc=%s, mp3_exists=%s — keeping WAV %s",
            rc,
            mp3_path.exists(),
            wav_path,
        )
        return wav_path

    try:
        wav_path.unlink()
    except OSError as exc:
        logger.warning("finalize_sample_artifact: could not delete WAV %s: %s", wav_path, exc)

    return mp3_path


def stitch_segments(
    pdir: Path,
    segment_wavs: list[Path],
    output_path: Path,
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
) -> int:
    """Concatenates multiple segments into one final file."""
    from app.engines.audiobook_utils import _create_temp_manifest

    if not segment_wavs:
        on_output("No segments to stitch.\n")
        return 1

    list_file = _create_temp_manifest(f"{output_path.stem}_", ".list.txt")
    try:
        with open(list_file, "w") as lf:
            for sw in segment_wavs:
                lf.write(_ffmpeg_concat_entry(sw))

        # Simple concat for segments (they should all be same sample rate/channels from the synthesis engine)
        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(output_path),
        ]
        from .proc_utils import run_cmd_stream
        return run_cmd_stream(cmd, on_output, cancel_check)
    finally:
        if list_file.exists():
            list_file.unlink()


def _ffmpeg_concat_entry(path: Path) -> str:
    """Format an absolute path for FFmpeg's concat 'file' protocol."""
    resolved = path.resolve()
    normalized = resolved.as_posix().replace("'", r"'\''")
    return f"file '{normalized}'\n"



# 60 peaks/sec (up from 8) so the tightest tape zoom (3s window, see
# TAPE_ZOOM_PRESETS_SEC in frontend/src/app/layout/waveformTapeZoomPresets.ts)
# yields 180 real peaks across the 180-bar render budget (TAPE_BAR_COUNT) —
# one real sample per bar instead of ~24 samples nearest-neighbor-stretched
# across 180 bars (the "low resolution at full zoom" bug). A 15-min chapter
# sidecar grows from ~8k floats (~43KB JSON) to ~54k floats (~325KB JSON),
# still a single small cached artifact fetched once per chapter open.
PEAKS_PER_SEC = 60
PEAKS_MAX = 200_000
# Bumped 1 -> 2 for the PEAKS_PER_SEC 8->60 density increase above. The
# loader (_load_or_compute_peaks_sidecar in app/api/routers/chapters_assets.py)
# treats any version mismatch against the current SIDECAR_VERSION as stale and
# recomputes, so previously-cached low-density .peaks.json sidecars are
# transparently replaced on next fetch rather than served stale forever.
SIDECAR_VERSION = 2

# DoS guard: the mono-f32le decode below is buffered whole in memory (raw bytes
# plus an array copy) and the peak loop iterates every sample in pure Python —
# both scale with duration * sample_rate with no natural ceiling. Cap the number
# of decoded samples we will materialize; longer inputs are downsampled by
# ffmpeg to stay under it. 20M samples ~= 80 MB raw + 80 MB array, and the
# per-sample Python loop stays bounded regardless of how long the source is.
PEAKS_MAX_DECODE_SAMPLES = 20_000_000


def compute_peaks_sidecar(wav_path: Path) -> dict | None:
    """Computes a downsampled peaks sidecar for wav_path.

    Returns None on any failure (probe failure, ffmpeg failure, empty audio) —
    callers must treat None as "sidecar unavailable," never raise past this
    function.

    Race safety: stats wav_path before AND after the ffmpeg read; if the stat
    changed (a concurrent re-render rewrote the file mid-read), returns None
    rather than risk stamping a torn read as valid data.
    """
    try:
        stat_before = wav_path.stat()
        duration_sec = probe_audio_duration(wav_path)
        sample_rate, channels = probe_audio_stream_info(wav_path)
        if duration_sec <= 0 or sample_rate <= 0:
            return None

        num_peaks = min(math.ceil(duration_sec * PEAKS_PER_SEC), PEAKS_MAX)

        # Bound peak memory/CPU: if the source would decode to more than
        # PEAKS_MAX_DECODE_SAMPLES samples, ask ffmpeg to downsample. Short and
        # typical inputs are unaffected (decode at native rate, byte-identical);
        # long inputs still get a faithful 8-peaks/sec overview at a coarser
        # rate instead of exhausting memory inside the request handler.
        decode_rate = sample_rate
        if duration_sec * sample_rate > PEAKS_MAX_DECODE_SAMPLES:
            decode_rate = max(PEAKS_PER_SEC * 4, int(PEAKS_MAX_DECODE_SAMPLES / duration_sec))

        cmd = ["ffmpeg", "-v", "error", "-i", str(wav_path), "-f", "f32le", "-ac", "1"]
        if decode_rate != sample_rate:
            cmd += ["-ar", str(decode_rate)]
        cmd.append("-")
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
        )
        if proc.returncode != 0:
            return None
        raw = proc.stdout
        samples = array.array("f")
        samples.frombytes(raw[: len(raw) - (len(raw) % 4)])

        bucket_size = max(1, len(samples) // num_peaks)
        peaks = []
        for i in range(0, len(samples), bucket_size):
            chunk = samples[i : i + bucket_size]
            if not chunk:
                continue
            peaks.append(round(min(1.0, max(abs(s) for s in chunk)), 3))
            if len(peaks) >= num_peaks:
                break

        stat_after = wav_path.stat()
        if stat_before.st_size != stat_after.st_size or stat_before.st_mtime_ns != stat_after.st_mtime_ns:
            return None  # torn read — a concurrent re-render happened mid-compute

        return {
            "version": SIDECAR_VERSION,
            "peaks": peaks,
            "duration_sec": duration_sec,
            "sample_rate": sample_rate,
            "channels": channels,
            "peaks_per_sec": PEAKS_PER_SEC,
            "source": {
                "filename": wav_path.name,
                "size_bytes": stat_after.st_size,
                "mtime_ns": stat_after.st_mtime_ns,
            },
        }
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def peaks_sidecar_path(wav_path: Path) -> Path:
    """Return the canonical peaks-sidecar path for ``wav_path`` (sibling ``.peaks.json``)."""
    return wav_path.with_suffix(".peaks.json")


def _read_fresh_sidecar(sidecar_path: Path, stat: os.stat_result) -> dict | None:
    """Return the cached sidecar dict iff it exists and is fresh, else None.

    "Fresh" means the cached sidecar's stamped version/size/mtime match
    ``stat`` (the WAV's current stat) — any mismatch (stale re-render or a
    ``SIDECAR_VERSION`` bump) is treated as stale so callers recompute rather
    than serve stale data. Unreadable/corrupt cache files degrade to None.
    """
    if not sidecar_path.exists():
        return None
    try:
        existing = json.loads(sidecar_path.read_text())
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    src = existing.get("source", {})
    if (
        existing.get("version") == SIDECAR_VERSION
        and src.get("size_bytes") == stat.st_size
        and src.get("mtime_ns") == stat.st_mtime_ns
    ):
        return existing
    return None


def _atomic_write_sidecar(sidecar_path: Path, sidecar: dict) -> None:
    """Best-effort atomic write of a peaks sidecar (write ``.json.tmp`` → ``os.replace``).

    Caching is best-effort: a failed write (disk full, permission, temp-path
    race) is logged and swallowed so callers still keep the freshly computed
    peaks rather than discarding a valid result or surfacing an error.
    """
    try:
        tmp_path = sidecar_path.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(sidecar))
        os.replace(tmp_path, sidecar_path)
    except OSError:
        logger.warning("Failed to write peaks sidecar at %s", sidecar_path, exc_info=True)


def ensure_peaks_sidecar(wav_path: Path, sidecar_path: Path | None = None) -> dict | None:
    """Return a fresh peaks sidecar for ``wav_path``, computing + caching on miss.

    Single implementation of the sidecar cache format (freshness check +
    atomic write) shared by the lazy GET-route helper
    (``_load_or_compute_peaks_sidecar``) and the render-time finalization hook.

    Returns the sidecar dict (a fresh cached one or a freshly computed one) or
    None when the WAV is unreadable or peaks cannot be computed. Never raises
    past ``compute_peaks_sidecar``'s own None contract.

    Not internally locked: the GET route wraps it in a per-WAV-path lock to
    serialize concurrent requests; the render hook fires once per render so
    needs no lock.
    """
    if sidecar_path is None:
        sidecar_path = peaks_sidecar_path(wav_path)

    # The WAV can be deleted/replaced between a caller's exists() check and
    # this stat by a concurrent re-render; a missing file degrades to None.
    try:
        stat = wav_path.stat()
    except OSError:
        return None

    fresh = _read_fresh_sidecar(sidecar_path, stat)
    if fresh is not None:
        return fresh

    sidecar = compute_peaks_sidecar(wav_path)
    if sidecar is None:
        return None

    _atomic_write_sidecar(sidecar_path, sidecar)
    return sidecar
