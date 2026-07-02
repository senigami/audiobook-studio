# Plan 05 — Standalone Plugin Repos And Official Registry

> **Status: READY FOR IMPLEMENTATION.**
> Decision record + extraction steps for moving TTS engine plugins from the main repo into
> standalone GitHub repositories and installing them through an owner-controlled registry
> or a pasted GitHub repository URL. Supersedes
> `design-docs/plans/v2_engine_bundle_github_distribution.md` (GitHub) — see §1 for the decision
> record and the step to mark that doc superseded.
> Pre-requisite: sibling plans **02 (Plugin Communication Contract)** and **03 (Plugin
> Interface Template)** must be complete before the extraction steps in §4 begin.

---

## 1. Decision record — GitHub repos with an official registry

### 1.0 Owner update — 2026-06-15

The v2.0 release path is:

1. **Official owner-controlled plugin registry** for browse/detail/install of trusted known plugins.
2. **Paste-a-GitHub-repo-URL install** for direct community/plugin-author distribution.
3. **ZIP upload install** remains supported as the local/offline path.

Open-ended GitHub topic search/browse and richer installed-plugin update/pull UX are **post-v2**
unless explicitly promoted later. The private site mock may show the registry and URL install as
working controls because both are release-scope interaction targets.

The official registry entry should be enough to render a useful preview without arbitrary website
scraping. It may contain summary, icon URL/path, tags, homepage/docs links, repo URL, trust level,
compatibility, and requirements. The installer may also fetch known repo files such as
`manifest.json`, `README.md`, and optional icon/preview assets for richer detail.

| Attribute | Decision |
|---|---|
| **Host** | **GitHub** (`github.com`) |
| **Release discovery source** | Owner-controlled official registry JSON plus direct GitHub repo URL paste |
| **Post-v2 discovery candidate** | GitHub topic search: `audiobook-studio-tts` |
| **Supersedes** | `design-docs/plans/v2_engine_bundle_github_distribution.md` (GitHub) |
| **Date** | 2026-06-10 |
| **Rationale** | Owner preference. GitHub is the primary development host for this project; keeping engine repos on the same platform simplifies contributor workflow, CI/CD, and token management. The release path uses an owner-controlled registry so Studio can show curated metadata, trust, compatibility, icon/preview detail, and known install targets without relying on broad GitHub search. |

**Core mechanics stay simple:** install = `git clone`; heavy model weights download separately
on first run; offline ZIP install remains available; community engines show a trust warning.
Notify/apply update flows can use `git fetch`/`git pull` later, but the richer update UX is
post-v2 unless separately promoted.

### 1.1 Step: mark the GitHub spec superseded

- [ ] **Add a SUPERSEDED banner to `design-docs/plans/v2_engine_bundle_github_distribution.md`.**
  Insert the following block immediately after the title line:

  ```
  > **SUPERSEDED by `design-docs/plans/final_release/05_standalone_plugin_repos.md`.**
  > Host changed from GitHub to GitHub. All technical decisions in this doc remain valid
  > except references to GitHub APIs and URLs, which are replaced by their GitHub equivalents.
  > Do not implement from this doc. Kept for historical reference only.
  ```

  _Acceptance: the file opens and the banner is the first body text visible._

### 1.2 Release registry fields and post-v2 GitHub search equivalents

The release registry is a small owner-controlled JSON document or endpoint. The exact hosting
location can be chosen during implementation, but entries should be shaped so the UI does not need
to scrape arbitrary websites.

Minimum release entry:

```json
{
  "id": "tts_xtts",
  "name": "XTTS (Local)",
  "summary": "Official local voice cloning and text-to-speech plugin.",
  "trust_level": "official",
  "repo_url": "https://github.com/audiobook-studio/tts-xtts.git",
  "homepage": "https://github.com/audiobook-studio/tts-xtts",
  "docs_url": "https://github.com/audiobook-studio/tts-xtts#readme",
  "icon": "icon.png",
  "tags": ["local", "voice-cloning", "gpu"],
  "min_studio": "2.0.0",
  "compatibility": ["macOS", "Windows", "Linux"],
  "requirements": ["Python 3.11", "4 GB VRAM recommended"]
}
```

