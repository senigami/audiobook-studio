"""Audio processing operations for engine execution."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Callable

from app.core.config import MP3_QUALITY
from app.utils.subprocess_utils import probe_audio_duration


def wav_to_mp3(
    in_wav: Path,
    out_mp3: Path,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> int:
    """Convert WAV to MP3 using FFmpeg."""
    def noop(*_args):
        return None

    def never_cancel():
        return False

    if on_output is None:
        on_output = noop
    if cancel_check is None:
        cancel_check = never_cancel

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(in_wav),
        "-codec:a",
        "libmp3lame",
        "-q:a",
        str(MP3_QUALITY),
        str(out_mp3),
    ]
    from .proc_utils import run_cmd_stream
    return run_cmd_stream(cmd, on_output, cancel_check)


def convert_to_wav(in_file: Path, out_wav: Path) -> int:
    """Converts any audio file to a standard 22050Hz mono WAV (best for voice references)."""
    cmd = ["ffmpeg", "-y", "-i", str(in_file), "-ar", "22050", "-ac", "1", str(out_wav)]
    return subprocess.run(cmd, check=False).returncode


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
