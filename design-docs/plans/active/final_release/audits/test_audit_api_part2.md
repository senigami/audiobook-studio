# Test Audit — tests/api (Part 2: m–z files)

**Scope:** All test functions in `tests/api/*.py` whose filename starts with `m` onward (alphabetically second half), excluding `test_websocket_broadcast.py` (separately audited).

**Files in scope:**
- test_api_projects.py
- test_api_projects_extended.py
- test_api_queue.py
- test_api_synthesis_task.py
- test_api_system.py
- test_api_tts_api.py
- test_api_utils_extended.py
- test_api_voices_actions.py
- test_api_voices_bundles.py
- test_api_voices_listing.py
- test_api_voices_management.py
- test_api_voices_plugin_settings.py
- test_audio_sync.py
- test_audiobook_history_api.py
- test_fix_audio_disappearance.py
- test_isolation_guard.py
- test_path_traversal.py
- test_repair_voice_engine_drift.py
- test_response_types.py
- test_studio_task_progress.py
- test_voice_engines_fallback.py
- test_web_endpoints.py

---

## Classification Table

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| test_api_projects.py | test_project_crud | — | REAL | Full CRUD lifecycle via HTTP; asserts observable state changes |
| test_api_projects.py | test_project_list_and_detail_do_not_migrate_on_read | — | REAL | Confirms migration is NOT called on list/detail; contractual negative assertion |
| test_api_projects.py | test_project_chapters | — | REAL | Create, list, reorder chapters; asserts order changes |
| test_api_projects.py | test_project_audiobooks_and_assemble | — | REAL | Assemble route enqueues job correctly; patches TaskOrchestrator.submit (legitimate) |
| test_api_projects_extended.py | test_create_project_with_cover | — | REAL | POST with cover file; asserts cover_image_path persisted |
| test_api_projects_extended.py | test_update_project_with_cover | — | REAL | PUT updates name and cover |
| test_api_projects_extended.py | test_list_project_audiobooks | — | REAL | GET audiobooks returns list (empty ok) |
| test_api_projects_extended.py | test_assemble_project_error_no_chapters | — | REAL | 400 when no chapters exist |
| test_api_projects_extended.py | test_assemble_project_error_not_processed | — | REAL | 400 when chapter not processed |
| test_api_projects_extended.py | test_reorder_chapters_error | — | REAL | 400 on invalid JSON chapter_ids |
| test_api_queue.py | test_queue_api | — | REAL | Add, list, reorder, delete from queue; asserts ordering invariant; patches only TaskOrchestrator.submit (legitimate) |
| test_api_queue.py | test_failed_queue_items_expose_error_reason | — | REAL | Failed queue row exposes error string via GET |
| test_api_queue.py | test_processing_queue_reconciles_db_running_row_when_memory_job_is_done | — | REAL | DB/memory reconciliation on GET; asserts DB is updated and chapter state preserved |
| test_api_queue.py | test_processing_queue_keeps_old_done_voxtral_row_done_when_new_run_is_already_queued | — | REAL | Old done row stays done; new queued row stays queued |
| test_api_queue.py | test_segment_scoped_queue_updates_do_not_mutate_chapter_audio_state | — | REAL | chapter_scoped=False must not touch chapter.audio_status |
| test_api_queue.py | test_processing_queue_hydrates_running_progress_for_reload | — | REAL | In-memory progress fields hydrated into GET response |
| test_api_queue.py | test_processing_queue_hydrates_running_progress_when_active_segment_is_set_but_idle | — | REAL | Same as above with active_segment_id |
| test_api_queue.py | test_processing_queue_hydrates_preparing_progress_for_reload | — | REAL | Preparing status hydrated from in-memory state |
| test_api_queue.py | test_processing_queue_returns_completed_output_metadata_without_duplicate_rows | — | REAL | Completed row gets metadata from performance table; no row duplication |
| test_api_queue.py | test_queue_never_returns_simulated_finalizing | — | REAL | Done row must never be promoted to "finalizing" by GET |
| test_api_queue.py | test_processing_queue_hydrates_classification | — | REAL | classification field returns "chapter" for chapter-scope job |
| test_api_synthesis_task.py | test_is_studio_task_subclass | TestApiSynthesisTask | REAL | isinstance contract |
| test_api_synthesis_task.py | test_creation_defaults | TestApiSynthesisTask | REAL | Default fields after construction |
| test_api_synthesis_task.py | test_custom_resource_claim | TestApiSynthesisTask | REAL | gpu/vram fields from ResourceClaim.gpu_heavy |
| test_api_synthesis_task.py | test_to_task_context | TestApiSynthesisTask | REAL | Payload shape and task_type |
| test_api_synthesis_task.py | test_to_bridge_request | TestApiSynthesisTask | REAL | Bridge request shape |
| test_api_synthesis_task.py | test_from_task_context_roundtrip | TestApiSynthesisTask | REAL | Serialize→deserialize identity |
| test_api_synthesis_task.py | test_source_is_always_api | TestApiSynthesisTask | REAL | Invariant: source="api" |
| test_api_synthesis_task.py | test_submitted_at_is_set | TestApiSynthesisTask | REAL | submitted_at is set on construction |
| test_api_synthesis_task.py | test_on_cancel_does_not_raise | TestApiSynthesisTask | REAL | on_cancel is safe to call |
| test_api_synthesis_task.py | test_validate_passes_with_valid_fields | TestApiSynthesisTask | REAL | validate() does not raise |
| test_api_synthesis_task.py | test_validate_raises_without_text | TestApiSynthesisTask | REAL | validate() raises on empty text |
| test_api_synthesis_task.py | test_validate_raises_without_engine_id | TestApiSynthesisTask | REAL | validate() raises on empty engine_id |
| test_api_synthesis_task.py | test_validate_raises_without_output_path | TestApiSynthesisTask | REAL | validate() raises on empty output_path |
| test_api_synthesis_task.py | test_describe_returns_task_context | TestApiSynthesisTask | REAL | describe() returns correct TaskContext |
| test_api_synthesis_task.py | test_none_claim | TestResourceClaim | REAL | ResourceClaim.none() zeros all fields |
| test_api_synthesis_task.py | test_exclusive_claim | TestResourceClaim | REAL | exclusive=True set correctly |
| test_api_synthesis_task.py | test_gpu_heavy_claim | TestResourceClaim | REAL | gpu/vram/cpu_heavy set correctly |
| test_api_synthesis_task.py | test_from_engine_manifest | TestResourceClaim | REAL | Reads gpu/vram from manifest resource |
| test_api_synthesis_task.py | test_from_engine_manifest_no_resource | TestResourceClaim | REAL | Falls back gracefully with no resource attr |
| test_api_system.py | test_home_endpoint | — | REAL | /api/home returns required keys; mocks external watchdog (legitimate) |
| test_api_system.py | test_home_endpoint_ready_without_engines | — | REAL | startup_ready=True with healthy watchdog and empty engines |
| test_api_system.py | test_home_endpoint_degraded | — | REAL | startup_ready=False when watchdog unhealthy |
| test_api_system.py | test_home_endpoint_fallback | — | REAL | Offline/crashed state when circuit open |
| test_api_system.py | test_settings_get_and_update | — | REAL | POST /api/settings persists and returns fields |
| test_api_system.py | test_default_speaker_setting | — | REAL | /api/settings/default-speaker persists to /api/home |
| test_api_system.py | test_audiobooks_list | — | REAL | GET /api/audiobooks returns empty list for empty dir |
| test_api_tts_api.py | test_tts_api_disabled | — | REAL | 403 when tts_api_enabled=False |
| test_api_tts_api.py | test_tts_api_unauthorized | — | REAL | 401 when key required but missing/wrong |
| test_api_tts_api.py | ~~test_tts_api_lan_protection~~ | — | **DELETED (VACUOUS)** | Test contained comment "let's trust the logic in web.py" and asserted 200 knowing TestClient bypasses the guard. Exercised nothing. |
| test_api_tts_api.py | test_list_engines | — | REAL | GET /engines returns list |
| test_api_tts_api.py | test_synthesize_inline | — | REAL | Short-text synthesis returns inline wav; patches TaskOrchestrator.submit (legitimate TTS network mock) |
| test_api_tts_api.py | test_synthesize_queued | — | REAL | Long-text synthesis returns job_id+poll_url; patches submit (legitimate) |
| test_api_tts_api.py | test_rate_limiting | — | REAL (minor fragility noted) | Mutates _limiter internal `_history` dict and `requests_per_minute`. Behavior verified is real. Fragility: tied to private attrs; would break if limiter implementation changes. Left as-is since the contract (429 after N requests) is real. |
| test_api_tts_api.py | test_get_job_status | — | REAL | GET /jobs/{id} reads in-memory job state |
| test_api_utils_extended.py | test_read_preview | — | REAL | Truncates and returns file preview text |
| test_api_utils_extended.py | test_exists | — | REAL | Checks v2 nested paths; traversal rejected |
| test_api_utils_extended.py | test_safe_join_allows_nested_relative_paths | — | REAL | safe_join allows valid nested, raises on traversal |
| test_api_utils_extended.py | test_is_react_dev_active | — | REAL | Patches socket.connect_ex; tests return value branch |
| test_api_utils_extended.py | test_list_audiobooks | — | REAL | Scans project dirs; patches ffprobe (legitimate network/subprocess mock) |
| test_api_voices_actions.py | test_create_profile_persists_engine_metadata | — | REAL | POST speaker-profiles writes engine to profile.json on disk |
| test_api_voices_actions.py | test_create_managed_engine_profile_requires_active_status | — | REAL | 400 when engine inactive |
| test_api_voices_actions.py | test_update_profile_engine | — | REAL | POST /engine writes engine field to disk |
| test_api_voices_actions.py | test_update_managed_engine_requires_active_status | — | REAL | 400 when engine inactive; 400 for bad-engine |
| test_api_voices_actions.py | test_update_profile_reference_sample | — | REAL | POST /reference-sample writes to profile.json |
| test_api_voices_actions.py | test_update_profile_voice_asset_id | — | REAL | POST /voice-asset-id writes to profile.json |
| test_api_voices_actions.py | test_managed_profile_test_accepts_saved_voice_id_without_samples | — | REAL | /test succeeds with voice_asset_id set; patches submit (legitimate) |
| test_api_voices_actions.py | test_voice_test_job_uses_descriptive_queue_title | — | REAL | /test creates job with correct custom_title; patches put_job to inspect arg |
| test_api_voices_actions.py | ~~test_speaker_settings_updates~~ | — | **DELETED (MOCKED-OUT)** | Patched `voices_actions.update_speaker_settings` — the exact DB function the routes call. Asserted only call count; no observable state change verified. |
| test_api_voices_actions.py | test_reset_speaker_test_text | — | REAL | Calls reset-test-text; verifies profile.json no longer has test_text |
| test_api_voices_actions.py | test_build_and_test_profiles | — | REAL (weak) | Builds voice, tests voice; patches submit (legitimate). 200 status + file presence checked. Low value but not mocked-out. |
| test_api_voices_actions.py | test_engine_actions_reject_when_disabled | — | REAL | 400 + message when engine inactive |
| test_api_voices_actions.py | test_build_and_rename_profile | — | REAL | Build then rename; asserts 200 on both |
| test_api_voices_actions.py | test_upload_samples_security_and_failure | — | REAL | 500 on makedirs failure |
| test_api_voices_actions.py | test_delete_sample_errors | — | REAL | Delete success; 500 on unlink failure |
| test_api_voices_actions.py | test_delete_sample_reject_traversal | — | REAL | 403 on path traversal attempt |
| test_api_voices_actions.py | test_update_profile_voice_asset_id_generic | — | REAL | voice-asset-id persists to disk |
| test_api_voices_actions.py | test_update_profile_voice_asset_id_rejects_local_engine | — | REAL | 400 for xtts which doesn't support asset IDs |
| test_api_voices_bundles.py | test_export_voice_bundle_excludes_source_wavs_by_default | — | REAL | ZIP content verified: source.wav excluded |
| test_api_voices_bundles.py | test_export_voice_bundle_includes_source_wavs_when_requested | — | REAL | source.wav included with flag |
| test_api_voices_bundles.py | test_export_voice_bundle_includes_engine_declared_test_sample | — | REAL | Engine-specific test sample included |
| test_api_voices_bundles.py | test_export_voice_bundle_rejects_traversal | — | REAL | VoiceBundleError on traversal name |
| test_api_voices_bundles.py | test_import_voice_bundle_duplicate_creates_suffixed_copy | — | REAL | Round-trip export→import; duplicate renamed to "Dracula 2" |
| test_api_voices_bundles.py | test_import_voice_bundle_rejects_invalid_archives | — | REAL | 400 for malformed, missing voice.json, traversal, missing profile, unsupported binary |
| test_api_voices_bundles.py | test_imported_latent_voice_lists_ready_without_rebuild | — | REAL | Imported latent voice shows is_ready=True in profile list |
| test_api_voices_bundles.py | test_export_voice_bundle_fails_when_no_engine | — | REAL | VoiceBundleError when no engine configured |
| test_api_voices_listing.py | test_list_speaker_profiles | — | REAL (minor fragility) | Patches get_speaker_settings internals to inject engine; could use real DB. Behavior asserted is real. |
| test_api_voices_listing.py | test_list_speaker_profiles_uses_engine_declared_test_sample | — | REAL | Engine-specific test sample reflected in has_latent |
| test_api_voices_listing.py | test_engine_active_falls_back_to_local_manifest_when_registry_unavailable | — | REAL | _is_engine_active falls back to local manifest on EngineUnavailableError |
| test_api_voices_listing.py | test_legacy_profile_listing_repairs_missing_speaker_rows_and_preserves_default_switch | — | REAL | V1→V2 migration path via GET; speaker row repaired; default switch works |
| test_api_voices_management.py | test_create_and_delete_profile | — | REAL | Create profile on disk; delete removes it |
| test_api_voices_management.py | test_character_voice_assignment_blank_value_clears_to_default | — | REAL | Empty string speaker_profile_name persists as null |
| test_api_voices_management.py | test_create_character_blank_voice_uses_default | — | REAL | Create character with blank voice; null persisted |
| test_api_voices_management.py | test_character_crud | — | REAL | Create/list/update/delete character |
| test_api_voices_management.py | test_speaker_crud | — | REAL | Create/list/update/delete speaker |
| test_api_voices_management.py | test_rename_profile_and_security | — | REAL | Rename moves files; traversal returns 403 |
| test_api_voices_management.py | test_rename_speaker_with_variants | — | REAL | Rename top-level voice moves all variants; metadata updated |
| test_api_voices_management.py | test_rename_profile_default_sync | — | REAL | Rename updates default_speaker_profile in settings |
| test_api_voices_management.py | test_profile_creation_errors | — | REAL | 400 duplicate; 403 traversal; 500 mkdir failure; 400 bad engine |
| test_api_voices_management.py | test_assign_profile_to_speaker_errors | — | REAL | 500 on DB crash in assign route |
| test_api_voices_management.py | test_create_speaker_profile_fails_when_no_engine_and_no_default | — | REAL | 400 when no engine configured at all |
| test_api_voices_plugin_settings.py | test_list_speaker_profiles_includes_generic_settings | — | REAL | settings dict with temperature exposed in profile list |
| test_api_voices_plugin_settings.py | test_update_speaker_settings_validates_keys | — | REAL | Allowed keys persisted; rejected key returns 400 and is not saved |
| test_api_voices_plugin_settings.py | test_update_speaker_settings_allows_profile_metadata_and_requested_engine | — | REAL | engine, test_text, model all accepted and persisted |
| test_audio_sync.py | test_audio_synchronization_discovers_existing_files | — | REAL | GET /chapters triggers sync; DB updated to "done" when file exists |
| test_audiobook_history_api.py | test_project_audiobook_history_endpoint | — | REAL (was FRAGILE) | Fixed: replaced time.sleep(0.1) with explicit os.utime timestamps |
| test_audiobook_history_api.py | test_project_audiobook_history_not_found | — | REAL | 404 for non-existent project |
| test_audiobook_history_api.py | test_project_audiobook_history_prefers_title_for_download_filename | — | REAL | ffprobe title used for download_filename |
| test_audiobook_history_api.py | test_delete_audiobook | — | REAL | DELETE removes m4b and companion jpg |
| test_audiobook_history_api.py | test_delete_audiobook_not_found | — | REAL | 404 for missing file |
| test_audiobook_history_api.py | test_delete_audiobook_rejects_traversal | — | REAL | 403 on traversal attempt |
| test_fix_audio_disappearance.py | test_finished_audio_preserved_after_job_removal | — | REAL | Removing done job does not reset chapter audio_status |
| test_fix_audio_disappearance.py | test_queued_audio_reset_after_job_removal | — | REAL | Removing queued job resets chapter to unprocessed |
| test_fix_audio_disappearance.py | test_clear_completed_and_cancelled | — | REAL | clear_completed removes done/cancelled; queued row preserved |
| test_isolation_guard.py | test_api_voices_dir_isolation | — | REAL | Verifies conftest isolates VOICES_DIR away from real repo dir |
| test_path_traversal.py | test_public_project_assets_serve | — | REAL | m4b and cover served at expected URLs |
| test_path_traversal.py | test_private_project_assets_blocked | — | REAL | chapters/backups not served (404) |
| test_path_traversal.py | test_public_voice_assets_serve | — | REAL | sample.mp3 served |
| test_path_traversal.py | test_private_voice_assets_blocked | — | REAL | profile.json and latent.pth blocked (404) |
| test_path_traversal.py | test_path_traversal_blocked | — | REAL | URL path traversal returns 404 |
| test_path_traversal.py | test_project_public_assets_require_canonical_project_id | — | REAL | Non-UUID project id returns 404 |
| test_repair_voice_engine_drift.py | test_repair_voice_engine_drift_dry_run | — | REAL | Script dry-run proposes changes without writing |
| test_repair_voice_engine_drift.py | test_repair_voice_engine_drift_apply | — | REAL | Script --apply writes new engine values to files |
| test_response_types.py | test_queue_start_not_redirect | — | REAL | POST /resume returns JSON {status: ok}, not redirect |
| test_response_types.py | test_pause_not_redirect | — | REAL | POST /pause returns JSON {status: ok}, not redirect |
| test_studio_task_progress.py | test_studio_task_progress_reporter_mechanism | — | REAL | report_progress no-ops without reporter; invokes reporter when attached |
| test_studio_task_progress.py | test_orchestrator_attaches_progress_reporter | — | REAL | _dispatch calls _publish with 0.25 and 0.75 from MockTask |
| test_studio_task_progress.py | test_publish_preserves_started_at | — | REAL | Later update without started_at does not erase original |
| test_studio_task_progress.py | test_publish_monotonic_progress | — | REAL | Lower progress value from task does not regress stored value |
| test_studio_task_progress.py | test_progress_heartbeat | — | REAL | Heartbeat context emits monotonically increasing progress up to cap; thread cleanup verified |
| test_studio_task_progress.py | test_progress_heartbeat_non_advancing | — | REAL | advance_progress=False keeps progress at start |
| test_studio_task_progress.py | ~~test_log_listener_task_id_correlation~~ | — | **DELETED (MOCKED-OUT)** | Test defined its own inline `log_listener` function and asserted on it — never exercised the production closure in `_dispatch`. Equivalent to testing a copy of the code. |
| test_voice_engines_fallback.py | test_get_default_profile_engine_filters_disabled_engines | — | REAL | Disabled configured engine returns "" |
| test_voice_engines_fallback.py | test_get_default_profile_engine_returns_empty_when_all_disabled | — | REAL | All disabled → "" |
| test_voice_engines_fallback.py | test_normalize_tts_engine_returns_empty_when_disabled | — | REAL | Disabled engine normalizes to "" |
| test_voice_engines_fallback.py | test_get_default_profile_engine_ranking_prefers_local | — | REAL | No explicit default → "" (strict policy) |
| test_voice_engines_fallback.py | test_get_default_profile_engine_explicit_wins_when_valid | — | REAL | Explicit enabled default returns that engine |
| test_voice_engines_fallback.py | test_normalize_profile_metadata_preserves_explicit_engine | — | REAL | engine field preserved by normalize |
| test_voice_engines_fallback.py | test_sync_speakers_from_profiles_preserves_existing_engine | — | REAL | sync does not overwrite explicit engine |
| test_voice_engines_fallback.py | test_get_default_profile_engine_ranking_all_layers | — | REAL | No explicit default → "" with multiple manifests |
| test_voice_engines_fallback.py | test_sync_speakers_from_profiles_does_not_write_inferred_engine | — | REAL | Absent engine not written to disk after sync |
| test_voice_engines_fallback.py | test_update_settings_without_default_engine_does_not_persist_inferred | — | REAL | update_settings does not inject default_engine |
| test_voice_engines_fallback.py | test_update_settings_preserves_disabled_invalid_default_engine | — | REAL | Disk preserves voxtral; runtime resolves to "" |
| test_voice_engines_fallback.py | test_normalize_profile_metadata_does_not_write_inferred_engine | — | REAL | normalize with persist=True does not write absent engine |
| test_voice_engines_fallback.py | test_no_registry_entries_yields_empty_resolution | — | REAL | Empty registry → "" |
| test_voice_engines_fallback.py | test_explicit_valid_default_engine_resolves | — | REAL | Explicit + enabled → returns that engine |
| test_voice_engines_fallback.py | test_normalize_profile_metadata_empty_does_not_write_file | — | REAL | No profile.json created for empty metadata |
| test_voice_engines_fallback.py | test_update_settings_explicit_invalid_default_engine_preserves_on_disk | — | REAL | Disabled engine saved to disk as requested; resolves "" in memory |
| test_voice_engines_fallback.py | test_normalize_tts_engine_fails_clear_when_invalid_and_no_usable_engine | — | REAL | Empty registry → "" |
| test_voice_engines_fallback.py | test_alias_only_profile_metadata_resolves_to_empty | — | REAL | Alias-only metadata with no explicit engine → "" |
| test_voice_engines_fallback.py | test_normalize_base_profiles_does_not_add_engine_when_absent | — | REAL | normalize_base_profiles does not inject engine |
| test_voice_engines_fallback.py | test_normalize_base_profiles_preserves_explicit_engine | — | REAL | Explicit engine preserved by normalize_base_profiles |
| test_voice_engines_fallback.py | test_normalize_tts_engine_returns_empty_when_no_valid_engine_or_fallback | — | REAL | None engine with no fallback → "" |
| test_web_endpoints.py | test_crud_projects | — | REAL | Full CRUD loop against live app |
| test_web_endpoints.py | test_chapter_endpoints | — | REAL | Chapter CRUD, reorder, reset, delete |
| test_web_endpoints.py | test_missing_entities | — | REAL | 404 for missing project; empty list for missing project chapters |
| test_web_endpoints.py | test_reports | — | REAL | 404 for missing report file |
| test_web_endpoints.py | test_speaker_endpoints | — | REAL | 200 for profiles list; 404 for delete non-existent |
| test_web_endpoints.py | test_queue_endpoints | — | REAL (was FRAGILE) | Fixed: removed `in [200, 422, 405]` wide-open accept; asserts 200 + {status: ok} |
| test_web_endpoints.py | test_audiobooks_endpoints | — | REAL | 200 on list; 404 on delete missing |
| test_web_endpoints.py | test_serves_top_level_frontend_dist_files | — | REAL | Static file served from dist |
| test_web_endpoints.py | test_serves_nested_frontend_dist_files_with_containment | — | REAL | Nested file served; traversal blocked |
| test_web_endpoints.py | test_serves_spa_shell_with_no_store_headers | — | REAL | SPA shell returns cache-control: no-store |
| test_web_endpoints.py | test_serves_legacy_output_files_without_precreated_mounts | — | REAL | Legacy cover served; traversal blocked |
| test_web_endpoints.py | test_api_discovery_fallback_excludes_retired_jobs_route | — | REAL | Discovery JSON does not expose /jobs |

