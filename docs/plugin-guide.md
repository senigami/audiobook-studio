# TTS Plugin Guide

This guide explains how to create a TTS plugin for Audiobook Studio 2.0.

The short version:

- Plugins live in `plugins/tts_<name>/`
- Studio discovers plugins through the TTS Server
- Each plugin implements the `StudioTTSEngine` contract
- Plugin manifests declare capabilities, behavior, and hook ownership
- Optional hooks let the plugin influence planning, request shaping, voice selection, and postprocessing
- Studio owns the UI, queueing, and job orchestration. The plugin owns encoder-specific audio behavior.

If a behavior is not supported, declare it as unsupported or return an explicit failure. Do not use silent no-op hooks as the contract.

## Quick Start

1. Copy `docs/plugin-template/` to a new folder and customize it.
2. Update `manifest.json` with your `engine_id`, `display_name`, and `entry_class`.
3. Compress your plugin folder into a **.zip** file (ensure `manifest.json` is at the root of the zip).
4. In Studio, go to **Settings > TTS Engines** and click **Import Plugin (.zip)**.
5. Verify the plugin appears in the list and passes initial discovery.
6. Once ready for distribution, authors can also submit plugins for inclusion as built-in engines.
7. Treat the template as the canonical example of the declared-hook model, not as a no-op stub library.

## Plugin Layout

```text
plugins/tts_myengine/
├── README.md
├── manifest.json
├── settings_schema.json
├── requirements.txt
├── interface.py
├── plugin/
│   ├── server/
│   ├── studio/
│   └── core/
└── tests/
```

Required files:

- `manifest.json` (must declare `studio_tts_manifest`: "1.0")
- `settings_schema.json`
- `interface.py`

Optional files:

- `requirements.txt`
- `README.md`
- `tests/`

`plugin/` is the recommended internal organization, not a hard requirement.
Future plugins may use different internal folders as long as their manifest
points Studio to valid entrypoints. Runtime data such as `settings.json` and
`state.json`, plus generated verification samples such as `sample.wav`, is
stored by Studio under `plugin_data/<engine_id>/`, not in the plugin source
folder.

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

For the live event stream and queue lifecycle contract, read
[`docs/event_stream_processing_schema.md`](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/docs/event_stream_processing_schema.md).
That document spells out the required queue row sequence, the voice-test
exception, and which topics own state versus diagnostics.

### Queue lifecycle rules for plugin handlers (binding)

- **One queue authority.** Update job state only through `update_job(...)`
  (`app.db.state`). Never write `processing_queue` rows directly from plugin
  code — the shared path keeps the durable row, `state.json`, and the
  `queue.items` websocket topic in sync. (`design-docs/specs/queue-jobs.md`)
- **Topic ownership.** `queue.items` is the only topic with queue-row
  authority on the frontend; progress topics (`chapters.progress`,
  `segments.progress`, `voice.test`) are live overlays on existing rows, and
  `tts.logs` is diagnostics only. Voice-test frames MUST carry `ids.jobId`.
  (`design-docs/specs/live-events.md` §"Queue row authority")
- **WAV-first synthesis.** Chapter synthesis completes with `output_wav`
  only: no `finalizing` status, no MP3 conversion inside the synthesis
  lifecycle. MP3 is an explicit export action. (`design-docs/specs/queue-jobs.md`
  §3.6)
- **Sample jobs have no chapter context.** Handlers registered as engine
  handlers also receive voice sample/preview jobs (`kind` in `sample_build`,
  `sample_test`, `voice_build`, `voice_test`); these render into the voice
  profile directory and must not require `project_id`/`chapter_id`.

## Declared Hook Model

The current plugin hook surface is intentionally small and composable, but the declaration lives in the manifest and SDK contract first.

Use the plugin template in `docs/plugin-template/` as the canonical example of the smallest valid declared plugin.

When you add a plugin:

- declare the plugin's capabilities in `manifest.json`
- declare any worker or behavior hooks the plugin owns
- implement only the hooks the plugin actually supports
- keep the app generic and let it call through the declared contract

The runtime hook surface is:

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

If you need a new stage, add it to the SDK and wire it through the bridge or registry rather than adding a hardcoded engine branch in Studio core.

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

The template engine is intentionally explicit about this contract so new plugin authors can follow a real example instead of reverse-engineering hidden assumptions in Studio core.

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
- persist runtime settings under Studio-owned `plugin_data/<engine_id>/`

### Per-Voice Settings

Plugins can declare which settings from their `settings_schema.json` should be available for per-voice overrides (e.g., custom temperature or repetition penalty for a specific voice variant).

To enable this, list the allowed keys in your `manifest.json` under `behavior.synthesis_settings`:

```json
{
  "behavior": {
    "synthesis_settings": [
      "temperature",
      "repetition_penalty",
      "top_k",
      "top_p"
    ]
  }
}
```

