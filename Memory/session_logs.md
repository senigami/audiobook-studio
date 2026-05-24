# 2026-05-23 - Audit and clean up backend websocket layer after frontend canonicalization

- Removed legacy `studio_job_event` and `job_updated` websocket frame emissions from `broadcast_job_updated` in `app/api/ws.py`.
- Canonicalized fallback generic `"job"` classification updates to emit `queue_item_status` events on the `queue.items` topic.
- Honored the `skip_studio_job_event` parameter to fully suppress generic job broadcasts when set.
- Removed the stale import of the retired `build_studio_job_event` builder function.
- Updated `tests/api/test_websocket_broadcast.py` and `tests/orchestration/test_progress_logic.py` assertions to expect the canonical envelopes, and deleted obsolete legacy context-propagation unit tests.
- Verified that all 893 backend tests, Ruff checks, and `git diff --check` passed successfully.

# 2026-05-23 - Remove frontend live-event compatibility shim and legacy normalization paths

- Deleted `frontend/src/store/liveEventTopicRouter.ts` and its unit test `frontend/tests/unit/store/liveEventTopicRouter.test.ts`.
- Removed all legacy normalization and fallback routing code in `frontend/src/api/contracts/liveEvents.ts`.
- Switched hooks `useJobs.ts` and `useQueueSync.ts` to subscribe directly to the websocket bus (`subscribeStudioSocketMessages`) and map canonical `studio_event` topics (`queue.items`, `chapters.progress`, `segments.progress`, `tts.logs`, etc.).
- Cleaned up frontend components and test files (`useJobs.test.tsx`, `useQueueSync.test.tsx`, `SettingsRoute.test.tsx`, `LiveOutputPage.test.tsx`, `LiveOutputTab.test.tsx`, `liveEventAuditStore.test.ts`, `App.test.tsx`) to publish canonical `studio_event` envelopes instead of raw legacy payloads.
- Verified: all 87 test files (577 tests) passed, frontend production builds cleanly, linter passes, and `git diff --check` passes cleanly.

# 2026-05-23 - Migrate segment-classified progress to canonical segments.progress studio_event

- Updated `build_segment_progress_event` in `app/api/contracts/events.py` to support `eta_seconds` and include legacy/active progress duplicate compatibility fields (`activeSegmentId`, `activeSegmentProgress`, `etaSeconds`, etc.).
- Rewired `broadcast_job_updated` in `app/api/ws.py` to broadcast canonical `segments.progress` once (respecting `skip_studio_job_event`) and returned early for `"segment"` classified jobs.
- Updated `ProgressService.publish` in `app/orchestration/progress/service.py` to transform segment-scoped updates (gated strictly on `scope == "segment"` to prevent misclassifying chapter updates) into canonical `segments.progress` envelopes.
- Updated unit tests in `tests/api/test_websocket_broadcast.py` and `tests/orchestration/test_progress_logic.py`.
- Verified: all 45 backend tests, 50 frontend tests, eslint, production build, and git diff check passed successfully.

# 2026-05-23 - Migrate chapter-classified progress to canonical chapters.progress studio_event


- Updated `build_chapter_progress_event` in `app/api/contracts/events.py` to support `job_id`, `project_id`, `source`, and backward-compatibility keys (`grouped_progress`, `eta_seconds`, etc.).
- Rewired `broadcast_job_updated` in `app/api/ws.py` to broadcast canonical `chapters.progress` once (respecting `skip_studio_job_event`) and returned early for `"chapter"` classified jobs.
- Updated `ProgressService.publish` in `app/orchestration/progress/service.py` to accept `chapter_id` and transform chapter-scoped progress events into canonical `chapters.progress` envelopes.
- Updated `recover` in `app/orchestration/scheduler/orchestrator.py` and `_publish` in `app/orchestration/scheduler/orchestrator_helpers.py` to pass `chapter_id` to `ProgressService.publish`.
- Added unit tests in `tests/api/test_websocket_broadcast.py` and `tests/orchestration/test_progress_logic.py`.
- Verified with backend tests, frontend tests, eslint, production build, and git diff check.

# 2026-05-22 - Migrate broadcast_project_updated to canonical projects.lifecycle studio_event


- Added `"projects.lifecycle"` to `CORE_TOPICS` in `app/api/contracts/events.py`.
- Implemented `build_project_lifecycle_event(project_id, reason, changed_fields, job_id, source)` helper in `app/api/contracts/events.py` with both camelCase `changedFields` and legacy `changed_fields` in the payload.
- Rewired `broadcast_project_updated` in `app/api/ws.py` to use the new builder and dispatch via `broadcast_studio_event`; legacy `project_updated` frame is gone.
- Added `'projects.lifecycle'` to `LiveEventTopic`, `'project'` to `LiveEventCategory`, `ProjectLifecyclePayload` / `ProjectLifecycleLiveEvent` types, and updated `categoryForTopic` in `frontend/src/api/contracts/liveEvents.ts`.
- Added `normalizeProjectLifecycle` normalizer and `'project_updated'` switch case to `normalizeStudioSocketEnvelope` in `frontend/src/api/contracts/liveEvents.ts`.
- Registered `project-state` listener consumer (listens to `projects.lifecycle`) in `frontend/src/config/liveEventConsumers.ts` for Live Output filter support; not wired to `recordLiveEventSubscriberObservation` so "Handled by" remains actual runtime telemetry.
- Backend tests: replaced `test_broadcast_project_updated_sends_structured_payload` with `test_broadcast_project_updated_sends_canonical_envelope`; extended `test_build_core_topic_helpers` with project lifecycle case.
- Frontend tests: added canonical and legacy normalizer tests in `liveEvents.test.ts`; added `project-state` filter button assertion and filter-by-topic integration test in `LiveOutputPage.test.tsx`.
- Verified: 30 backend tests passed, Ruff clean, 22 Vitest tests passed, frontend build clean, 0 lint errors, `git diff --check` clean.

# 2026-05-22 - Add transport facade for canonical websocket events

- Implemented `broadcast_studio_event` in `app/api/ws.py` to transmit prebuilt canonical envelopes over the ConnectionManager WebSocket without double-wrapping or payload modifications.
- Integrated `trace` logging into `broadcast_studio_event` to output key routing identifiers (topic, eventKind, jobId, etc.).
- Cleanly exposed the `broadcast_studio_event` facade and `StudioEventEnvelope` TypedDict shape in `app/api/contracts/__init__.py`.
- Added unit tests in `tests/api/test_websocket_broadcast.py` asserting exact transmittal and verifying legacy websocket emitters are not impacted.
- Verified backend pytest, Ruff, and `git diff --check` are 100% clean.

# 2026-05-22 - Implement Phase 1 of the Studio Event Broadcaster

- Defined the canonical `studio_event` version 1 envelope schema in `app/api/contracts/events.py`.
- Implemented strict topic-specific helper builders (`build_tts_log_event`, `build_queue_item_status_event`, `build_queue_item_invalidated_event`, `build_queue_paused_event`, `build_chapter_progress_event`, `build_segment_progress_event`, `build_segment_lifecycle_event`, `build_chapter_lifecycle_event`, `build_voice_test_progress_event`, `build_system_event`) that conform to the broadcaster plan.
- Implemented `build_plugin_event` with validation controls for plugin-private namespaces, preventing plugins from writing to core topics and ensuring valid alphanumeric format structures.
- Wrote full unit test coverage for the helpers and validation logic in `tests/api/test_websocket_broadcast.py` following TDD.
- Verified all backend tests pass and both Ruff linter and `git diff --check` are clean.


# 2026-05-22 - Create durable Studio Event Broadcaster contract plan document

- Authored [studio_event_broadcaster_contract.md](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/plans/implementation/studio_event_broadcaster_contract.md) defining the contract for the next event stream refactor.
- Specified the backend broadcaster architecture, canonical envelope structure, strict core topics (`queue.items`, `chapters.progress`, `segments.progress`, etc.), plugin-private namespaced topics (`plugins.<plugin_id>.<area>`), typed helper APIs, and consumer surface registries.
- Verified plan document formatting with `git diff --check`.

# 2026-05-22 - Rename Live Output Route to /event-stream & Add Consumer Filters

- Renamed standalone live output route from `/internal/live-output` to `/event-stream` in [App.tsx](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/frontend/src/app/App.tsx).
- Replaced the select dropdown filter in [LiveOutputTable.tsx](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/frontend/src/components/LiveOutputTable.tsx) with a segmented control button group (toggling between 'all', 'jobs-state', 'queue-sync', 'tts-diagnostics').
- Configured row filtering to query `record.subscribers` to filter rows by consumer observations.
- Resolved TS6198 compiler error in [LiveOutputTable.tsx](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/frontend/src/components/LiveOutputTable.tsx) by replacing unused destructured props with `_props`.
- Fixed testing query ambiguity in [LiveOutputPage.test.tsx](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/frontend/tests/unit/pages/LiveOutput/LiveOutputPage.test.tsx) by checking `data-frame-id` row attributes rather than searching text that conflicts with permanent filter buttons.
- Verified all 580 frontend unit tests pass successfully, the frontend production bundle compiles without issue, linter is clean, and `git diff --check` passes cleanly.

# 2026-05-22 - Extract LiveOutputTab into Standalone Page

