# 10 - Mock Reconciliation Inventory

Status: first-pass inventory only  
Date: 2026-06-15  
Scope: coordinate what the mock, site, release plans, and future labels need before any more mock or site work.

This pass treats the mock as an input, not the source of truth. The source stack is:

1. Current app capability inventory and R6/R7 progress logs.
2. Release checklist and final-release plans.
3. North-star/future direction docs.
4. Current mock source under `frontend/src/demo/stages/siteMockup/`.
5. Current app implementation when it clarifies whether a mock affordance is real.

No code, mock, docs/showcase, or site surfaces should be changed from this inventory pass. The next pass should update the mock first, then resume site work against the reconciled mock.

## Labels

| Label | Meaning |
|---|---|
| Gap type: `mock-missing` | Current app ability or required text is not represented in the mock. |
| Gap type: `mock-stale` | Mock shows behavior or copy that conflicts with the current app or plan. |
| Gap type: `site-missing` | Current shipped site still lacks an accepted release requirement. |
| Gap type: `future-label` | Mock/site should show the item only as planned, post-v2, or aspirational. |
| Gap type: `copy-parity` | Text exists but should be aligned to old/current app wording. |
| Priority `P0` | Blocks a truthful mock update before further site work. |
| Priority `P1` | Release-facing or owner-visible accuracy issue. |
| Priority `P2` | Post-v2 roadmap clarity. |
| Priority `P3` | Aspirational or cleanup-only tracking. |

## Owner Decisions - 2026-06-15

1. **The private mock should show the desired future interface working.** The mock is for owner review and direction-setting, so future-state controls should be usable inside the mock when that helps evaluate the UX. Do not clutter the mock UI with "future" callouts where the owner is trying to judge the end-state interaction. Public release/demo surfaces still need separate honesty checks before shipping.
2. **Sub-sentence assignment should be represented as a working interface in the mock.** The mock should demonstrate how the mixed-span painting/assignment gesture could work, not hide it behind a future label.
3. **Plugin installation should support both ZIP upload and GitHub repo URL install for v2.0.** Browse/discovery can move later if necessary, but pasting a GitHub repo URL and installing from it is release-relevant because it supports community plugin adoption.
4. **Integrations cannot be status-only.** The API surface needs to support making a request to generate audio and retrieving the result now. API keys, LAN binding, rate limits, and priority controls can be post-v2 live implementation, but the mock may show the end-goal controls working.
5. **Shareable voice files are a main feature.** Voice bundle export/download should be represented now, and the release path should keep local file import/export strong even if direct Hugging Face browse/publish is later.
6. **Create an official plugin registry for v2.0.** The registry should be owner-controlled and support preview metadata such as summary, icon, tags, homepage/docs links, repo URL, trust level, and compatibility. Detailed preview can be pulled from known files in the plugin repo such as `manifest.json`, `README.md`, and optional preview/icon assets; arbitrary website scraping is not required.
7. **Use XTTS and Voxtral as the first repo-download migration targets.** Create working standalone repository downloads for the existing XTTS and Voxtral plugins, then migrate them out of the base repo once install/validation/setup/reload is proven through the registry/GitHub URL path.

## Master Matrix

