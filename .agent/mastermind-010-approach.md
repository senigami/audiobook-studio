# Phase 2 output — chosen approach (fusion of 3-panel reasoning, adjudicated by conductor)

Problem statement: see `.agent/mastermind-010-problem-statement.md` (locked at Checkpoint 1).

## The approach

**Invert the SDK dependency.** Create top-level `studio_plugin_sdk/` at repo root as the REAL package
(plugins already `import studio_plugin_sdk` via the loader's sys.modules alias — the import name is
already published). Contents:

- `types.py` ← moved body of `app/engines/voice/sdk.py` (already zero app.*; moves verbatim).
- `engine.py` ← `StudioTTSEngine` extracted from `app/engines/voice/base.py`. `BaseVoiceEngine` and
  app-flavored helpers STAY in app (host-side adapter surface, legitimately needs
  EngineRequestError/EngineHealthModel).
- `context.py`, `plugin_utils.py`, `errors.py`, `_import_utils.py` ← moved from `app/studio_plugin_sdk/`
  (context is stdlib-only already). `errors.py`: replace the guarded `from app.engines.errors import
  EngineBridgeError` with a clean SDK-owned exception hierarchy (kill the app smell).
- `proc.py` ← plugin-safe `run_cmd_stream` moved from `app/engines/proc_utils.py`, with the
  TRANSIENT_DIR coupling made an explicit `scratch_dir: Path` parameter (host injects).
  `app.engines.proc_utils` re-exports/wraps.
- `audio.py` ← `wav_to_mp3(src, dst, *, quality: int)` — mechanism moves to SDK;
  `app.engines.audio_ops.wav_to_mp3` becomes a thin wrapper injecting MP3_QUALITY (ONE implementation;
  no policy fork). Only the subset engines need moves — probe helpers as needed.
- `__init__.py` re-exports the public surface + `SDK_VERSION = "1.0"` (S8 gate alignment).
  DROP BaseVoiceEngine/EngineHealthModel/EngineRequestError from the SDK public surface — app types
  don't launder through the portable SDK. (`app/studio_plugin_sdk/` shim may keep re-exporting them
  for existing app-side importers.)
- `py.typed`; keep package dependency-free so later pip extraction is trivial. NO pyproject/PyPI now
  for the SDK itself.

**Re-export shims (zero app-side churn):** `app/engines/voice/sdk.py` → explicit-name re-export from
`studio_plugin_sdk.types`. `app/engines/voice/base.py` keeps BaseVoiceEngine, re-exports
StudioTTSEngine from the SDK. `app/studio_plugin_sdk/__init__.py` (+`context`,`errors`) → one-line
re-export shims. Move definitions, NEVER copy — add a test asserting
`app.engines.voice.sdk.TTSRequest is studio_plugin_sdk.types.TTSRequest` (module identity).

**Delete the sys.modules alias** in `plugin_loader._register_sdk_alias` — the real package resolves
naturally (repo root on sys.path in tts_server subprocess AND pytest pythonpath=.). Two module objects
for one class is the top identity hazard. Clean-break policy supports deletion. Check for tests
asserting the alias.

**Plugin import rewrite:** every `app.engines.voice.sdk/base` / `app.studio_plugin_sdk` import in
`plugins/tts_xtts/**` and `plugins/tts_voxtral/**` (code AND tests) → `from studio_plugin_sdk import ...`.
xtts engine.py's `run_cmd_stream` → `studio_plugin_sdk.proc`; both engines' fn-body `wav_to_mp3` →
`studio_plugin_sdk.audio` with quality from settings/context.

**plugin/studio/* boundary — DoD renegotiation (unanimous panel):** studio-side handlers keep
function-body app.* imports (gate-enforced by s4/s5/s6; they only execute inside a Studio host).
Mediating that surface through StudioPluginContext is a separate versioned-contract workstream —
explicitly out of scope. The DoD grep becomes: zero app.* in `plugin/server/`, `plugin/core/`,
`interface.py`, `cli.py`, and zero MODULE-LEVEL app.* in `plugin/studio/` (existing gates).
Document in each plugin README: "plugin/studio/ is host-integration code (runs in-process in Studio,
uses host APIs); everything else imports only studio_plugin_sdk." Optionally inventory reached-into
app.* symbols per plugin (informational `host_api_used` list) as the spec for the future context
expansion. USER MUST CONFIRM at Checkpoint 2.

**Repo-ready folder work (per plugin):**
- `LICENSE` file matching manifest license (xtts: CPML-1.0 — flag reconcile; voxtral: its declared one).
- `.gitignore` (__pycache__, .DS_Store, egg-info, model caches). Purge committed .DS_Store files.
- Manifest `distribution` block (placeholder repo URLs github.com/audiobook-studio/tts-xtts|tts-voxtral,
  per plan §1.2 shape). Loader ignores unknown keys today → zero-risk additive. Optionally add lenient
  shape validation in _validate_manifest (if present: dict), but DO NOT add a 5th required version
  field. Standalone repos never set built_in.
- Minimal per-plugin `pyproject.toml` (name, version, future studio-plugin-sdk dep, pytest config) —
  enables future standalone CI, inert in-tree.
- README rewrite to standalone-repo framing (resource profile per plan §2).
- `dev/scenarios.json`: move under tests/fixtures if used, else drop. Verify assets/latent.pth size
  (multi-MB → flag for release-asset download instead; do not delete without owner check).

**Tests repo-readiness (C's catch, in scope):**
- Plugin-local `conftest.py` per plugin: local fixtures replacing root-conftest dependencies; make
  tests import via a path that works BOTH in-tree (pytest testpaths=plugins) and standalone.
- Rewrite `plugins.tts_xtts.*`-rooted imports in plugin tests.
- Evict Studio-integration tests to host `tests/`: xtts `test_multi_segment_marker_emission.py`
  (imports app.orchestration/watchdog) and the EngineManifestModel parts of `test_app_adapter.py` —
  they test Studio's loading, not the plugin.
- Tests importing `app.db.models.Job` etc.: local fakes or SDK JobSpec.
- Repoint monkeypatches of `app.engines.audio_ops.wav_to_mp3` / `proc_utils.run_cmd_stream` to the
  SDK modules where plugins now call them.
- Full suite pass-count parity before/after; R1 revert-check anything with changed assertions.

**Rest of dispatch-doc scope (unchanged from plan 05):** SUPERSEDED banner on
v2_engine_bundle_github_distribution.md; registry JSON finalize; paste-URL install finalize; E2E
install-flow + trust-warning tests §5.3; Group 4 tts_mixed registration (built_in already set —
verify + uninstall-suppression + builtin:true vs built_in key naming check); docs/state 6.1–6.3;
specs bump (engines-and-plugins.md, install-distribution.md) + wiki changelog + code-map queue entry.

## Top risks (carry into plan)
1. Class-identity split-brain (move-not-copy; identity test; delete alias same commit).
2. Monkeypatch drift in plugin tests after utils move.
3. Test-rewrite scale (~28 xtts files) — regressions hide in mechanical churn; enforce pass-count parity.
4. SDK surface creep — extend AST gate/CI check: studio_plugin_sdk/ itself must have zero app.* imports.

## Explicitly NOT doing
- No StudioPluginContext capability expansion (studio-side SDK mediation) — future workstream.
- No PyPI publishing, no SDK repo split, no vendored SDK copies.
- No engine-ID branches in core; no loosening manifest/folder gates.
- No touching tts_mixed beyond plan Group 4 items.
- No update-flow test §5.2 (post-v2).
