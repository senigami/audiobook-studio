# Master Plan: Engine-Agnostic Conversion

This plan outlines the comprehensive removal of hardcoded engine names (e.g., `XTTS`, `Voxtral`) from the core Audiobook Studio codebase, ensuring that all engine-specific logic is confined to plugin adapters and metadata.

## Declared Plugin Method

The target architecture is not a stub-based plugin interface. It is a declared-hook model:

- `manifest.json` declares capabilities, behavior, worker ownership, and entry points.
- `engine.py` implements the runtime contract for the plugin.
- Optional hooks are only implemented when the manifest declares the capability.
- The core app talks to generic hook surfaces through bridge or registry code.
- The plugin template is the canonical example of the smallest valid plugin contract.

If a capability is not supported, the plugin should declare that explicitly or fail clearly. Silent no-op hooks are not the intended contract.

## Core Objectives
1.  **Remove all hardcoded engine names** from core application logic, models, and constants.
2.  **Generalize directory structures** via a new Storage Abstraction Layer.
3.  **Consolidate engine-specific artifacts** (tests, logs, transient audio) into plugins.
4.  **Eliminate all legacy compatibility shims** related to Phase 5/11.
5.  **Standardize job handling** via a plugin-registered dispatch mechanism.
6.  **Transition to metadata-driven performance metrics** that adapt per-engine.
7.  **Sanitize bootstrap and lifecycle scripts** to remove engine-specific environment logic.

## Deferred Namespace Follow-up

The current `plugins/` folder name is a practical engine-container, not the final long-term namespace.

- Future rename candidate for the current engine bundle area: `tts_engines/`.
- Future rename candidate for the voice/profile data area if needed: `tts_voices/`.
- A later, separate app-behavior plugin system may use the plain `plugins/` name for non-engine extensions inspired by Stable Diffusion-style plugin boundaries.
- Engine-specific tests, fixtures, and helper files should be treated as part of the owning engine bundle and live alongside that bundle rather than in the app root.

This rename is deferred until the runtime cutover and cleanup slices are complete. It should be treated as a separate structural phase, not mixed into the active runtime migration.

---

## 1. Directory & File Restructuring

### [DONE] Plugin-Local Tests
- Engine-owned tests and fixtures now live inside the owning plugin folders.
- The root `engine_tests/` directory is no longer part of the runtime or trusted storage model.

### [PARTIAL] Transient Folders
- [DONE] `xtts_audio/`. This folder contains transient engine test artifacts that have been migrated to plugin-local storage or project-local folders.
- [PARTIAL] `uploads/`. New project text and covers are correctly stored in `projects/{project_id}/{text|cover}/`. The legacy `uploads/covers/` root remains for compatibility during shared-cover migration.

### [DONE] Config Constants
- [DONE] Rename `XTTS_OUT_DIR` to `AUDIO_OUT_DIR` (decommissioned from core config).
- [DONE] The generic baseline CPS fallback has been moved to `app/engines/behavior.py` as `DEFAULT_BASELINE_ENGINE_CPS` (16.7).
- [DONE] `SENT_CHAR_LIMIT` and `SAFE_SPLIT_TARGET` were removed from core config and preserved as generic behavior fallbacks. Engine-specific chunk and split limits now come from plugin manifest behavior metadata.
- [DELETE] `XTTS_ENV_DIR`, `XTTS_ENV_PYTHON`, `XTTS_ENV_ACTIVATE` from `app/config.py`. These belong in the XTTS plugin configuration.

### [NEW] Storage Abstraction Layer
- [NEW] `app/storage/`. Implement a `StorageManager` and `ProjectContext` to encapsulate all path calculations (e.g., `get_project_audio_dir`).
- Move all logic from `app/config.py` that handles nested vs. legacy paths into the `StorageManager`.
- Business logic (reconciliation, API) will interact with `StorageManager.get_asset_path(project_id, chapter_id, asset_type)` instead of using global path constants.

### [MOVE] Plugin Implementation Detail
- [MOVE] `app/xtts_inference.py` -> `plugins/tts_xtts/xtts_inference.py`.
- [MOVE] `app/jobs/handlers/xtts*` and `app/jobs/handlers/voxtral.py` into their respective plugin directories.
- [MOVE] `sanitize_for_xtts` logic to the XTTS plugin.
- [MOVE] `_parse_xtts_progress` and other progress parsers to the plugin adapters (accessible via bridge).
- [MOVE] Resource requirements (GPU, VRAM) from `resources.py` defaults to plugin manifests.

### [DOC] Plugin Template And Hook Contract
- [DOC] `docs/plugin-guide.md` and `docs/plugin-template/README.md` should describe the manifest-declared hook model as the default development pattern.
- [DOC] New plugin authors should treat the template as a concrete reference implementation, not as a stub library.
- [DOC] Any future hook addition should be declared in the manifest and documented in the SDK, not inferred from app-side engine names.

---

## 2. Code Generalization

### [MODIFY] `app/models.py`
- Change `Engine` literal to `str`. Internal task types like `mixed` and `audiobook` should be reclassified as `TaskType` or `JobKind` to distinguish them from synthesis adapters.

### [MODIFY] `app/engines/behavior.py`
- Replace hardcoded `in {"xtts", "voxtral"}` checks with a dynamic `is_engine_available(engine_id)` call.
- All capability checks (standard, segment, bake, mixed, etc.) MUST query the plugin registry or manifest. No hardcoded exceptions.

### [MODIFY] `app/jobs/handlers/mixed.py` (Composite Rendering)
- Rename `mixed.py` to `composite.py` or similar.
- Replace `sanitize_for_xtts` with `engine.sanitize_text(text)`.
- Replace `_parse_xtts_progress` with `engine.parse_progress(line)`.
- [DONE] Replace hardcoded `[voxtral-debug]` with generic render labels.
- Use capability checks (`mixed_rendering`) for engine participation.

