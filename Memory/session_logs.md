# 2026-05-08 - ScriptView Pending Render Cue Restored

- Added a visible pending state for script spans while a group is being rebuilt so live chapter renders no longer stay black until completion.
- Restored the book-mode hover highlight that had been canceled by the transparent hover override.
- Verified the focused frontend chapter-view tests and production build after the styling change.

# 2026-05-08 - Queue Snapshot And Script View Live Refresh Repaired

- Refreshed the live jobs store when `queue_updated` arrives so project and chapter views see queued jobs immediately instead of waiting for a hard reload.
- Broadcast `segments_updated` after grouped segment persistence so chapter script-view data repaints as each rendered group saves.
- Verified the focused backend and frontend regression slices, plus a production frontend build, before checkpointing the change.

# 2026-05-08 - DB Render Stats Wired To Orchestrator Completion

- Moved render performance sample recording into the orchestrator completion path so successful chapter renders and chapter tests update the About-page production tally from the database.
- Added regression coverage for render sample recording on successful bridge-backed synthesis completion.
- Kept the broader `state.json` job-overlay cleanup as a separate follow-up slice rather than mixing it into the metrics fix.

# 2026-05-08 - Bridge-Backed Synthesis Single-Flight Serialized

- Added an exclusive resource claim for bridge-backed synthesis tasks so only one TTS job can run at a time.
- Changed the orchestrator to keep synthesis jobs queued until the exclusive slot is available instead of promoting them immediately into preparing/running.
- Verified the focused scheduler/task tests, API synthesis tests, and generation/orchestration integration slice.

# 2026-05-06 - Phase 11 Reported Regressions Fixed Pending Manual QA

- Mapped four user-reported regressions into `plans/implementation/phase_11_remaining_work.md` and used bounded Antigravity prompts for the non-trivial fixes.
- Verified and tightened fixes for Settings engine test audio without a default voice, slow Library project listing, blank chapter enqueue enablement messages, and duplicate React option keys.
- Added permanent regression tests for engine test samples, project list migration avoidance, enqueue error messages, and duplicate frontend option keys.
- Focused backend/frontend tests and frontend build passed; remaining status is manual app verification for the four reported flows.

# 2026-05-05 - Phase 11 Planning Docs Consolidated

- Consolidated Phase 11 planning into `plans/phase_11_audit.md`, `plans/phases/phase_11_v2_only_runtime_cleanup.md`, and `plans/implementation/phase_11_remaining_work.md`.
- Added `plans/implementation/phase_11_completed_work.md` so future summaries can recover completed Phase 11 work after stale docs were removed.
- Removed stale implementation handoff, inventory, audit report, audit plan, and behavior-cutover docs that duplicated or contradicted the current task board.
- Updated local memory references so future sessions start from the consolidated audit index and remaining-work task board.

# 2026-05-05 - Phase 11 Docs Organized Around Active Open Work

- Added `plans/phase_11_audit.md` as a central index for Phase 11 planning docs.
- Reconciled the active phase plan, inventory, and handoff so the remaining work is listed in one place.
- Updated the inventory snapshot to distinguish current open work from historical audit notes.

# 2026-05-05 - Phase 11 V2-Only Manifest And Startup Cleanup Verified

- Removed legacy project-root `audio/` and `text/` directory creation from new project setup.
- Made runtime project and voice manifest loaders return empty states on missing manifests, while keeping V1 fallback logic inside migration-only helpers.
- Removed import-time DB migration and moved the startup migration call into `app.boot.boot_studio()`.
- Verified the focused storage, voice-security, migration-security, hygiene, and boot tests plus `ruff check`.

# 2026-04-30 - Phase 11 Final Audit Closed

- Completed the Phase 11 anti-ghost audit and confirmed there was no additional meaningful cleanup work left to chase.
- Kept the remaining legacy seams intentionally quarantined and avoided speculative pruning.
- Verified the focused bridge, API, and domain-contract suites again after the audit cleanup.
- Checkpoint commit created: `a005c65 Finish Phase 11 audit cleanup`.

# 2026-04-30 - Phase 11 Built-In Metadata Consolidation Verified

- Centralized built-in engine metadata in the disk-backed manifest loader so XTTS and Voxtral inherit `version`, `local`, `cloud`, `network`, `author`, and `homepage` from the manifest instead of re-declaring them in code.
- Removed redundant `module_path` and `capabilities` fields from XTTS and Voxtral health details because the registry payload already carries that information.
- Confirmed the remote-first bridge/API/domain-contract suite still passes after the metadata cleanup.

# 2026-04-30 - Phase 11 Wasteful Domain Test Cleanup Verified

- Removed the last skipped placeholder tests from `tests/test_domain_contracts.py` so the suite only keeps executable coverage.
- Converted the preview-contract assertions to match the mocked remote TTS Server path and kept the one local XTTS runtime-failure case as an explicit opt-in legacy seam.
- Removed the broad `bridge_test_isolation` autouse fixture from `tests/conftest.py` now that the bridge suite no longer needs shared legacy-mode setup.
- Verified the focused bridge, API, and domain-contract suites with `./venv/bin/python -m pytest tests/test_domain_contracts.py tests/bridge/test_bridge_registry.py tests/test_bridge_tts_server.py tests/test_api_engines.py -vv` and `git diff --check`.

# 2026-04-30 - Phase 11 Initial Inventory Created

- Created `plans/implementation/phase_11_v1_cleanup_inventory.md` as the audit-first working checklist for v1/fallback cleanup.
- Restored `plans/implementation/phase_11_session_handoff.md`, which memory/session logs referenced but the workspace was missing.
- Used a bounded Antigravity/Gemini explorer for the grep-heavy audit sweep, then Codex reviewed and integrated the findings.
- Classified boot/watchdog env mutation, bridge/local registry fallback, duplicate built-in XTTS/Voxtral metadata, fallback-asserting tests, plugin-internal legacy dependencies, and migration/data compatibility separately.
- Identified the first behavior-changing slice: rewrite fallback-readiness tests, remove `USE_TTS_SERVER=0` mutation from boot/watchdog failure paths, and make unavailable TTS Server state visible instead of ready fallback.
- Verified with `git diff --check` and created checkpoint commit `6815a4a Document Phase 10 handoff and Phase 11 audit start`.

# 2026-04-30 - Phase 11 Boot/Watchdog Fallback Removed

