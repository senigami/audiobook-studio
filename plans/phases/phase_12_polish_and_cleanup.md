# Phase 12: Polish And Cleanup

## Status

Planned next phase after Phase 11 closeout.

## Objective

Close the remaining product polish, manual verification, and structural cleanup items that are useful before release documentation, but are not blockers for Phase 11's v2-only runtime and engine-agnostic cleanup exit criteria.

Phase 12 exists to avoid mixing user-facing polish and remaining master-plan extras into the Phase 11 hard-cutover cleanup. It should produce a stable, easier-to-document Studio 2.0 baseline before Phase 13 release documentation and distribution work begins.

## Pre-Change Verification Audit Findings
- **Migration Idempotency**: [OK] Most migrations are idempotent. `import_legacy_filesystem_data` is not, but only used in tests.
- **Plugin Boundary Leaks**: [PHASE 12 CLEANUP] `plugin/core` code should be portable and must not reach into Studio persistence. `tts_voxtral/plugin/core/implementation.py` currently imports `app.db.state` and `app.db.speakers`; `tts_xtts/plugin/core/implementation.py` imports app behavior helpers for limits. `plugin/studio` imports are less severe because they are app-side adapters, but they still block the long-term downloadable-repo goal and should be moved behind an explicit Studio plugin context/contract.
- **Recovery and Failure Coverage**: [GAP] Basic recovery tests exist. Gaps include process-crash regression tests and mid-synthesis failure mocks.
- **Frontend State and Update Pressure**: [RISK] `useChapterEditorState` is a broad coordinator hook and `ScriptView` can create high render pressure through letter-by-letter span mapping. Confirm with profiling before refactoring. `live-jobs.ts` update pressure needs review for high-frequency websocket batches.
- **Helper/Service Ownership**: [RISK] Repository and service logic for Projects and Voices still lives in `api/routers/` helpers. Move only when touched for meaningful behavior or before Phase 13 if the helper boundary blocks documentation/API clarity.
- **Startup Resilience**: [OK] `boot.py` and `web.py` handle startup reconciliation and corrupt `state.json` reset safely.

## Scope

- [x] Complete Phase 12 pre-change verification audit.
- [x] Add chapter VCR-style playback controls: play, pause, stop, next, and previous.
- Manually verify Phase 11 fixed-but-pending app behaviors: engine settings tests, project load time, chapter render enqueue, duplicate voice option warnings, manifest test text, failed queue timestamps, server shutdown, and mixed render retry.
- Triage Vite websocket `ECONNRESET` logs and determine whether they are harmless reconnect noise or a lost-update path.
- Re-check project and chapter load performance on large books and trim obvious duplicate fetch or file-resolution hot paths.
- Implement or explicitly defer the generic plugin setup loop in `run.sh` and `run.ps1`.
- Complete the remaining master agnostic conversion in `plans/master_agnostic_tasks.md`, or explicitly mark individual items deferred with rationale before Phase 13.
- Resolve the remaining master agnostic architecture items: plugin documentation, plugin template docs, resource metadata in manifests, generic plugin setup loop, StorageManager, generic job handler registry, `JobKind`/`TaskType`, mixed-to-composite naming, generic route/doc cleanup, and final reference audits.
- Improve the Library main page with a list view and sort options.
- Improve plugin/voice management UX: dependency installation feedback, plugin compatibility verification, plugin import/delete flows, plugin-provided per-voice settings, voice icons, tags, and export layouts.
- Align first-party TTS plugins with real repository ingestion by planning XTTS and Voxtral Web as standalone repos that can run from a CLI and produce audio independently of Studio. Each repo includes a standalone CLI Builder Harness (static page) to help compose commands, while Studio Dev Mode provides the authoritative UI state preview.
- Clean up Chapter Editor UI and remove legacy Production, Performance, and Preview tab code now absorbed into the Script tab.
- Retire the legacy jobs request/response API path and move live job control/status messaging to WebSockets where practical.
- Review system API coverage for third-party/LLM controller use cases without building those integrations yet.
- Scan existing plans and memory for forgotten or leftover requests, including namespace rename requests such as `tts_plugins` and `tts_voices`.