- Extracted `LiveOutputTab` into a reusable component `LiveOutputTable` located under `frontend/src/components/LiveOutputTable.tsx`.
- Created the standalone internal page `LiveOutputPage` at `frontend/src/pages/LiveOutput/LiveOutputPage.tsx` which renders the table layout.
- Registered `/internal/live-output` in `frontend/src/app/App.tsx` as a route that is not advertised in the main navigation.
- Removed the "Live Output" tab and button from the Chapter Editor page (`ChapterEditorPage.tsx`) and tabs list (`EditorTabs.tsx`), replacing `LiveOutputTab.tsx` with a lightweight backward-compatibility wrapper pointing to `LiveOutputTable`.
- Updated unit tests in `LiveOutputTab.test.tsx` and `EditorTabs.test.tsx` to align with the new routing and extracted components, and added route-level verification in `App.test.tsx`.
- Verified that all 571 frontend unit tests pass successfully, the frontend production bundle builds cleanly, linter checks pass, and `git diff --check` shows no formatting anomalies.

# 2026-05-21 - Fix Voice Engine Drift Path & Clarify Default Policy Resolution

- Fixed voice engine resolution and normalization in [app/engines/voice_engines.py](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/app/engines/voice_engines.py) and [app/db/speakers.py](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/app/db/speakers.py) to pass `fallback_engine` as the `fallback` parameter of `normalize_tts_engine`.
- This ensures that configured defaults (e.g. `xtts` or `voxtral`) are correctly preserved during normalization even when the voice engine registry discovery lists are completely empty.
- Verified that all 19 tests in `tests/api/test_voice_engines_fallback.py` pass cleanly.
- Confirmed that the full pytest suite (871 tests passed, 2 skipped) executes successfully with zero failures and that code hygiene checks (`git diff --check` and Ruff) pass without issues.

# 2026-05-20 - Trimmed Redundant WebSocket Broadcasts

- Added support for a `skip_job_updated` parameter to the `update_job` function signature.
- Popped this parameter from the updates dictionary to avoid writing it to `state.json` and added it to the listener payload.
- Integrated `skip_job_updated` guard in `broadcast_job_updated` to skip the redundant `job_updated` broadcast when set, while keeping `studio_job_event` for active progress.
- Passed `skip_job_updated=True` in `OrchestratorHelpersMixin._publish` for active job status/progress updates, reducing active progress websocket chatter and React re-renders by 50%.
- Added TDD backend tests verifying behavior and confirmed no regressions on the full pytest suite (847 passed).

# 2026-05-20 - Fixed Subprocess Stream Buffering Delay (Unbuffered Readline)

- Switched `TtsServerWatchdog._drain_stream` to use a `readline()` generator loop if the stream has a `readline` method.
- This bypasses Python's internal read-ahead block-buffering for `TextIOWrapper` iteration when stdout/stderr is read from subprocesses, resolving the delay in receiving logs and job progress/status updates.
- Added a unit test `test_watchdog_uses_readline_to_avoid_buffering` in `test_watchdog_progress_logic.py` asserting that `readline` is called instead of iteration when present.
- Confirmed that all 840 backend unit tests pass successfully.

# 2026-05-20 - Restored Working Segment Progress and Highlighting Logic (Commit 3e44973)

- Reverted `ChapterEditorPage.tsx` and `ChapterHeader.tsx` back to commit `3e44973`'s simple, working behavior to address user feedback.
- Re-established segment-scoped composite keys (`${job.id}:${active_segment_id}`) in `PredictiveProgressBar` to trigger clean remounts on segment transitions.
- Restored `label="Segment Progress"` and verified that progress is tracked and displayed per segment, not overall chapter.
- Aligned text highlighting to directly consume `liveBarSegmentProgress` without complex over-engineered scaling or local interval calculations.
- Confirmed all 82 frontend unit test files (510 tests total) pass successfully.

# 2026-05-20 - Multi-segment Batch Progress Highlighting Stabilized

- Updated `chapterRenderRenderingBatchProgressById` in `ChapterEditorPage.tsx` to handle multi-segment render batches correctly.
- If the active job defines `active_render_batch_progress`, the UI uses it directly.
- Otherwise, it dynamically calculates the overall batch progress using segment text lengths to distribute segment-level progress across the entire multi-segment batch.
- Added a new integration test case `calculates overall batch progress across multiple segments in a batch` to `ChapterEditorPage.test.tsx` to verify correct character-based batch progress calculation.
- Verified that all 82 frontend test files (511 tests total) and all 780 backend pytest tests pass successfully with zero failures.

# 2026-05-20 - Frontend Unit Tests Repaired and Passing

- Fixed the `useWebSocket` mock in `App.test.tsx` by returning `sendMessage` to prevent `sendMessage is not a function` errors.
- Corrected the `UNVERIFIED` and `NOT READY` badge count assertion in `EngineCardInstall.test.tsx` to align with the canonical status mapping.
- Updated `ChapterEditor_Assets.test.tsx` to click `Export Audio Options` before selecting WAV/MP3 exports, and to target `Select Default Voice Profile for this chapter` instead of the outdated title.
- Added default engine fallback to tooltips and dropdown labeling in `CharacterSidebar.tsx` and `voiceProfiles.ts` when no enabled ready engine exists, resolving tooltip mismatches in `CharacterSidebar.test.tsx`.
- Updated zip import test in `SettingsRoute.test.tsx` to test the new file import flow and mock `importEnginePlugin`.
- Verified all 82 frontend test files (510 tests total) pass successfully with zero failures.

# 2026-05-20 - Trim Redundant WebSocket Broadcasts during Enqueuing

- Identified redundant `update_job` calls immediately following `put_job` within the `api_add_to_queue`, `api_bake_chapter`, and `api_generate_segments` endpoints.
- Removed these redundant calls to prevent duplicate emissions of initial `"queued"` statuses, reducing network traffic and frontend re-renders during startup.
- Authored a pytest integration regression test `test_api_add_to_queue_websocket_burst_no_redundancy` to assert only a single instance of `studio_job_event` (queued), `job_updated` (queued), `chapter_updated`, and `queue_updated` is broadcasted.
- Verified that all 21 tests in `tests/api/test_websocket_broadcast.py` and 26 tests in `tests/api/test_api_generation.py` pass cleanly.
- Confirmed `git diff --check` and Ruff linter report clean status.

# 2026-05-20 - Chapter Editor Stable Overall Progress Bar and Local Segment Derivation Fixed

- Resolved the progress bar "blips" and reset/remount issues by making the header `PredictiveProgressBar` use a stable job-level key and overall chapter-level progress.
- Decoupled the script editor's active segment progress animation from the header bar by computing active segment progress locally in `ChapterEditorPage.tsx` via `deriveActiveBatchProgress` and an interval timer.
- Simplified `ChapterHeader.tsx`'s hook `useChapterStatus` to calculate `liveSegmentProgressValue` as the overall job progress.
- Removed the 4-second completion delay for finished jobs in `ChapterList.tsx` (`pickActiveJob` helper), allowing done jobs to immediately reveal the audio controls.
- Modified tests in `ChapterHeader.test.tsx`, `ChapterHeaderProgressContract.test.tsx`, and `ChapterList.test.tsx` to assert the stable overall chapter progress behavior, the absence of segment-based remounts, and the immediate replacement of done jobs with audio player controls.
- Verified all 27 frontend tests across `ChapterHeader`, `ChapterHeaderProgressContract`, and `PredictiveProgressBarRendering` pass successfully, along with all 14 tests in `ChapterList.test.tsx`.

# 2026-05-18 - Chapter Editor Progress Bar Regression Fixed End-To-End

- Modified `PredictiveProgressBar.tsx` to smoothly animate `width` using actual `${localProgress * 100}%` under `'finalizing'` status instead of hardcoding to `'100%'` when not indeterminate.
- Added a `1500ms` terminal job bridging window in `ChapterHeader.tsx`'s `useChapterStatus` so completed jobs (status `'done'`, `'failed'`, or `'cancelled'`) stay mounted briefly, allowing the progress bar to complete its green 100% "Complete" animation before unmounting.
- Hardened the job completion bridge against infinite reschedule loops using an identity and status guard (`terminalJobIdBridgedRef`).
- Added a Vitest TDD test case in `PredictiveProgressBarLifecycle.test.tsx` verifying smooth finalizing progress animation.
- Added a Vitest TDD test case in `ChapterHeaderProgressContract.test.tsx` verifying the 1500ms done bridging and clean unmount lifecycle.
- Verified all 31 `PredictiveProgressBar` tests and all 13 `ChapterHeader` tests passed perfectly (44 tests total), with a successful production build and clean ESLint pass.

# 2026-05-18 - PredictiveProgressBar Segment Transition Reset And checkpointMode Fixed

- Replaced the Chapter Editor progress bar key with a segment-scoped composite key (`key={`${job.id}:${active_segment_id || 'none'}`}`) so active segment transitions trigger clean React remounts and prevent progress bar stuckness under `allowBackwardProgress={false}`.
- Updated `checkpointMode` in `ChapterHeader.tsx` to handle grouped chapter render jobs correctly by evaluating to `'queue'` when `render_group_count > 0` is true.
- Modified `ChapterHeader.test.tsx` and `ChapterHeaderProgressContract.test.tsx` unit tests to assert the correct composite key remount behavior and `'queue'` checkpointMode routing.
- Verified all related Vitest test suites (11 tests in ChapterHeader/ProgressContract and 19 tests in PredictiveProgressBar Timing/Lifecycle/Transitions) passed successfully.

# 2026-05-18 - Chapter Editor Progress Contract Aligned And Debug Copy Added

- Aligned the Chapter Editor progress prop contract with the working studio reference and added a copy-debug-state control so the live queue/progress bundle can be handed over without screenshots.
- Added a focused regression test that locks the ChapterHeader ETA basis fallback path, plus a toolbar test that proves the debug-copy handler is exposed when provided.
- Verified the ChapterHeader and ChapterEditor queue/progress Vitest slices, the frontend production build, ESLint, and `git diff --check`.

# 2026-05-18 - Chapter Editor Orphan Segment Progress Guarded

- Compared factory against the known-good `d7fda0a` checkout in `/Users/stevendunn/GitHub-Steven/audiobook-studio`; shared progress bar code matched, so the regression traced to backend payload contract drift.
- Fixed XTTS standard chapter rendering so pre-`[START_SEGMENT]` progress output no longer broadcasts `active_segment_progress` as an active segment value.
- Added backend and frontend regressions proving orphan `active_segment_progress` with no `active_segment_id` cannot drive the Chapter Editor progress bar to 100%.
- Verified plugin tests, Chapter Editor/progress Vitest slices, frontend build, frontend lint, Ruff, and `git diff --check`.

# 2026-05-17 - Chapter Editor Live Queue Selection Repaired

- Changed Chapter Editor to prefer the active live job over stale completed chapter jobs so queued spans and live render progress stay visible without a page reload.
- Tightened Chapter Editor completion refresh to choose the most relevant chapter job instead of the first matching row in the local job list.
- Verified the focused Chapter Editor and hook suites, plus the frontend production build and `git diff --check`.

# 2026-05-16 - TTS Server Verification Race Fixed

- Allowed synthesis to proceed while a plugin verification run is still pending, while still blocking failed verification and setup errors.
- Added regressions for the pending-verification and failed-verification synth cases in `tests/engines/test_tts_server_isolation.py`.
- Verified the TTS server isolation suite, bridge suite, and mixed chapter render integration test, plus `git diff --check`.

# 2026-05-16 - Legacy Jobs API Retired

- Removed the legacy jobs router, stale frontend jobs shims, and unused preview modal plumbing while preserving the WebSocket snapshot flow.
- Verified the backend API slices, frontend API/useJobs unit slices, frontend production build, and `git diff --check`.
- Marked legacy jobs API retirement complete in the Phase 12 board and refreshed the durable memory baseline.

# 2026-05-16 - TTS Plugin Zip Checklist Synced

- Marked TTS plugin zip import/delete flows complete in the Phase 12 and master-agnostic boards after the repo audit already confirmed the implementation.
- Checkpoint commit `62f37a3` recorded the checklist correction and left the worktree clean.
- Remaining next slices stay focused on legacy jobs API retirement, plugin output verification hooks, and voice icon/tag work.

# 2026-05-16 - Phase 12 Polish Progress Audit

- Conducted a systematic audit of Phase 12 and master-agnostic tasks against actual repository state.
- **Library list view and sorting**: Confirmed complete and verified with unit tests.
- **Plugin dependency UX**: Confirmed complete via Engines panel "Install Deps" action and XTTS-specific feedback.
- **Per-voice plugin settings**: Confirmed complete and rendered in ScriptEditor via JsonSchemaForm.
- **Plugin boundary cleanup**: Confirmed complete for portable core logic; studio adapters now handle app-specific bridges.
- Updated `plans/phases/phase_12_polish_and_cleanup.md` and `plans/master_agnostic_tasks.md` to reflect actual completion status.
- Explicitly deferred composite/mixed renaming to Phase 13 to maintain final-polish stability.
- **Phase 12 Audit Completion**: Reconciled the Phase 12 and Master-Agnostic boards against actual repo state.
- **Verified Complete**: Library list/sort, Plugin dependency UX, Per-voice settings, Plugin boundary cleanup, Chapter Editor tab removal, VCR controls, Plugin ZIP import/delete, Queue output metadata.
- **Updated Plans**: Synchronized `plans/phases/phase_12_polish_and_cleanup.md`, `plans/master_agnostic_tasks.md`, and `Memory/state.json` to reflect audited status.
- **Next Slice Selection**: Recommended **Legacy jobs API retirement** as the first implementation slice to resolve open Phase 12 items.

# 2026-05-15 - Standalone First-Party TTS Repo Readiness Added

- Added Phase 12 planning coverage for preparing XTTS and Voxtral Web as real standalone repos for future repo ingestion.
- Captured required readiness as repo layout, CLI entry point, dependency install path, and a smoke test that produces audio outside Studio.
- Captured the plugin-hosted web page mirroring the Studio TTS panel as an optional follow-up, not a release blocker.

# 2026-05-15 - Jobs WebSocket Cutover Verified

- Retired the legacy `GET /api/jobs` path and replaced jobs hydration with the `jobs_snapshot_request` / `jobs_snapshot` WebSocket flow.
- Extended the WebSocket hook to send outbound messages so `useJobs` can request snapshots without HTTP polling.
- Removed the stale `/api/jobs` mention from the API discovery fallback and the obsolete fallback comment in `useJobs.ts`.
- Verified the focused API and frontend test slices, `ruff check`, and `git diff --check`.

# 2026-05-15 - Storage Abstraction Layer Verified

- Fixed the storage abstraction and registry wiring lint regressions by restoring the missing local variables/imports in `projects_assembly.py`, `projects_backups.py`, `domain/projects/migration.py`, and `orchestrator_helpers.py`.
- Added the missing `StorageManager.list_projects()` helper needed by the settings router.
- Cleaned whitespace in the touched orchestration test files.
- Verified the focused API/orchestration/db test slice, `ruff check`, and `git diff --check`.

# 2026-05-14 - Phase 11 Closeout Planned And Phase 12 Created

- Fixed and verified the voice registry fallback path by replacing the missing `is_built_in` import with manifest-driven `is_engine_locally_available`.
- Added permanent regression coverage for TTS Server-unavailable voice listing behavior.
- Reconciled `plans/master_agnostic_plan.md` and `plans/master_agnostic_tasks.md` against actual app/plugin files and route searches.
- Marked Phase 11 closeout-ready and moved remaining polish/manual-QA work into new `plans/phases/phase_12_polish_and_cleanup.md`.
- Renamed the previous release documentation phase to `plans/phases/phase_13_release_documentation_and_distribution.md`.
- Added Phase 12 pre-change verification gates for migration idempotency, plugin boundary leaks, recovery coverage, frontend state/store pressure, helper/service ownership, and corrupt-state handling.
- Added the initial Phase 12 product backlog: Library list/sort, plugin dependency UX, plugin import/delete, plugin compatibility verification, per-voice plugin controls, voice settings placement, Hugging Face-compatible voice bundles, voice icons/tags, external controller API readiness, queue output metadata, Chapter Editor cleanup, and forgotten-request scanning.
- Marked direct GitHub plugin search/download, Hugging Face direct search/download, and actual Claude/LLM controller plugins as future/post-v2.0 work rather than Phase 12 implementation.
- Updated `Memory/state.json` and `Memory/active_context.md` so future sessions start from Phase 12 polish after the Phase 11 checkpoint.

# 2026-05-14 - XTTS Requirements Moved To Plugin

- Moved the full XTTS environment dependency list from root `requirements-xtts.txt` into `plugins/tts_xtts/requirements.txt`.
- Updated `run.sh`, `run.ps1`, and docs to install XTTS dependencies from the plugin-local requirements file.
- Deleted root `requirements-xtts.txt` after verifying no active launcher/doc references remain.
- Tightened launcher regression coverage so the plugin requirements file must include both adapter and heavy inference dependencies.
- Verified with focused launcher tests, shell/PowerShell syntax checks, and `git diff --check`.

# 2026-05-14 - Phase 11 Metrics Fallback Cleanup

- **Milestone**: Relocated generic baseline CPS fallback out of core config.
- **Action**: Moved `BASELINE_ENGINE_CPS` to `app/engines/behavior.py` (renamed to `DEFAULT_BASELINE_ENGINE_CPS`).
- **Action**: Removed stale `voxtral_enabled` settings mock from domain tests.
- **Verification**: Passed 64 tests across settings refactor, domain contracts, performance metrics, and ETA logic.
- **Result**: Core config is further sanitized of engine-specific historical fallbacks.

# 2026-05-14 - Phase 11 Behavior And Text Utility Cleanup Closed

- Relocated `SENT_CHAR_LIMIT` and `SAFE_SPLIT_TARGET` from core config to behavior-helper fallbacks in `app/engines/behavior.py`.
- Generalised the generic log tag in `synthesis_mixed` handler from `[voxtral-debug]` to `[mixed-render]`.
- Hardened the Voxtral manifest with explicit `text_chunk_limit`, `text_split_target`, and `progress_pattern` metadata.
- Updated all app and plugin (XTTS) imports to use the metadata-driven behavior helpers.
- Added permanent regression coverage proving the generic text utility defaults remain `500/250`.
- Verified locally with focused engine, utility, and plugin tests plus ruff and `git diff --check`.

# 2026-05-13 - Agent Rules Enhanced From Basis Practices