Studio uses this list to:
- Filter the engine schema when displaying per-voice controls in the UI.
- Validate that updates to a voice profile's settings only contain allowed keys.
- Merge these overrides into the synthesis request before calling your plugin's `synthesize()` or `preview()` methods.

Common settings like `speed` and `model` are always allowed for per-voice overrides and do not need to be listed in `synthesis_settings`.

## Manifest And Hook Declaration Rules

Use the manifest as the declaration layer:

- `capabilities` says what the plugin can do
- `behavior` says what Studio should ask for or expect from the plugin
- `worker_logic` says which job kinds or engine ids the plugin owns. Handlers must be in `module:function` format.
- `entry_class` says which class implements the plugin, usually via `interface.py`. Must be in `module:Class` format.
- `built_in` (optional, default: `false`) if `true`, Studio will protect the plugin from being uninstalled via the UI. Usually reserved for first-party engines.
- `studio_tts_manifest` must be "1.0" for this version of Studio.

Use the Python SDK as the runtime layer:

- `StudioTTSEngine` provides the required entrypoints
- `VoiceProcessingHooks` provides optional behavior hooks
- The app should not infer engine-specific behavior from class names or hardcoded app-side checks when the manifest can declare it

If a plugin needs a new hook, document it here and add it to the SDK rather than silently expanding Studio core.

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

## Installation and Lifecycle

Studio supports two main ways to install plugins:

### 1. Manual Drop-in
Copy the plugin folder into the `plugins/` directory. The folder name **must** follow the pattern `tts_[a-z][a-z0-9_]{1,14}`. After copying, click **Refresh Plugins** in the Studio UI.

### 2. Zip Import (Recommended)
Users can upload a `.zip` file containing the plugin via the **Import Plugin (.zip)** button in Settings.
- **Safety**: Studio validates the zip for path traversal attacks and ensures `manifest.json` is present and valid before extraction.
- **Root Level**: `manifest.json` must be at the top level of the zip file.
- **Conflicts**: Studio will reject the import if a plugin with the same `engine_id` already exists.

### Uninstalling
Plugins can be uninstalled directly from their Engine Card in Settings.
- **Atomic Deletion**: Studio shuts down the engine instance, deletes the plugin folder, and refreshes the registry.
- **Built-in Protection**: Plugins marked with `"built_in": true` in their manifest cannot be uninstalled via the UI.

## Settings Schema Tips

Your `settings_schema.json` **must be a JSON dictionary (object)** at the root level. Studio will reject the plugin if the schema is a list or other primitive type.

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
    *   Let Studio persist settings and verification state under `plugin_data/<engine_id>/`.
    *   Do not read or write files outside their plugin folder, authorized asset paths, or requested output path.
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

## Developer Scenarios

Plugin authors can define **Developer Scenarios** to test how their engine card renders in different states (e.g., missing dependencies, unverified, or ready) without manually breaking their environment.

### 1. Enable Developer Mode

In your `manifest.json`, enable developer mode and point to a scenarios file:

```json
{
  "dev": {
    "enabled": true,
    "scenarios": "dev/scenarios.json"
  }
}
```

### 2. Define Scenarios

Create `dev/scenarios.json` in your plugin folder. It must contain a `scenarios` array. Each scenario defines overrides for the engine's runtime state.

```json
{
  "scenarios": [
    {
      "id": "missing_deps",
      "label": "Missing Dependencies",
      "engine_detail": {
        "status": "needs_setup",
        "verified": false,
        "enabled": false,
        "dependencies_satisfied": false,
        "missing_dependencies": ["torch", "coqui-tts"],
        "setup_message": "Run Install Deps to continue."
      }
    },
    {
      "id": "ready",
      "label": "Ready",
      "engine_detail": {
        "status": "ready",
        "verified": true,
        "enabled": true
      }
    }
  ]
}
```

### 3. Scenario Contract

- **Required Fields**: Each scenario must have `id`, `label`, and `engine_detail`.
- **Identity Protection**: Identity fields (like `engine_id`, `display_name`, `author`, `logo_url`) cannot be overridden by scenarios. Studio will ignore these if present in `engine_detail`.
- **State Overrides**: You can override any other field in `TtsEngine`, such as `status`, `verified`, `enabled`, `current_settings`, and `settings_schema`.
- **Deep Merge**: `current_settings` and `settings_schema` are deep-merged with the base values, allowing you to override specific fields while keeping the rest of the original state.
- **Simulated Logs**: You can optionally include a `dev_logs` object to provide custom messages when "Run Test", "Verify", or "Install Deps" are clicked while the scenario is active.

### 4. Validation

Studio validates the structure and JSON syntax of your scenarios file. If it is malformed, the Engine Developer Panel will display a specific error message describing the issue.

## Plugin Author Rule Of Thumb

If the plugin behavior is different because of the engine, keep it in the plugin.
If Studio needs to know about it generically, expose it through the hook contract.
