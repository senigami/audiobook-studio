# Test Value Audit — Engines/bridge/tts_server/plugins — 2026-07-10

Consolidated from 6 parallel sub-passes: `tests/bridge/` + `tests/engines/` batch A, `tests/engines/` batch B (plugin loader/validation/trust-boundary), `tests/engines/` batch C + `tests/tts_server/`, `plugins/tts_xtts/tests/` batch A, `plugins/tts_xtts/tests/` batch B, `plugins/tts_voxtral/tests/` + `plugins/tts_mixed/tests/`. Cross-checked against the June 2026 `test_audit_engines.md` audit.

Scope: ~65 files, ~660 total test cases reviewed.

## DEFINITE delete candidates

- `tests/bridge/test_bridge_registry.py::test_voice_bridge_rejects_unknown_engine` — patches `RemoteBridgeHandler.synthesize` itself (the exact method `VoiceBridge.synthesize` delegates to with zero added logic) to fabricate the exception it then asserts on. No real engine-id validation code runs. R2 violation: mocks the collaborator that IS the behavior under test.
- `plugins/tts_xtts/tests/test_inference_logic.py` — 3 tests: `test_xtts_inference_guard_raises_on_missing_voice`, `test_xtts_inference_main_key_and_fallback_consistency`, `test_synthesize_one_logic_routing` — each defines a local stand-in function that reimplements the real (nested, unimportable) production logic and asserts it against itself; the real `_synthesize_one`/guard logic in `xtts_inference.py` is never invoked by any of the three.
- `plugins/tts_xtts/tests/test_serve_speakers.py::test_old_key_form_raises_for_list` — constructs the buggy tuple key inline and asserts Python's own TypeError-on-unhashable-list semantics; never calls `build_unique_speakers` or any production code.
- `plugins/tts_xtts/tests/test_speaker_key.py::test_old_lookup_form_raises_for_list_speaker_wav` — same pattern as above, exercises no code from `serve_speakers.py`.
- `tests/engines/test_xtts_segment_grouping.py::TestSegmentGroupingLimit::test_handle_xtts_segments_uses_get_text_chunk_limit` — docstring claims a revert-check that `handle_xtts_segments` resolves its limit via `get_text_chunk_limit`, but the test body never calls `handle_xtts_segments` — it mocks `get_text_chunk_limit`, then manually calls the same mock and feeds the result into `build_segment_groups` directly. Also duplicates the test immediately above it.
- `tests/engines/test_plugin_loader.py::test_xtts_manifest_and_schema_contains_model_v2` — reads `manifest.json`/`settings_schema.json` directly and asserts static field values; never calls `discover_plugins`/`plugin_loader` or exercises how the manifest is actually consumed downstream. Pure manifest-presence-only VACUOUS pattern.

## DISCUSS (borderline, needs a human call)

