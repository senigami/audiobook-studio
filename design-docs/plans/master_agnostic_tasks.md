# Engine-Agnostic Conversion Backlog

`design-docs/plans/final_release/road_to_v2.md` is the active release checklist. This file is the
engine-agnostic historical checklist plus backlog parking lot. If a status conflicts, update
`road_to_v2.md` first, then reconcile this file.

## Phase 1: Directory & Folder Cleanup
- [x] Keep engine test fixtures and tests inside the owning plugin folders.
- [x] Delete the root `engine_tests/` directory.
- [x] Delete `xtts_audio/` transient folder
- [x] Audit `uploads/` and migrate text/covers to project folders
- [ ] Delete `uploads/` (Deferred: `/out/covers` compatibility and shared-cover migration source)

## Phase 2: Storage Abstraction Layer
- [x] Implement `app/storage/manager.py` (`StorageManager`)
- [x] Implement `app/storage/project.py` (`ProjectContext`)
- [x] Migrate pathing logic from `app/config.py` to `StorageManager`
- [x] Update `app/api/routers/chapters_assets.py` to use `StorageManager`
- [x] Complete StorageManager migration for reconcile-era pathing; `app/jobs/reconcile.py` was later deleted in the clean break.
- [x] Remove `XTTS_OUT_DIR` from core runtime config; `AUDIO_OUT_DIR` remains migration-only.

## Phase 3: Declared Plugin Contract
- [x] Update `docs/plugin-guide.md` to define manifest-declared capabilities, behavior, and worker hooks as the default model.
- [x] Update `docs/plugin-template/README.md` to present the template as the canonical declared-hook example.
- [x] Document hook ownership rules in the SDK so new hooks are added through the plugin contract rather than app-side engine branches.
- [x] Ensure `manifest.json` fields are the source of truth for supported behavior.

## Phase 4: Configuration & Models
- [x] Delete `SENT_CHAR_LIMIT` and `SAFE_SPLIT_TARGET` from core config and preserve them as generic behavior fallbacks.
- [x] Relocate the remaining generic baseline CPS fallback out of core config.
- [x] Move engine-specific config to plugin manifests
- [x] Update persisted job engine identity to `str`
- [x] Introduce `TaskType` or `JobKind`

## Phase 5: Plugin Implementation Relocation
- [x] Move `app/xtts_inference.py` -> `plugins/tts_xtts/`
- [x] Move `app/jobs/handlers/xtts*` -> `plugins/tts_xtts/handlers/`
- [x] Move `app/jobs/handlers/voxtral.py` -> `plugins/tts_voxtral/handlers/`
- [x] Implement `parse_progress` and `sanitize_text` categories/overrides in plugin adapters.
- [x] Move resource requirements (GPU/VRAM) to plugin manifests
- [x] Move `sanitize_for_xtts` logic to `plugins/tts_xtts/`

## Phase 6: Core Orchestration Generalization
- [x] Implement `JobHandlerRegistry` in `app/jobs/registry.py`
- [x] Register plugin handlers in the registry without app-level engine names
- [x] Update orchestrator dispatch via registry
- [x] Implement `check_output` interface in plugin adapters
- [x] Close obsolete reconcile hook target: `app/jobs/reconcile.py` no longer exists; check_output runs at the TTS server/bridge edge.
- [x] Update `app/engines/behavior.py` to remove all `is_built_in` checks

## Phase 7: API & Routing
- [x] Rename `mixed.py` -> `composite.py` (Deferred to Phase 13) *(closed N/A 2026-06-11 — no `mixed.py` module exists)*
- [x] Update composite/mixed rendering to use metadata-driven progress and sanitization hooks.
- [x] Remove `/{name}/voxtral-voice-id` route in `app/api/routers/voices_actions.py`
- [x] Remove `/out/xtts/{filename}` route from app routing
- [x] Generalize mixed-render log messages such as `[voxtral-debug]`.
- [x] Remove `app/engines.py` synthesis re-exports
- [x] Sanitize `run.sh` and `run.ps1` (Conflict logic moved to plugin; variables generalized)
- [ ] **Needs owner elaboration: generic plugin setup loop in `run.sh` / `run.ps1`.** This would
  replace one-off install/setup handling with a loop that discovers installed engine/plugin
  manifests and runs each plugin's declared setup/dependency step. Clarify whether this must ship
  before v2.0 or can be deferred until standalone plugin repositories are active.
- [x] Remove hardcoded `"xtts"` defaults in `app/api/routers/generation.py`
- [x] Update all frontend URL references to match active generic routes

