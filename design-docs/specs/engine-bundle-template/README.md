# Example TTS — engine bundle template

A copyable skeleton for an Audiobook Studio TTS engine, distributed as a **GitHub repo**.
See `design-docs/plans/reference/v2_engine_bundle_github_distribution.md` and `design-docs/plans/reference/v2_plugin_sdk.md`.

## How distribution works (Stable Diffusion style)

- The **repo is the package.** Users install it with `git clone`, update with `git pull`,
  and uninstall by deleting the folder.
- Studio finds it by browsing the GitHub **topic** `audiobook-studio-tts`, or by pasting
  the repo URL ("Install from URL").
- Updates surface as an alert in **Settings → TTS Engines** with per-engine **Update** and
  **Update all**.
- **Model weights are NOT in this repo.** Download them on first use (like XTTS pulls its
  base model from Hugging Face). Keep the clone small.

## Make your own

1. Create a GitHub repo named **`tts_<engine_id>`** (e.g. `tts_exampletts`) and copy these
   files in.
2. Edit `manifest.json` — set `engine_id`, `display_name`, `entry_class`, `resource_profile`,
   `supported_voice_asset_types`, and the `distribution` block (`git_url`, `project`).
3. Implement the five `StudioTTSEngine` methods in `engine.py`
   (`info`, `check_env`, `check_request`, `synthesize`, `settings_schema`).
4. Describe settings in `settings_schema.json` and runtime deps in `requirements.txt`.
5. Add the repo **topic** `audiobook-studio-tts` on GitHub so Studio's browser lists it.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Discovery + capabilities + the `distribution` block. Validated before any code loads. |
| `engine.py` | The engine implementation (`entry_class` points here). |
| `settings_schema.json` | JSON Schema → Studio renders the settings form. |
| `requirements.txt` | Runtime deps for the guided install. |

## Security boundary

Engines are **trusted code** running in the TTS Server subprocess. Respect the boundaries:
do not import `app.*`, only write to the requested output path (and your own assets),
and let Studio persist mutable state under `plugin_data/<engine_id>/`. Studio shows a trust
prompt before installing third-party engines.
