"""Chapter timing sidecar generation (synced-reader task 003).

Builds and writes the `<chapter_wav_stem>.timing.json` sidecar described by
`design-docs/plans/active/synced_reader/01-timing-contract.md`, using the
`chapter_segment_timing` schema (version 1) validated by
`app.domain.chapters.timing.validate_timing_sidecar`.

Duration measurement reads WAV headers directly via the stdlib `wave` module
(frames / framerate * 1000, rounded to the nearest ms) -- no ffprobe subprocess
per group. This module is pure computation plus one atomic file write: it does
not touch the DB and does not reconstruct the ordered group/WAV-path list
itself (that is the caller's job -- see Task 4 / `01-findings.md` §3).
"""
from __future__ import annotations

import json
import logging
import os
import time
import wave
from pathlib import Path

from .timing import ChapterGroupTiming, validate_timing_sidecar

logger = logging.getLogger(__name__)

# Reconciliation tolerances (milliseconds) between the sum of measured group
# durations and the assembled chapter WAV's own measured duration. Small drift
# is expected (e.g. ffmpeg concat container overhead) and only warned about;
# drift beyond the hard ceiling means something is genuinely wrong (e.g.
# mismatched sample rates across engines) and the sidecar write
# must be skipped rather than publish a wrong timeline.
DRIFT_WARN_TOLERANCE_MS = 50
DRIFT_HARD_CEILING_MS = 250


class TimingReconciliationError(Exception):
    """Raised when measured group durations drift beyond DRIFT_HARD_CEILING_MS
    from the assembled chapter WAV's own measured duration.

    The caller (the orchestrator's post-finalize hook) is expected to catch
    this and skip writing a sidecar for this render rather than publish a
    timeline that doesn't match the audio.
    """


def measure_wav_duration_ms(wav_path: Path) -> int:
    """Read a WAV file's duration in whole milliseconds from its header.

    Uses the stdlib `wave` module (frames / framerate * 1000, rounded to the
    nearest int) -- a cheap header-only read, no ffprobe subprocess. Raises if
    the file doesn't exist or isn't readable as a WAV file; callers decide how
    to handle that (this function does not swallow it).
    """
    if not wav_path.is_file():
        raise FileNotFoundError(f"WAV file not found: {wav_path}")
    try:
        with wave.open(str(wav_path), "rb") as wf:
            nframes = wf.getnframes()
            framerate = wf.getframerate()
    except wave.Error as exc:
        raise ValueError(f"Not a readable WAV file: {wav_path}") from exc
    if framerate <= 0:
        raise ValueError(f"WAV file {wav_path} has invalid framerate: {framerate}")
    return round(nframes / framerate * 1000)


def build_chapter_timing(
    chapter_id: str,
    chapter_wav_path: Path,
    ordered_groups: list[dict],
    audio_generated_at: float,
) -> ChapterGroupTiming | None:
    """Compute the chapter_segment_timing payload for a finalized chapter WAV.

    `ordered_groups` is a list of `{"group_id": str, "wav_path": Path,
    "segment_ids": list[str]}` dicts already in stitch order -- the caller
    (Task 4) is responsible for reconstructing this list; it is not
    reconstructed here.

    Pure computation: reads WAV files, does not touch the DB or write
    anything to disk. Returns None if there are no contributing groups
    (nothing to time -- constructing a zero-group sidecar for a chapter WAV
    that genuinely has audio would misrepresent the contract's
    audio_duration_ms == 0 empty-groups case).
    """
    if not ordered_groups:
        return None

    group_durations_ms = [
        measure_wav_duration_ms(group["wav_path"]) for group in ordered_groups
    ]
    chapter_duration_ms = measure_wav_duration_ms(chapter_wav_path)

    sum_ms = sum(group_durations_ms)
    drift_ms = abs(sum_ms - chapter_duration_ms)

    if drift_ms > DRIFT_HARD_CEILING_MS:
        raise TimingReconciliationError(
            f"chapter {chapter_id!r}: sum of group durations ({sum_ms}ms) drifts "
            f"from chapter WAV duration ({chapter_duration_ms}ms) by {drift_ms}ms, "
            f"exceeding the hard ceiling of {DRIFT_HARD_CEILING_MS}ms"
        )
    if drift_ms > DRIFT_WARN_TOLERANCE_MS:
        logger.warning(
            "chapter %s: sum of group durations (%sms) drifts from chapter WAV "
            "duration (%sms) by %sms, exceeding warn tolerance of %sms",
            chapter_id,
            sum_ms,
            chapter_duration_ms,
            drift_ms,
            DRIFT_WARN_TOLERANCE_MS,
        )

    groups_payload = []
    offset_ms = 0
    for order, (group, duration_ms) in enumerate(zip(ordered_groups, group_durations_ms)):
        start_ms = offset_ms
        end_ms = start_ms + duration_ms
        groups_payload.append(
            {
                "group_id": group["group_id"],
                "segment_ids": group["segment_ids"],
                "order": order,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "duration_ms": duration_ms,
            }
        )
        offset_ms = end_ms

    # Always snap the last group's end_ms to the chapter's own measured
    # duration, regardless of drift -- required by the contract's exact-tiling
    # rule (ffmpeg concat container overhead can differ from the sum of raw
    # PCM frame counts by a few ms even in the success case).
    last_group = groups_payload[-1]
    last_group["end_ms"] = chapter_duration_ms
    last_group["duration_ms"] = last_group["end_ms"] - last_group["start_ms"]

    payload = {
        "schema": "chapter_segment_timing",
        "version": 1,
        "chapter_id": chapter_id,
        "audio_file": chapter_wav_path.name,
        "audio_generated_at": audio_generated_at,
        "audio_duration_ms": chapter_duration_ms,
        "generated_at": time.time(),
        "group_count": len(ordered_groups),
        "groups": groups_payload,
    }

    return validate_timing_sidecar(payload)


def write_timing_sidecar(sidecar_path: Path, timing: ChapterGroupTiming) -> None:
    """Atomically write `timing` as JSON to `sidecar_path` (temp file + rename)."""
    tmp_path = sidecar_path.with_suffix(sidecar_path.suffix + ".tmp")
    tmp_path.write_text(
        json.dumps(timing.model_dump(by_alias=True), indent=2),
        encoding="utf-8",
    )
    os.replace(tmp_path, sidecar_path)
