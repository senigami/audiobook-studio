# Proposal: TTS Plugin SDK (Studio 2.0)

This document specifies how TTS engine plugins are packaged, discovered, validated, and integrated with Audiobook Studio. The plugin system is designed so that contributors can wrap any TTS engine and drop it into Studio without modifying Studio's core code.

## 1. Objectives

- Allow TTS engines to be added as self-contained plugin folders.
- Define a strict, versioned contract that all plugins must implement.
- Support discovery by folder scanning within the install root.
- Keep plugin naming compact to avoid Windows path length issues.
- Ensure built-in engines (XTTS, Voxtral) use the same plugin path as community plugins.
- Make plugin creation approachable for contributors who know Python but not Studio internals.

## 2. Plugin Directory Layout

All plugins live in a single `plugins/` directory at the Studio install root:

```text
audiobook-factory/
├── app/                          # Studio source
├── plugins/                      # All TTS engine plugins
│   ├── tts_xtts/                 # Built-in engine
│   │   ├── manifest.json         # Required: discovery metadata
│   │   ├── engine.py             # Required: implements StudioTTSEngine
│   │   ├── settings_schema.json  # Required: JSON Schema for UI-rendered settings
│   │   ├── settings.json         # Auto-managed: persisted user settings
│   │   ├── requirements.txt      # Optional: pip dependencies for this engine
│   │   ├── README.md             # Optional: contributor and user docs
│   │   └── assets/               # Optional: models, configs, reference files
│   │       └── ...
│   ├── tts_voxtral/              # Built-in engine
│   │   └── ...
│   └── tts_elevenlabs/           # Example community plugin
│       └── ...
├── frontend/
└── ...
```

### 2.1 Naming Convention

| Element | Convention | Example |
|---------|-----------|---------|
| Plugin folder | `tts_<name>` | `tts_xtts`, `tts_voxtral`, `tts_elevenlabs` |
| Engine ID (in manifest) | `<name>` only | `xtts`, `voxtral`, `elevenlabs` |
| Pip package (if ever distributed via pip) | `studio-tts-<name>` | `studio-tts-elevenlabs` |
| Entry point group (pip discovery) | `studio.tts` | `studio.tts` |

Constraints:
- Folder names must be 20 characters or fewer
- `<name>` must match `^[a-z][a-z0-9]{1,14}$` — lowercase alphanumeric, 2–15 characters
- No underscores or hyphens in the `<name>` part
- The `tts_` prefix is mandatory for folder scanning

### 2.2 Required Files

Every plugin **must** contain:

1. **`manifest.json`** — Discovery metadata. The TTS Server reads this before importing any Python code.
2. **`engine.py`** — Python module containing a class that implements `StudioTTSEngine`.
3. **`settings_schema.json`** — JSON Schema describing the engine's configurable settings. The Studio UI renders form controls from this schema.

### 2.3 Optional Files

- **`requirements.txt`** — Pip dependencies. The TTS Server checks whether these are installed during discovery. The Settings UI offers an "Install Dependencies" action.
- **`README.md`** — Documentation for contributors and users. Displayed in the Settings UI engine detail view.
- **`settings.json`** — Persisted user settings. Auto-created by the TTS Server when a user first configures the engine. Should not be committed to version control.
- **`assets/`** — Directory for model weights, config files, reference audio, or any other engine-specific data.

## 3. Manifest Schema

### 3.1 Full Schema

```json
{
  "schema_version": "1.0",
  "engine_id": "elevenlabs",
  "display_name": "ElevenLabs",
  "version": "0.1.0",
  "min_studio": "2.0.0",
  "entry_class": "engine:ElevenLabsEngine",
  "resource": {
    "gpu": false,
    "vram_mb": 0,
    "cpu_heavy": false
  },
  "languages": ["en", "es", "fr", "de", "ja"],
  "local": false,
  "cloud": true,
  "network": true,
  "capabilities": ["synthesis", "preview"],
  "author": "contributor_name",
  "license": "MIT",
  "homepage": "https://github.com/example/studio-tts-elevenlabs",
  "test_text": "This is a verification test."
}
```

### 3.2 Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema_version` | string | Yes | Manifest schema version. Currently `"1.0"`. |
| `engine_id` | string | Yes | Unique engine identifier. Must match `^[a-z][a-z0-9]{1,14}$`. |
| `display_name` | string | Yes | Human-readable engine name for the UI. |
| `version` | string | Yes | Plugin version. Semver recommended. |
| `min_studio` | string | Yes | Minimum Studio version required. |
| `entry_class` | string | Yes | `module:ClassName` pointer. Module is relative to the plugin folder. |
| `resource.gpu` | boolean | Yes | Whether this engine requires a GPU. |
| `resource.vram_mb` | integer | Yes | Estimated VRAM usage in megabytes. `0` if no GPU. |
| `resource.cpu_heavy` | boolean | Yes | Whether this engine does heavy CPU work. |
| `languages` | array of strings | Yes | ISO 639-1 language codes. |
| `local` | boolean | Yes | Whether this engine can run locally. |
| `cloud` | boolean | Yes | Whether this engine calls a remote API. |
| `network` | boolean | Yes | Whether this engine requires network access. |
| `capabilities` | array of strings | Yes | Supported operations: `"synthesis"`, `"preview"`. |
| `author` | string | No | Plugin author name. |
| `license` | string | No | License identifier (SPDX). |
| `homepage` | string | No | URL to plugin source or documentation. |
| `test_text` | string | No | Custom text for verification synthesis. Falls back to `"This is a verification test."` if omitted. |