- Removed the silent `USE_TTS_SERVER=0` mutation from `app/boot.py` and `app/engines/watchdog.py`.
- Updated `app/api/routers/system.py` so a crashed managed TTS Server is reported as offline/unavailable instead of ready fallback.
- Rewrote the boot and API system tests to assert visible degraded/unavailable service state.
- Verified the slice with `./venv/bin/python -m pytest tests/test_boot.py tests/test_api_system.py tests/test_tts_server_health.py -vv` and `git diff --check`.
- Created checkpoint commit `200d720 Remove silent TTS Server fallback`.

# 2026-04-30 - Phase 11 Bridge/Registry Test Pruning Completed

- Removed wasteful legacy-local bridge registry tests that only re-proved the deprecated local path existed.
- Simplified the remote bridge registry test to assert actual remote behavior rather than constructing an artificial local registry fixture.
- Removed the direct legacy-local bridge path test from `tests/test_bridge_tts_server.py` and the in-process Voxtral settings roundtrip from `tests/test_api_engines.py`.
- Tightened `app/api/routers/engines.py` to use the public registry-loader seam instead of reaching into the bridge's private local attribute.
- Added `.gitignore` coverage for `shadow_slave_summaries/` so relocated scratch output stays out of future repo diffs.
- Verified the focused bridge/API slice with `./venv/bin/python -m pytest tests/bridge/test_bridge_registry.py tests/test_bridge_tts_server.py tests/test_api_engines.py -vv` and `git diff --check`.
- Created checkpoint commit `307b2bf Trim wasteful legacy-path tests`.

# 2026-04-30 - Phase 10 Wrapped And Phase 11 Handoff Prepared

- Cleaned `.agent/notes.md` so it only contains durable repo-worthy guidance instead of session state.
- Updated ignored `Memory/` files with the actual current handoff state: active branch `studio2/phase-11`, Phase 10 wrapped, Phase 11 ready for audit-first cleanup, and Phase 12 deferred.
- Added `plans/implementation/phase_11_session_handoff.md` as the repo-visible handoff artifact for the next session.
- Updated the handoff to explicitly use `Memory/` for persistent Studio 2.0 session memory.
- Recorded that Antigravity/Gemini should be used as a bounded worker with JSON-style prompts to minimize token usage, while Codex owns direction, verification, and pushback.
- Recorded that Studio 2.0 should keep `USE_TTS_SERVER=True` and `USE_STUDIO_ORCHESTRATOR=True` as intended defaults.
- Recorded CodeQL advanced setup as a deferred security verification track unless it directly blocks a task.

# 2026-04-27 - Phase 9 Plugin Ecosystem & External API Complete

- Finished and verified the Phase 9 plugin ecosystem deliverables: `importlib.metadata` discovery, dotted `entry_class` support, dependency detection, and guided install flow.
- Hardened the TTS Server isolation boundary: implemented and verified 42 tests across `plugin_loader`, `verification`, and `health` paths to prove that bad plugins cannot crash the server.
- Completed the public Studio TTS API surface (`/api/v1/tts`) with optional Bearer authentication, rate limiting, and local-only/LAN binding controls.
- Published comprehensive contributor and integrator documentation: `plugin-guide.md`, `plugin-submission-guidelines.md`, and `studio-as-tts-gateway.md`.
- Verified the implementation with a dedicated regression suite covering discovery, isolation, and API security.
- Updated the Phase 9 checklist and project memory to reflect full completion of all planned deliverables.

# 2026-04-24 - Phase 8 Storage Normalization Verified

- Implemented and verified versioned storage migration (v1 to v2) for projects and voices.
- Enriched `project.json` manifests with metadata (title, author, series) from SQLite during migration.
- Implemented automatic cleanup of legacy chapter residues (`audio/`, `text/`) after successful v2 relocation.
- Hardened voice migration to handle flat variant folders and root-to-Default relocation (e.g., `voices/Test` -> `voices/Test/Default`).
- Verified the implementation with a comprehensive suite of storage and API regression tests.
- Confirmed successful migration of live workspace data, including project enrichment and voice nesting.
- Updated Phase 8 planning and memory to reflect storage normalization as a completed deliverable.

# 2026-04-24 - Phase 8 Voice Portability Finalized

- Implemented whole-voice bundle export/import for the v2 nested voice layout, covering metadata, model assets, preview assets, and optional source WAVs.
- Added backend bundle validation and duplicate-safe import behavior so portable voice bundles can move between installs cleanly.
- Added Voices UI affordances for exporting and importing voice bundles, then verified the backend and frontend regression suites.
- Checkpoint commit created and pushed: `a83637a Add portable voice bundle export and import`.

# 2026-04-24 - Voice Portability Discoverability Improved

- Surfaced voice export/import directly in the Voices header so the bundle workflow is visible without opening the per-voice action menu.
- Kept the per-voice export shortcut in the narrator card menu for quick access while making the primary path easier to discover.
- Updated the Phase 8 handoff memory and plan to reflect the discoverability fix, then re-verified the frontend voice portability test slice and build.
- Checkpoint commit created and pushed: `b2f6211 Make voice export/import more discoverable`.

# 2026-04-24 - Phase 8 Diagnostic Audit and Cleanup Verified

- Conducted a comprehensive audit of engine and plugin diagnostics, ensuring accuracy and schema-driven reporting.
- Neutralized misleading legacy terminology by renaming "Safe Mode" to "Stability Mode" in the Settings UI and updating its description to reflect text cleaning for engine stability.
- Verified that structural legacy paths (e.g., "repair", "backfill") are correctly isolated as system maintenance utilities and do not leak into the user-facing diagnostics.
- Confirmed that performance metrics (ETA) training is strictly restricted to successful "done" jobs, and that progress sentinel hacks (e.g., "0.01") have been removed.
- Verified that the "None / Default" character selection tool correctly implements a "No-Op" policy for character assignments.

# 2026-04-24 - Project Snapshot And Export Foundation Checkpointed

- Implemented and checkpointed the project snapshot and export manifest foundation in `app/domain/projects/service.py`, `app/domain/projects/exports.py`, and `app/api/routers/projects.py`.
- Added narrow `/api/projects/{project_id}/snapshots` and `/api/projects/{project_id}/export-manifest` endpoints backed by SQLite repositories inside the projects router.
- Verified the export foundation with the focused project route tests and a direct endpoint probe against a live `TestClient`.

# 2026-04-24 - Phase 8 Queue Drawer Slice Verified

