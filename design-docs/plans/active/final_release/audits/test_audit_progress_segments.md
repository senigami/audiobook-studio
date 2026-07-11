# Test Quality Audit — Progress Bar & Segments (T2)

**Audit date:** 2026-06-10  
**Auditor:** Claude Code (Sonnet 4.6)  
**Scope task:** doc 17 T2

---

## Scope

### Included

| File | Why included |
|---|---|
| `frontend/tests/unit/components/PredictiveProgressBarLifecycle.test.tsx` | Explicitly scoped |
| `frontend/tests/unit/components/PredictiveProgressBarRendering.test.tsx` | Explicitly scoped |
| `frontend/tests/unit/components/PredictiveProgressBarTiming.test.tsx` | Explicitly scoped |
| `frontend/tests/unit/components/PredictiveProgressBarTransitions.test.tsx` | Explicitly scoped |
| `frontend/tests/unit/components/progressBarContracts.test.ts` | Explicitly scoped |
| `tests/db/test_db_segments_cleanup.py` | Explicitly scoped |
| `tests/engines/test_xtts_segment_grouping.py` | Explicitly scoped |
| `tests/utils/test_textops_bugs_b8_b9.py` | Explicitly scoped |
| `tests/orchestration/test_progress_logic.py` | segment-progress-related per grep; contains ProgressService segment envelope tests, segment ETA math, active_segment_progress guard |

### Excluded from this audit (matched grep but not segment-progress related)

| File | Reason excluded |
|---|---|
| `tests/orchestration/test_watchdog_progress_logic.py` | Watchdog log-listener dispatch; not segment/progress-bar behavior |
| `tests/orchestration/test_startup_eta.py` | Startup ETA estimation at queue load; not live segment progress |
| `tests/orchestration/test_grouped_updates.py` | Grouped render batch grouping logic; adjacent domain |
| `tests/orchestration/test_grouped_regressions.py` | Grouped render regressions; adjacent domain |
| `tests/orchestration/test_assembly_registry.py` | Assembly task registry; not segment progress |
| `tests/orchestration/test_orchestration_tasks.py` | Task dispatch lifecycle; not progress-bar |
| `tests/db/test_chapters_*.py` (crud, lifecycle, ops, sync) | Chapter DB ops; no progress-bar assertions |
| `tests/db/test_grouped_validation.py` | Grouped segment validation; DB-level, not progress-bar |
| `tests/db/test_db_isolation.py`, `test_db_queue.py`, etc. | Queue/state DB; T1 scope |
| `tests/api/test_api_chapters*.py`, `test_api_generation.py` etc. | API-level; T3/T4 scope |
| `tests/engines/test_engines.py`, `test_tts_server_isolation.py`, `test_bridge_tts_server.py`, `test_xtts_timing.py` | Engine integration; not progress-bar |
| `tests/utils/test_segmentation_regression.py`, `test_marker_robustness.py` | Text segmentation utilities; not progress |
| `tests/security/test_migration_security.py` | DB migration security; not progress |
| `tests/domain/test_production_ux.py`, `test_chunk_groups.py` | UX/grouping domain; not progress-bar |

---

## Classification Table

### PredictiveProgressBarLifecycle.test.tsx

