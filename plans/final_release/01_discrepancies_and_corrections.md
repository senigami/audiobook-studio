# Discrepancies and Corrections — Audiobook Studio 2.0 Final Release

> **Date:** 2026-06-10. This document catalogs every confirmed discrepancy between the wiki (`wiki/`), the plans (`plans/`), and the actual codebase, along with the exact correction required for each item. It is the authoritative pre-release audit record and the entry point for the sibling docs in `plans/final_release/`; a junior agent should be able to execute every correction solely from this file without additional research.

---

## Section 1 — Wiki Discrepancies

---

### W-1: WAV-first app still implies MP3 as a normal output

**Discrepancy**
`wiki/File-Formats-and-Audio-Guidance.md` does not qualify MP3 as an explicit-export-only format. `wiki/Library-and-Projects.md` describes the **Top-Right Arc** of the chapter status orb as "MP3 availability" with no note that MP3 is legacy/export-only. Since Changelog v2.0.7 the app is WAV-first; MP3 is produced only through an explicit export step.

**Evidence**
- `wiki/File-Formats-and-Audio-Guidance.md` lines 16–17: lists `.mp3` as a normal input format but does not flag it as non-default output.
- `wiki/Library-and-Projects.md` lines 30–32: "Top-Right Arc: MP3 availability" — no legacy or export-only qualifier.
- `wiki/Settings.md` (cross-reference): implicitly treats WAV as primary; no contradiction, but the other two pages diverge.
- `wiki/Changelog.md`: v2.0.7 entry (owner to confirm exact line) records WAV-first change.

**Correction**
- [ ] In `wiki/File-Formats-and-Audio-Guidance.md`, add a callout block under the Output section stating: "**MP3 is not a default output.** The app renders to WAV at all times. MP3 files are produced only via the explicit *Export → MP3* action."
- [ ] In `wiki/Library-and-Projects.md`, update the Top-Right Arc description to read: "**Top-Right Arc**: MP3 export availability *(legacy/explicit-export-only; WAV is the primary output)*."
- [ ] Cross-check `wiki/Settings.md` for any export-default setting that references MP3 as primary and update if found.

**Acceptance**
A reader of `wiki/File-Formats-and-Audio-Guidance.md` and `wiki/Library-and-Projects.md` sees no statement or implication that MP3 is produced automatically after synthesis. The word "availability" in the orb description is accompanied by the export-only qualifier.

---

### W-2: RESOLVED (owner ruling 2026-06-10) — `sample.mp3` is correct

**Owner format convention (binding):** voice preview samples are **MP3**; chapter/book render audio is **WAV**; portable bundles distribute **MP3**. "WAV-first" (v2.0.7) applies to the render pipeline, not voice samples.

The original audit inverted this: it flagged `sample.mp3` in `wiki/Getting-Started.md` as stale and an agent briefly changed it to `sample.wav`. That edit has been reverted (`sample.mp3` restored in Getting-Started; Voices-and-Voice-Profiles updated to `sample.mp3` / `samples/preview.mp3`).

**Remaining correction (spec, not wiki)**
- [x] Wiki pages restored to mp3 (done 2026-06-10).
- [ ] `docs/specs/voice-bundle-template/voice.json` line 10 references `samples/preview.wav` — change to `samples/preview.mp3` (and any other `.wav` sample references in the template/`voice.schema.json`) to match the convention. Owned by doc 04's bundle alignment work.

**Acceptance**
Wiki, `voice.schema.json`, and the bundle template all show mp3 for samples/previews; render-pipeline docs still say WAV.

---

### W-3: Wiki has no pages/sections on responsive design, light/dark theming, or standalone-GitHub-repo plugin distribution

**Discrepancy**
No wiki page covers: (a) responsive layout expectations, (b) light/dark theme support, or (c) the standalone-GitHub-repo distribution model for TTS engine plugins. These are planned features that need documentation once they land.

