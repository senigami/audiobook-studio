# Test Value Audit — Backend core/domain/security/speaker/utils — 2026-07-10

Consolidated from 8 parallel sub-passes: `tests/core/`, `tests/domain/` (split into 4 sub-batches: huggingface/huggingface_client, segment_variation/voice_bundle_phase_e, voice_migration_v1_schema/voice_taxonomy, domain_contracts/project_backup_bundle), `tests/security/`, `tests/speaker/`+root-level files, `tests/utils/`. Cross-checked against `design-docs/engineering-rules/backend-paths.md` for security-test rigor.

Scope: ~44 files, ~320 total test cases reviewed.

## DEFINITE delete candidates

### tests/core/ (13 of 41 tests flagged — the weakest area found in this whole audit)
- `test_coverage_boost_v2.py::test_web_additional_endpoints` — only asserts `status_code == 200`, no content/behavior check; a coverage-metric-driven smoke test.
- `test_isolation_security.py::test_sandbox_isolation_verification` — tautological: reads env vars conftest.py itself set and asserts they equal those same values. Tests that conftest ran, not any app security boundary, despite "CRITICAL" framing.
- `test_isolation_security.py::test_export_sample_with_project_context` — `assert status_code in [200, 500]` accepts either outcome; no real attack input.
- `test_isolation_security.py::test_import_legacy_data_is_safe` — despite the name, only smoke-tests an empty-directory no-op scenario; no legacy files or malicious input ever exercised.
- `test_launcher_agnosticism.py` — **all 5 tests** (`test_launchers_do_not_reference_root_requirements_xtts`, `test_plugin_requirements_owns_full_xtts_dependency_set`, `test_root_requirements_xtts_is_deleted`, `test_launchers_do_not_contain_inline_xtts_conflict_logic`, `test_xtts_env_dir_compatibility`) — every test is a static grep/file-existence check on `run.sh`/`run.ps1` text; none execute the launchers or exercise real environment-resolution behavior. This is the closest literal match in the whole audit to the owner's "testing that text exists" example.
- `test_settings_refactor.py::test_default_settings_refactor` — only asserts `"safe_mode" in settings`, never checks its value, despite the docstring claiming to verify a specific default.
- `test_settings_refactor.py::test_baseline_engine_cps_lives_in_behavior_not_core_config` — asserts an internal implementation detail (`not hasattr(...)`) rather than observable behavior.
- `test_settings_refactor.py::test_get_speaker_settings_uses_hardcoded_fallback` — never sets global settings to a non-default value, so it can't distinguish "hardcoded" from "read from a default that happens to match."
- `test_verification_isolation.py::test_verify_does_not_depend_on_studio_voices` — claims to prove Studio voice-resolution code is unreached, but installs no mock/spy to actually catch a violation; duplicates a sibling test's setup with no added coverage.

### tests/domain/
- `test_voice_huggingface.py::test_asdict_and_direct_value_access_are_NOT_redacted` — asserts guaranteed Python frozen-dataclass semantics (no custom serialization exists to override), not app logic.
- `test_segment_variation_synthesis.py::test_render_segment_non_default_variant_differs_from_default` — both compared values come from test-supplied mocks, so the inequality is guaranteed by the test's own setup regardless of `_render_segment`'s real logic.
- `test_voice_bundle_phase_e.py::test_import_does_not_write_version_integer_to_voice_json` — the fixture used never had a `version` key to begin with, so the assertion is trivially true; a sibling test with the correct fixture already covers this claim properly.
- `test_voice_migration_v1_schema.py::test_no_attributes_block_written` — (borderline DEFINITE per source review) no code path ever writes the key being checked for absence, so nothing is actually being guarded — see DISCUSS below, kept there per the reporting agent's own classification.
- `test_voice_taxonomy.py::test_supported_version_accepted_silently` and `test_older_major_version_accepted_silently` — `check_taxonomy_version()` has no code path that can return anything but `True`; both assert an always-true return and never check `caplog` for the "silently" behavior their names claim.
- `test_domain_contracts.py::test_preview_voice_profile_rejects_non_wav_bridge_format` — name claims format-rejection; assertions show format passed through unchanged (there is no rejection logic anywhere in the exercised code path). Mislabeled, asserts a no-op.

