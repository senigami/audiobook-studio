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
| **Plugin Internal** | 52 | Allowed inside `plugins/` and `app/engines/voice/*` adapters. |
| **Obsolete Coupling** | 8 | Hardcoded engine logic in main app (Legacy Dashboard, UI). |
| **One-Time Migration** | 12 | Scripts/logic converting old persisted names/storage to v2. |
| **Intentional Strategy** | 15 | Registry-based dispatch and capability checks (no engine names). |
| **Dead Legacy Fallback**| 0 | Severed v1 paths like `bridge_local.py` (Removed). |
| **Wasteful Test** | 0 | Tests asserting hardcoded engine behavior or local fallback (Pruned/Refactored). |

## Refreshed Inventory

| Path | Reference | Classification | Runtime impact | Desired outcome | Risk | Verification | Recommended Slice |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `app/state_performance.py` | `xtts_cps` normalization | One-Time Migration | Metrics | State normalization during pop | Low | Boot tests | COMPLETED |
| `app/api/routers/voices_actions.py` | `voice-asset-id` route | Intentional Strategy | API | Behavior-based generic route | Low | Voice Settings check | COMPLETED |
| `tests/test_api_final_validation.py` | `XTTS_OUT_DIR` reference | Wasteful Test | None | Remove/Rewrite | Low | Test run | Slice H: Test Cleanup |
| `tests/test_api_tts_api.py` | `XTTS_OUT_DIR` monkeypatch | Wasteful Test | None | Remove/Rewrite | Low | Test run | Slice H: Test Cleanup |
| `app/dashboard_templates.py` | Legacy Dashboard | Obsolete Coupling | UI | Delete once v2 dashboard is parity | Medium | Dashboard check | Slice E: UI Cleanup |
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

### Slice G (Audit) - 2026-05-01
- [x] Audited engine-name coupling across `app`, `plugins`, `frontend`.
- [x] Classified findings into Internal vs Obsolete vs Strategy.
- [x] Identified wasteful tests relying on removed `config.py` constants.
- [x] Confirmed `xtts_cps` and `xtts_render_history` are only present in migration logic.

### Slice H (Test Cleanup and Dead Legacy Removal) - 2026-05-01
- [x] Deleted `app/engines/bridge_local.py` (no longer used by agnostic runtime).
- [x] Removed `bridge.local` fallback from `/engines` endpoint.
- [x] Pruned wasteful legacy tests in `test_api_final_validation.py` and `test_api_tts_api.py`.
- [x] Fixed broken imports and patches in `test_xtts_handler.py`.
- [x] Verified 100% pass rate for relevant test suites.

### Slice I (Frontend Agnosticism) - 2026-05-01
- [x] Refactored `voiceProfiles.ts` to remove hardcoded engine names and 'xtts' fallbacks.
- [x] Agnosticized default engine selection in `GeneralSettingsPanel`.
- [x] Removed hardcoded engine filters from `VoicesTab`.
- [x] Generalized indeterminate progress logic in `jobSelection.ts` and `QueueItem.tsx`.
- [x] Replaced hardcoded engine verification messages in `EngineCard`.
- [x] Updated `Engine` and `VoiceEngine` types to be discovery-driven strings.
- [x] Cleaned up obsolete `debugVoxtral.ts` and generalized test error messages.

## Remaining Risks
- **Test Drift**: Some integration tests might still use engine literals like `"xtts"`. These should eventually be parameterized, though the runtime itself is now agnostic.
- **Plugin Metadata Quality**: The UI now relies heavily on `display_name` from plugins; if a plugin provides a poor label, the UI will reflect it.
