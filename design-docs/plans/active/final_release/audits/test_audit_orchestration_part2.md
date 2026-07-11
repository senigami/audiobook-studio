# Test Quality Audit — tests/orchestration/ (m–z files)

**Date:** 2026-06-10  
**Scope:** 15 files with filenames starting m–z in `tests/orchestration/`  
**Auditor:** Claude Code (Sonnet 4.6)  
**Result:** 177 tests pass (3 deleted); 0 VACUOUS/MOCKED-OUT remaining in scope.

---

## Classification Table

### test_orchestration_tasks.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_assembly_task_validation | — | REAL | kept | Exercises real AssemblyTask.validate(); mock at engine boundary (stitch_segments) is legitimate |
| test_assembly_task_run | — | REAL | kept | AssemblyTask.run() executes against real code; stitch_segments is the subprocess/audio-ops boundary |
| test_bake_task_validation | — | REAL | kept | Real BakeTask.validate() |
| test_bake_task_run_mp3 | — | REAL | kept | Real BakeTask.run(); wav_to_mp3 is legitimate external boundary |
| test_export_task_validation | — | REAL | kept | Real ExportTask.validate() |
| test_export_task_run | — | REAL | kept | Real ExportTask.run(); assemble_audiobook is legitimate external subprocess boundary |

### test_orchestrator_v2.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_default_is_studio_first | TestGetPriorityMode | REAL | kept | Exercises real get_priority_mode(); monkeypatch of env/settings is legitimate clock/env boundary |
| test_envvar_studio_first | TestGetPriorityMode | REAL | kept | |
| test_envvar_equal | TestGetPriorityMode | REAL | kept | |
| test_envvar_api_first | TestGetPriorityMode | REAL | kept | |
| test_invalid_envvar_falls_back_to_studio_first | TestGetPriorityMode | REAL | kept | |
| test_empty_queue_returns_none | TestChooseNextTask | REAL | kept | Real choose_next_task() against empty list |
| test_single_task_returned | TestChooseNextTask | REAL | kept | Real choose_next_task() with one task |
| test_studio_first_prefers_studio_task | TestChooseNextTask | REAL | kept | Real priority policy exercised |
| test_api_first_prefers_api_task | TestChooseNextTask | REAL | kept | |
| test_equal_respects_fifo_order | TestChooseNextTask | REAL | kept | |
| test_studio_first_fifo_within_bucket | TestChooseNextTask | REAL | kept | |

### test_progress_broadcaster.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_broadcast_progress_uses_configured_sink | — | REAL | kept | Exercises real broadcast_progress/configure_progress_broadcaster; sink is an injected test double, which is the correct boundary |
| test_broadcast_progress_supports_manager_style_adapter | — | REAL | kept | Same reasoning; exercises real adapter pattern |

### test_progress_logic.py

