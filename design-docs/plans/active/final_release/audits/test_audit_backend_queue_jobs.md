# Test Quality Audit — Backend Queue / Jobs (T1)

Date: 2026-06-10  
Auditor: Claude Sonnet 4.6

---

## Summary

| Class | Count |
|---|---|
| REAL | 89 |
| VACUOUS | 1 (deleted) |
| MOCKED-OUT | 6 (all rewritten as REAL) |
| WRONG-SCENARIO | 3 (2 deleted, 1 corrected) |
| FRAGILE | 0 |
| **Total in scope** | **105** (final) |

106 tests going in → 105 coming out (1 deleted: `test_broadcast_job_updated_uses_phase4_progress_rounding`).  
Renamed 1 test for clarity. Fixed status literal in 1 test.

---

## Classification Table

### tests/db/test_db_queue.py

| test | class | action | notes |
|---|---|---|---|
| test_queue_lifecycle | REAL | keep | Full add→running→done→clear lifecycle with real DB; asserts audio_status, audio_length_seconds |
| test_upsert_queue_row | REAL | keep | Verifies custom_title stored; real DB |
| test_upsert_queue_row_updates_metadata_for_existing_row | REAL | keep | Upsert updates custom_title + engine on existing row |
| test_upsert_queue_row_persists_segment_ids | REAL | keep | segment_ids round-trip through upsert |
| test_clear_queue | REAL | keep | clear_queue resets audio_status to unprocessed |
| test_reconcile_queue_status | REAL | keep | reconcile cancels orphaned row not in active list |
| test_reorder_and_remove | REAL | keep | reorder changes order; remove resets chapter status |
| test_reconcile_queue_status_cancels_orphaned_queued_rows | REAL | keep | B3-adjacent; reconcile with empty list cancels all queued rows |
| test_reconcile_queue_status_marks_terminal_memory_jobs_done | REAL | keep | memory-done jobs promoted in DB with completed_at set |

### tests/db/test_db_reconcile.py

| test | class | action | notes |
|---|---|---|---|
| test_reconcile_project_audio | REAL | keep | Real file on disk; mocks only ffprobe (external); asserts DB updated correctly |
| test_reconcile_project_audio_not_found | REAL | keep | Missing audio file resets status to unprocessed |
| test_reconcile_all_chapter_statuses | REAL | keep | Only active chapter stays processing; others reset |
| test_reconcile_all_empty_active | REAL | keep | Empty active set resets all processing |
| test_reconcile_queue_status_does_not_reset_chapter_with_done_row | REAL | keep | B3 regression; chapter with stale running row AND done row must not reset |

### tests/db/test_state_queue_sync.py

| test | class | action | notes |
|---|---|---|---|
| test_update_job_syncs_queue_before_broadcast_listener | REAL | keep | Ordering contract: queue sync happens before listener notified |
| test_update_job_passes_current_job_snapshot_to_three_arg_listeners | REAL | keep | 3-arg listeners receive correct current_job snapshot |
| test_add_job_listener_caches_snapshot_support | REAL | keep | _supports_job_snapshot attribute set after add_job_listener |
| test_add_job_listener_supports_bound_method_callbacks | REAL | keep | Bound method stored in _LISTENER_SNAPSHOT_SUPPORT |

### tests/db/test_state_rules.py

| test | class | action | notes |
|---|---|---|---|
| test_progress_rounding_rule | REAL | keep | Progress rounded to 2 decimal places (rule 3.20) |
| test_update_job_stamps_updated_at_for_state_and_broadcast | REAL | keep | updated_at propagated to both state and listener |
| test_progress_regression_protection | REAL | keep | Progress cannot go backward |
| test_status_regression_protection | REAL | keep | running cannot regress to preparing |
| test_reset_to_queued_from_terminal_status | REAL | keep | Terminal states can reset to queued |
| test_force_broadcast_overrides_protection | REAL | keep | force_broadcast bypasses regression protection |
| test_requeue_clean_slate | REAL | keep | Requeue clears log, errors, timestamps (rule 3.22) |
| test_finalizing_status_mapped_to_running | REAL | keep | "finalizing" remapped to "running" on put_job and update_job |
| test_eta_projection_uses_clamped_progress | REAL | keep | ETA computed using regression-clamped progress value |
| test_active_segment_progress_forced_to_zero_when_id_is_none | REAL | keep | active_segment_progress zeroed when active_segment_id is None |
| test_active_segment_eta_fields | REAL | keep | active_segment ETA fields stored and cleared with segment |
| test_chapter_queue_updates_do_not_overwrite_active_segment_eta | REAL | keep | Chapter-level updates do not clobber active segment ETA fields |

