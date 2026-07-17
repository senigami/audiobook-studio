# Plugin Contract

```
spec_version: 1.7.0
updated: 2026-07-16
status: active
sources:
  - app/engines/voice/sdk.py
  - app/tts_server/plugin_loader.py
  - app/engines/registry.py
  - app/studio_plugin_sdk/__init__.py
  - app/studio_plugin_sdk/context.py
  - tts_engines/tts_xtts/manifest.json
  - tts_engines/tts_voxtral/manifest.json
  - tts_engines/tts_mixed/manifest.json
```

> **TL;DR:** Every TTS plugin is a folder (or pip entry point) with a `manifest.json` and a class implementing `StudioTTSEngine`; Studio treats the manifest as the source of truth for discovery, capabilities, resource requirements, and chunk limits.

## Changelog

| Version | Date       | Change                 |
|---------|------------|------------------------|
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
instantiates and calls into. As of spec 1.5.0, `studio_plugin_sdk` re-exports the types this file needs
(additive to the existing `sdk_version: "1.0"` contract — no manifest change
required), so it never has to import `app.*` directly:

```python
from studio_plugin_sdk import (
    BaseVoiceEngine,        # base class the app_adapter subclasses
    EngineHealthModel,      # return type of describe_health()
    EngineManifestModel,    # constructor arg — parsed manifest.json
    EngineExecutionError,   # raised on synthesis/preview failure
    EngineRequestError,     # raised on invalid request shape
)
```

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
