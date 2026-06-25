# Plugin Communication Contract

Audiobook Studio 2.0 — authoritative reference for TTS plugin authors.
Audience: a developer building a standalone plugin repo. Every signature below
is quoted from the live source files; do not paraphrase.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Studio Process (FastAPI)                │
│                                                          │
│  ┌──────────────┐   StudioPluginContext   ┌───────────┐  │
│  │  Job Dispatch │──────────────────────▶│  Plugin   │  │
│  │  (registry)  │◀──────────────────────│  Studio   │  │
│  └──────┬───────┘   JobResult            │  Handler  │  │
│         │                                └───────────┘  │
│         │ HTTP REST                                      │
│         ▼                                                │
│  ┌──────────────┐                                        │
│  │  TTS Bridge  │        Broadcaster (in-process)        │
│  │  (client)   │──────────────────────────────────────▶ │
│  └──────┬───────┘        WebSocket topics:               │
│         │                  queue.items                   │
└─────────┼────────          jobs.lifecycle                ─┘
          │ HTTP             chapters.progress              │
          ▼                  segments.progress              │
┌──────────────────┐         voice.test                    │
│   TTS Server     │         tts.logs                      │
│  (subprocess)   │                                        │
│                  │◀──── Browser WebSocket ───────────────┘
│  ┌────────────┐  │
│  │PluginLoader│  │
│  └─────┬──────┘  │
│        │ instantiates                                     
│        ▼         │
│  ┌────────────┐  │         Plugin source layout:
│  │StudioTTS   │  │         plugins/tts_<name>/
│  │Engine impl │  │           manifest.json
│  └────────────┘  │           settings_schema.json
└──────────────────┘           plugin/
                                 server/
                                   engine.py   ← runs HERE
                                 studio/
                                   handler.py  ← runs in Studio process
```

Two independent halves:

| Half | Process | Imports allowed |
|------|---------|-----------------|
| `plugin/server/engine.py` | TTS Server subprocess | stdlib, declared deps, `studio_plugin_sdk` types only |
| `plugin/studio/handler.py` | Studio process (FastAPI) | stdlib, declared deps, `studio_plugin_sdk` only — **never `app.*`** |

---

## 2. Server-Side Contract — `StudioTTSEngine`

Source of truth: `app/engines/voice/base.py` and `app/engines/voice/sdk.py`.

### 2.1 Required Methods

```python
class StudioTTSEngine(ABC):

    @abstractmethod
    def info(self) -> dict[str, Any]:
        """Return runtime metadata for registry display.

        Called once during plugin discovery. Merged with manifest data to build
        the full engine profile served by /engines.

        Returns:
            dict[str, Any]: Additional runtime metadata not already in the manifest
            (e.g. detected model paths, GPU device info).
        """

    @abstractmethod
    def check_env(self) -> tuple[bool, str]:
        """Check whether this engine can run in the current environment.

        Called during plugin discovery and re-verification. Must NOT load model
        weights or allocate GPU memory — only inspect the environment.

        Returns:
            tuple[bool, str]: (True, 'OK') when valid; (False, reason) when setup
            is required.
        """

    @abstractmethod
    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Pre-flight validation before synthesis or preview.

        Called before every synthesize() and preview() call. Must be fast — no
        I/O beyond path existence checks.

        Args:
            req: Immutable synthesis request to validate.

        Returns:
            tuple[bool, str]: (True, 'OK') when valid; (False, reason) when it
            cannot be processed.
        """

    @abstractmethod
    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Run TTS synthesis and write audio to req.output_path.

        Must write a valid audio file to req.output_path on success. On failure,
        return TTSResult(ok=False, error=...) — do not raise unhandled exceptions
        for normal failure cases.

        Args:
            req: Immutable synthesis request.

        Returns:
            TTSResult: Result including output path and duration on success, or
            error message on failure.
        """

    @abstractmethod
    def settings_schema(self) -> dict[str, Any]:
        """Return JSON Schema describing this engine's configurable settings.

        Used by the TTS Server to validate settings updates and expose them to
        the Studio Settings UI for form rendering.

        Returns:
            dict[str, Any]: JSON Schema (Draft 7+) object.
        """
