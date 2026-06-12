# Plugin Contract

```
spec_version: 1.3.0
status: active
sources:
  - app/engines/voice/sdk.py
  - app/tts_server/plugin_loader.py
  - app/engines/registry.py
  - app/studio_plugin_sdk/context.py
  - plugins/tts_xtts/manifest.json
  - plugins/tts_voxtral/manifest.json
  - plugins/tts_mixed/manifest.json
```

> **TL;DR:** Every TTS plugin is a folder (or pip entry point) with a `manifest.json` and a class implementing `StudioTTSEngine`; Studio treats the manifest as the source of truth for discovery, capabilities, resource requirements, and chunk limits.

## Changelog

| Version | Date       | Change                 |
|---------|------------|------------------------|
| 1.0.0   | 2026-06-10 | Initial canonical spec |
| 1.1.0   | 2026-06-11 | Additive: optional `behavior.sanitize_categories` list; unknown names cause load error; absent means all categories applied (backward-compatible) |
| 1.2.0   | 2026-06-11 | Additive: optional `check_output(req, result) -> tuple[bool, str]` method on `StudioTTSEngine`; default accept-all; TTS Server calls this after synthesize() and deletes artifact + returns `output_rejected` on (False, reason); crashing hook is failure-isolated (logs + accepts) |
| 1.3.0   | 2026-06-12 | S10 closeout: (1) loader now validates all five required method signatures + declared optional overrides via `inspect.signature` at load time (wrong param name / insufficient arity → `PluginLoadError` naming the method and expected signature; extra optional params tolerated); (2) all four manifest version fields (`contract_version`, `sdk_version`, `settings_schema_version`, `event_envelope_version`) are hard-required since S8; (3) `check_output` §2.3 stale "does not exist yet" note corrected — the method has been in `base.py` since v1.2.0; (4) `ctx.stitch_segments` gains `on_output` and `cancel_check` optional params plus `pdir` (defaults to parent of `out_wav`); returns `int` (was `None`); (5) `ctx.finalize_sample_artifact`, `ctx.run_voice_job`, and `ctx.resolve_voice_preview_inputs` added to §3.3 tables; (6) in-tree plugin wrapper-boundary note: function-body `app.*` imports are tolerated in bake/segments/standard_handler because tests monkeypatch those targets directly (resolves with S9 dispatcher integration); standalone plugins must have zero `app.*` imports at any scope |

---

## Plugin discovery

### Folder plugins

The TTS Server scans the `plugins/` directory at startup. A folder qualifies as a
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

### Optional fields — resource profile

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