| Area | Source | Current app ability/text | Current mock coverage | Gap type | Recommended update | Priority | Owner | Evidence |
|---|---|---|---|---|---|---|---|---|
| Shell rail and top bar | Capability inventory; R6 parity | Rail groups, collapse/hover expansion, top-bar identity, connection dot, queue drawer button, theme toggle, `/queue` drawer bounce. | Mostly represented by rail/top-bar mock. | copy-parity | Keep as mostly represented, but add a short coverage note in the mock plan that rail differences are layout decisions, not new features. | P2 | Codex | `02_capability_inventory.md` §1; `99_progress_log.md` R6 parity shell; `frontend/src/demo/stages/siteMockup/rail.tsx` |
| Mobile navigation | Capability inventory; master backlog | Mobile nav drawer exists, but current backlog says Escape and focus-trap were missed. | Mock implies mobile drawer but does not surface a11y contract. | site-missing | Add release row for `MobileNavDrawer` focus trap + Escape handling; mock should not imply mobile is fully verified until this is fixed. | P1 | Codex + site worker | `plans/master_agnostic_tasks.md` MobileNavDrawer a11y gap; `frontend/src/app/layout/MobileNavDrawer.tsx` |
| Startup overlay and app-level blocking states | Capability inventory | Startup overlay shows backend startup message/detail with copy delay; global toast and confirm modal survive. | Mock splash focuses on experience/navigation, not actual blocking startup state. | mock-missing | Add a lightweight startup/initializing state to the mock or document it as intentionally omitted from the reviewable mock. | P1 | Mock worker | `02_capability_inventory.md` §1 |
| Splash/getting-started cards | Mock source; north star | Current app startup is operational, and Library owns create/docs entry points. North star wants in-app onboarding to avoid pointing outward. | Mock splash has docs/getting-started cards and external-docs framing. | mock-stale | Remove or relabel splash docs cards so they do not read as current app UI. If onboarding remains, separate release demo-bundle guidance from aspirational first-run tour. | P1 | Mock worker | `splash.tsx`; `site_experience_north_star.md` §9 |
| Library empty/onboarding | Capability inventory; north star | Existing Library has New Project modal, grid/list/sort, empty state "No projects yet", wiki help link, and current landing copy. North star wants first-run checklist and demo bundle. | Mock has greeting/Continue dashboard copy and book-framed cards that do not match the current Library text. | mock-missing | Add explicit first-run/empty-library state: release = current create/docs affordances and exact empty text; post-v2 = 3-step checklist; release docs = demo bundle. | P1 | Mock worker + release worker | `02_capability_inventory.md` §2; `ProjectLibraryPage.tsx`; `site_experience_north_star.md` §9 |
| Queue drawer and Activity entry points | Capability inventory; R5/R6 logs | Drawer remains the anywhere glance surface; Activity is the depth page with Pause/Resume, Clear Completed/All, drag reorder, debug copy, filters, stats, calibration, tally. | Mock covers Activity but may not show compact queue drawer or all live queue actions. | mock-missing | Add compact drawer state from the top-bar button; ensure Activity keeps Pause/Resume, Clear Completed/All, drag reorder, debug copy, history filters. Label drawer = glance and Activity = depth. | P1 | Mock worker | `02_capability_inventory.md` §8; `GlobalQueue.tsx`; `ActivityPage.tsx` |
| Global player | R7 progress; north star | PlayerBar is sole audio owner; VCR transport, scope toggle, waveform strip, Review delegates transport. | Mock does not consistently show the persistent shell-level player across panes. | mock-missing | Add a shell-level persistent player state with transport, scope switch, and waveform, or explicitly document where the player is intentionally hidden. | P0 | Mock worker | `99_progress_log.md` R7 complete; `PlayerBar.tsx`; `site_experience_north_star.md` §3 |
| Project/book header abilities | Capability inventory; old ProjectDetail | Old ProjectDetail had cover lightbox, Edit Project Details modal, title/author/series, runtime/predicted/created chips. Current canonical editor is Publish BookInfoCard and top-bar identity jumps to Publish. | Mock Publish direction exists, but old header abilities are not all visibly accounted. | mock-missing | Add explicit book-info state in Publish covering cover lightbox/change, metadata editing, runtime/predicted/created, and old header parity. | P0 | Mock worker | `02_capability_inventory.md` §3; `ProjectHeader.tsx`; `BookInfoCard.tsx` |
| Manuscript chapter table | Capability inventory; mock book pane | Chapter lifecycle, StatusOrb, live PredictiveProgressBar, add/import `.txt/.docx/.epub`, sort, reorder, rename, Queue Remaining, engine warning, ActionMenu, read/edit unlock. | Mock covers lifecycle, add chapter, focus, warning, but does not obviously enumerate Queue Remaining/engine-warning/action-menu/progress parity. | mock-missing | Add chapter row overflow/action snapshot, live progress row, inline rename, and toolbar coverage for Queue Remaining + engine warning so old ProjectDetail abilities are visible. | P0 | Mock worker | `02_capability_inventory.md` §3; `99_progress_log.md` R6-T6; `ChapterTable.tsx` |
| Manuscript text editing | Capability inventory; north-star owner decisions | Manuscript owns document-level text; Draft/Ready editable; Cast/Rendered require unlock warning and resync preview. | Mock covers editable/read-only/focus warning. | copy-parity | Align mock copy with current warning language and distinguish Manuscript document edits from Studio surgical edits. | P1 | Mock worker | `site_experience_north_star.md` round 5; `02_capability_inventory.md` §7 |
| Casting roster | Capability inventory; north star | Pinned Narrator default row; CharactersTab add/delete/empty-state; VoiceProfileSelect assignment; color swatch. AI suggestions are future. | Mock covers casting direction but should be checked for full old CharactersTab actions. | mock-missing | Add add-character, delete-character confirmation, empty-state copy, color/voice assignment, and label AI suggestions as post-v2. | P1 | Mock worker | `02_capability_inventory.md` §6; `site_experience_north_star.md` §4.2 |
| Studio book view and paint workflow | Capability inventory; owner decisions | Book view primary, Script view secondary; cast palette painting; safe-text and section toggles; action-required strip; per-sentence play/rebuild; sub-sentence planned. | Mock covers book/script, paint palette, safe text, section numbers, action-required, planned sub-sentence, and an engine-specific `XTTS v2` chip. | mock-stale | Replace `XTTS v2` with neutral engine-agnostic copy. Make sub-sentence assignment feel like a usable end-state interaction in the private mock, not a disabled/future callout. | P0 | Codex + owner decision | `road_to_v2.md` Cross-cutting; `site_experience_north_star.md` round 5; `studio.tsx`; Owner decision 2026-06-15 |
| Studio header actions | Capability inventory | Inline title rename, Save & Previous, Save & Next, Export WAV/MP3 busy state, Copy debug state dev-gated, Commit/resync. | Mock covers Save prev/next, export, commit/resync; debug may be absent or too implicit. | mock-missing | Add dev-gated Copy debug state to mock or intentionally omit as dev-only in notes; keep Export WAV/MP3 busy-state affordance. | P1 | Mock worker | `02_capability_inventory.md` §7; `frontend/src/pages/Book/studio/StudioHeaderActions.tsx` |
| Studio queue/progress surfaces | Capability inventory; R6/R7 logs | QueueNotice, live segment progress, PredictiveProgressBar, Stop All, active segment handoff instrumentation. | Mock covers render controls and Stop all; instrumentation and queue notice are not visible. | mock-missing | Add a queued/processing notice example and a progress strip state. Instrumentation can be marked intentionally omitted. | P1 | Mock worker | `02_capability_inventory.md` §7; `frontend/src/pages/Book/stages/StudioStage.tsx` |
| Review stage | R4/R7 logs; north star | Follow-along section text, section-anchored annotations, re-render-in-place, PlayerBar as transport. | Mock has review/follow-along storytelling, but some labels such as `past`, `playing`, `future` read like placeholder demo states. | mock-stale | Rewrite review copy around section-anchored follow-along + re-render. Confirm mock uses `§N` anchors and no separate transport controls. Remove timestamp-first or placeholder-state copy. | P0 | Mock worker | `99_progress_log.md` R4/R7; `site_experience_north_star.md` round 4 |
| Publish book info | Capability inventory | BookInfoCard owns cover/title/author/series, runtime/predicted/created, assembled downloads. | Mock Publish covers book info direction. | copy-parity | Ensure mock no longer implies a persistent book header editor outside Publish. | P1 | Mock worker | `02_capability_inventory.md` §3; `site_experience_north_star.md` round 4 |
| Publish assemblies | Capability inventory; mock publish pane | Assembly progress, select rendered chapters, Select All, Cancel/Confirm, play/download/delete, metadata edit. | Mock covers selection and progress, but may not make AssemblyPanel parity obvious. | mock-missing | Add per-assembly metadata edit, play/download/delete, empty-state/assemble CTA, and rendered-only disabled state. Keep Publish as a full first-class pane, not an implied footer. | P0 | Mock worker | `02_capability_inventory.md` §4; `publish.tsx` |
| Publish backups | Capability inventory | Save backup with comment/include-audio, list, download, delete, restore. | Mock may under-represent restore/include-audio. | mock-missing | Add backup card with include-audio toggle and Restore action or explicitly mark omitted from low-fidelity mock. | P1 | Mock worker | `02_capability_inventory.md` §5 |
| Voice catalog toolbar | Capability inventory | New Voice, Import Voice bundle, Export Voice, Recording Guide; compact icon mode. | Mock has toolbar concepts and Recording Guide, but wording drifts from live `Import Voice` / `Export Voice`. | copy-parity | Verify exact toolbar actions and live copy appear in mock; note small-width icon behavior for responsive pass. | P1 | Mock worker | `02_capability_inventory.md` §9; `VoicesTabHeader.tsx` |
| Voice catalog behavior | Current components; Plan 04 | Live catalog has search, engine filters, phase-aware CTA, metadata pills, +N overflow direction, actionable Not tagged badge. | Mock static cards all say `Edit voice` and do not represent search/filter/phase state. | mock-missing | Replace static cards with live catalog behavior: search, filters, phase-aware CTA (`Add samples` / `Build voice` / `Test voice` / `Edit voice`), Not tagged badge, and overflow pills. | P0 | Mock worker | `VoicesPage.tsx`; `VoiceCatalogCard.tsx`; `04_voice_metadata_and_tagging.md` |
| Voice card menu | Capability inventory; current components | Card menu includes Set as Default, Edit Metadata, Rename Voice, Export Voice Bundle, Delete Voice (all variants, confirm). | Mock card CTA is `Edit voice`; overflow old actions are not clearly represented on local catalog cards. | mock-missing | Add the card ActionMenu to the mock catalog and ensure voice editing is fully visible before further site work. | P0 | Mock worker | `02_capability_inventory.md` §9; `NarratorCard.tsx`; `VoiceCatalogCard.tsx`; `voices.tsx` |
| Voice metadata editor | Plan 04; current components | Edit Metadata supports schema-required fields, free tags, validation; untagged warning appears until fixed. | Mock shows pills and untagged warning pattern, but not a metadata edit flow. | mock-missing | Add an edit metadata state/modal snapshot, including required fields and validation copy. | P0 | Mock worker | `04_voice_metadata_and_tagging.md` D7; `02_capability_inventory.md` §9 |
| Taxonomy v2 | Road to v2; Plan 04 Phase G | language multi, accent single, style multi, category-tinted fixed order, +N overflow, HF `as-*` tags are open release scope and re-block PK7. | Mock uses class/gender/age/extended/tag pills, but lacks v2 language/accent/style specificity. | mock-missing | Update mock taxonomy examples and chips to language/accent/style v2, plus +N overflow state. Classify as `release` until Road to v2 changes. | P0 | Codex + mock worker | `road_to_v2.md` Stage 4; `04_voice_metadata_and_tagging.md` Phase G |
| Voice Lab route/detail | Capability inventory; current route | Voice Lab is route-based (`/voices/:id`) with back link, icon controls, metadata editor, samples, variants, test, export/delete, planned HF publish. | Mock behaves like an in-place catalog swap and display-only detail. | mock-stale | Split the detail mock into the actual route-based Voice Lab workspace and add real icon upload + metadata editor controls. | P0 | Mock worker | `VoiceLabPage.tsx`; `VoiceIconControls.tsx`; `voices.tsx` |
| Voice Lab detail actions | Capability inventory | Voice Lab owns samples, variants, engine settings, test strip, script editor, rename/add variant, sample preview, export, delete, icon upload/copy prompt. | Mock covers many sections but delete/default/rename/edit metadata relationship is not obvious. | mock-missing | Add a top-level voice actions menu in Voice Lab and a section linking edit metadata, rename, default, export, delete. | P0 | Mock worker | `02_capability_inventory.md` §9; `VoiceLabPage.tsx`; `voices.tsx` |
| Voice samples and variants | Capability inventory | Sample manager list/add/delete/manual add/preview; variant editor per-engine settings/delete/move/rename/add variant; live sample upload copy is WAV-only. | Mock covers samples and variants with dot menu, but says MP3 or WAV and misses some live variant/test branching. | copy-parity | Align sample copy to WAV-only, add manual sample add and move/delete footer actions, and keep preview routed through global player. | P1 | Mock worker | `02_capability_inventory.md` §9; `SampleManager.tsx`; `VariantEditor.tsx` |
| Voice test and preview | Capability inventory; ADR-0010 | Build/test voice, script editor, sample/preview playback via player bus. | Mock test strip has Generate test and play progress. | copy-parity | Ensure mock does not imply a second local audio owner; label output as global-player preview where needed. | P1 | Mock worker | `99_progress_log.md` R5 complete; `02_capability_inventory.md` §9 |
| HF voice publish/discover | North star; R5 logs; Plan 04 | Discover is planned placeholder only; Publish to HF is planned disabled placeholder; no fetching/install logic. | Mock has Discover cards with Install-like behavior and Publish to HF near active actions. | mock-stale | Replace fake Discover cards/install buttons with planned placeholder or clearly non-actionable concept cards. Keep Publish to HF disabled/planned. Classify Discover/Publish as post-v2 unless release plan promotes it. | P0 | Mock worker | `99_progress_log.md` R5 intentional deviation; `DiscoverPlaceholder.tsx`; `VoiceLabPage.tsx` |
| Engines installed management | Capability inventory | Import plugin zip with PluginTrustModal, install-deps trust flow, refresh, diagnostics, enable/disable, verify/run-test, schema settings, metadata, dev logs/raw JSON, uninstall. | Mock covers rich engine cards and trust dialog, but misses install-deps flow and dev raw JSON/log console. | mock-missing | Preserve current installed-management actions, add install-deps trust flow and dev-only raw JSON/log console, and avoid engine-name-specific copy beyond clearly illustrative examples. | P1 | Mock worker | `02_capability_inventory.md` §10; `EnginesPanel.tsx`; `EngineCard.tsx` |
| Plugin store and GitHub repo install | North star; R5 logs; owner decision | ZIP plugin import exists. Owner wants GitHub repo URL install for v2.0; open-ended GitHub topic browsing can defer if needed. | Mock shows fake browse-store cards with Install. | mock-stale | Keep the mock interactive for end-state review, but split implementation scope: release = ZIP upload + paste GitHub repo URL install + official plugin registry + trust/dependency setup; post-v2 acceptable = open GitHub search/discovery if time-constrained. | P0 | Mock worker + platform worker | `99_progress_log.md` R5-T11; `StorePlaceholder.tsx`; `platform.tsx`; Owner decision 2026-06-15 |
| Official plugin registry previews | Owner decision | Owner is comfortable running an official registry. Registry entries can include summary, icon, tags, docs/homepage, repo URL, trust, compatibility; details can be fetched from repo files. | Mock should show a preview/detail drawer for official registry entries. | mock-missing | Add registry browse/detail mock with icon, summary, compatibility, requirements, README/manifest-derived detail, and install CTA. Do not require arbitrary website scraping. | P0 | Mock worker + platform worker | Owner decision 2026-06-15 |
| XTTS/Voxtral standalone repo migration | Final release plans; owner decision | Existing XTTS and Voxtral plugins are in the base repo. Owner wants working repo downloads for both, then migration out of the base repo. | Mock can show official registry entries for XTTS and Voxtral as first-party plugins. | site-missing | Add implementation plan: create standalone XTTS and Voxtral plugin repos, publish registry entries, prove install from URL/registry, then remove/migrate bundled copies from base repo once stable. | P0 | Platform worker + release worker | `road_to_v2.md` Stage 4; `05_standalone_plugin_repos.md`; Owner decision 2026-06-15 |
| Plugin lifecycle and trust | Final release plans | Plugin contract done; standalone repos/open GitHub discovery remain; generic setup loop open; signing/checksums future. | Mock covers import/trust and some installed plugins. | future-label | Release scope should include enough manifest-declared setup/dependency handling for ZIP, GitHub URL, and official-registry installs. Post-v2 can handle open GitHub topic browsing, richer update/pull UX, and signing. | P1 | Codex + platform worker | `road_to_v2.md` Stages 3/4; `02_plugin_communication_contract.md`; Owner decision 2026-06-15 |
| Engine diagnostics | Capability inventory; R5 logs | Diagnostics log viewer, calibration chip/reset, live logs, server status. | Mock covers diagnostics and calibration. | copy-parity | Keep diagnostics but align copy to current page names (`Engines`, `View Diagnostics`) and current TTS server behavior. | P2 | Mock worker | `02_capability_inventory.md` §10; `99_progress_log.md` R5 complete |
| Integrations API generation flow | Capability inventory; north star; owner decision | Integrations must be able to make an API request to generate audio and retrieve the result. `/settings/api` redirects to Integrations. | Mock Integrations includes config rows but should also demonstrate the core generate/retrieve API workflow. | mock-missing | Add an interactive request builder/result retrieval flow to the mock. Release live implementation should support audio generation and retrieval through the API, even if auth/LAN/rate-limit controls are not live yet. | P0 | Mock worker + platform worker | `02_capability_inventory.md` §10; `docs/studio-as-tts-gateway.md`; Owner decision 2026-06-15 |
| Integrations end-goal config | North star; docs; owner decision | Future gateway wants API keys, LAN binding, rate limits, priority, live request logs, Swagger recipes. | Mock shows details as if functional. | future-label | Keep end-goal config controls working in the private mock for owner review. Live implementation can defer API keys/LAN/rate limits/priority to post-v2 unless explicitly promoted. | P1 | Codex + platform worker | `site_experience_north_star.md` §7; `docs/studio-as-tts-gateway.md`; Owner decision 2026-06-15 |
| Settings thinning and redirects | Capability inventory; R5 logs | Settings now General/About/Developer, with `/settings/engines` -> `/engines` and `/settings/api` -> `/integrations`; General keeps theme, dev mode, stability, default engine/voice; About keeps tally/reset/runtime diagnostics. | Mock has thin settings but may not explicitly show redirects/platform ownership. | copy-parity | Verify mock includes all remaining old Settings abilities, adds a note that platform controls live under Engines/Integrations, and no longer promises API configuration under Settings. | P1 | Mock worker | `02_capability_inventory.md` §10; `settingsRouteConfig.ts`; `99_progress_log.md` R5 complete |
| Developer routes/tools | Capability inventory | Progress Bar Test and Event Stream remain dev-mode routes; debug copy buttons are dev-gated. | Mock may not show Developer group/tools. | mock-missing | Add a Developer group note or intentionally omit dev-only routes in mock with an inventory note. | P2 | Mock worker | `02_capability_inventory.md` §11 |
| Accessibility/focus management | Road to v2; master backlog | A1-A3/A9 done, but MobileNavDrawer focus trap/Escape still open; modal focus traps matter for future mock controls. | Mock is low fidelity and not an a11y verifier. | site-missing | Treat this as release/site update, not mock polish. Add acceptance row to next site pass and avoid claiming full a11y completion. | P1 | Codex + site worker | `road_to_v2.md` Stage 5; `master_agnostic_tasks.md` |
| Responsive/device verification | R6 logs; master backlog | CSS fixes landed; manual device sweep still needed for 1280/768/420 and Voice Lab/Studio drawer cases. | Mock is responsive-ish but not verified. | site-missing | Add manual verification packet after mock update; keep mock responsive enough for review but do not overfit before device sweep. | P1 | Codex + QA | `master_agnostic_tasks.md` R6-T7 device verification |
| Copy/text parity | Capability inventory; old pages | Old app contains useful help/empty text: Library empty, wiki help link, Characters empty, Recording Guide, API docs/security note. | Mock has new copy and some old text missing. | copy-parity | Run a copy-parity pass from capability inventory plus current components before shipping the mock. Prioritize destructive warnings and empty states. | P1 | Copy worker | `02_capability_inventory.md`; current page components |
| Mock actionable future controls | Owner decision; R5 logs | Public/release surfaces should not claim unbuilt backend features. Private mock should be interactive for future-state review. | Mock currently includes future plugin store and API config actions. | mock-stale | Do not disable future controls in the private mock just because the live app lacks them. Instead, make future-state controls coherent and reviewable in the mock, then gate public/demo release separately. | P0 | Codex + mock worker | Owner decision 2026-06-15; `99_progress_log.md` R5-T11/T12 |
| Showcase static page | Road to v2; doc 14 | `docs/v1.html` tokens sync done; screenshots stale and need current 2.0 refresh; public copy still reads like 1.x in places. | Mock does not cover docs showcase. | site-missing | Track as release/showcase task, not mock task: refresh screenshots and routed-IA terminology after mock and site settle. Archive or clearly label old 1.x screenshots if retained. | P1 | Release worker | `road_to_v2.md` Stage 6; `14_live_demo_revamp.md`; `docs/v1.html`; `docs/assets/*` |
| Interactive demo build | Road to v2; doc 14 | `docs/demo` built from `frontend/src/demo`; release checklist must run token sync and build demo. | Mock is source for demo; stale mock will ship stale demo. | mock-stale | Finish mock reconciliation before running `build:demo`; add release checklist reminder to rebuild after mock update. | P1 | Release worker | `road_to_v2.md` Stage 6; `14_live_demo_revamp.md`; `docs/demo/` |
| Pinokio/demo bundle | Road to v2; doc 16 | PK3 wrapper repo, PK7 demo bundle refresh blocked by taxonomy v2, PK8 first-run smoke open. Demo bundle must include Studio Voice/default engine and honor `AUDIOBOOK_STUDIO_INSTALL_DEMO`. | Mock does not cover installer demo content. | site-missing | Keep release row separate from UI mock: after taxonomy v2, refresh `demo/demo.zip`, verify restore whitelist, and smoke fresh install defaults. | P1 | Release worker + owner | `road_to_v2.md` Stage 6; `16_pinokio_distribution.md`; `app/domain/demo_bundle.py`; `run.sh` |
| Specs conformance | Road to v2; docs/specs | SP9 conformance pass gates v2. Specs and code are jointly authoritative. | Mock can drift from specs if updated without final spec pass. | future-label | After mock update, run a spec-conformance checklist against current behavior and classify any remaining future labels. | P1 | Codex | `road_to_v2.md` Stage 6; `docs/specs/README.md` |

