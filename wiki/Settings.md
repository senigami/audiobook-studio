# Settings

Global configuration for Audiobook Studio. **Settings** is reached from the left rail under **MANAGE > Settings**. It has three tabs (General, About, and Developer when Developer Mode is on).

Engine and API configuration live on their own dedicated pages in the rail under **PLATFORM** — not in Settings. Settings is intentionally thin.

## General

- **Theme**: System, Light, or Dark. System follows your OS preference and reacts to OS changes live. The choice persists across restarts.
- **Stability Mode**: A more conservative text-cleanup path before synthesis. Engines that declare text sanitization use it to normalize quotes, dashes, unicode, and similar trouble spots that can derail TTS engines.
- **Default Engine** and **Default Voice**: The bottom of the voice cascade. A chapter uses its own voice if set, then the project default, then these.
- **Developer Mode**: Reveals the Developer tab (links to the internal testing pages: progress-bar harness, event stream, design spec sheet, and the TTS API docs) and enables the debug copy buttons in the chapter toolbar and queue items. Off by default; intended for plugin authors and troubleshooting sessions.

## About

The **About** tab shows the installed Studio version, the TTS server runtime status, and health information for each loaded engine plugin. Use it to confirm the server is running and that engine plugins loaded cleanly after an upgrade or plugin import.

## Developer (when Developer Mode is on)

The **Developer** tab links to the internal testing pages:

- Progress-bar harness
- Live event stream viewer
- Design spec sheet / styleguide
- TTS API interactive docs

It also enables debug copy buttons in the chapter toolbar and queue items.

## TTS Engines

Engine configuration lives at **PLATFORM > Engines** — a dedicated page in the left rail. From there you can:

- View engine diagnostics and health.
- Configure schema-driven engine settings (forms generated from each plugin's `settings_schema.json`).
- Configure text-cleanup category overrides per engine.
- Set output QA thresholds (e.g. XTTS max plausible speech rate).
- Reset calibration.
- Import, refresh, install dependencies for, or remove plugins.

The `/settings/engines` URL redirects to `/engines` for any existing bookmarks.

### Plugin Trust

**Plugins run unsandboxed** with the same permissions as Studio: full file system and network access. Installing a plugin means executing third-party Python code.

When you import a plugin zip or click **Install Deps**, Studio shows a confirmation dialog listing the engine name, version, and every dependency line before anything is installed. Dependency lines that reference a remote URL (`git+`, `http://`, `https://`) are marked **REMOTE** because they pull and execute code from the internet at install time.

Only install plugins from sources you trust.

## API / Integrations

The TTS gateway (the built-in `/api/v1/tts` endpoint) is documented at **PLATFORM > Integrations** — a dedicated page in the left rail. It covers:

- API key configuration
- Rate limiting
- Queue priority (`TTS_API_PRIORITY` environment variable)
- Network exposure

The `/settings/api` URL redirects to `/integrations` for any existing bookmarks.

## Rendering Output

Studio renders chapter audio as WAV. MP3 is produced only by explicit export, assembly, or external TTS API requests, never as a hidden background step. Voice samples and previews are the exception: they render as WAV and then convert to `sample.mp3` automatically so voice bundles stay portable.

## Privacy Note

If you enable `Voxtral (Cloud)`, the text being synthesized and any selected reference audio for that request are sent to Mistral. If you want a fully local workflow, keep your voices on `XTTS (Local)`.

## Storage Locations

By default, the application stores data in the following folders:

- `/projects/`: Current primary storage for project text, audio, and assembled books.
- `/voices/`: Current voice models and profile metadata.
- `/chapters/`: Default loose chapter-text folder for fresh installs when you use legacy text-file flows.
- `/xtts_audio/`: Historical/global audio output root. Preserved only as a migration-only legacy import source for older workspaces.
- `/audiobooks/`: Historical/global assembled `.m4b` output root. Preserved only for legacy import compatibility.

---

[[Home]] | [[File Formats and Audio Guidance]]
