# Task 10 — Evict Studio-integration tests from plugin folders to host `tests/`

Depends on 08. These test Studio's loading/orchestration, not the plugin; they can't live in a
standalone repo.

## Moves (git mv semantics — but this repo may prefer plain move + delete; follow repo convention)
- `plugins/tts_xtts/tests/test_multi_segment_marker_emission.py` → `tests/engines/` (imports
  app.orchestration.tasks.base, orchestrator_helpers, app.engines.watchdog — verified). Fix any
  plugin-relative fixture paths after move (`grep -n "fixtures\|Path(__file__)" <file>`).
- Split `plugins/tts_xtts/tests/test_app_adapter.py`: the `EngineManifestModel` parts
  (line: `from app.engines.models import EngineManifestModel`) → `tests/engines/test_xtts_app_adapter_host.py`;
  plugin-portable parts stay.

## Acceptance
- Total suite pass count UNCHANGED (tests moved, not dropped) — compare full `pytest -q` counts.
- `grep -rn "app.orchestration\|app.engines.watchdog\|app.engines.models" plugins/tts_xtts/tests plugins/tts_voxtral/tests` → empty.