### 3.3 Validation Rules

The TTS Server validates manifests on discovery:

- All required fields must be present and non-empty
- `engine_id` must match the naming regex
- `schema_version` must be a supported version
- `entry_class` must be in `module:ClassName` format
- `capabilities` must contain at least `"synthesis"`
- Duplicate `engine_id` across plugins is an error; the first-discovered plugin wins and the duplicate is logged as a warning

## 4. Engine Contract

### 4.1 Base Class

All plugins must implement this abstract base class:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class TTSRequest:
    """Immutable synthesis request from the TTS Server."""
    text: str
    output_path: str
    voice_ref: str | None       # Path to reference audio, or None
    settings: dict[str, Any]    # Engine-specific settings from settings.json
    language: str = "en"


@dataclass
class TTSResult:
    """What every engine must return after synthesis."""
    ok: bool
    output_path: str | None
    duration_sec: float | None
    warnings: list[str]
    error: str | None = None


class StudioTTSEngine(ABC):
    """Contract that all TTS plugin engines must implement."""

    @abstractmethod
    def info(self) -> dict[str, Any]:
        """Return engine metadata for registry display.

        This is called once during discovery. The returned dict is merged
        with manifest data to build the full engine profile.

        Expected keys: any additional runtime metadata not in the manifest.
        """
        ...

    @abstractmethod
    def check_env(self) -> tuple[bool, str]:
        """Check whether this engine can run in the current environment.

        Returns:
            (True, "OK") if the environment is valid.
            (False, "reason") if setup is needed.

        This is called during plugin discovery and re-verification.
        It should not load model weights or allocate GPU memory.
        """
        ...

    @abstractmethod
    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Pre-flight validation before synthesis.

        Returns:
            (True, "OK") if the request is valid for this engine.
            (False, "reason") if the request cannot be processed.

        This is called before every synthesize() and preview() call.
        """
        ...

    @abstractmethod
    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Run TTS synthesis.

        Must write audio output to req.output_path.
        Must not raise unhandled exceptions for normal failure cases.
        Must return TTSResult with ok=False and error message on failure.
        """
        ...

    @abstractmethod
    def settings_schema(self) -> dict[str, Any]:
        """Return JSON Schema describing this engine's configurable settings.

        This schema is used by the Studio UI to render per-engine settings
        forms. It should match the format in settings_schema.json.
        """
        ...

    def preview(self, req: TTSRequest) -> TTSResult:
        """Optional: lightweight preview synthesis.

        Override this if the engine supports a faster preview mode.
        Default implementation calls synthesize().
        """
        return self.synthesize(req)

    def shutdown(self) -> None:
        """Optional: cleanup when the engine is unloaded.

        Called during TTS Server shutdown or before plugin reload.
        Use this to release GPU memory, close file handles, etc.
        """
        pass
```

### 4.2 Contract Rules

- Engines must not access Studio's database, routes, or domain services.
- Engines must not start background threads or processes on their own.
- Engines must not write files outside their plugin folder or the requested `output_path`.
- Engines must handle their own errors gracefully and return `TTSResult(ok=False, ...)` on failure.
- Engines must not import Studio modules (anything under `app/`).
- Engines may import standard library, their own dependencies, and the SDK contract types.

### 4.3 What Gets Published As The SDK

The SDK is minimal — just the contract types that plugin authors need:

- `StudioTTSEngine` (abstract base class)
- `TTSRequest` (dataclass)
- `TTSResult` (dataclass)

These will be published as a small standalone file (`studio_tts_sdk.py`) that plugin authors copy into their project or install from pip. This avoids requiring plugin authors to install all of Studio to develop a plugin.

## 5. Settings Schema

### 5.1 Format

`settings_schema.json` uses standard JSON Schema (Draft 7+) to describe configurable settings:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "temperature": {
      "type": "number",
      "title": "Temperature",
      "description": "Controls randomness in generation. Lower values are more deterministic.",
      "default": 0.7,
      "minimum": 0.0,
      "maximum": 2.0
    },
    "repetition_penalty": {
      "type": "number",
      "title": "Repetition Penalty",
      "description": "Penalizes repeated tokens. Higher values reduce repetition.",
      "default": 2.0,
      "minimum": 1.0,
      "maximum": 10.0
    },
    "speed": {
      "type": "number",
      "title": "Speed Multiplier",
      "description": "Playback speed factor. 1.0 is normal speed.",
      "default": 1.0,
      "minimum": 0.5,
      "maximum": 2.0
    }
  },
  "required": []
}
```

### 5.2 UI Rendering Rules

