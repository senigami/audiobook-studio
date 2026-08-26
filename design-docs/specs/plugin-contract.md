# Plugin Contract

```
spec_version: 1.12.0
updated: 2026-08-26
status: active
sources:
  - app/engines/voice/sdk.py
  - app/tts_server/plugin_loader.py
  - app/tts_server/plugin_manifest.py
  - app/tts_server/server.py
  - app/engines/registry.py
  - studio_plugin_sdk/__init__.py
  - studio_plugin_sdk/context.py
  - studio_plugin_sdk/text.py
  - scripts/validate_plugin_manifests.py
  - tts_engines/tts_xtts/manifest.json
  - tts_engines/tts_xtts/plugin/core/implementation.py
  - tts_engines/tts_xtts/plugin/server/engine.py
  - tts_engines/tts_voxtral/manifest.json
  - tts_engines/tts_mixed/manifest.json
```

> **TL;DR:** Every TTS plugin is a folder (or pip entry point) with a `manifest.json` and a class implementing `StudioTTSEngine`; Studio treats the manifest as the source of truth for discovery, capabilities, resource requirements, and chunk limits.

## Changelog

| Version | Date       | Change                 |
|---------|------------|------------------------|
| 1.12.0  | 2026-08-26 | **New optional `behavior.features` flag: `delegation_only`.** Additive, same class of change as `segment_orchestration`/`cps_eta` (see 1.6.0). Marks an engine that dispatches every segment to a real sub-engine and does no synthesis itself — today, only `tts_mixed`. Frontend's per-engine concurrency-cap control (`EngineCard.tsx`) previously gated on `segment_orchestration` to hide itself for delegation-only engines, but that flag actually means "this engine's chapters use Studio's chunk-group fan-out with resumable recovery" (`app/engines/behavior.py`), which `tts_xtts` also declares despite being a real synthesizer with genuine, capped per-engine concurrency. The conflation hid the control for XTTS entirely — the one engine an operator would most want to tune — leaving it visible only for Voxtral, whose manifest caps it at 1 anyway. `tts_mixed/manifest.json` now also declares `delegation_only`; `EngineCard.tsx` gates on that instead. Also fixed in the same change: the control's own description text claimed "takes effect on next app restart", stale since 1.12.0 of `queue-jobs.md` (task 014, 2026-07-11) made both `tts_parallel_cap` and `tts_engine_caps` live, re-resolved fresh on every admission attempt. |
| 1.11.0  | 2026-08-24 | **Issue #200 Stage C: `tts_xtts` reaches zero `app.*` imports in shipped plugin code, and the gate has no exemptions left. SDK 1.2.** The v1.10.0 entry's `_STAGE_C_EXEMPT` (`app_adapter.py`'s guarded `from app.studio_plugin_sdk import BaseVoiceEngine, ...`) is deleted along with its companion test, because the reason for it is gone. Four changes, all additive to the SDK: (1) **The engine bridge error tree moved into `studio_plugin_sdk/engine_errors.py`.** All six classes (`EngineBridgeError`, `EngineRequestError`, `EngineUnavailableError`, `EngineNotReadyError`, `EngineExecutionError`, `EngineOutputRejectedError`) were stdlib-only with no imports at all, so they moved verbatim; `app/engines/errors.py` is now a re-export shim with identical object identity. The whole tree moves as ONE unit and `EngineBridgeError` keeps rooting at `RuntimeError`, deliberately NOT at the SDK's own `StudioException`: seven live `except EngineBridgeError` sites in the host plus the `tts_mixed` and `tts_voxtral` handlers depend on that single root, and re-parenting any class silently stops those clauses matching without raising anything. Verified by mutation, not by reasoning: with `EngineExecutionError` re-parented under `StudioException`, the entire engine and plugin suite (768 tests) still passed. `tests/engines/test_engine_error_hierarchy.py` now pins every direct parent by name against hand-written literals and asserts every class is caught by both `except EngineBridgeError` and `except RuntimeError`. (2) **`ResourceProfile`, `EngineManifestModel` and `EngineHealthModel` moved into `studio_plugin_sdk/engine_models.py`**, frozen dataclasses over stdlib only; `app/engines/models.py` re-exports them and keeps `EngineRegistrationModel`, which pairs a manifest with a resolved engine object and flattens both for `/api/engines`. That is host orchestration glue, not plugin contract, and it stays app-side. (3) **New `studio_plugin_sdk.VoiceEngineAdapter`, a `runtime_checkable` Protocol** over the nine app-adapter methods, plus the four PL-3 request helpers (`normalize_output_format`, `resolve_output_path`, `resolve_on_output`, `resolve_cancel_check`) published as module-level SDK functions. (4) **`BaseVoiceEngine` did NOT move and is still not exported by the SDK** (`test_sdk_module_identity.py::test_base_voice_engine_stays_in_app` stands, now with the reasoning recorded on it). Publishing it would ship nine `NotImplementedError` stubs and four concrete method bodies into the contract and put a second engine base class next to `StudioTTSEngine`. It keeps working for anything still using it, and now BINDS the SDK's four helper functions with `staticmethod` rather than holding a second copy, so `self.normalize_output_format(...)` and `studio_plugin_sdk.normalize_output_format(...)` cannot drift. `XttsVoiceEngine` subclasses nothing and declares all nine methods itself, including the three (`validate_environment`, `current_settings`, `build_voice_asset`) it used to inherit, with the behavior the base gave them. **SDK 1.1 to 1.2:** additive surface plus relocations behind re-exports, nothing removed or reshaped, so shipped manifests stay at `"sdk_version": "1.0"` and remain valid under the derived rule from 1.9.0. **Not done here, flagged:** `tts_voxtral` still has the identical guarded import and is untouched; `tts_engines/tts_xtts/tests/conftest.py` still has four `app.*` imports, which the gate does not cover, and `studio_plugin_sdk/context.py` still has ~30 function-body `app.*` imports, so the SDK an extracted plugin depends on is itself host-coupled at call time. |
| 1.10.0  | 2026-08-24 | **Issue #200 Stage B: `tts_xtts/plugin/studio/` reaches zero `app.*` imports, and the gate that proves it is live.** The 31 function-body `app.*` imports the v1.9.0 entry counted are gone from `adapter.py`, `bake.py`, `segments.py`, `standard_handler.py`, and `app_adapter.py`. Every one of them sat inside a module-level alias function; the alias NAMES are unchanged (tests patch them as module attributes), only what they resolve to changed, from `app.*` to the SDK context. `test_studio_zero_app_imports_at_any_scope` is no longer `xfail` and now fails on any new `app.*` import at any scope. One exemption remains, named in `_STAGE_C_EXEMPT` and keyed on (file, module) so it cannot cover anything else: `app_adapter.py`'s guarded `from app.studio_plugin_sdk import BaseVoiceEngine, ...`. Removing that needs a plugin-facing registration contract in the SDK rather than a re-export of the app-side base class, which is Stage C. A companion test fails if the exemption ever outlives the import it names. Two SDK gaps the migration exposed, fixed in the SDK rather than absorbed at the call site: (1) **`ctx.wav_to_mp3` now takes `on_output` and `cancel_check` and returns `int`** (was: dropped both, returned `None`). The wrapped `app.engines.audio_ops.wav_to_mp3` has always accepted both and returned the ffmpeg exit code, so a plugin swapping a direct import for the ctx method silently lost cancellation in a render path and could no longer tell a failed transcode from a good one. (2) **`ctx.get_chapter_dir` gains an optional `project_id`.** It previously took only `chapter_id` and re-derived the project from the DB; a caller already holding a project id now passes it, skipping the read and keeping its own id authoritative. Both are additive, so shipped manifests stay at `sdk_version: "1.0"` and SDK stays at 1.1. **Shape traps for anyone migrating another plugin the same way, all three found here:** `ctx.get_speaker_wavs` returns a **split `list[str]`**, while the render path downstream still parses the legacy comma-joined **string** (`str(sw).split(",", 1)[0]`) - `adapter._get_speaker_wavs` and `app_adapter.select_voice` re-join before returning; `ctx.get_chapter_dir` / `ctx.get_voices_dir` / `ctx.get_voice_profile_dir` return **`str`**, not `Path`; and `ctx.update_queue_item` forwards every field explicitly by keyword, so a test asserting the old positional `(job_id, status)` call shape must be updated even though the values are identical. |
| 1.9.0   | 2026-08-24 | **SDK 1.1 (issue #200): two new capabilities, one corrected return type, one new load-time check, and a reversal of v1.3.0's import tolerance.** (1) `ctx.get_lexicon(project_id) -> list[dict]` added to the §3.3 Text Preparation group: a scoped read of the project's pronunciation-substitution entries, shaped like the existing `ctx.get_chapter_segments` (plain dicts, never a DB handle). (2) `apply_lexicon(text, entries) -> str` MOVED into the SDK as `studio_plugin_sdk/text.py`, a stdlib-only pure utility matching the `audio.py` / `proc.py` shape; it depended only on `re`, so it is a mechanism rather than a host-policy wrapper. `app/utils/text/lexicon.py` is now a re-export shim and Studio's own caller (`app/orchestration/tasks/synthesis.py`) imports from the SDK, so there is one implementation reached by two paths. (3) **Corrected return type (breaking for any caller relying on the old shape, of which there were none in production):** `ctx.split_long_sentences(text, char_limit)` now returns `str`, not `list[str]`. The wrapped `safe_split_long_sentences` has always returned a string; the SDK wrapped it as `[result]`, so a plugin swapping its local alias for the ctx method would have fed a list into a synthesis script. (4) **New load-time check:** the manifest's declared `sdk_version` is now validated against the installed `studio_plugin_sdk.SDK_VERSION` (same major, at or below its minor), replacing the hardcoded `{"1.0"}` entry in `_SUPPORTED_VERSION_FIELDS`. Nothing previously compared the two, so the field was decorative and would have gone stale on the first bump; the rule is now derived from the package and cannot drift. Mismatch raises `PluginLoadError` naming both the declared and the installed version. `scripts/validate_plugin_manifests.py` applies the same derived rule. The other three version fields keep their `{"1.0"}` allow-lists. Shipped manifests stay at `"sdk_version": "1.0"` and remain valid. `app/studio_plugin_sdk/__init__.py` re-exports `SDK_VERSION` instead of declaring its own literal. (5) **Reversal of v1.3.0 note (6).** That entry tolerated function-body `app.*` imports in bake/segments/standard_handler because tests monkeypatch those targets, resolving "with S9 dispatcher integration". Owner decision 2026-08-24: the tolerance is withdrawn, ahead of that trigger, because `tts_xtts` cannot be extracted into its own public repo (issue #189) while it reaches into `app.*`, and the first published plugin is the example third-party authors copy. The rule for in-tree plugins is now the same as for standalone ones: zero `app.*` imports at any scope. A new xfail(strict) gate in `tts_engines/tts_xtts/tests/test_s4_import_cleanliness.py` walks the full AST and currently reports **31** such imports across `adapter.py`, `bake.py`, `segments.py`, `app_adapter.py`, and `standard_handler.py`; issue #200 Stage B removes them and the gate turns green. `tts_mixed` keeps its `built_in: true` exemption. |
| 1.8.0   | 2026-07-17 | **BUG 1 fix: optional top-level `dependency_check: "external"` manifest field** (see §Optional `dependency_check` field). Additive — absent preserves prior "bundled" behavior (`requirements.txt` checked against the server venv). `tts_xtts/manifest.json` now declares it, since its inference deps (torch, coqui-tts, transformers, ...) are installed only into the separate `~/xtts-env` by `run.sh`, never the server venv — the prior unconditional check permanently reported xtts `needs_setup` on any install where the server venv doesn't happen to carry those deps. `tts_xtts`'s `check_env()` (`plugin/server/engine.py`) no longer does an in-process `import TTS` (checks the wrong interpreter); it now calls the plugin's new `xtts_env_ready()` (`plugin/core/implementation.py`), a filesystem-only check of the external env (no import, no subprocess — cheap enough for the 5s heartbeat and every `/synthesize` call). `POST /engines/{id}/install` (`app/tts_server/server.py`) now refuses (400) for `dependency_check: "external"` engines rather than pip-installing their deps into the server venv. Readiness is keyed off the `coqui_tts-*.dist-info` completion marker (not the bare `TTS` package dir, which pip populates before an install finishes — avoids ready/not-ready flapping mid-install) and scans every candidate `site-packages` dir under the env root (not just the first by sort order, which could pick a stale `lib/pythonX.Y` left behind by a Python upgrade). Known limitation documented in-spec: the opt-out is all-or-nothing across the whole `requirements.txt`, including any genuinely server-side base packages a plugin author mixes into the same file. |
| 1.7.0   | 2026-07-16 | **Optional `distribution` manifest block (plan 05 §1.2, repo-ready plugin folders).** Manifests MAY declare a top-level `distribution` object (`host`, `base_url`, `repo`, `git_url`, `topic`, `pin_ref`, `official`) pointing at the plugin's standalone GitHub repo. Shape-validated when present by `_validate_manifest` (dict; string fields typed; `pin_ref` string-or-null; `official` boolean); no field required, block optional — additive, no manifest version bump. In-tree `tts_xtts`/`tts_voxtral` manifests now carry final-shape blocks matching `app/engines/official_registry.py` repo URLs (placeholder `audiobook-studio/*` repos). Standalone-repo plugins never set `built_in`. Also: `tts_voxtral` manifest `license` corrected `"Commercial API"` → `"MIT"` (plugin code license; API usage stays under Mistral's terms). |
| 1.6.0   | 2026-07-16 | **W-PERF safe-foundation: optional export-layer capability fields.** New optional `behavior` sub-fields `export_format` (enum: `ssml_w3c`/`ssml_azure`/`elevenlabs_text`/`ssml_polly`/`plain_text`), `supports_per_span_voice`, `supports_emotion_style`, `supports_prosody`, `supports_break` (booleans, default `false`). Additive/backward-compatible — no manifest version bump, same class of change as prior `behavior.features` additions (`segment_orchestration`, `cps_eta`). Consumed only by the export layer (task 011, not yet built) via new `app.engines.behavior.export_capabilities_for()` helper — distinct from the render-pipeline's `has_behavior(engine_id, "ssml_directives")` feature-string gate (sibling `chapter_editor_catalog_completion` plan's task 006, not yet landed). No real plugin manifest declares these fields; validated as optional (type/enum-checked when present, absent is fine) in `plugin_loader.py`. |
| 1.5.0   | 2026-07-11 | Closes the last real Stage 3 residue: `tts_engines/tts_xtts/plugin/studio/app_adapter.py` and `tts_engines/tts_voxtral/plugin/studio/app_adapter.py` (11 module-level `from app.*` imports total, flagged as a factual regression by a 2026-07-01 audit — these files were never in the S4/S5 import-cleanliness tests' target list, so the original "zero module-level imports" sign-off never covered them). `studio_plugin_sdk` gains five new app-adapter-contract exports: `BaseVoiceEngine`, `EngineHealthModel`, `EngineManifestModel`, `EngineExecutionError`, `EngineRequestError` — the app-side engine-registry base class and its data/error types a plugin's `app_adapter.py` subclasses/raises to register with the app's `VoiceBridge`, distinct from `StudioTTSEngine` (the server-side, per-job contract already exported). Both `app_adapter.py` files migrated to the SDK exports plus existing `ctx.get_voices_dir()` / `ctx.resolve_voice_preview_inputs()` context methods (note: `ctx.resolve_voice_preview_inputs` returns a dict `{voice_ref, voice_profile_dir}`, not the raw function's tuple — callers must adapt). Both import-cleanliness test suites (`test_s4_import_cleanliness.py`, `test_s5_import_cleanliness.py`) now include `app_adapter` in their target-module list, closing the scope gap that let this regression through. A dead, never-called `run_managed_subprocess_async` import was deleted from tts_xtts's `app_adapter.py` rather than migrated. |
| 1.0.0   | 2026-06-10 | Initial canonical spec |
| 1.1.0   | 2026-06-11 | Additive: optional `behavior.sanitize_categories` list; unknown names cause load error; absent means all categories applied (backward-compatible) |
| 1.2.0   | 2026-06-11 | Additive: optional `check_output(req, result) -> tuple[bool, str]` method on `StudioTTSEngine`; default accept-all; TTS Server calls this after synthesize() and deletes artifact + returns `output_rejected` on (False, reason); crashing hook is failure-isolated (logs + accepts) |
| 1.4.0   | 2026-06-21 | S10: secret-aware plugin settings — `settings_schema.json` properties may carry `"secret": true`; the TTS Server masks such fields as `"***"` on all read-to-client paths (`GET /engines/{id}/settings`, `PUT /engines/{id}/settings` response, `build_engine_detail` `current_settings`); posting the sentinel back never overwrites the stored value; see §Settings schema — secret fields |
| 1.3.1   | 2026-06-16 | Corrected resource-profile documentation: `gpu`, `vram_mb`, `cpu_heavy` are nested inside an optional `resource` object, not top-level manifest keys; mirrors actual manifest layout and `manifest.resource` / `ResourceProfile` in `app/engines/models.py` |
| 1.3.0   | 2026-06-12 | S10 closeout: (1) loader now validates all five required method signatures + declared optional overrides via `inspect.signature` at load time (wrong param name / insufficient arity → `PluginLoadError` naming the method and expected signature; extra optional params tolerated); (2) all four manifest version fields (`contract_version`, `sdk_version`, `settings_schema_version`, `event_envelope_version`) are hard-required since S8; (3) `check_output` §2.3 stale "does not exist yet" note corrected — the method has been in `base.py` since v1.2.0; (4) `ctx.stitch_segments` gains `on_output` and `cancel_check` optional params plus `pdir` (defaults to parent of `out_wav`); returns `int` (was `None`); (5) `ctx.finalize_sample_artifact`, `ctx.run_voice_job`, and `ctx.resolve_voice_preview_inputs` added to §3.3 tables; (6) in-tree plugin wrapper-boundary note: function-body `app.*` imports are tolerated in bake/segments/standard_handler because tests monkeypatch those targets directly (resolves with S9 dispatcher integration); standalone plugins must have zero `app.*` imports at any scope |