## Future Item Classification

The default classification below follows `plans/final_release/road_to_v2.md` when a future item appears in multiple sources. If an explorer report disagreed with the release checklist, the release checklist wins until the owner changes it.

| Item | Classification | Notes |
|---|---|---|
| Taxonomy v2 language/accent/style, +N overflow, HF `as-*` tags | release | Open in Road to v2 Stage 4 and re-blocks Pinokio PK7. |
| HF-compatible voice bundle export/import | release | A-F landed; keep this distinct from direct HF browse/publish. |
| MobileNavDrawer focus trap/Escape | release | Release-facing a11y gap from master backlog. |
| Responsive device sweep at 1280/768/420 | release | Verification task, not mock implementation. |
| v1.html screenshot refresh | release | Must wait until reconciled mock/site settles. |
| Public docs/showcase terminology refresh to routed IA | release | Static pages still carry older 1.x framing in places. |
| `sync:showcase-tokens` and `build:demo` at release | release | Already wired in final-release doc 14; rerun after mock update. |
| Pinokio PK3/PK7/PK8 | release | PK7 waits on taxonomy v2. |
| SP9 specs conformance pass | release | Gates tag. |
| Sub-sentence assignment | release | Represent as a working end-state interaction in the private mock; live implementation remains release target per Road to v2. |
| Generic plugin setup loop | release | Road to v2 asks implement or defer with rationale; classify release until explicitly deferred. |
| GitHub plugin repo URL install | release | Owner wants paste-URL GitHub install now; browse/discovery can defer if needed. |
| Official plugin registry with previews | release | Owner-controlled registry should support preview metadata and repo-derived detail. |
| XTTS and Voxtral standalone repo downloads | release | Use as first working registry/GitHub install targets, then migrate them out of the base repo. |
| HF voice Discover/install | post-v2 | Current site intentionally uses placeholder; no HF fetching now. |
| Publish voice to Hugging Face | post-v2 | Current Voice Lab button is planned/disabled. |
| GitHub plugin browse/discovery/update | post-v2 | Browsing can defer if paste-URL GitHub install ships first. |
| API generate-and-retrieve flow | release | Integrations must be able to make an audio generation request and retrieve the result. |
| API keys, LAN binding, rate limits, request log | post-v2 | Live implementation can defer; private mock may show end-goal controls working. |
| AI casting suggestions/cards | post-v2 | Current plan says recommendations, never auto-assign; not built. |
| A/B audition | post-v2 | North-star item only. |
| Pronunciation lexicon | post-v2 | North-star Review/Publish future. |
| ACX/loudness QA/export presets | post-v2 | Publish future; do not imply release functionality. |
| Namespace rename `plugins/` -> `tts_engines/` | post-v2 | Deferred architecture cleanup. |
| Plugin signing/checksums/trusted registry | aspirational | Future security/ecosystem hardening. |
| SSML-lite and broader third-party controller plugins | aspirational | Needs API/plugin surface verification first. |