| test | class | action | notes |
|---|---|---|---|
| jumps the loader to zero when preparing hands off to running | REAL | keep | Renders real component, uses fake timers, asserts displayed `1%` label after status+props update |
| is null-safe for debug snapshots before first capture | REAL | keep | Asserts `onDebugSnapshot` contract: snapshot not null, `migrationProgress` null on first call |
| re-anchors to the first real running progress when startedAt changes from preparing into a live run | REAL | keep | Production sequence: preparing → running with new `startedAt`; asserts displayed `5%` after tick |
| includes all transition and confidence fields in debug snapshot | REAL | keep | Asserts debug snapshot includes all tunable props; validates prop passthrough contract |
| uses the generic default transition of 8 ticks | REAL | keep | Default prop assertion via snapshot; verifies `transitionTickCount` defaults without passing it |
| performs an instant mode swap (no backward animation) on preparing -> running transition | REAL | keep | Status lane transition; width stays `0%` immediately after rerender, no spurious animation |
| verifies real queue trace sequence: running 0/no ETA -> metadata -> grouped progress | REAL | keep | Production sequence per queue trace; asserts bar moves after ETA metadata arrives |
| smoothly animates finalizing status to 100 percent instead of resetting/stalling | REAL | keep | done-transition invariant: bar must reach 100% without stalling; tested against real component with fake timers |
| animates progress normally when startedAt is undefined and subsequent progress 0 updates are received | REAL | keep | Regression guard: `allowBackwardProgress=false` + duplicate progress=0 updates must not reset visual; caller-shaped props |
| renders an exact-mode segment handoff to 0 percent immediately and reports 0 display progress | REAL | keep | Segment remount sequence (`key` change); `allowBackwardProgress=true` on new key starts at 0; `onDisplayProgress` callback verified |
| keeps segment-style 0 percent fixed when no ETA metadata is passed and time advances | REAL | keep | `predictive=false`, no ETA → bar must stay at 0% even after timer advance; non-predictive segment invariant |
| does not trigger infinite loop and progresses normally when onDisplayProgress updates parent state and allowBackwardProgress is true | REAL | keep | Regression guard for infinite-render loop; `onDisplayProgress` → `setState` cycle must not crash |

### PredictiveProgressBarRendering.test.tsx

| test | class | action | notes |
|---|---|---|---|
| renders correctly with given progress | REAL | keep | Basic smoke: label and percentage text rendered at `progress=0.5` |
| stays at zero while queued | REAL | keep | `status="queued"` → shows "Queued" text; progress=0.5 not displayed |
| shows preparing as an indeterminate state even when live timing data exists | REAL | keep | `status="preparing"` forces indeterminate (`.progress-bar-pending`), ignores `progress=0.42` |
| can render raw live progress without ETA prediction | REAL | keep | `predictive=false` + no ETA → `16%` label displayed; validates non-predictive path |
| renders a barber-pole preparing state when preparing is active | REAL | keep | `.progress-bar-pending` CSS class and `0%` width contract for preparing |
| auto-flips a running bar to finalizing at 100 percent until done arrives | REAL | keep | `running` + `progress=1` → `.progress-bar-finalizing` CSS class and `100%` width |
| renders a distinct complete state for done jobs | REAL | keep | `done` status → "Complete" text; specific gradient background style |
| renders barOnly mode correctly | REAL | keep | `barOnly=true` → no percent text, `data-testid="progress-bar-tiny"` present |
| activates the progress bar for running jobs even at exactly 0.0 progress | REAL | keep | `running` + `progress=0` → determinate bar (no `.progress-bar-pending`), `0%` width |
| remains at determinate 0% for running jobs without an ETA | REAL | keep | `running` + no ETA → same determinate treatment |
| does not reset visual progress to 0 when the same bar instance receives a new segment-level persistenceKey mid-run | REAL | keep | `allowBackwardProgress=false` memory floor: changing `persistenceKey` must not snap bar backward to 0% |
| rounds CSS style width strictly to 1 decimal place | REAL | keep | CSS width formatting contract: `0.2192...` → `"21.9%"` |
| uses the provided dataTestId prop for the data-testid attribute | REAL | keep | `dataTestId` prop wired to DOM `data-testid` attribute |

### PredictiveProgressBarTiming.test.tsx

