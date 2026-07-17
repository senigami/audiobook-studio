# Task 06 — plugin/studio: rewrite SDK imports only; app.* function-body imports stay

Context: 00-overview.md boundary (Checkpoint-2 renegotiation). Depends on 02.

## Scope
In `plugins/tts_xtts/plugin/studio/*.py` and `plugins/tts_voxtral/plugin/studio/*.py`, rewrite every
`app.studio_plugin_sdk` import (module-level AND function-body) to `studio_plugin_sdk`:
- xtts: `app_adapter.py` (get_plugin_ctx, plugin_utils.load_settings_schema, JobSpec fallbacks),
  `bake.py`, `segments.py`, `standard_handler.py`, `handler.py`, `voice_adapter.py`
  (errors.BridgeError, plugin_utils.make_segment_output_handler, get_plugin_ctx).
- voxtral: `app_adapter.py` + any others
  (`grep -rn "app.studio_plugin_sdk" plugins/tts_voxtral/plugin/studio/`).
- LEAVE ALONE: fn-body `from app.db…`, `app.utils.text…`, `app.jobs…`, `app.engines.behavior…`
  imports — documented host-integration surface.
- `plugins/tts_xtts/plugin/studio/app_adapter.py` line ~315 fn-body
  `from app.engines.audio_ops import wav_to_mp3`: this is HOST-side bake code — it may stay app.*
  (function-body) OR move to SDK audio for consistency; prefer stay (host policy, MP3_QUALITY) and
  note in README. Do not change behavior.
- OPTIONAL (approach doc, informational): add `host_api_used` list to each plugin README or manifest
  metadata enumerating reached-into app symbols — generate via
  `grep -rhoE "from app\.[a-z_.]+ import [A-Za-z_]+" plugins/<p>/plugin/studio | sort -u`.

## Contract
`plugin/studio` modules import cleanly OUTSIDE a Studio host (module-level app-free); behavior in
host unchanged.

## Acceptance
- `grep -rEn "^from app|^import app" plugins/tts_xtts/plugin/studio plugins/tts_voxtral/plugin/studio` → empty (module-level).
- `pytest plugins -q`; full suite parity; code-map queue entry.