- Rewrote the Phase 8 and Phase 9 plans so Phase 8 starts with shell/product hardening and the queue companion drawer, while Phase 9 remains external plugin/API ecosystem work.
- Reviewed and integrated the Antigravity queue drawer patch, then tightened the project queue-all path so it opens the drawer directly through a shell callback instead of relying on `/queue` navigation.
- Verified the focused App/Layout/Queue/ProjectActions/navigation suite, frontend production build, and `git diff --check`.
- Manual QA passed and checkpoint commit created: `a9ab814 Move queue into companion drawer`.

# 2026-04-23 - Phase 7 Handoff Prepared

- Checked the Phase 7 plan, working tree, and handoff memory after checkpoint `10e5c4c Tighten voice gating and disabled voice tabs`.
- Updated the Phase 7 plan wording so SettingsTray is treated as retired, not migrated, and marked the phase as ready for handoff/closeout.
- Refreshed `Memory/active_context.md`, `Memory/state.json`, and `Memory/new_session_handoff.md` so future sessions start from “Phase 7 complete” instead of stale in-progress settings/plugin slices.

# 2026-04-23 - General Tab Helper Notice Removed

- Removed the explanatory helper notice from the General settings tab so the tab now relies on the visible tab labels instead of in-panel routing guidance.
- Verified the focused settings and app-shell tests, plus the frontend build and lint.

# 2026-04-23 - General Maintenance Actions Trimmed

- Removed the redundant General settings maintenance section from the tabbed Settings surface.
- Left the queue page’s Clear Completed / Clear All actions as the canonical queue-management controls and left the shell-level refresh behavior intact.
- Verified the focused settings and app-shell tests, plus the frontend build and lint.

# 2026-04-23 - General Settings MP3 Flag Removed

- Removed the obsolete General settings MP3 toggle and the old backfill card from the tabbed Settings surface.
- Left job-level MP3 render/export behavior intact so chapter export and render plumbing continue to work.
- Fixed the legacy `/settings` compatibility handler so it no longer passes `make_mp3` into settings persistence.
- Verified the focused backend and frontend settings tests, plus the frontend build and lint.

# 2026-04-23 - Install Plugin Action Completed

- The Install Plugin action is now wired into the TTS Engines settings surface, using a guided manual install flow with explicit refresh guidance.
- The legacy SettingsTray file was deleted, and the tabbed settings surface is now the only settings entry point.
- The next slice is verification checklist reconciliation and phase closeout.

# 2026-04-23 - Engine Action Buttons Completed

- The engine-card action bar is now complete and surfaced in the TTS Engines settings tab.
- The remaining open settings items are Install Plugin action and any final tray cleanup if still needed.

# 2026-04-23 - General Settings Cleanup Completed

- The remaining General settings tab cleanup was completed in the worker summary.
- The tabbed Settings surface now carries the leftover tray-era maintenance controls and default voice selection cleanly inside the General tab.
- The next slice is engine action buttons and plugin management actions.

# 2026-04-23 - Project Navigation Slice Completed

- The project-local navigation and chapter-to-chapter movement slice was completed in the worker summary.
- Project surfaces now derive navigation from the route shell and chapter movement uses URL-driven state.
- The next slice is the remaining settings cleanup and engine action buttons.

# 2026-04-23 - Preview/Test Voice UI Refactor Completed

- The voice preview and test surfaces were refactored to use the generic registry-driven model with readiness hooks and dynamic capability metadata.
- The worker summary reports the preview/test UI tests passed and the branch stayed clean.
- The next slice is project-local navigation and chapter-to-chapter movement.

# 2026-04-23 - Plugin Hook Contract Fully Pushed

- The hook contract for voice plugin processing stages is now hardened, documented, and pushed.
- The repository environment has been updated to `python-multipart 0.0.26`, which addresses the Dependabot advisory on the current branch.
- The next slice is the preview/test voice UI aligned to the new voice model.

# 2026-04-23 - Hook Contract Docs Synced Locally

- Hardened the plugin hook contract and confirmed the guide/template now mirror the current hook stages and contributor expectations.
- The public-facing plugin docs now cover the current planning, request-shaping, voice-selection, and postprocessing contract, and the template engine mirrors that contract with a concrete example.
- The work is verified locally but not yet checkpointed.

# 2026-04-23 - TTS Plugin Docs And Template Added

- Added `docs/plugin-guide.md` to document the current TTS plugin contract, hook stages, settings schema expectations, testing flow, and security boundaries for third-party plugin authors.
- Added `docs/plugin-template/` with a minimal manifest, settings schema, engine skeleton, and contributor README so new plugin authors have a copyable starting point.
- Verified the template engine file with a syntax compile check.

# 2026-04-23 - Voice Filter Labels and Cloud Fallbacks Pushed

- Fixed the `VoicesTab` engine filter pill labels so they fall back to a readable engine name instead of `undefined` when registry metadata omits `display_name`.
- Tightened `NarratorCard` and `VariantEditor` so Voxtral is still treated as a cloud engine when the engine registry fixture omits `local`, which restores the expected XTTS-vs-cloud control split in the voice UI tests.
- Verified the focused voice test bundle, the frontend production build, and repo lint (existing warnings only).
- Checkpoint commits created: `f6e2d50 Fix voice engine filter labels`, `208a4af Fix cloud voice control fallbacks`.

# 2026-04-23 - Plugin Hook Contract Is Next

- The plugin-level enable/disable contract is verified and pushed, and the new next slice is to make encoder-specific audio logic pluggable through stage hooks rather than special-casing XTTS/Voxtral in the core app.
- The goal for the next slice is a flexible hook contract for chunk sizing, speed, voice selection, emotion, and postprocessing, with the plugin owning the special behavior.

# 2026-04-22 - Plugin Enablement Contract Verified

- Promoted the Voxtral-specific enablement flow to a generic engine-level toggle in the Settings/Voices surfaces, then restored legacy Voxtral compatibility in the voice and settings API paths.
- Kept the Voxtral cloud API key/model/help/privacy metadata inside the plugin-owned schema flow while removing the old tray-based activation affordance from the app shell.
- Verified the backend voice/system/refactor suites, the focused Settings/Voices frontend suites, the frontend production build, and the frontend lint pass (existing warnings only).
- The slice is locally verified and ready to checkpoint/push.

# 2026-04-22 - Legacy Settings Tray Removed

- Removed the old upper-right `SettingsTray` from the app shell so the tabbed Settings surface is now the only active settings entry point.
- Kept the new Settings tabs, deep-link routing, and Voxtral plugin metadata intact.
- Verified the cleanup with the focused App and SettingsRoute test suites, the frontend production build, and repo lint (warnings only).
- Checkpoint commit created: `6a26d28 Remove legacy settings tray`