**Evidence**
- `wiki/` directory listing: no `Responsive-Design.md`, no `Theming.md`, no `Plugin-Distribution.md` or equivalent.
- Feature work is planned in `plans/final_release/07_frontend_themes_and_responsive.md` (theming/responsive) and `plans/final_release/05_standalone_plugin_repos.md` (GitHub distribution).

**Correction**
- [ ] After `plans/final_release/07_frontend_themes_and_responsive.md` is implemented, add a `wiki/Theming-and-Responsive-Design.md` page covering: supported themes (light/dark), how the user switches themes via Settings, and minimum responsive breakpoints.
- [ ] After `plans/final_release/05_standalone_plugin_repos.md` is implemented, add or extend `wiki/Voices-and-Voice-Profiles.md` or a new `wiki/Plugin-Distribution.md` to cover standalone GitHub repo structure, the `audiobook-studio-tts` topic tag, install-from-URL flow, and official vs. community plugin distinction.
- [ ] Mark these as **blocked** (not yet actionable) until the respective feature docs are complete.

**Acceptance**
Post-feature-implementation: both topics are covered by wiki pages linked from `wiki/Home.md`. Pre-implementation: this item is acknowledged as a deferred wiki task.

---

### W-4: `wiki/Concepts.md` does not mention "mixed rendering" as a job type

**Discrepancy**
`wiki/Queue-and-Jobs.md` line 47 treats "Mixed Generation" as a first-class job type with its own description. `wiki/Concepts.md` line 25 refers to "a mixed chunk-aware path" only in passing within the Synthesis step description — it does not list it as a named job type alongside XTTS and Voxtral.

**Evidence**
- `wiki/Concepts.md` line 25: "XTTS, Voxtral, or a mixed chunk-aware path processes each queued chunk…"
- `wiki/Queue-and-Jobs.md` line 47: "**Mixed Generation**: Rendering displayed chunk groups that may contain XTTS or Voxtral sections depending on the assigned voice profiles."

**Correction**
- [ ] In `wiki/Concepts.md`, find the section that lists synthesis/job types (near line 25) and add a named entry: "**Mixed Generation** — a job that spans chunks assigned to different engines (e.g., XTTS and Voxtral within the same chapter); the renderer selects the correct engine per chunk at runtime."
- [ ] Ensure the new entry cross-references `wiki/Queue-and-Jobs.md` for full job-lifecycle details.

**Acceptance**
`wiki/Concepts.md` lists "Mixed Generation" as a named synthesis mode in the same location where XTTS and Voxtral are mentioned.

---

## Section 2 — Plans Discrepancies

---

### P-1: `v2_engine_bundle_gitlab_distribution.md` specifies GitLab; owner decision is GitHub

**Discrepancy**
`plans/v2_engine_bundle_gitlab_distribution.md` hard-codes GitLab as the distribution host (repo URLs, API endpoints, `"host": "gitlab"` in manifest). The owner decision is that standalone engine repos will live on **GitHub**, not GitLab. The plan also has no phase assignment.

**Evidence**
- `plans/v2_engine_bundle_gitlab_distribution.md` lines 1, 4, 12–13, 65–66, 68, 76, 80, 82, 96–106, 145–147, 160: all references are GitLab-specific.
- No phase assignment anywhere in the file or `Memory/state.json`.

**Correction**
- [ ] Rename `plans/v2_engine_bundle_gitlab_distribution.md` to `plans/v2_engine_bundle_github_distribution.md`.
- [ ] In the renamed file, replace every occurrence of "gitlab" / "GitLab" / `https://gitlab.com` with "github" / "GitHub" / `https://github.com`.
- [ ] Replace `"host": "gitlab"` with `"host": "github"` in all manifest examples.
- [ ] Replace GitLab Projects API calls (`/api/v4/projects?topic=…`) with the GitHub Search Repositories API (`GET https://api.github.com/search/repositories?q=topic:audiobook-studio-tts`).
- [ ] Replace all `gitlab.com/audiobook-studio/` URL patterns with `github.com/audiobook-studio/`.
- [ ] Add a header note: "**Scheduled by:** `plans/final_release/05_standalone_plugin_repos.md`. No independent phase assignment."
- [ ] Update `plans/master_agnostic_plan.md` line that references the old filename to point to the renamed file.

