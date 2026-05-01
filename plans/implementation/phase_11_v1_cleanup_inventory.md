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
| `app/state_performance.py` | `xtts_cps`, `xtts_render_history` | Obsolete Coupling | ETA metrics | Generic `engine_cps` / render history | Medium | Perf Tab check | Slice F: State/Metrics |
| `app/jobs/worker_metrics.py` | `_record_xtts_sample` | Obsolete Coupling | metrics | Generic sample recording | Low | Metrics check | Slice F: State/Metrics |
| `app/api/routers/voices_actions.py` | `/voxtral-voice-id` | Obsolete Coupling | API surface | Remove engine-specific route | Low | Voice Settings check | Slice E: UI Cleanup |
| `app/api/routers/analysis.py` | `sanitize_for_xtts` | Obsolete Coupling | Text analysis | Use plugin `sanitize` hook | Low | Analysis check | Slice D: Utilities |
| `app/textops.py` | `sanitize_for_xtts` | Obsolete Coupling | Text processing | Move to XTTS plugin | Low | Synthesis tests | Slice D: Utilities |
| `frontend/src/api/index.ts` | `enqueueSingle: ... engine: 'xtts'` | Obsolete Coupling | UI enqueue | Use default engine from settings | Low | Enqueue test | Slice E: UI Cleanup |
| `frontend/src/hooks/useVoicesTabState.ts` | `editingEngine: 'xtts'` | Obsolete Coupling | UI state | Use discovery results | Low | Voices Tab check | Slice E: UI Cleanup |
| `app/config.py` | `BASELINE_XTTS_CPS`, `XTTS_ENV_*` | Obsolete Coupling | startup, metrics | Move to XTTS plugin manifest | Low | Boot tests | Slice F: State/Metrics |
| `app/config.py` | `SENT_CHAR_LIMIT`, `SAFE_SPLIT_TARGET` | Obsolete Coupling | UI limits | Move to plugin manifest capabilities | Low | Analysis check | Slice D: Utilities |
| `app/engines/bridge_local.py` | Whole file | Dead Legacy | None (unused) | Delete file | Low | Import checks | Slice A: Cleanup |
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