- Compared `/Users/stevendunn/GitHub/basis/.cursor/rules` against this repo's `.agent/rules/` and `Memory/rules.md`.
- Promoted applicable practices into local rules: tighter scope discipline, assumption surfacing, TDD red-green-refactor, test quality, self-review, review workflow, frontend TypeScript/React accessibility, backend idempotency/logging/error-boundary guidance, and avoiding one-off markdown summary files.
- Left Basis-specific stack, provider, citation, dashboard, Next.js, tRPC, Airflow, and Zoom rules out of this repo's guidance because they do not map cleanly to Audiobook Studio.

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
- Corrected the render visualizer to make the top progress bar represent the active render block for grouped jobs and to feed its displayed percent directly into ScriptView.
- ScriptView now maps that block percent across the active render batch's displayed character array while preserving sentence spans for voice assignment and controls.

# 2026-05-10 - Plugin-Local Render Speed Calibration

- Removed the obsolete global `audiobook_speed_multiplier` from performance metric normalization, DB writes, and legacy performance migration.
- Added plugin-local `computer_speed_multiplier` calibration persisted to each TTS plugin's `settings.json` after successful terminal render samples.
- ETA fallback now reads each plugin's saved speed multiplier when no engine CPS sample exists yet.
- Exposed the computed multiplier as a read-only setting on XTTS and Voxtral plugin settings screens.
- Verified focused backend storage/migration/ETA suites, engine/plugin health suites, focused settings UI tests, `git diff --check`, and frontend build.

# 2026-05-10 - Render Speed History Model Filter

- Added `tts_model` to SQLite render performance samples so completed render history can distinguish speed samples by the selected model inside a TTS plugin.
- Recorded model identity from synthesis settings, explicit job fields, speaker settings, or plugin settings when training successful render samples.
- Updated worker CPS training and startup ETA history selection to filter by engine plus model, while keeping aggregate render totals independent of model.
- Verified focused performance, migration, ETA, orchestrator, API engines, plugin loader, and TTS health suites, plus `ruff check` and `git diff --check`.

# 2026-05-10 - Plugin Computer Speed Display

- Changed plugin settings UI display for computed computer speed from the raw internal multiplier to characters per second.
- XTTS and Voxtral settings schemas now label the read-only value as `Computer Speed` and mark it for CPS formatting.
- Verified focused settings form/route tests, `git diff --check`, and frontend build.

# 2026-05-13 - Project Structure Rules Added

- Codified the desired human-readable frontend, backend, test, and plugin folder organization in `.agent/rules/modular_architecture.md`.
- Added frontend/backend rule-file pointers so agents preserve the standard React layout, backend layered packages, mirrored test directories, and plugin-local mini-repo boundaries during future cleanup work.
- Added root `AGENTS.md` as a concise router to `.agent/rules.md` and `Memory/` for agents that look for standard repository instructions.
- Verified the rules-only patch with `git diff --check` and `Memory/state.json` JSON parsing.

# 2026-05-13 - Frontend Engine Fallback Cleanup

- Replaced frontend voice UI `xtts` fallback literals with registry-derived `getDefaultEngineId(engines)` resolution in voice variant creation and character assignment availability checks.
- Added focused Vitest coverage for registry-derived defaults in `VoicesPage` and `CharacterSidebar`.
- Linked voice-modal engine labels to their selects so the tests can query the active engine control accessibly.
- Updated the Phase 11 task board to record the frontend fallback slice as fixed while keeping broader frontend cleanup open.
- Verified focused frontend tests, frontend production build, and `git diff --check`.

# 2026-05-13 - Backend Jobs/Queue Decommission Audit Completed

- Conducted a full audit and classification of remaining `app.jobs` compatibility surfaces.
- Migrated `conftest.py` cleanup logic to canonical `set_paused` and resource gate resets (`GpuAdmissionGate`, `ExclusiveAdmissionGate`).
- Removed `app/jobs/core_shim.py` and cleaned up stale `job_queue` patches in `tests/db/test_state_rules.py`.
- Verified the focused backend job, state, progress, plugin layout, and isolation tests (21 passed).

# 2026-05-13 - Decommissioned `/api/generation/enqueue-single`

- Audited and confirmed that `/api/generation/enqueue-single` was a stale compatibility route with no active frontend callers.
- Removed `api.enqueueSingle` from `frontend/src/api/index.ts` and cleaned up its unit tests.
- Deleted the `enqueue_single` route and `_single_job_title` helper from `app/api/routers/generation.py`.
- Removed 4 obsolete backend tests in `tests/api/test_api_generation.py`.
- Verified with backend tests (46 passed), frontend tests (5 passed), and a successful production build.

# 2026-05-13 - Backend Behavior Helper Hardening

- Generalized progress parsing by introducing a `progress_pattern` field in the plugin manifest.
- Migrated hardcoded XTTS progress parsing in `plugins/synthesis_mixed/handler.py` to a generic, manifest-driven regex contract.
- Normalized text sanitization limits (`text_split_target`) to be engine-metadata driven instead of using global constants.
- Updated `app/engines/behavior.py` with `get_progress_pattern` and `parse_engine_progress` helpers.
- Verified with a new dedicated test suite `tests/engines/test_progress_parsing.py` and existing handler/behavior tests (13 passed total).

# 2026-05-13 - Storage And Voice Asset Cleanup

- Removed root `engine_tests` from trusted config storage roots.
- Added manifest-backed test sample lookup so voice readiness checks the active engine's declared sample file instead of an app-level hardcoded model asset filename.
- Updated voice bundle export to include engine-declared test/model assets while keeping import validation restricted to approved payload names.
- Added regression coverage for Voxtral-style `voice.wav` readiness/export and unsupported binary bundle rejection.
- Marked the Phase 11 storage/output task as partial because project/chapter asset routes still need final classification.
- Verified focused API voice/project/engine suites, plugin-local suites, ruff, and `git diff --check`.

# 2026-05-13 - Public Asset Route Hardening

- Replaced broad `/projects` and `/out/voices` static file exposure with explicit public asset routes in `app/api/web.py`.
- Preserved project cover, assembled audiobook, audiobook sidecar, and voice preview sample URLs used by the app.
- Blocked public access to chapter text, project backups, voice manifests, voice profile metadata, and model assets.
- Added path traversal regression coverage, including a non-canonical project ID case that failed before the route helper fix.
- Kept the Phase 11 storage/output task partial because `xtts_audio` / `audio_out` migration references still need a separate classification slice.
- Verified focused API route suites, ruff, and `git diff --check`.

# 2026-05-14 - V1 Storage Utility Decommission

- Deleted stale `scripts/sync_durations.py` after confirming it had no active callers.
- Updated README, wiki, and planning docs so `xtts_audio` and `audio_out` are no longer described as active runtime output roots.
- Preserved `app/db/legacy_migration.py` and migration tests as the quarantine for legacy `audio_out` import behavior.
- Corrected master planning docs so `uploads` cleanup remains pending as a separate audit.
- Marked Phase 11 Storage and output routes complete while leaving unrelated storage abstraction and uploads work on their own task lines.
- Verified migration tests, remaining storage-reference classification, and `git diff --check`.

# 2026-05-14 - Uploads Legacy Cover Audit

- Removed the unused `COVER_DIR` import from `app/api/routers/projects_helpers.py`.
- Added migration regression coverage proving `/out/covers/{file}` project references are copied into `projects/{project_id}/cover/` and rewritten to `/projects/{project_id}/cover/{file}`.
- Confirmed `migrate_legacy_project_covers()` already runs at startup and did not add a duplicate bootstrap path.
- Updated planning docs so `uploads` audit/migration is done but physical `uploads/` deletion stays pending while `/out/covers` compatibility exists.
- Verified project cover, web endpoint, migration, and audiobook assembly tests, plus ruff and `git diff --check`.
# 2026-05-14 - Phase 11 Bootstrap and Launcher Sanitization

- Relocated XTTS environment requirements from root `requirements-xtts.txt` to `plugins/tts_xtts/requirements.txt`, making the XTTS plugin own its full dependency set.
- Extracted hardcoded Coqui/XTTS conflict detection and environment health checks from `run.sh` and `run.ps1` into a unified plugin-local script: `plugins/tts_xtts/scripts/check_env.py`.
- Generalized launcher environment synchronization to automatically detect and execute plugin-local `check_env.py` scripts if present, removing hardcoded "XTTS" logic branches.
- Renamed `XTTS_VENV` to `TTS_ENV_DIR` in launchers while maintaining backwards compatibility with the `XTTS_ENV_DIR` environment variable.
- Updated `README.md` and `wiki/Getting-Started.md` to describe environment setup in engine-agnostic terms.
- Added permanent regression tests in `tests/core/test_launcher_agnosticism.py` asserting no root requirements references, full plugin ownership, and removal of inline conflict logic.
- Verified with focused launcher tests, bash/powershell syntax checks, and a repository-wide reference audit.

# 2026-05-14 - Phase 11 Frontend Engine-Agnostic Closure

