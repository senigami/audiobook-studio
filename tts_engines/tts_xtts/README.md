# XTTS (Local) — Audiobook Studio TTS plugin

XTTS is the official local voice-cloning and text-to-speech engine plugin for
[Audiobook Studio](https://github.com/StevenDunn/audiobook-factory) 2.0. It
runs the Coqui XTTS v2 model entirely on your machine — no cloud account, no
network required — and supports voice cloning from a short reference sample.

## Install

- **Official registry (recommended):** open Studio → Settings → TTS Engines →
  Browse, and install "XTTS (Local)" from the official registry.
- **Paste a repo URL:** paste `https://github.com/audiobook-studio/tts-xtts`
  into the "Install from URL" field. Studio clones the repo, validates
  `manifest.json`, and registers the engine.
- **Offline ZIP:** download the repo as a ZIP and use Studio's ZIP upload.

Heavy model weights are **not** in this repo — they download on first
synthesis. Python dependencies (torch, coqui-tts, …) are provisioned by Studio
into a dedicated environment (`~/xtts-env`) from `requirements.txt` because
they conflict with Studio's own dependency set.

## Resource profile

- **GPU:** recommended; ~4 GB VRAM. CPU fallback works but is slow.
- **Disk:** model weights (~2 GB) cached outside this folder on first run.
- **Network:** none at synthesis time (only the one-time weight download).
- **Languages:** en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh.

## License

The XTTS v2 model is distributed under the **Coqui Public Model License 1.0**
(see `LICENSE`) — non-commercial use only. This plugin honors the upstream
model's terms.

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
`lexicon`, `models`, `speakers`, `state`), `app.engines.audio_ops`,
`app.engines.behavior`, `app.jobs.handlers.bridge_helpers`, and
`app.utils.text` (`lexicon`, `textops`).

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
python cli.py --text "Hello" --out output.wav --speaker-wav path/to/voice.wav
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
- `plugin/core/` contains XTTS runtime helpers and inference code.
- `tests/` travels with the plugin and runs standalone (`pytest tests`).

Mutable runtime data is stored by Studio in `plugin_data/xtts/`, not in this
plugin source folder. Generated verification samples such as `sample.wav` live
there too.