## Capability Coverage Note

`plans/site_redesign_rollout/02_capability_inventory.md` reports 120/120 current capabilities re-homed. This reconciliation does not reopen those implementation checks; instead, every capability family is now either represented in the matrix as already covered, listed as `mock-missing`/`mock-stale`, or marked as intentionally omitted/dev-only/end-state prototype. The riskiest coverage gaps before a mock update are: Voice editing/menu/detail flows, Manuscript and Publish old-action parity, the persistent global player, GitHub/plugin-registry install flow, XTTS/Voxtral repo-download migration, Integrations generate/retrieve flow, and release/demo-bundle dependencies.

## Execution Packets

Use Gemini Pro as the sub-orchestrator when available. If Gemini Pro is not available in the active tool context, Codex can run the same area split with lightweight read-only agents and then perform the final synthesis.

### Gemini Pro Orchestrator Packet

```json
{
  "role": "sub_orchestrator",
  "mode": "read_only_inventory",
  "repo": "/Users/stevendunn/GitHub-Steven/audiobook-factory",
  "goal": "Reconcile the current site mock against current app abilities, old text, release plans, and future roadmap labels before any mock/site edits.",
  "must_read_first": [
    "Memory/rules.md",
    "Memory/state.json",
    "Memory/active_context.md",
    "plans/site_redesign_rollout/10_mock_reconciliation.md",
    "plans/site_redesign_rollout/02_capability_inventory.md",
    "plans/site_redesign_rollout/99_progress_log.md",
    "plans/final_release/road_to_v2.md",
    "plans/site_experience_north_star.md"
  ],
  "dispatch": [
    "book_pipeline",
    "voices_voice_lab",
    "platform",
    "shell_activity_player_onboarding_copy",
    "release_showcase_demo_bundle"
  ],
  "non_goals": [
    "Do not edit code, mock files, docs, showcase files, or Memory.",
    "Do not infer that the mock is complete.",
    "Do not disable private mock controls just because the live app does not implement them yet.",
    "Do not treat private mock controls as public/release claims unless a plan says they are release scope."
  ],
  "required_agent_response_schema": {
    "area": "string",
    "missing_from_mock": ["string"],
    "stale_in_mock": ["string"],
    "missing_from_site": ["string"],
    "future_items": [{"item": "string", "classification": "release|post-v2|aspirational"}],
    "text_or_copy_gaps": ["string"],
    "evidence_paths": ["path:line or path#section"],
    "recommended_mock_updates": ["string"]
  },
  "final_response": "Return a deduped JSON array of area reports plus 5 highest-risk conflicts for Codex final review."
}
```