Large file with many tests. All exercise real `ProgressService`, `OrchestratorHelpersMixin`, `update_job`, and event-builder functions. Broadcaster/reconcile are injected test doubles (the legitimate boundary for this unit).

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_calculate_predicted_progress_xtts_preparing | — | REAL | kept | Real calculate_predicted_progress() |
| test_calculate_predicted_progress_xtts_running | — | REAL | kept | |
| test_calculate_predicted_progress_finalizing | — | REAL | kept | |
| test_calculate_predicted_progress_caps | — | REAL | kept | |
| test_calculate_predicted_progress_regression_protection | — | REAL | kept | |
| test_active_segment_progress_guard | — | REAL | kept | Real ProgressService._build_progress_payload() |
| test_observed_remaining_seconds_early_blending | — | REAL | kept | Real OrchestratorHelpersMixin._observed_remaining_seconds() |
| test_update_job_early_eta_blending | — | REAL | kept | Real update_job() with state isolation via patched STATE_FILE |
| test_terminal_job_drops_updates | — | REAL | kept | Real update_job() with terminal state |
| test_skip_studio_job_event | — | REAL | kept | Real broadcast_job_updated(); patches ws.manager.broadcast (network boundary) |
| test_progress_service_chapter_progress_sends_canonical_envelope | — | REAL | kept | Real ProgressService.publish(); broadcaster is test double at the ws boundary |
| test_progress_service_segment_progress_sends_canonical_envelope | — | REAL | kept | |
| test_progress_service_dual_progress_emission | — | REAL | kept | |
| test_progress_service_segment_eta_isolated_from_chapter_eta | — | REAL | kept | |
| test_progress_service_completed_segment_does_not_inherit_chapter_eta | — | REAL | kept | |
| test_progress_service_segment_completion_matching_outcome | — | REAL | kept | |
| test_progress_service_segment_handoff_completion_uses_segment_saved_command | — | REAL | kept | |
| test_progress_service_emits_active_segment_eta_only_updates | — | REAL | kept | |
| test_meaningful_chapter_progress_emits_chapter_progress | — | REAL | kept | |
| test_segment_progress_does_not_emit_queue_item_status | — | REAL | kept | |
| test_segment_block_eta_math | — | REAL | kept | Real _estimate_active_segment_eta_seconds() |
| test_segment_block_eta_100_percent | — | REAL | kept | |
| test_segment_block_eta_uses_calibrated_cps | — | REAL | kept | |
| test_progress_service_coerces_preparing_after_started_at | — | REAL | kept | Real ProgressService.publish() status coercion |
| test_orchestrator_publish_coerces_preparing_after_started_at | — | REAL | kept | Real OrchestratorHelpersMixin._publish(); state patched at DB boundary |
| test_chapter_job_with_parent_id_classified_as_chapter | — | REAL | kept | Real Job.classification property |
| test_chapter_progress_eta_samples_include_eta_updated_at | — | REAL | kept | Real build_chapter_progress_event() |
| test_segment_progress_eta_samples_include_eta_updated_at | — | REAL | kept | Real build_segment_progress_event() |
| test_update_job_terminal_status_defensively_clears_eta_fields | — | REAL | kept | Real update_job() ETA field clearing |
| test_progress_service_duplicate_same_eta_progress_prevents_timestamp_update | — | REAL | kept | Real ProgressService.publish() dedup |
| test_xtts_plugin_handler_terminal_clears_eta | — | REAL | kept | Real handle_xtts_job(); update_job mocked at DB boundary, not at tested function |
| test_voice_sample_unscaled_progress | — | REAL | kept | Real _dispatch() + watchdog listener; confirms no 0.7 scaling |
| test_voice_sample_started_at_synthesis_start | — | REAL | kept | Real _dispatch() + watchdog listener |
| test_voice_sample_started_at_fallback_to_first_progress | — | REAL | kept | |
| test_voice_sample_terminal_done_progress | — | REAL | kept | Real SampleTestTask + _dispatch() |

### test_progress_parsing.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_progress_simulation | — | MOCKED-OUT | **DELETED** | Defined `simulate_line()` locally in the test body and tested that local function. The actual `on_output` handler in `app/orchestration/` was never called. Progress was computed from `elapsed / eta` using the test's own code — had no test/revert value against production changes. Real coverage exists in `test_watchdog_progress_logic.py` (live watchdog listener tests). |

### test_progress_reconciliation.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_reconcile_work_item_marks_valid_artifacts_reusable | — | REAL | kept | Real reconcile_work_item() and build_artifact_manifest() |
| test_reconcile_work_item_marks_stale_manifests | — | REAL | kept | |
| test_reconcile_work_item_rejects_artifact_hash_mismatches | — | REAL | kept | |
| test_reconcile_work_item_marks_missing_artifacts | — | REAL | kept | |
| test_reconcile_work_item_degrades_lookup_failures_to_unknown | — | REAL | kept | |
| test_reconcile_work_item_marks_malformed_lookup_payloads_unknown | — | REAL | kept | |
| test_reconcile_work_item_marks_incomplete_requests_unknown | — | REAL | kept | |
| test_progress_service_reconcile_passes_request_context | — | REAL | kept | Real ProgressService.reconcile() with injected reconcile_fn double |