**Acceptance**
The word "GitLab" does not appear in the renamed distribution plan. The file header cites `05_standalone_plugin_repos.md` as its scheduling authority.

---

### P-2: Phase 11 has one open checkbox but `Memory/state.json` marks it `closeout_ready`

**Discrepancy**
`plans/phase_11_audit.md` line 26 contains an open checkbox: `- [ ] Checkpoint Phase 11 closeout after current docs and fallback fix land`. `Memory/state.json` line 31 already records `"phase_11": "closeout_ready"`, meaning the checkpoint was never formally ticked off.

**Evidence**
- `plans/phase_11_audit.md` line 26: `- [ ] Checkpoint Phase 11 closeout after current docs and fallback fix land`
- `Memory/state.json` line 31: `"phase_11": "closeout_ready"`

**Correction**
- [ ] In `plans/phase_11_audit.md` line 26, change `- [ ]` to `- [x]` and append the date: `- [x] Checkpoint Phase 11 closeout — closed 2026-06-10`.
- [ ] Immediately below that line, add: `> Phase 11 is officially closed. All remaining items have been migrated to Phase 12. See \`plans/phases/phase_12_polish_and_cleanup.md\`.`
- [ ] Update `Memory/state.json` `"phase_11"` value from `"closeout_ready"` to `"closed"` if the state schema permits; otherwise add a comment field.

**Acceptance**
`plans/phase_11_audit.md` contains zero open checkboxes (`- [ ]`). The file includes a dated closure note.

---

### P-3: `mixed.py` → `composite.py` rename deferred to Phase 13, but Phase 13 scope does not list it

**Discrepancy**
`plans/phases/phase_12_polish_and_cleanup.md` line 63 defers the `mixed.py` → `composite.py` rename to Phase 13. `plans/master_agnostic_tasks.md` line 48 also notes the deferral. However, `plans/phases/phase_13_release_documentation_and_distribution.md` contains no mention of this rename.

**Evidence**
- `plans/phases/phase_12_polish_and_cleanup.md` line 63: `- [ ] Rename \`mixed.py\` -> \`composite.py\`.`
- `plans/master_agnostic_tasks.md` line 48: `- [ ] Rename \`mixed.py\` -> \`composite.py\` (Deferred to Phase 13)`
- `plans/phases/phase_13_release_documentation_and_distribution.md`: no matching entry (confirmed by search).
- **Reality check (2026-06-10):** `find . -path ./venv -prune -o -name "mixed.py" -print` returns **nothing** — no `mixed.py` module exists in the repo today, and no `composite.py` exists in app code. The remaining "mixed" references are mixed-*generation* identifiers (`app/engines/behavior.py`, `app/db/queue.py`, `app/db/models.py`, `plugins/synthesis_mixed/`), not a module to rename.

**Correction:**
- [ ] First re-confirm the file's absence: `find . -path ./venv -prune -o -name "mixed.py" -print` and `find . -path ./venv -prune -o -name "composite.py" -print`.
- [ ] **If absent (current finding):** mark both plan lines as not-applicable rather than performing a rename. In `plans/master_agnostic_tasks.md` line 48 and `plans/phases/phase_12_polish_and_cleanup.md` line 63, change `- [ ]` to `- [x]` with the note "no `mixed.py` module exists — closed as N/A 2026-06-10". **Needs human judgment** to confirm this is not a misnamed reference to `plugins/synthesis_mixed/`.
- [ ] **If a `mixed.py` is found:** then, and only then, choose: (A) perform the rename now in Phase 12.2, update all import sites, mark both lines `[x]`; or (B) add an explicit checkbox to `plans/phases/phase_13_release_documentation_and_distribution.md`.
- [ ] Doc 06 §3.6 defers to this item — keep the two in sync.

**Acceptance**
The contradiction is resolved: either both plan lines are checked as N/A (file absent), or `mixed.py` is renamed/`composite.py` exists and both lines reflect the chosen path. No plan line still implies a pending rename of a nonexistent file.