### Flash Packet 1 - Book Pipeline

```json
{
  "area": "book_pipeline",
  "task": "Inventory Manuscript, Casting, Studio, Review, Publish, old ProjectDetail, and old Chapter Editor abilities against the current mock.",
  "read": [
    "plans/site_redesign_rollout/02_capability_inventory.md",
    "plans/site_redesign_rollout/99_progress_log.md",
    "plans/site_experience_north_star.md",
    "frontend/src/demo/stages/siteMockup/panes/book.tsx",
    "frontend/src/demo/stages/siteMockup/panes/studio.tsx",
    "frontend/src/demo/stages/siteMockup/panes/publish.tsx",
    "frontend/src/pages/Book/",
    "frontend/src/pages/ProjectDetail/",
    "frontend/src/pages/ChapterEditor/"
  ],
  "focus": [
    "ProjectDetail abilities",
    "Chapter Editor abilities",
    "all action menus",
    "status/progress surfaces",
    "old help/empty-state copy",
    "future-state items such as sub-sentence assignment and AI casting",
    "future-state controls that should be interactive in the private mock"
  ],
  "return_schema": "area, missing_from_mock, stale_in_mock, missing_from_site, future_items, text_or_copy_gaps, evidence_paths, recommended_mock_updates"
}
```

### Flash Packet 2 - Voices / Voice Lab