### tests/security/
- `test_api_key_security.py::test_compare_digest_is_used_in_source` — `inspect.getsource()` grep for the string `"compare_digest"`; proves nothing about timing-safety or actual behavior.

### tests/speaker/ + root
- `test_isolation_guard.py::test_speaker_voices_dir_isolation` — no `IsolationGuard`-named mechanism exists anywhere in `app/`; this is a test-harness sanity check duplicating an assertion the autouse `conftest.py` fixture already makes unconditionally before every test in the directory.
- `test_naming.py::test_rename_unassigned_profile_payload` — true duplicate of `test_rename_unassigned_profile`; its docstring claims to guard a `name`-vs-`new_name` field-mismatch bug but the body never reproduces that scenario.
- `test_runtime_version.py::test_python_runtime_version` — pure interpreter-version check, exercises no application code (already pinned by CI config).

### tests/utils/
- `test_lexicon.py::test_none_entries_treated_as_empty` — name claims a `None` scenario; body actually passes an empty list — exact duplicate of the adjacent `test_empty_entries_returns_text_unchanged`.
- `test_lexicon.py::test_multiple_entries_order_is_deterministic` — self-referential: calls the function twice with identical args and compares the two results to each other, not to any expected value.
- `test_lexicon.py::test_entry_replacement_does_not_cascade` — vacuous (`isinstance`/`len > 0` only); docstring admits it accepts either of two opposite behaviors.
- `test_sanitize_categories.py::test_registry_contains_all_default_categories` — trivial presence-only loop over an internal registry, no text-processing behavior exercised.
- `test_sanitize_categories.py::test_default_order_is_tuple_of_strings` — trivial type-only assertion on an internal implementation detail.
- `test_textops.py::test_compute_chapter_metrics` — only asserts key presence, never checks any computed value.

## DISCUSS (borderline, needs a human call — abbreviated; see individual sub-audit detail where noted)