```

### 2.2 Optional Methods

```python
    def hooks(self) -> VoiceProcessingHooks:
        """Return processing hooks for this engine.

        Override to customize request planning, voice selection, or postprocessing.
        Default returns a no-op VoiceProcessingHooks().
        """

    def verify(self, req: TTSRequest) -> VerificationResult:
        """Perform a fast readiness check without rendering audio.

        Default: returns VerificationResult(ok=False, message="...does not implement...").
        Override to enable verification in the Settings UI.
        """

    def run_test(self) -> VerificationResult:
        """Perform a full end-to-end synthesis test using bundled assets.

        Should use assets from the plugin's own folder. Writes output back to
        that folder (e.g., assets/test_output.wav).
        Default: returns VerificationResult(ok=False, ...).
        """

    def preview(self, req: TTSRequest) -> TTSResult:
        """Optional lightweight preview synthesis.

        Override when the engine supports a faster preview mode (shorter context,
        lower quality). Default: calls synthesize().
        """

    def shutdown(self) -> None:
        """Optional cleanup when the engine is unloaded.

        Called by the TTS Server during graceful shutdown or before plugin reload.
        Release GPU memory, close file handles, etc. Default: no-op.
        """
```

### 2.3 Optional Method — `check_output`

This method is **already present** in `app/engines/voice/base.py` as a
concrete (non-abstract) optional override. The default accepts every result.

```python
    def check_output(self, req: TTSRequest, result: TTSResult) -> tuple[bool, str]:
        """Validate rendered artifact quality after synthesis.

        Called by the TTS Server immediately after synthesize() returns ok=True.
        The engine may inspect the written file (e.g. check duration, silence
        ratio, or expected speaker fingerprint).

        Args:
            req:    The original TTSRequest that produced this result.
            result: The TTSResult returned by synthesize().

        Returns:
            tuple[bool, str]: (True, 'OK') when the artifact passes QA;
            (False, reason) when it must be discarded.
        """
        return True, "OK"  # default: accept all
```

Engines that can detect silence, truncation, or speaker mismatch should
override this. The TTS Server deletes the artifact and returns
`output_rejected` on `(False, reason)`. Exceptions inside the hook are
failure-isolated (logged + artifact accepted).

### 2.4 TTSRequest Field Table

```python
@dataclass(frozen=True)
class TTSRequest:
    text: str                                    # Pre-cleaned text to synthesize
    output_path: str                             # Absolute path; engine must write here
    voice_ref: str | None = None                 # Abs path to WAV reference for voice cloning
    settings: dict[str, Any] = field(...)        # Loaded from engine's settings.json
    language: str = "en"                         # BCP-47 code e.g. "en", "es"
    script: list[dict[str, Any]] | None = None   # Multi-segment batch script
    task_id: str | None = None                   # Correlation ID for logging
    cancel_check: Callable[[], bool] | None = None      # See §2.5
    on_timing_event: Callable[[TimingEvent], None] | None = None  # See §2.6
```

### 2.5 `cancel_check` Callback Semantics

- Provided by the TTS Server; never None in production.
- Call `req.cancel_check()` at each natural checkpoint (after each segment,
  after each chunk).
- Returns `True` when the job has been cancelled by the user.
- When `True` is returned, stop synthesis immediately and return
  `TTSResult(ok=False, error="Cancelled")`.
- Do not call more frequently than once per synthesized chunk — the check
  involves a threading lock.

### 2.6 `on_timing_event` Callback Semantics

```python
@dataclass(frozen=True)
class TimingEvent:
    event_name: TimingEventName   # one of the five literals below
    timestamp: float              # time.time() at the moment of the event
    segment_id: str | None = None # populated for segment-scoped events
```

Valid `TimingEventName` literals (from `app/engines/voice/sdk.py`):

| Value | When to emit |
|-------|-------------|
| `engine_activity_started` | Engine has loaded and is about to begin synthesis |
| `chapter_render_started` | First segment of a chapter batch begins rendering |
| `segment_render_started` | This segment's audio generation begins |
| `segment_render_completed` | This segment's audio is written to disk |
| `chapter_render_completed` | All segments in the batch are done |

Call `req.on_timing_event(TimingEvent(...))` at each transition. The TTS Server
aggregates these into `TTSTimingResult` and attaches it to the final response.
The Studio progress subsystem uses these anchors for ETA calculations.

### 2.7 TTSResult Field Table

```python
@dataclass
class TTSResult:
    ok: bool                          # True iff audio file was written successfully
    output_path: str | None = None    # Abs path to written audio; None when ok=False
    duration_sec: float | None = None # Audio duration in seconds
    warnings: list[str] = field(...)  # Non-fatal messages for the user
    error: str | None = None          # Human-readable error; populated when ok=False
    timing: TTSTimingResult | None = None  # Retrospective timing anchors
```

---

## 3. Studio-Side Contract — `StudioPluginContext`

This is the key new design. The `StudioPluginContext` object is passed by the
Studio dispatcher to every plugin job handler, replacing all direct `app.*`
imports. Plugins **must not** import from `app.*` except the published SDK
namespace `studio_plugin_sdk`.

### 3.1 Context Object Definition

```python
# Published as: studio_plugin_sdk.context.StudioPluginContext

