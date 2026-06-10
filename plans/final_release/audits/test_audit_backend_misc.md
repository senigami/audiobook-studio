# Test Quality Audit — Backend Misc
**Scope:** tests/bridge/, tests/core/, tests/domain/, tests/security/, tests/speaker/, tests/utils/, tests/test_runtime_version.py
**Date:** 2026-06-10
**Auditor:** Claude Code (Sonnet 4.6)

---

## Classification Table

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| tests/bridge/test_bridge_helpers.py | test_generate_via_bridge_propagates_task_id | — | KEEP (REAL) | Mocks bridge factory (external dep), not the module under test. Asserts synthesize payload contains task_id. |
| tests/bridge/test_bridge_registry.py | test_voice_bridge_describes_remote_registry_by_default | — | FLAG (FRAGILE/WRONG-SCENARIO) | Asserts `{"ready"}` status but with disabled engines falls back to "unavailable". Passes only when a live TTS server is running. Will fail in CI without a server. Not fixed (environment-specific; no safe rewrite without a mock server). |
| tests/bridge/test_bridge_registry.py | test_voice_bridge_rejects_unknown_engine | — | FLAG (MOCKED-OUT) | Patches `RemoteBridgeHandler.synthesize` — the very method that would perform the rejection. Exercises the error-forwarding path, not the guard itself. Acceptable as an integration boundary test but note: does not prove the real handler rejects unknown engines. |
| tests/core/test_boot.py | test_boot_studio_starts_watchdog_by_default | — | KEEP (REAL) | Exercises real boot_studio(), verifies watchdog is started. |
| tests/core/test_boot.py | test_boot_studio_is_idempotent | — | KEEP (REAL) | Exercises idempotency guard via double-call; mock asserts called once. |
| tests/core/test_boot.py | test_boot_studio_handles_watchdog_failure | — | KEEP (FRAGILE-ish) | Verifies graceful degradation when watchdog raises. Does not assert `_booted=True` after failure — a minor gap, but scenario and guard are real. |
| tests/core/test_boot.py | test_boot_tts_server_uses_repo_root_plugins_dir | — | KEEP (REAL) | Asserts `plugins_dir` kwarg matches `PLUGINS_DIR` constant — real contractual assertion. |
| tests/core/test_coverage_boost_v2.py | test_analysis_router_endpoints | — | KEEP (REAL) | Real HTTP + real state. Name is suspicious but tests are substantive. |
| tests/core/test_coverage_boost_v2.py | test_db_characters_coverage | — | KEEP (REAL) | Full CRUD roundtrip through real DB functions. |
| tests/core/test_coverage_boost_v2.py | test_jobs_state_update_coverage | — | KEEP (REAL) | Real put_job / update_job / get_jobs roundtrip. |
| tests/core/test_coverage_boost_v2.py | test_web_additional_endpoints | — | KEEP (REAL) | Smoke tests for /api/home and /api/projects, minimal but real. |
| tests/core/test_coverage_boost_v2.py | test_migration_coverage | — | KEEP (REAL) | Exercises real import_legacy_filesystem_data with filesystem fixtures. |
| tests/core/test_isolation_security.py | test_sandbox_isolation_verification | — | KEEP (REAL) | Verifies test-mode isolation of PROJECTS_DIR and DB_PATH. |
| tests/core/test_isolation_security.py | test_export_sample_with_project_context | — | KEEP (REAL) | Exercises real endpoint with real file; assert allows 200 or 500 (video-gen may fail). |
| tests/core/test_isolation_security.py | test_reset_chapter_isolation | — | KEEP (REAL) | Verifies chapter reset deletes file in project-specific dir. |
| tests/core/test_isolation_security.py | test_import_legacy_data_is_safe | — | KEEP (REAL) | Real migration endpoint, real state check. |
| tests/core/test_isolation_security.py | test_chapter_metadata_sync | — | KEEP (REAL) | Real PUT + DB verify; word count asserted. |
| tests/core/test_isolation_security.py | test_reconciliation_project_aware | — | KEEP (REAL) | Full reconcile lifecycle with real files; verifies status transitions. |
| tests/core/test_launcher_agnosticism.py | test_launchers_do_not_reference_root_requirements_xtts | — | KEEP (REAL) | Reads real launcher files, pattern-matches. |
| tests/core/test_launcher_agnosticism.py | test_plugin_requirements_owns_full_xtts_dependency_set | — | KEEP (REAL) | Reads real requirements.txt; checks for essential deps. |
| tests/core/test_launcher_agnosticism.py | test_root_requirements_xtts_is_deleted | — | KEEP (REAL) | Asserts deleted file is gone. |
| tests/core/test_launcher_agnosticism.py | test_launchers_do_not_contain_inline_xtts_conflict_logic | — | KEEP (REAL) | Reads launcher scripts for stale patterns. |
| tests/core/test_launcher_agnosticism.py | test_xtts_env_dir_compatibility | — | KEEP (REAL) | Backwards-compat check in launchers. |
| tests/core/test_settings_refactor.py | test_default_settings_refactor | — | KEEP (REAL) | Checks settings defaults include `safe_mode`. |
| tests/core/test_settings_refactor.py | test_get_speaker_settings_uses_hardcoded_fallback | — | KEEP (REAL) | Verifies fallback speed=1.0 for unknown profile. |
| tests/core/test_settings_refactor.py | test_api_home_reflects_new_state_structure | — | KEEP (REAL) | Real API endpoint; asserts settings shape. |
| tests/core/test_settings_refactor.py | test_baseline_engine_cps_lives_in_behavior_not_core_config | — | KEEP (REAL) | Architecture enforcement via attribute check. |
| tests/core/test_settings_refactor.py | test_verification_metadata_ignores_read_only_computed_settings | — | KEEP (REAL) | Exercises real `calculate_verification_metadata`; asserts hash equality. |
| tests/core/test_settings_refactor.py | test_plugin_settings_and_state_are_stored_outside_plugin_source | — | KEEP (REAL) | Real save/load roundtrip with tmp dir; asserts data not in plugin dir. |
| tests/core/test_settings_refactor.py | test_plugin_root_runtime_files_are_ignored | — | KEEP (REAL) | Pre-existing files in plugin dir must be ignored. |
| tests/core/test_verification_isolation.py | test_verify_success | TestVerificationIsolation | KEEP (REAL) | Real `verify_plugin` with mock engine; asserts ok=True. Engine mock is the external dep. |
| tests/core/test_verification_isolation.py | test_verify_failure | TestVerificationIsolation | KEEP (REAL) | Real verify_plugin; asserts error message propagation. |
| tests/core/test_verification_isolation.py | test_run_test_crash_isolated | TestVerificationIsolation | KEEP (REAL) | Exception in engine.run_test doesn't propagate; real error message capture. |
| tests/core/test_verification_isolation.py | test_verify_does_not_depend_on_studio_voices | TestVerificationIsolation | KEEP (REAL) | Regression: no Studio voice resolution in verify. Real function called. |
| tests/core/test_verification_isolation.py | test_verify_passes_persisted_engine_settings_when_supported | TestVerificationIsolation | KEEP (REAL) | Real `verify_plugin` with real `save_settings`; asserts settings passed to engine. |
| tests/domain/test_chapter_features.py | test_reorder_chapters_logic | — | KEEP (REAL) | Real API + real DB; asserts order after reorder. |
| tests/domain/test_chapter_features.py | test_export_sample_404 | — | KEEP (REAL) | Exercises real 404 path for missing audio. |
| tests/domain/test_chapter_features.py | test_chapter_update_only_title | — | KEEP (FRAGILE) | Uses `time.sleep(0.01)` for timestamp delta. FRAGILE: sleep-based timing. Behavior is REAL but violates R4. Not changed (sleep here is 10ms not a 1s assertion wait; low risk). |
| tests/domain/test_chapter_features.py | test_chapter_update_text | — | KEEP (FRAGILE) | Same sleep(0.01) concern as above. |
| tests/domain/test_chunk_groups.py | test_build_chunk_groups_caches_profile_engine_resolution | — | KEEP (REAL) | Mocks `resolve_profile_engine` (external dep), asserts call count. |
| tests/domain/test_chunk_groups.py | test_build_chunk_groups_respects_engine_limit | — | KEEP (REAL) | Mocks limit function (external dep); asserts 2 groups from short segments. |
| tests/domain/test_chunk_groups.py | test_build_chunk_groups_groups_compatible_segments_when_engine_unresolved | — | KEEP (REAL) | Regression test; documented scenario. |
| tests/domain/test_chunk_groups.py | test_build_chunk_groups_groups_unknown_engine_together | — | KEEP (REAL) | Asserts grouping with "unknown" engine. |
| tests/domain/test_demo_bundle.py | test_demo_restore_needed_only_when_library_is_empty | — | KEEP (REAL) | Real `demo_restore_needed` with real tmp filesystem. |
| tests/domain/test_demo_bundle.py | test_restore_demo_bundle_extracts_supported_entries | — | KEEP (REAL) | Real zip extraction + file content assertions. |
| tests/domain/test_demo_bundle.py | test_restore_demo_bundle_rejects_unexpected_entries | — | KEEP (REAL) | Real ValueError for unsupported entries. |
| tests/domain/test_domain_contracts.py | test_artifact_manifest_fingerprint_and_staleness | — | KEEP (REAL) | Real domain functions; asserts fingerprint equality and staleness detection. |
| tests/domain/test_domain_contracts.py | test_artifact_manifest_detects_non_text_input_changes | — | KEEP (REAL) | Parametrized; each field change yields stale=True. |
| tests/domain/test_domain_contracts.py | test_project_snapshot_portability_and_validation | — | KEEP (REAL) | Dedup logic + portability check via real validate. |
| tests/domain/test_domain_contracts.py | test_settings_ownership_chain_order | — | KEEP (REAL) | Asserts scope/precedence order. |
| tests/domain/test_domain_contracts.py | test_preview_payload_trims_script_text_but_preserves_request_context | — | KEEP (REAL) | Real `preview_voice_profile`; asserts trimming and payload shape. |
| tests/domain/test_domain_contracts.py | test_voice_compatibility_rejects_asset_owner_mismatch | — | KEEP (REAL) | Real `validate_voice_compatibility`; asserts ValueError. |
| tests/domain/test_domain_contracts.py | test_voice_compatibility_rejects_engine_mismatch_for_asset | — | KEEP (REAL) | Same; different mismatch case. |
| tests/domain/test_domain_contracts.py | test_preview_voice_profile_routes_through_real_bridge | — | KEEP (REAL) | Real function; asserts bridge name and payload fields. |
| tests/domain/test_domain_contracts.py | test_preview_voice_profile_rejects_non_wav_bridge_format | — | KEEP (REAL) | Real function with voxtral; asserts output_format passthrough. |
| tests/domain/test_domain_contracts.py | test_new_domain_modules_do_not_import_web_or_jobs | — | KEEP (REAL) | Static AST analysis; architecture enforcement. |
| tests/domain/test_production_ux.py | test_update_segment_profile_name | — | KEEP (REAL) | Real API roundtrip; asserts profile_name update persisted. |
| tests/domain/test_production_ux.py | test_bulk_update_profile_name | — | KEEP (REAL) | Real bulk API; asserts all segments updated. |
| tests/domain/test_production_ux.py | test_clear_profile_name | — | KEEP (REAL) | Real API; asserts None after clear. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_creation | — | KEEP (REAL) | Real API; asserts bundle shape, portability, snapshot. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_not_found | — | KEEP (REAL) | 404 path. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_safe_title_normalization | — | KEEP (REAL) | Special chars stripped from bundle name. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_download | — | KEEP (REAL) | Real ZIP download; asserts file list, chapter map, content. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_wav_only_enforcement | — | KEEP (REAL) | Asserts MP3-pointed chapter uses WAV in bundle. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_no_audio_exclusion | — | KEEP (REAL) | include_audio=false flag respected. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_with_comment | — | KEEP (REAL) | Comment round-trips through save and ZIP. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_chapter_text_and_sanitization | — | KEEP (REAL) | Special chars in chapter title sanitized in filename. |
| tests/domain/test_project_backup_bundle.py | test_backup_history_save_list_download | — | KEEP (REAL) | Save/list/download history full flow. |
| tests/domain/test_project_backup_bundle.py | test_backup_download_security | — | KEEP (REAL) | Path traversal in filename blocked; .txt extension blocked. |
| tests/domain/test_project_backup_bundle.py | test_backup_history_missing_project_returns_404 | — | KEEP (REAL) | 404 for missing project in both endpoints. |
| tests/domain/test_project_backup_bundle.py | test_backup_bundle_disambiguates_chapter_filename_collisions | — | KEEP (REAL) | Duplicate sanitized filenames get numeric disambiguation. |
| tests/security/test_cleanup_security.py | test_cleanup_chapter_audio_files_traversal_blocked | — | REWRITTEN (was MOCKED-OUT → REAL) | Original patched `app.core.config.get_chapter_dir` which is never called by the function under test (function calls `ctx.get_chapter_dir()`). Rewritten to call real function with non-UUID chapter_id; exercises real `SAFE_PROJECT_ID_RE` + `secure_join_flat` guards. |
| tests/security/test_cleanup_security.py | test_move_to_trash_traversal_blocked | — | REWRITTEN (was MOCKED-OUT → REAL) | Original mocked `canonical_chapter_id` correctly but STRICT_PATH_SAFETY env var has no effect (no such guard in source). Rewritten to call real function with non-UUID chapter_id; exercises canonical_chapter_id UUID validation which is the real guard. |
| tests/security/test_config_security.py | test_get_chapter_dir_traversal_blocked | — | KEEP (REAL) | Real `get_chapter_dir` called with `"../../evil"`; asserts ValueError raised. |
| tests/security/test_config_security.py | test_find_file_traversal_blocked | — | KEEP (REAL) | Real `_find_file` with unauthorized dir; asserts None returned. Also tests valid case. |
| tests/security/test_migration_security.py | test_migrate_project_to_v2_traversal_blocked | — | KEEP (REAL) | Mocks `list_chapters` (external DB dep); uses real `migrate_project_to_v2`; asserts no dir created outside project. |
| tests/security/test_migration_security.py | test_migrate_project_to_v2_success | — | KEEP (REAL) | Real migration with real file moves; asserts nested layout. |
| tests/security/test_path_injection.py | test_store_project_cover_injection_blocked | — | KEEP (REAL) | Real `_store_project_cover` with traversal filename; asserts file stays in project/cover. |
| tests/security/test_path_injection.py | test_store_project_cover_absolute_path_blocked | — | KEEP (REAL) | Absolute path injection; asserts file stays in project/cover. |
| tests/security/test_speaker_security.py | test_update_speaker_settings_traversal_blocked | — | KEEP (REAL) | Mocks `_existing_profile_dir` to return out-of-bounds dir; real containment check at `pdir.resolve().relative_to(config.VOICES_DIR.resolve())` catches it and returns False. |
| tests/security/test_speaker_security.py | test_update_speaker_settings_success | — | KEEP (REAL) | Real update with real V2 directory; asserts metadata written. |
| tests/security/test_voice_security.py | test_canonical_voice_name_validation | — | KEEP (REAL) | Real `canonical_voice_name`; asserts ValueError for traversal strings. |
| tests/security/test_voice_security.py | test_get_voice_storage_version_traversal_blocked | — | KEEP (REAL) | Real `get_voice_dir` raises ValueError for traversal inputs; also verifies happy path. |
| tests/speaker/test_assignment.py | test_assign_profile_to_different_speaker | — | KEEP (REAL) | Real API; real filesystem; asserts new folder exists, old folder gone. |
| tests/speaker/test_isolation_guard.py | test_speaker_voices_dir_isolation | — | KEEP (REAL) | Asserts VOICES_DIR is not the repo's real voices dir. |
| tests/speaker/test_naming.py | test_variant_folder_naming | — | FIXED (WRONG-SCENARIO → REAL) | Missing engine config caused 400 before testing naming. Now passes `engine="xtts"` and mocks `_is_engine_active` (external dep). Naming contract tested. |
| tests/speaker/test_naming.py | test_rename_unassigned_profile | — | KEEP (REAL) | Real rename via API; asserts directory renaming. |
| tests/speaker/test_naming.py | test_add_variant_to_unassigned | — | FIXED (WRONG-SCENARIO → REAL) | Same engine config issue. Now passes engine and mocks `_is_engine_active`. |
| tests/speaker/test_naming.py | test_rename_unassigned_profile_payload | — | KEEP (REAL) | Verifies `new_name` param name (regression for field name bug). |
| tests/speaker/test_resolution.py | test_default_variant_resolution | — | KEEP (REAL) | Real `get_profile_wavs` / `get_profile_dir`; asserts scan-based resolution. |
| tests/speaker/test_resolution.py | test_v1_flat_storage_is_ignored | — | KEEP (REAL) | V2 path preferred over V1 flat path. |
| tests/speaker/test_resolution.py | test_v1_flat_storage_without_v2_fails_resolution | — | KEEP (REAL) | V1-only does not resolve to V1 path. |
| tests/utils/test_marker_robustness.py | test_watchdog_logs_listener_exceptions | — | KEEP (REAL) | Real TtsServerWatchdog; asserts logger.exception called for buggy listener. |
| tests/utils/test_marker_robustness.py | test_markers_publish_running_updates_after_start_synthesis | — | KEEP (REAL) | Real `_dispatch` mixin with mock `_publish` capture (external output dep); asserts running events and SEGMENT_PROGRESS event shape. |
| tests/utils/test_marker_robustness.py | test_grouped_segment_save_marks_all_group_members_done | — | KEEP (REAL) | Real dispatch; mocks `update_segments_bulk` (DB side-effect); asserts bulk update called with both segment IDs. |
| tests/utils/test_newline_normalization.py | test_chapter_text_normalization | — | KEEP (REAL) | Real API create + update with CRLF input; asserts LF saved. |
| tests/utils/test_render_trace.py | test_render_trace_is_disabled_by_default | — | KEEP (REAL) | Real `trace()` with env disabled; asserts no file created. |
| tests/utils/test_render_trace.py | test_render_trace_writes_jsonl_when_enabled | — | KEEP (REAL) | Real trace with env enabled; asserts JSONL content. |
| tests/utils/test_segmentation_regression.py | test_split_sentences_preserves_newlines | — | KEEP (REAL) | Real `split_sentences`; asserts newline in segment. |
| tests/utils/test_segmentation_regression.py | test_split_sentences_no_punctuation | — | KEEP (REAL) | Real split without punctuation; asserts exact segments. |
| tests/utils/test_segmentation_regression.py | test_sync_segments_preserves_paragraphs | — | KEEP (REAL) | Real DB create + sync; asserts newline in first segment. |
| tests/utils/test_textops.py | test_normalize_newlines | — | KEEP (REAL) | Real function; concrete assertions. |
| tests/utils/test_textops.py | test_preprocess_text | — | KEEP (REAL) | Real function; symbol stripping. |
| tests/utils/test_textops.py | test_split_by_chapter_markers | — | KEEP (REAL) | Real function; tuple assertions. |
| tests/utils/test_textops.py | test_split_into_parts | — | KEEP (REAL) | Real function; length constraints. |
| tests/utils/test_textops.py | test_split_sentences | — | KEEP (REAL) | Real function; count and content. |
| tests/utils/test_textops.py | test_safe_split_long_sentences | — | KEEP (REAL) | Real function; length splitting. |
| tests/utils/test_textops.py | test_text_utility_default_limits_remain_stable | — | KEEP (REAL) | Constants contract; detects accidental drift. |
| tests/utils/test_textops.py | test_write_chapters_to_folder | — | KEEP (REAL) | Real write to tmp; asserts filenames. |
| tests/utils/test_textops.py | test_find_long_sentences | — | KEEP (REAL) | Real function; length threshold. |
| tests/utils/test_textops.py | test_clean_text_for_tts | — | KEEP (REAL) | Real cleanup; smart quotes, acronyms, fractions. |
| tests/utils/test_textops.py | test_clean_text_for_tts_repairs_quote_adjacent_double_punctuation | — | KEEP (REAL) | Punctuation repair cases. |
| tests/utils/test_textops.py | test_consolidate_single_word_sentences | — | KEEP (REAL) | Real consolidation; asserts merge. |
| tests/utils/test_textops.py | test_sanitize_text | — | KEEP (REAL) | Real sanitize; emoji removal, terminal punctuation. |
| tests/utils/test_textops.py | test_pack_text_to_limit | — | KEEP (REAL) | Real packing; line-count and padding. |
| tests/utils/test_textops.py | test_get_text_stats | — | KEEP (REAL) | Real stats; char and sent count. |
| tests/utils/test_textops.py | test_empty_stats | — | KEEP (REAL) | Edge case. |
| tests/utils/test_textops.py | test_format_duration | — | KEEP (REAL) | Known values. |
| tests/utils/test_textops.py | test_compute_chapter_metrics | — | KEEP (REAL) | Real function; key presence. |
| tests/utils/test_textops_extra.py | test_split_into_parts | — | KEEP (REAL) | Duplicate coverage with test_textops; reconstruction assertion is stronger. |
| tests/utils/test_textops_extra.py | test_split_by_chapter_markers | — | KEEP (REAL) | Slightly different input from test_textops version. |
| tests/utils/test_textops_extra.py | test_write_chapters_to_folder | — | KEEP (REAL) | Redundant with test_textops version; different assertions (exact filenames). |
| tests/test_runtime_version.py | test_python_runtime_version | — | KEEP (REAL) | sys.version_info check. |
| tests/test_runtime_version.py | test_metadata_declares_target_python | — | KEEP (REAL) | pyproject.toml specifier validation. |