- `tests/bridge/test_bridge_registry.py::test_voice_bridge_describes_remote_registry_by_default` — relies entirely on an autouse global mock fixture rather than an explicit local one; thin/redundant coverage riding on shared state, though it does verify real factory wiring.
- `tests/engines/test_engines.py::test_run_cmd_stream_heartbeat` — mocks `time.time()` with a fixed call-count sequence to drive a heartbeat branch; exercises real threaded code but the exact-call-count coupling is fragile-adjacent.
- `plugins/tts_xtts/tests/test_speaker_key.py::test_old_lookup_form_misses_for_path_vpdir` — half self-referential (manual dict + raw Path check, no production code), half real (`speaker_key()` call already covered by a sibling test) — largely redundant on top of being partly synthetic.
- `plugins/tts_xtts/tests/test_xtts_cli.py::test_xtts_cli_generate` and `plugins/tts_voxtral/tests/test_voxtral_cli.py::test_voxtral_cli_generate` — both `@pytest.mark.skip` ("requires real env/models"), added ~5 weeks ago as a deliberate, consistent cross-plugin policy (confirmed, not neglected) — flag for owner confirmation the policy still stands rather than treating as dead weight.
- `plugins/tts_xtts/tests/test_warm_worker.py::test_idle_timeout_kills_worker` — uses `time.sleep(2.5)` to wait for an idle-timeout thread; real scenario, fragile/slow wait mechanism (R4-adjacent) — should poll-until-condition instead.
- `plugins/tts_xtts/tests/test_xtts_timing.py::test_xtts_adapter_timing_payload_contains_raw_anchors_and_segments` — two `time.sleep(0.01)` calls purely to force timestamp ordering; minor R4 smell, otherwise real.
- `plugins/tts_xtts/tests/test_textops.py` (all 4 tests) — genuinely tests real Studio-side (`app.utils.text.textops`) merge logic, but appears misplaced inside this plugin's self-contained test tree (predates the Studio 2.0 plugin split) — architectural hygiene issue, not a quality one.
- `tests/engines/test_plugin_loader.py::test_plugin_settings_schema_file_is_exposed_when_engine_lacks_method` — mostly real, but one clause (`"privacy_notice" not in ...`) asserts absence of a key that's never injected anywhere in the codebase — vacuous sub-assertion inside an otherwise-real test.
- `tests/engines/test_plugin_validation.py::TestTemplateManifest::test_template_manifest_has_version_fields` — checks the plugin template's JSON directly rather than running it through the real validator path; disconnected from the contract it's meant to guard.
- `tests/engines/test_studio_plugin_sdk.py::TestContextServiceGroups` — 6 pure passthrough-wrapper tests (update_segment, update_queue_item, wav_to_mp3, get_audio_duration, get_voice_profile_dir, get_voice_settings); textbook VACUOUS shape but the June audit set a precedent treating SDK-boundary-wiring tests as in-scope (catches typos in late-bound `app.*` import paths inside a versioned SDK boundary) — judgment call, not an outright delete.
- `tests/tts_server/test_server_concurrency.py::TestSynthesizeNonBlocking::test_two_concurrent_requests_complete_below_serial_sum` — real async endpoint test, but uses a hard wall-clock elapsed-time budget (< 0.18s) rather than event-based sync; worth a second opinion on CI-load safety.

## Notable KEEP (exemplary, called out across sub-passes)

- `plugins/tts_xtts/tests/test_synthesis_loop_parity.py::test_serve_and_oneshot_produce_identical_audio_and_markers` — rigorous byte-for-byte parity lock between two production code paths, explicit manual R1 fault-injection check documented.
- `plugins/tts_xtts/tests/test_concurrent_inference.py`, `test_warm_worker.py`'s other 2 tests, `test_engine_progress_relay.py::TestEmitStderrAtomicConcurrency` — genuine concurrency tests via `threading.Barrier`/`Event`, including a "sanity check" test proving a fake stream can reproduce corruption without the lock.
- `plugins/tts_voxtral/tests/test_voxtral_segments_bake.py` — paired R1-verified control tests proving `force_rerender` (not some other code path) drives re-render vs. reuse behavior, using the real `group_needs_render` rather than a dumb mock.
- `tests/engines/test_voice_engines_registry_cache.py` + `test_voice_engines_discovery.py` — real regression guards for a previously-shipped concurrency bug, verified line-for-line against the actual thread-local cache implementation.
- `tests/engines/test_plugin_boundary_leak.py::test_plugin_core_is_portable`, `test_plugin_loader.py::TestCallableSignatureAudit` — real AST/signature-audit enforcement of architectural boundaries against the actual production plugin classes.
- `plugins/tts_mixed/tests/test_mixed_handler.py::test_render_segment_passes_voice_profile_dir_to_bridge` — R1-documented regression for a real production bug.
- Entire `plugins/tts_voxtral/` and `plugins/tts_mixed/` batch (69 tests) — zero DEFINITE deletes found; consistently mocks only true boundaries (HTTP client, subprocess, DB, sub-engine bridge).

## Summary

- **8 DEFINITE** delete candidates, **~11 DISCUSS** items, out of ~660 total tests reviewed across ~65 files.
- Overall very strong — the deletions cluster in two specific spots: `tts_xtts`'s `test_inference_logic.py` (3 of its 4 tests reimplement production code rather than calling it) and a scatter of individual self-referential/mislabeled tests elsewhere. `tts_voxtral`/`tts_mixed` came back completely clean (zero deletes across 69 tests) — the newest, most carefully-written plugin test suites in the repo.