---

## Plugin discovery

### Folder plugins

The TTS Server scans the `tts_engines/` directory at startup. A folder qualifies as a
plugin when it contains a `manifest.json` and its folder name matches:

```
^tts_[a-z][a-z0-9]{1,14}$
```

Folders that do not match this pattern are silently skipped (not an error).

### Entry-point plugins

Plugins may also be installed as Python packages that advertise themselves via the
`"studio.tts"` pip entry point group. The entry point value is the
`"module:ClassName"` string used as `entry_class`.

**Precedence rule:** when a folder plugin and a pip-installed plugin share the same
`engine_id`, the folder plugin wins and the pip plugin is ignored.

---

## manifest.json schema

The manifest root object MUST carry `"studio_tts_manifest": "1.0"`. Any other value
(or absence) causes the plugin to be rejected with status `invalid_config`.

### Required fields

| Field          | Type   | Constraint                                                       |
|----------------|--------|------------------------------------------------------------------|
| `studio_tts_manifest` | string | MUST be `"1.0"` — only supported version |
| `engine_id`    | string | Regex `^[a-z][a-z0-9]{1,14}$`; MUST be unique across loaded plugins |
| `display_name` | string | Human-readable label shown in Studio UI |
| `entry_class`  | string | `"module:ClassName"` — regex `^[a-z_][a-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$` |
| `capabilities` | array  | MUST include `"synthesis"`; MAY include `"preview"`, `"voice_cloning"` |

