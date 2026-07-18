# Task 01 — Create real `studio_plugin_sdk/` package + app shims (move, never copy)

Context: 00-overview.md. Plugins are NOT touched in this task; they keep importing `app.*` and the
sys.modules alias stays (deleted in task 02). Green suite required at end.

## TDD first step
Write `tests/engines/test_sdk_module_identity.py` (new) asserting, for each moved symbol:
`app.engines.voice.sdk.TTSRequest is studio_plugin_sdk.types.TTSRequest`, same for TTSResult,
VerificationResult, TTSTimingResult, SegmentTimingResult, TimingEvent, VoiceProcessingHooks
(verify full export list: `grep -n "^class\|^def\|__all__" app/engines/voice/sdk.py`);
`app.engines.voice.base.StudioTTSEngine is studio_plugin_sdk.engine.StudioTTSEngine`;
`app.studio_plugin_sdk.context.StudioPluginContext is studio_plugin_sdk.context.StudioPluginContext`
(+ JobSpec, JobResult, get_plugin_ctx, load_settings_schema, make_segment_output_handler).
It must FAIL before the move (no top-level package), pass after.

## Files
- NEW `studio_plugin_sdk/__init__.py` — re-export public surface + `SDK_VERSION = "1.0"`.
  Public surface = what plugins use: types.*, StudioTTSEngine, StudioPluginContext, JobSpec, JobResult,
  get_plugin_ctx, load_settings_schema, make_segment_output_handler, errors. Do NOT export
  BaseVoiceEngine / EngineHealthModel / EngineManifestModel / EngineRequestError / EngineExecutionError
  (currently exported by `app/studio_plugin_sdk/__init__.py` lines 45–47 — those stay available ONLY
  via the app shim for app-side importers).
- NEW `studio_plugin_sdk/types.py` ← entire body of `app/engines/voice/sdk.py` (195 lines, zero app.* — verified).
- NEW `studio_plugin_sdk/engine.py` ← `StudioTTSEngine` class cut from `app/engines/voice/base.py`.
  `BaseVoiceEngine` (uses EngineRequestError/EngineHealthModel, base.py lines 25–26) STAYS in app.
  Verify what StudioTTSEngine itself references: `grep -n "class StudioTTSEngine" -A 5 app/engines/voice/base.py`
  and check its methods for app.* usage; if any, resolve to types-only or flag.
- NEW `studio_plugin_sdk/context.py`, `plugin_utils.py`, `_import_utils.py` ← moved from
  `app/studio_plugin_sdk/`. CAVEAT: context.py has ~40 FUNCTION-BODY `from app.…` imports (host-side
  implementation). Keep them; they must remain function-body. `plugin_utils.py` line 30 imports
  `app.studio_plugin_sdk.context` → rewrite to relative `.context`.
- NEW `studio_plugin_sdk/errors.py` ← from `app/studio_plugin_sdk/errors.py`, replacing the guarded
  `from app.engines.errors import EngineBridgeError` (line 22) with an SDK-owned hierarchy
  (e.g. `class SDKError(Exception)`, `class BridgeError(SDKError)`). The app shim must keep
  `BridgeError` name compatibility — check consumers: `grep -rn "BridgeError" app plugins --include="*.py"`.
- NEW `studio_plugin_sdk/py.typed` (empty).
- SHIM `app/engines/voice/sdk.py` → explicit-name re-export from `studio_plugin_sdk.types` (keep `__all__`).
- SHIM section in `app/engines/voice/base.py` → keep BaseVoiceEngine; import StudioTTSEngine from SDK.
- SHIM `app/studio_plugin_sdk/__init__.py`, `context.py`, `errors.py`, `plugin_utils.py`,
  `_import_utils.py` → one-line re-exports from the real package (keeps existing app-side importers
  AND the still-present alias working; `plugin_loader.py` line 23 imports `_import_utils` — must keep working).

## Contract to preserve
Every symbol importable today from `app.engines.voice.sdk`, `app.engines.voice.base`,
`app.studio_plugin_sdk[.context|.errors|.plugin_utils]` remains importable with identical identity.
No import-time side effects in the new package.

## Acceptance
- `pytest tests/engines/test_sdk_module_identity.py tests/engines/test_studio_plugin_sdk.py -q`
- `pytest -q` full suite, pass-count parity.
- `grep -rEn "^from app|^import app" studio_plugin_sdk/` → nothing at module level
  (context.py fn-body imports allowed).
- Code-map queue entry in `design-docs/code-map/queue/` (moved modules + shims).