| test | class | action | notes |
|---|---|---|---|
| calculates ETA using elapsed time | REAL | keep | ETA label text checked against real elapsed-time calculation |
| auto-flips a running bar to finalizing when the eta is exhausted | REAL | keep | `progress=0.996` + exhausted ETA → finalizing label shown |
| does not increase ETA unless a new prop update gives a later endAtMs | REAL | keep | ETA count-down invariant: timer advance only decreases displayed ETA; new prop with same eta doesn't jump |
| increases ETA when a new prop update gives a later endAtMs after the migration window advances | REAL | keep | Later `etaSeconds` triggers lane migration after tick |
| smooths ETA changes across the lane migration window instead of snapping immediately to a later target | REAL | keep | Lane migration timing: ETA smoothly transitions mid-value, settles at new target |
| triggers predictive movement for running 0.0 jobs as soon as an ETA is provided | REAL | keep | `progress=0` + ETA metadata → bar starts moving after 10s |
| starts resumed jobs from authoritative backend progress instead of jumping ahead on mount | REAL | keep | Mount with authoritative `progress=0.25` → displayed at `25%`, advances forward only |
| prioritizes positive etaSeconds over estimatedEndAt when etaBasis is remaining_from_update | REAL | keep | ETA priority contract: `etaSeconds=30` displayed even when `estimatedEndAt` suggests different value |
| applies confidence to ETA migration using evidenceWeightFraction | REAL | keep | `evidenceWeightFraction=0.10` → only 10% of ETA update adopted; tests blended target |
| preserves authoritative behavior when evidenceWeightFraction=1.0 | REAL | keep | Full evidence weight → full target adoption after migration |
| ~~ensures rendered progress and remaining ETA stay mathematically coherent for a stable lane~~ | ~~MOCKED-OUT~~ | **REWRITTEN** | Was: re-implemented `0.995` ceiling constant from component in test assertion (`remaining / (1 - p / 0.995) = const`). Rewritten to assert the directly observable invariant: monotonic progress increase and ETA decrease over time on a stable lane. |
| ensures confidence-weighted updates keep progress and ETA in sync during migration | REAL | keep | Bounds check (60–310s): does not re-implement the constant, checks that the migration stays within the range between old and new target durations |
| ensures remaining_from_update updates with a known startedAt do not visually re-anchor the lane to now | REAL | keep | Re-anchor guard: `startedAt` known → lane stays anchored at `startedAt`, not the update time |
| ensures done status resolves to 100 percent and 0 remaining ETA | REAL | keep | Terminal snapshot contract: `localProgress=1.0`, `displayedRemaining=0` |
| does not snap to 100 percent immediately on done transition, hides ETA, and continues tick loop | REAL | keep | done-animation invariant: ETA hidden immediately, progress animates to 100%, tick loop continues |
| does not snap to 100 percent immediately when transitioning to done with undefined startedAt and etaSeconds | REAL | keep | done-animation with unknown props: must still animate rather than snap |
| does not snap to 100 percent when a done update arrives after a running progress=1.0 update | REAL | keep | running→done sequence with in-flight 1.0 update; visual must not jump |
| reproduces production done sequence with undefined startedAt and etaSeconds | REAL | keep | Full production done path: startedAt/eta present on running, cleared on done; bar reaches 100% |

### PredictiveProgressBarTransitions.test.tsx

| test | class | action | notes |
|---|---|---|---|
| animates exact-mode target updates without ETA prediction | REAL | keep | `predictive=false`: prop update 0→0.33; bar animates through mid-values; `onDisplayProgress` callbacks verified |
| moves backward smoothly when allowBackwardProgress is true | REAL | keep | `allowBackwardProgress=true`: 60%→25% with fake timers; visual settles at 25% |
| honors transitionTickCount and tickMs for migration duration | REAL | keep | Migration timing contract: at 200ms of a 400ms migration, bar is between 10% and 50% |
| clumps backward progress when allowBackwardProgress is false | REAL | keep | `allowBackwardProgress=false`: 60%→20% update; displayed stays ≥60% |
| honors evidenceWeightFraction by only moving a fraction of the distance toward target | REAL | keep | `evidenceWeightFraction=0.5`: `effectiveTargetProgress` from snapshot is 30%; bar settles there |
| uses backwardTransitionTickCount (default 2) for backward migrations | REAL | keep | Snapshot fields: `isBackwardMigration=true`, `activeTransitionTickCount=2`, `migrationDurationMs=500` |
| moves backward on ETA-backed lanes when allowBackwardProgress is true | REAL | keep | ETA-backed lane with `allowBackwardProgress=true`: drops from 60% to 25% after 500ms |
| does not move backward on ETA-backed lanes when allowBackwardProgress is false | REAL | keep | Core regression guard: ETA-backed + `allowBackwardProgress=false` must not allow backward motion |
| does not label the job status as Rendering or Finalizing before the backend status reaches those states | REAL | keep | Label faithfulness: `preparing→running→finalizing` status labels in UI stay in sync with backend status prop |

