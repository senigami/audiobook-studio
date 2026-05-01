# Phase 11: V2-Only Runtime And Engine-Agnostic Cleanup

## Status

Active, in progress on branch `studio2/phase-11`.

Phase 11 is not complete. The first cleanup wave removed the most dangerous Studio 1.x fallback behavior, but follow-up audits found additional engine-name coupling in app-level routing, worker dispatch, storage naming, metrics, UI URLs, frontend assumptions, bootstrap scripts, and compatibility shims. The remaining work should continue in small verified slices, not broad rewrites.

## Objective

Complete the Studio 2.0 runtime cutover by making the managed TTS Server, plugin manifests, plugin schemas, and plugin-declared behavior the product source of truth.

The app should not ask "is this engine X?" when deciding behavior. Core app code should ask for a capability, setting, job kind, storage contract, or plugin behavior. Specific engine names should remain only in plugins, plugin manifests/schemas, plugin-internal adapters, meaningful tests, or explicitly approved migration scripts.

## Why This Phase Exists

Studio 2.0 originally carried v1-era escape hatches while the TTS Server and plugin runtime stabilized. Those escape hatches now create long-term risk:

- users can unknowingly run different runtime paths depending on startup timing or old flags
- failures can be hidden by legacy fallback instead of surfaced as actionable service state
- plugin metadata can drift from app-level metadata and hardcoded constants
- tests can pass by exercising old behavior instead of product behavior
- adding a third engine still requires touching core app files in too many places
- legacy naming in routes, storage, metrics, and frontend URLs makes the architecture look less migrated than it is

Phase 11 is the "commit to the new architecture" pass. It removes silent fallback paths first, then converts app-level engine coupling into behavior-based or registry-based boundaries.

## Already Completed In Phase 11

- Created the Phase 11 inventory and began dependency-ordered cleanup from audited references.
- Removed automatic fallback that mutated `USE_TTS_SERVER` when the TTS Server failed.
- Removed v2 cutover feature flags such as `USE_V2_ENGINE_BRIDGE` and the old feature flag helper.
- Removed wasteful legacy bridge tests that only protected old in-process behavior.
- Consolidated built-in engine metadata around manifest data.
- Routed active render handlers through the Studio 2.0 bridge rather than direct generator calls.
- Added script payload support so batch/chapter synthesis can route through the bridge path.
- Added plugin behavior metadata and helper functions for capability and setting decisions.
- Migrated voice action, voice profile, queue, generation, worker, and state decisions toward plugin behavior checks.
- Added the generic `voice-asset-id` route; the old engine-named route remains a removal target, not a desired compatibility seam.
- Moved old XTTS/Voxtral implementation modules behind adapter package boundaries.
- Generalized legacy dashboard labels and default setting names while preserving existing output storage paths.

## Current Working Definition Of Done

Phase 11 exits only when:

- Studio has one normal production runtime path for synthesis: TTS Server plus plugin/bridge architecture.
- No production code silently reroutes to v1/local synthesis when v2 services fail.
- App-level behavior decisions use plugin behavior metadata, handler registries, job kind, or storage contracts instead of engine-name branches.
- No main app code mentions specific engine names except in explicitly approved migration scripts during the cleanup.
- Remaining engine-name references are limited to plugin identity, plugin-internal implementation, meaningful tests, or explicitly approved migration scripts.
- Legacy/backwards-compatibility shims are removed unless the user explicitly approves a specific exception.
- Frontend and backend agree on generic concepts such as default engine, voice asset, audio output, and job kind.
- The final audit inventory is updated with what was removed, retained, or deferred.

## Guardrails

The Antigravity plans are useful, but execution still needs dependency ordering. These guardrails override the raw task lists:

