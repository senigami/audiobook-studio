# Test Audit — tests/orchestration/ (files a–l)

Date: 2026-06-10  
Auditor: Claude (Sonnet 4.6)  
Rubric source: plans/final_release/17_test_quality_audit.md §1

---

## Classification Table

| file | test | class | classification | action | notes |
|---|---|---|---|---|---|
| test_assembly_orchestration_integration.py | test_audiobook_assembly_orchestration_integration | — | REAL | KEEP | Real orchestrator + API route; mocks only FFmpeg subprocess (legitimate) and state write side-effects. Asserts the engine call args shape. |
| test_assembly_registry.py | test_assembly_task_uses_registry | — | MOCKED-OUT | **DELETED file** | Patches `handle_audiobook_job` (the function the registry dispatches to) and `get_jobs`; only asserts the mock was called. Also has indentation bug (segment_paths setup escapes the `with` block). Registry machinery is never actually exercised. |
| test_audiobook_assembly.py | test_assemble_project_cover_path_resolution | — | REAL | KEEP | Exercises real DB + API route; asserts absolute cover path and job metadata. |
| test_audiobook_assembly.py | test_migrate_legacy_project_cover_into_project_storage | — | REAL | KEEP | Exercises real migration function and DB state. |
| test_audiobook_assembly.py | test_assemble_project_no_cover | — | REAL | KEEP | Verifies no-cover path through API; asserts `cover_path is None`. |
| test_cancel.py | TestOrchestratorCancel::test_cancel_unknown_task_returns_false | TestOrchestratorCancel | REAL | KEEP | Tests real cancel() on empty registry. |
| test_cancel.py | TestOrchestratorCancel::test_cancel_active_task_returns_true | TestOrchestratorCancel | REAL | KEEP | Real cancel path; setup uses `_active` dict directly which is fine (testing internal contract). |
| test_cancel.py | TestOrchestratorCancel::test_cancel_calls_on_cancel | TestOrchestratorCancel | REAL | KEEP | Verifies `on_cancel()` is invoked. |
| test_cancel.py | TestOrchestratorCancel::test_cancel_removes_from_active | TestOrchestratorCancel | REAL | KEEP | Verifies task is deregistered. |
| test_cancel.py | TestOrchestratorCancel::test_cancel_publishes_cancelling_then_cancelled | TestOrchestratorCancel | REAL | KEEP | Contractual ordering of status publications. |
| test_cancel.py | TestOrchestratorCancel::test_cancel_on_cancel_exception_still_publishes_cancelled | TestOrchestratorCancel | REAL | KEEP | Error-resilience contract for cancelled terminal event. |
| test_fix_regression_v2.py | test_stream_chapter_with_suffixed_filename | — | REAL | KEEP | Real API + filesystem; exercises streaming path with suffix filenames. |
| test_fix_regression_v2.py | test_startup_recovery_clears_stuck_states | — | REAL | KEEP | Real DB jobs; executes the recovery logic inline and asserts correct deletion. |
| test_fix_regression_v2.py | test_startup_recovery_clears_stuck_chapter_status | — | REAL | KEEP | Exercises real `reconcile_all_chapter_statuses` against DB. |
| test_fix_regression_v2.py | test_audiobook_listing_finds_png_cover | — | REAL | KEEP | Real API + filesystem; asserts cover_url shape. |
| test_fix_regression_v2.py | test_state_pruning | — | REAL | KEEP | Exercises real `prune_completed_jobs` and asserts <= 50 terminal jobs. |
| test_fix_regression_v2.py | test_stream_chapter_fallback_logic | — | REAL | KEEP | Real API + filesystem; verifies fallback to `chapter.wav` without DB path. |
| test_grouped_regressions.py | test_whole_job_eta_uses_weighted_group_progress | — | REAL | KEEP | Exercises real `_dispatch` + watchdog marker stream; asserts ETA > 30s for heavily-weighted second group. |
| test_grouped_regressions.py | test_segment_boundary_events_do_not_project_bad_eta | — | VACUOUS | **DELETED** | Only asserts `"segment_start" in ETA_PROJECTION_SKIP_REASONS` — a constant membership check; does not exercise the ETA suppression path at all. Gap: no REAL test verifies that publishing a `segment_start` event leaves ETA unchanged. |
| test_grouped_regressions.py | test_script_view_exposes_authoritative_audio_groups | — | REAL | KEEP | Exercises real `get_script_view_payload` against DB; asserts shape contract. |
| test_grouped_regressions.py | test_group_saved_marks_all_group_members_done_once | — | VACUOUS | **DELETED** | Body is `pass`. No assertions, no setup, no behavior exercised. |
| test_grouped_regressions.py | test_full_chapter_render_creates_or_links_chapter_audio | — | VACUOUS | **DELETED** | Body is `pass`. No assertions, no setup, no behavior exercised. |
| test_grouped_updates.py | test_grouped_segment_saved_updates_all_ids | — | REAL (borderline) | KEEP | Mocks `update_segments_bulk` (DB) and `broadcast_segments_updated` (WebSocket) — both sit outside the orchestration unit. The test asserts that `_dispatch` passes the correct grouped IDs and path to the DB write. Mocking DB here is technically borderline but the args assertion provides genuine coverage of the dispatch→segment-update handoff. |
| test_helpers.py | TestClaimToDict::test_none_returns_empty_dict | TestClaimToDict | REAL | KEEP | Pure function under test. |
| test_helpers.py | TestClaimToDict::test_resource_claim_converted | TestClaimToDict | REAL | KEEP | Verifies GPU claim fields. |
| test_helpers.py | TestClaimToDict::test_none_claim_all_false | TestClaimToDict | REAL | KEEP | Verifies none-claim defaults. |
| test_incremental_assembly.py | test_incremental_assembly_skips_encoding | — | REAL | KEEP | Mocks only subprocess FFmpeg calls (legitimate); asserts exactly 1 call (concat only). |
| test_incremental_assembly.py | test_incremental_assembly_performs_encoding_when_missing | — | REAL | KEEP | Asserts 2 FFmpeg calls and encode command shape. |
| test_incremental_assembly.py | test_incremental_assembly_disambiguates_nested_chapter_cache_names | — | REAL | KEEP | Asserts cache key collision prevention for same-filename chapters in different dirs. |
| test_incremental_assembly.py | test_incremental_assembly_performs_encoding_when_outdated | — | REAL | KEEP | Asserts re-encoding when WAV is newer than cached M4A. |
| test_integration.py | TestOrchestratorIntegration::test_orchestrator_can_submit_api_synthesis_task | TestOrchestratorIntegration | REAL | KEEP | Exercises real `submit()` path with reuse decision; asserts `"done"` status published. |
| test_isolation.py | TestLegacyIsolation::test_app_jobs_worker_not_imported_by_orchestrator | TestLegacyIsolation | REAL (source-scan) | KEEP | Source-text scan is weaker than a runtime check but legitimately guards against re-introducing forbidden imports. |
| test_isolation.py | TestLegacyIsolation::test_orchestrator_submit_does_not_call_jobs_worker | TestLegacyIsolation | VACUOUS | **DELETED** | Patches `sys.modules["app.jobs.worker"]` with `MagicMock()`, then calls `assert_not_called()` on auto-created MagicMock attributes — these are never set up to track actual dispatch, so `assert_not_called()` trivially passes regardless of what the orchestrator does. |
| test_job_timing.py | test_job_timing_lifecycle | — | REAL | KEEP | Full queue lifecycle (queued → preparing → running → done); asserts `started_at`/`completed_at` DB contract at each transition. |
| test_job_timing.py | test_job_cancellation_timing | — | REAL | KEEP | Verifies `completed_at` set on cancellation. |
| test_job_timing.py | test_requeued_job_clears_terminal_timing_fields | — | REAL | KEEP | Verifies timing fields reset when re-queued. |

