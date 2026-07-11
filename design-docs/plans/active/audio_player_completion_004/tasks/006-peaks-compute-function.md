Status: complete — 2026-07-10

# 006 — Backend peaks compute function

Workload: C · Risk: `quality-sensitive` (concurrent-write race must be handled correctly) · Blocked-by: none · Blocks: 007

## Goal

A pure(ish) function that computes a downsampled, versioned peaks sidecar for a WAV file — no route, no orchestrator hook. This is the compute primitive task 007's route calls on demand.

**This task replaces** `design-docs/plans/active/audio_player_waveform_scrubber/tasks/011-backend-peaks-sidecar-emission.md`'s compute logic — that draft assumed emission at an orchestrator completion chokepoint that **does not fire for the app's default engines** (XTTS/mixed use a chapter-fanout path that bypasses it entirely — verified, not a guess). Do not implement any orchestrator hook. Do not add any field to `ArtifactOutputModel`/the artifact manifest — that layer is confirmed scaffold-only in production (a bare Protocol, never instantiated, the real reconciliation caller passes no manifest) and a field there would be dead weight.

## Why it matters

This is the one piece of new backend surface area in the whole plan. Getting the compute-on-request shape right here (not a producer-side hook) is what makes W3 correct for every render path instead of just a minority of them.

## Map links

See `../01-map.md` — Parts: `audio_ops.py`, `subprocess_utils.py`. Invariants: versioned contracts, no import-time side effects (this function has no side effects of its own — task 007's route is what calls it inside a request handler).

## Files

### Edit

- `app/engines/audio_ops.py` — add `compute_peaks_sidecar`.
- `app/utils/subprocess_utils.py` — add `probe_audio_stream_info`, mirroring the existing `probe_audio_duration` (~lines 36-52) in shape: subprocess call, timeout, coerced output parsing, safe zero/empty fallback on non-zero return code.

### Create

- `tests/engines/test_peaks_sidecar.py`

## Target shape / contract

### `app/utils/subprocess_utils.py` — new helper

```python
def probe_audio_stream_info(audio_path: Path, *, timeout: int = 2) -> tuple[int, int]:
    """Returns (sample_rate, channels). Mirrors probe_audio_duration's shape/safety."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels",
         "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout,
    )
    stdout = coerce_subprocess_output(getattr(result, "stdout", ""))
    if stdout:
        write_subprocess_output(stdout=stdout)
    returncode = getattr(result, "returncode", 0)
    if not isinstance(returncode, int):
        returncode = 0
    if returncode != 0:
        return (0, 0)
    lines = [l.strip() for l in stdout.strip().splitlines() if l.strip()]
    if len(lines) < 2:
        return (0, 0)
    try:
        return (int(lines[0]), int(lines[1]))
    except ValueError:
        return (0, 0)
```

Reuse the exact same `coerce_subprocess_output`/`write_subprocess_output` helpers `probe_audio_duration` already uses (read that function first, at the top of `subprocess_utils.py`, and match its conventions exactly — same timeout pattern, same defensive `getattr` on `returncode`).

### `app/engines/audio_ops.py` — new compute function

```python
PEAKS_PER_SEC = 8
PEAKS_MAX = 100_000
SIDECAR_VERSION = 1

def compute_peaks_sidecar(wav_path: Path) -> Optional[dict]:
    """
    Computes a downsampled peaks sidecar for wav_path. Returns None on any
    failure (probe failure, ffmpeg failure, empty audio) — callers must treat
    None as "sidecar unavailable," never raise past this function.

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
        # Decode mono f32le via ffmpeg, chunk-read, max-abs-per-bucket downsample.
        # Bucket size in samples derived from sample_rate * duration_sec / num_peaks.
        proc = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(wav_path), "-f", "f32le", "-ac", "1", "-"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
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
```

Values must be in **`[0, 1]`** (max-abs magnitude), matching the frontend browser-decode provider's existing convention in `WaveformTape.tsx` — **not** `[-1, 1]`.

Confirm the exact import style/module layout conventions already used at the top of `audio_ops.py` before adding `array`/`math`/`Optional` imports — match the file's existing style.

## Steps

- [x] Read `probe_audio_duration` in full to match its conventions.
- [x] Add `probe_audio_stream_info` to `subprocess_utils.py`.
- [x] Add `compute_peaks_sidecar` to `audio_ops.py`.
- [x] Write `tests/engines/test_peaks_sidecar.py`: mock the `subprocess.run` boundary only (R2) with deterministic f32le bytes; assert bucket math, `version: 1` present, `[0,1]` range clamping, exception → `None`, stat-mismatch (implemented via a duck-typed `_FakePath` wrapper returning distinct `.stat()` values before/after, rather than globally monkeypatching `pathlib.Path.stat`) → `None`.
- [x] R1 revert-check: confirmed the stat-mismatch test fails when the race-guard comparison is removed from `compute_peaks_sidecar` (verified live, then restored the fix).
- [x] `./venv/bin/python -m pytest tests/engines/test_peaks_sidecar.py -q` green (12 passed).
- [x] `ruff check app/engines/audio_ops.py app/utils/subprocess_utils.py` — all checks passed.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] `compute_peaks_sidecar` returns a dict matching the exact schema above, or `None` — never raises.
- [x] Peaks values are in `[0, 1]`.
- [x] Stat-before/stat-after mismatch → `None` (race guard verified by a test, not just present in code).
- [x] `probe_audio_stream_info` mirrors `probe_audio_duration`'s error-handling shape exactly.
- [x] Tests mock only the subprocess boundary (R2); no filesystem writes happen in this task (that's task 007's job) — this function computes and returns a dict, it does not write a file.
- [x] `pytest`/`ruff` clean.

## Out of scope

- Writing the sidecar to disk / atomic replace — task 007.
- The serving route / compute-on-miss trigger — task 007.
- Any orchestrator or synthesis/assembly hook — deliberately rejected, see "Goal" above.
