# Plan 05 — Standalone Plugin Repos (GitHub)

> **Status: READY FOR IMPLEMENTATION.**
> Decision record + extraction steps for moving TTS engine plugins from the main repo into
> standalone GitHub repositories. Supersedes `plans/v2_engine_bundle_gitlab_distribution.md`
> (GitLab) — see §1 for the decision record and the step to mark that doc superseded.
> Pre-requisite: sibling plans **02 (Plugin Communication Contract)** and **03 (Plugin
> Interface Template)** must be complete before the extraction steps in §4 begin.

---

## 1. Decision record — GitHub, not GitLab

| Attribute | Decision |
|---|---|
| **Host** | **GitHub** (`github.com`) |
| **Discovery tag** | GitHub topic: `audiobook-studio-tts` |
| **Supersedes** | `plans/v2_engine_bundle_gitlab_distribution.md` (GitLab) |
| **Date** | 2026-06-10 |
| **Rationale** | Owner preference. GitHub is the primary development host for this project; keeping engine repos on the same platform simplifies contributor workflow, CI/CD, and token management. All technical decisions in the GitLab spec (clone/pull install model, topic-based discovery, manifest distribution block, offline-fallback bundle) are preserved — only the host changes. |

**Nothing else changes from the GitLab spec:** install = `git clone`; update = `git pull`;
heavy model weights download separately on first run; offline XTTS bundle ships in the
installer; community engines show a trust warning.

### 1.1 Step: mark the GitLab spec superseded

- [ ] **Add a SUPERSEDED banner to `plans/v2_engine_bundle_gitlab_distribution.md`.**
  Insert the following block immediately after the title line:

  ```
  > **SUPERSEDED by `plans/final_release/05_standalone_plugin_repos.md`.**
  > Host changed from GitLab to GitHub. All technical decisions in this doc remain valid
  > except references to GitLab APIs and URLs, which are replaced by their GitHub equivalents.
  > Do not implement from this doc. Kept for historical reference only.
  ```

  _Acceptance: the file opens and the banner is the first body text visible._

### 1.2 GitHub equivalents for GitLab-specific details