---

### P-4: `v2_voice_metadata_and_casting.md` is DRAFT with no scheduled phase

**Discrepancy**
`plans/v2_voice_metadata_and_casting.md` is marked `Status: DRAFT for review` and awaits owner sign-off. `plans/v2_voice_tag_taxonomy.md` is `Status: FINAL DRAFT`. The casting work has no scheduled phase in any phase file or `Memory/state.json`.

**Evidence**
- `plans/v2_voice_metadata_and_casting.md` lines 3–5: `Status: DRAFT for review. … need Steven's sign-off before any implementation.`
- `plans/v2_voice_tag_taxonomy.md` line 3: `Status: FINAL DRAFT.`
- `Memory/state.json`: no phase entry for voice metadata/casting work.

**Correction**
- [ ] Add a header note to `plans/v2_voice_metadata_and_casting.md`: "**Scheduled by:** `plans/final_release/04_voice_metadata_and_tagging.md`. Implementation is gated on owner sign-off of this DRAFT."
- [ ] In `plans/final_release/04_voice_metadata_and_tagging.md`, reference `v2_voice_metadata_and_casting.md` as the upstream spec that must reach FINAL status before implementation tasks begin.
- [ ] No casting implementation should begin until `v2_voice_metadata_and_casting.md` is promoted to FINAL by the owner.

**Acceptance**
`plans/v2_voice_metadata_and_casting.md` contains a "Scheduled by" header citing doc 04. Doc 04 lists the sign-off gate explicitly.

---

### P-5: `plugins/` → `tts_engines/` rename referenced in two plans but absent from `v2_plugin_sdk.md`

**Discrepancy**
`plans/master_agnostic_plan.md` lines 28–35 and the (to-be-renamed) GitLab distribution plan both reference a future rename of `plugins/` to `tts_engines/`. `plans/v2_plugin_sdk.md` is the canonical SDK contract document and makes no mention of this future rename, leaving the canonical directory name ambiguous.

**Evidence**
- `plans/master_agnostic_plan.md` lines 28–35: future rename candidate `tts_engines/` noted.
- `plans/v2_engine_bundle_gitlab_distribution.md` (passim): uses `tts_<engine_id>/` as top-level folder naming but does not explicitly call the host directory `tts_engines/`.
- `plans/v2_plugin_sdk.md` line 16: `plugins/` used throughout with no rename note.

**Correction**
- [ ] In `plans/v2_plugin_sdk.md`, add a **Directory Naming** note near line 16: "`plugins/` is the canonical directory name until further notice. A future rename to `tts_engines/` is under consideration (see `plans/master_agnostic_plan.md`) but **has not been decided**. The decision will be made once in `plans/final_release/05_standalone_plugin_repos.md`; until then all code and docs must use `plugins/`."
- [ ] Do **not** perform the rename in any phase before it is decided in doc 05.

**Acceptance**
`plans/v2_plugin_sdk.md` contains the naming note. No plan or code file introduces `tts_engines/` as a directory before doc 05 authorises it.

---

### P-6: `v2_settings_architecture.md` lists theme selection as "when implemented" with no owning plan

**Discrepancy**
`plans/v2_settings_architecture.md` line 71 lists "Theme selection (when dark/light theme is implemented)" as a future settings item with no reference to where that implementation is planned.

**Evidence**
- `plans/v2_settings_architecture.md` line 71: `- Theme selection (when dark/light theme is implemented)`
- No existing phase file or plan doc takes ownership of theme implementation prior to this audit.

**Correction**
- [ ] In `plans/v2_settings_architecture.md` line 71, append a cross-reference: `- Theme selection — planned in \`plans/final_release/07_frontend_themes_and_responsive.md\``.
- [ ] Ensure `plans/final_release/07_frontend_themes_and_responsive.md` lists the settings architecture integration (i.e., persisting the chosen theme via the settings system) as a required task.

**Acceptance**
`plans/v2_settings_architecture.md` no longer has an unowned "when implemented" item for themes. Doc 07 owns the implementation.

