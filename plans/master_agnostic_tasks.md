# Task List: Engine-Agnostic Conversion

## Phase 1: Directory & Folder Cleanup
- [x] Keep engine test fixtures and tests inside the owning plugin folders.
- [x] Delete the root `engine_tests/` directory.
- [x] Delete `xtts_audio/` transient folder
- [x] Audit `uploads/` and migrate text/covers to project folders
- [ ] Delete `uploads/` (Deferred: `/out/covers` compatibility and shared-cover migration source)

## Phase 2: Storage Abstraction Layer
- [ ] Implement `app/storage/manager.py` (`StorageManager`)
- [ ] Implement `app/storage/project.py` (`ProjectContext`)
- [ ] Migrate pathing logic from `app/config.py` to `StorageManager`
- [ ] Update `app/api/routers/chapters_assets.py` to use `StorageManager`
- [ ] Update `app/jobs/reconcile.py` to use `StorageManager`
- [x] Remove `XTTS_OUT_DIR` from core runtime config; `AUDIO_OUT_DIR` remains migration-only.

## Phase 3: Declared Plugin Contract
- [ ] Update `docs/plugin-guide.md` to define manifest-declared capabilities, behavior, and worker hooks as the default model.
- [ ] Update `docs/plugin-template/README.md` to present the template as the canonical declared-hook example.
- [ ] Document hook ownership rules in the SDK so new hooks are added through the plugin contract rather than app-side engine branches.
- [ ] Ensure `manifest.json` fields are the source of truth for supported behavior.

## Phase 4: Configuration & Models
- [x] Delete `SENT_CHAR_LIMIT` and `SAFE_SPLIT_TARGET` from core config and preserve them as generic behavior fallbacks.
- [x] Relocate the remaining generic baseline CPS fallback out of core config.
- [ ] Move engine-specific config to plugin manifests
- [x] Update persisted job engine identity to `str`
- [ ] Introduce `TaskType` or `JobKind` if Phase 12 decides the distinction is still needed before release docs

## Phase 5: Plugin Implementation Relocation
- [x] Move `app/xtts_inference.py` -> `plugins/tts_xtts/`
- [x] Move `app/jobs/handlers/xtts*` -> `plugins/tts_xtts/handlers/`
- [x] Move `app/jobs/handlers/voxtral.py` -> `plugins/tts_voxtral/handlers/`
- [/] Implement `parse_progress` and `sanitize_text` in plugin adapters (progress is metadata-driven; sanitize hook pending)
- [ ] Move resource requirements (GPU/VRAM) to plugin manifests
- [x] Move `sanitize_for_xtts` logic to `plugins/tts_xtts/`

## Phase 6: Core Orchestration Generalization
- [ ] Implement `JobHandlerRegistry` in `app/jobs/handlers/`
- [ ] Register plugin handlers in the registry without app-level engine names
- [ ] Update `app/jobs/worker.py` to use generic dispatch via registry
- [ ] Implement `check_output` interface in plugin adapters
- [ ] Update `app/jobs/reconcile.py` to use `engine.check_output(job)`
- [x] Update `app/engines/behavior.py` to remove all `is_built_in` checks

## Phase 7: API & Routing
- [ ] Rename `mixed.py` -> `composite.py`
- [/] Update composite/mixed rendering to use metadata-driven progress and sanitization hooks
- [x] Remove `/{name}/voxtral-voice-id` route in `app/api/routers/voices_actions.py`
- [x] Remove `/out/xtts/{filename}` route from app routing
- [x] Generalize mixed-render log messages such as `[voxtral-debug]`.
- [x] Remove `app/engines.py` synthesis re-exports
- [x] Sanitize `run.sh` and `run.ps1` (Conflict logic moved to plugin; variables generalized)
- [ ] Implement generic plugin setup loop in `run.sh`
- [x] Remove hardcoded `"xtts"` defaults in `app/api/routers/generation.py`
- [x] Update all frontend URL references to match active generic routes

## Phase 8: State & Metrics Cleanup
- [x] Rename `xtts_cps` -> `engine_cps` in `app/state_performance.py`
- [x] Rename `xtts_render_history` -> `render_history` in `app/state_performance.py`
- [x] Remove `voxtral_enabled` shim from `app/state_settings.py`
- [x] Remove `xtts_speed` migration logic from `app/state_settings.py`
- [x] Remove `voxtral_voice_id` normalization in `app/db/speakers.py`

## Phase 9: Documentation & Final Audit
- [/] Update `README.md` (Generalized engine/plugin install path; full release docs moved to Phase 13)
- [ ] Update `CONTRIBUTING.md` (document plugin lifecycle)
- [x] Final focused `grep` for "xtts" and "voxtral" across core `app/` for Phase 11 closeout
- [ ] Final broad test verification: `pytest tests/` before Phase 13 release docs

## Phase 12: Polish And Cleanup
- [ ] Add VCR-style chapter playback controls.
- [ ] Manually verify fixed-but-pending Phase 11 app behaviors.
- [ ] Triage Vite websocket `ECONNRESET` reconnect behavior.
- [ ] Re-check large-book project/chapter load timings.
- [ ] Complete or explicitly defer generic plugin setup loop.
- [ ] Complete or explicitly defer StorageManager, JobHandlerRegistry, `JobKind`/`TaskType`, and mixed/composite naming.
- [ ] Prepare plugin docs and template docs enough for Phase 13 release documentation.

## Deferred Phase: Namespace Rename And App-Behavior Plugins
- [ ] Rename the current engine bundle namespace from `plugins/` to `tts_engines/` once the runtime cutover is stable.
- [ ] Rename any voice/profile bundle namespace that should align with the same naming convention to `tts_voices/`.
- [ ] Reserve a future plain `plugins/` space for non-engine app-behavior extensions once the engine bundle rename is complete.
- [ ] Update docs, plugin templates, and discovery code to distinguish engine bundles from app-behavior plugins.
- [ ] Move engine-owned tests, fixtures, and helper files into the owning engine bundle so XTTS/Voxtral can be extracted as self-contained repos later.
