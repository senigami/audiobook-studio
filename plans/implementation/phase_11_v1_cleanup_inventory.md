# Phase 11 V1 Cleanup Inventory

## Status

Refreshed audit checkpoint on 2026-05-01. Slice D (Storage/Output Abstraction) is **Complete**. The application now uses generic `/out/audio/` routes and `AUDIO_OUT_DIR`. Slice C (Relocation) is also **Complete**, with engine handlers moved to `plugins/`.

Phase 11 is now in **Hard Cutover** mode. All main-app engine-name references are technical debt unless strictly internal to a plugin or part of a one-time migration.

## Source Context

- Phase plan: `plans/phases/phase_11_v2_only_runtime_cleanup.md`
- Master plan: `plans/master_agnostic_plan.md`
- Current branch: `studio2/phase-11`
- Hard Cutover Rules:
    - No specific engine names in main app code.
    - No silent v1/in-process fallbacks.
    - `xtts_audio/` is generalized/removed.
    - Legacy storage helpers are for migration only.

## Audit Commands Used

```bash
rg -n "USE_TTS_SERVER|USE_STUDIO_ORCHESTRATOR|USE_V2_|feature_flags|is_feature_enabled|worker_logic|hooks\(|behavior" app plugins frontend tests plans docs
rg -n "xtts|voxtral|voxtral_enabled|voxtral_voice_id|voxtral_model|xtts_speed|xtts_audio|/out/xtts|voice-asset-id|voxtral-voice-id" app plugins frontend tests plans docs
rg -n "bridge_local|LocalBridgeHandler|in-process|fallback|legacy|v1|engine == \"xtts\"|engine == \"voxtral\"" app plugins frontend tests plans docs
```

## Classification Summary

| Classification | Count | Definition |
| --- | --- | --- |
| **Plugin Internal** | 45 | Allowed inside `plugins/` and `app/engines/voice/*` adapters. |
| **Obsolete Coupling** | 38 | Hardcoded engine logic in main app (Performance state, API, UI). |
| **One-Time Migration** | 5 | Scripts/logic converting old persisted names/storage to v2. |
| **Intentional Strategy** | 4 | Registry-based dispatch and capability checks (no engine names). |
| **Dead Legacy Fallback**| 2 | Severed v1 paths like `bridge_local.py`. |
| **Wasteful Test** | 120+ | Tests asserting hardcoded engine behavior or local fallback. |

## Refreshed Inventory

| Path | Reference | Classification | Runtime impact | Desired outcome | Risk | Verification | Recommended Slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `app/state_performance.py` | `engine_cps` dictionary | Intentional Strategy | Metrics | Generic engine-id metrics | Low | Perf Tab check | COMPLETED |
| `app/jobs/worker_metrics.py` | `record_engine_sample` | Intentional Strategy | Metrics | Generic sample recording | Low | Metrics check | COMPLETED |
| `app/api/routers/analysis.py` | `sanitize_text` | Intentional Strategy | Utilities | Use engine-specific limits | Low | Analysis check | COMPLETED |
| `app/textops.py` | `sanitize_text` | Intentional Strategy | Utilities | Plugin-compatible sanitization | Low | Synthesis tests | COMPLETED |
| `app/config.py` | `BASELINE_ENGINE_CPS` | Intentional Strategy | Metrics | Generic baseline | Low | Boot tests | COMPLETED |
| `app/config.py` | `XTTS_ENV_*` | Plugin Internal | startup | Moved to XTTS engine adapter | Low | Boot tests | COMPLETED |
| `app/config.py` | `SENT_CHAR_LIMIT` | Intentional Strategy | Utilities | Moved to plugin manifest | Low | Analysis check | COMPLETED |
| `app/engines/bridge_local.py` | Cleanup | Dead Legacy | None | Logic removed/Genericized | Low | Import checks | COMPLETED |
| `app/db/speakers.py` | `voxtral_voice_id` normalization | One-Time Migration | Data upgrade | Retain for compatibility | Low | Database tests | RETAIN |

## Completed Slices

### Slice D (Storage/Output Abstraction) - 2026-05-01
- [x] Renamed `XTTS_OUT_DIR` to `AUDIO_OUT_DIR` in `app/config.py`.
- [x] Migrated `/out/xtts/` to `/out/audio/` in backend and frontend.
- [x] Generalized audio output discovery and asset serving.

### Slice C (Relocation) - 2026-05-01
- [x] Moved `xtts.py`, `voxtral.py`, `mixed.py` to `plugins/`.
- [x] Established manifest-driven handler discovery.

### Slice B (Job Handler Registry) - 2026-05-01
- [x] Refactored `worker.py` for dynamic dispatch via `JobHandlerRegistry`.

### Slice F (State, Settings, And Metrics) - 2026-05-01
- [x] Renamed `xtts_cps` to `engine_cps` in state and DB settings.
- [x] Replaced `xtts_render_history` logic with generic `render_history` and SQL-backed metrics.
- [x] Migrated `_record_xtts_sample` to generic `record_engine_sample`.
- [x] Verified engine-agnostic performance tracking.
- [x] Renamed `BASELINE_XTTS_CPS` to `BASELINE_ENGINE_CPS` globally.
- [x] Removed `voxtral_enabled` and other engine-named settings.

### Slice D (Utilities) - 2026-05-01
- [x] Renamed `sanitize_for_xtts` to `sanitize_text`.
- [x] Moved `SENT_CHAR_LIMIT` and `SAFE_SPLIT_TARGET` to plugin manifests.
- [x] Refactored `analysis.py` to use manifest-driven text limits.

## Remaining Risks
- **Performance History Migration**: Moving from `xtts_cps` to generic metrics must preserve existing user data accurately.
- **UI Label Drift**: Frontend still has hardcoded "XTTS" and "Voxtral" strings in some labels; these should come from plugin `display_name`.
- **Test Coverage**: Many tests still use `"xtts"` as a literal. These should be updated to use engine IDs from discovery or fixtures.

### Slice F (State, Settings, And Metrics) - 2026-05-01
- [x] Renamed `xtts_cps` to `engine_cps` in state and DB settings.
- [x] Replaced `xtts_render_history` logic with generic `render_history` and SQL-backed metrics.
- [x] Migrated `_record_xtts_sample` to generic `record_engine_sample` available to all plugins.
- [x] Verified engine-agnostic performance tracking with tests.
- [x] Renamed `BASELINE_XTTS_CPS` to `BASELINE_ENGINE_CPS` globally.