# 2026-04-22 - Voxtral Toggle Semantics Reframed

- The user clarified that the Voxtral ON/OFF switch should represent the installed plugin's enablement state, not a Voxtral-only feature flag.
- The toggle should let Studio ignore disabled plugins entirely and keep unverified plugins off until they pass verification.
- The next implementation slice should convert the toggle semantics across the settings/plugin path and update the related engine gating logic.

# 2026-04-22 - Settings Reload Bug Is Vite-Side on 5173

- The user confirmed that hard reload on `8123` works, but hard reload on the Vite dev server at `5173` still fails.
- The remaining blocker is now clearly on the frontend dev-server side: the browser is still ending up with the built hashed asset path instead of the live Vite module graph.
- Next work should inspect the Vite dev-server startup and any HTML/base-path/caching behavior that would cause `5173` to reference `/assets/index-*.js`.

# 2026-04-22 - Settings Hard-Reload Parity Still Open

- The user confirmed that `/settings` and its sub-tabs still hard-reload to a white page / 404 behavior, unlike the Voices and Queue tabs.
- The Voxtral plugin-owned help/privacy metadata fix is complete, but the remaining blocker is route/runtime parity for Settings reloads.
- Next work should compare the Settings route and its server shell handling against the Voices/Queue paths that already survive hard refreshes.

# 2026-04-22 - Plugin-Owned Voxtral Schema Metadata Exposed

- Moved the Voxtral help/privacy copy onto plugin-owned schema metadata so the TTS Engines card can render plugin-specific instructions even when the engine class does not expose its own schema.
- Taught the TTS Server plugin loader and engine detail builder to prefer `settings_schema.json` from the plugin folder as a fallback contract, keeping plugin-provided metadata visible in the Settings UI.
- Tightened the Voxtral metadata panel in the frontend so the help link and privacy callout are more prominent inside the engine card.
- Verified the plugin-loader/backend fallback path with focused pytest coverage and re-ran the SettingsRoute vitest suite plus the frontend production build.
- Checkpoint commit created: `00c8da7 Expose plugin-owned engine schema metadata`

# 2026-04-22 - Settings Routing and Voxtral Placement Fixed

- Normalized Settings route deep links so trailing-slash refreshes stay on the intended sub-tab instead of white-screening or falling back unexpectedly.
- Moved the Voxtral Mistral API key, Voxtral model, and enable toggle back under the Voxtral engine card, and turned the API tab into a read-only integration guidance surface.
- Kept the About tab diagnostics and TTS Engines schema-driven cards intact.
- Verified with the focused SettingsRoute test suite and the frontend production build, then checkpointed the fix in commit `2b2e179 Fix settings deep links and Voxtral controls`.

# 2026-04-22 - Phase 7 About Tab Checkpointed

- Restored the About tab in the tabbed Settings surface so it now shows live Studio version, TTS Server connectivity, engine count, and runtime diagnostics.
- Wired the tab to the `/api/home` payload and the engine registry so the readouts reflect live backend state.
- Verified the slice with the focused SettingsRoute test suite, the backend system API tests, and the frontend production build.

# Session Logs

# 2026-04-22 - API Settings Tab Checkpointed

- Restored the API settings tab in the new tabbed Settings surface, bringing back the Voxtral and Mistral controls and wiring them through the existing settings endpoint.
- Added a Default Engine selector to the General tab so new synthesis defaults can still be adjusted from the Settings page.
- Verified the slice with the frontend build and focused SettingsRoute tests, then checkpointed it in commit `7e40ad2 Restore API settings tab`.

# 2026-04-22 - TTS Engines Docs Correction Committed

- Corrected the Phase 7 plan file so the "Install Plugin" button is treated as a later placeholder while "Refresh Plugins" remains the implemented action.
- Checkpointed the docs correction in commit `c79b13c Clarify TTS Engines install action status`.

# 2026-04-22 - TTS Engines Settings Shell Checkpointed

- Checkpointed the TTS Engines tab shell as commit `1ed994f Add TTS Engines settings shell`.
- The slice now includes the backend engines API/router, the schema-driven settings panel, focused frontend tests, and the new backend API coverage.
- The repo is clean after the checkpoint and the next voice/settings slice is the remaining settings tabs and tray migration work.

# 2026-04-22 - TTS Engines Settings Shell Landed Locally

- Implemented the TTS Engines tab shell for the Phase 7 settings surface with collapsible engine cards, schema-driven settings forms, status badges, plugin refresh, and cloud-engine disclosure.
- Added backend engine management routes and bridge hooks so the settings UI can list engines, persist engine-specific settings, and trigger plugin refreshes.
- Verified the updated backend import path with a direct `import app.web` smoke check and re-ran the frontend production build successfully.
- The work is currently still in the dirty worktree and has not yet been checkpointed.

# 2026-04-22 - TTS Engines Settings Shell Verified

- Completed the TTS Engines tab shell for the Phase 7 settings surface with collapsible engine cards, schema-driven settings forms, status badges, plugin refresh, and cloud-engine disclosure.
- Added backend engine management routes and bridge hooks so the settings UI can list engines, persist engine-specific settings, and trigger plugin refreshes.
- Added focused backend and frontend tests for the new engines route and settings surface, then verified with the frontend build.
- The current local slice is verified and ready for checkpointing.

## 2026-04-22 - Phase 7 Playback Highlight Polish and Push Finalized

- Made Script view playback highlight the full active render batch instead of only the first span.
- Kept Book view underline-only for assignment and restored the Script-mode gutter accent as a continuous full-height cue.
- Fixed the pre-push lint fallout in `app/domain/chapters/compatibility.py` and `frontend/src/components/chapter/ScriptView.tsx`, then repushed the branch.
- Verified the final branch tip with the repo's pre-push validation and a clean push to `origin/studio2/phase-7`.

## 2026-04-22 - Phase 7 Source Text Resync Preview Verified

- Implemented and verified the read-only source-text resync preview endpoint and the explicit commit workflow in the chapter editor.
- Confirmed auto-save suppression in the Source Text tab, the preview modal's destructive-change messaging, and the refresh of chapter text, script view, and production blocks after commit.
- Kept the Script painting, range selection, compaction, and cleanup flows isolated from the resync path.

## 2026-04-21 - Worker Observability Cleanup Committed

