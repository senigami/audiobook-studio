# Test Value Audit — Backend API (tests/api/) — 2026-07-10

Consolidated from 5 parallel sub-passes split by domain (websocket/progress; generation/queue/jobs; voices-metadata/engines/jobs-snapshot; voices-actions/bundles/tts-gateway; chapters/projects/analysis/misc). Cross-checked against the June 2026 prior audits (`test_audit_api_part1.md`, `test_audit_api_part2.md`, `test_audit_backend_queue_jobs.md`) — confirmed those audits' deletions actually stuck (`test_api_final_validation.py`'s vacuous test and `test_api_tts_api.py`'s `test_tts_api_lan_protection` are both confirmed gone), and covered files that have grown or were added since (new SQL-injection regression tests in `test_api_chapters.py`, `test_jobs_snapshot_enrich.py`, `test_fix_adversarial_review_12_4.py`, `test_progress_builder_fail_loud.py`, `test_api_voices_huggingface.py`).

Scope: ~50 test files, ~458 total test cases reviewed.

## DEFINITE delete candidates

- `tests/api/test_api_synthesis_task.py:98` — `test_source_is_always_api` — true duplicate: `source: str = "api"` is a hardcoded, non-overridable class attribute, and `test_creation_defaults` already asserts the same fact on construction.
- `tests/api/test_jobs_snapshot_enrich.py` / `tests/api/test_fix_adversarial_review_12_4.py:168` — `test_enrich_crossfade_uses_locked_ring_velocity` — claims to pin a lock-ordering fix (moving `ring.mean()` inside the lock) but only calls `svc.enrich()` sequentially with no concurrent mutator; verified against the actual pre-fix diff that reverting the fix would NOT make this test fail. Fails this repo's own R1 revert-check requirement.
- `tests/api/test_voice_engines_fallback.py:343` — `test_normalize_profile_metadata_empty_does_not_write_file` — never calls `normalize_profile_metadata` at all; just asserts a file that was never written doesn't exist. True regardless of the function's behavior.
- `tests/api/test_api_chapters_extended.py:51` — `test_preview_chapter` — hits `GET /api/preview/non_existent.txt`, a route that doesn't exist (the real preview route has a different path shape); a 404 for any nonexistent path is trivially true. Same WRONG-SCENARIO pattern already fixed once for `test_api_jobs_list` in `test_api.py`.

## DISCUSS (borderline, needs a human call)

- `tests/api/test_websocket_broadcast.py:16` — `test_queue_start_not_redirect` — only asserts status/body shape, never verifies the route's real side effect (`set_paused(False)` actually unpausing the queue).
- `tests/api/test_websocket_broadcast.py:1772` — `test_broadcast_event_payload_includes_confidence_in_camelcase` — only asserts presence/type of `confidence`, no concrete expected value.
- `tests/api/test_studio_task_progress.py:35` — `test_orchestrator_attaches_progress_reporter` — patches `orchestrator._publish`, a sibling method on the same class under test (R2 tension), though it does verify real wiring.
- `tests/api/test_api_synthesis_task.py:111` — `test_on_cancel_does_not_raise` — calls a documented no-op and asserts it doesn't raise; borderline tautological.
- `tests/api/test_api_generation.py:1195,1228,1275` — three "resolves_segment_profiles_once_per_request" tests assert an internal call-count on a private helper rather than an HTTP-boundary outcome; each is a documented N+1-query performance regression guard with no other observable signature, so leaning KEEP despite matching the flagged pattern.
- `tests/api/test_projects_segment_gc.py:76` — `test_get_project_404_does_not_trigger_gc` — mocks the router's own private `_schedule_segment_gc` helper (R2 tension), though there's genuinely nothing else observable on this path.
- `tests/api/test_progress_builder_fail_loud.py:87` — `test_chapter_builder_no_progress_confidence_none_does_not_raise` — the "no progress" scenario it claims isn't actually reachable (param is typed non-optional); near-duplicate of the adjacent confidence=0.5 test at boundary value 0.0.
- `tests/api/test_progress_builder_fail_loud.py:132` — `test_voice_test_builder_unchanged` — only asserts one thin field (`topic`); has latent regression value (would TypeError if a required param were added) but doesn't test what its docstring frames.
- `tests/api/test_web_endpoints.py:101` — `test_missing_entities` — roughly a third of its assertions (3 of ~6 calls) have no status-code check at all.

## Notable KEEP (high-value, explicitly called out)

- `tests/api/test_api_chapters.py:81` — `test_chapter_segments_sync_and_update` — the pinning test for today's fixed SQL-column-injection bug (single-segment PUT + bulk-update routes, both covered in one function).
- `tests/api/test_path_traversal.py` (all 6), `tests/api/test_api_calibration.py::test_engine_calibration_reset_endpoint`, `tests/api/test_repair_voice_engine_drift.py` (both) — genuine attack-payload security regression tests.
- `tests/api/test_websocket_broadcast.py` — ~58 of 61 tests are real, several with explicit R1 revert-check documentation (S6 origin-check, ETA re-anchoring bug, redundant-broadcast bug).
- `tests/api/test_api_tts_api.py`'s `test_voice_ref_*` family, `test_api_voices_actions.py::test_build_profile_exception_does_not_expose_stack_trace`, `test_api_voices_huggingface.py`'s token-non-leak tests — real security-boundary coverage.
- `tests/api/test_api_generation.py:914` — `test_queue_chapter_mixed_render_runs_end_to_end` — full mixed-engine render exercised through real orchestrator/DB/watchdog; excellent regression coverage.
- `tests/api/test_api_projects.py::test_project_list_and_detail_do_not_migrate_on_read` — genuine negative/performance-regression guard.

## Summary

- **4 DEFINITE** delete candidates, **~11 DISCUSS** items, out of ~458 total tests reviewed.
- This area is in strong shape and the June 2026 audit's fixes held (verified, not assumed). The four real deletions are narrowly scoped: two true duplicates, one race-condition test that doesn't actually test concurrency, and one wrong-route smoke test. The DISCUSS items mostly hinge on a judgment call about whether internal-call-count assertions are acceptable proxies when there's no other observable signature for a performance-only bug class (N+1 queries, lock ordering) — leaning toward keeping most of these given the documented shipped-bug history behind them.
