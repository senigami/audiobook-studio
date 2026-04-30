# Cloud Mock (PoC) Plugin Template

This folder is a concrete proof-of-concept for a Studio TTS plugin. It demonstrates how to wrap a cloud-based synthesis API using the current Studio SDK.

To use this template for your own plugin:

1. Copy this folder to `plugins/tts_<your_engine>/` (e.g., `plugins/tts_elevenlabs/`).
2. Update `engine_id` and `display_name` in `manifest.json`.
3. Adjust `settings_schema.json` to reflect your engine's configuration (API keys, models, etc).
4. Replace the mock synthesis logic in `engine.py` with your actual API calls.
5. List your dependencies in `requirements.txt`.

## Features Demonstrated

- **Manifest Metadata**: Clean discovery and display in Studio.
- **Hook Contract**: Request preprocessing, voice selection, and readiness checks.
- **Schema-Driven UI**: Password fields for API keys and range sliders for numeric settings.
- **Dependency Management**: Working `requirements.txt` detected by Studio's guided install flow.
- **Environment Checks**: Early validation of API keys or model files.

## Security Boundary Notice

Plugins are trusted code. When developing or sharing a plugin, ensure it respects the boundaries defined in the [Plugin Guide](../plugin-guide.md#security-boundary-and-trust-model).

- Do not import `app.*`
- Only write files to the requested `output_path` or your own `settings.json`.
- Keep model assets within the plugin folder or a dedicated assets root.