## Non-Goals

- Do not reopen v1 compatibility or silent fallback behavior.
- Do not rename the `plugins/` namespace to `tts_engines/`; that remains a deferred structural phase.
- Do not add GitHub or Hugging Face direct download/search in the initial v2.0 release. Phase 12 may prepare upload/import-compatible contracts, but repository/search integrations are post-release.
- Do not build Claude, LLM, ElevenLabs, or other third-party controller plugins in Phase 12; only verify the API surface can support them later.
- Do not treat release notes, screenshots, install validation, or promotional materials as Phase 12 work; those now belong to Phase 13.
- Do not add broad rewrites when a focused polish fix or explicit deferral is enough.

## Work Board

| Area | Status | Notes |
| --- | --- | --- |
| Phase 12 pre-change verification | Complete | Audit is complete; findings are converted into Phase 12 cleanup items below. |
| VCR-style chapter playback controls | Complete | Play, Pause, Stop, Previous, and Next controls added to Chapter Editor. |
| Manual QA of Phase 11 fixed items | Open | Verify the app flows that tests covered but manual app checks have not confirmed. |
| Vite websocket `ECONNRESET` triage | Open | Classify as harmless reconnect noise or fix the lost-update path if reproducible. |
| Large-book project/chapter load timing | Open | Use focused timing probes before changing fetch or storage paths. |
| Generic plugin setup loop | Open | Launchers are sanitized, but the automatic loop across plugin requirements remains pending. |
| Plugin and template docs | Open | Update developer-facing docs enough that Phase 13 can build on correct architecture. |
| Library list view and sorting | Open | Add list view to Library main page and add sort options. |
| Voice and plugin UX | Open | Improve dependency install feedback, plugin lifecycle management, per-voice plugin settings, voice icons, tags, and export/import compatibility. |
| Standalone first-party TTS repos | Open | Prepare XTTS and Voxtral Web for real repo ingestion: each should be extractable as a repo with CLI audio generation and a standalone CLI Builder Harness. Studio Dev Mode is used for real UI preview. |
| Plugin boundary cleanup | Complete | `app.db`, app behavior, and app utility imports are removed from portable plugin core code. Trivial audio helpers and complex text/proc utilities were localized to plugin-core to ensure absolute portability for future standalone repos. |
| Plugin compatibility verification | Open | Check manifest contract version and expected callable signatures before runtime calls. |
| Chapter Editor cleanup | Open | Remove legacy Production, Performance, and Preview tabs/code after confirming Script tab owns their features. Rework crowded menu bar and duplicate preparing pill. |
| Queue output metadata | Open | Queue entries should show what was produced, including generated audio duration/length when available. |
| Legacy jobs request API retirement | Open | Audit remaining jobs request endpoints and clients; migrate live control/status messaging to WebSockets and keep only proven non-live REST endpoints. |
| API surface for third-party controllers | Open | Verify Studio API can support future LLM/control plugins without building those plugins yet. |
| Forgotten requests scan | Open | Search plans and memory for older requests such as namespace renames and classify them into Phase 12, Phase 13, or deferred. |
| Master agnostic conversion completion | Open | Work through `plans/master_agnostic_tasks.md`; complete remaining conversion items or mark each deferred with a clear reason before Phase 13. |
| Final reference audit | Open | Re-run app/core grep and classify retained engine names before Phase 13. |

## Pre-Change Verification Checklist

Complete this checklist before starting new Phase 12 feature work. The goal is to prove the Phase 11 restructure is stable enough for polish instead of discovering architectural breakage mid-feature.

### Architecture And Rules

