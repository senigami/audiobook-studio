# Test Quality Audit — tests/engines/

Audited: 2026-06-10. Excludes `test_xtts_segment_grouping.py` and `test_registry_cache.py` (pre-audited).
Suite result before edits: **190 passed, 0 failed**.
Suite result after edits: **190 passed, 0 failed** (no tests were changed).

---

## Classification table

| file | test | class | verdict | notes |
|---|---|---|---|---|
| test_bridge_tts_server.py | test_synthesize_succeeds_via_tts_server | TestBridgeTtsServerSynthesize | REAL | Mock is HTTP client (legitimate boundary); asserts status, bridge tag, engine_id. |
| test_bridge_tts_server.py | test_synthesize_propagates_task_id | TestBridgeTtsServerSynthesize | REAL | Verifies task_id forwarding to HTTP client — observable contract. |
| test_bridge_tts_server.py | test_synthesize_raises_on_tts_server_error | TestBridgeTtsServerSynthesize | REAL | TtsServerConnectionError → EngineUnavailableError translation is a real contract. |
| test_bridge_tts_server.py | test_synthesize_missing_engine_id_raises | TestBridgeTtsServerSynthesize | REAL | Validation gate on the bridge. |
| test_bridge_tts_server.py | test_synthesize_preserves_timing_payload | TestBridgeTtsServerSynthesize | REAL | Timing passthrough is a load-bearing contract (feeds perf calibration). |
| test_bridge_tts_server.py | test_synthesize_timing_absent_works | TestBridgeTtsServerSynthesize | REAL | Regression guard for callers that don't supply timing. |
| test_bridge_tts_server.py | test_preview_succeeds_via_tts_server | TestBridgeTtsServerPreview | REAL | Preview path, ephemeral flag. |
| test_bridge_tts_server.py | test_preview_propagates_task_id | TestBridgeTtsServerPreview | REAL | Same as synthesize task_id test; covers separate code path. |
| test_bridge_tts_server.py | test_preview_accepts_engine_id_and_payload_shape | TestBridgeTtsServerPreview | REAL | Two-arg calling convention. |
| test_bridge_tts_server.py | test_describe_registry_via_tts_server | TestBridgeDescribeRegistry | REAL | Basic passthrough of engine list. |
| test_bridge_tts_server.py | test_describe_registry_injects_computed_multiplier_into_current_settings | TestBridgeDescribeRegistry | REAL | Perf-calibration enrichment path; mocks only DB and scheduler (outside bridge). |
| test_bridge_tts_server.py | test_describe_registry_exposes_calibration_window_metadata | TestBridgeDescribeRegistry | REAL | sample_count and calibration_since fields. |
| test_bridge_tts_server.py | test_describe_registry_exposes_calibration_confidence_percent | TestBridgeDescribeRegistry | REAL | Confidence field range assertion. |
| test_bridge_tts_server.py | test_describe_registry_calibration_confidence_null_when_fewer_than_five_samples | TestBridgeDescribeRegistry | REAL | Null confidence below threshold. |
| test_bridge_tts_server.py | test_describe_registry_enriches_with_test_metadata | TestBridgeDescribeRegistry | REAL | last_test JSON from filesystem. tmp_path used correctly. |
| test_bridge_tts_server.py | test_timing_event_constrained_literals | TestTimingContractSlice1 | REAL | SDK contract validation via real dataclass. |
| test_bridge_tts_server.py | test_tts_result_timing_payload_schema | TestTimingContractSlice1 | REAL | Full timing result construction. |
| test_bridge_tts_server.py | test_regression_result_without_timing | TestTimingContractSlice1 | REAL | Backward compat for callers without timing. |
| test_engine_behavior.py | test_behavior_helpers_read_plugin_metadata_without_engine_name_checks | — | REAL | Reads actual voxtral plugin manifest; no mocks. |
| test_engine_behavior.py | test_enablement_uses_declared_required_settings_for_any_engine | — | REAL | Exercises can_enable_engine with a synthetic behavior dict (legitimate — tests generic logic). |
| test_engine_behavior.py | test_extract_engine_settings_uses_declared_aliases_for_any_engine | — | REAL | Alias/filter logic exercised directly. |
| test_engines.py | test_run_cmd_stream_success | — | REAL | Subprocess mocked (legitimate); asserts output callback. |
| test_engines.py | test_assemble_audiobook | — | REAL | FFmpeg and fs mocked (legitimate); asserts rc==0. |
| test_engines.py | test_generate_video_sample | — | REAL | Basic happy-path. |
| test_engines.py | test_run_cmd_stream_cancel | — | REAL | Cancel path terminates process. |
| test_engines.py | test_wav_to_mp3 | — | REAL | Asserts ffmpeg appears in command. |
| test_engines.py | test_get_audio_duration | — | REAL | subprocess.run mocked; parses stdout float. |
| test_engines.py | test_create_temp_manifest_uses_system_temp_dir | — | REAL | Validates manifest is NOT created in cwd. |
| test_engines.py | test_ffmpeg_concat_entry_normalizes_windowsish_paths | — | REAL | String format contract (no backslashes, proper quoting). |
| test_engines.py | test_assemble_audiobook_no_files | — | REAL | Empty folder → rc==1 with message. |
| test_engines.py | test_assemble_audiobook_encode_fail | — | REAL | FFmpeg failure propagation. |
| test_engines.py | test_generate_video_sample_no_audio | — | REAL | Missing audio → rc==1. |
| test_engines.py | test_generate_video_sample_no_logo | — | REAL | Missing logo → still succeeds. |
| test_engines.py | test_stitch_segments_no_segs | — | REAL | Empty segment list → rc==1. |
| test_engines.py | test_get_audio_duration_fail | — | REAL | Exception returns 0.0. |
| test_engines.py | test_assemble_audiobook_chapter_titles | — | REAL | chapter_titles kwarg accepted. |
| test_engines.py | test_run_cmd_stream_heartbeat | — | FRAGILE (minor) | Asserts `mock_on_output.assert_any_call("")` — the heartbeat contract is real. However, `time.time` is mocked with a side_effect list; if the implementation changes loop frequency the mock list could exhaust. No test edit made — the contract (heartbeat emits empty string) is observable and the fragility is minor/bounded. |
| test_engines.py | test_terminate_all_subprocesses | — | REAL | Mutates the real `_active_processes` set; verifies terminate called. |
| test_engines.py | test_cleanup_orphaned_tts_server_processes_only_targets_orphans | — | REAL | ps output parsed by real code; kill assertions check correct PIDs. |
| test_engines.py | test_tts_server_runtime_marker_round_trip | — | REAL | Full write/read/clear cycle via real filesystem in tmp_path. |
| test_engines_assembly.py | test_assemble_audiobook_ffmpeg_command_structure | — | REAL | Inspects actual FFmpeg command list for cover art flags. |
| test_engines_assembly.py | test_assemble_audiobook_ffmpeg_no_cover | — | REAL | Verifies cover flags absent when no cover provided. |
| test_engines_assembly.py | test_assemble_audiobook_fails_before_ffmpeg_when_input_file_is_missing | — | REAL | run_cmd_stream not called when input missing. |
| test_engines_registry.py | test_engine_normalization_returns_empty_when_registry_is_empty | — | REAL | Patches only list_tts_engines/_get_registry_manifests (internal data sources); all normalization logic runs real. |
| test_engines_registry.py | test_resolve_tts_engine_for_profiles_ignores_empty_engine_results | — | REAL | Patches direct collaborator resolve_profile_engine to inject a broken profile; tests aggregation logic. |
| test_narrator_defaults.py | test_auto_set_default_for_single_narrator | clean_state | REAL | API round-trip via TestClient; real route logic and state. |
| test_narrator_defaults.py | test_set_default_manually | clean_state | REAL | Two-profile default assignment. |
| test_narrator_defaults.py | test_auto_reconcile_on_home_load | clean_state | REAL | Delete-and-reconcile lifecycle. |
| test_narrator_defaults.py | test_no_narrators_default_is_none | clean_state | REAL | Empty voice dir. |
| test_narrator_defaults.py | test_rename_default_narrator_persists | clean_state | REAL | Rename updates settings. |
| test_plugin_boundary_leak.py | test_plugin_core_is_portable | — | REAL | Static analysis of real plugin files; would fail if `from app.` appears in plugin/core/. |
| test_plugin_dependency_parsing.py | test_check_dependencies_uses_direct_reference_distribution_name | — | REAL | Parses requirements.txt via real _check_dependencies; monkeypatches importlib.metadata only (legitimate — fakes package registry). |
| test_plugin_dependency_parsing.py | test_check_dependencies_skips_git_url_without_egg_fragment | — | REAL | Edge case in requirements parsing. |
| test_plugin_dependency_parsing.py | test_check_dependencies_missing_package | — | REAL | Exercises real metadata.distribution call against a nonexistent package. |
| test_plugin_dependency_parsing.py | test_install_dependencies_reports_pip_stderr | — | REAL | Subprocess mocked (legitimate); checks HTTP 500 and stderr in detail. |
| test_plugin_dependency_parsing.py | test_install_dependencies_refreshes_setup_message_after_success | — | REAL | Post-install state refresh. |
| test_plugin_dependency_parsing.py | test_install_dependencies_reloads_plugin_after_successful_install | — | REAL | Plugin list replaced on successful install. |
| test_plugin_layout_contracts.py | test_job_registry_loads_interface_and_dotted_worker_handlers | — | REAL | Full tmp_path plugin tree; verifies handler callable returns real value. |
| test_plugin_layout_contracts.py | test_app_registry_resolves_interface_and_dotted_adapter_modules | — | REAL | Both adapter strategies loaded from real registry code. |
| test_plugin_loader.py | test_valid_names / test_invalid_names | TestFolderNameRegex | REAL | Regex tested directly against expected pass/fail list. |
| test_plugin_loader.py | test_empty_plugins_dir | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_missing_plugins_dir | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_non_plugin_folder_skipped | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_valid_plugin_loaded | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_missing_manifest_skipped | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_malformed_manifest_json_skipped | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_malformed_settings_schema_json_surfaces_as_invalid | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_duplicate_engine_id_second_skipped | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_bad_plugin_does_not_block_good_plugin | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_plugin_settings_schema_file_is_exposed_when_engine_lacks_method | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_dotted_entry_class_in_folder | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_interface_entry_class_can_import_internal_package | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_dotted_entry_class_can_import_sibling_internal_module | TestDiscoverPlugins | REAL | — |
| test_plugin_loader.py | test_missing_engine_id_raises | TestManifestValidation | REAL | — |
| test_plugin_loader.py | test_missing_capabilities_is_reported_as_invalid_config | TestManifestValidation | REAL | — |
| test_plugin_loader.py | test_synthesis_not_in_capabilities_is_reported_as_invalid_config | TestManifestValidation | REAL | — |
| test_plugin_loader.py | test_invalid_engine_id_format_is_reported_as_invalid_config | TestManifestValidation | REAL | — |
| test_plugin_loader.py | test_unsupported_manifest_version_is_reported_as_invalid_config | TestManifestValidation | REAL | — |
| test_plugin_loader.py | test_invalid_callable_format_is_reported_as_invalid_config | TestManifestValidation | REAL | — |
| test_plugin_loader.py | test_entry_point_discovery_mock | TestPipDiscovery | REAL | entry_points mocked (legitimate — fakes pip registry); full discover_plugins path. |
| test_plugin_loader.py | test_folder_precedence_over_pip | TestPipDiscovery | REAL | Collision resolution contract. |
| test_plugin_loader.py | test_pip_plugin_creates_settings_dir | TestPipDiscovery | REAL | Filesystem side-effect verified. |
| test_plugin_loader.py | test_requirements_satisfied | TestDependencies | REAL | — |
| test_plugin_loader.py | test_requirements_missing | TestDependencies | REAL | — |
| test_plugin_loader.py | test_malformed_requirements_graceful | TestDependencies | REAL | — |
| test_plugin_loader.py | test_import_crash_isolated_by_default | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_import_crash_surfaced_in_dev_mode | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_instantiation_crash_isolated_by_default | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_instantiation_crash_surfaced_in_dev_mode | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_check_env_crash_isolated_by_default | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_check_env_crash_surfaced_in_dev_mode | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_syntax_error_isolated_by_default | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_syntax_error_surfaced_in_dev_mode | TestPluginIsolation | REAL | — |
| test_plugin_loader.py | test_xtts_manifest_and_schema_contains_model_v2 | — | REAL | Reads real plugin files on disk. |
| test_progress_parsing.py | test_parse_engine_progress_logic | — | REAL | get_progress_pattern mocked to inject patterns; actual parsing + clamping logic runs real. |
| test_progress_parsing.py | test_parse_engine_progress_invalid_patterns | — | REAL | Non-numeric match → None; None pattern → fallback default. |
| test_speaker_manager.py | test_create_speaker_auto_links_existing_unassigned_profile | mock_voices | REAL | API call, filesystem verification, profile.json content asserted. |
| test_speaker_manager.py | test_create_speaker_creates_default_profile | mock_voices | REAL | — |
| test_speaker_manager.py | test_create_speaker_handles_collision | mock_voices | REAL | Suffix creation when name exists and is already assigned. |
| test_speaker_profiles.py | test_list_profiles_empty | clean_voices | REAL | — |
| test_speaker_profiles.py | test_build_profile | clean_voices | REAL | File upload, wav_count, speed round-trip. |
| test_speaker_profiles.py | test_build_profile_allows_latent_without_raw_samples | clean_voices | REAL | Latent-only profile path. |
| test_speaker_profiles.py | test_update_speed | clean_voices | REAL | Speed persists to profile.json and listing reflects it. |
| test_speaker_profiles.py | test_speaker_profile_test_endpoint | clean_voices | REAL | create_orchestrator mocked (TTS model — legitimate); audio_url contract asserted. |
| test_speaker_profiles.py | test_speaker_profile_test_endpoint_allows_latent_without_raw_samples | clean_voices | REAL | — |
| test_speaker_profiles.py | test_delete_profile | clean_voices | REAL | Directory removed. |
| test_speaker_profiles.py | test_rename_profile | clean_voices | REAL | Folder moved; settings updated. |
| test_speaker_profiles.py | test_rename_variant_profile | clean_voices | REAL | Variant rename updates profile.json. |
| test_speaker_profiles.py | test_get_speaker_settings | clean_voices | REAL | Global fallback and per-narrator override. |
| test_speaker_profiles.py | test_get_voice_profile_dir_rejects_traversal | clean_voices | REAL | Path traversal guard. |
| test_speaker_profiles.py | test_update_speaker_settings_rejects_invalid_profile_name | clean_voices | REAL | — |
| test_speaker_profiles.py | test_get_speaker_settings_repairs_blank_profile_metadata | clean_voices | REAL | Empty profile.json repaired without persisting defaults. |
| test_speaker_profiles.py | test_get_speaker_settings_normalizes_default_variant | clean_voices | REAL | — |
| test_speaker_profiles.py | test_get_speaker_settings_infers_variant_from_folder_name | clean_voices | REAL | " - Angry" suffix → variant_name="Angry". |
| test_speaker_profiles.py | test_list_profiles_marks_preview_out_of_date_when_test_script_changes | clean_voices | REAL | is_rebuild_required flag. |
| test_speaker_profiles.py | test_list_profiles_does_not_mark_legacy_preview_out_of_date_without_preview_signature | clean_voices | REAL | Legacy no-drift path. |
| test_speaker_profiles.py | test_get_speaker_settings_prefers_base_folder_over_variant | clean_voices | REAL | WAV scoping contract. |
| test_speaker_profiles.py | test_speaker_listing_normalizes_base_profile_to_default | clean_voices | REAL | Full normalize_base_profiles migration path. |
| test_tts_client.py | test_valid_id_passthrough / test_strips_dangerous_characters / test_empty_id_raises / test_only_special_chars_raises | TestSafeId | REAL | _safe_id pure function. |
| test_tts_client.py | test_ping_returns_true_on_200 | TestTtsClientHealth | REAL | httpx mocked (legitimate HTTP boundary). |
| test_tts_client.py | test_ping_returns_false_on_207 | TestTtsClientHealth | REAL | — |
| test_tts_client.py | test_ping_returns_false_on_connection_error | TestTtsClientHealth | REAL | — |
| test_tts_client.py | test_ping_returns_false_on_non_200 | TestTtsClientHealth | REAL | — |
| test_tts_client.py | test_get_returns_json | TestTtsClientGet | REAL | — |
| test_tts_client.py | test_get_raises_on_500 | TestTtsClientGet | REAL | — |
| test_tts_client.py | test_get_engines_returns_list | TestTtsClientGet | REAL | — |
| test_tts_client.py | test_synthesize_sends_correct_payload | TestTtsClientSynthesize | REAL | Inspects JSON sent to server. |
| test_tts_client.py | test_synthesize_raises_on_connection_error | TestTtsClientSynthesize | REAL | — |
| test_tts_client.py | test_synthesize_uses_large_read_timeout | TestTtsClientSynthesize | FRAGILE (minor) | Reads `_READ_TIMEOUT >= 300.0`. This is a module-level constant assertion; would pass even if the value were 9999. The intent (don't let devs accidentally set a short timeout) is legitimate but the assertion would not catch the inverted bug (timeout too short after a future change to the calculation). No change made — the guard is better than nothing. |
| test_tts_sdk.py | test_minimal_construction | TestTtsRequest | REAL | — |
| test_tts_sdk.py | test_full_construction | TestTtsRequest | REAL | — |
| test_tts_sdk.py | test_script_construction | TestTtsRequest | REAL | — |
| test_tts_sdk.py | test_is_frozen | TestTtsRequest | REAL | Immutability contract. |
| test_tts_sdk.py | test_settings_defaults_to_empty_dict | TestTtsRequest | REAL | — |
| test_tts_sdk.py | test_success_construction | TestTtsResult | REAL | — |
| test_tts_sdk.py | test_failure_construction | TestTtsResult | REAL | — |
| test_tts_sdk.py | test_warnings_list | TestTtsResult | REAL | — |
| test_tts_sdk.py | test_mutable | TestTtsResult | REAL | TTSResult mutability vs TTSRequest immutability. |
| test_tts_server_health.py | test_ready_when_env_ok_and_verified | TestEngineStatus | REAL | _MockPlugin is a local test double, not patching health module. |
| test_tts_server_health.py | test_unverified_when_env_ok_but_not_verified | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_needs_setup_when_env_fails | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_needs_setup_when_check_env_raises | TestEngineStatus | REAL | Crash → NEEDS_SETUP + message on plugin. |
| test_tts_server_health.py | test_needs_setup_when_check_env_fails_with_message | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_invalid_config_when_plugin_has_load_error | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_invalid_config_engine_detail_is_safe_without_engine_object | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_uses_current_settings_when_check_env_accepts_settings | TestEngineStatus | REAL | Settings-aware check_env signature. |
| test_tts_server_health.py | test_engine_detail_uses_current_settings_for_status | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_engine_detail_preserves_setup_message_from_check_env_when_settings_still_invalid | TestEngineStatus | REAL | — |
| test_tts_server_health.py | test_empty_plugin_list | TestBuildHealthResponse | REAL | — |
| test_tts_server_health.py | test_all_ready | TestBuildHealthResponse | REAL | — |
| test_tts_server_health.py | test_one_needs_setup_returns_degraded | TestBuildHealthResponse | REAL | — |
| test_tts_server_health.py | test_invalid_config_returns_degraded | TestBuildHealthResponse | REAL | — |
| test_tts_server_health.py | test_engine_fields_present | TestBuildHealthResponse | REAL | — |
| test_tts_server_health.py | test_engine_detail_does_not_inject_privacy_notices | TestBuildHealthResponse | REAL | Privacy notice non-injection contract. |
| test_tts_server_isolation.py | test_ready_endpoint_is_cheap | TestTTSServerIsolation | REAL | Actual FastAPI TestClient against server app. |
| test_tts_server_isolation.py | test_startup_announces_ready_after_lifespan_starts | TestTTSServerIsolation | REAL | READY:port printed during lifespan. |
| test_tts_server_isolation.py | test_startup_with_mixed_plugins_isolated_without_auto_verification | TestTTSServerIsolation | REAL | Critical isolation contract; good plugins load, bad ones quarantined, run_test NOT called at startup. |
| test_tts_server_isolation.py | test_refresh_isolation | TestTTSServerIsolation | REAL | Broken new plugin doesn't evict good existing plugin. |
| test_tts_server_isolation.py | test_clear_read_only_engine_setting | TestTTSServerIsolation | REAL | DELETE /engines/{id}/settings/{key} only clears non-readOnly keys. |
| test_tts_server_isolation.py | test_synthesize_blocks_pending_verification_engine | TestTTSServerIsolation | REAL | 503 before verification. |
| test_tts_server_isolation.py | test_explicit_verify_endpoint_runs_plugin_test_synthesis | TestTTSServerIsolation | REAL | POST /engines/{id}/verify triggers run_test. |
| test_tts_server_isolation.py | test_synthesize_blocks_after_failed_verification | TestTTSServerIsolation | REAL | 503 after failed verification, different error message. |
| test_tts_server_isolation.py | test_synthesize_endpoint_returns_timing | TestTTSServerIsolation | REAL | Timing dict in response including derived fields. |
| test_tts_server_isolation.py | test_synthesize_endpoint_timing_absent | TestTTSServerIsolation | REAL | timing=None not surfaced in response. |
| test_xtts_timing.py | test_xtts_render_persists_true_chunk_count | — | REAL | Regression for chunk_count=2 not 9; exercises real _dispatch and DB. |
| test_xtts_timing.py | test_seconds_per_segment_derived_from_true_chunk_count | — | REAL | Regression for seconds_per_segment math. |
| test_xtts_timing.py | test_fallback_paths_when_structured_timing_absent | — | REAL | Both fallback tiers (task.script then 1). |
| test_xtts_timing.py | test_sample_runs_wait_for_synthesis_marker_before_running_progress | — | REAL | No premature "running" status publications. |
| test_xtts_timing.py | test_persisted_sample_includes_audio_duration_and_model_load_seconds | — | REAL | DB row contains both fields. |
| test_xtts_timing.py | test_persisted_sample_prefers_structured_timing_for_model_load_seconds | — | REAL | Structured timing wins over job-object timestamps. |
| test_xtts_timing.py | test_persisted_sample_falls_back_to_job_timestamps_for_model_load_seconds | — | REAL | Fallback to job timestamps when timing absent. |
| test_xtts_timing.py | test_sample_runs_always_non_marker_driven | — | REAL | is_marker_driven=False for sample tasks. |
| test_xtts_timing.py | test_xtts_diagnostics_live_tee_stderr | — | REAL | run_cmd_stream mocked (subprocess boundary); stderr tee and callback verified via capsys. |
| test_xtts_timing.py | test_xtts_diagnostics_live_tee_no_duplicate | — | REAL | subprocess.Popen mocked; output must not appear on stderr. |
| test_xtts_timing.py | test_sample_build_reaches_completion_without_context | clean_db | REAL | xtts_dispatch_adapter called on a sample_build kind job; no failure updates. |
| test_xtts_timing.py | test_sample_test_reaches_completion_without_context | clean_db | REAL | Same for sample_test kind. |
| test_xtts_timing.py | test_chapter_bound_xtts_jobs_reject_missing_context | clean_db | REAL | synthesis kind without project_id/chapter_id → status=failed with "context" in error. |

---

## Summary

| verdict | count |
|---|---|
| REAL | 187 |
| FRAGILE (minor, no change) | 2 |
| VACUOUS | 0 |
| MOCKED-OUT | 0 |
| WRONG-SCENARIO | 0 |
| DELETED | 0 |

**Total tests audited: 189** (190 in suite minus the 1 test counted as `test_valid_names / test_invalid_names` which are parametrized in TestFolderNameRegex; both REAL). Suite: 190 passed.

**No tests were modified.** The engines suite is in good shape.

---

## Findings and risks

**No deletions or rewrites required.** The suite was notably healthier than the queue/progress suites previously audited. Observations:

1. **Legitimate mock boundary is consistently respected.** The only things mocked throughout are: HTTP (httpx/TtsClient), subprocess (FFmpeg/pip), the TTS model compute itself, and tmp-path filesystems. No test mocks the module it's supposed to be testing.

2. **Two minor FRAGILE tests flagged but left unchanged:**
   - `test_run_cmd_stream_heartbeat`: `time.time` patched with a fixed side_effect list; fragile if heartbeat loop frequency changes. The contract (heartbeat emits empty string) is real. Risk: low.
   - `test_synthesize_uses_large_read_timeout`: asserts `_READ_TIMEOUT >= 300.0` against a module constant. This passes vacuously if the constant is huge; it would not fail if someone accidentally changed it to, say, 30 seconds (which is below 300). Risk: low but worth noting for a future strengthening pass.

3. **Riskiest behavioral area well-covered:** `test_tts_server_isolation.py` — `test_startup_with_mixed_plugins_isolated_without_auto_verification` is the most important test in the file. It guards against startup verification being re-introduced (which would block loading). It exercises `load_plugins` against a tmp_path multi-plugin tree and asserts `run_test` is never called. This test would fail if the startup sequence changed to auto-verify. Good.

4. **conftest.py note:** `test_narrator_defaults.py` uses a module-level `client = TestClient(app)` with state patched only inside the fixture. The `VOICES_DIR` path used by the client outside a fixture call would be the real production VOICES_DIR, not tmp_path. However, each test method only calls the API inside `clean_state`'s context manager, so in practice this is fine. The real concern (noted but not fixable here per instructions) is that module-level `client` initialization happens before any fixture patches, meaning a crash during app import would affect all tests in the file. No edit required.