- Replaced silent worker fallback paths in `app/jobs/worker.py` with explicit debug logging so ETA and asset fallback behavior is visible in production logs.
- Added a README note explaining the `.gitignore` protection behavior for existing users who may still track local data directories or `state.json`.
- Verified the cleanup with focused backend and frontend tests, then checkpointed it in commit `ce14990 Improve worker fallback observability`.

## 2026-04-20 - Performance Retention Hot Path Removed

- Moved render performance retention cleanup fully out of the per-sample hot path and into startup initialization.
- Kept worker fallback paths observable with debug logging and preserved explicit hydration timestamp units in the frontend seam.
- Verified the maintenance hardening with focused backend and frontend tests, then checkpointed it in commit `0cf21e7 Move performance retention to startup`.

## 2026-04-20 - Handoff Snapshot Refreshed for Navigation Realignment

- Updated `Memory/state.json` and `Memory/active_context.md` so future sessions see the visible navigation realignment checkpoint `9662cb2 Refine project chapter breadcrumb navigation` as the current branch state rather than the older cleanup checkpoint as final state.
- Updated `Memory/new_session_handoff.md` with the current breadcrumb expectations, commit/push policy, and stronger dirty-worktree guidance.
- Updated `Memory/gemini_handoff_template.json` so future Antigravity/Gemini prompts include current known state and all core memory files by default.

## 2026-04-19 - Handoff Discipline Tightened

- Updated the shared handoff rules so Codex defaults to local handling for small or tightly coupled fixes, and so Antigravity/Gemini prompts must explicitly name the memory files to read, the exact files in scope, the non-goals, and the verification commands.
- Reflected the same guidance in the active context snapshot so future threads can reuse the lesson without re-deriving it from chat history.

## 2026-04-19 - Commit Threshold Clarified

- Added a durable rule that verified coherent blocks should be checkpointed with a commit without waiting for extra permission, while pushes should remain reserved for stable checkpoints or explicit user requests.
- Reflected that commit/push threshold in the active context snapshot so future sessions can decide more cleanly when to checkpoint versus when to keep iterating.

## 2026-04-18 - Route-Level Project Shell Boundary Wired

- Introduced `frontend/src/features/project-view/routes/ProjectViewRoute.tsx` as the route-local shell boundary for project surfaces.
- Threaded route-derived shell state into `frontend/src/components/ProjectView.tsx` and rendered project breadcrumbs from the shared shell model in `frontend/src/components/project/ProjectHeader.tsx`.
- Aligned breadcrumb click behavior with the breadcrumb hrefs instead of sending every breadcrumb click home.
- Extended the app home payload in `app/api/routers/system.py` and the shared frontend `GlobalState` type so project titles are available for breadcrumb resolution.
- Added route-level and project-view coverage, then verified with:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/components/ProjectView.test.tsx src/test/App.test.tsx src/components/Layout.test.tsx src/app/navigation src/app/layout src/features/project-view/routes/ProjectViewRoute.test.tsx`
  - `cd frontend && /opt/homebrew/bin/npm run build`
  - `./venv/bin/python -m pytest tests/test_api_system.py tests/test_api_projects.py -q`

## 2026-04-18 - Shell Hydration Semantics Stabilized

- Refined the shell hydration model so connected steady-state sessions report `ready` instead of lingering in `refreshing`.
- Added explicit transient refresh tracking in `frontend/src/App.tsx` so `bootstrap`, `reconnecting`, `recovering`, and `refreshing` only appear during real active windows.
- Kept the visible shell compatibility boundary intact while continuing to map project surfaces to the current Library tab.
- Extended focused frontend tests to cover idle `ready`, transient refresh/reconnect states, and shell-root hydration markers.
- Verified the affected frontend tests and production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/test/App.test.tsx src/components/Layout.test.tsx src/app/navigation src/app/layout`
  - `cd frontend && /opt/homebrew/bin/npm run build`

## 2026-04-18 - Shell Snapshot Wired Into Visible App Boundary

- Threaded `createStudioShellState` into `frontend/src/App.tsx` so the app shell snapshot is derived centrally from pathname, loading, websocket connection, and reconnect state.
- Updated `frontend/src/components/Layout.tsx` to consume the shell snapshot through a compatibility-safe prop while preserving the existing visible fallback behavior for project surfaces.
- Added accessible state hooks for the header tabs and a `data-shell-hydration` marker on the layout root for lightweight verification.
- Added/updated focused frontend tests for the shell/navigation boundary.
- Verified the affected frontend tests and production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/components/Layout.test.tsx src/app/navigation src/app/layout`
  - `cd frontend && /opt/homebrew/bin/npm run build`

## 2026-05-01 - Phase 11 Handler Generator Migration Verified

- Migrated XTTS, Voxtral, and mixed job handlers to call the Studio 2.0 bridge instead of direct legacy generator helpers.
- Added `app/jobs/handlers/bridge_helpers.py` as a narrow bridge wrapper for legacy-shaped job handlers while preserving v2 as the runtime boundary.
- Wired script payload support through `TtsClient`, `SynthesizeRequest`, `TTSRequest`, and the XTTS plugin so multi-segment chapter renders can still use batch generation behind the TTS Server boundary.
- Preserved Voxtral `reference_sample` and model selection through bridge settings extraction and plugin handling.
- Updated XTTS and mixed handler tests to mock bridge calls and assert script payloads instead of old temp JSON generator calls.
- Verified:
  - `./venv/bin/python -m pytest tests/test_mixed_handler.py tests/test_voxtral.py tests/test_tts_sdk.py tests/test_xtts_plugin_script.py tests/test_xtts_handler.py tests/test_jobs_xtts_extended.py tests/bridge/test_bridge_registry.py tests/test_bridge_tts_server.py tests/test_api_engines.py tests/test_domain_contracts.py -vv`
  - `rg -n "xtts_generate|xtts_generate_script|voxtral_generate|engines_voxtral|xtts_utils" app/jobs/handlers app/orchestration/tasks`
  - `git diff --check`

## 2026-04-30 - Phase 11 V2 Cutover Flags Removed

- Removed the final `USE_V2_*` runtime switch by deleting `USE_V2_ENGINE_BRIDGE` branching from `app/jobs/worker_voice.py`.
- Deleted `app/core/feature_flags.py` and its dedicated tests because no runtime feature-flag cutover behavior remains.
- Updated voice worker tests so voice build/test jobs assert the v2 bridge path directly for XTTS and Voxtral profiles.
- Verified the focused backend slice:
  - `./venv/bin/python -m pytest tests/speaker/test_worker.py tests/test_synthesis_task_and_resources.py tests/test_api_voices_actions.py tests/test_domain_contracts.py -vv`
  - `rg -n "USE_V2_|is_feature_enabled\(|feature_flags|USE_TTS_SERVER|USE_STUDIO_ORCHESTRATOR|use_tts_server\(|use_studio_orchestrator\(" app tests`
  - `git diff --check`
- Remaining migration surface: direct legacy generator calls in chapter render/job handlers should be audited next and migrated where v2 is not yet the source of truth.

## 2026-04-19 - Project Subnavigation Surface Wired

- Added the reusable `frontend/src/components/project/ProjectSubnav.tsx` surface and wired it into the project view chrome above the existing chapter/character content.
- Extended the shared shell model so route-derived project state includes an explicit active project subnav id and the corresponding tab metadata.
- Kept project breadcrumb behavior intact while the route-level project shell continues to act as the compatibility seam.
- Verified the affected frontend tests and production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/components/ProjectView.test.tsx src/features/project-view/routes/ProjectViewRoute.test.tsx src/components/project/ProjectSubnav.test.tsx src/test/App.test.tsx src/components/Layout.test.tsx src/app/navigation src/app/layout`
  - `cd frontend && /opt/homebrew/bin/npm run build`
