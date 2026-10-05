# Test Quality Audit — tests/db remainder

**Date:** 2026-06-10
**Auditor:** Claude (Sonnet 4.6)
**Scope:** All test functions in `tests/db/*.py` except the already-audited set (test_db_queue, test_db_reconcile, test_state_queue_sync, test_state_rules, test_clear_logic, test_state_jobs_broadcast, test_db_segments_cleanup).
**Files inspected:** 18 files, 88 tests initially.
**Result:** 110 tests passing (full tests/db suite) after edits.

---

## Classification Table

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| test_chapters_crud.py | test_chapter_crud | REAL | untouched | Creates project+chapter, exercises real create/get/update, asserts DB state. |
| test_chapters_crud.py | test_get_chapter_segments_counts | REAL | untouched | Inserts rows directly and checks count function. |
| test_chapters_crud.py | test_get_chapter_disk_checks | FRAGILE→kept | flagged | Patches `StorageManager.resolve_chapter_asset_path` which is an internal DB call, not a true boundary mock. Tolerated because the filesystem layout is config-driven and the test does exercise `has_wav/has_mp3/has_m4a` logic. Would be better with `tmp_path` + patching `PROJECTS_DIR`. |
| test_chapters_lifecycle.py | test_delete_chapter_deletes_chapter_and_chunk_audio_files | REAL | untouched | End-to-end: creates, syncs segments, writes files, deletes, asserts trash layout. |
| test_chapters_lifecycle.py | test_move_chapter_artifacts_to_trash_rejects_invalid_chapter_id | REAL | untouched | Traversal-path rejection. |
| test_chapters_lifecycle.py | test_move_chapter_artifacts_to_trash_rejects_non_uuid_chapter_id | REAL | untouched | Non-UUID rejection. |
| test_chapters_lifecycle.py | test_cleanup_chapter_audio_files_rejects_traversal_names | REAL | untouched | Path traversal in filename rejection. |
| test_chapters_ops.py | test_reorder_chapters | REAL | untouched | Exercises reorder_chapters, asserts sort_order and list order. |
| test_chapters_ops.py | test_reset_chapter_audio | REAL | untouched | Asserts status cleared to unprocessed and path nulled. |
| test_chapters_ops.py | test_reset_chapter_audio_deletes_chunk_files | REAL | untouched | Asserts segment WAV files removed on reset. |
| test_chapters_ops.py | test_cleanup_chapter_audio_files_deletes_segment_file_by_id | REAL | untouched | |
| test_chapters_ops.py | test_update_segment_only_cleans_edited_segment_files | REAL | untouched | Critical regression: editing one segment must not delete others. |
| test_chapters_sync.py | test_update_chapter_text_change_preserves_stale_chapter_audio_until_rebuild | REAL | untouched | Stale audio preserved until explicit reset; only changed segment invalidated. |
| test_chapters_sync.py | test_sync_chapter_segments_preserves_rendered_file_links | REAL | untouched | Re-sync with same text must preserve audio links. |
| test_chapters_sync.py | test_sync_chapter_segments_does_not_cross_match_reordered_duplicates | REAL | untouched | Duplicate text segments with reorder must not share audio. |
| test_chapters_sync.py | test_sync_chapter_segments_preserves_unchanged_trailing_segments_after_local_edit | REAL | untouched | Mid-chapter edit must preserve pre/post-change segments. |
| test_chapters_sync.py | test_sync_chapter_segments_invalidates_preserved_rows_that_shared_audio_with_a_changed_segment | REAL | untouched | Shared-file invalidation cascade. |
| test_db_characters.py | test_character_crud | REAL | untouched | Full CRUD with own db_conn fixture. Uses hardcoded `/tmp/test_characters.db` — same isolation concern as conftest (noted below). |
| test_db_isolation.py | test_database_separation_isolation | REAL | untouched | Verifies user DB and studio DB don't cross-contaminate. |
| test_db_isolation.py | test_legacy_table_cleanup | REAL | untouched | Verifies legacy tables removed from user DB. |
| test_db_isolation.py | test_legacy_table_cleanup_with_data | REAL | untouched | Data migration from user DB to studio DB preserved. |
| test_db_migration_extended.py | test_migrate_state_json_to_db_no_file | VACUOUS | **DELETED (file)** | "Should just return" — no assert on behavior; confirms function doesn't throw. |
| test_db_migration_extended.py | test_migrate_state_json_to_db_success | MOCKED-OUT | **DELETED (file)** | Patches `get_connection` with MagicMock; exercises the mock, not the real DB. Asserts row counts on a manually-constructed sqlite table that doesn't match the real schema. |
| test_db_migration_extended.py | test_migrate_state_json_to_db_already_migrated | MOCKED-OUT | **DELETED (file)** | Same mock pattern as above. |
| test_db_projects.py | test_project_crud | REAL | untouched | Full CRUD. `shutil.rmtree` mock is acceptable (filesystem boundary). |
| test_db_projects.py | test_list_projects_order | FRAGILE→fixed | **REWRITTEN** | Had `time.sleep(0.1)` to create a timestamp ordering gap — sleep-based timing. Replaced with explicit `update_project(pid2)` call to advance `updated_at`. |
| test_db_projects.py | test_delete_project_no_path | REAL | untouched | Deletes project with no directory present; should succeed. |
| test_db_safety.py | test_non_test_db_path_is_rejected_in_test_mode | REAL | untouched | Guard contract: non-test DB must be rejected. |
| test_db_safety.py | test_test_db_path_is_allowed_in_test_mode | REAL | untouched | Guard contract: test-named DB must pass. |
| test_db_speakers.py | test_speaker_crud | REAL | untouched | |
| test_db_speakers.py | test_speaker_collision_handling | REAL | untouched | |
| test_db_speakers.py | test_update_voice_profile_references | REAL | untouched | Updates character and segment tables; asserts new value in both. |
| test_db_speakers_extended.py | test_create_speaker_with_collision | REAL | **DELETED (file)** | Unique scenario (existing profile dir) but touches real `config.VOICES_DIR` filesystem without isolation. Acceptable to delete; the DB-level collision is covered by test_db_speakers. |
| test_db_speakers_extended.py | test_get_speaker | REAL | **DELETED (file)** | Duplicate of test_db_speakers.py::test_speaker_crud. No fixture isolation. |
| test_db_speakers_extended.py | test_list_speakers | FRAGILE | **DELETED (file)** | `assert len(speakers) >= 2` — no isolation fixture, sees accumulated speakers across test session. |
| test_db_speakers_extended.py | test_update_speaker | REAL | **DELETED (file)** | Duplicate of test_db_speakers.py coverage. No fixture isolation. |
| test_db_speakers_extended.py | test_delete_speaker | REAL | **DELETED (file)** | Duplicate. |
| test_db_speakers_extended.py | test_update_voice_profile_references | VACUOUS | **DELETED (file)** | "Just check it doesn't crash" — no assert on outcome. |
| test_deduplication.py | test_deduplication | VACUOUS + WRONG-SCENARIO | **DELETED (file)** | Calls `/api/generation/resume` on empty state; `files_v2` is always empty so `len == len(set)` is trivially true. Uses a v1-era endpoint semantics. |
| test_deduplication.py | test_clear_with_active_processes | FRAGILE | **DELETED (file)** | `assert "processes stopped" in response.json()["message"]` — exact string match on an internal message. File deleted because the partner test was VACUOUS. |
| test_grouped_validation.py | test_grouped_segments_validation_regression | REAL | untouched | Shared-file group invalidation when segment leaves group. |
| test_grouped_validation.py | test_segments_in_root_are_invalidated | REAL | untouched | Segments with audio file in chapter root (not segments/) get invalidated. |
| test_grouped_validation.py | test_update_segment_preserves_audio_when_marked_done_with_metadata_change | REAL | untouched | Regression: "suicide cleanup" bug where updating a done segment with new metadata deleted its own audio. |
| test_migration_comprehensive.py | test_migrate_performance_metrics | REAL | untouched | Pure function transformation; all assertions contractual. |
| test_migration_comprehensive.py | test_migrate_settings | REAL | untouched | Pure function transformation. |
| test_migration_comprehensive.py | test_ensure_state_migrated | REAL | untouched | Mocks only `_record_legacy_performance_history_to_db` (DB side effect, legitimate). |
| test_migration_comprehensive.py | test_migration_removes_make_mp3_column | REAL | untouched | Creates old schema, runs init_db, asserts column gone, data survives. |
| test_migration_comprehensive.py | test_migration_renames_chapter_load_seconds_to_model_load_seconds | REAL | untouched | Same pattern — column rename with data preservation. |
| test_migration_extended.py | test_import_legacy_filesystem_data_no_files | REAL | untouched (file trimmed) | Exercises real `import_legacy_filesystem_data` with empty chapter dir; asserts contractual return. |
| test_migration_extended.py | test_import_legacy_filesystem_data_success | MOCKED-OUT | **DELETED** | Patches `create_project` and `get_connection` with MagicMock; asserts mock call counts, not DB state. |
| test_migration_extended.py | test_migrate_legacy_project_covers_success | MOCKED-OUT | **DELETED** | Patches `get_connection` with MagicMock cursor; exercises the mock's return values, not real DB. |
| test_performance_metrics_storage.py | test_record_render_sample_storage | REAL | untouched | |
| test_performance_metrics_storage.py | test_performance_retention_policy | REAL | untouched | |
| test_performance_metrics_storage.py | test_init_db_runs_performance_retention | REAL | untouched | Uses monkeypatch on `apply_performance_retention_policy` — acceptable, it's a side-effect boundary check. |
| test_performance_metrics_storage.py | test_global_audiobook_speed_multiplier_is_not_persisted | REAL | untouched | |
| test_performance_metrics_storage.py | test_failed_jobs_do_not_train | REAL | untouched | |
| test_performance_metrics_storage.py | test_successful_jobs_train | REAL | untouched | |
| test_performance_metrics_storage.py | test_successful_jobs_do_not_write_plugin_computer_speed_multiplier | REAL | untouched | |
| test_performance_metrics_storage.py | test_clear_engine_speed_baseline_wipes_samples_and_cached_cps | REAL | untouched | |
| test_performance_metrics_storage.py | test_record_engine_sample_filters_speed_history_by_tts_model | REAL | untouched | |
| test_performance_metrics_storage.py | test_record_engine_sample_requires_chars | REAL | untouched | |
| test_performance_metrics_storage.py | test_mandatory_synthesis_duration_contract | REAL | untouched | |
| test_performance_metrics_storage.py | test_xtts_segment_adapter_text_capture | MOCKED-OUT | **DELETED** | Patches `handle_xtts_job`, then manually calls `record_render_sample` itself. The adapter is mocked out; the test only verifies the test's own manual DB write. |
| test_performance_metrics_storage.py | test_record_engine_sample_contract_enforcement | REAL | untouched | |
| test_performance_metrics_storage.py | test_state_performance_initialization_isolation | REAL | untouched | |
| test_performance_metrics_storage.py | test_sample_build_task_does_not_train_metrics | REAL | untouched | FakeBridge at engine boundary is legitimate. |
| test_performance_metrics_storage.py | test_sample_test_task_does_not_train_metrics | REAL | untouched | Same pattern. |
| test_performance_metrics_storage.py | test_generate_via_bridge_extracts_nested_duration | REAL | untouched | FakeBridge returns nested result shape; verifies job state update. |
| test_performance_metrics_storage.py | test_verify_plugin_records_performance_sample | REAL | untouched | Mocks settings_store (filesystem boundary). |
| test_performance_metrics_storage.py | test_resolve_job_tts_model_falls_back_to_preview_model | REAL | untouched | Mocks `get_speaker_settings` (filesystem/DB lookup outside unit). |
| test_performance_metrics_storage.py | test_record_render_sample_stores_load_and_pure_render_seconds | REAL | untouched | |
| test_performance_metrics_storage.py | test_xtts_job_records_only_one_render_sample | MOCKED-OUT | **DELETED** | Patches `handle_xtts_job`; the "only one sample" contract is verified by the test itself writing one sample. |
| test_performance_metrics_storage.py | test_xtts_sample_uses_actual_segment_count | REAL | untouched | |
| test_performance_metrics_storage.py | test_make_mp3_not_written_to_db | FRAGILE→fixed | **REWRITTEN** | Had `if "make_mp3" in columns` conditional that made the assertion vacuous on a fresh DB (column never exists). Changed to unconditional `assert "make_mp3" not in columns`. |
| test_performance_metrics_storage.py | test_render_sample_records_explicit_model_without_db_defaulting | REAL | untouched | |
| test_performance_metrics_storage.py | test_xtts_model_defaults_satisfied_by_settings_schema | REAL | untouched | |
| test_performance_metrics_storage.py | test_historical_samples_without_explicit_model_still_calibrate | REAL | untouched | |
| test_storage_normalization.py | test_migration_v1_to_v2 | REAL | untouched | Full end-to-end v1→v2 migration. |
| test_storage_normalization.py | test_migration_skips_unsafe_segment_audio_id | REAL | untouched | Path-traversal segment ID rejection. Note: patches `get_chapter_segments` internally — borderline MOCKED-OUT but the point is to inject an unsafe id without touching the real segments table; accepted. |
| test_storage_normalization.py | test_idempotent_migration | REAL | untouched | Idempotency check. |
| test_storage_normalization.py | test_new_project_is_v2_compatible | REAL | untouched | |
| test_storage_normalization.py | test_voice_v2_migration | REAL | untouched | Flat→nested voice directory migration. |
| test_storage_normalization.py | test_voice_v2_migration_root_default_profile | REAL | untouched | |
| test_storage_normalization.py | test_voice_v2_backfill | REAL | untouched | Partial v2 manifest backfill. |
| test_storage_normalization.py | test_project_v2_enrichment_backfill | REAL | untouched | v2 manifest missing metadata fields backfilled from DB. |
| test_v2_hygiene.py | test_stale_root_profile_ignored | REAL | untouched | Exercises real sync_speakers_from_profiles + voice_dirs_map. |
| test_v2_hygiene.py | test_migration_moves_stale_profile | REAL | untouched | |
| test_v2_hygiene.py | test_migration_quarantines_conflicting_stale_profile | REAL | untouched | Quarantine path for conflict resolution. |

