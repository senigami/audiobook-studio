# TTS Plugin Guide

This guide explains how to create a TTS plugin for Audiobook Studio 2.0.

The short version:

- Plugins live in `plugins/tts_<name>/`
- Studio discovers plugins through the TTS Server
- Each plugin implements the `StudioTTSEngine` contract
- Optional hooks let the plugin influence planning, request shaping, voice selection, and postprocessing
- Studio owns the UI, queueing, and job orchestration. The plugin owns encoder-specific audio behavior.

If you only want to add a new voice model with no special processing, you can keep the hooks as no-ops and only implement the required engine methods.

## Quick Start

1. Copy `docs/plugin-template/` into `plugins/tts_myengine/`.
2. Rename `engine_id`, `display_name`, and the engine class.
3. Edit `manifest.json` and `settings_schema.json`.
4. Implement your engine in `engine.py`.
5. Start Studio and click `Refresh Plugins` in Settings > TTS Engines.
6. Verify the plugin appears in the engine list and can pass discovery checks.

## Plugin Layout

```text
plugins/tts_myengine/
├── manifest.json
├── engine.py
├── settings_schema.json
├── settings.json
├── requirements.txt
├── README.md
└── assets/
```

Required files:

- `manifest.json`
- `engine.py`
- `settings_schema.json`

Optional files:

- `requirements.txt`
- `README.md`
- `settings.json`
- `assets/`

## What Studio Owns vs What The Plugin Owns

Studio owns:

- Settings UI
- plugin discovery and refresh
- enabled/disabled state
- verification state
- job scheduling and queueing
- chapter/script orchestration
- preview/test routing

The plugin owns:

- model-specific request shaping
- chunk sizing and speed guidance
- voice mapping
- optional emotion hints
- audio postprocessing
- plugin-specific settings schema
- plugin-specific help/privacy copy

If a behavior is specific to one encoder, keep it in the plugin. If Studio would need to know about it for a second plugin, that is a hook.

## Current Hook Surface

The current plugin hook surface is intentionally small and composable.

| Stage | Method | Purpose |
| --- | --- | --- |
| Discovery metadata | `info()` | Return runtime metadata for the registry |
| Environment check | `check_env()` | Tell Studio whether the plugin can run now |
| Request check | `check_request(req)` | Validate a synthesis or preview request |
| Planning | `hooks().plan_synthesis(req)` | Suggest chunk size, speed, emotion, and metadata |
| Request shaping | `hooks().preprocess_request(request)` | Mutate the raw request dict before synthesis |
| Voice selection | `hooks().select_voice(profile_id, settings)` | Map a Studio profile to an engine-specific voice ID |
| Synthesis | `synthesize(req)` | Write the final audio file |
| Preview | `preview(req)` | Optional faster preview path |
| Voice Readiness | `hooks().check_readiness(id, settings, dir)` | Check if a voice has enough samples/data |
| Postprocessing | `hooks().postprocess_audio(output_path, settings)` | Clean up or adjust the generated audio |
| Shutdown | `shutdown()` | Release resources before reload or exit |

The core dispatch path is intentionally narrow:

- `VoiceBridge` calls `plan_synthesis()` before chunking and request shaping
- `VoiceBridge` calls `preprocess_request()` immediately before synthesis or preview
- `VoiceBridge` calls `select_voice()` when a profile needs engine-specific voice resolution
- `VoiceBridge` calls `postprocess_audio()` after a successful audio write

If you need a new stage, add it to the SDK and wire it through the bridge rather than adding a hardcoded engine branch in Studio core.

> [!NOTE]
> All hooks run inside the TTS Server subprocess. When Studio's `VoiceBridge` triggers a hook, it is routed via HTTP to the server, which then executes the hook on the plugin instance. This ensures your hooks have access to the same local environment and dependencies as your synthesis code.

## SDK Contract

Plugin engines must implement `StudioTTSEngine`.

Required methods:

- `info()`
- `check_env()`
- `check_request(req)`
- `synthesize(req)`
- `settings_schema()`

Optional methods:

- `preview(req)`
- `shutdown()`

Optional hook object:

- `hooks()` returns a `VoiceProcessingHooks` instance

### `info()`

Return runtime metadata that helps the registry and UI display the engine.

Good values:

- model version
- detected file paths
- GPU availability
- setup notes

### `check_env()`

Use this to verify the plugin can run in the current environment.

Keep it fast and side-effect free:

- do not load large model weights
- do not allocate GPU memory
- do not start worker threads

### `check_request(req)`

Validate request shape and plugin-specific prerequisites.

Use this for things like:

- missing reference audio
- unsupported language
- missing voice ID
- settings out of range

### `synthesize(req)`

Write the final audio file to `req.output_path`.

Rules:

- return `TTSResult(ok=False, error=...)` for normal failures
- do not raise for expected user errors
- keep the plugin’s own runtime errors isolated from Studio

### `preview(req)`

Override this when you can generate a lighter or faster preview than a full synthesis pass.

If you do not need a special preview path, let Studio fall back to `synthesize()`.

### `settings_schema()`

Return JSON Schema that describes your plugin settings.

Studio uses this schema to:

- render the engine card UI
- validate updates
- persist `settings.json`

## Hook Contract Details

### Planning