### [MODIFY] `app/jobs/worker.py` & `app/jobs/handlers/`
- Implement a generic `JobHandlerRegistry` (Unified Job Handoff).
- The `worker.py` loop will dispatch to the registered handler based on `job.kind` (e.g., `synthesis`, `bake`, `audiobook`).
- Remove all explicit imports of engine handlers from `worker.py`.

### [MODIFY] `app/jobs/reconcile.py` (Plugin-Driven Reconciliation)
- Replace `_output_exists` logic with a generic call to the plugin adapter: `engine.check_output(job)`.
- Core code will only handle the *scheduling* of reconciliation, while plugins define what "finished work" looks like on disk.
- **`voices_actions.py`**: Remove `@router.post("/{name}/voxtral-voice-id")`.
- **`web.py`**: Rename route `/out/xtts/{filename}` to `/out/audio/{filename}` and update the `app.mount` in `web.py`.
- **Log Generalization**: Completed for the audited mixed-render `[voxtral-debug]` tag.
- **`generation.py`**: Remove hardcoded `"xtts"` defaults. Use `DEFAULT_PROFILE_ENGINE` from settings.

---

## 3. State & Metrics Migration

### [DONE] `app/state_performance.py`
- [DONE] Rename `xtts_cps` -> `engine_cps` (stored in settings table).
- [DONE] Rename `xtts_render_history` -> `render_history` (stored in `render_performance_samples` table).

### [DONE] Compatibility Shims
- [DONE] Remove `voxtral_enabled` from `state_settings.py`, `bridge_local.py`, and `tts_server/server.py`.
- [DONE] Remove `xtts_speed` migration logic from `state_settings.py` (quarantined in `legacy_migration.py`).
- [DONE] Remove legacy profile metadata normalization for `voxtral_voice_id` in `app/db/speakers.py`.

### [MODIFY] `app/engines.py` (Legacy Cleanup)
- Strip all `xtts_*` and `voxtral_*` re-exports.
- Remove imports from `app.engines.voice.xtts` and `app.engines.voice.voxtral`.
- Ensure all callers use the `JobHandlerRegistry` or `VoiceBridge`.

### [MODIFY] `run.sh` & `run.ps1` (Bootstrap Sanitization)
- [x] Relocate `requirements-xtts.txt` to `plugins/tts_xtts/requirements.txt`.
- [x] Update `run.sh` and `run.ps1` to use plugin-local requirements.
- [x] Remove remaining hardcoded `XTTS_VENV` references from launchers (Generalized to `TTS_ENV_DIR`).
- [/] Implement a generic plugin setup loop in `run.sh` (Relocated conflict check; generic loop pending).
- [x] Remove `xtts_env_has_conflicts` logic (moved to `plugins/tts_xtts/scripts/check_env.py`).

### [MODIFY] Documentation
- [x] Update `README.md` (Generalized engine environment setup and variable names).
- [ ] Update `CONTRIBUTING.md` to document the plugin-first architecture and how to implement a new engine adapter.

---

## 4. Text Processing & Utilities

### [MODIFY] `app/utils/text_processing.py`
- Rename `sanitize_for_xtts` to `sanitize_text_for_engine`.
- The actual sanitization rules should be requested from the plugin via a `sanitize` capability rather than being hardcoded in the core `app/` folder.

---

## Verification Plan

### Automated Tests
- Run the full suite: `pytest tests/ -vv`.
- Ensure no tests still rely on hardcoded "xtts" or "voxtral" strings unless specifically testing plugin discovery.

### Manual Verification
- Verify that the Dashboard still renders correctly and can enqueue jobs using the default engine.
- Verify that voice profiles can be created and tested without engine-specific errors.
- Check that the project-local `assets/` directory is populated during synthesis.

---

# Implementation Plan Notes: What to Expect

Each phase of the migration is designed to be non-destructive and verifiable. Here is what you can expect during implementation:

### Phase 1: Directory & Folder Cleanup
- **Approach**: Move operations first, then deletions.
- **Notes**: Deletion of `xtts_audio` from active runtime paths is complete. `uploads` cleanup is partial; it remains as a legacy source for `/out/covers` compatibility.

### Phase 2: Storage Abstraction Layer
- **Approach**: Shadow-testing.
- **Notes**: We will implement the `StorageManager` alongside the existing `config.py` constants. We will update callers one by one, verifying that `StorageManager.get_path()` returns the same string as the legacy constant before switching over.

### Phase 3: Configuration & Models
- **Approach**: "Stringify" then "Classify".
- **Notes**: Changing `Engine` from a `Literal` to `str` will be the first step to prevent type-checker errors. Then we will introduce `JobKind` to properly categorize orchestrators vs. synthesisers.

### Phase 4: Plugin Implementation Relocation
- **Approach**: Adapter encapsulation.
- **Notes**: We will move handlers into `plugins/` and expose them via a standardized `PluginAdapter` class. This ensures that the core app only interacts with the `VoiceBridge` interface.

### Phase 5: Core Orchestration Generalization
- **Approach**: Registry-based dispatch.
- **Notes**: The `worker.py` loop will be updated to a "Look-up and Run" pattern. This is the most sensitive part of the migration and will be heavily tested with the 80+ existing unit tests.

### Phase 6: Documentation & Final Audit
- **Approach**: Developer-centric.
- **Notes**: The final documentation will focus on making it easy for a new developer to add a "Third Engine" by dropping a folder into `plugins/`, declaring capabilities and hooks in the manifest, and implementing the SDK contract without touching core app behavior.