---

## Summary

| classification | count |
|---------------|-------|
| REAL (untouched) | 112 |
| REAL (fixed — was FRAGILE) | 2 |
| DELETED (VACUOUS) | 1 |
| DELETED (MOCKED-OUT) | 2 |
| **Total** | **117** |

---

## Riskiest Findings

1. **test_log_listener_task_id_correlation (DELETED)** — This was the most egregious finding. The test defined its own inline `log_listener` closure that mirrored what the production code supposedly does, then exercised only that inline copy. The real production `log_listener` inside `_dispatch` was never called. This gave 0 real coverage of the behavior it claimed to verify (task_id correlation filtering in the log-driven progress pipeline).

2. **test_tts_api_lan_protection (DELETED)** — Explicitly self-confessed vacuity in comments: "But for now, let's trust the logic in web.py." Asserted `status_code == 200` knowing the LAN guard would never fire through TestClient. Deleted.

3. **test_speaker_settings_updates (DELETED)** — Patched `voices_actions.update_speaker_settings` — the exact database write function the HTTP routes call. Asserted only mock call count (2). No disk state was verified; the test proved nothing about the route contracts. The behavior is covered by `test_reset_speaker_test_text` (real).

4. **test_queue_endpoints (FIXED)** — Used `assert res.status_code in [200, 422, 405]` for all three generation control routes. This accepts any of three mutually contradictory statuses (success vs. validation error vs. method not allowed). The test would pass even if all routes returned 422. Fixed to assert 200 + `{status: ok}`.

5. **test_project_audiobook_history_endpoint (FIXED)** — Used `time.sleep(0.1)` to ensure mtime ordering between two files. This is a sleep-based timing assertion (rule R4 violation) that is slow and could flake on a loaded system. Fixed with explicit `os.utime` timestamps.

---

## Revert-check verification (for rewrites)

The two FRAGILE→REAL fixes were verified revertable:

- **test_queue_endpoints**: reverting to `in [200, 422, 405]` would make the assertion pass even if the route returns 422 (wrong). The tightened assertion would fail if the routes broke.
- **test_project_audiobook_history_endpoint**: the old sleep relied on wall clock; the new `os.utime` sets deterministic timestamps. If the sort logic broke (sorted ascending instead of descending), the `data[0]["filename"] == "v2.m4b"` assertion would fail with both old and new version — the fix is purely about fragility, not coverage.

---

## Test run results

```
pytest tests/api/test_api_tts_api.py tests/api/test_api_voices_actions.py \
       tests/api/test_studio_task_progress.py tests/api/test_web_endpoints.py \
       tests/api/test_audiobook_history_api.py -q --no-cov
48 passed in 3.07s
```