@dataclass
class JobSpec:
    """Immutable snapshot of a dispatched job."""
    id: str
    engine: str
    kind: str                          # JobKind literal
    chapter_id: str | None
    project_id: str | None
    segment_ids: list[str] | None
    speaker_profile: str | None
    is_bake: bool
    make_mp3: bool
    safe_mode: bool
    extra: dict[str, Any]              # Engine-specific fields from the job row

@dataclass
class JobResult:
    """Returned by the handler to signal final job state."""
    status: str                        # "done" | "failed" | "cancelled"
    error: str | None = None
    output_wav: str | None = None
    output_mp3: str | None = None
    progress: float = 1.0

class StudioPluginContext:
    """SDK context object injected into plugin job handlers.

    Plugin handlers receive one of these at dispatch time. All interaction
    with Studio internals must go through this object — never via app.* imports.
    """
```

### 3.2 Handler Signature

```python
def handle_job(ctx: StudioPluginContext, job: JobSpec) -> JobResult:
    ...
```

The dispatcher calls this function by name (resolved from
`manifest.json → worker_logic.kind_handlers` or `engine_handlers`).

### 3.3 Context Service API

#### 3.3.1 Job Progress

```python
ctx.update_job_progress(
    job_id: str,
    *,
    status: str | None = None,         # "queued"|"preparing"|"running"|"finalizing"|"done"|"failed"|"cancelled"
    progress: float | None = None,     # 0.0–1.0
    eta_seconds: float | None = None,
    active_segment_id: str | None = None,
    active_segment_progress: float | None = None,
    completed_render_groups: int | None = None,
    render_group_count: int | None = None,
    active_render_group_index: int | None = None,
    error: str | None = None,
    finished_at: float | None = None,
    output_wav: str | None = None,
    output_mp3: str | None = None,
    broadcast: bool = True,
) -> None
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | `str` | Target job ID |
| `status` | `str \| None` | New job status; None = no change |
| `progress` | `float \| None` | Fractional progress 0.0–1.0; None = no change |
| `eta_seconds` | `float \| None` | Remaining seconds estimate for ETA display |
| `active_segment_id` | `str \| None` | ID of the segment currently being rendered |
| `active_segment_progress` | `float \| None` | 0.0–1.0 progress within that segment |
| `broadcast` | `bool` | Emit `queue.items` websocket event (default True) |

Effect: persists job row changes to the database and, when `broadcast=True`,
emits a `queue_item_status` event on the `queue.items` websocket topic.

#### 3.3.2 Segment Progress Events

```python
ctx.emit_segment_started(
    chapter_id: str,
    segment_id: str,
    job_id: str,
) -> None

ctx.emit_segment_saved(
    chapter_id: str,
    segment_id: str,
    job_id: str,
    audio_file_path: str,
    duration_sec: float | None = None,
) -> None

ctx.emit_segment_progress(
    chapter_id: str,
    segment_id: str,
    job_id: str,
    progress: float,               # 0.0–1.0 within this segment
) -> None

ctx.broadcast_segments_updated(
    chapter_id: str,
) -> None
```

These replace the direct call to `app.api.ws.broadcast_segments_updated`.
Each emits on the `segments.progress` websocket topic (event kinds
`segment_started`, `segment_saved`, `segment_progress`) so the chapter editor
can update segment status indicators in real time.

#### 3.3.3 Queue Row Updates

```python
ctx.update_queue_row(
    job_id: str,
    *,
    status: str,
    progress: float,
    eta_seconds: float | None = None,
    message: str | None = None,
) -> None
```

Emits a `queue_item_status` event on `queue.items`. Use this when you want to
update the queue row without persisting to the job database row (e.g. transient
progress ticks between checkpoints). For durable state, use `update_job_progress`.

#### 3.3.4 Speaker / Voice Settings Lookup

```python
ctx.get_speaker_wavs(profile_name: str) -> list[str]
"""Return absolute paths to WAV reference files for a speaker profile.

Returns [] when the profile has no usable samples. NOTE: the underlying
app.db.speakers.get_profile_wavs returns a comma-separated string (or None);
this shim splits that into a list so plugins never parse the legacy string
form. Use speaker_wavs[0] for the primary reference."""

ctx.get_voice_profile_dir(profile_name: str) -> str | None
"""Return the absolute directory path for a speaker profile, or None.
Wraps app.db.speakers.get_profile_dir (which returns a Path); the shim
stringifies it."""

ctx.get_voice_settings(profile_name: str) -> dict[str, Any]
"""Return the persisted voice settings dict for this profile.
Wraps app.db.speakers.get_speaker_settings."""
```

These replace direct calls to `app.db.speakers.get_profile_wavs`,
`app.db.speakers.get_profile_dir`, and `app.db.speakers.get_speaker_settings`.