### Optional fields — behavior

All keys live inside an optional `behavior` object:

| Key                  | Type    | Purpose |
|----------------------|---------|---------|
| `text_chunk_limit`   | int     | Maximum characters per synthesis call; see [Chunk limit ownership](#chunk-limit-ownership) |
| `text_split_target`  | int     | Preferred split size (must be ≤ `text_chunk_limit` when both present) |
| `progress_pattern`   | string  | Regex the engine logs against for progress extraction |
| `timing_markers`     | object  | Named timing event labels emitted during synthesis |
| `features`           | array   | Feature-flag strings consumed by Studio UI |
| `sanitize_categories`| array   | Ordered subset of sanitization category names to apply (absent → all; unknown name → load error). Valid names: `quotes`, `acronyms`, `fractions`, `dashes`, `punct_spacing`, `ascii`, `terminal` |
| `required_settings`  | array   | `[{name, message}]` — settings that must be populated before synthesis |
| `synthesis_settings` | array   | Names of settings that are switchable per-synthesis call |
| `export_format`      | string  | W-PERF: one of `ssml_w3c` \| `ssml_azure` \| `elevenlabs_text` \| `ssml_polly` \| `plain_text`. Optional; absent = no export capability declared. Consumed only by the export layer (not yet built) via `app.engines.behavior.export_capabilities_for()` — **not** by the live render pipeline. No plugin declares this today. |
| `supports_per_span_voice` | bool | W-PERF: export-layer capability flag, default `false` when absent. Not consumed by any code path yet beyond `export_capabilities_for()`. |
| `supports_emotion_style` | bool | W-PERF: export-layer capability flag, default `false` when absent. Not consumed by any code path yet beyond `export_capabilities_for()`. |
| `supports_prosody`   | bool    | W-PERF: export-layer capability flag, default `false` when absent. Not consumed by any code path yet beyond `export_capabilities_for()`. |
| `supports_break`     | bool    | W-PERF: export-layer capability flag, default `false` when absent. Not consumed by any code path yet beyond `export_capabilities_for()`. |

### Optional fields — resource profile

All keys live inside an optional `resource` object (exposed in Studio as `manifest.resource` / `ResourceProfile`):

| Key        | Type | Purpose |
|------------|------|---------|
| `gpu`      | bool | Plugin requires exclusive GPU access |
| `vram_mb`  | int  | Estimated VRAM consumption in MB |
| `cpu_heavy`| bool | Plugin saturates CPU and should not share concurrency slot |

### Optional fields — deployment & metadata

| Key           | Type   | Purpose |
|---------------|--------|---------|
| `local`       | bool   | Runs entirely on local machine |
| `cloud`       | bool   | Requires outbound network (cloud API) |
| `network`     | bool   | Any network access (superset) |
| `languages`   | array  | BCP-47 language codes supported |
| `version`     | string | Plugin semver |
| `min_studio`  | string | Minimum Studio version required |
| `author`      | string | Author/org name |
| `license`     | string | SPDX identifier |
| `homepage`    | string | URL |

### Optional fields — verification assets

| Key           | Type   | Purpose |
|---------------|--------|---------|
| `test_text`   | string | Short text used by `run_test()` |
| `test_sample` | string | Path (relative to plugin dir) to reference audio sample |
| `logo`        | object | `{svg: path, png: path}` relative to plugin dir |

### Optional fields — advanced wiring

| Key                  | Type   | Purpose |
|----------------------|--------|---------|
| `dev`                | object | `{enabled: bool, scenarios: path}` — dev-mode only |
| `app_adapter_class`  | string | App-side bridge class name |
| `app_adapter_module` | string | Module path for app-side bridge |
| `worker_logic`       | object | `{engine_handlers: {engine_id: "module:fn"}, kind_handlers: {kind: "module:fn"}}` |

---

## StudioTTSEngine ABC

Every plugin's `entry_class` MUST be a class that inherits from `StudioTTSEngine`
(defined in `app/engines/voice/base.py`; the SDK dataclasses below live in
`app/engines/voice/sdk.py`).

### Required abstract methods

All five methods MUST be implemented or plugin load fails:

| Method | Signature | Contract |
|--------|-----------|---------|
| `info` | `() -> dict` | Return runtime metadata (GPU device, model version loaded, etc.) — MUST be cheap; no I/O |
| `check_env` | `() -> tuple[bool, str]` | Validate environment without loading models; called frequently — MUST NOT load weights |
| `check_request` | `(req: TTSRequest) -> tuple[bool, str]` | Pre-flight validation of a single request; MUST NOT synthesize |
| `synthesize` | `(req: TTSRequest) -> TTSResult` | Generate audio to `req.output_path` |
| `settings_schema` | `() -> dict` | Return a JSON Schema dict describing configurable settings |

### Optional methods

| Method | Signature | Default behaviour when absent |
|--------|-----------|-------------------------------|
| `hooks` | `() -> VoiceProcessingHooks` | No-op hooks |
| `preview` | `(req: TTSRequest) -> TTSResult` | Delegates to `synthesize` |
| `verify` | `(req: TTSRequest) -> VerificationResult` | Skipped; engine treated as unverifiable |
| `run_test` | `() -> VerificationResult` | Engine can never reach `ready` status |
| `check_output` | `(req: TTSRequest, result: TTSResult) -> tuple[bool, str]` | Returns `(True, 'OK')` — accept all; called after synthesize() succeeds; return `(False, reason)` to reject artifact |
| `shutdown` | `() -> None` | No cleanup on unload |

---

## SDK types

```python
@dataclass(frozen=True)
class TTSRequest:
    text: str
    output_path: str
    voice_ref: Optional[str]           # profile name or explicit file path
    settings: dict                     # merged engine settings
    language: str                      # BCP-47
    script: Optional[list[dict]]       # structured chunks with per-chunk metadata
    task_id: Optional[str]
    cancel_check: Optional[Callable[[], bool]]
    on_timing_event: Optional[Callable[[TimingEvent], None]]

@dataclass  # NOTE: not frozen, unlike the others
class TTSResult:
    ok: bool
    output_path: Optional[str]
    duration_sec: Optional[float]
    warnings: list[str]
    error: Optional[str]
    timing: Optional[TTSTimingResult]   # structured timing, not a plain dict

@dataclass(frozen=True)
class VerificationResult:
    ok: bool
    message: str
    details: dict

@dataclass(frozen=True)
class TimingEvent:
    event_name: str          # TimingEventName literal
    timestamp: float
    segment_id: Optional[str]
```

### cancel_check contract

`synthesize` SHOULD poll `req.cancel_check()` at each chunk boundary (at minimum).
When it returns `True` the method MUST return a `TTSResult(ok=False, error="cancelled")`
promptly and MUST NOT leave partial output at `req.output_path`.

---

## App-adapter contract (Studio-process registration)

Distinct from `StudioTTSEngine` (the server-side, per-job contract above), a
plugin's `plugin/studio/app_adapter.py` implements the **reverse-direction**
adapter: a class the Studio process's own engine registry / `VoiceBridge`
instantiates and calls into. As of spec 1.11.0 the contract is **structural**:
the adapter satisfies a Protocol and subclasses nothing host-side, so it never
imports `app.*` at any scope.

```python
from studio_plugin_sdk import (
    VoiceEngineAdapter,     # the Protocol the adapter satisfies (no inheritance)
    EngineHealthModel,      # return type of describe_health()
    EngineManifestModel,    # constructor arg: parsed manifest.json
    EngineExecutionError,   # raised on synthesis/preview failure
    EngineRequestError,     # raised on invalid request shape
)
from studio_plugin_sdk.engine_adapter import (
    normalize_output_format,  # request helpers, module-level functions
    resolve_output_path,
    resolve_on_output,
    resolve_cancel_check,
)


class MyVoiceEngine:  # no base class
    ...
```

`VoiceEngineAdapter` requires all nine of `hooks`, `describe_health`,
`validate_environment`, `validate_request`, `synthesize`, `preview`,
`settings_schema`, `current_settings`, `build_voice_asset`. Being
`runtime_checkable`, `isinstance` against it checks method **presence** only,
never signatures, which is the same guarantee the TTS Server's plugin loader
gives for `StudioTTSEngine`. Nothing is inherited, so an adapter must declare
all nine even where the host has a fallback (no hooks, empty schema, empty
settings).

`BaseVoiceEngine` is the host's own base class and is **not** part of this
contract: it is not exported by `studio_plugin_sdk` and a plugin must not
import or subclass it. It shipped nine `NotImplementedError` stubs and four
concrete method bodies, which is app implementation detail that plugin authors
would inherit without being able to see it. It remains for host-side use and
binds the four SDK helper functions above rather than holding its own copies.

The four request helpers were previously inherited methods and are now plain
functions. They take everything they need as arguments (`request`,
`engine_name`), so the only call-site change is dropping the `self.` prefix.

The four error and data types listed above moved INTO the SDK in 1.11.0 (they
were re-exported from `app.*` between 1.5.0 and 1.10.0). `app/engines/errors.py`
and `app/engines/models.py` re-export them with identical object identity, so
`except EngineBridgeError` and every existing host importer keep working.

`app_adapter.py` files also commonly need a `StudioPluginContext` instance
(`get_plugin_ctx(engine_id)`) for two context methods that predate this
version but are easy to get wrong when migrating an app_adapter off a direct
`app.*` import:

- `ctx.get_voices_dir() -> str` — returns a **string**, not a `Path`; wrap in
  `Path(...)` if the call site needs path operations (`.mkdir()`,
  `tempfile.mkdtemp(dir=...)`, etc.).
- `ctx.resolve_voice_preview_inputs(profile_name) -> dict` — returns
  `{"voice_ref": str | None, "voice_profile_dir": str | None}`. This is **not**
  the same shape as the raw `app.engines.voice_engines.resolve_voice_preview_inputs`
  function it wraps, which returns a 2-tuple `(speaker_wav, voice_profile_dir: Path)`.
  A call site migrating from the raw function to `ctx.resolve_voice_preview_inputs`
  must unpack the dict keys and re-wrap `voice_profile_dir` in `Path(...)` if it
  needs to remain a `Path` downstream.
- `ctx.get_speaker_wavs(profile_name) -> list[str]`: returns the **split
  list**, deliberately, so plugins never parse the legacy comma-separated
  string. The render path downstream has not caught up: it still does
  `str(speaker_wavs).split(",", 1)[0]`, so a call site feeding a `speaker_wav`
  into the bridge must re-join with `","`. Handing the list straight through
  produces `"['a.wav', 'b.wav']"` at the far end.
- `ctx.get_voice_profile_dir(profile_name) -> str | None`: a **string**, where
  the wrapped `app.db.speakers.get_profile_dir` returns a `Path`. Wrap in
  `Path(...)` at any call site doing path arithmetic.
- `ctx.update_queue_item(job_id, **fields)`: forwards **every** field of the
  wrapped function explicitly by keyword, filling the same defaults the real
  signature declares. Behaviour is identical, but a test asserting the old
  positional `(job_id, status)` call shape will fail and needs updating.

---

## Chunk limit ownership

`behavior.text_chunk_limit` in the manifest is the **authoritative** maximum character
count per synthesis call for that engine. Studio reads this value via
`get_text_chunk_limit(engine_id)`.

`DEFAULT_SENT_CHAR_LIMIT` is a fallback used only when no engine is in scope (e.g.
pure text-splitting utilities). Queue code, orchestration, and UI MUST NOT hard-code
a per-engine limit.

---

## Engine isolation invariants

**MUST:**
- Plugin code MUST run only inside the TTS Server process, never the Studio main process.
- File access MUST be confined to the plugin's own directory unless an explicit
  path is passed in via `TTSRequest`.
- `check_env()` MUST return quickly without network calls or model loads.

**MUST NOT:**
- Plugins MUST NOT import `app.api.web`, `app.jobs`, or any Studio internal module directly.
- Plugins MUST NOT mutate global interpreter state (module-level globals, `sys.path`,
  logging root handlers) on import.
- Plugins MUST NOT start threads, async tasks, or subprocesses on import.
- Plugin code MUST NOT branch on `engine_id` values of other plugins — capabilities
  are expressed through the manifest and SDK, not inter-plugin knowledge.

---

## Manifest validation invariants

**MUST:**
- `engine_id` MUST be unique across all loaded plugins; duplicate IDs cause the
  later-discovered plugin to be rejected.
- `capabilities` MUST contain `"synthesis"` or the plugin is rejected.
- `entry_class` string MUST import cleanly at load time; import failure sets status
  to `invalid_config`.

**MUST NOT:**
- `text_split_target` MUST NOT exceed `text_chunk_limit` when both are present.
- `studio_tts_manifest` MUST NOT be any value other than `"1.0"`.

### `sdk_version` compatibility (spec 1.9.0, issue #200)

`sdk_version` is the one version field NOT checked against a literal allow-list.
It is compared at load time against the installed
`studio_plugin_sdk.SDK_VERSION`, currently `"1.2"`:

- The **major** MUST match exactly.
- The **minor** MUST be at or below the installed SDK's minor. A plugin written
  against an earlier minor of the same major still loads; one requiring a newer
  minor than this install provides does not.
- A missing or malformed value is rejected.
- Any rejection raises `PluginLoadError` naming both the declared value and the
  installed `SDK_VERSION`, so the engine card says which side is out of date.

The reference value is read from the package rather than restated in the loader.
A hardcoded list is a second source of truth that goes stale on the first bump,
leaving the field decorative: before 1.9.0 nothing compared the two at all.
`scripts/validate_plugin_manifests.py` applies the same derived rule so CI and
the runtime loader cannot disagree. The other three version fields
(`contract_version`, `settings_schema_version`, `event_envelope_version`) keep
their exact-match `"1.0"` allow-lists.

### Optional `distribution` block (plan 05 §1.2)

A manifest MAY carry a top-level `distribution` object describing the plugin's
standalone-repo source (final-shape example: `host`, `base_url`, `repo`,
`git_url`, `topic`, `pin_ref`, `official`). When present it is shape-validated
by `_validate_manifest` (`app/tts_server/plugin_manifest.py`): it MUST be a
JSON object; `host`/`base_url`/`repo`/`git_url`/`topic` MUST be strings when
present; `pin_ref` MUST be a string or `null`; `official` MUST be a boolean.
No field inside the block is required, and the block itself remains optional
(additive — no manifest version bump). Standalone-repo plugins MUST NOT set
`built_in`; that field is reserved for in-tree built-ins (`tts_mixed`).

### Optional `dependency_check` field

A manifest MAY carry a top-level `dependency_check` string, valid values
`"external"` or `"bundled"`. Absent is equivalent to `"bundled"` (writing it
explicitly is accepted but has no effect): the TTS Server checks every
package in the plugin's `requirements.txt` against its OWN interpreter (the
server venv) via `importlib.metadata`, and gates the engine `needs_setup` if
any are missing.