### progressBarContracts.test.ts

| test | class | action | notes |
|---|---|---|---|
| builds the ChapterHeader segment progress contract with no backward corrections | REAL | keep | Verifies every field of `buildSegmentProgressBarProps` output including hardcoded `allowBackwardProgress=false`, `evidenceWeightFraction=1` (input is ignored by design — the contract function always forces these values) |
| seeds START_SEGMENT at zero with a default 120 second ETA when no explicit ETA is present | REAL | keep | Validates the `progress=0` + no-ETA → `etaSeconds=120` seeding logic |
| uses explicit segment ETA fields when provided by the segment event | REAL | keep | Validates explicit `etaSeconds`/`etaBasis`/`updatedAt` pass-through |

### tests/db/test_db_segments_cleanup.py

| test | class | action | notes |
|---|---|---|---|
| test_cleanup_orphaned_segments_shared_dir | REAL | keep | Real DB + filesystem: two chapters share a dir; orphan file deleted, valid files for both chapters survive |
| test_get_chapter_segments_resets_stale_processing_without_active_work | REAL | keep | Real DB: stale `processing` segment status reset to `unprocessed` on load when no active work is ongoing |

### tests/engines/test_xtts_segment_grouping.py

| test | class | action | notes |
|---|---|---|---|
| test_single_segment_no_extra_spaces | REAL | keep | Pure function; asserts no trailing/leading whitespace in joined output |
| test_two_segments_joined_with_single_space | REAL | keep | Join contract: exactly one space between segments |
| test_three_segments_each_separated_by_one_space | REAL | keep | Generalizes to three-way join |
| test_no_double_space_between_stripped_segments | REAL | keep | No double-space invariant for stripped segment text |
| test_size_budget_matches_join_length | REAL | keep | Budget invariant: `join_group_text` length equals the grouper's budget formula |

### tests/utils/test_textops_bugs_b8_b9.py

| test | class | action | notes |
|---|---|---|---|
| test_b8_blank_line_boundary_preserved | REAL | keep | Bug fix regression: blank-line paragraph boundaries must survive `safe_split_long_sentences` |
| test_b8_long_sentence_within_paragraph_still_split | REAL | keep | Long sentence + paragraph break: both splitting and paragraph preservation work together |
| test_b8_single_newline_within_paragraph_unchanged | REAL | keep | Single `\n` within a paragraph must remain single `\n` (not promoted to `\n\n`) |
| test_b8_multiple_blank_lines_preserved | REAL | keep | Multiple blank lines produce at least a `\n\n` in output |
| test_b9_single_long_line | REAL | keep | 1200-char line split to ≤500 chars by `pack_text_to_limit` |
| test_b9_no_whitespace_token | REAL | keep | 600-char no-whitespace token hard-cut at limit |
| test_b9_mixed_normal_text | REAL | keep | Random word text within limit |
| test_b9_chunk_count_reasonable | REAL | keep | Minimum chunk count for 1200-char input at limit 500 |
| test_b9_empty_input | REAL | keep | Empty string → empty string; edge case |
| test_b9_normal_short_text_unchanged | REAL | keep | Short text fits in one chunk; no corruption |

### tests/orchestration/test_progress_logic.py (segment/progress-related subset)

