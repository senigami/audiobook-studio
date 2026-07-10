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
- [x] Update `docs/plugin-sdk/plugin-guide.md` to define manifest-declared capabilities, behavior, and worker hooks as the default model.
- [x] Update `docs/plugin-sdk/plugin-template/README.md` to present the template as the canonical declared-hook example.
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
- [x] **DECIDED 2026-07-10: generic plugin setup loop in `run.sh` / `run.ps1` — deferred, and
  largely already resolved by a different (better) mechanism than a startup-script loop.**
  Analysis: only 3 plugins exist today (xtts, voxtral, mixed). Voxtral's `requirements.txt`
  (`httpx`, `pydantic`) and mixed's (none) are already subsumed by the shared app/TTS-Server venv,
  and Studio already has a *generic, per-plugin* runtime dependency-install mechanism —
  `POST /engines/{engine_id}/install` (`app/tts_server/server.py::install_dependencies`) — which
  discovers any plugin's `requirements.txt` and installs it into the running TTS Server's venv via
  `sys.executable`, then re-runs `check_env()`. That endpoint is already the "generic setup loop"
  this backlog item asked for; it just lives at runtime (Settings UI "Install Dependencies") rather
  than in the startup shell script. XTTS is the one plugin `run.sh`/`run.ps1` special-case, and it
  is special for a reason a generic loop can't remove: it needs a fully separate Python env
  (`~/xtts-env`) because its legacy Coqui/torch deps hard-conflict with the packages other engines
  and the app itself use — the plugin already owns its own conflict-detection
  (`plugins/tts_xtts/scripts/check_env.py`, invoked generically by `sync_python_requirements` via a
  `scripts/check_env.py` convention any plugin needing this could reuse), so this is not ad hoc
  engine-ID branching, it's a declared per-plugin isolation need. A future third-party plugin that
  needs its own isolated env would need the *same* special-cased separate-venv treatment as XTTS
  (a generic loop wouldn't spare it), while a future plugin that doesn't need isolation already gets
  fully generic handling via the runtime install endpoint today. Net: building a shell-script setup
  loop now, with only one real (inherently non-generic) case to generalize over, has low payoff.
  Revisit if/when standalone plugin repos (Phase 10) bring in third-party plugins with unknown
  setup needs, where a richer declared-setup-hook manifest field might earn its keep.
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
- [x] Revisit voice settings placement outside the Script popup/right queue area. Relocated plugin-defined per-voice settings out of the "Edit Recording Script" drawer into a new standalone "Voice Settings" drawer (`VoiceSettingsPanel.tsx`), reached via its own item in the voice catalog card's ⋯ action menu — same persistence path (`handleSaveTestText`), no backend change.
- [x] Voice metadata A-F complete: HF-aligned bundle export/import, icon upload, searchable tags, structured attributes, Voice Lab catalog UI, and docs. Current release tracking lives in `design-docs/plans/final_release/road_to_v2.md` Stage 4.
- [ ] Complete Taxonomy v2 Phase G: language, accent, style, category-tinted pills/+N overflow, and HF `as-*` tags.
- [x] Verify system API surface for future third-party/LLM controller plugins. Audited `app/api/tts_api.py` — adequate for engine discovery, submit/poll/retrieve, and consistent structured errors; found and fixed a real auth gap (S12: `/api/v1/tts/docs` + `/api/v1/tts/openapi` were reachable without `verify_api_key`/`rate_limit`). See `design-docs/plans/active/final_release/12_security_and_opportunities.md` (2026-07-09 entry).
- [x] Show queue output metadata such as generated audio duration/length.
- [x] Remove legacy Chapter Editor Production, Performance, and Preview tabs/code.
- [x] Rework crowded Chapter Editor menu bar and remove duplicate preparing pill.
- [x] Keep Chapter Editor live queue state anchored to the active job instead of stale completed jobs.
- [x] Scan plans and memory for forgotten requests; namespace rename ideas remain parked in the deferred namespace phase below.
- [ ] Manually verify fixed-but-pending Phase 11 app behaviors.
- [x] Triage Vite websocket `ECONNRESET` reconnect behavior — confirmed benign: reproduced via Playwright against a live dev backend+Vite proxy; the reset is React `StrictMode`'s dev-only double-invoke of `useWebSocket`'s connect effect (mount→cleanup→remount) tearing down a still-connecting socket, which Vite's `http-proxy` layer (`ws: true`) logs as a proxy-side error. It is dev/StrictMode-only (no proxy or double-invoke in production), no application data is ever in flight on the aborted handshake, and `useWebSocket.ts`'s own `onclose` reconnect plus `useQueueSync.ts`'s dedicated `reconnect`-source `refreshQueue()` (full API resync on every disconnect→connect transition after the first) already cover any real runtime disconnect. No code changes needed.
- [ ] Re-check large-book project/chapter load timings.
- [x] Resolve the generic plugin setup loop question above: implement before v2.0 or explicitly defer until standalone plugin repositories. **DECIDED 2026-07-10: deferred — see decision note in Phase 12 above.**
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

- [x] **Playwright/axe baseline execution — resolved 2026-07-09.** Decision: axe runs in CI now
  (not manual-only, not deferred). `.github/workflows/ci.yml`'s `a11y-axe` job already runs
  `frontend/tests/e2e/a11y/axe.spec.ts` on every PR/main push, kept non-blocking (`test.fixme` +
  `|| true`) so a browser-based check without a proven CI track record can't fail builds yet.
  Expanded the scan from 1 page to 3 (home shell, Voices empty state, Chapter Workspace) × 2
  themes, reusing the existing e2e network-mocking conventions
  (`page.route`/`page.routeWebSocket`, same pattern as `chapter-render.spec.ts`); verified
  locally (fixme temporarily removed) that all 6 cases run to completion and report real
  findings rather than crashing — see the spec file's header for the current known-violations
  list. Concrete gate criterion recorded in
  `design-docs/plans/active/final_release/08_release_sequence.md` Stage 5.
- [ ] **v1.html screenshots stale** (doc 14 step 7 remainder): re-shoot showcase screenshots on current 2.0 UI (post dark-theme).
- [x] **Settings → API tab honesty**: already resolved by the R5 redesign — `/settings/api` now redirects to a standalone `/integrations` page (`settingsRouteConfig.ts` `SETTINGS_REDIRECTS`, same pattern as the Engines tab), so there is no longer a Settings panel with a blurb promising config UI it doesn't have. `IntegrationsPage.tsx`/`ApiGuidePanel.tsx` is a documentation-only page, which is fine for a page whose job is to document a real API — but its content had drifted from `app/api/tts_api.py`/`app/core/security.py`: it falsely claimed "Studio 2.0 does not currently implement internal API secret keys" (there is a real Bearer `tts_api_key` + `tts_api_enabled` gate) and omitted the real rate limiter (30 req/min sliding window), while documenting made-up/internal-only routes (`/api/engines`, `/api/speaker-profiles`, `/api/processing_queue`, direct `localhost:8001/synthesize`) instead of the real external contract (`/api/v1/tts/{engines,synthesize,preview,jobs/*}`). Rewrote `ApiGuidePanel.tsx` to document the real `/api/v1/tts` gateway, its actual auth/rate-limit behavior, and its actual endpoints.
- [x] **Owner decisions in plan docs reconciled**: north-star Q1–Q6, sanitize override granularity, check_output retry policy, and Phase A gate are resolved in their source docs.
- [ ] **R6-T7 device verification needed**: responsive CSS fixes landed (VoiceModals min-width, manuscript workspace grid collapse at ≤768px) but need manual sweep at 1280/768/420px in a real browser (devtools or Playwright viewport). In particular: Studio CastPalette at 420px (flex-row with fixed CastPalette width could be tight), Voice Lab SamplesSection stacking order at 390px, and MobileNavDrawer Escape/focus-trap (R6-T9 confirmed aria-label only; Escape key + useFocusTrap missing — needs a targeted fix + test before shipping).
- [x] **MobileNavDrawer a11y gap**: `MobileNavDrawer.tsx` lacks `useFocusTrap` and Escape key handler (R6-T9 marked it as "confirmed already-correct" for aria-label only, but focus trap is absent). Fix: add `useFocusTrap(drawerRef, open)` and `onKeyDown Escape → onClose` per the existing pattern in `VoiceUtils.tsx` Drawer. Add a vitest test for Escape close + focus trap.

### Post-Release Or Opportunistic Cleanup

- [ ] **Frontend bundle code-splitting follow-up**: route code-splitting landed; revisit only if current bundle analysis shows a new regression.
- [x] **`--z-drawer` token**: mobile nav drawer CSS uses `var(--z-drawer, 400)` fallback; define the token in tokens.css as part of U10 z-index consolidation (layering.ts as the source). Done: added `--z-drawer: 400` to `frontend/src/theme/tokens.css` (matches the existing fallback/usage, slotted between the ~300 dropdown tier and the ~1000+ modal/toast tier); `components.css` fallback left in place defensively.
- [x] **react-refresh lint warnings (11)**: demo stage files co-export descriptor objects with components; either split descriptor/component files or add a scoped eslint disable with justification. Done: split the descriptor object out of each of `progressStage.tsx`, `queueStage.tsx`, `voiceLabStage.tsx`, `siteMockupStage.tsx`, and `DemoApp.tsx` into sibling `*Descriptor.tsx`/`demoStages.ts` files so each original file only exports components; all 11 warnings resolved (verified via `npm run lint`).
- [ ] **`app/jobs` naming debt**: `worker_helpers/worker_metrics/worker_voice` are legacy-named but LIVE (imported by synthesis_mixed and tts_xtts plugins). Rename/move under `app/orchestration/` requires coordinated plugin-import updates — do alongside the `tts_engines/` namespace rename above.
- [ ] **Voice Lab stage caption**: static stages show the shared timeline scene caption ("Watch a mixed XTTS + Voxtral chapter render...") — DemoStage could accept a caption override for non-timeline stages.
- [x] **Demo transport nits** (from adversarial review, non-blocking): `restart()` leaves playback paused; `play()` at non-looping timeline end is a no-op; shim `warnedRoutes` is module-global across install cycles. Done: `restart()` now preserves the prior playing state (resumes if it was playing); `play()` at a finished non-looping timeline now restarts from scene 0 instead of no-op-ing; `demoApiShim`'s `warnedRoutes` Set is now scoped per `installDemoApiShim()` call instead of module-global. Added revert-checked tests in `useDemoTransport.test.tsx` and `demoApiShim.test.ts`.


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
