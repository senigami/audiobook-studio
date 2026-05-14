# Voxtral Plugin

Voxtral is the reference cloud/API plugin for Audiobook Studio 2.0. It
demonstrates the recommended mini-repo layout for a plugin that calls a remote
service while still exposing the same Studio-facing interface contract.

## Public Contract

- `manifest.json` declares Studio-facing entrypoints and behavior.
- `settings_schema.json` declares user-editable settings and read-only computed
  values for the Settings UI.
- `interface.py` is the public Python surface Studio loads.

Everything under `plugin/` is internal implementation detail and can be
organized differently by future plugins.

## Internal Layout

- `plugin/server/` implements the TTS Server `StudioTTSEngine` contract.
- `plugin/studio/` contains app-side adapter and worker dispatch glue.
- `plugin/core/` contains Voxtral API and audio conversion helpers.

Mutable runtime data is stored by Studio in `plugin_data/voxtral/`, not in this
plugin source folder.
