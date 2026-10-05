Status: complete — 2026-07-10

# 006 — Backend peaks compute function

Workload: C · DONE.

Added `compute_peaks_sidecar` (`app/engines/audio_ops.py`) — a pure compute primitive returning a versioned (`version: 1`), self-describing peaks dict (`peaks`, `duration_sec`, `sample_rate`, `channels`, `peaks_per_sec`, `source` stat-stamp) or `None` on any failure, never raising. Values are `[0, 1]` max-abs magnitude. Race-safe: stats the WAV before/after the ffmpeg read, discards on mismatch (concurrent re-render). Added `probe_audio_stream_info` (`app/utils/subprocess_utils.py`), mirroring `probe_audio_duration`'s existing error-handling shape exactly. `tests/engines/test_peaks_sidecar.py` (12 tests) mocks only the subprocess boundary (R2); the stat-mismatch race guard was R1 revert-checked (fails when the guard is removed).

Explicitly rejected (verified, not assumed): any orchestrator/synthesis-completion hook — at the time of this task, that chokepoint did not fire for the app's default engines (XTTS/mixed use a chapter-fanout path that bypasses it). This function is called on-demand only, by task 007's route. (Note: a later, separate change — audio-player.md 1.6.8 — added a proactive orchestrator hook on top of this; see that spec's changelog. Does not change anything in this task's own correctness.)

See `status.json` for commit `f567681d`.