- Remove engine names from main app code; do not preserve app-level engine-name shims as compatibility features.
- `xtts_audio/` is engine-test residue, not protected project storage. It may be removed after references are migrated or deleted.
- Remove engine-named public routes and frontend callers as part of the hard cutover rather than adding long-lived aliases.
- Remove `voxtral_enabled`, `voxtral_voice_id`, `voxtral_model`, `xtts_speed`, and similar legacy readers unless an explicit migration script is approved for a specific data conversion.
- Do not remove test references to specific engine names when they are testing plugin identity or plugin behavior. Remove existence-only, compatibility-only, or legacy-fallback tests with no product value.
- Do not move large handler systems into `plugins/` until a registry contract exists and is tested. Moving files first would create churn without improving the boundary.
- Do not treat plugin-internal implementation references as app-level coupling. Engine-specific code is allowed inside plugin packages and adapter implementation boundaries.

## Reference Classification Rules

Use this classification for every remaining specific engine-name, v1, or fallback reference.

| Class | Keep? | Meaning | Examples |
| --- | --- | --- | --- |
| Plugin identity | Yes | The engine id, package name, manifest id, schema id, test fixture identity | plugin manifests, plugin schema files |
| Plugin-internal implementation | Yes | Engine-specific implementation hidden behind plugin or adapter boundary | plugin implementation modules |
| Explicit migration script | Only if approved | One-time conversion code that removes old persisted names rather than preserving them indefinitely | focused migration utility |
| Intentional strategy seam | Temporary | A documented performance or orchestration choice while a generic contract is being introduced | optimized registered handler path |
| Test fixture | Yes if meaningful | Uses real engine ids to prove plugin identity, plugin behavior, or migration removal | plugin behavior tests |
| Obsolete coupling | No | Main app behavior branch, route, setting, model, path, metric, or UI URL tied to a specific engine name | engine-named app route or setting |
| Dead legacy fallback | No | Automatic v1/in-process fallback or flags that hide v2 failures | removed `USE_TTS_SERVER` mutation, removed v2 feature flags |

## Remaining Work Slices

### Slice A: Final Reference Audit And Inventory Refresh

Run a read-only audit that classifies remaining references before more edits.

Targets:

- `app/`
- `frontend/`
- `plugins/`
- `tests/`
- `run.sh`, `run.ps1`, setup scripts
- `plans/`, `docs/`, `wiki/`

Search anchors:

- `USE_TTS_SERVER`, `USE_STUDIO_ORCHESTRATOR`, `USE_V2_`, `feature_flags`, `is_feature_enabled`
- specific engine names, engine-named settings, engine-named routes, engine-named output paths
- `engines_voxtral`, `xtts_utils`, `xtts_inference`
- `bridge_local`, `LocalBridgeHandler`, `in-process`, `fallback`, `legacy`, `v1`
- `/out/xtts`, `voice-asset-id`, `voxtral-voice-id`

Deliverables:

- Update `plans/implementation/phase_11_v1_cleanup_inventory.md`.
- Produce a next-slice recommendation with exact files, non-goals, and verification commands.
- Do not make broad edits during this slice.

### Slice B: Behavior Helper Hardening

Remove remaining hardcoded behavior maps in `app/engines/behavior.py` where the plugin registry or manifest can answer the question.

Likely work:

- Replace built-in fallback behavior maps with manifest-backed behavior where possible.
- Remove compatibility fallbacks for historical profiles unless they are replaced by an explicitly approved one-time migration.
- Add tests proving a third/fake plugin can opt into behavior without app code changes.

Verification:

- `./venv/bin/python -m pytest tests/test_engine_behavior.py tests/test_api_engines.py tests/bridge/test_bridge_registry.py tests/test_bridge_tts_server.py -vv`
- `git diff --check`

### Slice C: Job Dispatch Registry Design

The Antigravity plans correctly identify worker dispatch as the next major architectural seam, but it should not start by moving handler files into plugins.

First implementation target:

- Introduce a small `JobHandlerRegistry` or equivalent inside app job infrastructure.
- Register existing handlers from their current locations.
- Make `worker.py` dispatch by job kind, engine id, and declared behavior rather than direct engine-name imports where practical.
- Convert optimized engine-specific handler paths into registered strategies so main app code does not import or branch on engine names.

Non-goals:

- Do not move all handler files into `plugins/` in the first registry slice.
- Do not rename `mixed.py` to `composite.py` until dispatch and tests are stable.