- `tests/core/test_coverage_boost_v2.py` — 2 more thin/loose-assertion tests (`test_analysis_router_endpoints`, `test_migration_coverage`).
- `tests/core/test_isolation_security.py::test_reset_chapter_isolation` — verifies real deletion but never actually tests cross-project isolation despite the name.
- `tests/core/test_settings_refactor.py` — 2 more presence-only tests (`test_api_home_reflects_new_state_structure`), plus `test_traversal_id_blocked_in_load_settings` (monkeypatches an internal helper of the module under test — borderline R2).
- `tests/domain/test_voice_huggingface.py::test_export_does_not_touch_real_project_storage` — real code path but trivially-guaranteed assertions, subset of a sibling test.
- `tests/domain/test_voice_bundle_phase_e.py::test_import_does_not_write_default_variant_to_voice_json` — half vacuous (same fixture-never-had-the-key issue), half real (a genuine coverage gap for the case where the field IS present).
- `tests/domain/test_voice_migration_v1_schema.py::test_no_attributes_block_written`, `test_returns_true_on_success` — guard hypothetical/convention-only outcomes rather than a specific branch.
- `tests/domain/test_voice_taxonomy.py::test_missing_taxonomy_version_accepted`, `test_empty_provenance_no_errors` — same always-true-return smell as the DEFINITE items above, milder.
- `tests/domain/test_domain_contracts.py::test_preview_voice_profile_routes_through_real_bridge`, `test_settings_ownership_chain_order` — "real bridge" is misleading (fully mocked TTS client); ownership-chain test mostly re-asserts an already-sorted static list.
- `tests/domain/test_project_backup_bundle.py::test_backup_download_security` — the traversal half is likely vacuous (httpx normalizes `../` client-side before the request is ever sent, so the intended defense code is never reached); the extension-validation half of the same test is fine.
- `tests/security/test_huggingface_token_security.py::test_token_is_empty_string_when_not_set` — duplicate-shaped empty-state check of the same shared redaction code path as the api_key file's equivalent.
- `tests/security/test_migration_security.py::test_migrate_project_to_v2_success` — pure happy-path, not itself a security test.
- `tests/security/test_path_injection.py::test_store_project_cover_absolute_path_blocked` — real attack payload but an OR-based assertion that could pass vacuously if a stale file happens to pre-exist.
- `tests/security/test_secret_plugin_settings.py::test_excludes_non_secret_keys` — near-duplicate of the adjacent `test_returns_secret_keys`.
- `tests/security/test_speaker_security.py::test_new_profile_dir_traversal_variant_rejected` — passes for a different reason than its docstring claims (an earlier, unrelated regex gate catches the payload first, not the variant-splitting logic it's meant to protect) — false-confidence test, worth owner attention beyond a simple prune call.
- `tests/utils/test_pathing.py::test_contained_path_returns_path_object` — trivial type-only check, no security payload.
- `tests/utils/test_sanitize_categories.py::test_golden_none_categories_equals_all` — mirrors one source line closely, though it rides on the full golden corpus.
- `tests/utils/test_textops.py::test_text_utility_default_limits_remain_stable`, `test_split_into_parts` — partial import-alias tautology / weak bound assertion respectively.
- `tests/utils/test_textops_cleaning_redos.py::test_stray_space_before_quote_terminal`, `test_sanitize_non_ascii` — exact-duplicate fixtures of assertions already in `test_textops.py`, though paired with CodeQL ReDoS-fix before/after documentation (retains some value).
- `tests/utils/test_textops_extra.py::test_write_chapters_to_folder` — near-duplicate of `test_textops.py`'s version, with one incremental check (exact zero-padded filename).

## Notable KEEP (exemplary, called out across sub-passes)

- `tests/security/test_speaker_security.py::test_update_speaker_settings_traversal_blocked` — genuine defense-in-depth test (forces an upstream layer to return an out-of-bounds path, verifies the independent containment check still blocks it).
- `tests/security/test_cleanup_security.py`, `test_config_security.py`, `test_voice_security.py` — all real, unmocked traversal-payload attacks against production path-handling code; zero flags.
- `tests/utils/test_textops_cleaning_redos.py::TestAdversarialTiming` — textbook real ReDoS regression test: ~50,000-char pathological inputs + a real SIGALRM hard timeout, not just elapsed-time measurement.
- `tests/utils/test_pathing.py`'s traversal-payload tests (`..`, `../../etc/passwd`, absolute paths) — meet the required security bar directly.
- `tests/domain/test_project_backup_bundle.py` — 7 of 12 tests drive real FastAPI + real SQLite + real zip I/O with production-plausible assertions (WAV-only enforcement, filename collision handling).
- `tests/speaker/test_resolution.py::test_v1_flat_storage_is_ignored`/`test_v1_flat_storage_without_v2_fails_resolution` — genuine V1-vs-V2 precedence-rule regression tests.
- `tests/utils/test_textops_bugs_b8_b9.py` (all 10) — genuine edge-case regression tests, zero flags.

## Summary

- **~29 DEFINITE** delete candidates (13 in `tests/core/` alone — the weakest single area found across this entire audit), **~24 DISCUSS** items, out of ~320 total tests reviewed.
- `tests/core/test_launcher_agnosticism.py` is the single clearest, most literal match anywhere in this audit to the owner's original complaint ("tests that just check text exists") — every one of its 5 tests is a static grep with zero code execution.
- The security-specific files (`tests/security/`) are otherwise unusually strong for a security suite — nearly every test drives a real attack payload through unmocked production code; the one clear deletion there is a source-code grep, not a behavior test.