#### 3.3.5 Chunk-Group Derivation

```python
ctx.get_chapter_segments(chapter_id: str) -> list[dict[str, Any]]
"""Return all segment rows for the given chapter, ordered by position."""

ctx.build_chunk_groups(
    segments: list[dict[str, Any]],
    char_limit: int,
) -> list[list[dict[str, Any]]]
"""Group consecutive segments by speaker and character limit.

Replaces app.domain.chunk_groups.build_chunk_groups.
"""

ctx.load_chunk_segments(
    chapter_id: str,
    char_limit: int,
) -> list[list[dict[str, Any]]]
"""Convenience: fetch segments then group them. Combines the two calls above."""
```

#### 3.3.6 Bridge Synthesis Call

```python
ctx.generate_via_bridge(
    engine: str,
    text: str,
    out_wav: Path,
    *,
    profile_name: str | None = None,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    speed: float = 1.0,
    script: list[dict[str, Any]] | None = None,
    task_id: str | None = None,
) -> int
"""Send a synthesis request to the TTS Server subprocess via the bridge.

Returns the bridge return code (0 = success). Replaces the direct call to
app.jobs.handlers.bridge_helpers.generate_via_bridge.
"""
```

#### 3.3.7 Engine Behavior Parameters

```python
ctx.get_behavior(engine_id: str) -> EngineBehavior
"""Return the engine behavior configuration for the named engine.

EngineBehavior exposes:
    sent_char_limit: int   — max characters per synthesis chunk
    speed_factor: float    — default speed multiplier
    ... (engine-specific fields)

Replaces app.engines.behavior imports.
"""
```

#### 3.3.8 Cancellation Check

```python
ctx.is_cancelled(job_id: str) -> bool
"""Return True if the given job has been cancelled by the user.

Poll this at the top of each render group loop. When True, update the job
status to 'cancelled' and return JobResult(status='cancelled') immediately.
"""
```

#### 3.3.9 Structured Logging

```python
ctx.log(
    message: str,
    *,
    level: str = "info",      # "debug" | "info" | "warning" | "error"
    job_id: str | None = None,
    engine_id: str | None = None,
) -> None
"""Emit a structured log line routed to the tts.logs websocket topic.

Replaces plain logging.getLogger(...).info(...) inside handlers. These lines
appear in the Studio diagnostics panel and are not parsed by the queue for
state inference (per the wiki contract: queue must never infer state from
tts.logs).
"""
```

#### 3.3.10 Segment Persistence

```python
ctx.update_segment(segment_id: str, **fields: Any) -> None
"""Update one segment row. Replaces app.db.segments.update_segment / app.db.update_segment."""

ctx.update_segments_status_bulk(segment_ids: list[str], status: str) -> None
"""Bulk status update. Replaces app.db.update_segments_status_bulk."""

ctx.cleanup_orphaned_segments(chapter_id: str) -> None
"""Remove segment rows with no backing audio. Replaces app.db.segments.cleanup_orphaned_segments."""

ctx.update_queue_item(job_id: str, **fields: Any) -> None
"""Low-level queue row write. Replaces app.db.update_queue_item.
Prefer update_job_progress / update_queue_row; this is the escape hatch."""
```

#### 3.3.11 Path and Directory Resolution

```python
ctx.get_plugin_data_dir(engine_id: str | None = None) -> str
"""Absolute path to plugin_data/<engine_id>/ (defaults to the handler's engine).
This is the only writable location for plugin runtime artifacts (see §4.5)."""

ctx.get_chapter_dir(chapter_id: str) -> str
"""Absolute path to the chapter's working/output directory.
Replaces app.core.config.get_chapter_dir."""

ctx.get_voices_dir() -> str
"""Absolute path to the voices root. Replaces app.core.config.VOICES_DIR."""
```

#### 3.3.12 Audio Operations (bake / stitch)

```python
ctx.stitch_segments(
    segment_wavs: list[str],
    out_wav: str,
    *,
    pdir: str | None = None,
    on_output: Callable[[str], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> int
"""Concatenate segment WAVs into a chapter WAV via ffmpeg concat.

Args:
    segment_wavs: Ordered list of segment WAV absolute paths.
    out_wav:      Destination chapter WAV absolute path.
    pdir:         Working directory for ffmpeg temp files; defaults to
                  the parent directory of out_wav when omitted.
    on_output:    Line-by-line ffmpeg stdout callback; no-op when omitted.
    cancel_check: Cancellation predicate; always returns False when omitted.

Returns 0 on success, non-zero on ffmpeg error.
Replaces app.engines.audio_ops.stitch_segments."""

ctx.wav_to_mp3(in_wav: str, out_mp3: str) -> None
"""Transcode WAV to MP3. Replaces app.engines.audio_ops.wav_to_mp3."""

ctx.get_audio_duration(path: str) -> float
"""Return audio duration in seconds. Replaces app.engines.audio_ops.get_audio_duration."""

ctx.finalize_sample_artifact(wav_path: Path) -> Path
"""Convert a voice-sample WAV to MP3, delete WAV on success, return the final path.
On conversion failure the WAV is kept and its path is returned.
Replaces app.engines.audio_ops.finalize_sample_artifact (added in S5)."""
```