Verification:

- `./venv/bin/python -m pytest tests/test_jobs.py tests/test_api_generation.py tests/test_mixed_handler.py tests/test_voxtral.py -vv`
- `./venv/bin/python -m pytest tests/test_performance_metrics_storage.py tests/test_progress_logic.py -vv`
- `git diff --check`

### Slice D: Plugin-Owned Text, Progress, And Engine Utilities

The core app still has engine-specific utility names because one renderer existed first. Convert these by behavior, not by rename-only churn.

Likely work:

- Introduce generic text sanitization hooks or helper methods that can call plugin behavior.
- Move or wrap `_parse_xtts_progress` behind a plugin/adapter progress parser contract.
- Keep shared text operations in app-level modules only when they are genuinely engine-agnostic.
- Move engine-specific inference scripts only after their plugins can invoke them from the new location and tests prove it.

Verification:

- `./venv/bin/python -m pytest tests/test_textops_xtts.py tests/test_mixed_handler.py tests/test_xtts_plugin_script.py tests/test_xtts_handler.py tests/test_jobs_xtts_extended.py -vv`
- `git diff --check`

### Slice E: Storage And Output Route Abstraction

The plans are right that storage naming is still engine-shaped. This should be a hard cutover, with tests updated to prove project storage is unaffected.

Likely work:

- Introduce a storage/output helper for generic audio outputs.
- Replace engine-named output routes and frontend callers with generic audio routes.
- Remove engine-named output constants and test folders after references are migrated.
- Remove `xtts_audio/`; it is engine-test residue and not project storage.

Non-goals:

- Do not delete user project folders or project-local assets.
- Do not preserve old engine-named routes as permanent aliases.
- Do not keep engine-named constants in main app code after callers are migrated.

Verification:

- `./venv/bin/python -m pytest tests/test_api_utils_extended.py tests/test_api_chapters_extended.py tests/test_jobs.py tests/test_production_ux.py -vv`
- `cd frontend && /opt/homebrew/bin/npx vitest run src/components/chapter src/api`
- `git diff --check`

### Slice F: State, Settings, And Metrics Rename Migration

The raw plans propose deleting compatibility fields. That is the desired direction; do it with explicit conversion tests rather than indefinite readers.

Likely work:

- Make generic settings names canonical in save paths.
- Remove old engine-named settings/profile readers from runtime code.
- If existing data must be converted, add a one-time migration path that rewrites it to generic fields and removes old keys.
- Move render performance naming from engine-specific settings toward per-engine or generic render history.
- Add tests proving old keys are removed or converted, not preserved as active runtime shims.

Verification:

- `./venv/bin/python -m pytest tests/test_performance_metrics_storage.py tests/test_speaker_profiles.py tests/test_api_voices_actions.py tests/test_state_rules.py -vv`
- `git diff --check`

### Slice G: Frontend Engine-Agnostic Cleanup

Frontend references to specific engines should be classified the same way as backend references.

Likely work:

- Replace hardcoded engine-named audio source construction with generic audio routes.
- Replace engine-specific UI variable names when they encode behavior rather than identity.
- Keep test fixture engine ids only where the fixture is intentionally testing plugin behavior.
- Keep visible plugin names where they are labels for installed plugins.

Verification:

- `cd frontend && /opt/homebrew/bin/npx vitest run src/components/chapter src/components/queue src/api`
- `cd frontend && /opt/homebrew/bin/npm run build`

### Slice H: Bootstrap And Documentation Cleanup

Bootstrap scripts and documentation can remain engine-specific only when they are plugin setup sections, not core app requirements.

Likely work:

- Move engine-specific install/venv guidance out of core setup docs and into plugin setup docs.
- Convert bootstrap scripts toward plugin setup discovery only after current one-click startup remains verified.
- Update README/CONTRIBUTING/wiki architecture notes after runtime behavior is actually changed.

Verification:

- Existing app startup path still works.
- Backend focused suite passes.
- Frontend build passes if docs/scripts touch frontend setup.

## Non-Goals