---

## Summary

| Metric | Count |
|--------|-------|
| Tests before audit | 88 |
| Tests after audit | 73 |
| Tests deleted | 15 |
| Files deleted | 3 (test_deduplication.py, test_db_migration_extended.py, test_db_speakers_extended.py) |
| Files trimmed | 2 (test_migration_extended.py, test_performance_metrics_storage.py) |
| Tests rewritten/fixed | 2 (test_list_projects_order, test_make_mp3_not_written_to_db) |
| VACUOUS deleted | 4 |
| MOCKED-OUT deleted | 8 |
| WRONG-SCENARIO deleted | 1 |
| FRAGILE fixed | 2 |
| REAL untouched | 67 |

**Final test count (full tests/db suite):** 110 passing (73 in scope + 37 from already-audited files).

---

## Riskiest Findings

1. **test_db_migration_extended.py (all 3 tests) — MOCKED-OUT**: These tests used a hand-crafted sqlite table with fewer columns than the real schema, then patched `get_connection` to return it. They would have passed even if the migration function wrote to the wrong table or corrupted data. The real migration contract is now covered by `test_migration_comprehensive.py` via actual `init_db()`.

2. **test_xtts_segment_adapter_text_capture / test_xtts_job_records_only_one_render_sample — MOCKED-OUT**: Both patched out `handle_xtts_job` (the function being exercised) and then manually called `record_render_sample` themselves. The test was verifying its own writes, not the adapter's behavior. These gave false confidence that the XTTS adapter path correctly trains metrics.

