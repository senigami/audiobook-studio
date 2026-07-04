# PL-3 — Move app-adapter helpers + run_test boilerplate into BaseVoiceEngine (code-map queue entry)

Task: `design-docs/plans/active/simplification/06_plugin_consolidation.md` PL-3. Highest-risk of
the three sequential BE-2/PL-5/PL-3 lanes (touches the shared engine base class used by all
engines). Pure refactor: no observable behavior change for either plugin, verified by new tests
and a caught-and-fixed bug during that verification (see below).

## Class-name correction vs. the task brief

The task said "Add a default `run_test(...)` to `BaseVoiceEngine`." That class name is wrong for
the actual code: `app/engines/voice/base.py` defines two separate classes —
`BaseVoiceEngine` (a plain, non-ABC class; `XttsVoiceEngine`/`VoxtralVoiceEngine` in
`studio/app_adapter.py` subclass this) and `StudioTTSEngine(ABC)` (the SDK contract that
`XttsPlugin`/`VoxtralPlugin` in `server/engine.py` subclass — this is where `run_test()` already
lived, including its prior "not implemented" default). `run_test()` and the concrete plugin
`run_test()` overrides all belong to the `server/engine.py` / `StudioTTSEngine` side, not the
`studio/app_adapter.py` / `BaseVoiceEngine` side — those are two different engine-contract
hierarchies for two different processes (TTS Server subprocess vs. Studio process). Added
`run_test`'s shared implementation to `StudioTTSEngine`, and the four request-adapter helpers
(`_normalize_output_format`, `_resolve_output_path`, `_resolve_on_output`, `_resolve_cancel_check`)
to `BaseVoiceEngine`, matching where their respective callers actually live.

## Files changed

- `app/engines/voice/base.py`:
  - `BaseVoiceEngine` gained four public helpers (dropped the leading underscore — they're now a
    shared contract, not a private implementation detail): `normalize_output_format` (classmethod,
    takes `engine_name` for error text), `resolve_output_path`, `resolve_on_output`,
    `resolve_cancel_check` (all `@staticmethod`, take `engine_name` for error text). Byte-identical
    logic to the four methods removed from each plugin, parameterized only by `engine_name` —
    never branches on engine ID.
  - `StudioTTSEngine.run_test()` gained a real shared implementation (previously always returned
    the "not implemented" `VerificationResult`). New signature:
    `run_test(self, *, asset_search_order=None, default_text=None, settings=None)`. When
    `asset_search_order` is omitted, preserves the original "not implemented" behavior exactly (so
    any future/third-party engine that does not override `run_test` sees no change). When
    provided, runs the shared asset-resolution + synth-test flow: `check_env()` (or
    `check_env(settings=...)` — see below), search `asset_search_order` candidates in
    `assets/`, read `test_text` from `manifest.json` (falling back to `default_text`), build a
    `TTSRequest`, call `self.synthesize(req)`, wrap the result.
  - `plugin_dir` is resolved via `Path(inspect.getfile(type(self))).parents[2]` — `type(self)`
    (the concrete subclass) so each plugin's own file location is used, matching the original
    per-plugin `Path(__file__).parents[2]`.
  - `check_env` settings-threading: reused the *exact* same introspection `verification.py`'s
    `_accepts_settings()` already uses in production (`VAR_KEYWORD` or a `settings` param name) —
    not a simplified version. This mattered: my first draft used a simpler
    `"settings" in inspect.signature(check_env).parameters` check, which a new test caught as
    wrong (see "Bug caught by tests" below).
