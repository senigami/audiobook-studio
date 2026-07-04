# PL-1 — One SDK context factory (code-map queue entry)

Task: `design-docs/plans/active/simplification/06_plugin_consolidation.md` PL-1.

Pure refactor, zero behavior change. New exported symbol:
`app.studio_plugin_sdk.get_plugin_ctx(engine_id: str) -> StudioPluginContext`.

An identical ~13-line lazy-singleton block (module-global `_ctx_instance = None`,
a `_get_ctx()` using `global`, and a try/except dual-import of
`StudioPluginContext` from `studio_plugin_sdk` vs `app.studio_plugin_sdk`) was
duplicated across 9 plugin modules, differing only in the `engine_id` string.
That construction logic now lives in exactly one place. Each plugin module
still exposes a local, patchable `_get_ctx()` (required by ~25 existing test
call sites that `patch("<module>._get_ctx", ...)`), but its body is now a
one-line delegate to the shared factory instead of a duplicated singleton +
import block.

## Files changed
- `app/studio_plugin_sdk/plugin_utils.py` (new) — `get_plugin_ctx(engine_id)`:
  a `dict[str, StudioPluginContext]` cache keyed by `engine_id`, lazily
  constructing one `StudioPluginContext` per distinct engine_id and reusing
  it thereafter. Preserves the exact "one shared instance per engine_id"
  semantic the 9 original per-module globals had (never a single
  cross-engine shared instance).
- `app/studio_plugin_sdk/__init__.py` — imports and re-exports
  `get_plugin_ctx` from `plugin_utils`; added to `__all__`.
- `plugins/tts_xtts/plugin/studio/bake.py` — `_get_ctx()` now delegates to
  `get_plugin_ctx("xtts")`; removed local `_ctx_instance` global and inline
  `StudioPluginContext` construction.
- `plugins/tts_xtts/plugin/studio/segments.py` — same change, `"xtts"`.
- `plugins/tts_xtts/plugin/studio/handler.py` — same change, `"xtts"`
  (module still exports `_get_ctx` in `__all__`, unchanged).
- `plugins/tts_xtts/plugin/studio/voice_adapter.py` — same change, `"xtts"`.
- `plugins/tts_xtts/plugin/studio/standard_handler.py` — same change, `"xtts"`.
- `plugins/tts_voxtral/plugin/studio/bake.py` — same change, `"voxtral"`.
- `plugins/tts_voxtral/plugin/studio/segments.py` — same change, `"voxtral"`.
- `plugins/tts_voxtral/plugin/studio/handler.py` — same change, `"voxtral"`.
- `plugins/tts_mixed/handler.py` — `_get_ctx()` now calls
  `get_plugin_ctx("mixed")` on first use and caches the result on the
  module-level `_ctx_instance` (kept, unlike the other 8 modules) because
  `set_ctx(ctx)` — a live injection hook called from
  `app/orchestration/tasks/synthesis.py` to inject a dispatcher-owned
  `StudioPluginContext` before `handle_mixed_job` — overwrites that same
  global, and `tests/orchestration/test_synthesis_task_and_resources.py`
  observes it directly (`mixed_handler._ctx_instance`). `set_ctx` itself is
  unchanged.
- `tests/engines/test_studio_plugin_sdk.py` — added
  `TestGetPluginCtxFactory`: same-engine_id returns the same cached
  instance, different engine_ids never collide, and `_engine_id` is threaded
  through correctly. This is new coverage for an invariant that previously
  had no direct test (only reachable indirectly via patched `_get_ctx()` in
  each plugin's own suite).

## Verification
- `./venv/bin/python -m pytest plugins/tts_xtts/tests plugins/tts_voxtral/tests plugins/tts_mixed/tests -q` → 240 passed, 2 skipped.
- `./venv/bin/python -m pytest tests/engines/test_studio_plugin_sdk.py -q` → 60 passed.
- `./venv/bin/python -m pytest -q` (full suite) → 2180 passed, 3 skipped.
- `./venv/bin/python -m ruff check .` → All checks passed.
- `grep -rn "^def _get_ctx" plugins/ app/studio_plugin_sdk/` → the 9 thin
  patchable accessors remain (required by existing tests); `grep -rln
  "StudioPluginContext(" plugins/ app/studio_plugin_sdk/` (excluding
  `tests/`) → only `app/studio_plugin_sdk/plugin_utils.py` constructs
  `StudioPluginContext` directly.

## Flow impact
None. Every call site still resolves to the same `StudioPluginContext`
instance per engine_id as before (same singleton-per-engine semantics, same
lazy-construction timing, same patchability for tests) — only the
construction + dual-import logic moved from 9 duplicated blocks into one
shared factory in the SDK.