Post-v2 open GitHub search can still reuse the historical topic-search model:

| GitHub concept | GitHub equivalent |
|---|---|
| GitHub topic (`audiobook-studio-tts`) | GitHub repository topic `audiobook-studio-tts` |
| GitHub Search API (historical /api/v4/projects?topic=…) | GitHub Search API (`GET /search/repositories?q=topic:audiobook-studio-tts`) |
| Official GitHub group `audiobook-studio/…` | GitHub org `audiobook-studio` (or the owner's account until the org exists) |
| GitHub personal access token | GitHub personal access token (PAT); public repos need no token for read-only search |
| `git_url: https://github.com/…` | `git_url: https://github.com/…` |

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

- `repo` replaces `project` (GitHub uses same path structure but the field is renamed to avoid confusion with "project" boards).
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
1. Studio engine browser loads the owner-controlled official registry.
2. Each registry entry renders a card/detail view using registry metadata and, where useful,
   known repo files (`manifest.json`, `README.md`, optional icon/preview assets). Arbitrary
   website scraping is not required.
3. User clicks Install from a registry entry or pastes a GitHub repo URL directly.
4. Studio runs `git clone {git_url}` into a temp dir.
5. Validate: enforce the `tts_<name>` folder convention (`plugin_loader._PLUGIN_FOLDER_RE`,
   `^tts_[a-z][a-z0-9]{1,14}$`), run `_validate_manifest` (requires `studio_tts_manifest`,
   `engine_id`, `display_name`, `entry_class`, `capabilities` incl. `synthesis`), check
   `min_studio`. Reject on failure.
6. Move into `plugins/tts_<engine_id>/`.
7. If `requirements.txt` has unmet deps, mark engine `needs_setup`; user clicks "Install
   Dependencies" in Settings → TTS Engines.
8. Register; TTS Server loads it. Engine code runs in TTS Server subprocess only.

**Post-v2 update direction (notify-only, never auto):**
- On demand (and optionally on app start), `git fetch` each installed engine.
- Compare local commit / `version` against upstream.
- Settings → TTS Engines shows per-engine update badge (`2.0.0 → 2.1.0`) with an Update
  button and an Update all action.
- Apply: `git pull` (or fetch + checkout new tag) → re-validate → re-register; roll back on
  validation failure.
- Never pull an update whose `min_studio` exceeds the running app version.

**Install from URL:** user pastes any GitHub repo URL directly. This bypasses the official
registry list but still runs the same clone, manifest validation, dependency, and trust checks.

---

## 3. On-disk folder name — KEEP `plugins/`

**Decision: keep `plugins/` as the on-disk folder through the 2.0 release.**

The GitHub spec proposed renaming to `tts_engines/`. That rename is a breaking change for
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
  _Acceptance: `design-docs/specs/plugin_template/` exists and matches the shape in §2 above._

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

- [ ] **X4. Tag the repo `v2.0.0` and add it to the official registry.**
  Adding topic `audiobook-studio-tts` is still useful for post-v2 open discovery, but the
  release acceptance is the owner-controlled registry entry.
  _Acceptance: the official registry contains the XTTS entry with repo URL, trust level,
  compatibility, summary, and icon/README metadata path._

- [ ] **X5. Update the in-tree copy.**
  Add the `distribution` block to the existing `plugins/tts_xtts/manifest.json` in the main
  repo so it carries its repo reference (same behavior as described in the GitHub spec §8:
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

### 4.4 `synthesis_mixed` → `tts_mixed` — in-tree orchestrator (not extracted)

`synthesis_mixed` (to be renamed `tts_mixed`, see Resolution below) is a built-in orchestrator that routes segments across multiple engines.
It intentionally stays in-tree because it depends on Studio's internal session/segment model
and cannot be a standalone plugin. Two concerns to resolve:

**Concern 1 — folder name doesn't match `tts_*` discovery regex.**
`plugins/synthesis_mixed/` is skipped by the folder scanner: `discover_plugins` in
`plugin_loader.py` rejects any folder whose name fails `_PLUGIN_FOLDER_RE`
(`^tts_[a-z][a-z0-9]{1,14}$`). `synthesis_mixed` fails on both the `tts_` prefix and the
underscore. Note also its manifest `engine_id` is `"mixed"` (not `synthesis_mixed`) — the
allowlist keys on the **folder name**, the dedup map keys on `engine_id`, so the two never
collide.

**Resolution — owner decision 2026-06-10: RENAME the folder to `tts_mixed`.** The
allowlist alternative (a `BUILTIN_PLUGINS` frozenset bypassing the regex gate) was
considered and rejected by the owner — one naming rule, zero exemptions. `tts_mixed`
matches `_PLUGIN_FOLDER_RE` (`^tts_[a-z][a-z0-9]{1,14}$`), so discovery needs **no loader
changes at all**. The manifest `engine_id` stays `"mixed"` (renaming the engine_id would
break stored job/queue references; `_invalid_manifest_plugin`'s fallback
`folder_name.replace("tts_", "", 1)` also derives `"mixed"`, which is consistent).

**Concern 2 — the plugin imports `app/` internals (session model, etc.).**
Because it is in-tree and loaded in the TTS Server subprocess, this is acceptable as an
explicit exception to the "no app imports" rule — but it must be documented in the
manifest (`builtin: true`) and in doc 02's contract notes.

- [ ] **M1. Rename `plugins/synthesis_mixed/` → `plugins/tts_mixed/`** via
  `git mv plugins/synthesis_mixed plugins/tts_mixed`. Then fix every reference to the old
  folder name: `grep -rn "synthesis_mixed" app/ plugins/ tests/ frontend/src/ docs/ --include="*.py" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" | grep -v __pycache__` and update each hit (imports, manifest `entry_class`
  module paths if they embed the folder name, test fixtures, docs). Per the clean-break
  policy, no compatibility shim or old-name alias is kept.
  _Acceptance: the grep above returns nothing outside `design-docs/plans/`; `POST /plugins/refresh` discovers both `tts_xtts` and `tts_mixed` via the normal regex path; `GET /api/engines` lists engine_ids `xtts` and `mixed`; pytest green._

- [ ] **M2. Add `"builtin": true` field to `plugins/tts_mixed/manifest.json`.**
  Studio uses this to suppress the "Install from URL" / "Uninstall" buttons for built-in
  plugins — they are not user-removable.
  _Acceptance: Settings → TTS Engines shows no Uninstall button for the mixed engine._

---

## 5. Full implementation checklist

Steps are ordered for sequential execution. Steps within the same numbered group have no
inter-dependencies and may run in parallel.

### Group 0 — Pre-requisites

- [ ] **0.1** Complete sibling plan 02 (Plugin Communication Contract); SDK published.
- [ ] **0.2** Complete sibling plan 03 (Plugin Interface Template); template repo exists.
- [ ] **0.3** Mark `design-docs/plans/v2_engine_bundle_github_distribution.md` SUPERSEDED (§1.1).

### Group 1 — Discovery infrastructure

*(SHIPPED as in-tree MVP 2026-07-01 audit: `app/engines/official_registry.py` (hardcoded XTTS+Voxtral
catalog) + registry route in `app/api/routers/engines.py` + `OfficialRegistryPanel.tsx` with working
install-from-GitHub URL form + `preview_github_plugin` endpoint. Remaining: actual repo extraction
X1-X6/V1-V3, trust-warning e2e §5.3, update-flow §5.2.)*

- [ ] **1.1** Update `app/tts_server/plugin_loader.py`: add `BUILTIN_PLUGINS` allowlist (§4.4 / M1).
- [x] **1.2** Implement the official registry client used by the Studio engine browser.
  It should load the owner-controlled registry source, render registry cards/details, and hand
  selected `repo_url` values to the same installer path used by pasted GitHub URLs. Do not make
  broad GitHub topic search a release dependency.
- [ ] **1.3** Decide where `distribution` is validated. `plugin_loader._validate_manifest`
  does **not** currently read or validate any `distribution` block, so a `distribution.host`
  of `"github"` is accepted today as an ignored extra field — no loader change is required for
  the engine to load. Registry-vs-direct-URL handling lives in the Studio-side engine browser /
  installer client (item 1.2), which is the component that reads registry entries and
  `distribution.git_url`. If `distribution` is later promoted to a validated field, add a `host`
  check there; do not block engine loading on it.
  _Acceptance: a manifest carrying the `distribution` block (§1.2) loads without a
  `PluginLoadError`, and the installer client routes by `distribution.host`._

### Group 2 — XTTS extraction

- [ ] **2.1** Create `audiobook-studio/tts-xtts` repo on GitHub (step X1).
- [ ] **2.2** Restructure and copy plugin code into new repo (step X2).
- [ ] **2.3** Verify no `app/` imports (step X3).
- [ ] **2.4** Tag `v2.0.0`, add the XTTS entry to the official registry, and optionally apply the GitHub topic for later open discovery (step X4).
- [ ] **2.5** Add `distribution` block to in-tree `plugins/tts_xtts/manifest.json` (step X5).
- [ ] **2.6** XTTS smoke test (step X6). ← gate: do not proceed to Group 3 until this passes.

### Group 3 — Voxtral extraction

- [ ] **3.1** Create `audiobook-studio/tts-voxtral` repo on GitHub (step V1).
- [ ] **3.2** Restructure and copy Voxtral plugin code (V1 continued).
- [ ] **3.3** Verify API key handling (step V2).
- [ ] **3.4** Tag `v2.0.0`, add the Voxtral entry to the official registry, and optionally apply the GitHub topic for later open discovery.
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

- [ ] **5.2 post-v2** Update flow test:
  With XTTS installed from its own repo (step 2.4 tag), simulate an available update by
  pushing a `v2.0.1` tag to the repo (increment `version` in `manifest.json`).
  Studio settings shows update badge.
  Click Update → `git pull` applied → `version` in loaded manifest is `2.0.1`.
  _Acceptance: update badge appears; Update button applies the change; no regression in synthesis. This is not a v2.0 release gate unless explicitly promoted._

- [ ] **5.3** Trust warning test:
  Add a mock community plugin entry to the official registry and install it by registry entry
  and by direct GitHub URL. The engine browser shows "Community" badge, not "Official".
  Install prompts trust/consent dialog.
  _Acceptance: consent dialog names the source repo; user can cancel; no code loaded until consent given._

### Group 6 — Docs and state

- [ ] **6.1** Update `Memory/state.json`: mark standalone plugin repos complete; add `tts_engines/` rename and `synthesis_mixed` → `tts_mixed` rename as post-release candidates.
- [ ] **6.2** Update Settings → TTS Engines section of the user handbook: ZIP install,
  install from GitHub URL, official registry install, dependency setup, and trust prompts.
- [ ] **6.3** Write contributor guide page: "Publishing a TTS plugin for Audiobook Studio" —
  covers GitHub repo shape, optional post-v2 topic tag, `manifest.json` distribution block,
  official-registry submission expectations, and trust model.

---

## 6. References

- `design-docs/plans/v2_engine_bundle_github_distribution.md` — superseded; GitHub version of this plan
- `design-docs/plans/v2_plugin_sdk.md` — plugin contract, `StudioTTSEngine` base class, `plugin_loader.py`
- `app/tts_server/plugin_loader.py` — current discovery implementation
- `design-docs/plans/final_release/02_plugin_communication_contract.md` — SDK publication (pre-requisite)
- `design-docs/plans/final_release/03_plugin_interface_template.md` — canonical plugin folder shape (pre-requisite)
- GitHub Search API, post-v2 open discovery reference: https://docs.github.com/en/rest/search/search#search-repositories
- GitHub Topics: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics
