# Phase 11 Remaining Work

This is the Phase 11 audit record and historical task board. Phase 11 is closeout-ready; new polish, manual QA, and remaining extras now belong in [Phase 12 polish and cleanup](../phases/phase_12_polish_and_cleanup.md).

## Intake Rules

- Map each reported app problem to one task area below before implementing.
- If a problem is user-facing, fix behavior first and use cleanup work only where it directly supports the fix.
- Keep changes narrow. Do not turn a bug report into a broad rewrite.
- Update this task board when a task is completed, deferred, or split.

## Current Task Areas

| Area | Status | Goal | Likely files | Verification |
| --- | --- | --- | --- | --- |
| Final reference audit | [x] | Re-run focused searches for remaining main-app engine names, V1 terms, fallback paths, and old routes. | `app/`, `frontend/`, `plugins/`, `tests/`, `design-docs/plans/` | `rg` audit plus targeted tests |
| Behavior helper hardening | [x] | Replace remaining hardcoded behavior decisions with plugin manifest or registry data. | `app/engines/behavior.py`, engine registry, API engine routes | `tests/test_engine_behavior.py`, `tests/test_api_engines.py`, bridge tests |
| Job and queue decommissioning | [x] | Remove remaining legacy worker-facing shims after orchestrator ownership is stable. `app/jobs/__init__.py` is now a namespace marker; remaining work is to trim any further compatibility surfaces only if callers still need them. | `app/jobs/`, `app/db/queue.py`, `app/state_jobs.py`, queue routes | queue, generation, orchestration tests |
| Text and progress utilities | [x] | Chunk grouping now uses engine metadata and redundant `app/utils/text_processing.py` is removed. All generic text fallbacks are relocated to behavior metadata and progress parsing is engine-agnostic. | textops modules, progress parsing, plugin adapters | textops, progress, plugin tests |
| Storage and output routes | [x] | Root `engine_tests` is no longer a trusted storage root, voice readiness/bundle export use plugin manifest `test_sample` metadata, and broad `/projects` plus `/out/voices` static exposure has been replaced with explicit public asset routes. `uploads/covers` remains strictly as a legacy migration source for `/out/covers` compatibility. | `app/config.py`, `app/api/utils.py`, asset routes, frontend API callers | API asset tests, frontend API tests |
| State/settings/metrics migration | [x] | Generic baseline CPS fallback is relocated to behavior.py. All legacy engine-specific state/metrics keys are quarantined in the migration layer or removed from runtime. | state modules, migration modules, performance metrics | state, settings, performance tests |
| Frontend engine-agnostic cleanup | [x] | Remove frontend assumptions tied to built-in engine names where they encode behavior. | `frontend/src/api`, queue/chapter/voice components | focused Vitest suites and build |
| Bootstrap and docs cleanup | [x] | Move engine-specific setup into plugin docs and keep core startup docs generic. Area 23 completed: Relocated conflict logic to `plugins/tts_xtts/scripts/check_env.py`; Generalized launcher variables; Updated `README`/`wiki`. | `README`, `docs`, `wiki`, launch scripts | startup check, docs review |

## Reported App Problems

Add user-reported problems here before or during triage.

