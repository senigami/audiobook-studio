# XTTS Local Plugin

XTTS Local is the reference local-engine plugin for Audiobook Studio 2.0. It
demonstrates the recommended mini-repo layout for a plugin with local model
dependencies, Studio worker handlers, voice-building handlers, and TTS Server
synthesis code.

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
python cli.py --text "Hello" --out output.wav --speaker-wav path/to/voice.wav
```

## Developer Harness

This plugin includes a [Static Developer Harness](./preview/index.html) to visualize its Studio 2.0 settings contract and CLI command generation without a running server.

## Internal Layout

- `plugin/server/` implements the TTS Server `StudioTTSEngine` contract.
- `plugin/studio/` contains app-side adapter and worker dispatch glue.
- `plugin/core/` contains XTTS runtime helpers and inference code.

Mutable runtime data is stored by Studio in `plugin_data/xtts/`, not in this
plugin source folder. Generated verification samples such as `sample.wav` live
there too.