---

## Section 3 — Code-vs-Plan Discrepancies

---

### C-1: Plugin studio-side halves import core `app.*` modules, violating the SDK contract boundary

**Discrepancy**
The plugin SDK contract (`plans/v2_plugin_sdk.md`) and `wiki/Voices-and-Voice-Profiles.md` state that plugins communicate with the Studio exclusively via contracts/interfaces. In practice:
- `plugins/tts_xtts/plugin/studio/segments.py` lines 24, 174–175, 181: imports `app.db.get_chapter_segments`, `app.api.ws.broadcast_segments_updated`, `app.db.chapters.get_chapter_segments_counts`.
- `plugins/synthesis_mixed/handler.py` lines 10, 12, 15, 162, 188–196, 196, 276, 360, 365: imports `app.db.state`, `app.db.speakers`, `app.api.ws.broadcast_segments_updated`, `app.db.chapters`.
- `plugins/tts_xtts/plugin/studio/app_adapter.py` lines 40, 484, 495: imports `app.api.routers`, `app.db.speakers`.
- `plugins/tts_voxtral/plugin/studio/app_adapter.py` lines 32, 52, 60, 92, 147, 227, 323, 454, 472, 478: imports `app.api.routers`, `app.db.state`, `app.db.speakers`.

**Evidence**
- `plugins/tts_xtts/plugin/studio/segments.py`
- `plugins/synthesis_mixed/handler.py`
- `plugins/tts_xtts/plugin/studio/app_adapter.py`
- `plugins/tts_voxtral/plugin/studio/app_adapter.py`
- `plans/v2_plugin_sdk.md`: contract-only communication model.

**Correction**
- [ ] This is a design-level fix tracked in `plans/final_release/02_plugin_communication_contract.md`. Do not attempt a surgical import change here — the contract boundary must first be defined in doc 02.
- [ ] Until doc 02 delivers the replacement contract APIs, **do not add new `app.*` imports** to any plugin file.
- [ ] Track the four offending files above as the known violation surface; doc 02 must address all four.

**Acceptance**
After doc 02 is implemented: `grep -r "from app\." plugins/` returns zero results (or only whitelisted shim imports if a transition shim is defined).

---

### C-2: `voices/*/voice.json` files carry no tags or attributes despite schema and wiki claiming they do

**Discrepancy**
`wiki/Voices-and-Voice-Profiles.md` claims voice bundles include "language, style, tag, and attribution metadata" and references `docs/specs/voice.schema.json`. The schema at `docs/specs/voice.schema.json` line 7 marks `attributes`, `languages`, and (optionally) `tags` as required/defined fields. Actual `voice.json` files (e.g., `voices/Dark Fantasy/voice.json`, `voices/Test/voice.json`, `voices/Dracula/voice.json`) contain only `version`, `name`, `id`, and `default_variant` — no `attributes`, `languages`, or `tags`.

**Evidence**
- `docs/specs/voice.schema.json` line 7: `"required": ["spec", "spec_version", "id", "name", "image", "samples", "languages", "attributes"]`
- `docs/specs/voice.schema.json` line 77: `"tags": { "type": "array", … }`
- `voices/Dark Fantasy/voice.json`: only `version`, `name`, `id`, `default_variant`.
- `voices/Test/voice.json`: same minimal structure.
- `voices/Dracula/voice.json`: same minimal structure.

**Correction**
- [ ] This gap is addressed by `plans/final_release/04_voice_metadata_and_tagging.md`.
- [ ] The wiki claim must be downgraded until the gap is closed: in `wiki/Voices-and-Voice-Profiles.md`, change "bundles include language, style, tag, and attribution metadata" to "bundles **will include** language, style, tag, and attribution metadata once the voice metadata spec is finalised (see roadmap)."
- [ ] The schema at `docs/specs/voice.schema.json` is the target state; the existing `voice.json` files are pre-schema and need migration as part of doc 04 work.
- [ ] Do **not** add tags/attributes to individual `voice.json` files manually before doc 04 defines the migration procedure.