- Audited `frontend/src` for hardcoded engine-specific strings and identified `ProjectLibraryPage.tsx` as the remaining runtime coupling point.
- Removed the static "Model: XTTS-v2" hero badge copy and replaced it with generic product copy ("Plugin-powered TTS") to ensure the UI remains engine-agnostic.
- Classified existing engine-specific strings in `frontend/tests` as valid test fixtures/data that do not imply core app runtime coupling.
- Added a permanent regression test in `ProjectLibraryPage.test.tsx` to assert that no static XTTS-v2 copy appears in the hero section.
- Verified the fix with focused Vitest tests and a successful production frontend build (`npm run build`).
- Updated the Phase 11 task board to mark the frontend engine-agnostic cleanup as complete.

# 2026-05-14 - Phase 12 Pre-Change Verification Audit

- Completed comprehensive audit of migration idempotency, plugin boundary leaks, recovery coverage, frontend state pressure, and service ownership.
- **Boundary Finding**: Identified direct Studio imports in `tts_xtts` and `tts_voxtral`. Portable `plugin/core` imports of `app.db` or app behavior helpers are Phase 12 cleanup violations; `plugin/studio` imports are app-side adapter debt that should move behind an explicit Studio plugin context/contract.
- **Risk Identified**: `useChapterEditorState` and `ScriptView` letter-by-letter span rendering may create frontend performance pressure for large books; profile before broad refactoring.
- **Verified**: Startup reconciliation and corrupt-state handling (`state.json.corrupt`) are robust and functional.
- **Updated Plans**: Updated `plans/phases/phase_12_polish_and_cleanup.md` with detailed audit findings and marked audit task as complete.

# 2026-05-14 - Phase 12 Plugin Core Boundary Cleanup Verified

- Removed direct `app.db` and `app.engines.behavior` imports from portable plugin core code in XTTS and Voxtral.
- Added `tests/engines/test_plugin_boundary_leak.py` to prevent plugin core from importing `app.db`, `app.api`, `app.orchestration`, `app.jobs`, or `app.engines.behavior`.
- Verified with plugin boundary tests, XTTS/Voxtral plugin tests, plugin layout contracts, focused ruff, and `git diff --check`.
- Left broader portability work open: plugin core still imports shared app utilities such as `app.utils.text.textops` and `app.engines.audio_ops`, which may need a plugin SDK/common package before standalone plugin repos.

# 2026-05-14 - Phase 12 Chapter VCR Visual Refinement

- Refined the Chapter Editor VCR controls after visual review: removed visible Play/Pause text, changed the controls from blue primary styling to compact neutral icon buttons, and moved them into the ScriptView toolbar near the text area.
- Added/updated regression tests to keep Play/Pause icon-only while preserving accessible labels and to assert the controls are mounted inside the ScriptView toolbar.
- Verified with focused VCR tests, the full ChapterEditor Vitest suite, frontend production build, and `git diff --check`.

# 2026-05-14 - Phase 12 Library List And Sort Controls Verified

- Added Project Library grid/list view controls while preserving grid as the default view.
- Added sorting by recently updated, newest first, title A-Z, and title Z-A.
- Added a responsive list view with cover, title, author, series, updated date, and project actions.
- Verified with `cd frontend && npx vitest run tests/unit/pages/ProjectLibrary`, `cd frontend && npm run build`, and `git diff --check`.

# 2026-05-15 - Phase 12 TTS Plugin Dependency Install UX Verified

- Improved Settings engine dependency install UX: Install Deps now shows an installing state, disables duplicate clicks, reports failures, and refreshes engine status after completion.
- Hardened frontend API error parsing so FastAPI `detail` messages are surfaced in install failure notifications.
- Fixed XTTS dependency probing by moving the plugin-local Idiap fork requirement to the direct-reference distribution name `coqui-tts`, matching the fork metadata while preserving runtime `TTS` imports.
- Replaced environment-dependent dependency parser tests with deterministic monkeypatched distribution checks.
- Verified with focused Settings Vitest tests, engine dependency/API/health pytest coverage, ruff, frontend production build, and `git diff --check`.

# 2026-05-15 - Voxtral Verification Settings Fix

- Fixed Settings engine cards so Install Deps only appears for real missing Python dependencies, not for cloud/API setup issues such as a missing Voxtral API key.
- Updated TTS Server status/enablement checks to pass persisted engine settings into settings-aware plugin `check_env` methods.
- Updated verification to pass persisted engine settings into plugin `run_test(settings=...)` methods when supported, allowing Voxtral verification to use the saved Mistral API key.
- Updated Voxtral server plugin methods to accept settings during `check_env`, `verify`, and `run_test` while preserving environment-variable fallback.
- Cleared stale setup messages once saved settings make the engine no longer `needs_setup`, and passed saved settings into the Mistral model-list connectivity check used during verification.
- Verified with focused TTS Server health, verification isolation, Voxtral plugin, engine API, dependency parsing, Settings Vitest tests, ruff, and `git diff --check`.

# 2026-05-15 - Phase 12 Jobs API Retirement Added

- Added legacy jobs request/response API retirement to the Phase 12 plan.
- Direction: audit remaining jobs REST callers, move live progress/control/status messaging to WebSockets, and keep only proven non-live REST endpoints.
- Added WebSocket replacement coverage expectations for delivery, reconnect behavior, failure handling, and control messages before removing jobs API calls.

# 2026-05-15 - Phase 12 Master Agnostic Completion Added

- Updated Phase 12 planning so completing the remaining `plans/master_agnostic_tasks.md` conversion checklist is an explicit Phase 12 requirement.
- Phase 12 exit criteria now require remaining master agnostic items to be completed or explicitly deferred with rationale before Phase 13.

# 2026-05-15 - Phase 12 Storage Abstraction Layer Checkpoint Ready

- Confirmed the storage abstraction refactor is checkpoint-ready after cleaning whitespace and removing test-output artifacts.
- `StorageManager` and `ProjectContext` centralize path resolution, and `git diff --check` passes on the current tree.

# 2026-05-15 - Plugin Developer Mode Scenario Audit

- Audited Antigravity's plugin developer mode and Settings engine-card changes before checkpoint.
- Found and fixed the root issue: scenario fixtures were being treated like full engine objects, allowing identity/name/capability changes and shallow schema replacement.
- Hardened scenario merging so identity metadata stays live and partial `settings_schema` overrides deep-merge instead of dropping fields.
- Moved plugin field visibility back to schema-owned flags: XTTS hides the full settings panel while not ready; Voxtral keeps API key visible while unverified and restores Model, Output Format, and Computer Speed when verified.
- Verified with focused Settings Vitest tests, engine API and health pytest coverage, frontend build, frontend lint, ruff, and `git diff --check`.

# 2026-05-15 - Multilingual Voice/Text Language Planning Captured

- Added Phase 12 planning notes for multilingual voice/text language support without implementing it in the current engine-dev slice.
- Direction: engine manifests define the master list of allowed language codes; voice profiles store a default language selected from the active engine; newly assigned chapter text presets to the voice default; individual sentences, segments, or production blocks can override language; synthesis sends the resolved language instead of assuming English.

# 2026-05-15 - Plugin Dev Mode Safety Checkpoint

- Committed the dev-mode safety slice after verifying it locally.
- The `/dev/scenarios` endpoint now rejects disabled dev mode, and the UI hides the developer panel when `dev.enabled` is false.
- Verified with targeted backend/frontend tests plus build, lint, ruff, and diff checks before checkpointing `b891f56`.

# 2026-05-15 - Plugin Manifest Compatibility Verification Checkpoint

- Audited Antigravity's plugin compatibility verification work and found broader plugin-loader regressions before checkpoint.
- Fixed the contract boundary: parseable manifest validation failures now surface as `invalid_config`, while missing/malformed manifests and runtime import/init/check crashes remain isolated from healthy engines.
- Added permanent plugin-loader and health coverage for `studio_tts_manifest`, invalid callable formats, invalid config health degradation, pip plugin defaults, and updated test manifests.
- Updated the plugin guide/template and wiki changelog, then checkpointed commit `9a7f510`.
- Verification: `tests/engines` passed, focused engine API/loader/health suites passed, Ruff passed, template manifest JSON validated, and `git diff --check` passed.

# 2026-05-16 - Developer Plugin Diagnostics Surfaced Safely

- Extended the plugin-loader contract so dev-enabled runtime import/init/check crashes surface as `invalid_config` for authors while normal plugins stay isolated.
- Made engine detail payloads safe for invalid-config plugins with no engine object, and propagated exact load/setup messages through `setup_message`, `health_message`, and `verification_error`.
- Preserved `check_env()` failure messages in the Settings-facing detail payload so plugin authors see the exact missing setup step.
- Verified with focused plugin-loader, health, and engine API pytest coverage plus Ruff and `git diff --check`, then checkpointed commit `6e48f22`.

# 2026-05-16 - Engine Dev Panel Diagnostics Checkpoint

- Added inline scenario-load error feedback to the Settings engine developer panel and appended those failures to the dev console.
- Logged real action failures to the dev console when dev mode is enabled, while preserving the existing user-facing notifications.
- Added focused unit coverage for scenario-load failure reporting and real action failure logging, then verified the slice with Vitest, build/lint checks, and `git diff --check` before checkpointing commit `c2bbc6a`.

# 2026-05-16 - Plugin Dev Scenario Validation Checkpoint

- Added backend validation for developer scenario fixtures so malformed JSON, invalid root shape, missing required fields, and invalid `id`/`label`/`engine_detail` types return actionable 400 errors.
- Documented the developer scenario contract in the plugin guide, including identity protection and deep-merge behavior, and recorded the behavior in the changelog.
- Verified with focused engine API pytest coverage, EngineCard Vitest coverage, Ruff, and `git diff --check`, then checkpointed commit `d5a1544`.

