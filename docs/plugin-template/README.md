# Plugin Template

This folder is a minimal starting point for a Studio TTS plugin.

Copy this folder to `plugins/tts_<your_engine>/` and then:

1. Rename the engine ID and display name
2. Update `manifest.json`
3. Adjust `settings_schema.json`
4. Replace the placeholder engine implementation
5. Add any plugin-specific dependencies to `requirements.txt`

The template is intentionally small:

- it shows the current Studio SDK shape
- it demonstrates the hook contract
- it keeps plugin-owned behavior out of Studio core

## Files

- `manifest.json` - discovery metadata
- `engine.py` - engine implementation and hook object
- `settings_schema.json` - settings rendered in Studio
- `requirements.txt` - optional dependencies

## Notes

- The template engine is a reference implementation.
- Replace the placeholder synthesis logic with your actual model integration.
- Keep encoder-specific behavior inside the plugin, not in Studio callers.
- If you need a new hook stage, add it to the SDK and bridge rather than branching in Studio UI code.