The Studio Settings UI renders controls based on JSON Schema types:

| Schema Type | UI Control |
|-------------|-----------|
| `number` with `minimum`/`maximum` | Slider with number input |
| `number` without range | Number input |
| `string` | Text input |
| `string` with `format: "password"` | Password input (masked) |
| `string` with `enum` | Dropdown select |
| `boolean` | Toggle switch |
| `integer` | Integer input |

Fields are displayed in the order they appear in `properties`. The `title` field is used as the label, and `description` is shown as helper text.

### 5.3 Settings Persistence

When a user changes engine settings through the UI:

1. UI sends `PUT /api/engines/{id}/settings` to Studio
2. Studio proxies to TTS Server `PUT /engines/{id}/settings`
3. TTS Server validates against `settings_schema.json`
4. TTS Server writes to `plugins/tts_<name>/settings.json`
5. TTS Server reloads settings in the engine instance

## 6. Discovery Mechanisms

### 6.1 Folder Scanning (Primary)

The TTS Server scans the `plugins/` directory on startup:

```python
import os
from pathlib import Path

def discover_plugins(plugins_dir: Path) -> list[Path]:
    """Discover plugin folders matching the naming convention."""
    found = []
    for entry in sorted(plugins_dir.iterdir()):
        if entry.is_dir() and entry.name.startswith("tts_"):
            manifest = entry / "manifest.json"
            if manifest.is_file():
                found.append(entry)
            else:
                log.warning(f"Plugin folder {entry.name} has no manifest.json, skipping")
    return found
```

### 6.2 Entry Point Discovery (Future, Phase 9)

For pip-installed plugins, the TTS Server will also check `importlib.metadata`:

```python
from importlib.metadata import entry_points

def discover_pip_plugins() -> list:
    """Discover plugins registered via pip entry points."""
    return list(entry_points(group="studio.tts"))
```

This is explicitly deferred to Phase 9. Phase 5 implements folder scanning only.

### 6.3 Plugin Refresh

Users can trigger a re-scan from the Settings UI or via the TTS Server API:

```text
POST /plugins/refresh
```

This re-scans the `plugins/` directory, discovers new plugins, re-validates existing ones, and updates the engine registry. It does not restart the TTS Server.

## 7. Plugin Installation

### 7.1 Drop-In Installation

The simplest installation method:

1. Download or clone the plugin folder
2. Place it in `plugins/` (e.g., `plugins/tts_elevenlabs/`)
3. Click "Refresh Plugins" in Settings → TTS Engines, or restart Studio
4. The plugin appears in the engine list

### 7.2 Dependency Installation

If the plugin has a `requirements.txt`:

1. The TTS Server detects unmet dependencies during discovery
2. The engine is marked as `needs_setup`
3. The Settings UI shows an "Install Dependencies" button
4. Clicking the button runs `pip install -r plugins/tts_<name>/requirements.txt` in Studio's venv
5. After installation, the user clicks "Verify" to re-check and re-verify

### 7.3 Pip Installation (Phase 9)

```bash
pip install studio-tts-elevenlabs
```

This registers an entry point in the `studio.tts` group. The TTS Server discovers it via `importlib.metadata` on next startup or refresh.

## 8. Plugin Security Boundary

### 8.1 Trust Model

Plugins run as user-level code in the TTS Server process. There is no sandboxing. This is the same trust model as Stable Diffusion extensions, VS Code extensions, and Home Assistant integrations.

### 8.2 What We Do To Limit Blast Radius

- Plugins run in a separate process from Studio (TTS Server), so a crash does not kill the web server.
- Each plugin's `synthesize()` is wrapped in exception handling.
- Plugin file access is not sandboxed, but the contract prohibits writing outside the plugin folder and requested output paths.
- Plugins cannot access Studio's database or domain services.
- The watchdog detects process-level crashes and restarts the TTS Server.
- Verification synthesis provides a basic smoke test before a plugin is used for real work.

### 8.3 What We Do NOT Do

- No bytecode analysis or static analysis of plugin code.
- No process-level sandboxing (no containers, no seccomp).
- No signature verification for plugin packages.
- No automatic security auditing of plugin dependencies.

Users install plugins at their own risk, just like any Python package. The contributor guide will include a security notice.

## 9. Path Safety

Plugin folder scanning and file access must follow the backend paths rules:

- Plugin folder names are validated against a strict regex before any filesystem access.
- Paths derived from manifest fields (like `entry_class`) are validated before use.
- The TTS Server rejects any plugin folder name containing `..`, `/`, `\`, or characters outside the allowed set.
- All file operations within a plugin folder are scoped to the plugin's directory. The TTS Server verifies containment before reading any file.

## 10. Implementation References

- `plans/v2_tts_server.md` — TTS Server process architecture
- `plans/v2_voice_system_interface.md` — engine contract history and bridge architecture
- `plans/v2_local_tts_api.md` — external API that uses the plugin system
- `plans/v2_settings_architecture.md` — per-engine settings UI
- `plans/implementation/voice_engine_impl.md` — file-level implementation blueprint