| GitLab concept | GitHub equivalent |
|---|---|
| GitLab topic (`audiobook-studio-tts`) | GitHub repository topic `audiobook-studio-tts` |
| GitLab Projects API (`/api/v4/projects?topic=…`) | GitHub Search API (`GET /search/repositories?q=topic:audiobook-studio-tts`) |
| Official GitLab group `audiobook-studio/…` | GitHub org `audiobook-studio` (or the owner's account until the org exists) |
| GitLab personal access token | GitHub personal access token (PAT); public repos need no token for read-only search |
| `git_url: https://gitlab.com/…` | `git_url: https://github.com/…` |

The `distribution` block in `manifest.json` becomes:

```json
"distribution": {
  "host": "github",
  "base_url": "https://github.com",
  "repo": "audiobook-studio/tts-xtts",
  "git_url": "https://github.com/audiobook-studio/tts-xtts.git",
  "topic": "audiobook-studio-tts",
  "pin_ref": null,
  "official": true
}
```

- `repo` replaces `project` (GitLab used `group/repo` path; GitHub calls it the same thing
  but the field is renamed to avoid confusion with "project" boards).
- `host` is now `"github"`. The Studio installer client switches API calls accordingly.

---

## 2. Standalone plugin repo shape

Every standalone plugin repo mirrors the template defined in sibling plan
**`03_plugin_interface_template.md`**. The repo root is identical to the on-disk plugin
folder that Studio clones into `plugins/tts_<name>/`.

```
tts-<engine-name>/               # GitHub repo name (hyphenated)
├── manifest.json                # SDK manifest + distribution block (§1.2)
├── plugin/
│   ├── server/
│   │   └── engine.py            # StudioTTSEngine impl; entry_class = plugin.server.engine:XTTSEngine
│   └── studio/
│       └── (optional Studio-side adapter if needed)
├── settings_schema.json         # JSON Schema; Studio UI renders settings from this
├── requirements.txt             # pip dependencies for the TTS Server environment
├── icon.png                     # optional 1:1 engine icon for the browser card
├── README.md                    # shown in the engine browser; must describe resource profile
├── LICENSE                      # required; SPDX identifier must match manifest `license`
└── tests/                       # optional; travel with the bundle
```

> **Heavy model weights are never in the repo.** Weights are downloaded by `engine.py` on
> first synthesis (e.g. XTTS already fetches its base model from Hugging Face). This keeps
> clones small and updates fast — the same model as Stable Diffusion / ComfyUI extensions.

### 2.1 Required manifest fields (full example — XTTS)

> **Manifest field names are dictated by the loader, not invented here.** The version field
> is `studio_tts_manifest` (must equal `"1.0"`; validated in `app/tts_server/plugin_loader.py`
> `_validate_manifest`). `entry_class` must match the loader's `_CALLABLE_RE`
> (`^[a-z_][a-z0-9_.]*:[A-Za-z_][A-Za-z0-9_]*$`) — the module part is a **dotted Python module
> path, not a slash path**. So a module at `plugin/server/engine.py` is referenced as
> `plugin.server.engine:XTTSEngine`. `engine_id` must match `^[a-z][a-z0-9]{1,14}$`.

```json
{
  "studio_tts_manifest": "1.0",
  "engine_id": "xtts",
  "display_name": "XTTS (Local)",
  "version": "2.0.0",
  "min_studio": "2.0.0",
  "entry_class": "plugin.server.engine:XTTSEngine",
  "resource": {
    "gpu": true,
    "vram_mb": 4096,
    "cpu_heavy": false
  },
  "languages": ["en", "es", "fr", "de", "pt", "it", "pl", "nl", "cs", "ar", "zh-cn", "ja", "hu", "ko", "tr"],
  "local": true,
  "cloud": false,
  "network": false,
  "capabilities": ["synthesis", "preview"],
  "author": "audiobook-studio",
  "license": "AGPL-3.0",
  "homepage": "https://github.com/audiobook-studio/tts-xtts",
  "distribution": {
    "host": "github",
    "base_url": "https://github.com",
    "repo": "audiobook-studio/tts-xtts",
    "git_url": "https://github.com/audiobook-studio/tts-xtts.git",
    "topic": "audiobook-studio-tts",
    "pin_ref": null,
    "official": true
  }
}
```

### 2.2 Install and update flow

**Install:**
1. Studio engine browser queries GitHub Search API for topic `audiobook-studio-tts`.
2. Each result's `manifest.json` + `README.md` + `icon.png` are fetched for card display.
3. User clicks Install → Studio runs `git clone {git_url}` into a temp dir.
4. Validate: enforce the `tts_<name>` folder convention (`plugin_loader._PLUGIN_FOLDER_RE`,
   `^tts_[a-z][a-z0-9]{1,14}$`), run `_validate_manifest` (requires `studio_tts_manifest`,
   `engine_id`, `display_name`, `entry_class`, `capabilities` incl. `synthesis`), check
   `min_studio`. Reject on failure.
5. Move into `plugins/tts_<engine_id>/`.
6. If `requirements.txt` has unmet deps, mark engine `needs_setup`; user clicks "Install
   Dependencies" in Settings → TTS Engines.
7. Register; TTS Server loads it. Engine code runs in TTS Server subprocess only.

**Update (notify-only, never auto):**
- On demand (and optionally on app start), `git fetch` each installed engine.
- Compare local commit / `version` against upstream.
- Settings → TTS Engines shows per-engine update badge (`2.0.0 → 2.1.0`) with an Update
  button and an Update all action.
- Apply: `git pull` (or fetch + checkout new tag) → re-validate → re-register; roll back on
  validation failure.
- Never pull an update whose `min_studio` exceeds the running app version.

**Install from URL:** user pastes any GitHub repo URL directly (bypasses topic search).

---

## 3. On-disk folder name — KEEP `plugins/`

**Decision: keep `plugins/` as the on-disk folder through the 2.0 release.**

The GitLab spec proposed renaming to `tts_engines/`. That rename is a breaking change for
any user who has manually placed plugins, for all documentation, and for path references
scattered throughout the codebase — with no user-visible value at release time.

- `plugins/tts_<name>/` remains the install location.
- `tts_engines/` rename is recorded as a **post-release candidate** in `Memory/state.json`
  under deferred items, to be evaluated after 2.0 ships.
- Discovery code in `app/tts_server/plugin_loader.py` already scans `plugins/tts_*` — no
  change needed.

---

## 4. Per-plugin extraction steps

### 4.1 Pre-requisites (must complete first)

- [ ] **P0. Sibling plan 02 (Plugin Communication Contract) is complete.**
  The SDK types (`StudioTTSEngine`, `TTSRequest`, `TTSResult`) are published as
  `studio_tts_sdk.py` and importable without any `app/` internals. Engines must not import
  anything under `app/`. Verify with a grep: `grep -rE "from app|import app" plugins/tts_xtts/`
  returns nothing.
  _Acceptance: `python -c "from studio_tts_sdk import StudioTTSEngine, TTSRequest, TTSResult"` succeeds from outside the Studio venv (or from a clean venv with only the SDK installed)._

- [ ] **P1. Sibling plan 03 (Plugin Interface Template) is complete.**
  The canonical plugin folder structure (`plugin/server/`, `plugin/studio/`,
  `settings_schema.json`, `manifest.json`) is defined and the template repo exists.
  Extraction steps below follow that structure.
  _Acceptance: `docs/specs/plugin_template/` exists and matches the shape in §2 above._

### 4.2 XTTS extraction

- [ ] **X1. Create GitHub repo `audiobook-studio/tts-xtts`.**
  Initialize with an `AGPL-3.0` LICENSE (must match the manifest `license` field), a stub
  README, and default branch `main`. (Note: the in-tree XTTS manifest currently declares
  `CPML-1.0` from the upstream Coqui model; pick the license that matches the actual shipped
  code/weights terms and keep manifest + LICENSE in sync.)

- [ ] **X2. Copy `plugins/tts_xtts/` contents into the new repo layout.**
  Restructure into `plugin/server/engine.py` (the in-tree code is `interface.py` with class
  `XttsPlugin`; rename module to `plugin/server/engine.py` and class to `XTTSEngine`, or keep
  the existing names — either way `entry_class` must reference the dotted module path).
  Update `entry_class` in `manifest.json` to `plugin.server.engine:XTTSEngine` (dotted, not a
  slash path — see §2.1 note). Add the `distribution` block (§1.2 example above).
  _Acceptance: dropping the restructured folder as `plugins/tts_xtts/` and running
  `POST /plugins/refresh` loads the engine with no `PluginLoadError` (the authoritative
  manifest validator is `plugin_loader._validate_manifest`, not a standalone JSON schema)._

- [ ] **X3. Verify no `app/` imports in engine code.**
  _Acceptance: `grep -rE "from app|import app" plugin/` returns nothing._

- [ ] **X4. Tag the repo `v2.0.0` and add topic `audiobook-studio-tts` in GitHub repo settings.**
  _Acceptance: GitHub Search API query `topic:audiobook-studio-tts` returns this repo._

- [ ] **X5. Update the in-tree copy.**
  Add the `distribution` block to the existing `plugins/tts_xtts/manifest.json` in the main
  repo so it carries its repo reference (same behavior as described in the GitLab spec §8:
  the bundled copy is a real repo install, just pre-seeded).
  _Acceptance: `plugins/tts_xtts/manifest.json` has a `distribution.git_url` pointing to the GitHub repo._

- [ ] **X6. Smoke test.**
  Fresh clone of `audiobook-studio/tts-xtts` into `plugins/tts_xtts/` of a clean Studio
  install → `POST /plugins/refresh` → engine appears in `GET /api/engines` with
  `status: verified` → run a short synthesis → audio file produced.
  _Acceptance: all steps pass with no errors._

### 4.3 Voxtral extraction

- [ ] **V1. Create GitHub repo `audiobook-studio/tts-voxtral`.**
  Same steps as X1–X4 above, substituting Voxtral's engine details.
  `requires_network: true`, `cloud: true`; topic `audiobook-studio-tts`.

- [ ] **V2. Verify Mistral API key is read from Studio settings, not hard-coded in engine.**
  _Acceptance: `grep -rE "MISTRAL_API_KEY|mistral_key" plugin/server/` shows only a settings read, not a literal value._

- [ ] **V3. Smoke test.**
  Same as X6; with a valid Mistral key in settings, synthesis returns audio. Without a key,
  engine is marked `needs_setup` with a human-readable explanation.

### 4.4 `synthesis_mixed` — in-tree orchestrator (not extracted)

`synthesis_mixed` is a built-in orchestrator that routes segments across multiple engines.
It intentionally stays in-tree because it depends on Studio's internal session/segment model
and cannot be a standalone plugin. Two concerns to resolve:

**Concern 1 — folder name doesn't match `tts_*` discovery regex.**
`plugins/synthesis_mixed/` is skipped by the folder scanner: `discover_plugins` in
`plugin_loader.py` rejects any folder whose name fails `_PLUGIN_FOLDER_RE`
(`^tts_[a-z][a-z0-9]{1,14}$`). `synthesis_mixed` fails on both the `tts_` prefix and the
underscore. Note also its manifest `engine_id` is `"mixed"` (not `synthesis_mixed`) — the
allowlist keys on the **folder name**, the dedup map keys on `engine_id`, so the two never
collide.

**Resolution:** register `synthesis_mixed` through a **hardcoded folder allowlist** that
bypasses only the regex gate — the loaded plugin still goes through the full
`_load_plugin` path (manifest load, `_validate_manifest`, engine import, dedup). Do NOT
rewrite `discover_plugins` to return `list[Path]` or to skip validation; it returns
`list[LoadedPlugin]` and that contract must be preserved. The minimal change is to the
per-entry gate inside the existing scan loop:

```python
# Module level, near _PLUGIN_FOLDER_RE.
# Built-in orchestrator folders that are exempt from the tts_* naming rule.
BUILTIN_PLUGINS = frozenset({"synthesis_mixed"})

# Inside discover_plugins(), replacing the existing reject branch:
        folder_name = entry.name
        if not (_PLUGIN_FOLDER_RE.match(folder_name) or folder_name in BUILTIN_PLUGINS):
            logger.debug("Skipping non-plugin folder: %s", folder_name)
            continue
        # ... unchanged: _load_plugin(...), duplicate engine_id guard, append ...
```

`_invalid_manifest_plugin` derives a fallback `engine_id` via
`folder_name.replace("tts_", "", 1)`; for `synthesis_mixed` that is a no-op and the manifest
already supplies `engine_id: "mixed"`, so no extra handling is needed there.

**Concern 2 — `synthesis_mixed` imports `app/` internals (session model, etc.).**
Because it is in-tree and loaded in the TTS Server subprocess, this is acceptable as an
explicit exception to the "no app imports" rule — but it must be documented.

- [ ] **M1. Add `BUILTIN_PLUGINS` allowlist to `app/tts_server/plugin_loader.py`** as shown
  above. Document that built-in orchestrator plugins are exempt from the `tts_*` naming rule
  and the `no app imports` rule, and that this exemption is granted by allowlist only.
  _Acceptance: `POST /plugins/refresh` discovers both `tts_xtts` (folder `tts_xtts`, via regex) and `synthesis_mixed` (folder `synthesis_mixed`, via allowlist); `GET /api/engines` lists engine_ids `xtts` and `mixed`._

- [ ] **M2. Add `"builtin": true` field to `synthesis_mixed/manifest.json`.**
  Studio uses this to suppress the "Install from URL" / "Uninstall" buttons for built-in
  plugins — they are not user-removable.
  _Acceptance: Settings → TTS Engines shows no Uninstall button for synthesis_mixed._

- [ ] **M3. (Post-release candidate) Evaluate renaming `synthesis_mixed` to `tts_mixed`.**
  If the rename is done, remove it from `BUILTIN_PLUGINS` and let it be discovered normally.
  Record in `Memory/state.json` under deferred items.

---

## 5. Full implementation checklist

Steps are ordered for sequential execution. Steps within the same numbered group have no
inter-dependencies and may run in parallel.

### Group 0 — Pre-requisites

- [ ] **0.1** Complete sibling plan 02 (Plugin Communication Contract); SDK published.
- [ ] **0.2** Complete sibling plan 03 (Plugin Interface Template); template repo exists.
- [ ] **0.3** Mark `plans/v2_engine_bundle_gitlab_distribution.md` SUPERSEDED (§1.1).

### Group 1 — Discovery infrastructure

- [ ] **1.1** Update `app/tts_server/plugin_loader.py`: add `BUILTIN_PLUGINS` allowlist (§4.4 / M1).
- [ ] **1.2** Update Studio engine browser API client to use GitHub Search API (`topic:audiobook-studio-tts`) instead of GitLab Projects API.
- [ ] **1.3** Decide where `distribution` is validated. `plugin_loader._validate_manifest`
  does **not** currently read or validate any `distribution` block, so a `distribution.host`
  of `"github"` is accepted today as an ignored extra field — no loader change is required for
  the engine to load. The GitHub-vs-GitLab handling lives in the Studio-side engine browser /
  installer client (item 1.2), which is the component that reads `distribution.host` to pick
  the API. If `distribution` is later promoted to a validated field, add a `host` check there;
  do not block engine loading on it.
  _Acceptance: a manifest carrying the `distribution` block (§1.2) loads without a
  `PluginLoadError`, and the installer client routes by `distribution.host`._

### Group 2 — XTTS extraction

- [ ] **2.1** Create `audiobook-studio/tts-xtts` repo on GitHub (step X1).
- [ ] **2.2** Restructure and copy plugin code into new repo (step X2).
- [ ] **2.3** Verify no `app/` imports (step X3).
- [ ] **2.4** Tag `v2.0.0`, apply GitHub topic (step X4).
- [ ] **2.5** Add `distribution` block to in-tree `plugins/tts_xtts/manifest.json` (step X5).
- [ ] **2.6** XTTS smoke test (step X6). ← gate: do not proceed to Group 3 until this passes.

### Group 3 — Voxtral extraction

- [ ] **3.1** Create `audiobook-studio/tts-voxtral` repo on GitHub (step V1).
- [ ] **3.2** Restructure and copy Voxtral plugin code (V1 continued).
- [ ] **3.3** Verify API key handling (step V2).
- [ ] **3.4** Tag `v2.0.0`, apply GitHub topic.
- [ ] **3.5** Add `distribution` block to in-tree `plugins/tts_voxtral/manifest.json`.
- [ ] **3.6** Voxtral smoke test (step V3).

### Group 4 — `synthesis_mixed` registration

- [ ] **4.1** Add `"builtin": true` to `plugins/synthesis_mixed/manifest.json` (step M2).
- [ ] **4.2** Verify both engine_ids `xtts` (folder `tts_xtts`) and `mixed` (folder `synthesis_mixed`) appear in `GET /api/engines` after a plugin refresh.
- [ ] **4.3** Verify Uninstall button is absent for `synthesis_mixed` in Settings UI (step M2 acceptance).

### Group 5 — End-to-end acceptance test

- [ ] **5.1** Full install flow test:
  Start from a Studio install with `plugins/tts_xtts/` deleted.
  `git clone https://github.com/audiobook-studio/tts-xtts.git plugins/tts_xtts/`.
  Restart TTS Server (or `POST /plugins/refresh`).
  `GET /api/engines` → `tts_xtts` listed with `status: available` (or `needs_setup` if deps missing).
  Install dependencies if needed. Click Verify → `status: verified`.
  Render a one-sentence segment → audio file produced.
  _Acceptance: all steps pass with no errors on a clean machine._

- [ ] **5.2** Update flow test:
  With XTTS installed from its own repo (step 2.4 tag), simulate an available update by
  pushing a `v2.0.1` tag to the repo (increment `version` in `manifest.json`).
  Studio settings shows update badge.
  Click Update → `git pull` applied → `version` in loaded manifest is `2.0.1`.
  _Acceptance: update badge appears; Update button applies the change; no regression in synthesis._

- [ ] **5.3** Trust warning test:
  Add a mock community plugin repo (not under the official org) with topic
  `audiobook-studio-tts`. Browse the engine browser → mock plugin shows "Community" badge,
  not "Official". Install prompts trust/consent dialog.
  _Acceptance: consent dialog names the source repo; user can cancel; no code loaded until consent given._

### Group 6 — Docs and state

- [ ] **6.1** Update `Memory/state.json`: mark standalone plugin repos complete; add `tts_engines/` rename and `synthesis_mixed` → `tts_mixed` rename as post-release candidates.
- [ ] **6.2** Update Settings → TTS Engines section of the user handbook: install from URL, browse by topic, update flow.
- [ ] **6.3** Write contributor guide page: "Publishing a TTS plugin to the Audiobook Studio engine browser" — covers GitHub repo shape, required topic tag, `manifest.json` distribution block, trust model.

---

## 6. References

- `plans/v2_engine_bundle_gitlab_distribution.md` — superseded; GitLab version of this plan
- `plans/v2_plugin_sdk.md` — plugin contract, `StudioTTSEngine` base class, `plugin_loader.py`
- `app/tts_server/plugin_loader.py` — current discovery implementation
- `plans/final_release/02_plugin_communication_contract.md` — SDK publication (pre-requisite)
- `plans/final_release/03_plugin_interface_template.md` — canonical plugin folder shape (pre-requisite)
- GitHub Search API: https://docs.github.com/en/rest/search/search#search-repositories
- GitHub Topics: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