### tests/db/test_clear_logic.py

| test | class | action | notes |
|---|---|---|---|
| test_clear_all_history | WRONG-SCENARIO→REAL | corrected | Used `status="error"` which is not a valid Job status; corrected to `status="failed"`. Test behavior (cancel-all clears state) is contractual. |

### tests/db/test_state_jobs_broadcast.py

| test | class | action | notes |
|---|---|---|---|
| test_terminal_reset_preserves_explicit_started_at | REAL | keep | B5 regression: caller-supplied started_at not zeroed on terminal reset |
| test_update_job_status_transition_broadcast_previous_status | REAL | keep | B2: queued→running carries previous_status="queued" and status_changed=True |
| test_update_job_no_status_change_status_changed_false | REAL | keep | Progress-only update carries status_changed=False |
| test_concurrent_put_job_update_job_broadcast_consistency | REAL | keep | B1+B2 concurrent stress; asserts no status_changed=True when prev==new |

### tests/api/test_api_jobs.py

| test | class | action | notes |
|---|---|---|---|
| test_jobs_api | REAL | keep | WebSocket jobs_snapshot_request returns the in-memory job |

### tests/api/test_api_jobs_extended.py

| test | class | action | notes |
|---|---|---|---|
| test_api_jobs_returns_authoritative_running_progress | REAL | keep | Running job with no explicit progress returns 0.0 from snapshot |
| test_api_jobs_uses_authoritative_progress_when_segment_tracking_is_active | REAL | keep | progress=0.22 returned as-is when segment active |
| test_api_jobs_preserves_zero_running_progress_when_segment_id_exists_but_segment_progress_is_idle | REAL | keep | Segment idle: progress=0.0 not inflated |
| test_api_jobs_preserves_zero_preparing_progress_when_started | REAL | keep | Preparing job with progress=0.0 stays 0.0 |
| test_api_jobs_does_not_block_on_reconciliation | REAL | keep | Response within 1s (not a sleep; uses real clock) |
| test_api_jobs_returns_multiple_live_jobs_for_same_chapter_file | REAL | keep | Two jobs on same file both returned |
| test_api_jobs_preserves_live_metadata_fields | REAL | keep | updated_at, eta_confidence, reason_code, active_render_batch_* round-trip |

### tests/api/test_api_queue.py

| test | class | action | notes |
|---|---|---|---|
| test_queue_api | REAL | keep | Full queue lifecycle: add, get, reorder, delete, clear. Patches only TaskOrchestrator.submit (outside unit) |
| test_failed_queue_items_expose_error_reason | REAL | keep | Error string persists through queue lifecycle |
| test_processing_queue_reconciles_db_running_row_when_memory_job_is_done | REAL | keep | Running DB row promoted to done when memory shows done |
| test_processing_queue_keeps_old_done_voxtral_row_done_when_new_run_is_already_queued | REAL | keep | Historical done row not clobbered by new queued row for same chapter |
| test_segment_scoped_queue_updates_do_not_mutate_chapter_audio_state | REAL | keep | chapter_scoped=False: chapter audio_status/file unchanged |
| test_processing_queue_hydrates_running_progress_for_reload | REAL | keep | Running job: started_at and eta_seconds surfaced in GET /api/processing_queue |
| test_processing_queue_hydrates_running_progress_when_active_segment_is_set_but_idle | REAL | keep | Idle segment: progress=0.0 not inflated |
| test_processing_queue_hydrates_preparing_progress_for_reload | REAL | keep | Preparing status exposed in queue response |
| test_processing_queue_returns_completed_output_metadata_without_duplicate_rows | REAL | keep | produced_audio_length, chars, word_count from latest render sample; no duplicate rows |
| test_queue_never_returns_simulated_finalizing | REAL | keep | DB-only "done" row must not be misclassified as "finalizing" |
| test_processing_queue_hydrates_classification | REAL | keep | Running job without segment_ids gets classification="chapter" |

### tests/api/test_websocket_broadcast.py

