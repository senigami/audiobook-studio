# Settings

Global configuration for Audiobook Studio. Settings is a full page with its own sidebar, reached from the main navigation. It has four tabs (General, TTS Engines, API, About), plus a Developer tab that appears when Developer Mode is on.

## General

- **Theme**: System, Light, or Dark. System follows your OS preference and reacts to OS changes live. The choice persists across restarts.
- **Stability Mode**: A more conservative text-cleanup path before synthesis. Engines that declare text sanitization use it to normalize quotes, dashes, unicode, and similar trouble spots that can derail TTS engines.
- **Default Engine** and **Default Voice**: The bottom of the voice cascade. A chapter uses its own voice if set, then the project default, then these.
- **Developer Mode**: Reveals the Developer tab (links to the internal testing pages: progress-bar harness, event stream, design spec sheet, and the TTS API docs) and enables the debug copy buttons in the chapter toolbar and queue items. Off by default; intended for plugin authors and troubleshooting sessions.

## TTS Engines

The **TTS Engines** tab is the control center for Studio 2.0 plugins.

- **Schema-driven Settings**: Engine forms are generated from each plugin's `settings_schema.json`, so plugin authors can expose settings without hardcoding new Studio UI fields.
- **Text Cleanup Categories**: Engines that declare sanitization categories in their manifest get a "Sanitize Overrides" group in their settings, one toggle per category (quotes, acronyms, fractions, dashes, punctuation spacing, ASCII, terminal punctuation). Turn a category off when your text needs to survive that cleanup, for example bracketed computer output on an engine that strips brackets.
- **Output QA**: Engines can validate their own rendered audio. XTTS ships a plausibility check (`Max Plausible Speech Rate`): if the audio implies an impossibly fast reading speed for the text length, the render is rejected as truncated and the job fails with the engine's reason. Set it to 0 to disable.
- **Voice Generation Speed**: Expanded engine cards show calibrated voice generation speed based on your computer, including characters per second, sample count, and confidence when enough render history exists.
- **Calibration Warming**: Low-confidence calibration displays helper text encouraging more text-to-speech renders to improve speed estimates. This is informational only; it does not trigger automatic renders.
- **Reset Calibration**: Engine cards can clear stored speed calibration when you want Studio to relearn performance after hardware, model, or settings changes.
- **Plugin Import**: Use **Import Plugin (.zip)** to add a plugin package whose `manifest.json` is at the zip root. Manifests declare a contract version that Studio validates at load; an incompatible or missing version is reported as a load error naming the plugin.
- **Plugin Refresh**: Refresh plugins after manually copying a plugin into the `plugins/` folder or after changing plugin metadata.
- **Install Dependencies**: If a plugin declares `requirements.txt`, Settings can surface missing dependencies and offer an install action.
- **Plugin Removal**: User-installed plugins can be uninstalled from the engine card. Built-in plugins are protected by their manifest and cannot be removed from the UI.

Voxtral credentials (Mistral API key, model selection, enable toggle) are engine-level settings. Expand the Voxtral engine card in this tab to configure them. There is no global Voxtral toggle in the General tab.

Plugin-specific runtime settings are stored under Studio-managed plugin data, not inside the plugin source folder.

### Plugin Trust

**Plugins run unsandboxed** with the same permissions as Studio: full file system and network access. Installing a plugin means executing third-party Python code.

When you import a plugin zip or click **Install Deps**, Studio shows a confirmation dialog listing the engine name, version, and every dependency line before anything is installed. Dependency lines that reference a remote URL (`git+`, `http://`, `https://`) are marked **REMOTE** because they pull and execute code from the internet at install time.

Only install plugins from sources you trust. Plugin signing and a verified-publisher registry are planned for a future Studio release.

## API

The **API** tab documents the built-in TTS gateway that lets other tools send synthesis requests to your Studio instance (`/api/v1/tts`), and links to its interactive Swagger docs. The gateway features below are real and active, but the tab does not yet offer form controls for them; a full configuration page is planned.

How each is configured today:

- **API Key**: callers send `Authorization: Bearer <key>`. The expected key is the `tts_api_key` application setting; when it is empty, authentication is skipped (open access on loopback).
- **Rate Limiting**: requests are rate-limited per caller by the gateway's built-in limiter.
- **Queue Priority**: API synthesis jobs are ordered against Studio jobs by the `TTS_API_PRIORITY` environment variable: `studio_first` (default) keeps your own renders ahead of API callers, `equal` interleaves them, `api_first` inverts it. See [[Queue and Jobs]].
- **Network exposure**: Studio binds to loopback (`127.0.0.1`) by default. To reach it from other machines, launch with a different host binding and set an API key first.

## About

The **About** tab shows the installed Studio version, the TTS server runtime status, and health information for each loaded engine plugin. Use it to confirm the server is running and that engine plugins loaded cleanly after an upgrade or plugin import.

## Rendering Output

Studio renders chapter audio as WAV. MP3 is produced only by explicit export, assembly, or external TTS API requests, never as a hidden background step. Voice samples and previews are the exception: they render as WAV and then convert to `sample.mp3` automatically so voice bundles stay portable.

## Privacy Note

If you enable `Voxtral (Cloud)`, the text being synthesized and any selected reference audio for that request are sent to Mistral. If you want a fully local workflow, keep your voices on `XTTS (Local)`.

## 📁 Storage Locations

By default, the application stores data in the following folders:

- `/projects/`: Current primary storage for project text, audio, and assembled books.
- `/voices/`: Current voice models and profile metadata.
- `/chapters/`: Default loose chapter-text folder for fresh installs when you use legacy text-file flows.
- `/xtts_audio/`: Historical/global audio output root. Preserved only as a migration-only legacy import source for older workspaces.
- `/audiobooks/`: Historical/global assembled `.m4b` output root. Preserved only for legacy import compatibility.

---

[[Home]] | [[File Formats and Audio Guidance]]