## Phase 8: State & Metrics Cleanup
- [x] Rename `xtts_cps` -> `engine_cps` in `app/state_performance.py`
- [x] Rename `xtts_render_history` -> `render_history` in `app/state_performance.py`
- [x] Remove `voxtral_enabled` shim from `app/state_settings.py`
- [x] Remove `xtts_speed` migration logic from `app/state_settings.py`
- [x] Remove `voxtral_voice_id` normalization in `app/db/speakers.py`

## Phase 9: Documentation & Final Audit
- [x] Update `README.md` for generalized engine/plugin install path; full release docs remain in Phase 13.
- [ ] Update `CONTRIBUTING.md` (document plugin lifecycle)
- [x] Final focused `grep` for "xtts" and "voxtral" across core `app/` for Phase 11 closeout
- [ ] Final broad test verification: `pytest tests/` before Phase 13 release docs

## Phase 12: Polish And Cleanup Snapshot
- [ ] Release blocker tracking now lives in `design-docs/plans/final_release/road_to_v2.md`.
- [ ] Remaining engine-agnostic backlog items below should be completed or explicitly deferred before Phase 13.
- [x] Add Library list view and sort options.
- [x] Add VCR-style chapter playback controls.
- [x] Fix voice/plugin dependency installation feedback and XTTS missing-dependencies resolution.
- [x] Add TTS plugin zip import/delete flows (Import done; Uninstall done).
- [x] Define standalone XTTS and Voxtral Web repo readiness for real repo ingestion: repo layout, CLI entry point, dependency install path, and a standalone CLI Builder Harness.
- [x] Implement Studio Dev Mode as the authoritative UI preview path using plugin-provided scenario fixtures.
- [x] Add plugin contract-version and callable-signature compatibility verification against the StudioTTSEngine contract.
- [x] Surface plugin-defined per-voice controls in voice settings when supported.
- [x] Plan multilingual interface localization (file-backed locale catalogs, contributor workflow, and shell/page mappings).
- [x] Implement Voxtral segment and bake rendering for chapter jobs.
- [x] Audit default voice fallback so chapters do not silently default to Voxtral.
- [ ] Revisit voice settings placement outside the Script popup/right queue area.
- [x] Voice metadata A-F complete: HF-aligned bundle export/import, icon upload, searchable tags, structured attributes, Voice Lab catalog UI, and docs. Current release tracking lives in `design-docs/plans/final_release/road_to_v2.md` Stage 4.
- [ ] Complete Taxonomy v2 Phase G: language, accent, style, category-tinted pills/+N overflow, and HF `as-*` tags.
- [ ] Verify system API surface for future third-party/LLM controller plugins.
- [x] Show queue output metadata such as generated audio duration/length.
- [x] Remove legacy Chapter Editor Production, Performance, and Preview tabs/code.
- [x] Rework crowded Chapter Editor menu bar and remove duplicate preparing pill.
- [x] Keep Chapter Editor live queue state anchored to the active job instead of stale completed jobs.
- [x] Scan plans and memory for forgotten requests; namespace rename ideas remain parked in the deferred namespace phase below.
- [ ] Manually verify fixed-but-pending Phase 11 app behaviors.
- [ ] Triage Vite websocket `ECONNRESET` reconnect behavior.
- [ ] Re-check large-book project/chapter load timings.
- [ ] Resolve the generic plugin setup loop question above: implement before v2.0 or explicitly defer until standalone plugin repositories.
- [x] Complete or explicitly defer JobHandlerRegistry, `JobKind`, and mixed/composite naming (mixed renaming deferred to Phase 13).
- [x] Complete or explicitly defer StorageManager and other remaining Phase 12 polish.
- [ ] Prepare plugin docs and template docs enough for Phase 13 release documentation.

## Deferred Architecture: Namespace Rename And App-Behavior Plugins
- [ ] Rename the current engine bundle namespace from `plugins/` to `tts_engines/` once the runtime cutover is stable.
- [ ] Rename any voice/profile bundle namespace that should align with the same naming convention to `tts_voices/`.
- [ ] Reserve a future plain `plugins/` space for non-engine app-behavior extensions once the engine bundle rename is complete.
- [ ] Update docs, plugin templates, and discovery code to distinguish engine bundles from app-behavior plugins.
- [ ] Move engine-owned tests, fixtures, and helper files into the owning engine bundle so XTTS/Voxtral can be extracted as self-contained repos later.


## Known Constraints

- **ChapterEditor at 390px (tablet-minimum):** The ChapterEditor layout stacks columns below 1100px (sidebar moves below content, capped at 40vh). At 390px the editor is functional but dense — full usability at that viewport is not a target for the current release. The Library, Queue, Settings, and Voices pages are fully functional at 390px. This is an accepted constraint documented at design-docs/plans/final_release/07_frontend_themes_and_responsive.md §3.4.