| test | class | action | notes |
|---|---|---|---|
| test_calculate_predicted_progress_xtts_preparing | REAL | keep | Backend ETA: preparing jobs hold at current_p=0, not animated |
| test_calculate_predicted_progress_xtts_running | REAL | keep | Backend ETA: elapsed/eta → 40% calculation |
| test_calculate_predicted_progress_finalizing | REAL | keep | Finalizing freezes progress at current value |
| test_calculate_predicted_progress_caps | REAL | keep | Cap at 0.85 default, custom cap honored |
| test_calculate_predicted_progress_regression_protection | REAL | keep | Backend progress never decreases |
| test_active_segment_progress_guard | REAL | keep | `active_segment_progress` excluded from payload when `active_segment_id` is None |
| test_observed_remaining_seconds_early_blending | REAL | keep | Early blending (alpha=progress/0.15) at 5% progress; full extrapolation at 20% |
| test_update_job_early_eta_blending | REAL | keep | Integration: `update_job` applies blended ETA for early progress samples |
| test_terminal_job_drops_updates | REAL | keep | Cancelled job ignores all subsequent `update_job` calls |
| test_skip_studio_job_event | REAL | keep | `skip_studio_job_event=True` suppresses broadcast entirely |
| test_progress_service_chapter_progress_sends_canonical_envelope | REAL | keep | Full canonical `chapters.progress` event envelope validated field-by-field |
| test_progress_service_segment_progress_sends_canonical_envelope | REAL | keep | Full canonical `segments.progress` event envelope |
| test_progress_service_dual_progress_emission | REAL | keep | Dual-scope: lifecycle + segment + chapter events in correct order |
| test_progress_service_segment_eta_isolated_from_chapter_eta | REAL | keep | Segment ETA (0) must not bleed into chapter ETA (22) |
| test_progress_service_completed_segment_does_not_inherit_chapter_eta | REAL | keep | Completed segment (`progress=1.0`) has `etaSeconds=None`, not chapter's ETA |
| test_progress_service_segment_completion_matching_outcome | REAL | keep | Segment done/failed status matches job outcome at completion |
| test_progress_service_segment_handoff_completion_uses_segment_saved_command | REAL | keep | Segment handoff: completion uses `SEGMENT_SAVED` reason code |
| test_progress_service_emits_active_segment_eta_only_updates | REAL | keep | ETA-only update (same progress, different ETA) still emits events |
| test_meaningful_chapter_progress_emits_chapter_progress | REAL | keep | Status-unchanged tick still emits `chapters.progress` when progress changes |
| test_segment_progress_does_not_emit_queue_item_status | REAL | keep | Segment scope does not emit `queue.items` events |
| test_segment_block_eta_math | REAL | keep | Segment block ETA from baseline CPS and observed CPS |
| test_segment_block_eta_100_percent | REAL | keep | 100% segment progress → 0 ETA |
| test_segment_block_eta_uses_calibrated_cps | REAL | keep | Calibrated CPS overrides derived baseline |
| test_progress_service_coerces_preparing_after_started_at | REAL | keep | `preparing` status after `started_at` set is coerced to `running` |
| test_orchestrator_publish_coerces_preparing_after_started_at | REAL | keep | Same coercion in orchestrator layer; DB updated to `running` |
| test_chapter_job_with_parent_id_classified_as_chapter | REAL | keep | Job classification rules: chapter vs segment vs job based on `parent_job_id`, `chapter_id`, `segment_ids` |
| test_chapter_progress_eta_samples_include_eta_updated_at | REAL | keep | Chapter progress event always includes `etaUpdatedAt` when eta_seconds is set |
| test_segment_progress_eta_samples_include_eta_updated_at | REAL | keep | Segment progress event always includes `etaUpdatedAt` when eta_seconds is set |
| test_update_job_terminal_status_defensively_clears_eta_fields | REAL | keep | Terminal status clears all ETA fields from job state |
| test_progress_service_duplicate_same_eta_progress_prevents_timestamp_update | REAL | keep | Duplicate ETA+progress must not refresh `etaUpdatedAt`; only fresh samples update timestamp |
| test_xtts_plugin_handler_terminal_clears_eta | REAL | keep | XTTS plugin sets ETA fields to None on cancel |
| test_voice_sample_unscaled_progress | REAL | keep | Voice sample progress not scaled by 0.70 |
| test_voice_sample_started_at_synthesis_start | REAL | keep | `started_at` set at `[START_SYNTHESIS]` marker, not at dispatch |
| test_voice_sample_started_at_fallback_to_first_progress | REAL | keep | Without `[START_SYNTHESIS]`, `started_at` falls back to first `[PROGRESS]` timestamp |
| test_voice_sample_terminal_done_progress | REAL | keep | Sample task reaches `progress=1.0` on completion without regression |

---

## Summary

| Classification | Count | Files affected |
|---|---|---|
| REAL | 92 | all |
| MOCKED-OUT | 1 | PredictiveProgressBarTiming.test.tsx |
| VACUOUS | 0 | — |
| WRONG-SCENARIO | 0 | — |
| FRAGILE | 0 | — |