---

## Summary

| metric | count |
|---|---|
| Total tests audited (before) | 36 |
| REAL (kept) | 31 |
| VACUOUS (deleted) | 4 |
| MOCKED-OUT (deleted) | 1 |
| Files deleted | 1 (`test_assembly_registry.py`) |
| Tests remaining (after) | 31 |
| Suite result | 31 passed |

---

## Riskiest Findings

1. **test_assembly_registry.py (MOCKED-OUT, deleted)** — Most dangerous: gave false confidence that the job registry dispatch path was tested, but the handler was patched away entirely. If registry routing broke, this test would still pass.

2. **test_segment_boundary_events_do_not_project_bad_eta (VACUOUS, deleted)** — Named after a real behavioral contract (segment boundary events must suppress ETA projections) but only checked that a Python set contained two strings. The actual suppression logic path (`ETA_PROJECTION_SKIP_REASONS` guard in `state_jobs.update_job`) has no REAL test exercising it end-to-end. **Coverage gap remains** — a follow-up test should emit a `segment_start` publish and assert that `eta_seconds` in `state_jobs` is not updated.

3. **test_orchestrator_submit_does_not_call_jobs_worker (VACUOUS, deleted)** — Trivially passed because MagicMock attributes have no call history until you actually call them. Gave false confidence that the isolation boundary was enforced at runtime.

## Conftest Notes (shared, not modified)

- `progress_service` fixture returns a MagicMock — legitimate, as ProgressService is an infrastructure boundary.
- `voice_bridge` fixture returns a MagicMock — legitimate, as VoiceBridge is the TTS HTTP boundary.
- `make_task` fixture returns `MagicMock(spec=StudioTask)` — legitimate for orchestrator-level tests that need a task handle without caring about task internals.
- No issues requiring conftest changes, but note: `mock_state` fixture in `test_grouped_regressions.py` and `test_grouped_updates.py` patches `get_state_file` at both `state_helpers` and `state_jobs` layers — any new state module must also be patched there.