# 2026-05-16 - Plugin Dependency Install Refresh Checkpoint

- Hardened plugin dependency installation refresh so the Settings UI refreshes after both success and failure.
- After successful installs, the TTS Server now re-runs `check_env()` for loaded plugins and attempts targeted reload for plugins previously blocked by missing imports.
- Added focused frontend coverage for install busy/success/failure refresh behavior and backend coverage for post-install setup-message refresh plus plugin reload recovery.
- Verified with focused engine API, plugin dependency parsing, TTS server health, EngineCard Vitest, Ruff, and `git diff --check`, then checkpointed commit `ccdc20e`.

# 2026-05-16 - Plugin Lifecycle And Compatibility Checkpoint

- Completed the Phase 12 plugin lifecycle batch: zip import, uninstall/delete, settings schema validation, compatibility hardening, docs updates, and Settings UI polish.
- Zip import now validates archive safety and schema contract before accepting plugins; uninstall protects built-in plugins, shuts down engines before removal, and shows busy feedback.
- Plugin discovery now verifies required `StudioTTSEngine` contract methods before Studio attempts runtime calls.
- Verified with focused engine API, plugin-loader, and EngineCard tests plus `git diff --check`, then checkpointed commit `08dac04`.

# 2026-05-16 - Per-Voice Plugin Settings Save Flow Checkpoint

- Threaded plugin-owned per-voice settings through the Voice Settings drawer and preserved the current engine/test_text metadata path in the generic profile settings endpoint.
- Filtered the drawer save payload down to plugin-owned settings before posting, so stale profile metadata does not trip the plugin allowlist.
- Added regression coverage for requested-engine validation and stale-setting filtering, then verified with voice API tests, speaker-profile tests, the new hook test, the ScriptEditor test, frontend build, Ruff, and `git diff --check`.
- Checkpointed commit `030bbf0`.

# 2026-05-16 - Chapter Editor Playback Controls Checkpoint

- Moved Chapter Editor playback controls into a persistent footer so transport stays visible across tabs, added seek/progress state plus the active segment label, and wired Space/Escape keyboard shortcuts with modal-safe scoping.
- Hardened playback lifecycle cleanup for chapter switches and unmounts, tightened unit coverage for the hook and controls, and verified the slice with Vitest, frontend build, and `git diff --check`.
- Checkpointed commit `2c704e9`.

# 2026-05-16 - Chapter Editor Production Tab Removal Checkpoint

- Removed the remaining Chapter Editor Production tab surface and deleted the obsolete frontend-only Production tab implementation, helpers, and tests.
- Preserved the underlying production-block data flow so source-text resync and chapter loading continue to work without the tab surface.
- Verified the tab consolidation with the Chapter Editor Vitest suites, frontend build, and `git diff --check`, then checkpointed commit `29d6979`.

# 2026-05-16 - Production Block Infrastructure Pruning Checkpoint

- Removed the legacy production-block domain, API, frontend, and test surface after confirming the live Chapter Editor is unified on the ScriptView segment model.
- Kept source-text resync and chapter-loading behavior intact while deleting dead production-block endpoints, helpers, models, and mocks, and hid the redundant header queue badge during active render progress.
- Verified with the Chapter Editor Vitest suites, chapter API tests, frontend build, Ruff, and `git diff --check`, then checkpointed commit `1063fd6`.

# 2026-05-16 - Chapter Editor Queue Test Drift Fix

- Re-aligned `frontend/tests/unit/components/chapter/ChapterEditor_Queue.test.tsx` with the current ChapterHeader and ScriptView behavior after the production-block cleanup.
- Added ready engine metadata to the queue and generation fixtures and removed stale duplicate status assertions that no longer match the live UI.
- Verified with focused Vitest, frontend build, `git diff --check`, a successful pre-push hook run, and a pushed checkpoint at commit `68643c0`.

# 2026-05-16 - Chapter Editor Header Menu Bar Cleanup

- Reworked the ChapterHeader into a two-row layout to reduce crowding while keeping the same actions available.
- Kept navigation and save status on the top row, and grouped generation, progress, audio, export, and commit controls on the second row.
- Verified with focused Chapter Editor Vitest coverage, frontend build, and `git diff --check`.

# 2026-05-16 - Chapter Editor Header Refinement Verified

- Moved the default voice selector to the top of the character sidebar.
- Consolidated exports into a kebab menu and shifted save status, rebuild, and the chapter audio playbar into the Script/Source Text toolbar area.
- Verified the refined layout with ChapterEditorPage, ChapterHeader, and CharacterSidebar Vitest coverage plus frontend build and `git diff --check`.

# 2026-05-16 - Chapter Editor Toolbar Order Tweak Verified

- Reordered the Script/Source Text toolbar strip so the chapter audio bar comes first, then the rebuild action, then the saved status indicator.
- Kept the same behavior and responsive wrapping while improving the visual hierarchy in the header area.
- Verified with the Chapter Editor Vitest suites, frontend build, `git diff --check`, and checkpointed commit `f7ef5fc`.

# 2026-05-16 - Phase 12 Plan Boards Synced

- Marked Chapter Editor cleanup complete in `plans/phases/phase_12_polish_and_cleanup.md` and `plans/master_agnostic_tasks.md`.
- Checkpointed the docs sync at commit `9bbdfef` after `jq empty Memory/state.json` and `git diff --check` passed for the touched planning files.
- Next active Phase 12 candidate is queue output metadata.

# 2026-05-16 - Queue Output Metadata Verified

- Added queue API enrichment from chapter audio metadata and the latest render performance sample for each job.
- Completed queue history now shows generated audio duration plus content metrics when available.
- Added permanent backend and frontend regression coverage for completed queue metadata.

# 2026-05-17 - Chapter Audio Finalization Fallback Fix

- Recovered chapter audio completion for successful single-segment renders when the stitch helper returns success but leaves no final WAV on disk.
- Recorded `output_file` metadata on completed bake jobs so queue history has the produced asset reference.
- Verified the handler and queue-generation path with focused pytest coverage before checkpointing commit `0096f4f`.

# 2026-05-17 - Queue Failure Reason Surfacing

- Persisted queue failure reasons in `processing_queue`, forwarded them through websocket job overlays, and rendered them in the Global Queue history.
- Added regression coverage for queue error persistence and the history row reason line, then verified with queue/db pytest coverage, the XTTS plugin suite, the queue unit test, frontend build, and `git diff --check`.
- Checkpointed commit `7a8fe58`.

# 2026-05-17 - Voxtral Rendering Backlog Added

- Added Voxtral segment and bake rendering plus default voice fallback drift to the Phase 12 and master-agnostic task boards.
- Reflected the new backlog in `Memory/state.json` so future handoffs keep the missing Voxtral render path and voice-default drift visible.

# 2026-05-18 - Voxtral Default Voice Drift and Disablement Fallback Fixed

- Fixed the backend voice fallback resolution so that disabled voice engines (e.g. Voxtral) are filtered out inside `get_default_profile_engine` and `normalize_tts_engine` rather than being allowed as default or effective voices.
- Fixed the frontend default voice resolution in `getDefaultVoiceProfileName` to filter out voices belonging to disabled engines.
- Surfaced a beautiful, premium warning card on both the Project Detail and Chapter Editor pages if the default voice is disabled/unavailable, prompting user action instead of silently switching.
- Prevented the frontend from silently persisting transient default fallbacks to the database during hydration or queueing.
- Wrote comprehensive backend (python/pytest) and frontend (vitest/typescript) unit tests to ensure fallback and disablement logic is robustly validated.

# 2026-05-18 - Orchestration Test Suite Stabilized

- Corrected import of EngineUnavailableError to app.engines.errors in app/orchestration/scheduler/orchestrator_helpers.py to ensure that retriable job schedules are correctly routed.
- Patched JobHandlerRegistry.get_handler in tests/orchestration/test_submit.py, tests/orchestration/test_synthesis_task_and_resources.py, and tests/orchestration/test_voices_orchestration_integration.py to bypass system-registered handlers during mock dispatch.
- Hardened timing and mock assertions in record_render_stats_if_completed.
- Successfully verified 100% test pass rate across the entire orchestration test suite.

# 2026-05-18 - Global Queue Chapter Scope Restored

- Narrowed `isSegmentScopedJob` so `active_segment_id` no longer hides grouped chapter jobs from the main queue once rendering starts.
- Kept true segment-scoped jobs filtered from the global queue while preserving Chapter Editor segment highlighting.
- Added regression tests for chapter jobs with active segment progress and verified the targeted frontend queue, hydration, and job-selection tests pass.

# 2026-05-18 - Websocket Source Tagging Added

- Added a `source` field to websocket payloads and inferred the emitting backend function or callsite so queue chatter can be traced without scraping console noise.
- Updated the frontend websocket debug ring buffer to record `source` alongside the raw payload and key message fields.
- Verified the backend websocket broadcast tests, progress-service payload tests, and frontend websocket capture tests pass after the contract change.

# 2026-05-18 - Websocket Classification Added