**Acceptance**
The wiki no longer claims current bundles have tags/attributes. After doc 04 is implemented: all `voice.json` files validate against `docs/specs/voice.schema.json` with no missing required fields.

---

### C-3: `app/infra/cache/` and `app/infra/events/` are unimplemented Phase 1 stubs; `frontend/src/api/client.ts` and `frontend/src/api/queries/index.ts` throw `NotImplementedError`/`Error`

**Discrepancy**
`app/infra/cache/__init__.py` exports only `build_cache_key` which raises `NotImplementedError`. `app/infra/events/__init__.py` exports only `publish_internal_event` which raises `NotImplementedError`. `frontend/src/api/client.ts` exports `createApiClient` and `createMockApiClient` both of which throw `Error('… not implemented yet.')`. `frontend/src/api/queries/index.ts` exports `createStudioQueries` which throws `Error('… not implemented yet.')`. These were Phase 1 boundary scaffolds; nothing has implemented or removed them.

**Evidence**
- `app/infra/cache/__init__.py` lines 1–18: stub with `raise NotImplementedError`.
- `app/infra/events/__init__.py` lines 1–15: stub with `raise NotImplementedError`.
- `frontend/src/api/client.ts` lines 6–12: throws on both exports.
- `frontend/src/api/queries/index.ts` lines 6–8: throws on export.

**Correction**
- [ ] Decide (in `plans/final_release/06_code_organization_cleanup.md`) whether each stub is: (a) **implement now** (only if a live caller exists or doc 02 commits to the boundary), or (b) **delete and remove all import sites**. Per policy, Studio 2.0 is not in production and dead scaffolds are removed, not retained — there is **no "keep as documented placeholder" option** for these (they are not part of the surviving v1→v2 migration path).
- [ ] Until that decision is made, **do not add callers** to any of these stubs.
- [ ] `app/infra/db/` subdirectory is empty (`__init__.py` only) — include it in the same cleanup decision.
- [ ] Note: `app/infra/subprocess/__init__.py` is a *non-empty* raising stub (`run_managed_subprocess`/`run_managed_subprocess_async`), referenced only by dead `_ =` keep-alive lines and mock-patch target strings in the plugin adapters — see doc 06 §3.1.

**Acceptance**
After doc 06 is actioned: each stub file either has a real implementation backed by a live caller, or is deleted with zero remaining import sites. `grep -rn "NotImplementedError" app/infra/` returns nothing and `grep -rn "not implemented" frontend/src/api/ --include="*.ts"` returns nothing.

---

### C-5: Legacy in-process engine registry path survives in `app/engines/registry.py`

**Discrepancy**
Studio 2.0 is not in production and the legacy v1 code path is to be deleted (only the v1→v2 *data migration* path survives). `app/engines/registry.py` still carries the **legacy in-process engine loader**: `_load_builtin_engines()` (lines 267–279, functional) and `_load_plugin_engines()` (lines 282–284, `return {}` no-op), invoked together at lines 43–44 under a comment that self-describes the block as "Legacy in-process registry path (retained only for quarantined test/dev use)". The supported production path is the out-of-process plugin/manifest loader (`app/tts_server/plugin_loader.py`).

**Evidence**
- `app/engines/registry.py` lines 43–44, 263–284.
- Manifest version is already enforced at line 292–297 (`studio_tts_manifest` must equal `"1.0"`), consistent with the "contracts/manifests must declare versions" principle — preserve that check wherever manifest loading survives.

**Correction**
- [ ] Plan the **deletion** of the legacy in-process engine path (`_load_builtin_engines`, `_load_plugin_engines`, the calling lines 43–44, and any helpers that become orphaned) in `plans/final_release/06_code_organization_cleanup.md` §3.5, with caller-mapping and an owner-confirmation flag.
- [ ] Do not delete `app/db/legacy_migration.py` or the legacy import flows in `app/db/migration.py` / `app/api/routers/migration.py` — those are the surviving v1→v2 data-migration path.