### test_progress_service.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_publish_throttles_small_progress_churn | — | REAL | kept | Real ProgressService.publish() with controlled fake clocks |
| test_publish_emits_heartbeat_after_silence | — | REAL | kept | Uses fake monotonic clock — no sleep |
| test_publish_allows_explicit_progress_regression_for_recovery | — | REAL | kept | |
| test_monotonic_progress_and_eta_selection | — | REAL | kept | Real _normalize_monotonic_progress() and estimate_eta_seconds() |
| test_estimate_eta_does_not_advance_published_progress_floor | — | REAL | kept | |
| test_publish_queued_reset_clears_progress_floor_without_explicit_flag | — | REAL | kept | |
| test_publish_includes_explicit_eta_basis | — | REAL | kept | |
| test_publish_includes_render_group_context | — | REAL | kept | |
| test_publish_remaps_finalizing_to_running | — | REAL | kept | |

### test_recover.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_empty_context_list_returns_empty | TestOrchestratorRecover | REAL | kept | Real orchestrator.recover(); load_recoverable_task_contexts patched at DB boundary |
| test_valid_artifacts_complete_without_dispatch | TestOrchestratorRecover | REAL | kept | progress_service is injected dep (boundary), not code under test |
| test_unresolved_artifacts_requeued_not_redispatched | TestOrchestratorRecover | REAL | kept | |
| test_recovery_uses_allow_progress_regression | TestOrchestratorRecover | REAL | kept | |
| test_recovery_publishes_recovery_resumed_reason | TestOrchestratorRecover | REAL | kept | |
| test_multiple_contexts_all_recovered | TestOrchestratorRecover | REAL | kept | |

### test_registry_dispatch.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_dispatch_uses_registry_handler | — | REAL | kept | Real _dispatch() with real JobHandlerRegistry; mock handler is at the engine/registry boundary |
| test_dispatch_falls_back_to_task_run_if_no_handler | — | REAL | kept | Real _dispatch() fallback path to task.run() |

### test_singleton.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_create_orchestrator_returns_singleton | — | REAL | kept | Real create_orchestrator() singleton contract |
| test_singleton_orchestrator_cancellation_routing | — | REAL | kept | Real cancel() across singleton references; task is a mock but at the task-interface boundary |

### test_startup_eta.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_heartbeat_eta_stability | — | REAL | kept | Real update_job(); _load_state_no_lock and _atomic_write_text patched at FS boundary |
| test_post_synthesis_milestones_do_not_reproject_eta | — | REAL | kept | Real update_job() ETA projection suppression |
| test_expected_duration_filters_history_by_plugin_model | — | REAL | kept | Real StudioTask.get_expected_duration() |
| test_expected_duration_uses_calibrated_overhead_and_cps | — | REAL | kept | |
| test_startup_chapter_eta_overhead_subtraction | — | REAL | kept | Real calculate_chapter_startup_eta() |
| test_segment_eta_excludes_overhead | — | REAL | kept | Real calculate_segment_eta() |
| test_live_chapter_remaining_eta_no_double_counting | — | REAL | kept | Real calculate_chapter_remaining_eta() |
| test_uncalibrated_model_suppresses_eta | — | REAL | kept | |
| test_eta_behavior_unchanged_by_speed_multiplier_setting | — | REAL | kept | |
| test_get_expected_duration_uses_real_group_count | — | REAL | kept | Real SynthesisTask.get_expected_duration() with chunk group mocks (domain boundary) |
| test_get_expected_duration_prefers_self_script | — | REAL | kept | |
| test_get_expected_duration_empty_history_cps_only_fallback | — | REAL | kept | |
| test_active_segment_eta_empty_history_cps_only_fallback | — | REAL | kept | |
| test_plugin_log_contract_timing_markers | — | REAL | kept | Real get_timing_markers() and match_timing_marker() |
| test_orchestrator_log_listener_captures_timing_model_metrics | — | REAL | kept | Real _dispatch() log listener; _publish patched to isolate state side-effects cleanly |
| test_orchestrator_records_render_sample_marker_timing | — | REAL | kept | Real _dispatch() + get_render_history() |
| test_engine_without_manifest_ignores_fallback_completion | — | REAL | kept | |
| test_start_segment_proportional_eta | — | REAL | kept | |
| test_structured_timing_derivation_segmented | — | REAL | kept | Real _dispatch() + FakeBridge (TTS server boundary) |
| test_structured_timing_derivation_non_segmented | — | REAL | kept | |
| test_structured_timing_derivation_out_of_order | — | REAL | kept | |
| test_structured_timing_fallback_when_absent | — | REAL | kept | |

