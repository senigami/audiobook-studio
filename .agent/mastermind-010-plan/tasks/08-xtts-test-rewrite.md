# Task 08 — XTTS test-suite import rewrite (29 files) with pass-count parity

Depends on 04, 06. Mechanical churn hides regressions: record
`pytest plugins/tts_xtts -q | tail -1` count BEFORE, assert identical count AFTER (no new skips).

## Changes
- Rewrite `from app.engines.voice.sdk import …` → `studio_plugin_sdk.types` in:
  test_engine_progress_relay.py (4×), test_model_load_started_emit.py (2×), test_xtts_timing.py,
  test_xtts_run_test_shared_boilerplate.py, test_voice_input_resolution.py, test_plugin_script.py,
  test_multi_segment_marker_emission.py, test_engine_failure_output.py, test_check_output.py.
- `from app.studio_plugin_sdk.context import StudioPluginContext` (test_force_rerender.py) → SDK.
- Rewrite `plugins.tts_xtts.*`-rooted imports to repo-portable form (relative to plugin root, working
  with plugin-local conftest — coordinate with task 11; for now keep in-tree-working form):
  `grep -rn "plugins.tts_xtts" plugins/tts_xtts/tests | head -20`.
- Repoint monkeypatches: `grep -rn "app.engines.audio_ops\|app.engines.proc_utils" plugins/tts_xtts/tests`
  — for each, decide by what code path the test drives: plugin server code → patch
  `studio_plugin_sdk.audio`/`studio_plugin_sdk.proc` (or the engine module's imported name —
  remember `from x import y` binds locally: patch `plugins…engine.run_cmd_stream` style target);
  host-context paths → leave `app.*`. List every decision in the PR.
- DO NOT touch test_multi_segment_marker_emission.py / test_app_adapter.py beyond sdk-type imports —
  they move in task 10.
- `from app.db.models import Job` tests (test_xtts_lexicon.py, test_jobs_extended.py, test_handler.py,
  test_force_rerender.py): leave for task 11 (local fakes) — only note them.

## Acceptance
- `pytest plugins/tts_xtts -q` pass count identical to before. Any assertion changed → R1 revert-check.
- Full suite parity; no code-map entry needed unless mapped files touched (tests usually unmapped — check
  `docs/code-map/tools/lookup.sh plugins/tts_xtts/tests` or grep map.json).