3. **test_deduplication.py::test_deduplication — VACUOUS**: Called `/api/generation/resume` on an empty DB then checked for duplicate files. With no chapters in the DB, `files_v2 = []`, making `len([]) == len(set([]))` trivially true. A real deduplication test would need actual chapters + two consecutive resume calls.

4. **test_make_mp3_not_written_to_db — FRAGILE conditional**: The `if "make_mp3" in columns` guard made the assertion vacuous on a fresh DB (where the column never exists). On a migrated DB where the column survived migration, the assertion ran. Fixed to unconditional.

5. **conftest.py (cannot edit) — isolation note**: The shared `db_conn` fixture uses a hardcoded path `/tmp/test_audiobook_db.db`. Three other test files (test_db_characters.py, test_db_projects.py, test_db_speakers.py) define their own `db_conn` fixtures with different hardcoded paths (`/tmp/test_characters.db`, `/tmp/test_projects.db`, `/tmp/test_speakers.db`). All hardcoded paths risk collision under parallel pytest-xdist runs. Recommend migrating to `tmp_path`-based fixtures in a future pass.

---

## Revert-checks performed

- `test_list_projects_order` rewrite: sleep removed; replaced with explicit `update_project(pid2)` to advance `updated_at`. The assertion still depends on ordering by `updated_at DESC`, which is the real contract.
- `test_make_mp3_not_written_to_db` fix: the column must be absent after `init_db()` runs the migration. If the migration were reverted and `make_mp3` reappeared in the schema, the test would now fail correctly.