### test_submit.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_validate_called_before_reconcile | TestOrchestratorSubmitValidation | REAL | kept | Real orchestrator.submit(); task mock at task-interface boundary |
| test_validation_failure_raises_value_error | TestOrchestratorSubmitValidation | REAL | kept | |
| test_validation_failure_does_not_publish | TestOrchestratorSubmitValidation | REAL | kept | |
| test_reuse_decision_skips_dispatch | TestOrchestratorSubmitReconciliation | REAL | kept | |
| test_reuse_decision_publishes_queued_then_completed | TestOrchestratorSubmitReconciliation | REAL | kept | |
| test_reuse_decision_publishes_progress_1 | TestOrchestratorSubmitReconciliation | REAL | kept | |
| test_missing_artifact_dispatches | TestOrchestratorSubmitReconciliation | REAL | kept | |
| test_stale_artifact_publishes_rerender_reason | TestOrchestratorSubmitReconciliation | REAL | kept | |
| test_reconcile_exception_defaults_to_queue | TestOrchestratorSubmitReconciliation | REAL | kept | |
| test_full_success_transition_sequence | TestOrchestratorProgressTransitions | REAL | kept | |
| test_running_event_includes_started_at | TestOrchestratorProgressTransitions | REAL | kept | |
| test_task_failure_publishes_failed_not_completed | TestOrchestratorProgressTransitions | REAL | kept | |
| test_dispatch_exception_publishes_failed | TestOrchestratorProgressTransitions | REAL | kept | |
| test_queued_event_published_first | TestOrchestratorProgressTransitions | REAL | kept | |
| test_publish_exception_does_not_abort_task | TestOrchestratorProgressTransitions | REAL | kept | |
| test_bridge_tasks_wait_for_resources_before_dispatching | TestOrchestratorProgressTransitions | REAL | kept | Uses time.sleep mock (clock boundary — legitimate) |
| test_completed_bridge_task_records_render_stats | TestOrchestratorProgressTransitions | REAL | kept | |
| test_registry_handler_raising_exception_surfaces_rich_info | TestOrchestratorFailureDiagnostics | REAL | kept | Real _dispatch() exception surface; handler mock is at engine boundary |
| test_registry_handler_returning_non_zero_rc_surfaces_rich_info | TestOrchestratorFailureDiagnostics | REAL | kept | |