```json
{
  "area": "voices_voice_lab",
  "task": "Inventory Voices, Voice Lab, voice editing, taxonomy, and HF plans against the current mock.",
  "read": [
    "plans/site_redesign_rollout/02_capability_inventory.md",
    "plans/site_redesign_rollout/99_progress_log.md",
    "plans/final_release/04_voice_metadata_and_tagging.md",
    "plans/final_release/road_to_v2.md",
    "frontend/src/demo/stages/siteMockup/panes/voices.tsx",
    "frontend/src/pages/Voices/",
    "frontend/src/pages/VoiceLab/"
  ],
  "focus": [
    "voice card ActionMenu",
    "edit metadata",
    "rename/default/delete/export",
    "Recording Guide",
    "samples/variants/test/script editor",
    "Taxonomy v2",
    "HF discover/publish labels"
  ],
  "return_schema": "area, missing_from_mock, stale_in_mock, missing_from_site, future_items, text_or_copy_gaps, evidence_paths, recommended_mock_updates"
}
```

### Flash Packet 3 - Platform

```json
{
  "area": "platform",
  "task": "Inventory Engines, plugin lifecycle, Integrations/API, and thin Settings against the current mock.",
  "read": [
    "plans/site_redesign_rollout/02_capability_inventory.md",
    "plans/site_redesign_rollout/99_progress_log.md",
    "plans/final_release/road_to_v2.md",
    "plans/site_experience_north_star.md",
    "frontend/src/demo/stages/siteMockup/panes/platform.tsx",
    "frontend/src/demo/stages/siteMockup/panes/settings.tsx",
    "frontend/src/pages/Engines/",
    "frontend/src/pages/Integrations/",
    "frontend/src/pages/Settings/"
  ],
  "focus": [
    "plugin import/install/update/trust",
    "plugin store future",
    "diagnostics",
    "API docs vs config controls",
    "LAN/API key/rate-limit future",
    "API generate-and-retrieve flow",
    "GitHub repo URL plugin install",
    "official plugin registry preview metadata and detail drawer",
    "XTTS and Voxtral standalone repo-download migration",
    "Settings abilities retained after thinning",
    "private mock future-state controls vs public release honesty"
  ],
  "return_schema": "area, missing_from_mock, stale_in_mock, missing_from_site, future_items, text_or_copy_gaps, evidence_paths, recommended_mock_updates"
}
```