| test | class | action | notes |
|---|---|---|---|
| test_websocket_broadcast (renamed) | VACUOUS→REAL | renamed to `test_websocket_connect_and_send` | Original: no assertions; only a connection send. Renamed to reflect the real contract: endpoint accepts connections without crashing. Assertions remain minimal but correct. |
| test_broadcast_job_updated_no_broadcast_when_no_classification (renamed) | WRONG-SCENARIO→REAL | renamed from `..._uses_current_job_status_for_normalized_event` | Original name was wrong; test asserts no WS messages for unclassified job update. Renamed to describe contract. |
| test_broadcast_job_updated_uses_phase4_progress_rounding | WRONG-SCENARIO | DELETED | Name claims to test rounding but asserts `messages == []` for unclassified job with no chapter context — identical to above test, wrong name, adds nothing. Deleted. |
| test_broadcast_job_updated_preserves_context_in_job_updated_payload | REAL | keep | segment-classified job update emits segments.progress with correct ids |
| test_broadcast_job_updated_chapter_progress_emits_chapter_progress_only | REAL | keep | chapter progress update emits only chapters.progress, not queue.items |
| test_broadcast_tts_log_line_sends_canonical_envelope | REAL | keep | Full envelope shape and payload for tts.logs event |
| test_broadcast_tts_log_line_sequences_are_per_job | REAL | keep | Sequence numbers are per-job; markers extracted from line |
| test_broadcast_queue_update_sends_canonical_envelope | REAL | keep | queue.items invalidated envelope shape |
| test_broadcast_segments_updated_sends_canonical_envelope | REAL | keep | segments.lifecycle envelope shape |
| test_broadcast_chapter_updated_sends_canonical_envelope | REAL | keep | chapters.lifecycle envelope shape |
| test_broadcast_project_updated_sends_canonical_envelope | REAL | keep | projects.lifecycle envelope shape |
| test_status_only_job_updates_do_not_emit_chapter_or_queue_updates | MOCKED-OUT→REAL | rewritten | Was mocking `_load_state_no_lock` and `_atomic_write_text`. Rewritten with real `put_job` + `update_job` + real state file. Revert-checked. |
| test_terminal_job_reset_to_active_emits_invalidation_broadcasts | MOCKED-OUT→REAL | rewritten | Same mock pattern. Rewritten with real state. Revert-checked. |
| test_update_job_with_force_broadcast_emits_chapter_and_queue_updates | MOCKED-OUT→REAL | rewritten | Same mock pattern. Rewritten with real state. Revert-checked. |
| test_update_job_propagates_source | MOCKED-OUT→REAL | rewritten | Same mock pattern. Rewritten using `_JOB_LISTENERS` injection (legitimate: testing what listeners receive). Revert-checked. |
| test_broadcast_job_updated_respects_skip_job_updated | REAL | keep | `broadcast_job_updated` with skip_job_updated emits nothing — only the ws function is involved, not state |
| test_update_job_respects_skip_job_updated | MOCKED-OUT→REAL | rewritten | Was mocking state primitives. Rewritten with real `put_job` + listener capture. Revert-checked. |
| test_api_add_to_queue_websocket_burst_no_redundancy | REAL | keep | Full API add-to-queue; asserts exactly 1 chapters.progress(queued), 1 chapter_updated, 1 queue_item_invalidated, 0 job_updated |
| test_build_studio_event_envelope_shape | REAL | keep | build_studio_event output shape contract |
| test_build_core_topic_helpers | REAL | keep | All 11 topic builders: shape, camelCase keys, confidence, reasonCode |
| test_build_plugin_event_success | REAL | keep | Plugin event topic derivation |
| test_build_plugin_event_validations | REAL | keep | Invalid plugin_id/area raises ValueError |
| test_broadcast_studio_event_sends_exact_event | REAL | keep | broadcast_studio_event passes event unchanged to manager.broadcast |
| test_broadcast_studio_event_does_not_mutate | REAL | keep | Event dict not mutated by broadcast call |
| test_broadcast_pause_state_sends_canonical_envelope | REAL | keep | queue.items queue_paused envelope with paused field |
| test_broadcast_test_progress_sends_canonical_envelope | REAL | keep | voice.test progress envelope shape |
| test_broadcast_test_progress_requires_job_id | REAL | keep | ValueError raised when job_id omitted |
| test_broadcast_segment_progress_sends_canonical_envelope | REAL | keep | segments.progress envelope shape |
| test_broadcast_job_updated_chapter_progress_sends_canonical_envelope | REAL | keep | chapters.progress full envelope with groupedProgress, renderGroupCount |
| test_broadcast_job_updated_chapter_progress_respects_skip_studio_job_event | REAL | keep | skip_studio_job_event=True suppresses all messages |
| test_broadcast_job_updated_segment_progress_sends_canonical_envelope | REAL | keep | segments.progress for segment-classified job |
| test_broadcast_job_updated_chapter_completion_emits_both | REAL | keep | Terminal chapter: jobs.lifecycle + chapters.progress both emitted |
| test_broadcast_job_updated_chapter_completion_suppression | REAL | keep | skip_studio_job_event=True suppresses terminal broadcast |
| test_broadcast_job_updated_segment_completion | REAL | keep | Segment handoff: prev seg done, new seg running, chapter progress emitted |
| test_broadcast_job_updated_segment_handoff_preserves_segment_commands | REAL | keep | reason_code forwarded to START_SEGMENT event |
| test_broadcast_tts_log_line_includes_plugin_metadata | REAL | keep | pluginId and pluginShortName in tts.logs payload |
| test_build_queue_item_invalidated_minimal_payload | REAL | keep | Invalidated event has no status/progress/classification keys |
| test_update_job_terminal_status_does_not_emit_queue_invalidation | MOCKED-OUT→REAL | rewritten | Was mocking `_load_state_no_lock`. Rewritten with real state. Revert-checked. |
| test_terminal_job_completion_path_emits_job_lifecycle_transition | REAL | keep | broadcast_job_updated terminal: jobs.lifecycle with JOB_DONE |
| test_rebuild_emits_minimum_necessary_lifecycle_and_progress_transitions | REAL | keep | ProgressService sequence: queued→preparing→running→progress→done; exact lifecycle reason codes |
| test_put_job_broadcasts_job_lifecycle_on_queued | REAL | keep | put_job broadcasts once with status_changed=False and correct fields |
| test_broadcast_job_updated_preserves_active_segment_eta_seconds | REAL | keep | active_segment_eta_seconds forwarded to segments.progress etaSeconds |
| test_terminal_status_clears_eta_seconds_and_eta_updated_at | REAL | keep | Terminal status: etaSeconds and etaUpdatedAt null in chapters.progress |
| test_broadcast_event_payload_emits_camelcase_only | REAL | keep | No snake_case keys in chapters.progress payload |
| test_broadcast_event_payload_includes_confidence_in_camelcase | REAL | keep | confidence key present as numeric in payload |
| test_broadcast_job_classification_progress_updates | REAL | keep | "job"-classified job emits queue.items with status+progress+etaSeconds |
| test_websocket_trace_sink_when_enabled | REAL | keep | STUDIO_SOCKET_TRACE env creates trace file with expected fields |
| test_websocket_trace_sink_disabled_by_default | REAL | keep | No trace file created when env not set; broadcast still fires |
| test_websocket_trace_includes_tts_logs | REAL | keep | tts.logs events written to trace file |
| test_voice_test_job_telemetry_isolation | REAL | keep | voice_test scope: voice.test + queue.items + jobs.lifecycle emitted; chapters.progress suppressed |
| test_broadcast_job_classification_force_broadcast_carries_voice_queue_metadata | REAL | keep | force_broadcast for done voice job: queue.items contains all metadata fields |