`"external"` opts a plugin out of that check entirely — for an engine whose
heavy inference deps are installed into a separate, plugin-managed
environment and never expected in the server venv (`tts_xtts`: torch/
coqui-tts/transformers live only in `~/xtts-env`, provisioned by `run.sh`,
never the app's own `venv`). Such a plugin's own `check_env()` becomes
solely responsible for verifying its external environment is ready — it
MUST check that environment on disk (e.g. an installed-package marker),
never via an in-process `import`, since an in-process import checks the
wrong interpreter and a subprocess import is too slow for a check called on
every `/synthesize` request and every heartbeat poll (`app/engines/watchdog.py`,
5s interval). `POST /engines/{id}/install` also refuses (400) for
`dependency_check: "external"` engines, since `pip install -r
requirements.txt` there would install into the server venv instead of the
external one it's meant for.

**Known limitations, by design:** the opt-out is all-or-nothing — it skips
the check for every line in `requirements.txt`, not just the heavy/external
ones. A plugin author who mixes genuinely server-side base packages into the
same file (as `tts_xtts` does, for `requests`/`pydantic`) gets no
verification of those either; they must be transitively guaranteed present
some other way (see the comment atop `tts_xtts/requirements.txt`), or split
into a separate, still-checked manifest of their own. A disk-marker check
(package directory or dist-info) is also inherently a proxy for "installed",
not "installed correctly" — a broken or version-mismatched install can still
report ready; `tts_xtts`'s `xtts_env_ready()` mitigates the common case (a
mid-install/interrupted state) by requiring the completion marker
(`coqui_tts-*.dist-info`) pip writes only once an install finishes, rather
than the package directory alone (which exists well before that point).