| Problem | Area | Status | Notes |
| --- | --- | --- | --- |
| Settings engine test fails without user-created/default voice | Behavior helper hardening / State/settings/metrics migration | Fixed, manual app verification pending | `POST /api/engines/xtts/test` returned 400 until a default voice was set. Added manifest-declared engine test samples, bundled XTTS sample fixture, and permanent API/TTS Server tests proving engine tests can run without default voice state. Manual check: click XTTS Test in Settings with no default voice selected. |
| Library home `/api/projects` load is slow | Storage and output routes / Final reference audit | Fixed, manual app verification pending | User observed `GET /api/projects` taking about 24 seconds. Removed per-project V2 migration from the bulk list route and added a regression test proving list does not migrate each project while project detail still does. Manual check: open Library home and confirm load time is back to normal. |
| Chapter render enqueue fails with blank engine enablement message | Job and queue decommissioning / Behavior helper hardening | Fixed, manual app verification pending | UI showed `Enable  in Settings to use these voices.` and `/api/processing_queue` returned 400. Added regression coverage for blank resolved engines and missing registry engines; queue validation now returns a clear unconfigured-engine message or a named enablement message. Manual check: enqueue chapter render from chapter view. |
| Chapter view reports duplicate React key `voxtral-mini-latest` | Frontend engine-agnostic cleanup | Fixed, manual app verification pending | Console warning indicated duplicate keys in chapter render/voice UI. Added permanent focused tests for duplicate voice option IDs and duplicate schema enum values; generic option rendering now uses stable unique keys/deduplication without hardcoding model IDs. Manual check: open chapter render/settings views and confirm the warning is gone. |
| Engine test ignores plugin-provided `test_text` | Behavior helper hardening / State/settings/metrics migration | Fixed, manual app verification pending | Settings engine test audio used an internal default phrase instead of the plugin manifest `test_text`. Added API and TTS Server verification tests proving manifest text is honored. API router and serialization now correctly resolve manifest `test_text` with the internal phrase as fallback. Manual check: run engine test in Settings and confirm it uses manifest phrase. |
| Failed queue entries do not show attempt date/time | Job and queue decommissioning / Frontend engine-agnostic cleanup | Fixed, manual app verification pending | Console showed failed jobs without date/time context. Added robust timestamp resolution to `GlobalQueue.tsx` that falls back to `completed_at` or `updated_at` when `started_at` is missing. Regression coverage added to ensure timestamps always render for finished items. Manual check: open Global Queue history and confirm failed jobs show times. |
| Frontend voice UI uses hardcoded `xtts` as a missing-engine fallback | Frontend engine-agnostic cleanup | Fixed | The Phase 11 reference audit found `xtts` fallback literals in voice variant creation and character assignment availability checks. Replaced them with registry-derived `getDefaultEngineId(engines)` resolution, added focused tests, and linked voice-modal engine labels to their selects for accessible queries. |
| Vite dev proxy logs WebSocket `ECONNRESET` on first page load | Phase 12 polish and cleanup | Moved to Phase 12 | Startup log showed backend accepted `/ws`, then Vite logged `ws proxy error: read ECONNRESET`. Need determine whether this is harmless dev-server reconnect noise or a real lost-update path. |
| Project and chapter load are slow for long books | Phase 12 polish and cleanup | Moved to Phase 12 | Add load timing probes and trim duplicate fetches if the logs show an obvious hotspot. Manual check: load Dracula project and chapter in dev mode and compare fetch timings. |
| Chapter view lacks VCR-style playback controls | Phase 12 polish and cleanup | Moved to Phase 12 | Add play, pause, stop, next, and previous controls in the chapter playback UI after the current render/load debugging slice is stable. |
| Chapter render still fails with `Mixed synthesis returned failed` | Job and queue decommissioning / Behavior helper hardening | Diagnostic fixed, live app retry pending | Queue enqueue now works, but execution failed after selecting mixed synthesis. Fixed mixed-handler error clobbering so detailed handler/bridge/stitching errors propagate to the queue instead of generic `Mixed synthesis returned failed`. Added an end-to-end API render regression that exercises `/api/processing_queue` through the orchestrator and mixed handler successfully in tests. Manual check: retry chapter render in the live app and capture the new concrete error if it still fails. |
| Server shutdown stalls at `Stopping reloader process` | Bootstrap and docs cleanup / Job and queue decommissioning | Fixed, manual app verification pending | Ctrl-C was leaving the dev server hanging while the reloader stopped. Added conservative startup cleanup for orphaned `tts_server.py` processes and shortened watchdog shutdown waits so the app exits faster. Manual check: start the server, stop it once with Ctrl-C, and confirm it exits without a second interrupt. |
| Voice registry fallback fails with ImportError | Behavior helper hardening / Final reference audit | Fixed | `_is_engine_active` in `voices_helpers.py` tried to import a non-existent `is_built_in` helper when the TTS Server was unavailable. Replaced it with a manifest-driven `is_engine_locally_available` check in `behavior.py`. Added focused regression tests. |

## Reference Classification (Phase 11 Audit)

| Category | Description | Examples | Recommended Action |
| :--- | :--- | :--- | :--- |
| **valid_plugin_local** | Engine names within plugin folders/manifests. | `plugins/xtts/manifest.json` | Keep. |
| **valid_test_fixture** | Engine literals in test suites and mocks. | `tests/api/test_api_generation.py` | Keep. |
| **valid_migration_only**| Historical keys in migration layers. | `app/db/legacy_migration.py` | Keep. |
| **valid_docs_context** | Documented setup or descriptive labels. | `README.md`, `ProjectLibraryPage.tsx` | Keep. |
| **stale_legacy_code** | Decommissioned functions/exports. | `app/jobs/__init__.py` shims | Migrate callers first, then remove. |
| **app_level_coupling** | Hardcoded logic fallbacks. | `CharacterSidebar.tsx` / `VoicesPage.tsx` `xtts` fallbacks | Fixed for audited frontend voice fallback literals; continue classifying any new app-level coupling found in later slices. |
| **needs_codex_decision**| Ambiguous or built-in identifiers. | `audiobook` job kind | Retain until explicit decommission slice. |

## Immediate Next Step

Checkpoint Phase 11 closeout, then use [Phase 12 polish and cleanup](../phases/phase_12_polish_and_cleanup.md) as the active task board for VCR controls, manual app checks, performance polish, launcher setup-loop cleanup, and remaining master-plan extras.

## Final Phase Verification

Before Phase 11 is checkpointed as complete:

- Final reference audit and retained-reference classification are complete for the cleanup slices.
- Affected backend/frontend suites were run for completed cleanup areas.
- Frontend tests/build were run for frontend cleanup slices.
- `design-docs/plans/phase_11_audit.md` reflects closeout-ready status.
- Memory must be updated and the result checkpointed.