- [x] Verify migration helpers in `app/db/migration.py` and `app/db/legacy_migration.py` are idempotent or explicitly guarded when run multiple times.
- [x] Verify repeated migration/reconciliation does not corrupt persistent state, settings, render history, project manifests, or voice manifests.
- [x] Audit `plugins/tts_xtts/` and `plugins/tts_voxtral/` for direct `app/db` imports. Plugin-specific code should use the engine SDK, plugin interface, manifest metadata, or bridge contracts rather than reaching into app persistence.
- [x] Audit first-party plugin imports for boundary leaks into app routes, app state writers, or non-contract orchestration internals.

### Recovery And Failure Coverage

- [x] Inventory recovery-path tests for worker failure mid-synthesis, TTS Server unavailable, interrupted jobs, partial artifacts, failed stitching, retry/requeue behavior, and startup reconciliation.
- [ ] Add or update focused tests for any critical recovery path that only has happy-path coverage.
- [ ] Verify failed jobs preserve useful timestamps, error details, retry state, and queue visibility after restart.

### Frontend State And Performance

- [x] Review `useChapterEditor.ts`, `useChapterEditorState.ts`, `ScriptView`, and related hooks for god-hook growth, excessive prop drilling, and unnecessary render churn.
- [x] Verify `frontend/src/store/live-jobs.ts` handles high-frequency websocket updates without unbounded updates, duplicated work, or main-thread lockups for large render batches.
- [x] Confirm the progress visualizer, top progress bar, and chapter text updates use the smallest necessary state surface.

### Technical Debt And Startup Resilience

- [x] Review helper-heavy modules such as `projects_helpers.py`, `voices_helpers.py`, and `textops_helpers.py` for responsibilities that should move to domain/service layers before Phase 13.
- [x] Audit corrupt-state handling, including any `state.json.corrupt` development artifacts, and verify startup validates or recovers persistent schema safely before release distribution.
- [x] Classify any helper/service refactor as Phase 12, Phase 13 documentation support, or deferred architecture work instead of mixing it into unrelated polish.

## Broad Phase 12 Goals

- Stabilize the product experience before documentation: playback controls, queue visibility, progress clarity, and manual QA of fixed flows.
- Reduce polish drag from hidden instability: recovery paths, startup resilience, websocket update pressure, and long-book load performance.
- Keep architecture honest after the file-structure shift: plugin isolation, service/domain ownership, and no app-level engine-name regressions.
- Decide the remaining master-plan extras pragmatically: complete only what improves Phase 13 readiness; explicitly defer larger architectural work that does not block release documentation.
- Make the core library/voice/plugin workflows feel complete enough for v2.0 users without depending on post-release marketplace/search integrations.
- Make voice assets easier to identify, search, export, and later map to Hugging Face-compatible layouts.
- Make Chapter Editor simpler by removing legacy tab surfaces and reducing toolbar clutter.
- Ensure external API/control surfaces are coherent enough for future Claude/LLM/controller plugins.

## Product Backlog

### Library

- [ ] Add a list view to the Library main page.
- [ ] Add sort options to the Library main page.

### Voice And Plugin Management