---

## Settings schema — secret fields

`settings_schema.json` (or the dict returned by `settings_schema()`) may mark any
string property with `"secret": true`:

```json
{
  "type": "object",
  "properties": {
    "api_key": {
      "type": "string",
      "title": "API Key",
      "secret": true
    }
  }
}
```

**Contract:**

- The TTS Server's `settings_store.secret_keys(schema)` identifies all such keys.
- `settings_store.redact_secret_settings(settings, schema)` returns a copy of the
  settings dict where every secret key is replaced with `"***"` (if the value is
  truthy) or `""` (if falsy).
- **All read-to-client chokepoints MUST call `redact_secret_settings`** before
  embedding settings in a response: `GET /engines/{id}/settings`,
  `PUT /engines/{id}/settings` (response body), and `build_engine_detail`
  (`current_settings` field). The bridge and external `/api/v1/tts/engines` are
  covered transitively because they proxy TTS Server responses without mutation.
- `settings_store.merge_settings` silently drops any incoming value of `"***"` for a
  secret key, so posting the sentinel back never overwrites the stored real value.
- Secret values MUST NOT be written to log files. If logging is added at the
  save/merge path, pass the merged dict through `redact_secret_settings` first.
- The `readOnly` field (used for computed read-only settings like
  `computer_speed_multiplier`) is orthogonal to `secret`; a field may carry both.