### Flash Packet 4 - Shell / Activity / Player / Onboarding / Copy

```json
{
  "area": "shell_activity_player_onboarding_copy",
  "task": "Inventory shell, onboarding, queue/activity, global player, responsive, accessibility, and copy parity against the current mock.",
  "read": [
    "plans/site_redesign_rollout/02_capability_inventory.md",
    "plans/site_redesign_rollout/99_progress_log.md",
    "plans/master_agnostic_tasks.md",
    "plans/site_experience_north_star.md",
    "frontend/src/demo/stages/siteMockup/",
    "frontend/src/app/layout/",
    "frontend/src/components/queue/",
    "frontend/src/pages/Activity/",
    "frontend/src/pages/ProjectLibrary/"
  ],
  "focus": [
    "rail/topbar",
    "splash/startup/empty states",
    "old docs/help text",
    "queue drawer",
    "Activity entry points",
    "global player",
    "theme",
    "mobile drawer focus/Escape",
    "copy/text parity"
  ],
  "return_schema": "area, missing_from_mock, stale_in_mock, missing_from_site, future_items, text_or_copy_gaps, evidence_paths, recommended_mock_updates"
}
```

### Flash Packet 5 - Release / Showcase / Demo Bundle

```json
{
  "area": "release_showcase_demo_bundle",
  "task": "Inventory docs/demo, docs/v1.html, screenshots, release checklist wiring, and Pinokio/demo bundle dependencies.",
  "read": [
    "plans/final_release/road_to_v2.md",
    "plans/final_release/14_live_demo_revamp.md",
    "plans/final_release/16_pinokio_distribution.md",
    "plans/phases/phase_13_release_documentation_and_distribution.md",
    "plans/master_agnostic_tasks.md",
    "docs/v1.html",
    "docs/demo/",
    "frontend/src/demo/"
  ],
  "focus": [
    "showcase screenshot freshness",
    "release checklist scripts",
    "interactive demo rebuild",
    "Pinokio PK3/PK7/PK8",
    "demo bundle blocked by taxonomy v2",
    "release vs post-v2 vs aspirational labeling"
  ],
  "return_schema": "area, missing_from_mock, stale_in_mock, missing_from_site, future_items, text_or_copy_gaps, evidence_paths, recommended_mock_updates"
}
```

## Next Pass Order

1. Review this inventory with the owner and resolve the few classification questions: sub-sentence assignment release target, generic plugin setup loop, and API config timing.
2. Dispatch the Gemini Pro / Flash packets or equivalent read-only agents for conflict checking.
3. Update the mock only after the owner confirms the coordinated list.
4. Rebuild `docs/demo` only after the mock update is accepted.
5. Resume site work against the reconciled mock, starting with P0/P1 rows.
