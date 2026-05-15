# Voxtral Plugin

Voxtral is the reference cloud/API plugin for Audiobook Studio 2.0. It
demonstrates the recommended mini-repo layout for a plugin that calls a remote
service while still exposing the same Studio-facing interface contract.

## Public Contract

- `manifest.json` declares Studio-facing entrypoints and behavior.
- `settings_schema.json` declares user-editable settings and read-only computed
  values for the Settings UI.
- `interface.py` is the public Python surface Studio loads.

Everything under `plugin/` is internal implementation detail.

## Standalone Usage

This plugin can be run as a standalone CLI without the Studio app:

```bash
pip install -r requirements.txt
export MISTRAL_API_KEY="your-key"
python cli.py --text "Hello" --out output.wav --voice-id "mistral-tts-latest"
```

## CLI Builder Harness

This plugin includes a [CLI Builder Harness](./preview/index.html) to help you compose `cli.py` commands and visualize the JSON state contract without a running server.

## Studio Dev Mode

For an accurate UI preview, you can use the Studio-hosted Dev Mode. This mode renders the real Studio UI components using fixtures defined in [dev/scenarios.json](./dev/scenarios.json).

To use it, enable Dev Mode in the Studio settings or run with `VITE_DEV_MODE=true`, then navigate to the Plugin Developer tab.

## Internal Layout

- `plugin/server/` implements the TTS Server `StudioTTSEngine` contract.
- `plugin/studio/` contains app-side adapter and worker dispatch glue.
- `plugin/core/` contains Voxtral API and audio conversion helpers.

Mutable runtime data is stored by Studio in `plugin_data/voxtral/`, not in this
plugin source folder.