- Added an explicit `classification` field to websocket job payloads so chapter-level queue rows can be distinguished from segment-scoped child jobs without relying on title heuristics.
- Threaded the classification through the live overlay store, queue hydration, queue selection, and websocket debug capture.
- Removed the stale websocket debug-trail mirroring from `useJobs` so only the dedicated websocket ring buffer records inbound socket traffic.
- Verified the backend websocket broadcast tests, frontend websocket capture tests, queue hydration tests, queue sync tests, and frontend build/type-check pass after the contract update.

# 2026-05-18 - Listener-Owned Websocket Logging

- Moved websocket debug recording into the consuming listener path so the debug buffer reflects handled messages instead of raw socket transport frames.
- Kept `useWebSocket` transport-only and continued threading raw payload text to listeners for traceability.
- Verified the frontend websocket capture, listener logging, queue sync, and hydration tests pass after the logging shift.


# 2026-05-19 - XTTS Handler Logger Restored

- Added a module-level logger to `plugins/tts_xtts/plugin/studio/handler.py` so the standard/bake/segments handlers can log bridge exceptions without crashing the job.
- Added a regression test asserting the xtts studio handler facade exports `logger`.
- Verified the targeted `plugins/tts_xtts/tests/test_handler.py` and `plugins/tts_xtts/tests/test_jobs_extended.py` suite passes after the fix.

# 2026-05-19 - "finalizing" Job Status Eliminated

- Implemented centralized remapping of the `"finalizing"` job status to `"running"` at the database boundary (`put_job` and `update_job` in `app/db/state_jobs.py`).
- Added status remapping to `"running"` in orchestrator broadcasts (`OrchestratorHelpersMixin._publish` in `app/orchestration/scheduler/orchestrator_helpers.py`) and progress service publishing (`ProgressService.publish` in `app/orchestration/progress/service.py`).
- Fixed custom title, author, and narrator metadata mapping fallback in the legacy task job shim (`_context_to_job` in `app/orchestration/scheduler/orchestrator_helpers.py`).
- Added unit tests `test_finalizing_status_mapped_to_running()` and `test_publish_remaps_finalizing_to_running()` in `tests/db/test_state_rules.py` and `tests/orchestration/test_progress_service.py`.
- Updated the audiobook assembly integration test to be robust to positional/keyword arg calling patterns in `tests/orchestration/test_assembly_orchestration_integration.py`.
- Verified that all 833 tests pass successfully.

# 2026-05-20 - XTTS Progress/ETA Volatility Stabilized & Synthesis Timeout Increased

- Identified that segment-level progress regressions in the XTTS standard handler (e.g. active segment progress resetting from 100% to 20% on next segment start) were causing backend ETA projections to fluctuate wildly.
- Enforced monotonic progress reporting in `OrchestratorHelpersMixin._get_grouped_progress` using a `max_progress` list container that caches and clamps progress value to the highest seen so far during the task run.
- Fixed database-level ETA projection in `update_job` within `app/db/state_jobs.py` to use the clamped, database-aligned progress value from the updated state dictionary (`j`) instead of the raw `updates` payload.
- Increased the synthesis HTTP client read timeout (`_READ_TIMEOUT`) from 60 seconds to 300 seconds to prevent slow synthesis operations (such as long chapters) from timing out and failing jobs at the end of the run.
- Added regression tests `test_log_listener_progress_is_monotonic()` in `tests/orchestration/test_watchdog_progress_logic.py`, `test_eta_projection_uses_clamped_progress()` in `tests/db/test_state_rules.py`, and `test_synthesize_uses_large_read_timeout()` in `tests/engines/test_tts_client.py`.
- Verified that all 836 tests pass successfully.

# 2026-05-20 - Chapter List Done Job UI Persistence Added

- Added a 4-second persistence delay for completed jobs in `ChapterList.tsx` to let the progress bar finish its 100% animation and show the completed state indicators (green checkmark, Done label) before unmounting and revealing the audio player.
- Checked if the chapter has been explicitly requeued (`audio_status === 'processing'`) to bypass the persistence window so that new jobs immediately render the fresh queue/preparing state.
- Added new Vitest unit tests in `ChapterList.test.tsx` verifying the 4-second completion state retention and eventual unmount behavior.
- Successfully verified that all 15 Vitest tests for the Chapter List pass.

# 2026-05-20 - Passed task_id to generate_via_bridge to Eliminate Progress Race Conditions

- Updated the signature of `generate_via_bridge` in `app/jobs/handlers/bridge_helpers.py` to explicitly accept `task_id` and added it to the synthesis request payload.
- Updated job handlers across XTTS, Voxtral, and Synthesis Mixed plugins to pass their currently executing job's `jid`/`task_id` into `generate_via_bridge`.
- Added unit test `test_generate_via_bridge_propagates_task_id` in `tests/bridge/test_bridge_helpers.py` to verify that `task_id` is propagated correctly.
- Confirmed all 841 backend tests passed successfully.

# 2026-05-20 - Temporary Live TTS Communication Timeline Added

- Added diagnostic `tts_log_line` websocket events from the orchestrator log listener so each real TTS bridge output line is visible with job/chapter/project ids, marker classification, and per-job sequence.
- Extended frontend websocket debug capture with a capped communication timeline and added a temporary Chapter Editor `Live Output` tab for raw TTS lines plus socket fan-out, including filtering, pause/resume, clear, and copy JSON controls.
- Verified targeted backend/frontend tests, Ruff, `git diff --check`, frontend lint, and frontend build all pass; lint retains only the existing fast-refresh warnings.

# 2026-05-20 - Render-Group Fields Propagated Into Live Output Path

- Propagated `render_group_count`, `completed_render_groups`, `active_render_group_index`, and render weight fields through `studio_job_event`, `job_updated`, live overlay hydration, and the communication timeline.
- Updated the Chapter Editor Live Output tab and the frontend debug snapshot path so the live trace now shows the same group context that the backend emits.
- Verified targeted backend tests for progress/websocket broadcasting plus frontend Vitest slices for runtime debug capture, `useJobs`, live-jobs store merging, hydration, and Live Output rendering.

# 2026-05-20 - Live TTS Broadcast Skips and Watchdog Cleanup Verified

- Wrapped the registry-handler branch in `OrchestratorHelpersMixin._dispatch` so watchdog log listeners always unregister, even when a registry handler returns directly.
- Added skip flags to direct live `update_job` calls in XTTS standard, segment, and bake handlers, the mixed handler, and the Voxtral handler so only terminal broadcasts keep propagating.
- Added regression coverage for watchdog listener cleanup and the live progress update paths.
- Verified the focused pytest set (50 passed), `python -m py_compile`, `ruff check`, and `git diff --check`.

# 2026-05-21 - Queue Row Synthesis Visibility & Classification Hydration Fixed

- Identified that chapter-scoped jobs undergoing synthesis (which have segment IDs) were being filtered out of the queue UI because HTTP REST API items from `/api/processing_queue` lacked the `classification` field.
- Fixed the frontend in `mergeQueueWithOverlays` to copy the `classification` from the websocket overlay delta onto base HTTP items before filtering them.
- Enhanced the backend queue API router by adding `"classification"` to `_LIVE_QUEUE_JOB_FIELDS` and updating `_merge_live_queue_job` to use `getattr(job, field, None)` to correctly merge computed properties from active memory jobs.
- Added a computed `classification` property getter to the backend `Job` model to dynamically resolve `"segment"`, `"chapter"`, or `"job"`.
- Verified with focused frontend Vitest tests and backend python tests (`test_processing_queue_hydrates_classification`), all of which pass successfully.

# 2026-05-21 - Single WebSocket Transport Refactor

- Reviewed and completed the single-websocket transport refactor where `App.tsx` shell owns the only active WebSocket connection via `useStudioSocketTransport`.
- Migrated `useJobs` and `useQueueSync` to consume websocket updates and connection status through the shared `studioSocketBus` and `useStudioSocketConnection()`, ensuring they no longer call `useWebSocket` directly.
- Added a robust unit test in `App.test.tsx` utilizing a custom React hook mock with `useEffect` to verify that only one active websocket transport is mounted across the entire application shell layout.
- Cleaned up React test `act` warnings in `useQueueSync.test.tsx` by awaiting active queue hydration and refresh completion states via `waitFor(() => expect(result.current.activeSource).toBeUndefined())`.
- Verified all 105 frontend unit tests pass successfully, and confirmed ESLint reports zero errors.

# 2026-05-21 - Voice Profile Engine Drift Fix & Isolation Guards

- Resolved voice profile engine drift from XTTS to Voxtral by implementing `select_default_engine` in `app/engines/voice_engines.py` that ranks active/enabled engines (explicit user-specified default wins first, followed by enabled local non-cloud/non-network engines, then local engines, and finally stable registry order fallback).
- Refactored `get_default_profile_engine` to be non-recursive, fetching registry metadata once through a helper function.
- Minimized disk writes to `profile.json` in `normalize_profile_metadata` and `sync_speakers_from_profiles` by storing `orig_meta` from disk and checking for differences before writing, preventing inferred engine defaults from mutating existing configuration files.
- Extended the autouse `VOICES_DIR` isolation guard to run across both API voice tests and speaker tests, ensuring tests do not touch the real repository `voices/` directory.
- Added comprehensive fallback unit tests and isolation tests verifying ranking layers, explicit engine overrides, normalization preservation, write-minimization, and path isolation.
- Ran backend test suites (45 tests passed), ruff check, and git diff check cleanly.

