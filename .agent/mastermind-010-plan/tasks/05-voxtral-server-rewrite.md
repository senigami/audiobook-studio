# Task 05 — Voxtral server import rewrite

Same pattern as task 04 (read it). Depends on 02, 03.

## Exact sites (verified)
- `plugins/tts_voxtral/plugin/server/engine.py` lines 18, 19 (sdk types + StudioTTSEngine),
  line 315 (fn-body wav_to_mp3 → `studio_plugin_sdk.audio` with quality param, same sourcing rule as task 04).
- Sweep: `grep -rEn "from app|import app" plugins/tts_voxtral/plugin/server plugins/tts_voxtral/plugin/core plugins/tts_voxtral/interface.py plugins/tts_voxtral/cli.py plugins/tts_voxtral/preview 2>/dev/null` → zero at end.
- `plugins/tts_voxtral/tests/test_voxtral_implementation.py` line 288 patches
  `app.engines.audio_ops.wav_to_mp3` — repoint to `studio_plugin_sdk.audio.wav_to_mp3` if the code
  path under test is plugin server code (verify what it exercises before repointing; if it exercises
  HOST bake flow via context, leave as-is).

## Acceptance
- Boundary grep empty; `pytest plugins/tts_voxtral -q`; full suite parity; code-map queue entry.