**Acceptance**
After doc 06 §3.5: `grep -rn "_load_builtin_engines\|_load_plugin_engines" app/ tests/ --include="*.py"` returns nothing; engine discovery still works via the out-of-process loader; `app/db/legacy_migration.py` remains importable.

---

### C-4: Phase 12 open items confirmed in both plans and code

**Discrepancy**
The following items are open in plans and unimplemented in code. They are listed here for completeness and to prevent them from falling out of scope during the final-release planning process.

**Evidence**
- `plans/phases/phase_12_polish_and_cleanup.md` (open checkboxes): `check_output` interface in plugin adapters; `reconcile.py` update; plugin contract-version validation; voice icon upload; searchable voice tags; HF bundle alignment.
- `plans/master_agnostic_tasks.md` line 49: `[/] Update composite/mixed rendering to use metadata-driven progress and sanitization hooks` (partial).

**Correction**
- [ ] Review each open Phase 12 checkbox in `plans/phases/phase_12_polish_and_cleanup.md` and assign it to exactly one of: (a) close in Phase 12.2 current branch, (b) defer to a specific numbered `plans/final_release/` doc, or (c) explicitly descope with a written rationale.
- [ ] Specifically: `check_output` interface and `reconcile.py` update → tracked in `plans/final_release/02_plugin_communication_contract.md`. Plugin contract-version validation → also doc 02. Voice icon upload and searchable voice tags → doc 04. HF bundle alignment → doc 05.
- [ ] Do not leave any Phase 12 checkbox unassigned after Phase 12.2 closes.

**Acceptance**
`plans/phases/phase_12_polish_and_cleanup.md` has no `- [ ]` items that lack an explicit assignment comment. Every open item is either checked `[x]` or annotated `→ final_release/NN_…`.

---

## Ownership Table

The table below maps each discrepancy to the `plans/final_release/` document that owns its resolution. `00` = `00_overview.md` (master index).

| ID  | Discrepancy summary | Owning doc |
|-----|---------------------|------------|
| W-1 | WAV-first not reflected in File-Formats and Library-and-Projects wikis | `00_overview.md` (wiki maintenance, no dedicated doc) |
| W-2 | `sample.mp3` in Getting-Started should be `sample.wav` | `00_overview.md` (wiki maintenance, no dedicated doc) |
| W-3 | No wiki pages on responsive design, theming, or GitHub plugin distribution | `07_frontend_themes_and_responsive.md`, `05_standalone_plugin_repos.md` |
| W-4 | Mixed rendering not named as a job type in Concepts wiki | `00_overview.md` (wiki maintenance, no dedicated doc) |
| P-1 | Distribution plan specifies GitLab; owner decision is GitHub | `05_standalone_plugin_repos.md` |
| P-2 | Phase 11 open checkpoint checkbox vs. `state.json` closeout_ready | `00_overview.md` (housekeeping, self-contained) |
| P-3 | `mixed.py` → `composite.py` rename deferred to Phase 13 scope gap | `06_code_organization_cleanup.md` |
| P-4 | Voice casting plan is DRAFT with no scheduled phase | `04_voice_metadata_and_tagging.md` |
| P-5 | `plugins/` → `tts_engines/` rename unresolved across plan docs | `05_standalone_plugin_repos.md` |
| P-6 | Theme selection in settings plan has no owning implementation doc | `07_frontend_themes_and_responsive.md` |
| C-1 | Plugin studio-side halves import `app.*` violating SDK contract | `02_plugin_communication_contract.md` |
| C-2 | `voice.json` files lack tags/attributes despite schema and wiki claims | `04_voice_metadata_and_tagging.md` |
| C-3 | `app/infra/` and `frontend/src/api/` stubs raise NotImplementedError | `06_code_organization_cleanup.md` |
| C-5 | Legacy in-process engine registry path must be deleted (v1 not in prod) | `06_code_organization_cleanup.md` |
| C-4 | Phase 12 open items (check_output, reconcile, contract version, icon, tags, HF) | `02_plugin_communication_contract.md`, `04_voice_metadata_and_tagging.md`, `05_standalone_plugin_repos.md` |