- `app/studio_plugin_sdk/plugin_utils.py` — added `load_settings_schema(schema_path, *,
  engine_name)`, extracted from the identical `_load_settings_schema()` duplicated in both
  `studio/app_adapter.py` files. Cached per `schema_path` (dict keyed by path, so xtts and voxtral
  never share a cache entry) and always logs a warning on failure (voxtral already did; xtts
  previously failed silently — this is a strict improvement, not a behavior loss, since neither
  plugin's success path changed). One intentional divergence from the two originals: this cache
  only caches *successful* parses, not failures — xtts's old `@lru_cache(maxsize=1)` cached `{}`
  forever on any failure (even a transient one), which was arguably a latent bug; the new version
  will retry on the next call if the file was temporarily missing/malformed. No test depended on
  the old cache-the-failure behavior.
- `app/studio_plugin_sdk/__init__.py` — exports `load_settings_schema` alongside `get_plugin_ctx`.
- `plugins/tts_xtts/plugin/studio/app_adapter.py` / `plugins/tts_voxtral/plugin/studio/app_adapter.py`
  — removed the four private helpers and `_load_settings_schema`; call sites now call
  `self.normalize_output_format(request, engine_name="XTTS"/"Voxtral", ...)` etc., and
  `settings_schema()` computes its own `schema_path` and calls the shared
  `load_settings_schema(schema_path, engine_name=...)`. Removed now-unused imports
  (`Callable`, `lru_cache` in xtts; `Callable`, `json` in voxtral — `logger` left defined in
  voxtral even though its only caller was removed, since it's a harmless, idiomatic
  module-level logger other code in the file may use later).
- `plugins/tts_xtts/plugin/server/engine.py` / `plugins/tts_voxtral/plugin/server/engine.py` —
  `run_test()` is now a one-liner: `return super().run_test(asset_search_order=[...],
  default_text="...")` (voxtral additionally threads `settings=settings or {}`). Each override's
  own signature is unchanged (`XttsPlugin.run_test(self)`, `VoxtralPlugin.run_test(self,
  settings=None)`) — this matters because `app/tts_server/verification.py`'s `_accepts_settings()`
  introspects the *override's* signature, not the shared base method, to decide whether to call
  `run_test(settings=...)` or `run_test()`. Verified unchanged: `_accepts_settings(VoxtralPlugin().run_test)`
  → `True`, `_accepts_settings(XttsPlugin().run_test)` → `False`, matching pre-refactor dispatch.

## New tests

- `plugins/tts_xtts/tests/test_xtts_run_test_shared_boilerplate.py` (5 tests) and
  `plugins/tts_voxtral/tests/test_voxtral_run_test_shared_boilerplate.py` (7 tests) — the real
  plugin classes had zero prior direct tests of `run_test()` (only fake test-double engines
  exercised the `verify_plugin()` dispatch layer). These exercise the real `XttsPlugin`/
  `VoxtralPlugin.run_test()` end to end, mocking only `synthesize()` (the actual TTS engine
  boundary, per R2) and `check_env()`: asset search order/priority, manifest `test_text` override,
  `default_text` fallback, the "no assets found" failure path, `check_env` failure short-circuit,
  and (voxtral-only) `settings` threading into both `check_env(settings=...)` and
  `TTSRequest.settings`.
- **Isolation from the real plugin `assets/` folder**: `plugins/tts_xtts/plugin/assets/` and
  `plugins/tts_voxtral/plugin/assets/` are live, shared locations populated by actual engine
  usage (e.g. a real `latent.pth` voice-clone latent). An early draft of the xtts test used the
  real path and briefly, accidentally deleted a tracked `plugins/tts_xtts/assets/latent.pth`
  during a debugging cycle before the isolated-tmp_path design was finalized; caught immediately
  via `git status`, restored with `git checkout HEAD -- plugins/tts_xtts/assets/latent.pth`, and
  confirmed clean before this commit. The final tests never touch any real repo path — they patch
  `app.engines.voice.base.inspect.getfile` to redirect `plugin_dir` resolution into a `tmp_path`
  with a fake `<root>/plugin/server/engine.py` layout matching the real directory depth.
- Two test files share the basename `test_run_test_shared_boilerplate.py` across the two plugin
  `tests/` dirs (neither has an `__init__.py`, so pytest's rootless import collided — "import file
  mismatch"). Renamed to `test_xtts_run_test_shared_boilerplate.py` /
  `test_voxtral_run_test_shared_boilerplate.py`.

## Bug caught by tests (why the adversarial pass mattered)

Writing `test_run_test_threads_settings_into_check_env_and_request` first (R1-style) caught a
real defect in my initial `run_test` draft: `patch.object(plugin, "check_env", side_effect=fn)`
produces a `MagicMock` whose `inspect.signature()` is always `(*args, **kwargs)` regardless of the
wrapped function's real signature — so a naive `"settings" in signature(check_env).parameters`
check evaluated `False` even when the mock's `side_effect` was `def fake_check_env(*, settings=None)`.
Fixed by reusing the same `VAR_KEYWORD`-or-named-`settings` check that
`app/tts_server/verification.py::_accepts_settings` already uses in production — which also
correctly handles the mock case (a `**kwargs` catch-all is present in the synthetic mock
signature). Confirmed both real (non-mocked) engines still dispatch identically to before via a
direct `_accepts_settings()` check against the real bound methods.

## Verification

- `./venv/bin/python -m pytest plugins/tts_xtts/tests plugins/tts_voxtral/tests plugins/tts_mixed/tests -q --no-cov` → 252 passed, 2 skipped (240 baseline + 12 new).
- `./venv/bin/python -m pytest -q --no-cov` (full suite) → 2192 passed, 3 skipped (2180 baseline + 12 new).
- `./venv/bin/python -m ruff check .` → All checks passed.
- Manually verified: `settings_schema()` returns distinct, correct schemas per engine (no
  cross-contamination in the path-keyed cache); returned dict is a copy so caller mutation never
  corrupts the cache (matches original `dict(schema)` defensive-copy behavior); `XttsPlugin.run_test()`
  with no assets/settings threading still produces `TTSRequest(settings={})`, identical to the
  pre-refactor call that never passed `settings=` at all (dataclass default is also `{}`).

## Flow impact

None observable. `/api/v1/tts` and the Settings UI's "Test Engine" action call the same
`run_test()` entry points with the same signatures and same dispatch logic
(`app/tts_server/verification.py` unchanged); `synthesize`/`preview`/`validate_request` on both
`XttsVoiceEngine` and `VoxtralVoiceEngine` produce byte-identical error messages and request
handling — only the helper implementations moved to a shared, engine-agnostic location on
`BaseVoiceEngine`/`StudioTTSEngine`.
