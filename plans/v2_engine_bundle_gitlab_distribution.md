# Spec: TTS Engine Bundle — GitLab Distribution & Install/Update

> **SUPERSEDED.** Owner decision 2026-06-11: standalone engine repos will live on **GitHub**, not GitLab.
> This document is superseded by `plans/final_release/05_standalone_plugin_repos.md` (doc 05),
> which is the authoritative spec for plugin distribution. Do not implement from this file.


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
    "git_url": "https://gitlab.com/audiobook-studio/tts-xtts.git",
    "topic": "audiobook-studio-tts",
    "pin_ref": null,
    "official": true
  }
}
```

- `host` / `base_url` — `gitlab` and an instance URL (supports self-hosted GitLab).
- `project` — `group/repo` path (or numeric project id), used for the discovery/API lookup.
- `git_url` — the clone URL. **Install = `git clone` this; update = `git pull`** (the
  Stable Diffusion / ComfyUI model — see §6).
- `topic` — the GitLab topic used for discovery (anchor: **`audiobook-studio-tts`**).
- `pin_ref` — optional tag/branch to lock to; `null` tracks the default branch.
- `official` — true only for engines under the official Audiobook Studio GitLab group;
  Studio shows third-party engines with a trust warning.

`engine_version` is semver, read from the cloned `manifest.json`, and compared during
update checks.

> **Heavy model weights are not in the git repo.** The repo holds engine code + manifest
> only. Multi-GB model weights are fetched by the engine itself on first run — exactly as
> XTTS already downloads its base model from Hugging Face today. This keeps clones small
> and updates fast (the SD ecosystem works the same way: extensions are git repos; models
> are downloaded separately).

## 5. Discovery (browse by topic, or paste a URL)

The "registry" is just GitLab itself — no separate index file to maintain:

- The engine browser queries GitLab's Projects API filtered by topic:
  `GET {base_url}/api/v4/projects?topic=audiobook-studio-tts&order_by=star_count`.
- For each project, read its `manifest.json` + `README.md` + `icon.png` (and latest tag)
  for card display (name, version, description, resource profile, official badge).
- Results render as cards (icon, description, version, "Official"/"Community" badge,
  Install button) — the ComfyUI-Manager / Civitai pattern.
- **Install from URL:** the user can also paste any GitLab repo URL directly (like A1111's
  "Install from URL"), bypassing search.
- Self-hosted/alternate GitLab instances: user can add extra `base_url`s to search.

## 6. Install (clone it down)

1. **Clone.** `git clone {git_url}` (at `pin_ref` if set, else default branch) into a temp
   dir. This is the "pull it down" step.
2. **Validate before running any code:** enforce the `tts_<name>` folder pattern, validate
   `manifest.json` against the SDK schema, check `min_app_version`. Reject on failure.
3. **Place** the cloned repo into `tts_engines/tts_<engine_id>/` (it stays a git checkout,
   so updates are a simple `git pull`).
4. **Dependencies.** If `requirements.txt` has unmet deps, run the existing Install
   Dependencies action (isolated to the TTS Server environment).
5. **Register** through the engine registry; the TTS Server loads it (engine code runs in
   the TTS Server subprocess, never the Studio process — `plans/v2_voice_system_interface.md`
   §10).
6. **Record provenance:** host, project, `git_url`, resolved commit/tag, installed_at — for
   reproducibility and update checks.

A fresh clone always gets the latest code, so a new install is never stale.

## 7. Update (pull it)

- **Alert in Settings → TTS Engines.** When updates are available, the TTS Engines settings
  page shows a badge/notice listing which engines have updates (`2.0.0 → 2.1.0`), with an
  **Update** button per engine and an **Update all** action — exactly the Stable Diffusion /
  ComfyUI-Manager experience.
- **Check:** on demand (and optionally on app start), `git fetch` each installed engine and
  compare the local commit/`engine_version` against upstream to populate that alert.
- **Apply:** `git pull` (or fetch + checkout the new tag), then re-validate the manifest and
  re-register; roll back the checkout on validation failure. Settings persist across updates
  (settings live in app config keyed by `engine_id`, not in the bundle).
- **Pinning:** set `pin_ref` to a tag to lock a version and opt out of auto-update.
- **Compatibility:** never pull an update whose `min_app_version` exceeds the running app;
  surface "update Audiobook Studio first."
- **Uninstall:** delete the `tts_engines/tts_<engine_id>/` folder.

## 8. XTTS default & built-ins

- **XTTS is the default engine.** On first run, if `tts_engines/tts_xtts/` is absent,
  Studio auto-installs it by cloning the official GitLab repo
  (`https://gitlab.com/audiobook-studio/tts-xtts.git`). Its model weights then download on
  first synthesis, as they do today. _(The XTTS GitLab repo does not exist yet — it must be
  created before release.)_
- **The included copy is a real repo install, just pre-seeded.** When XTTS ships bundled
  (offline fallback below), it still carries its full `distribution` block (the repo
  reference) and engine card content. That means:
  - the user can **uninstall** it like any other engine, after which it **reappears in the
    browser as downloadable** from its own repo;
  - it **updates from its own repo** via `git pull` exactly like a freshly installed engine.
  A bundled engine is never a second-class, un-updatable special case.
- **Offline first-run fallback:** ship a cached copy of the default XTTS bundle inside the
  app installer so a no-network first run still works; the cached copy is treated as
  installed (with its repo metadata intact) and `git pull`s normally once online.
- **Voxtral (cloud)** is an optional, opt-in cloud engine (an example, not pre-installed),
  distributed as a GitLab bundle but cloud-backed (`requires_network: true`, hidden until a
  Mistral key is added).
- **Migration:** the engines currently bundled in `plugins/` move to their own GitLab repos
  and into `tts_engines/`; the in-app copies are removed in favor of cloned bundles (XTTS
  via auto-clone / cached fallback).

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

## 10. Decisions & remaining questions

Decided:
- **Distribution = git clone / git pull** (Stable Diffusion / ComfyUI model). The repo is
  the package; no release-asset or package-registry step. Discovery via GitLab topic, plus
  paste-a-URL install. Heavy weights download separately on first run.
- **Update UX:** Settings → TTS Engines shows an alert of available updates with per-engine
  **Update** and **Update all** (SD-style).
- **Two different identifiers, both `audiobook-studio`:** the discovery **topic** is
  `audiobook-studio-tts` (what scanning filters on), and the official **group/namespace** is
  `audiobook-studio/...` (who owns official repos, drives the "Official" badge). Only the
  maintainer publishes engines for now, so the official-group trust check is effectively
  moot until third parties publish.
- **Auto-update = notify only.** Studio checks and surfaces the Settings → TTS Engines
  alert, but never updates an engine without the user clicking Update / Update all.
- **Offline bundle = yes.** Ship a cached XTTS copy in the installer for offline first-run.
  It carries its repo metadata so it uninstalls, re-downloads, and updates like any other
  engine (see §8). _(Depends on the XTTS GitLab repo being created — not yet made.)_

No open distribution questions remain.

## 11. Sources

- Stable Diffusion WebUI extensions (install from URL = git clone; update = git pull) —
  https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Extensions
- ComfyUI Manager (git-clone install model, node list) —
  https://github.com/Comfy-Org/ComfyUI-Manager
- GitLab Projects API (filter by topic) — https://docs.gitlab.com/api/projects/
- GitLab Topics API — https://docs.gitlab.com/api/topics/
- Builds on: `plans/v2_plugin_sdk.md`, `plans/v2_voice_system_interface.md`,
  `plans/master_agnostic_tasks.md`.