#### 3.3.13 Text Preparation

```python
ctx.sanitize_text(text: str) -> str
"""Apply safe-mode text sanitization. Replaces app.utils.text.textops.sanitize_text."""

ctx.split_long_sentences(text: str, char_limit: int) -> list[str]
"""Split overlong sentences under char_limit. Replaces
app.utils.text.textops.safe_split_long_sentences."""

ctx.get_text_chunk_limit(engine_id: str) -> int
"""Engine character chunk limit. Replaces app.engines.behavior.get_text_chunk_limit."""
```

#### 3.3.14 Voice Job Delegation

```python
ctx.run_voice_job(job: JobSpec) -> JobResult
"""Delegate to the shared voice-build/test handler.

Wraps app.jobs.worker_voice.handle_voice_job. Plugin handlers for
voice_build / voice_test / voice_task kinds should call this rather than
importing the worker directly."""

ctx.resolve_voice_preview_inputs(
    profile_name: str,
    *,
    engine: str | None = None,
) -> dict[str, Any]
"""Resolve voice preview inputs for a profile.

Returns a dict with keys:
    voice_ref (str | None)            — absolute path to the primary voice WAV
    voice_profile_dir (str | None)    — absolute path to the profile directory
Wraps app.engines.voice_engines.resolve_voice_preview_inputs."""
```

> **Coverage rule.** `StudioPluginContext` must expose a method for **every**
> `app.*` symbol currently imported by any studio-side handler under `plugins/`.
> The full set was derived by `grep -rn "from app\." plugins/*/plugin/studio/`.
> If a migration step (§6) uncovers an `app.*` import with no context
> equivalent, **add the wrapper to the context first** — do not leave a
> residual `app.*` import in a plugin.

---

## 4. Manifest Contract

### 4.1 Folder Naming

Folder regex (enforced by `app/tts_server/plugin_loader.py`):

```
^tts_[a-z][a-z0-9]{1,14}$
```

Examples: `tts_xtts`, `tts_voxtral`, `tts_elevenlabs`. Maximum 20 characters total.

### 4.2 Annotated `manifest.json`

```json
{
  "studio_tts_manifest": "1.0",
  "contract_version": "1.0",
  "sdk_version": "1.0",
  "settings_schema_version": "1.0",
  "event_envelope_version": "1.0",
  "engine_id": "myplugin",
  "display_name": "My TTS Plugin",
  "version": "0.1.0",
  "min_studio": "2.0.0",
  "entry_class": "plugin.server.engine:MyEngine",
  "capabilities": ["synthesis", "preview"],
  "languages": ["en", "es"],
  "resource": {
    "gpu": false,
    "vram_mb": 0,
    "cpu_heavy": true
  },
  "local": true,
  "cloud": false,
  "network": false,
  "worker_logic": {
    "engine_handlers": {
      "myplugin": "plugin.studio.handler:handle_job"
    },
    "kind_handlers": {
      "synthesis": "plugin.studio.handler:handle_synthesis_job"
    }
  },
  "app_adapter_class": "MyAdapter",
  "app_adapter_module": "plugin.studio.adapter",
  "author": "your-github-username",
  "license": "MIT",
  "homepage": "https://github.com/your-org/studio-tts-myplugin",
  "test_text": "This is a verification test.",
  "dev": {
    "enabled": false
  }
}
```

| Field | Required | Validation rule |
|-------|----------|-----------------|
| `studio_tts_manifest` | yes | Must equal `"1.0"` (manifest schema version) |
| `contract_version` | yes | Must equal `"1.0"` (studio↔plugin contract version) |
| `sdk_version` | yes | Must be compatible with the studio-side `studio_plugin_sdk.__version__` (currently `"1.0"`) |
| `settings_schema_version` | yes | Must equal `"1.0"` (settings_schema.json shape version) |
| `event_envelope_version` | yes | Must equal `"1.0"` (websocket event envelope version) |
| `engine_id` | yes | Matches `^[a-z][a-z0-9]{1,14}$` |
| `display_name` | yes | Non-empty string |
| `entry_class` | yes | Matches `^[a-z_][a-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$` |
| `capabilities` | yes | Array must contain `"synthesis"` |
| `worker_logic.engine_handlers` | recommended | Each value: `module:function` format |
| `worker_logic.kind_handlers` | recommended | Each value: `module:function` format |
| `app_adapter_class` | optional | Valid Python class name if present |
| `app_adapter_module` | optional | Valid Python module name if present |

