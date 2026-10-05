# Test Value Audit — Orchestration (tests/orchestration/) — 2026-07-10

Consolidated from 6 parallel sub-passes covering all 54 test files under `tests/orchestration/`. Cross-checked against the four prior June 2026 audits (`test_audit_orchestration_part1.md`, `part2.md`, `orchestration_test_quality_2026-06-11.md`, `test_audit_progress_segments.md`) — confirmed their deletions stuck: `test_watchdog_progress_logic.py`'s two flagged VACUOUS/WRONG-SCENARIO tests are gone (replaced by real coverage, documented in-file), `test_grouped_regressions.py`'s two `pass`-only stubs are gone, and `test_isolation.py`'s vacuous duplicate is gone.

Scope: 54 files, ~540+ total test cases reviewed. This is, by a wide margin, the highest-quality area of the test suite audited today — self-referential ETA/progress-math risk (the highest-priority thing to check here, per `design-docs/engineering-rules/backend-progress.md`) was specifically hunted for in every file and found in exactly one place.

## DEFINITE delete candidates

- **`tests/orchestration/test_progress_parsing.py`** — the entire file is a dead husk: 6 lines, all comments, zero `def test_...` functions (the prior audit's deletion of `test_progress_simulation` left nothing behind; real coverage lives in `test_watchdog_progress_logic.py`/`test_progress_logic.py` per its own header). **Delete the file.**
- `tests/orchestration/test_progress_contract_v140.py:230-271` — `TestB9CharacterCountWeighting` (3 tests: `test_char_weights_proportional_340_vs_1345`, `test_char_weight_not_segment_count`, `test_char_weight_completes_at_correct_share`) — all three call only a test-local helper (`_make_dispatch_weight_table()`) that reimplements the real weight-table math inline; never import or call the actual production code in `orchestrator_helpers.py`. Classic self-referential-math pattern; real char-weighting behavior is already exercised elsewhere (`test_inter_group_gap_eta.py`, `test_segment_id_marker_fallback.py`).
- `tests/orchestration/test_progress_contract_v140.py:1287-1317` — `TestB8DiagnosticLogging.test_start_segment_diagnostic_emitted_at_debug` — the test's own comments admit it gave up on exercising real behavior and instead does `inspect.getsource()` + asserts literal substrings appear in the source text. Exactly the "testing that text exists" anti-pattern — never triggers a real marker or checks an actual `caplog` record.

## DISCUSS (borderline, needs a human call)

- `tests/orchestration/test_startup_eta.py:~2147` — `test_start_segment_proportional_eta` — wraps the initial `_dispatch()` call in a bare `try/except Exception: pass` before manually driving the listener; final assertions are still concrete, but an early regression would be silently swallowed. Recommend narrowing the except, not deleting.
- `tests/orchestration/test_progress_contract_v140.py:495-554` — `test_service_eta_does_not_inflate_during_stall` — name promises ETA-value non-inflation but only checks `eta_confidence`; scope-mismatch with its name, not a correctness problem.
- `tests/orchestration/test_isolation.py` — `test_app_jobs_worker_not_imported_by_orchestrator` — checks the modular-architecture boundary via source-text string matching rather than a runtime import assertion. Not vacuous (would genuinely fail if the import were added), just weaker than ideal.
- `tests/orchestration/test_singleton.py` — both tests redundantly reset `_GLOBAL_ORCHESTRATOR` even though an autouse fixture already does it. Harmless.
- `tests/orchestration/test_task006_segment_composition.py` — 6 tests couple to private `svc._segment_eta_rings` state rather than an observable emitted frame (real behavior, white-box style); one (`test_composition_ceiling_respected`) has a conditional `if eta is not None: assert eta < 200` that would silently no-op if `eta` regressed to always-`None` — worth tightening, not deleting.
- `tests/orchestration/test_parent_child_scheduling.py` — 3 tests use real `time.sleep(n)` calls inside concurrency tests to widen race-detection windows (not gating correctness, which is lock/Event-driven) — soft R4 pattern, recommend replacing with `threading.Event` handshakes if touched again. Also one vestigial dead-code closure (never invoked) worth removing.
- `tests/orchestration/test_correctness_invariants.py::TestConcurrentAdmissionWaits.test_child_waits_for_freed_slot_instead_of_failing_fast` — one `time.sleep(0.1)` used only for thread sequencing, not gating the actual assertion.
- `tests/orchestration/test_progress_parity.py` — `test_confidence_matches_between_paths` and `test_grouped_progress_matches_between_paths` — legitimate wiring-regression tests (both paths route through the same `enrich()`, so this catches decoupling regressions, matching real shipped-bug history) but structurally narrower than their names imply, since a bug inside `enrich()` itself would pass both sides identically.

## R4 (real-sleep) timing violations found

- 4 soft violations total, all listed above under DISCUSS (`test_startup_eta.py` bare-except is not itself an R4 issue but noted alongside), `test_parent_child_scheduling.py` (3 sleeps), `test_correctness_invariants.py` (1 sleep) — none gate correctness (all backed by locks/Events for the actual pass/fail logic), all low-risk.
- Every other file across all 6 sub-passes (test_engine_semaphores, test_load_aware_eta, test_model_load_started_marker, test_watchdog_progress_logic, test_ephemeral_child_no_durable_job, test_progress_service_emit_race, test_task006_segment_composition minus the noted item, test_chapter_fanout_dispatch_eta, test_synthesis_task_and_resources, test_eta_bracket_and_engine_cap, test_dispatch_isolation, test_live_segment_concurrency, test_progress_service, test_progress_service_singleton, test_indeterminate_loading_model, and all 12 files in batch 1) — zero `sleep()` calls, all concurrency proven via `threading.Event`/`Barrier`/injected clocks.

## Notable KEEP (exemplary, called out across sub-passes)

- `test_load_aware_eta.py` (20 tests) — the designated highest-risk file for self-referential ETA math; verified clean — hand-derives expected values independently of the source formula, includes explicit R1 revert-check notes.
- `test_eta_bracket_and_engine_cap.py` (~19 tests) — same scrutiny applied, same clean result; one test intentionally calls a sibling production function to pin a documented cross-function invariant (legitimate, not duplicative).
- `test_chapter_fanout_dispatch_eta.py` — called out explicitly as "the gold standard" — textbook R1/R2 compliance, end-to-end real dispatch pipeline.
- `test_progress_service_singleton.py` — genuine D7 AB-BA deadlock-avoidance tests using real threads/locks, not trivial identity checks.
- `test_live_segment_concurrency.py`, `test_dispatch_isolation.py`, `test_ephemeral_child_no_durable_job.py`, `test_indeterminate_loading_model.py` — all fully clean, zero flags, real concurrency/contract tests throughout.
- `test_recovery_db_integration.py` — grew a new `TestStartupRecovery` class since the last audit; equally sound.

## Summary

- **1 whole file** + **4 test-level** DEFINITE delete candidates, **~11 DISCUSS** items (mostly hardening suggestions, not deletions), out of ~540+ tests reviewed across 54 files.
- **~4 soft R4 violations**, none gating correctness.
- This is the strongest-tested area in the entire audit. The self-referential-math risk this task was specifically primed to hunt for in this area was found in exactly one cluster (`test_progress_contract_v140.py`'s `TestB9`), everything else — including the highest-risk ETA/confidence formula files — checked out clean on close inspection.