- Do not preserve legacy support or backwards compatibility unless the user explicitly approves a specific exception.
- Do not remove diagnostics, repair tools, or explicit user-triggered recovery actions.
- Do not start Phase 12 until the Phase 11 final audit and hard-cutover removal matrix are complete.
- Do not treat plugin-internal string occurrences of engine names as bugs. Main app occurrences are bugs unless explicitly approved.

## Likely Hotspots

- `app/engines/behavior.py`
- `app/engines/bridge.py`
- `app/engines/bridge_local.py`
- `app/engines/registry.py`
- `app/engines/voice/xtts/`
- `app/engines/voice/voxtral/`
- `app/jobs/worker.py`
- `app/jobs/worker_metrics.py`
- `app/jobs/handlers/`
- `app/jobs/reconcile.py`
- `app/api/routers/generation.py`
- `app/api/routers/voices_actions.py`
- `app/api/routers/chapters_assets.py`
- `app/api/utils.py`
- `app/db/speakers.py`
- `app/state_settings.py`
- `app/state_performance.py`
- `app/config.py`
- `app/web.py`
- `frontend/src/api/`
- `frontend/src/components/chapter/`
- `run.sh`
- `run.ps1`

## Deliverables

- [x] Phase 11 audit inventory created.
- [x] Silent TTS Server fallback mutation removed.
- [x] V2 feature flags removed from active runtime paths.
- [x] Direct generator calls removed from active job handler/orchestration paths.
- [x] Plugin behavior metadata foundation added.
- [x] Voice/profile/action policy migrated toward behavior metadata.
- [x] Legacy XTTS/Voxtral implementation modules moved behind adapter boundaries.
- [x] Legacy dashboard/default labels generalized; engine-named storage remains a removal target under the hard cutover.
- [ ] Final reference audit refresh completed after latest cleanup commits.
- [ ] Remaining main app engine-name references classified using the table above.
- [ ] Behavior helper hardened to rely on manifests/registry instead of built-in fallback maps where safe.
- [ ] Job dispatch registry introduced or explicitly deferred with rationale.
- [ ] Text/progress/plugin utility hooks generalized where behavior is not actually XTTS-only.
- [ ] Storage/output URL abstraction introduced and old engine-named output paths removed.
- [ ] Settings/performance compatibility shims removed or converted through explicit one-time migrations.
- [ ] Frontend hardcoded output URLs and behavior assumptions migrated to generic contracts.
- [ ] Bootstrap/docs updated to describe plugin-first setup accurately.
- [ ] Wasteful tests that only assert legacy existence removed; behavior and migration tests retained.
- [ ] Full backend and frontend verification run or explicitly scoped with residual risks documented.

## Verification Checklist

- [ ] `rg` audit confirms no `USE_TTS_SERVER`, `USE_STUDIO_ORCHESTRATOR`, `USE_V2_`, `feature_flags`, or `is_feature_enabled` active runtime switches.
- [ ] `rg` audit confirms no old app-level implementation module imports remain.
- [ ] Every remaining main app engine-name reference is classified and either removed or explicitly approved.
- [ ] Normal boot starts the managed TTS Server and discovers engines through plugins.
- [ ] TTS Server startup failure produces visible unavailable/degraded state, not local synthesis.
- [ ] Engine list, settings save, verification, test preview, chapter render, and queue render use the Studio 2.0 path.
- [ ] Existing voice profiles use generic settings after conversion; old engine-named keys are not active runtime fields.
- [ ] Engine-named output links and folders are removed after generic routes and callers are verified.
- [ ] Backend focused suites pass for affected areas.
- [ ] Frontend targeted tests and build pass for UI/API URL changes.
- [ ] `git diff --check` passes.

## Exit Gate

Studio no longer has two production runtimes, and core app behavior is engine-agnostic. The managed TTS Server and plugin system are the only normal synthesis path. Failures are surfaced as failures with useful diagnostics. Main app code has no specific engine-name references. Remaining engine-name references are limited to plugin identity, plugin-internal implementation, meaningful tests, or explicitly approved one-time migration scripts.
