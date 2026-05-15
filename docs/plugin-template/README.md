# Cloud Mock (PoC) Plugin Template

This folder is a concrete proof-of-concept for a Studio TTS plugin. It demonstrates how to wrap a cloud-based synthesis API using the current Studio SDK.

To use this template for your own plugin:

1. Copy this folder to `plugins/tts_<your_engine>/` (e.g., `plugins/tts_elevenlabs/`).
2. Update `studio_tts_manifest` (must be "1.0"), `engine_id`, `display_name`, `capabilities`, and any `worker_logic` or `behavior` declarations in `manifest.json`.
3. Adjust `settings_schema.json` to reflect your engine's configuration (API keys, models, etc).
4. Replace the mock synthesis logic in `plugin/server/engine.py` with your actual API calls.
5. List your dependencies in `requirements.txt`.
6. Keep the template as a concrete example of the declared-hook model, not as a collection of no-op stubs.

## Features Demonstrated

- **Manifest Metadata**: Clean discovery and display in Studio.
- **Public Interface**: `interface.py` is the stable surface Studio loads.
- **Hook Contract**: Request preprocessing, voice selection, readiness checks, and manifest-declared capabilities.
- **Schema-Driven UI**: Password fields for API keys and range sliders for numeric settings.
- **Dependency Management**: Working `requirements.txt` detected by Studio's guided install flow.
- **Environment Checks**: Early validation of API keys or model files.
- **Flexible Internals**: `plugin/server`, `plugin/studio`, and `plugin/core` are recommended folders, not mandatory API.

## Security Boundary Notice

Plugins are trusted code. When developing or sharing a plugin, ensure it respects the boundaries defined in the [Plugin Guide](../plugin-guide.md#security-boundary-and-trust-model).

- Do not import `app.*`
- Only write files to the requested `output_path` or clearly documented plugin assets.
- Let Studio persist mutable settings/state under `plugin_data/<engine_id>/`.
- Keep model assets within the plugin folder or a dedicated assets root.