**Explicit version contract (required, validated at load time).** Studio 2.0
declares four independent versions and validates every one of them in
`_validate_manifest` (`app/tts_server/plugin_loader.py`) at discovery time. A
plugin that omits any of them, or declares an unsupported value, is rejected
with a contract error surfaced in Settings. This is what lets future contract
revisions coexist with 2.0 plugins after release — the loader can accept a set
of supported values per field rather than a single hardcoded string.

| Version field | Owner | Bumped when |
|---------------|-------|-------------|
| `studio_tts_manifest` | manifest schema | manifest.json keys/shape change |
| `contract_version` | studio↔plugin contract | the `StudioPluginContext` / `StudioTTSEngine` method surface changes |
| `sdk_version` | `studio_plugin_sdk` package | the exported SDK types change |
| `settings_schema_version` | settings_schema.json | the schema dialect or `x-ui` vocabulary changes |
| `event_envelope_version` | websocket event payloads | the event envelope on any topic in §5 changes |

The current loader (verified) only enforces `studio_tts_manifest == "1.0"`.
Extending `_validate_manifest` to require and check the other three fields is an
explicit, in-scope step of this plan (see §6, Step 1 acceptance) and must land
before the 2.0 release — it is not optional and not deferred.

### 4.3 `settings_schema.json` Rules

The file must be a valid JSON Schema (Draft 7) object at the root. The Studio
UI uses `x-ui` extension properties to render form controls.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "My Plugin Settings",
  "type": "object",
  "properties": {
    "model_path": {
      "type": "string",
      "title": "Model Path",
      "description": "Absolute path to the ONNX model file.",
      "x-ui": {
        "widget": "file-picker",
        "accept": ".onnx",
        "placeholder": "/models/mymodel.onnx"
      }
    },
    "temperature": {
      "type": "number",
      "title": "Temperature",
      "default": 0.7,
      "minimum": 0.1,
      "maximum": 1.5,
      "x-ui": {
        "widget": "slider",
        "step": 0.05
      }
    },
    "language": {
      "type": "string",
      "title": "Default Language",
      "enum": ["en", "es", "fr"],
      "default": "en",
      "x-ui": {
        "widget": "select"
      }
    }
  },
  "required": ["model_path"]
}
```

`x-ui.widget` supported values: `"text"`, `"slider"`, `"select"`,
`"file-picker"`, `"toggle"`, `"textarea"`.

### 4.4 `requirements.txt` Handling

- List one package per line using standard pip specifier syntax.
- The plugin loader calls `importlib.metadata.distribution(pkg_name)` to check
  each package at discovery time.
- Missing packages are surfaced as `needs_setup` in the Settings UI.
- The loader does **not** auto-install. Provide install instructions in your
  `README.md`.
- Git and URL requirements (`git+...`, `pkg @ url`) are parsed; the fragment
  `#egg=<name>` is used as the package name for the check.

### 4.5 `plugin_data` Storage Rule

Runtime settings, cached data, and generated artifacts must be stored at:

```
plugin_data/<engine_id>/
```

This directory is always outside the plugin source tree. Never store mutable
state inside the plugin folder itself — `settings.json` is auto-managed by the
TTS Server and written to `plugin_data/<engine_id>/settings.json`.

Plugin source directories must be safe to delete and re-clone without losing
user configuration.

The TTS Server exports the absolute settings directory to the engine subprocess
via the `STUDIO_PLUGIN_DATA_DIR` environment variable (set to
`plugin_data/<engine_id>/`). Engines that need settings before a `TTSRequest`
exists — e.g. inside `check_env()` — read `STUDIO_PLUGIN_DATA_DIR/settings.json`
rather than walking relative paths out of the plugin folder. During synthesis,
prefer `TTSRequest.settings`, which the server has already loaded.

---

## 5. Event / Queue Mapping Table

For each `StudioPluginContext` callback, the table below shows which websocket
topic and event kind the Studio runtime emits, the lifecycle step number from
the wiki (steps 1–7), and the visible UI effect.