# 2026-05-21 - Tighten Voice Engine Fallback Policy (Explicit Config Only)

- Established a strict, explicit-only voice engine policy across the backend. Removed all discovery-based ranking and fallbacks in `voice_engines.py`, `select_runtime_engine_candidate`, `get_default_profile_engine`, and `normalize_tts_engine`.
- Removed alias-based engine inference from profile metadata in `speakers.py`, ensuring engine resolution strictly retrieves configured values or empty strings.
- Refactored `api_analyze_chapter` and `api_analyze_text` in `analysis.py` to strictly validate engine configuration and fail with HTTP 400 when missing/empty.
- Updated `api_get_chapter_preview`, `voices_actions.py`, and `generation.py` to raise clear HTTP 400 responses on empty resolved engines.
- Refactored `chunk_groups.py`, `bundles.py`, and `worker_voice.py` to fail cleanly when engine resolution yields an empty string instead of falling back to default or placeholder values.
- Verified all 879 pytest backend tests pass cleanly, with `git diff --check` and `ruff check` fully green.

# 2026-05-21 - Removed Helper-Level Voice Engine Masking Paths

- Updated `_voice_has_test_sample` and `_voice_has_generation_material` in `app/api/routers/voices_helpers.py` to immediately return `False` if no voice engine is configured in the profile settings, eliminating fallback checking behavior.
- Refactored `build_chunk_groups` in `app/domain/chunk_groups.py` to call `resolve_profile_engine(profile_name, None)` and propagate the empty engine resolution, and to check `and engine` before grouping segments so they are not grouped under a placeholder limit when no engine is configured.
- Added unit tests in `tests/domain/test_chunk_groups.py` verifying that empty engines do not group segments.
- Corrected mock setups in regression tests (`test_grouped_segments_validation_regression` and `test_handle_xtts_job_standard_mixed_latent_only_profiles_builds_script`) to specify a valid engine (`xtts`) instead of defaulting to empty behavior.
- Verified all 882 backend tests pass successfully.

# 2026-05-21 - Audited and Removed VariantModel Engine Default Factory

- Audited `VariantModel` in `app/domain/voices/models.py` and determined that it is an unused domain model dataclass.
- Replaced the convenience `default_factory` on `VariantModel.engine` that loaded `get_default_profile_engine()` with a `None` default (`Optional[str] = None`).
- Confirmed no other files in the workspace (including the codebase and all test suites) make use of `VariantModel`.
- Verified that all 882 backend pytest tests continue to pass cleanly, and both `ruff check` and `git diff --check` remain fully green.

# 2026-05-21 - Live Event Stream Contract Tightened

- Created and tightened `plans/implementation/live_event_stream_contract.md` as the source of truth for the frontend live event stream.
- Added executable TypeScript schemas and normalizer helpers in `frontend/src/api/contracts/liveEvents.ts`, with the socket bus reusing the shared `StudioSocketEnvelope` type.
- Tightened runtime compatibility so nested `job_updated.updates` payloads are flattened before normalization and legacy `segment_progress.segment_id` is preserved as active segment identity in the debug stream.
- Defined concrete live event topics, categories, event kinds, discriminated event shapes, and subscriber observation records.
- Clarified that Live Output must read bus-level audit records for every received frame, including unknown/unhandled events, rather than depending on `useJobs` or `useQueueSync` debug side effects.
- Removed TTS log ownership from `jobs-state`; `tts-diagnostics` owns `tts.logs`, `queue-sync` owns queue progress/lifecycle absorption, and `jobs-state` owns job/chapter/segment/voice state updates.
- Documented segment-start versus segment-progress semantics, diagnostics refresh reconciliation, and queue overlay preservation rules.
- Verified the documentation diff with `git diff --check`.

# 2026-05-21 - Live Output Wired to Live Event Audit Store

- Added `frontend/src/store/liveEventAuditStore.ts` so every `StudioSocketEnvelope` is normalized into exactly one `LiveEventRecord` before hook-level filtering or consumer-specific handling.
- Updated `studioSocketBus.publishStudioSocketMessage` to record the audit entry before fanning the frame out to subscribers.
- Updated `useJobs` and `useQueueSync` to attach de-duped `jobs-state` and `queue-sync` subscriber observations to the matching frame by `frameId`.
- Rewired `LiveOutputTab` away from the legacy `runtimeDebug` window timeline and onto the audit store via `useSyncExternalStore`, with normalized domain columns for topic, category, event kind, subscribers, job/chapter/segment ids, progress, reason, source, and message.
- Kept `runtimeDebug` compatibility intact for existing tests and debug globals, but it is no longer the authoritative Live Output source.
- Verified focused frontend event-stream tests (66 passed), full frontend Vitest (555 passed, 5 skipped), frontend build, frontend lint (7 existing warnings), and `git diff --check`.

# 2026-05-21 - TTS Diagnostics Wired to Live Logs

- Added `frontend/src/hooks/useLiveTtsLogLines.ts` to subscribe to `liveEventAuditStore`, consume only `tts.logs` events while diagnostics are open, de-dupe by `(jobId, sequence)` when available, and record `tts-diagnostics` subscriber observations.
- Updated Settings -> Engines diagnostics to load historical logs once with `View Diagnostics`, then append live `tts.logs` frames from the audit store without needing `Refresh Logs`.
- Removed the open-state `Refresh Logs` button so the diagnostics panel now communicates the live-update behavior directly.
- Added reconciliation for log frames that arrive while the initial diagnostics history fetch is in flight, preserving those live lines even when the REST response omits them.
- Added auto-scroll so the diagnostics viewport stays pinned to the newest line as live logs arrive.
- Verified focused diagnostics/event-stream tests (27 passed), full frontend Vitest (560 passed, 5 skipped), frontend build, frontend lint (7 existing warnings), and `git diff --check`.

# 2026-05-22 - Live Output Subscriber Ownership Correction

- Removed the false `jobs-state` subscriber observation from `tts.logs` handling in `frontend/src/hooks/useJobs.ts` so the Live Output subscribers column reflects actual consumer ownership instead of claiming TTS diagnostics frames for job state.
- Added a regression test in `tests/unit/hooks/useJobs.test.tsx` confirming `tts.logs` frames are not attributed to `jobs-state`.
- Verified targeted frontend tests covering `useJobs`, `LiveOutputPage`, and `SettingsRoute` passed, and re-ran frontend build, lint (7 existing warnings), and `git diff --check` successfully.

# 2026-05-22 - Consumer-Listening Registry live output filter model

- Created `frontend/src/config/liveEventConsumers.ts` containing the `LIVE_EVENT_CONSUMERS` configuration matching real component topic subscriptions.
- Refactored `LiveOutputTable.tsx` to dynamically drive consumer filter toggle buttons and filter records based on topic listening rules rather than subscriber observations.
- Renamed the column header `'Subscribers'` to `'Handled by'` to be more descriptive of actual observations.
- Updated Vitest unit tests in `LiveOutputPage.test.tsx` and `LiveOutputTab.test.tsx` to assert correct filtering based on consumer registry topic subscription rules.
- Verified that all unit tests, eslint, production build, and git diff checks are green.

# 2026-05-23 - Websocket payloads human-readable reason removal

- Removed the redundant human-readable 'reason' key from the backend websocket payloads for `segments.lifecycle`, `chapters.lifecycle`, and `projects.lifecycle` events built in `app/api/contracts/events.py`.
- Mapped the reason parameter to the canonical machine-readable `reasonCode` and legacy `reason_code` fields in the lifecycle payloads instead.
- Updated the frontend types in `frontend/src/api/contracts/liveEvents.ts` to replace `reason` with `reasonCode` and `reason_code` in `ChapterLifecyclePayload`, `SegmentLifecyclePayload`, and `ProjectLifecyclePayload`.
- Simplified the `reasonFor` helper in `LiveOutputTable.tsx` to read `reasonCode`/`reason_code` globally for all event types, and updated `messageFor` to use `message` instead of `reason` for lifecycle events.
- Updated all affected frontend and backend tests in `tests/api/test_websocket_broadcast.py`, `liveEvents.test.ts`, `LiveOutputPage.test.tsx`, and `LiveOutputTab.test.tsx` to align with the payload contract updates.
- Verified that all 902 backend pytest tests and 579 frontend Vitest tests pass cleanly.

# 2026-05-23 - Queue Event Path Audit and Tightened State Ownership

- Refactored `useQueueSync.ts` to remove the `'chapters.progress'` topic subscription, ensuring the queue overlay store is driven only by authoritative `'queue.items'` events (`queue_item_status`, `queue_paused`, `queue_item_invalidated`).
- Updated `main-queue` consumer definition in `liveEventConsumers.ts` to listen only to the `'queue.items'` topic.
- Reverted status derivation in `QueueItem.tsx` to use `job.status` directly, which is strictly updated by the authoritative `'queue_item_status'` event and hydration snapshot queue items.
- Fixed `ProgressService` initialization in backend websocket broadcast tests by providing required `reconcile_fn` and `eta_fn` parameters.
- Updated progress service tests in `test_progress_logic.py` and live output tests in `LiveOutputPage.test.tsx` to align with the new progress broadcasting contract and filter rules.
- Verified that all 905 backend pytest tests and 584 frontend Vitest tests pass cleanly, and both the frontend build and linter are successful.
