# Audiobook Studio — Spec Examples & Templates

Concrete, copyable examples for the distribution specs in `plans/`. These are
**target-state templates** (the format we're moving to before release); the live code will
be adjusted to read them. Each mirrors a plan doc:

| Folder / file | Mirrors | What it is |
| --- | --- | --- |
| `voice-bundle-template/` | `plans/v2_huggingface_voice_repo_spec.md` | A complete voice as it should look on Hugging Face (loose form). Zip this folder to make a `.asvoice.zip`. |
| `voice.schema.json` | same | JSON Schema for `voice.json`; validate a bundle against it before upload. |
| `voice-taxonomy.json` | `plans/v2_voice_tag_taxonomy.md` | The controlled tag vocabulary as machine-readable data (drives the tagging UI and validation). |
| `engine-bundle-template/` | `plans/v2_engine_bundle_gitlab_distribution.md` + `plans/v2_plugin_sdk.md` | A TTS engine repo as it should look on GitLab. `git clone` target. |

## Using the voice template
1. Copy `voice-bundle-template/` and rename the folder to your voice id.
2. Edit `voice.json` (it is the source of truth). Add `icon.png` (1:1) and
   `samples/preview.wav`.
3. Regenerate `README.md` from `voice.json` (the Studio exporter does this automatically).
4. Validate against `voice.schema.json`.
5. Upload to Hugging Face as a **model** repo (loose files), or export a `.asvoice.zip`.

## Using the engine template
1. Copy `engine-bundle-template/` into a new GitLab repo named `tts_<engine_id>`.
2. Fill in `manifest.json` (including the `distribution` block) and implement the five
   `StudioTTSEngine` methods in `engine.py`.
3. Add the GitLab **topic** `audiobook-studio-tts` to the repo so Studio's browser finds it.
4. Users install by browsing that topic (or pasting the repo URL); Studio `git clone`s it
   into `tts_engines/` and `git pull`s for updates.

> These are documentation templates. They do not need to live here permanently — the voice
> schema/taxonomy will ship from the app and the engine template will likely seed an
> official GitLab repo.