`plan_synthesis(req)` lets the plugin influence:

- chunk size
- speed factor
- emotion hints
- engine-specific metadata

Use this hook when the plugin needs to change how Studio should batch or stage the request.

Examples:

- XTTS can prefer shorter chunks for stability
- Voxtral can accept larger context or different staging rules
- a future engine can suggest emotion-aware synthesis or custom batching

### Request Shaping

`preprocess_request(request)` is the place for engine-specific request cleanup.

Use it to:

- resolve engine-local reference paths
- inject default model settings
- normalize plugin-only payload fields
- adapt Studio’s canonical request into your engine’s expected shape

### Voice Selection

`select_voice(profile_id, settings)` lets the plugin translate a Studio profile into an engine-specific voice reference.

Use it for:

- XTTS reference WAV resolution
- Voxtral voice ID lookup
- future plugin-provided voice catalogs

Return `None` when the default voice is fine.

### Postprocessing

`postprocess_audio(output_path, settings)` runs after a successful synthesis or preview.

Use it for:

- trimming silence
- normalizing levels
- tagging output metadata
- cleaning temporary artifacts

### Voice Readiness

`check_readiness(profile_id, settings, profile_dir) -> (bool, str)` is called by the Voices API to determine if a voice profile has sufficient material (samples, latents, or remote IDs) to be used for synthesis.

If this returns `False`, the Build and Test buttons in the UI will be disabled or show an error message.

- **profile_id**: The name of the speaker profile.
- **settings**: The profile's current engine-specific settings.
- **profile_dir**: Absolute path to the profile's local storage directory.

Use this hook to ensure users have provided all required model inputs before they try to render audio.

## Settings Schema Tips

Keep your schema small and readable.

Recommended fields:

- `title`
- `description`
- `default`
- `minimum` / `maximum` for ranges
- `enum` for bounded choices
- `format: "password"` for secrets

Good schema design makes the Settings UI feel native without custom frontend work.

## Dependency Management

If your plugin needs extra Python packages:

1. Put them in `requirements.txt`
2. Keep the file scoped to the plugin
3. Document any GPU, OS, or driver prerequisites in `README.md`
4. Use `check_env()` to fail early with a clear message if the dependency set is incomplete

## Testing A Plugin

Suggested test order:

1. Start Studio
2. Refresh plugins
3. Confirm your engine appears in Settings > TTS Engines
4. Verify the engine status badge and settings schema render correctly
5. Run a preview/test synthesis
6. Run a full synthesis
7. Check that `check_env()` and `check_request()` report useful failures

If your plugin ships a template or example, include a tiny regression test that imports the engine class and exercises `check_env()` and `settings_schema()`.

## Security Boundary and Trust Model

Audiobook Studio uses a **User-Trust Model** for plugins, similar to systems like Stable Diffusion extensions, VS Code extensions, or Home Assistant integrations.

### Key Security Principles

1.  **Process Isolation**: Plugins run in the **TTS Server subprocess**, not the main web server process. If a plugin crashes or leaks memory, it affects the synthesis worker but does not take down the entire Studio application or the database.
2.  **No Automatic Execution**: Studio discovers plugins but does not enable them automatically. Users must intentionally enable a plugin in the Settings UI.
3.  **No Studio Core Imports**: Plugins are strictly forbidden from importing `app.*` or accessing Studio's internal database and domain services. They interact with Studio exclusively through the defined SDK contract.
4.  **Narrow File Access**: While not strictly sandboxed by the OS, the contract requires that plugins:
    *   Only write audio output to the requested `output_path`.
    *   Only persist settings to their own `settings.json` within their plugin folder.
    *   Do not read or write files outside their plugin folder or authorized asset paths.
5.  **Verified Execution**: The **Verification Synthesis** step ensures that an engine can produce valid audio in the current environment before it is ever used for production rendering.

### User Guidance

*   **Install from Trusted Sources**: Only install plugins from authors or repositories you trust. Because plugins are raw Python code, they have the same permissions as your user account.
*   **Audit requirements.txt**: Before clicking "Install Dependencies", review the `requirements.txt` file in the plugin folder to see what packages will be added to your environment.
*   **Security Reporting**: If you find a plugin that violates these boundaries or attempts malicious behavior, please report it to the maintainers.

## Submission Checklist

Before sharing a plugin with someone else:

- the manifest validates
- the engine loads
- the environment check gives a useful message
- preview works
- synthesis works
- the settings schema renders cleanly in Studio
- the plugin includes any special voice or privacy notes users need
- the plugin respects the file access and import boundaries defined in the Security section

## Where To Look In Studio

If you are extending Studio itself, the relevant code paths are:

- `app/engines/voice/sdk.py` for the SDK types and hook definitions
- `app/engines/voice/base.py` for the engine base contract
- `app/engines/bridge.py` for request dispatch and hook invocation
- `app/engines/registry.py` for discovery metadata
- `app/engines/models.py` for manifest and registry models
- `app/api/routers/engines.py` for settings and refresh endpoints
- `frontend/src/features/settings/routes/SettingsRoute.tsx` for the engine cards and schema-driven settings UI

## Plugin Author Rule Of Thumb

If the plugin behavior is different because of the engine, keep it in the plugin.
If Studio needs to know about it generically, expose it through the hook contract.