- Checkpoint commit created: `3aae1a3 Wire project subnavigation into route shell`

## 2026-04-19 - Route Transition Hardening Committed

- Carried the queue hydration source through `useQueueSync` so the app shell can distinguish bootstrap, reconnect, and refresh windows more accurately.
- Added explicit project transition remounting in `frontend/src/App.tsx` so moving between projects clears stale project-local state before the next fetch lands.
- Tightened `ProjectViewRoute` hydration coverage and updated `ProjectView` tests to use resilient async assertions.
- Verified the affected frontend tests and production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/components/ProjectView.test.tsx src/features/project-view/routes/ProjectViewRoute.test.tsx src/components/project/ProjectSubnav.test.tsx src/test/App.test.tsx src/components/Layout.test.tsx src/app/navigation src/app/layout`
  - `cd frontend && /opt/homebrew/bin/npm run build`
- Checkpoint commit created: `b80a82e Harden project route transitions`

## 2026-04-19 - Queue Hydration Source Tracking Committed

- Added `useQueueSync` coverage for bootstrap, reconnect, refresh, and idle-ready hydration source behavior.
- Wired the queue hydration source through `App.tsx` and stabilized the shell hydration precedence so reconnect recovery and manual refresh windows remain explicit.
- Added a manual `Refresh All Data` action in `SettingsTray` to create a visible refresh window in the shell during testing and use.
- Extended `Layout`, `GlobalQueue`, and `App` tests to prove the queue badge and shell hydration remain aligned.
- Verified the affected frontend tests and production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/hooks/useQueueSync.test.tsx src/api/hydration/index.test.ts src/test/App.test.tsx src/components/Layout.test.tsx src/components/GlobalQueue.test.tsx src/app/navigation src/app/layout`
  - `cd frontend && /opt/homebrew/bin/npm run build`
- Checkpoint commit created: `51bed70 Harden queue hydration source tracking`

## 2026-04-19 - Queue Route Cutover Committed