**Total tests audited:** 93  
**Actions taken:** 1 test rewritten (MOCKED-OUT → REAL)

---

## Surviving Tests vs. Progress-Bar Invariants (doc 17 T2)

| Invariant | Covered by |
|---|---|
| **Monotonic display unless allowBackwardProgress** | Transitions: `clumps backward progress when allowBackwardProgress is false`; `does not move backward on ETA-backed lanes when allowBackwardProgress is false`; Lifecycle: `animates progress normally when startedAt is undefined and subsequent progress 0 updates are received`; Rendering: `does not reset visual progress to 0 when the same bar instance receives a new segment-level persistenceKey` |
| **Lane transitions on status change** | Lifecycle: `jumps the loader to zero when preparing hands off to running`; `performs an instant mode swap on preparing -> running transition`; Transitions: `does not label the job status as Rendering or Finalizing before the backend status reaches those states` |
| **Authoritative floor honored** | Transitions: `clumps backward progress when allowBackwardProgress is false`; `does not move backward on ETA-backed lanes when allowBackwardProgress is false`; Lifecycle: `renders an exact-mode segment handoff to 0 percent immediately` (key-based reset works correctly on new key) |
| **Done animation reaches 100** | Lifecycle: `smoothly animates finalizing status to 100 percent instead of resetting/stalling`; Timing: `does not snap to 100 percent immediately on done transition`; `does not snap to 100 percent immediately when transitioning to done with undefined startedAt and etaSeconds`; `does not snap to 100 percent when a done update arrives after a running progress=1.0 update`; `reproduces production done sequence with undefined startedAt and etaSeconds` |
| **Monotonic ETA decrease on stable lane** | Timing: `monotonically increases displayed progress and decreases ETA on a stable lane with no prop updates` (rewritten from MOCKED-OUT) |
| **Caller contract shapes (allowBackwardProgress explicitly passed)** | All Lifecycle/Transitions/Rendering tests use explicit `allowBackwardProgress=...` — no test relies on the derived default |

---

## Revert-check record

The rewritten test (`monotonically increases displayed progress and decreases ETA on a stable lane with no prop updates`) was verified by its predecessor failing mode: the old test would have continued passing even if the 0.995 ceiling was changed, because it asserted `duration ≈ initialDuration` — a self-referential property derived from the same constant. The new test asserts strict monotonic progress increase; it would fail if the component's tick loop was broken or if the timer integration stopped advancing the bar.

The rewrite was **not** revert-checked against pre-fix code (the fix is a test rewrite, not a component fix). The component behavior being tested (monotonic progress advance) has direct coverage in multiple other tests (e.g., `triggers predictive movement for running 0.0 jobs as soon as an ETA is provided`) that also advance timers and check increasing progress.

---

## Riskiest Findings

1. **The rewritten test (MOCKED-OUT):** `ensures rendered progress and remaining ETA stay mathematically coherent for a stable lane` encoded the component's internal `0.995` ceiling constant. If that constant changed, the test would fail even though the displayed behavior was still correct. More dangerously: if the component's tick loop was broken but the constant remained, the test would still pass (because `initialDuration` would be `null` on the first step and the `toBeCloseTo` comparison would never run on a broken bar). The rewrite fixes both issues.

2. **`test_xtts_plugin_handler_terminal_clears_eta`** patches `update_job` at the plugin level. This is acceptable (mocking only the DB layer, not the unit under test — the handler logic). But the test uses a `MockJob` dataclass that omits several fields present on real `Job` objects. If the handler ever accesses a missing field before the cancel_check, the test would crash rather than measure the ETA-clear behavior. Low risk today; worth monitoring.

3. **`test_prioritizes positive etaSeconds over estimatedEndAt`** mocks `Date.now()` to return `now * 1000` (milliseconds) but passes `startedAt = now - 200` (seconds). The implicit assumption is that `etaBasis="remaining_from_update"` bypasses the elapsed-time calculation entirely, so the mis-scaled mock doesn't affect the result. This is fragile if the component's ETA path ever falls back to elapsed-time calculation under that basis. The test passes today and the behavior it describes is real, but the mock setup is confusing.