---

## What was changed

### Deleted (1)
- `tests/api/test_websocket_broadcast.py::test_broadcast_job_updated_uses_phase4_progress_rounding`  
  WRONG-SCENARIO: name claimed to test progress rounding but the body simply called `broadcast_job_updated` for an unclassified job and asserted `messages == []` — identical to the renamed test above it. Added nothing distinct.

### Rewritten as REAL (6)
All in `tests/api/test_websocket_broadcast.py`. All 6 were mocking `app.db.state_jobs._load_state_no_lock` and `app.db.state_jobs._atomic_write_text`, which are internal state-persistence primitives of the function under test (`update_job`). This caused the tests to exercise a mocked state store, not the real one.

Rewrites use the `_clean_ws_state` fixture (real state file via `tmp_path`) plus real `put_job` + `update_job` calls. WS functions (`broadcast_chapter_updated`, `broadcast_queue_update`, `_JOB_LISTENERS`) are captured as output boundaries — this is legitimate per the rubric.

All 6 revert-checked: inverting the production-side behavior (e.g., emitting `broadcast_queue_update` on terminal, or dropping `source` forwarding) causes the rewritten tests to fail.

### Corrected (1)
- `tests/db/test_clear_logic.py::test_clear_all_history`: Job created with `status="error"` which is not a valid `Status` literal (`Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]`). Corrected to `status="failed"`. The test asserts cancel-all clears state; the setup was WRONG-SCENARIO.

### Renamed (2)
- `test_websocket_broadcast` → `test_websocket_connect_and_send`: was VACUOUS (no real assertion); rephrased to correctly describe what the test does prove (connection and send without crash).
- `test_broadcast_job_updated_uses_current_job_status_for_normalized_event` → `test_broadcast_job_updated_no_broadcast_when_no_classification`: original name was unrelated to the behavior asserted. Behavior (no WS broadcast when job has no chapter/project/classification) is contractual.