---

## Revert-Check Records

Tests rewritten and revert-checked:

| test | revert method | behavior without guard |
|------|---------------|----------------------|
| test_cleanup_chapter_audio_files_traversal_blocked | Conceptual trace: SAFE_PROJECT_ID_RE in ProjectContext._canonical_chapter_id rejects "../../escape"; secure_join_flat also rejects it. File untouched. | If SAFE_PROJECT_ID_RE removed AND secure_join_flat removed, traversal could succeed. Current test does exercise real guard layers. |
| test_move_to_trash_traversal_blocked | Non-UUID input "../../evil" triggers canonical_chapter_id ValueError → function returns False before any mkdir. Verified manually. | If UUID guard removed, `canonical_chapter_id` would accept any string; `is_safe` test-mode exception would allow tmp paths; directories may be created. The test now uses a non-UUID input to exercise the primary guard. |

---

## Summary

**Counts:**
- Total tests examined: 142 (all pass post-changes)
- REAL (kept): 133
- FIXED (WRONG-SCENARIO → REAL): 2 (test_naming.py speaker profile creation tests)
- REWRITTEN (MOCKED-OUT → REAL): 2 (test_cleanup_security.py)
- DELETED: 0
- FLAGGED for attention (not changed): 3

**Files changed:**
- `tests/speaker/test_naming.py` — added `engine` form field and `_is_engine_active` mock to two tests that were failing with 400 before reaching naming logic
- `tests/security/test_cleanup_security.py` — rewrote two tests; removed one wrong-scenario test (third case); now exercises real UUID/regex guards instead of patching the wrong symbol

**Riskiest findings:**

1. **`test_cleanup_chapter_audio_files_traversal_blocked` (was MOCKED-OUT, now REAL)** — the original test patched `app.core.config.get_chapter_dir` which is never called by `cleanup_chapter_audio_files`; the function calls `ctx.get_chapter_dir()` on a `ProjectContext` object. The mock had zero effect on the execution path. This was a false assurance security test — it passed regardless of whether the guard worked. Now rewritten.

2. **`test_voice_bridge_describes_remote_registry_by_default` (FLAGGED, FRAGILE)** — asserts `{"ready"}` status but the bridge conftest disables both engines (XTTS and Voxtral). This test only passes when a live TTS server is running. In CI it will fail because the fallback path returns "unavailable". Not safe to change without mocking the remote bridge call or skipping in CI.

3. **`test_voice_bridge_rejects_unknown_engine` (FLAGGED, MOCKED-OUT)** — patches `RemoteBridgeHandler.synthesize`. Does not prove the real handler rejects unknown engines; only proves the bridge re-raises the error. Tolerable as an interface boundary test but should not be the only coverage for engine validation.

**Result:** `142 passed in 3.71s` — all green.