- Converted `frontend/src/features/queue/routes/QueueRoute.tsx` from a placeholder into the route owner for `/queue`.
- Wired `frontend/src/App.tsx` to render the queue page through the route boundary while preserving the existing `GlobalQueue` UI and queue merge state.
- Aligned `QueueRoute` hydration behavior with the shared shell model and added focused route coverage for queue navigation and hydration states.
- Verified the affected frontend tests and production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/features/queue/routes/QueueRoute.test.tsx src/test/App.test.tsx src/components/Layout.test.tsx src/components/GlobalQueue.test.tsx src/app/navigation src/app/layout src/features/project-view/routes/ProjectViewRoute.test.tsx`
  - `cd frontend && /opt/homebrew/bin/npm run build`
- Checkpoint commit created: `d5344ec Cut over queue route boundary`

## 2026-04-19 - Phase 6 Checklist Synced After Audit

- Audited the Phase 6 implementation against the phase plan and confirmed the product deliverables are complete.
- Updated `plans/phases/phase_6_frontend_foundations.md` so the checklist and verification state match the current code and test coverage.
- Confirmed the remaining phase work is cleanup/push-level rather than feature implementation.
- Checkpoint commit created: `4338d26 Mark Phase 6 checklist complete`

## 2026-04-19 - Phase 6 Cleanup Polish Committed

- Split the large `frontend/src/components/SettingsTray.tsx` popover into smaller internal sections so the file is easier to follow without changing behavior.
- Replaced the brittle pathname split in `frontend/src/App.tsx` with `useMatch` for project title lookup.
- Verified the cleanup with focused frontend tests and a successful production build:
  - `cd frontend && /opt/homebrew/bin/npx vitest run src/test/App.test.tsx src/components/Layout.test.tsx src/features/queue/routes/QueueRoute.test.tsx src/features/project-view/routes/ProjectViewRoute.test.tsx`
  - `cd frontend && /opt/homebrew/bin/npm run build`
- Checkpoint commit created: `fcece3c Polish Phase 6 cleanup seams`

## 2026-04-18 - Shared Memory Protocol Initialized

- Added `Memory/rules.md` as the durable source of truth for Codex/Antigravity collaboration, product constraints, prompt construction, and verification rules.
- Updated `Memory/state.json` into a machine-readable Project State Snapshot with current branch, recent commits, active constraints, verification status, and next steps.
- Refreshed `Memory/active_context.md` to describe the current handoff state after the progress/ETA push.
- Corrected `Memory/tech_stack.md` to reflect the actual React/Vite frontend stack and current verification commands.
- Added `Memory/gemini_handoff_template.json` for compact JSON worker prompts.
- Added `Memory/new_session_handoff.md` as the single file the user can paste into a fresh Codex session to bootstrap context recovery and Antigravity/Gemini delegation behavior.
- Confirmed `/Memory/` is ignored in `.gitignore`, so this remains local shared memory and does not enter product commits.
- Marked `Memory/state.json` as `handoff_ready` after confirming the git worktree was clean.

## 2026-04-18 - Progress/ETA Storage and Hook Stabilization

- Migrated render performance history to SQLite `render_performance_samples`.
- Added compatibility migration from legacy `state.json` and legacy DB settings JSON blobs.
- Fixed pre-push hook blockers in backend and frontend tests.
- Verified and pushed branch `studio2/phase-6`.
- Recent commits:
  - `abaab8a Move render performance history to database`
  - `e4be987 Fix progress hook test expectations`
## 2026-05-01 - Phase 11 Plugin Behavior Cutover Planned

- Recorded the next Phase 11 cleanup slice at `plans/implementation/phase_11_plugin_behavior_cutover.md`.
- User review identified remaining app-level engine-name coupling after the v2-only bridge migration: behavior decisions should use plugin-declared behavior rather than hardcoded `voxtral`/`xtts` checks.
- Updated memory to treat the handler generator migration as checkpointed through `126aac9` and to make the plugin behavior helper the next implementation focus.
- Chosen direction: hard cutover for new behavior logic, with legacy stored fields read only as migration inputs where needed to avoid data loss.

## 2026-05-01 - Plugin Behavior Foundation Verified

- Added a small plugin behavior helper and behavior metadata for the XTTS and Voxtral plugins.
- Migrated engine enablement required-setting checks and bridge synthesis setting aliases away from direct Voxtral behavior branches.
- Added focused tests proving future-plugin metadata can drive enablement and setting extraction.
- Verified with `./venv/bin/python -m pytest tests/test_engine_behavior.py tests/test_api_engines.py tests/bridge/test_bridge_registry.py tests/test_bridge_tts_server.py tests/test_api_voices_actions.py tests/test_domain_contracts.py -vv` and `git diff --check`.

## 2026-05-01 - Orchestration Behavior Cutover Verified

- Integrated Antigravity-reviewed behavior-driven changes across generation, queue, worker, state, voice engine resolution, and mixed/standard bridge routing.
- Added the generic voice asset endpoint while leaving the Voxtral-named endpoint as a thin compatibility wrapper.
- Kept the explicit XTTS worker path classified as an intentional strategy branch for the optimized local handler.
- Verified with `./venv/bin/python -m pytest tests/test_api_generation.py tests/test_api_utils_extended.py tests/test_db_queue.py tests/test_jobs.py tests/test_api_voices_actions.py tests/test_speaker_profiles.py tests/speaker/test_worker.py -vv`: 88 passed.
- Verified `./venv/bin/python -m pytest tests/test_api_voices_actions.py tests/test_speaker_profiles.py tests/speaker/test_worker.py -vv`: 44 passed.
- `git diff --check` passed after trimming trailing whitespace in `app/api/routers/generation.py`.

## 2026-05-01 - Legacy Engine Implementation Relocation Verified

- Relocated the old app-level Voxtral and XTTS implementation modules behind adapter package boundaries.
- Confirmed no remaining `engines_voxtral` or `xtts_utils` references in `app`, `plugins`, or `tests`.
- Verified relocation targets with `./venv/bin/python -m pytest tests/test_voxtral.py tests/test_engines.py tests/test_jobs.py -vv`: 41 passed.
- Verified affected API/queue/voice suite with `./venv/bin/python -m pytest tests/test_api_generation.py tests/test_api_utils_extended.py tests/test_db_queue.py tests/test_api_voices_actions.py tests/test_speaker_profiles.py tests/speaker/test_worker.py -vv`: 80 passed.
- `git diff --check` passed.

## 2026-05-01 - UI And Default Label Cleanup Verified

- Integrated the Antigravity cleanup for generic legacy dashboard labels and default engine metadata.
- Generalized dashboard wording from XTTS-specific labels to audio/default-engine labels while preserving the existing `xtts_audio` storage path to avoid hiding previous outputs.
- Migrated default speaker speed reads from `xtts_speed` to `speed`, with a compatibility shim for existing settings.
- Verified with `./venv/bin/python -m pytest tests/test_state_rules.py tests/test_jobs.py tests/test_production_ux.py tests/test_api_generation.py tests/test_api_voices_actions.py tests/test_speaker_profiles.py -vv`: 78 passed.
- `git diff --check` passed.

## 2026-05-01 - Phase 11 Plan Realigned

- Reviewed Antigravity planning files for organizational cleanup and engine-agnostic conversion.
- Updated `plans/phases/phase_11_v2_only_runtime_cleanup.md` to reflect that Phase 11 remains active and now includes engine-agnostic cleanup beyond the initial fallback removal work.
- Added guardrails against unsafe hard deletions or public route renames: preserve `xtts_audio`, `/out/xtts`, compatibility shims, and user-data paths until aliases/migrations are verified.
- `git diff --check` passed for the documentation update.

## 2026-05-01 - Phase 11 Hard Cutover Direction Clarified

- User clarified the desired direction is a hard engine-agnostic cutover, not compatibility-first cleanup.
- Main app code should not mention specific engine names; engine identity belongs in plugins, plugin manifests/schemas, plugin-internal adapters, meaningful tests, or explicitly approved migration scripts.
- Legacy support/backwards compatibility should be removed rather than preserved unless the user explicitly approves an exception.
- `xtts_audio/` is engine-test residue, not protected project storage, and may be removed once references are migrated or deleted.

## 2026-05-01 - Worker Registry Slice Corrected

- Reviewed the claimed job-dispatch registry slice and confirmed main-app engine-name seams still exist in `app/jobs/worker.py` and `app/jobs/registry.py`.
- Corrected `plans/implementation/phase_11_v1_cleanup_inventory.md` so Slice B is marked partial instead of complete.
# 2026-05-03 - Phase 11 Legacy Runtime Purification Audit (In Progress)

- [CORRECTION] Previous session claim of "Purification Completed" was premature.
- Commenced a stricter audit for active-runtime legacy/v1/compatibility logic outside migration modules.
- Identified remaining blockers in `app/web.py` (/api/v1/tts), `app/api/routers/generation.py`, `app/db/chapters_cleanup.py`, `app/domain/voices/repository.py`, and orchestration/reconciliation paths.
- Enforcing a "v2-native only" core by classifying and removing/migrating these lingering seams.
# 2026-05-04 - Phase 11 Slice X Stabilization Verified

- Stabilized the Slice X worker-decommission cleanup, ensuring a green test state across core orchestration, API, and speaker infrastructure.
- Restored the "Clean Slate Protocol" by migrating `requeue` state-reset logic to `app/state_jobs.py` and shimming it in `app/jobs/__init__.py`.
- Updated `app/jobs/worker_metrics.py` and `tests/test_startup_eta.py` to point to the new V2 ETA and progress utilities in `app/orchestration/scheduler/eta.py`.
- Verified all focused test suites (61 + 45 + 21 = 127 tests) passed, confirming stability for queue, jobs, generation, assembly, and speaker profiles.
- Confirmed frontend build integrity with a successful `npm run build` in the `frontend/` directory.
- Achieved full alignment with the Studio 2.0 V2 architecture, removing active runtime dependencies on the legacy `app.jobs` worker loop.

# 2026-05-04 - Plugin Verification Stabilized

- Investigated manual QA issue where XTTS and Voxtral settings pages showed unverified and failed verification.
- Verified Antigravity's loader/import fixes locally and patched the remaining deleted-worker import in `app/jobs/worker_voice.py` from `.speaker` to `app.db.speakers`.
- Confirmed no remaining imports of deleted `app.jobs.core`, `app.jobs.worker`, `app.jobs.speaker`, or `app.jobs.reconcile` outside isolation tests and explicit forbidden-import lists.
- Verified `tests/test_api_engines.py`, `tests/test_bridge_tts_server.py`, `tests/bridge/test_bridge_registry.py`, and `tests/test_engines.py`: 32 passed.
- Verified plugin suites under `plugins/tts_xtts/tests` and `plugins/tts_voxtral/tests`: 40 passed.
- Verified voice/generation suites: 43 passed.
- `ruff check .`, `git diff --check`, and `frontend npm run build` passed. The frontend build still reports the expected Vite chunk-size warning.

# 2026-05-04 - Voice Rebuild Render Timing Contract Narrowed

- Patched marker-driven voice rebuild dispatch so `preparing` no longer publishes render `eta_seconds`, `estimated_end_at`, or `started_at`.
- Render timing now anchors on `[START_SYNTHESIS]` or first real positive progress, keeping model-loading/preparation time out of render duration metrics.
- Verified focused timing/progress suites: `tests/test_watchdog_progress_logic.py`, `tests/test_studio_task_progress.py`, `tests/test_job_timing.py`, and `tests/test_api_queue.py` passed.
- `ruff check` and `git diff --check` passed for the narrowed patch.

# 2026-05-07 - Phase 11 Reported Regression Triage

- Accepted verified fixes for reported regressions: engine settings test sample fallback, plugin `test_text`, Library project-list performance, blank enqueue enablement message, duplicate frontend keys, and failed queue timestamps.
- Verified mixed synthesis diagnostic patch: `handle_mixed_job` now returns `(status, message)` and `SynthesisTask.run()` propagates detailed mixed-handler errors instead of overwriting them with `Mixed synthesis returned failed`.
- Added an end-to-end API regression that drives `/api/processing_queue` through the orchestrator and mixed handler with mocked audio primitives; focused verification passed with 72 tests across `plugins/synthesis_mixed/tests/test_mixed_handler.py`, `tests/test_synthesis_task_and_resources.py`, and `tests/test_api_generation.py`.
- Manual QA remains required: retry chapter render and capture the now-detailed error if mixed synthesis still fails.

# 2026-05-07 - Shutdown Reloader Stall Cleanup

- Added conservative startup cleanup for orphaned `tts_server.py` processes to reduce the chance of stale subprocesses carrying into a new Studio launch.
- Shortened watchdog shutdown waits so Ctrl-C does not sit at `Stopping reloader process` as long.
- Verified focused shutdown/bootstrap coverage: `tests/test_boot.py` and `tests/test_engines.py` passed (22 tests total), with `ruff check` and `git diff --check` clean.
- Manual QA remains required: start the server and stop it once with Ctrl-C to confirm the reloader exits without needing a second interrupt.

# 2026-05-07 - TTS Runtime Marker Recorded

- Added a transient watchdog runtime marker under `TRANSIENT_DIR` so startup can verify whether a leftover TTS Server process is ours before killing it.
- The marker stores PID, port, host, server script, and plugins path, and it is cleared on clean shutdown.
- Reverified the startup/shutdown path with `tests/test_boot.py` and `tests/test_engines.py` (23 passed), plus `ruff check` and `git diff --check`.

# 2026-05-08 - Chapter Load Timing Probes Added

- Added dev-only timing probes to `ProjectView`, `useChapterLoader`, and `useChapterQueue` so project and chapter load latency can be inspected from the browser console.
- Parked the VCR-style playback controls request on the Phase 11 task board instead of turning it into a side quest during the load/debug pass.
- Verified the frontend still builds cleanly after the instrumentation changes.

# 2026-05-08 - Project Detail Timing Instrumented

- Added backend timing logs around `GET /api/projects/{project_id}` and `get_project()` so we can distinguish migration time from DB lock wait time and row fetch time.
- Verified the project API suite and lint on the timing slice.
- Current user timing sample shows the project detail endpoint taking about 4.5 minutes on a large project, so the next pass should inspect the logged breakdown rather than the chapter loader.

# 2026-05-08 - Project Detail Hot Path Removed

- Removed implicit V2 migration from `GET /api/projects/{project_id}` so project reads stay read-only and no longer walk the chapter tree during normal navigation.
- Added a regression proving project list and project detail endpoints do not invoke migration on read.
- Verified the project API suite and lint after the read-path change.

# 2026-05-08 - Chapter Segment Hot Path Optimized

- Cached repeated profile-engine resolution in chunk grouping and switched chapter-segment validation from per-row file existence checks to a single directory scan.
- Added a regression proving chunk grouping only resolves the engine once for repeated profiles.
- Verified the chunk-groups, chapter cleanup, and chapter API regression slices plus lint after the optimization.

# 2026-05-09 - Script Text Render Visualizer

- Replaced the script render text cue from a whole-span gradient fill with per-character lit/cursor rendering for active spans.
- Kept non-rendering spans as plain text so normal chapter text remains lightweight and readable.
- Verified focused frontend coverage: `ScriptView.test.tsx`, `ChapterEditor_Queue.test.tsx`, `ChapterHeader.test.tsx`, `PredictiveProgressBarRendering.test.tsx`, plus `npm run build`.
- Refined the preferred visual style: render-target text stays grey, the active sentence group uses a light warning-yellow highlight, and progress only turns letters back to normal dark text without bolding, glow, or background fill.
- Fixed the batch-progress regression where only the first sentence in a render batch darkened before completion; book mode now wraps adjacent rendering spans in a batch group while keeping per-sentence spans for voice assignment.
- Chapter render progress is distributed across the active render batch's ordered text weights so progress can move continuously through all sentences in the section.
- Added predictive text-progress smoothing from the same job ETA/progress inputs as the header progress bar, with a 100ms chapter render tick so letters advance steadily between websocket updates instead of in bursty sentence chunks.
