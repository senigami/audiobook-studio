# Voxtral (Mistral AI) — Audiobook Studio TTS plugin

Voxtral is the official cloud text-to-speech engine plugin for
[Audiobook Studio](https://github.com/StevenDunn/audiobook-factory) 2.0. It
synthesizes via Mistral AI's Voxtral API and demonstrates the recommended
plugin layout for an engine that calls a remote service while exposing the
same Studio-facing interface contract as a local engine.

## Install

- **Official registry (recommended):** open Studio → Settings → TTS Engines →
  Browse, and install "Voxtral (Mistral AI)" from the official registry.
- **Paste a repo URL:** paste `https://github.com/audiobook-studio/tts-voxtral`
  into the "Install from URL" field. Studio clones the repo, validates
  `manifest.json`, and registers the engine.
- **Offline ZIP:** download the repo as a ZIP and use Studio's ZIP upload.

The engine stays in `needs_setup` until you add a **Mistral API key** in
Studio → Settings → TTS Engines → Voxtral.

## Resource profile

- **GPU:** none — synthesis happens in Mistral's cloud.
- **Network:** required at synthesis time.
- **Account:** a Mistral API key (usage billed under your Mistral account).
- **Languages:** en, fr, es, de, it, pt.

## License

The plugin code is licensed under the **MIT License** (see `LICENSE`). The
engine requires a Mistral API key to synthesize; your use of the Voxtral API
is governed by Mistral AI's own terms of service, separate from this plugin's
license.

## Import contract and the `plugin/studio/` boundary

This plugin imports only the `studio_plugin_sdk` package (plus the standard
library and its own modules). It never imports Studio's `app.*` internals —
with one deliberate, documented exception:

**`plugin/studio/` is host-integration code.** It runs in-process inside the
Studio app (not in the TTS Server subprocess) and bridges Studio's job system
to this engine. Its modules use lazy, function-body `from app.…` imports that
only execute inside a running Studio host. Everything else — `plugin/server/`,
`plugin/core/`, `interface.py`, `cli.py` — imports only `studio_plugin_sdk`
and is enforced by import-cleanliness tests in `tests/`.

Host APIs used by `plugin/studio/`: `app.core.config`, `app.db` (incl.
`lexicon`, `speakers`, `state`), `app.engines.audio_ops`,
`app.engines.errors`, `app.jobs.handlers.bridge_helpers`, and
`app.utils.text.lexicon`.

## Public contract

- `manifest.json` declares Studio-facing entrypoints, behavior, and the
  `distribution` block pointing back at this repo.
- `settings_schema.json` declares user-editable settings and read-only
  computed values for the Settings UI.
- `interface.py` is the public Python surface Studio loads.

Everything under `plugin/` is internal implementation detail.

## Standalone usage

The engine can run as a standalone CLI without the Studio app:

```bash
pip install -r requirements.txt
export MISTRAL_API_KEY="your-key"
python cli.py --text "Hello" --out output.wav --voice-id "mistral-tts-latest"
```

## CLI Builder Harness

This plugin includes a [CLI Builder Harness](./preview/index.html) to help you
compose `cli.py` commands and visualize the JSON state contract without a
running server.

## Studio Dev Mode

For an accurate UI preview, use the Studio-hosted Dev Mode. It renders the
real Studio UI components using fixtures defined in
[dev/scenarios.json](./dev/scenarios.json). Enable Dev Mode in Studio settings
or run with `VITE_DEV_MODE=true`, then open the Plugin Developer tab.

## Internal layout

- `plugin/server/` implements the TTS Server `StudioTTSEngine` contract.
- `plugin/studio/` contains the host-integration adapter and worker dispatch
  glue (see the boundary section above).
- `plugin/core/` contains Voxtral API and audio conversion helpers.
- `tests/` travels with the plugin and runs standalone (`pytest tests`).

Mutable runtime data is stored by Studio in `plugin_data/voxtral/`, not in
this plugin source folder.