- [ ] Fix plugin dependency installation UX so the install button shows in-progress feedback and refreshes plugin state when installation completes.
- [ ] Fix XTTS dependency detection so installing dependencies resolves the missing-dependencies state when installation succeeds.
- [ ] Add TTS plugin import and delete flows similar to voice import/export. Initial v2.0 target is zip upload/import from a downloaded repo; GitHub search/download is post-release.
- [x] Define real standalone repo readiness for XTTS and Voxtral Web: repo layout, CLI entry point, dependency install path, and a standalone CLI Builder Harness.
- [x] Implement Studio Dev Mode as the authoritative UI preview path using plugin-provided scenario fixtures.
- [x] Remove direct `app.db` and app behavior imports from portable plugin core code. Prioritized `plugins/tts_voxtral/plugin/core/implementation.py` and `plugins/tts_xtts/plugin/core/implementation.py`.
- [x] Localize remaining plugin-core imports from shared app utility modules (`app.utils.text.textops`, `app.engines.audio_ops`, `app.engines.proc_utils`) into plugin-local core/helpers to ensure absolute portability for future standalone repos.
- [ ] Define an explicit Studio plugin context/contract for `plugin/studio` adapters so app persistence access is owned by Studio and passed into plugin-facing glue rather than imported ad hoc.
- [ ] Add plugin compatibility verification: declared plugin contract version, currently v1, plus expected callable existence and callable signature checks before Studio tries runtime calls.
- [ ] Surface plugin-defined per-voice controls on the voice settings UI when the selected plugin supports applying those settings per voice.
- [ ] Revisit voice settings placement. The current Script popup may be the wrong home; consider exposing voice settings in a dropdown within the voice UI instead of consuming the queue/right-side area.
- [ ] Make voice export bundles compatible with Hugging Face-style layouts where practical, including expected files and settings metadata.
- [ ] Evaluate whether Studio can use the same Hugging Face-style voice settings internally to simplify future Hugging Face import/download support.
- [ ] Add voice image/icon upload. Standardize to 1:1, auto-compress to JPG, and show the icon in voice lists and project character surfaces while preserving color assignment.
- [ ] Add a standard image-prompt template with fill-in fields for users who want to generate voice icons.
- [ ] Add voice tags similar to ElevenLabs categories so voices can be identified and searched by type, such as male, female, deep, western, narrator, character, accent, age, tone, and genre.
- [ ] Align voice tags with metadata likely to be useful for future Hugging Face-compatible voice search.

### Plugin And External API Contracts

- [ ] Verify the system API surface is sufficient for future third-party controller plugins such as Claude/LLM audio-generation workflows.
- [ ] Do not build the third-party controller plugin in Phase 12; only identify missing API controls and contract gaps.

### Queue And Output Metadata

- [ ] Update queue entries to show what each completed job produced, including generated audio duration/length when available.
- [ ] Remove the legacy jobs request/response API path after auditing remaining callers. Live job progress, control, and status messages should use WebSockets instead of waiting on jobs API requests.
- [ ] Add WebSocket coverage for job message delivery, reconnect behavior, failure handling, and any replacement control messages needed before removing REST jobs calls.

### Chapter Editor

- [ ] Remove legacy Production, Performance, and Preview tabs and related dead code after confirming their useful features are absorbed into the Script tab.
- [ ] Rework the crowded Chapter Editor menu bar into two lines or another clearer layout.
- [ ] Remove the extra `preparing` pill when the progress bar already says preparing.

### Planning Hygiene

- [ ] Complete the remaining `plans/master_agnostic_tasks.md` conversion checklist, or explicitly defer each unfinished item with rationale before Phase 13.
- [ ] Scan plans and memory for leftover or forgotten requests, including namespace rename requests such as `tts_plugins`, `tts_voices`, or similar.
- [ ] Classify each found request as Phase 12, Phase 13, post-release, or explicitly deferred.

## Exit Criteria

- Phase 12 pre-change verification is complete, with gaps converted into concrete tasks or explicit deferrals.
- VCR controls are implemented or intentionally deferred with a reason.
- Library list/sort, voice/plugin UX, standalone first-party TTS repo readiness, plugin compatibility checks, Chapter Editor cleanup, queue output metadata, and forgotten-request scan are completed or explicitly classified.
- Phase 11 fixed-but-pending manual QA items are verified, re-opened with concrete failures, or explicitly deferred.
- Remaining `master_agnostic_tasks.md` open items are completed or explicitly deferred with rationale.
- Focused backend/frontend tests and `git diff --check` pass for touched areas.
- `Memory/state.json`, `Memory/active_context.md`, and relevant plan files identify Phase 13 as the release documentation/distribution phase.
