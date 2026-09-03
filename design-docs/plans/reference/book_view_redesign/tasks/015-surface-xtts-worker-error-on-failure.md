# 015 — Surface the XTTS worker's real error when synthesis produces no file

- **Status:** done (diagnostics) · the underlying synthesis failure is still pending the now-surfaced cause
- **Workload:** Real-app bug fixes
- **Severity / type:** major · diagnosability (live bug, 2026-06-17)
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** the real "synthesis did not produce an audio file" fix (need the surfaced cause first)

## Goal
A failed XTTS synthesis reports the worker's real stderr instead of the opaque `"did not produce an audio file." / NoneType: None`.

## Why this matters
A chapter render 500'd with `XTTS synthesis did not produce an audio file.` and a bare `NoneType: None` in the TTS server log. The worker spawned, ran ~20s (model cold-load), then failed — but the cause was unknowable because `engine.synthesize`'s local `parse_output` only handled `[START_SEGMENT]`/`[SEGMENT_SAVED]` markers and discarded the worker's stderr (the real traceback). Can't fix an invisible failure.

## What was done
- `plugins/tts_xtts/plugin/server/engine.py` `synthesize()`: capture all worker output lines in a bounded `deque(maxlen=40)`; on the `rc != 0 or not render_wav_path.exists()` failure return, append the tail (capped ~4000 chars) to the error. `app/tts_server/server.py` already logs `result.error`, so the tail now reaches the server log.
- Test: `plugins/tts_xtts/tests/test_engine_failure_output.py` (3 cases; monkeypatches the runtime boundary `_xtts_generate` per R2). Revert-checked.

## Acceptance criteria
- [x] A failed synthesis surfaces the worker's stderr tail in `TTSResult.error`.
- [x] Revert-checked test; `pytest -q` green (1 pre-existing unrelated failure); `ruff` clean.

## Out of scope / follow-up
- **The actual synthesis failure** ("did not produce an audio file") is environment/runtime-level and its cause was being swallowed. NEXT: restart the TTS server (it's long-lived — must reload this code), reproduce the render, and read the new **"Worker output tail:"** in the TTS server log. Likely causes for a fresh worker that runs ~20s then yields no file: XTTS model/checkpoint load failure, a bad/missing reference wav or `latent.pth` for the resolved voice, or an MPS/torch runtime error during inference. Open a fix task once the surfaced cause is known.