## Observed Backlog (2026-06-11 overnight run — noted while working, not yet scheduled)

### Release-Relevant Checks

- [ ] **Needs owner elaboration: Playwright/axe baseline execution.** Existing decision is axe now,
  visual snapshots later. Clarify the practical rollout: whether to add axe to CI immediately,
  run it manually during release validation only, or wait until the CI runner is stable enough to
  own both axe and visual snapshots.
- [ ] **v1.html screenshots stale** (doc 14 step 7 remainder): re-shoot showcase screenshots on current 2.0 UI (post dark-theme).
- [ ] **Settings → API tab honesty**: panel is documentation-only but its sidebar blurb promises auth/queue-priority config; either trim the blurb now or implement the Integrations page (north star Phase C).
- [x] **Owner decisions in plan docs reconciled**: north-star Q1–Q6, sanitize override granularity, check_output retry policy, and Phase A gate are resolved in their source docs.
- [ ] **R6-T7 device verification needed**: responsive CSS fixes landed (VoiceModals min-width, manuscript workspace grid collapse at ≤768px) but need manual sweep at 1280/768/420px in a real browser (devtools or Playwright viewport). In particular: Studio CastPalette at 420px (flex-row with fixed CastPalette width could be tight), Voice Lab SamplesSection stacking order at 390px, and MobileNavDrawer Escape/focus-trap (R6-T9 confirmed aria-label only; Escape key + useFocusTrap missing — needs a targeted fix + test before shipping).
- [ ] **MobileNavDrawer a11y gap**: `MobileNavDrawer.tsx` lacks `useFocusTrap` and Escape key handler (R6-T9 marked it as "confirmed already-correct" for aria-label only, but focus trap is absent). Fix: add `useFocusTrap(drawerRef, open)` and `onKeyDown Escape → onClose` per the existing pattern in `VoiceUtils.tsx` Drawer. Add a vitest test for Escape close + focus trap.

### Post-Release Or Opportunistic Cleanup

- [ ] **Frontend bundle code-splitting follow-up**: route code-splitting landed; revisit only if current bundle analysis shows a new regression.
- [ ] **`--z-drawer` token**: mobile nav drawer CSS uses `var(--z-drawer, 400)` fallback; define the token in tokens.css as part of U10 z-index consolidation (layering.ts as the source).
- [ ] **react-refresh lint warnings (11)**: demo stage files co-export descriptor objects with components; either split descriptor/component files or add a scoped eslint disable with justification.
- [ ] **`app/jobs` naming debt**: `worker_helpers/worker_metrics/worker_voice` are legacy-named but LIVE (imported by synthesis_mixed and tts_xtts plugins). Rename/move under `app/orchestration/` requires coordinated plugin-import updates — do alongside the `tts_engines/` namespace rename above.
- [ ] **Voice Lab stage caption**: static stages show the shared timeline scene caption ("Watch a mixed XTTS + Voxtral chapter render...") — DemoStage could accept a caption override for non-timeline stages.
- [ ] **Demo transport nits** (from adversarial review, non-blocking): `restart()` leaves playback paused; `play()` at non-looping timeline end is a no-op; shim `warnedRoutes` is module-global across install cycles.


## R6-T10 dead-code retirement — SUPERVISED FOLLOW-UP (deferred 2026-06-14)
Remove the legacy ProjectDetail/ChapterEditor page chain now that all routes redirect into the
book pipeline. Scope (verify each is import-dead in src first; do WITH the owner / a focused session
that can run the full suite to confirm):
- frontend/src/pages/ProjectDetail/ (ProjectDetailPage.tsx, ProjectViewRoute.tsx, components/*) —
  no live route mounts ProjectDetailPage (App.tsx only references it in a comment).
- frontend/src/pages/ChapterEditor/ChapterEditorPage.tsx + components/CharacterSidebar.tsx — imported
  only by ProjectDetailPage. KEEP EditorTabs.tsx (shared with the live useStudioChapter hook) and
  ScriptView.tsx (used across Studio). KEEP NarratorCard.tsx (consumed by frontend/src/demo).
- Delete the 14 coupled test files (ProjectView*, ChapterEditor*, EditorTabs CharacterSidebar specs,
  ProjectViewTestHelpers, ProjectViewRoute test) per R-D since their code is removed.
- Owner answer 2026-06-14: removal is still needed, but only after confirmed validation, one
  deletion checkpoint at a time.
- Verify each deletion checkpoint before proceeding: build + lint + FULL vitest suite green
  (run carefully, capped workers, watch memory).
Reason deferred: tangled multi-file + test-coupled removal; full-suite verification needed.