| Plugin callback | WS topic | Event kind | Lifecycle step | UI effect |
|----------------|----------|------------|---------------|-----------|
| `ctx.update_job_progress(status='queued')` | `queue.items` | `queue_item_status` | 1 | Queue row created/updated as Queued |
| `ctx.update_job_progress(status='preparing')` | `jobs.lifecycle` | `JOB_PREPARING` | 2 | Queue row spinner; "Preparing" label |
| `ctx.update_job_progress(status='running')` | `jobs.lifecycle` | `START_SYNTHESIS` | 3 | Progress bar begins; ETA model starts |
| `ctx.update_job_progress(progress=0.5)` | `chapters.progress` | `chapter_progress` | 4 | Progress bar advances to 50%; ETA recalculates |
| `ctx.emit_segment_started(...)` | `segments.progress` | `segment_started` | 4 | Chapter editor shows segment as "rendering" |
| `ctx.emit_segment_progress(...)` | `segments.progress` | `segment_progress` | 4 | Segment sub-progress indicator updates |
| `ctx.emit_segment_saved(...)` | `segments.progress` | `segment_saved` | 4 | Segment status changes to "done"; play button appears |
| `ctx.broadcast_segments_updated(...)` | `segments.progress` | `segments_updated` | 4 | Full segment list invalidated; UI re-fetches |
| `ctx.update_job_progress(status='done')` | `jobs.lifecycle` | terminal | 5 | Queue row checkmark; ETA cleared |
| `ctx.update_queue_row(status='done')` | `queue.items` | `queue_item_status` | 6 | Queue row final state persisted |
| `ctx.update_job_progress(status='failed')` | `queue.items` + `jobs.lifecycle` | status events | 5+6 | Queue row error badge |
| `ctx.log(message, level='info')` | `tts.logs` | `tts_log` | any | Diagnostics panel only — queue ignores this |

**Critical rule (from wiki):** The queue must never infer row state from
`tts.logs`. All queue state changes must go through `ctx.update_job_progress`
or `ctx.update_queue_row`. Log lines are diagnostics only.

**Voice test jobs** follow the same lifecycle steps 1–7 but emit progress on
`voice.test` (`voice_test_progress` event kind) not `chapters.progress`. They
must include a `jobId` so the frontend can link the voice-test frame to the
visible queue row.

---

## 6. Migration Plan

Goal: every plugin handler under `plugins/` imports only from `studio_plugin_sdk`
(and stdlib/declared deps). No `from app.*` imports remain in plugin source trees.

Studio 2.0 is **not in production**. This migration is a hard cutover, not a
compatibility layer: as each handler is moved onto `StudioPluginContext`, the
old `app.*`-coupled code path is **deleted**, not kept behind a flag. The only
v1 artifact that survives is the v1→v2 *data* migration (project/chapter/segment
rows), which is out of scope for this doc. Do not add "keep for compatibility"
shims around plugin handlers or the loader.

### Step 1 — Create `studio_plugin_sdk` namespace package

- [ ] Create `app/studio_plugin_sdk/__init__.py` re-exporting the public surface:
  `StudioTTSEngine`, `StudioPluginContext`, `JobSpec`, `JobResult`,
  `TTSRequest`, `TTSResult`, `TimingEvent`, `VerificationResult`,
  `VoiceProcessingHooks`, `SynthesisPlan`.
- [ ] Add `studio_plugin_sdk` as a `sys.modules` alias in
  `app/tts_server/plugin_loader.py` so the TTS Server subprocess can resolve it.
- [ ] Define `studio_plugin_sdk.__version__ = "1.0"` (the `sdk_version` referent).
- [ ] Extend `_validate_manifest` in `app/tts_server/plugin_loader.py` to require
  and check `contract_version`, `sdk_version`, `settings_schema_version`, and
  `event_envelope_version` against per-field supported-value sets (each `{"1.0"}`
  today). Each check raises `PluginLoadError` with the field name on mismatch.
- [ ] Write a unit test: `import studio_plugin_sdk; assert hasattr(studio_plugin_sdk, 'StudioTTSEngine')`.
- [ ] Write a loader test: a manifest missing `contract_version` (or with an
  unsupported value) is surfaced as an invalid-config plugin, not silently loaded.

**Acceptance:** `python -c "import studio_plugin_sdk"` exits 0 in both the
Studio process and the TTS Server subprocess; `discover_plugins` rejects a
manifest that omits any of the four version fields with a contract error.

### Step 2 — Implement `StudioPluginContext` shim

- [ ] Create `app/studio_plugin_sdk/context.py` with `StudioPluginContext`,
  `JobSpec`, `JobResult` dataclasses.
- [ ] Implement each service method as a thin wrapper over the existing `app.*`
  internals (e.g. `update_job_progress` wraps `app.db.state.update_job`,
  `generate_via_bridge` wraps `app.jobs.handlers.bridge_helpers.generate_via_bridge`).
- [ ] Implement `emit_segment_started/saved/progress` wrapping
  `app.api.contracts.events` builder helpers.
- [ ] Add `broadcast_segments_updated` wrapping `app.api.ws.broadcast_segments_updated`.

