# Spec: TTS Engine Bundle — GitLab Distribution & Install/Update

> **Status: FINAL DRAFT for review, research-backed.** Defines how TTS **engine plugins**
> are packaged, hosted on **GitLab**, discovered by tag, and installed/updated — the
> Stable-Diffusion-style "browse a tag, pull it down, install" model, for engines. Voices
> are separate and live on Hugging Face (`plans/v2_huggingface_voice_repo_spec.md`). Builds
> directly on the plugin contract in `plans/v2_plugin_sdk.md` and the namespace rename in
> `plans/master_agnostic_tasks.md`. Research sources at the bottom.

## 1. Goal

- TTS engines become **self-contained GitLab repos**, not files bundled inside the app.
- Users **browse GitLab by a known topic** (e.g. `audiobook-studio-tts`), pick an engine,
  and **install** it; Studio **fetches updates on install** and can update later.
- **XTTS is the default engine**, auto-installed from its own GitLab repo on first run, so
  it ships and updates independently of the app.
- Third-party engines are supported but clearly gated (they run code).

## 2. Local namespace

Per `plans/master_agnostic_tasks.md` ("Deferred Phase: Namespace Rename"):

```
tts_engines/      # installed TTS engine bundles (was plugins/)
tts_voices/       # installed voice bundles (HF voices land here)
plugins/          # reserved for future non-engine app-behavior extensions
```

An installed engine lives at `tts_engines/tts_<engine_id>/`. Folder name must match the
`tts_<name>` pattern; this is validated before any code loads (per the SDK).

## 3. Engine bundle layout

Extends the existing plugin layout (`plans/v2_plugin_sdk.md`):

```
tts_<engine_id>/                 # GitLab repo root == installed folder
├── manifest.json               # SDK manifest + distribution block (§4)
├── engine.py                   # StudioTTSEngine implementation (entry_class)
├── requirements.txt            # Python deps (Install Dependencies action)
├── settings_schema.json        # JSON Schema for engine settings
├── icon.png                    # optional 1:1 icon for the browser/cards
├── README.md                   # human description shown in the browser
└── tests/ fixtures/ ...        # engine-owned tests travel with the bundle
```

The bundle is everything an engine needs to be extracted and run as a self-contained unit.

## 4. Manifest distribution block

Add a `distribution` block to the existing `manifest.json` so Studio knows where the engine
comes from and how to update it:

```json
{
  "engine_id": "xtts",
  "display_name": "XTTS (Local)",
  "engine_version": "2.0.0",
  "min_app_version": "2.0.0",
  "entry_class": "engine:XTTSEngine",
  "resource_profile": "gpu-heavy",
  "supported_voice_asset_types": ["xtts_latents"],
  "requires_network": false,
  "distribution": {
    "host": "gitlab",
    "base_url": "https://gitlab.com",
    "project": "audiobook-studio/tts-xtts",
    "topic": "audiobook-studio-tts",
    "channel": "release",
    "official": true
  }
}
```

- `host` / `base_url` — `gitlab` and an instance URL (supports self-hosted GitLab).
- `project` — `group/repo` path (or numeric project id).
- `topic` — the GitLab topic used for discovery (anchor: **`audiobook-studio-tts`**).
- `channel` — `release` (download a versioned release asset) or `branch` (clone a branch).
- `official` — true only for engines under the official Audiobook Studio GitLab group;
  Studio shows third-party engines with a trust warning.

`engine_version` is semver and is the version compared during updates.

## 5. Discovery (browse by topic)

- The engine browser queries GitLab's Projects API filtered by topic:
  `GET {base_url}/api/v4/projects?topic=audiobook-studio-tts&order_by=star_count`.
- For each project, read its latest release (`/releases/permalink/latest`) and its
  `manifest.json` + `README.md` + `icon.png` for card display (name, version, description,
  resource profile, official badge).
- Results render as cards (icon, description, version, "Official"/"Community" badge,
  Install button) — the ComfyUI-Manager / Civitai pattern.
- Self-hosted/alternate GitLab instances: user can add extra `base_url`s to search.

## 6. Install

1. **Resolve version.** `channel: release` → GitLab Releases API picks the latest release
   compatible with the running app (`min_app_version` gate). `channel: branch` → use the
   named branch HEAD.
