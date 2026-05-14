# Task List: Engine-Agnostic Conversion

## Phase 1: Directory & Folder Cleanup
- [x] Keep engine test fixtures and tests inside the owning plugin folders.
- [x] Delete the root `engine_tests/` directory.
- [x] Delete `xtts_audio/` transient folder
- [x] Audit `uploads/` and migrate text/covers to project folders
- [ ] Delete `uploads/` (Pending: `/out/covers` compatibility)

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
- [ ] Update `Engine` literal in `app/models.py` to `str`
- [ ] Introduce `TaskType` or `JobKind` in `app/models.py`

## Phase 5: Plugin Implementation Relocation
- [ ] Move `app/xtts_inference.py` -> `plugins/tts_xtts/`
- [ ] Move `app/jobs/handlers/xtts*` -> `plugins/tts_xtts/handlers/`
- [ ] Move `app/jobs/handlers/voxtral.py` -> `plugins/tts_voxtral/handlers/`
- [ ] Implement `parse_progress` and `sanitize_text` in plugin adapters
- [ ] Move resource requirements (GPU/VRAM) to plugin manifests
- [ ] Move `sanitize_for_xtts` logic to `plugins/tts_xtts/`

## Phase 6: Core Orchestration Generalization
- [ ] Implement `JobHandlerRegistry` in `app/jobs/handlers/`
- [ ] Register XTTS/Voxtral handlers in the registry (via plugin init)
- [ ] Update `app/jobs/worker.py` to use generic dispatch via registry
- [ ] Implement `check_output` interface in plugin adapters
- [ ] Update `app/jobs/reconcile.py` to use `engine.check_output(job)`
- [ ] Update `app/engines/behavior.py` to remove all `is_built_in` checks

## Phase 7: API & Routing
- [ ] Rename `mixed.py` -> `composite.py`
- [ ] Update `composite.py` to use `engine.parse_progress` and `engine.sanitize_text`
- [ ] Remove `/{name}/voxtral-voice-id` route in `app/api/routers/voices_actions.py`
- [ ] Update `/out/xtts/{filename}` -> `/out/audio/{filename}` in `app/web.py`
- [x] Generalize mixed-render log messages such as `[voxtral-debug]`.
- [ ] Remove `app/engines.py` synthesis re-exports
- [/] Sanitize `run.sh` and `run.ps1` (Relocated requirements to plugin)
- [ ] Implement generic plugin setup loop in `run.sh`
- [ ] Remove hardcoded `"xtts"` defaults in `app/api/routers/generation.py`
- [ ] Update all frontend URL references to match new generic routes

## Phase 8: State & Metrics Cleanup
- [x] Rename `xtts_cps` -> `engine_cps` in `app/state_performance.py`
- [x] Rename `xtts_render_history` -> `render_history` in `app/state_performance.py`
- [x] Remove `voxtral_enabled` shim from `app/state_settings.py`
- [x] Remove `xtts_speed` migration logic from `app/state_settings.py`
- [x] Remove `voxtral_voice_id` normalization in `app/db/speakers.py`

## Phase 9: Documentation & Final Audit
- [/] Update `README.md` (Generalized XTTS plugin install path)
- [ ] Update `CONTRIBUTING.md` (document plugin lifecycle)
- [ ] Final `grep` for "xtts" and "voxtral" across core `app/`
- [ ] Final test verification: `pytest tests/`

## Deferred Phase: Namespace Rename And App-Behavior Plugins
- [ ] Rename the current engine bundle namespace from `plugins/` to `tts_engines/` once the runtime cutover is stable.
- [ ] Rename any voice/profile bundle namespace that should align with the same naming convention to `tts_voices/`.
- [ ] Reserve a future plain `plugins/` space for non-engine app-behavior extensions once the engine bundle rename is complete.
- [ ] Update docs, plugin templates, and discovery code to distinguish engine bundles from app-behavior plugins.
- [ ] Move engine-owned tests, fixtures, and helper files into the owning engine bundle so XTTS/Voxtral can be extracted as self-contained repos later.
