# Task 03 — `studio_plugin_sdk/proc.py` + `audio.py` (mechanism moves; app wrappers inject policy)

Context: 00-overview.md. Depends on task 01. ONE implementation each; app keeps thin wrappers.

## Verify FIRST
- `app/engines/proc_utils.py` (439 lines) couplings: line 17 `TRANSIENT_DIR`, line 18
  `coerce_subprocess_output` (from `app.utils.subprocess_utils`) — decide: move
  `coerce_subprocess_output` into `studio_plugin_sdk/proc.py` too if it's dependency-free
  (`sed -n 1,40p app/utils/subprocess_utils.py`), else inline the needed logic. Identify exactly
  which functions plugins need: only `run_cmd_stream` (xtts engine.py line 25). Move the minimal
  subset; the marker-path helpers using TRANSIENT_DIR (line 31) either stay in app or take an
  explicit `scratch_dir: Path` param per approach.
- `wav_to_mp3` in `app/engines/audio_ops.py` (lines 20–49): needs `MP3_QUALITY` (module-level from
  `app.core.config`) and `run_cmd_stream`. Probe helpers subset check — what do plugins actually
  call besides wav_to_mp3? `grep -rn "audio_ops\." plugins --include="*.py" | grep -v tests`
  (voxtral tests patch `stitch_segments`/`get_audio_duration` but those go through the HOST context,
  not plugin code — do NOT move them unless plugin non-test code calls them directly).

## TDD
New `tests/engines/test_sdk_proc_audio.py`: identity tests
(`app.engines.proc_utils.run_cmd_stream` delegates to / is `studio_plugin_sdk.proc.run_cmd_stream`;
same for wav_to_mp3 wrapper) + a wrapper test that `app.engines.audio_ops.wav_to_mp3` passes
MP3_QUALITY into the SDK function (mock the SDK fn — R2 boundary). No real ffmpeg runs; no sleeps (R4).

## Changes
- NEW `studio_plugin_sdk/proc.py`: `run_cmd_stream(cmd, on_output, cancel_check, *, scratch_dir: Path | None = None)`
  — signature-compatible for existing callers; TRANSIENT_DIR coupling becomes the explicit param.
  `app/engines/proc_utils.py` re-exports/wraps injecting TRANSIENT_DIR.
- NEW `studio_plugin_sdk/audio.py`: `wav_to_mp3(in_wav, out_mp3, *, quality: int, on_output=None, cancel_check=None)`.
  `app/engines/audio_ops.wav_to_mp3` becomes the wrapper injecting MP3_QUALITY (public signature unchanged).
- Note: `studio_plugin_sdk/context.py`'s fn-body `from app.engines.audio_ops import wav_to_mp3`
  (host side) is FINE — host context keeps app policy.

## Acceptance
- `pytest tests/engines/test_sdk_proc_audio.py -q`; full suite parity.
- Existing monkeypatch sites in host tests still valid (they patch `app.engines.audio_ops.*` which
  is still what host code calls).
- Code-map queue entry.