### test_synthesis_task_and_resources.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_is_studio_task_subclass | TestSynthesisTask | REAL | kept | |
| test_source_is_ui | TestSynthesisTask | REAL | kept | |
| test_validate_passes_valid_inputs | TestSynthesisTask | REAL | kept | |
| test_validate_raises_missing_task_id | TestSynthesisTask | REAL | kept | |
| test_validate_raises_missing_engine_id | TestSynthesisTask | REAL | kept | |
| test_validate_raises_empty_script_text | TestSynthesisTask | REAL | kept | |
| test_validate_raises_whitespace_script_text | TestSynthesisTask | REAL | kept | |
| test_validate_raises_missing_output_path | TestSynthesisTask | REAL | kept | |
| test_describe_returns_task_context | TestSynthesisTask | REAL | kept | |
| test_describe_payload_has_engine_id | TestSynthesisTask | REAL | kept | |
| test_describe_payload_has_render_batch_id | TestSynthesisTask | REAL | kept | |
| test_describe_payload_has_reconciliation_fields | TestSynthesisTask | REAL | kept | |
| test_on_cancel_does_not_raise | TestSynthesisTask | REAL | kept | |
| test_run_returns_completed_on_ok_result | TestSynthesisTask | REAL | kept | Mixed-engine handler is patched at engine plugin boundary (legitimate) |
| test_run_returns_failed_on_non_ok_status | TestSynthesisTask | REAL | kept | |
| test_run_returns_failed_on_exception | TestSynthesisTask | REAL | kept | |
| test_run_sets_retriable_on_engine_unavailable | TestSynthesisTask | REAL | kept | |
| test_orchestrator_can_submit_synthesis_task | TestSynthesisTask | REAL | kept | |
| test_orchestrator_publishes_retriable_reason_code | TestSynthesisTask | REAL | kept | |
| test_first_acquire_succeeds | TestGpuAdmissionGate | REAL | kept | Real GpuAdmissionGate logic |
| test_second_acquire_denied | TestGpuAdmissionGate | REAL | kept | |
| test_release_allows_next_acquire | TestGpuAdmissionGate | REAL | kept | |
| test_release_wrong_task_id_ignored | TestGpuAdmissionGate | REAL | kept | |
| test_active_task_id_property | TestGpuAdmissionGate | REAL | kept | |
| test_reset_force_releases | TestGpuAdmissionGate | REAL | kept | |
| test_cpu_only_task_always_admitted | TestReserveTaskResources | REAL | kept | Real reserve_task_resources() |
| test_exclusive_task_is_single_flight | TestReserveTaskResources | REAL | kept | |
| test_gpu_task_admitted_when_slot_free | TestReserveTaskResources | REAL | kept | |
| test_gpu_task_denied_when_slot_taken | TestReserveTaskResources | REAL | kept | |
| test_release_frees_slot_for_next | TestReserveTaskResources | REAL | kept | |
| test_result_carries_no_fake_reserved_key | TestReserveTaskResources | REAL | kept | |
| test_admitted_key_present_in_result | TestReserveTaskResources | REAL | kept | |
| test_tts_server_mode_returns_empty_when_watchdog_none | TestRegistryTtsServerMode | REAL | kept | _load_tts_server_registry(); get_watchdog patched at TTS-server HTTP boundary |
| test_tts_server_mode_returns_empty_when_unhealthy | TestRegistryTtsServerMode | REAL | kept | |
| test_tts_server_mode_returns_empty_on_client_error | TestRegistryTtsServerMode | REAL | kept | |
| test_tts_server_mode_builds_registration_from_payload | TestRegistryTtsServerMode | REAL | kept | |
| test_tts_server_proxy_synthesize_raises | TestRegistryTtsServerMode | REAL | kept | |
| test_tts_server_proxy_preview_raises | TestRegistryTtsServerMode | REAL | kept | |
| test_tts_server_proxy_health_falls_back_on_error | TestRegistryTtsServerMode | REAL | kept | |
| test_manifest_from_tts_server_payload_missing_engine_id_skipped | TestRegistryTtsServerMode | REAL | kept | |

### test_voices_orchestration_integration.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_voice_build_api_uses_real_orchestrator_submit | — | REAL | kept | API -> orchestrator path; bridge mock is TTS-server HTTP boundary |
| test_voice_build_orchestration_e2e | — | REAL | kept | Real SampleBuildTask.run() via orchestrator; bridge mock at TTS boundary |
| test_voice_test_orchestration_e2e | — | REAL | kept | Real SampleTestTask.run(); bridge mock at TTS boundary |
| test_sample_tasks_expose_script_text_alias | — | REAL | kept | Real task property aliasing |
| test_voice_build_fails_when_no_engine | — | REAL | kept | Real task.validate(); _mark_queue_failed patched at queue-write boundary |

### test_watchdog_progress_logic.py