2. **Fetch.** Preferred: download the release's zipped asset from the **Generic Package
   Registry** (`GET /api/v4/projects/:id/packages/generic/:name/:version/:file`) or release
   assets. Fallback: `git`/archive download of the tag/branch.
3. **Stage & validate (before running any code):** extract to a temp dir, enforce the
   `tts_<name>` folder pattern, validate `manifest.json` against the SDK schema, check
   `min_app_version`. Reject on failure.
4. **Place** into `tts_engines/tts_<engine_id>/`.
5. **Dependencies.** If `requirements.txt` has unmet deps, run the existing Install
   Dependencies action (isolated to the TTS Server environment).
6. **Register** through the engine registry; the TTS Server loads it (engine code runs in
   the TTS Server subprocess, never the Studio process — `plans/v2_voice_system_interface.md`
   §10).
7. **Record provenance:** host, project, resolved version, tag/commit, installed_at — for
   reproducibility and update checks.

"**Fetch updates on install**": install always resolves the latest compatible version, so a
fresh install is never stale.

## 7. Update

- **Check:** on demand (and optionally on app start), compare each installed engine's
  recorded version against the latest compatible GitLab release. Show "Update available
  2.0.0 → 2.1.0".
- **Apply:** same fetch→validate→stage→swap flow as install, atomically replacing the
  folder; roll back on validation failure. Settings and any user data persist across
  updates (settings live in app config keyed by `engine_id`, not in the bundle).
- **Pinning:** a user can pin an engine to a version to opt out of auto-update.
- **Compatibility:** never offer an update whose `min_app_version` exceeds the running app;
  surface "update Audiobook Studio first."

## 8. XTTS default & built-ins

- **XTTS is the default engine.** On first run, if `tts_engines/tts_xtts/` is absent,
  Studio auto-installs it from the official GitLab repo (`audiobook-studio/tts-xtts`).
- **Offline first-run fallback:** ship a cached copy of the default XTTS bundle inside the
  app installer so a no-network first run still works; the cached copy is treated as
  "installed at version X" and updates normally once online.
- **Voxtral (cloud)** is also a GitLab bundle but cloud-backed (`requires_network: true`,
  hidden until a Mistral key is added — unchanged behavior).
- **Migration:** the engines currently bundled in `plugins/` move to their own GitLab repos
  and to `tts_engines/`; the in-app copies are removed in favor of installed bundles (XTTS
  via auto-install/cached fallback).

## 9. Security & trust

- **HTTPS only**; verify official engines resolve under the official GitLab group before
  showing the "Official" badge.
- **Validate before executing:** strict folder-name + `manifest.json` validation, and
  `min_app_version` check, all before any Python import.
- **Third-party engines run arbitrary code** in the TTS Server. Installing a community
  engine shows an explicit trust/consent prompt naming the source project; this is more
  serious than installing a voice (data) and the UI must say so.
- **Network disclosure:** engines with `requires_network: true` disclose what leaves the
  machine (consistent with the cloud-engine disclosure rules).
- **Token:** GitLab personal access token is optional (public read needs none); required
  only for private/self-hosted projects. Stored as a secret, never logged or bundled.

## 10. Open questions (need Steven's answers)

1. **Distribution artifact:** prefer release + Generic Package Registry zip (recommended,
   version-clean) or plain git archive of a tag? (Spec supports both via `channel`.)
2. **Official group path:** confirm the GitLab group/namespace for official engines
   (assumed `audiobook-studio/...`).
3. **Auto-update default:** check-and-notify (recommended) vs. silent auto-update vs.
   manual-only?
4. **Offline bundle:** confirm shipping a cached XTTS copy in the installer for offline
   first-run.

## 11. Sources

- GitLab Projects API (filter by topic) — https://docs.gitlab.com/api/projects/
- GitLab Topics API — https://docs.gitlab.com/api/topics/
- GitLab Releases API (incl. latest permalink) — https://docs.gitlab.com/api/releases/
- GitLab Generic Package Registry — https://docs.gitlab.com/user/packages/generic_packages/
- Distribution analogy (ComfyUI Manager / Civitai) —
  https://civitai.com/models/71980/comfyui-manager ,
  https://github.com/hayden-fr/ComfyUI-Model-Manager
- Builds on: `plans/v2_plugin_sdk.md`, `plans/v2_voice_system_interface.md`,
  `plans/master_agnostic_tasks.md`.