**Acceptance:** `StudioPluginContext` can be instantiated in a Studio process
test and each method call reaches the underlying `app.*` function without error.

### Step 3 — Deduplicate `_ensure_plugin_package_hierarchy`

- [ ] The function exists identically in both `app/tts_server/plugin_loader.py`
  (def at line ~710, call at ~659) and `app/jobs/registry.py` (def at line ~197,
  call at ~174).
- [ ] Extract it to `app/studio_plugin_sdk/_import_utils.py`.
- [ ] Replace both call sites with an import from the new location.
- [ ] Run existing plugin loading tests to confirm no regression.

**Acceptance:** `grep -rn "_ensure_plugin_package_hierarchy" app/` returns
exactly one definition (in `_import_utils.py`) and two import sites.

### Step 4 — Migrate `plugins/tts_xtts` studio handlers

- [ ] In `plugins/tts_xtts/plugin/studio/handler.py`, replace all `from app.*`
  imports with equivalents from `studio_plugin_sdk`.
- [ ] Update `handle_xtts_job` signature to accept `ctx: StudioPluginContext`.
- [ ] Repeat for `segments.py`, `bake.py`, `standard_handler.py`.
- [ ] Update `manifest.json` to declare `worker_logic.kind_handlers` pointing
  to the updated handler function.

**Acceptance:** `grep -rn "from app\." plugins/tts_xtts/plugin/studio/` returns
nothing.

### Step 5 — Migrate `plugins/tts_voxtral` studio handlers

- [ ] Same process as Step 4 for `tts_voxtral`.

**Acceptance:** `grep -rn "from app\." plugins/tts_voxtral/plugin/studio/`
returns nothing.

### Step 6 — Migrate `plugins/tts_mixed` studio handlers

- [ ] **DECIDED (owner, 2026-06-10): rename `plugins/synthesis_mixed/` →
  `plugins/tts_mixed/`** so it matches the loader folder regex
  `^tts_[a-z][a-z0-9]{1,14}$` and is discovered normally (engine_id stays
  `mixed`). Execution steps live in doc 05 §4.4 (M1/M2); do the rename
  before or together with this step.
- [ ] Same process as Step 4 for `tts_mixed` (if it has studio-side
  handlers with `app.*` imports). It remains in-tree as a documented
  exception (`builtin: true`) since it depends on Studio's session model.

**Acceptance:** `plugins/synthesis_mixed/` no longer exists;
`grep -rn "from app\." plugins/tts_mixed/` returns nothing.

---

## Trust Model

### Security posture

Plugins run **unsandboxed** inside the TTS Server subprocess. The TTS Server runs as the same OS user as Studio, which means any code in a plugin or its dependencies has full access to the file system, network, and environment variables — the same as Studio itself.

**Installing a plugin = executing third-party code.** This happens at two points:

1. **Import** — when the user imports a `.zip`, the plugin's Python files are extracted and then loaded by the `plugin_loader` (which calls `importlib.import_module`). Execution begins at import time.
2. **Install Dependencies** — when the user triggers "Install Deps", Studio runs `pip install -r requirements.txt` inside the same Python environment. Dependency lines that start with `git+` or an HTTP/HTTPS URL pull and execute arbitrary remote code.

### Pre-install confirmation flow (S5)

To surface this risk, Studio shows a **Plugin Trust Modal** before either action is finalized:

- **Import flow**: `POST /engines/preview` stages the zip and returns `{engine_id, display_name, version, requirements, staging_token}`. The modal lists the full dependency list, highlights `git+`/URL lines as **REMOTE** sources, and shows the security notice. On confirm, `POST /engines/confirm/{token}` completes the install; on cancel, `DELETE /engines/staging/{token}` removes the staging directory.

- **Install-deps flow**: `GET /engines/{engine_id}/requirements` fetches the existing `requirements.txt` lines. The same modal is shown before `POST /engines/{engine_id}/install` fires.

### Signed plugins (post-release)

Verified-plugin signing and a trusted-publisher registry are planned for a future release. Until then, users are responsible for verifying plugin provenance.

---

### Step 7 — Enforce the contract in CI

- [ ] Add a pre-commit or CI check:
  ```bash
  grep -rn "from app\." plugins/ && echo "FAIL: plugins import app.*" && exit 1 || exit 0
  ```
- [ ] Add `contract_version`, `sdk_version`, `settings_schema_version`, and
  `event_envelope_version` (all `"1.0"`) to every plugin manifest under `plugins/`.
- [ ] Add the `check_output` method stub to each engine with default `return True, "OK"`.

**Acceptance:** `grep -rn "from app\." plugins/` returns nothing. All manifests
pass loader validation with the version checks from Step 1 enabled (a manifest
missing any version field fails discovery).