| test | class | classification | action | notes |
|------|-------|---------------|--------|-------|
| test_watchdog_multiple_listeners | — | REAL | kept | Real TtsServerWatchdog._drain_stream() with multiple listeners |
| test_watchdog_unregistration | — | REAL | kept | |
| test_marker_driven_preparing_has_no_render_timing | — | REAL | kept | Real _dispatch() with real TtsServerWatchdog |
| test_dispatch_unregisters_watchdog_listener_for_registry_handler | — | REAL | kept | Real _dispatch() listener cleanup |
| test_sample_build_receives_markers_live | — | REAL | kept | Real _dispatch() + live watchdog stream |
| test_log_listener_task_id_filtering | — | MOCKED-OUT | **DELETED** | Defined `simulate_listener()` locally and tested it; the actual app listener closure was never invoked. Real filtering coverage exists via test_sample_build_receives_markers_live. |
| test_progress_scaling_math | — | MOCKED-OUT + WRONG-SCENARIO | **DELETED** | Defined `get_scaled()` locally with a 0.7 scaling factor. This scaling was removed from production (voice samples are now unscaled; see test_voice_sample_unscaled_progress). Test would have passed even if production code changed. |
| test_started_at_marker_driven | — | REAL | kept | Real _dispatch() with real watchdog; verifies started_at on START_SYNTHESIS |
| test_log_listener_progress_is_monotonic | — | REAL | kept | Real _dispatch() progress monotonicity |
| test_start_segment_eta_uses_active_block_chars | — | REAL | kept | |
| test_segment_eta_uses_active_block_progress_not_chapter_progress | — | REAL | kept | |
| test_watchdog_uses_readline_to_avoid_buffering | — | REAL | kept | Real _drain_stream(); proves readline contract |

---

## Summary

| Category | Count | Files affected |
|----------|-------|---------------|
| REAL — kept | 177 | all 15 files |
| MOCKED-OUT — deleted | 2 | test_watchdog_progress_logic.py |
| MOCKED-OUT — deleted (file emptied) | 1 | test_progress_parsing.py |
| WRONG-SCENARIO — deleted (same 2 above) | 1 (overlap with MOCKED-OUT) | test_watchdog_progress_logic.py |
| FRAGILE — fixed | 0 | — |

**Total deleted: 3 tests** (180 → 177)

---

## Riskiest Findings

1. **`test_progress_scaling_math` (WRONG-SCENARIO + MOCKED-OUT)** — Asserted that voice sample progress is scaled by 0.70. This is directly contradicted by the production contract, which `test_voice_sample_unscaled_progress` in `test_progress_logic.py` proves. Had this test remained, a reviewer could mistake it for a valid coverage claim about the 0.7 path that no longer exists. Deleted.

2. **`test_progress_simulation` (MOCKED-OUT)** — Re-implemented the entire on_output parsing loop inline. Any refactor of the real parser would leave this test green while breaking production. The only thing it validated was the test author's model of the code at the time of writing. Deleted. Real watchdog listener tests (`test_sample_build_receives_markers_live`, `test_log_listener_progress_is_monotonic`) provide genuine coverage.

3. **`test_log_listener_task_id_filtering` (MOCKED-OUT)** — Trivially tested a local lambda, not the listener closure registered in `_dispatch()`. Filtering behavior is sufficiently covered by the live dispatch tests. Deleted.

4. **`test_recover.py` — `progress_service` is a MagicMock** — This is flagged for the reviewer's awareness, not for deletion. `progress_service` is the injected dependency; the code under test is `orchestrator.recover()`. This is the correct mock boundary. However, the tests do not verify that `progress_service.publish` was called with the _correct content_ of payloads (just that certain `status` and `reason_code` values appear). The assertions are contractual and correct per the spec.

5. **Timing in `test_startup_eta.py` tests** — Several tests in this file are large and set up substantial state boilerplate. They exercise real behavior but the test-internal DB mock (`jobs_db` dict + `mock_put_job`) means a rename or signature change in `Job` dataclass fields would silently break the mock without failing the assertions. This is a fragility risk to note but not in scope for this audit pass.

---

## Revert-check record (R1)

Per standing rule R1, the three deleted tests were confirmed unrevertable in the following sense: the tests were retried by temporarily re-adding them; no production code was reverted. All three passed unconditionally even with their named behavior disabled in the real source — confirming they provided no guard against regression.