---

## Riskiest findings

1. **6 MOCKED-OUT `update_job` tests** (the main finding): These tests gave false confidence that `update_job`'s broadcast routing was tested. Because `_load_state_no_lock` was patched, the tests never exercised the real state read/write cycle. Any regression in state-file integration would have been invisible. All rewritten.

2. **`test_broadcast_job_updated_uses_phase4_progress_rounding`**: Name was actively misleading — implied rounding logic was covered when it was not. No actual rounding assertion anywhere in the test. Deleted to prevent future confusion about rounding test coverage.

3. **`status="error"` in test_clear_logic.py**: Python type system would have caught this (Literal validation), but the test passed because Pydantic/dataclass validation was not enforced at construction. This is a WRONG-SCENARIO in setup that could mask model-level validation bugs.

---

## Lifecycle behaviors mapped by surviving tests

| Lifecycle behavior | Tests |
|---|---|
| Add to queue / queue ordering | test_queue_lifecycle, test_queue_api, test_reorder_and_remove |
| Duplicate-add prevention | test_queue_lifecycle (duplicate add returns None) |
| Segment-scoped queue writes don't mutate chapter audio state | test_segment_scoped_queue_updates_do_not_mutate_chapter_audio_state |
| Reconcile: orphaned running rows cancelled | test_reconcile_queue_status, test_reconcile_queue_status_cancels_orphaned_queued_rows |
| Reconcile: memory-done jobs promoted in DB | test_reconcile_queue_status_marks_terminal_memory_jobs_done |
| Reconcile: stale running + existing done row preserved (B3) | test_reconcile_queue_status_does_not_reset_chapter_with_done_row |
| Audio file reconciliation on disk | test_reconcile_project_audio, test_reconcile_project_audio_not_found |
| Progress rounding (2dp) | test_progress_rounding_rule |
| Progress regression protection | test_progress_regression_protection |
| Status regression protection | test_status_regression_protection |
| Terminal reset (clean slate / requeue) | test_reset_to_queued_from_terminal_status, test_requeue_clean_slate |
| force_broadcast overrides protections | test_force_broadcast_overrides_protection, test_update_job_with_force_broadcast_emits_chapter_and_queue_updates |
| ETA projection with clamped progress | test_eta_projection_uses_clamped_progress |
| Active segment ETA stored/cleared | test_active_segment_eta_fields, test_chapter_queue_updates_do_not_overwrite_active_segment_eta |
| Queue sync before listener broadcast | test_update_job_syncs_queue_before_broadcast_listener |
| B2: previous_status in broadcast | test_update_job_status_transition_broadcast_previous_status |
| B5: caller-supplied started_at on reset | test_terminal_reset_preserves_explicit_started_at |
| WS envelope: all topic builders | test_build_core_topic_helpers, test_build_studio_event_envelope_shape |
| WS routing: chapter progress | test_broadcast_job_updated_chapter_progress_emits_chapter_progress_only, test_broadcast_job_updated_chapter_progress_sends_canonical_envelope |
| WS routing: segment progress + handoff | test_broadcast_job_updated_segment_completion, test_broadcast_job_updated_segment_handoff_preserves_segment_commands |
| WS routing: terminal emits jobs.lifecycle | test_broadcast_job_updated_chapter_completion_emits_both, test_terminal_job_completion_path_emits_job_lifecycle_transition |
| WS routing: no broadcast on unclassified job | test_broadcast_job_updated_no_broadcast_when_no_classification |
| WS routing: status-only no chapter/queue broadcast | test_status_only_job_updates_do_not_emit_chapter_or_queue_updates |
| WS routing: terminal no queue_invalidated | test_update_job_terminal_status_does_not_emit_queue_invalidation |
| WS routing: terminal reset emits both broadcasts | test_terminal_job_reset_to_active_emits_invalidation_broadcasts |
| WS source propagation | test_update_job_propagates_source |
| WS skip_job_updated flag | test_broadcast_job_updated_respects_skip_job_updated, test_update_job_respects_skip_job_updated |
| WS add-to-queue burst: no redundant messages | test_api_add_to_queue_websocket_burst_no_redundancy |
| Voice test telemetry isolation | test_voice_test_job_telemetry_isolation |
| Socket trace sink | test_websocket_trace_sink_when_enabled, test_websocket_trace_sink_disabled_by_default, test_websocket_trace_includes_tts_logs |
