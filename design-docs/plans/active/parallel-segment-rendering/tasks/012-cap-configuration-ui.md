# Task 012 — Cap configuration UI (global stepper + per-engine override)

Status: complete — 2026-07-11 (manual restart verification below still pending owner)

Risk: multi-file

## Goal

Upgrade the existing binary 1/2 concurrency toggle in Settings to a real numeric stepper, and add a per-engine cap override control to each `EngineCard`, closing the exact confusion diagnosed this session: a manifest edit to `max_concurrent_workers: 4` had no effect because the actual enforced cap is `min(tts_parallel_cap setting, manifest ceiling)`, and `tts_parallel_cap` only had a 1↔2 UI toggle while `tts_engine_caps` (the per-engine override) had zero frontend consumer at all.

## Why this matters

This closes real, diagnosed user confusion (this session's conversation) and is also the design doc's explicitly-named "Power controls" item (per-engine worker count sliders, `10-phase2-render-monitor.md:116`).

## Exact files

- `frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx` (existing binary toggle, lines ~55-73 `updateParallelCap`, ~259-270 the `SettingCard`)
- `frontend/src/pages/Engines/components/EngineCard.tsx` (new per-engine override control)
- Possibly `frontend/src/api/index.ts` (optional: a shared `updateSettings` helper, see note below)

## Current shape (verified)

- `GeneralSettingsPanel.tsx` already has `updateParallelCap(cap)` — a raw-JSON `fetch('/api/settings', {headers:{'Content-Type':'application/json'}, body: JSON.stringify({tts_parallel_cap: cap})})`, because `POST /api/settings` (`app/api/routers/system.py:210-217`) **only parses `tts_parallel_cap`/`tts_engine_caps` from the JSON-body branch**, not the form-encoded branch other settings use (`updateBooleanSetting`/`updateStringSetting` are form-encoded — do not copy those for this task).
- The existing `SettingCard` toggles ONLY between 1 and 2 (`(settings?.tts_parallel_cap ?? 1) > 1 ? 1 : 2`).
- `tts_engine_caps` (`Settings` type, `frontend/src/types/index.ts:454-455` — corrected 2026-07-11, was cited as 442-443) is fully wired server-side (`resolve_effective_cap`, `app/orchestration/scheduler/cap_settings.py:89-107,119-156`) but has **zero frontend consumer** anywhere.
- `EngineCard.tsx` already has an established pattern for per-engine actions (Verify, Run Test, Install Deps, calibration) at lines ~294-409 to extend — but its existing `handleSaveSettings`/`api.updateEngineSettings` (line ~95-113) is a **different store** (the plugin's own manifest-declared `settings_schema`, routed via the voice-bridge) — do NOT reuse that call for this task; it must call the generic `POST /api/settings` with `{tts_engine_caps: {...}}`, same shape as `updateParallelCap`.
- The manifest ceiling is already available client-side with no new backend field: `TtsEngine.behavior?.max_concurrent_workers` (`frontend/src/types/index.ts:58`, populated from `app/engines/models.py:136`).
- **Corrected in independent sign-off review — `EngineCard` does NOT already receive `settings` as
  a prop.** `EnginesPage.tsx` currently receives only `startupReady`/`onRefresh`/`onShowNotification`
  (verified) — `App.tsx` threads a `settings={initialData?.settings}` prop into five other routes
  but **not** into `EnginesPage`. There is no existing settings context either. **This means the
  per-engine control (point 2 below) requires new prop-plumbing through three files —
  `App.tsx` → `EnginesPage.tsx` → `EnginesPanel.tsx` → `EngineCard.tsx` — not just a read from an
  already-threaded prop.** Do this plumbing as part of this task; it's a small, mechanical prop-drill,
  but do not assume (as an earlier draft of this file incorrectly did) that `settings` is already
  available at `EngineCard`.

## Target shape

1. **Global**: replace the binary toggle in `GeneralSettingsPanel.tsx` with a numeric stepper/input (reasonable range, e.g. 1 to some sane ceiling like 8, matching `MAX_GLOBAL_CONCURRENT_SYNTHESIS` backstop already in `resources.py:44-46`), still calling `updateParallelCap`'s existing raw-JSON-fetch shape (just changing the input UI, not the write mechanism). This half genuinely needs no new plumbing — `GeneralSettingsPanel` already receives `settings`.
2. **Per-engine**: add a small control to each `EngineCard` — a numeric input or stepper for that engine's `tts_engine_caps[engine_id]` override, displaying `engine.behavior.max_concurrent_workers` as the visible ceiling/label ("up to N — engine limit"), clamping input client-side to that ceiling (M5 in `01-map.md` — never let the UI accept a value the backend will silently reclamp). This half needs the `App.tsx → EnginesPage → EnginesPanel → EngineCard` prop-plumbing described above.
3. The global control reads its current value from the existing `settings` prop already threaded to `GeneralSettingsPanel`; the per-engine control reads it from the new prop this task adds per point 2.

## Steps

1. Read `GeneralSettingsPanel.tsx` fully; replace the toggle with a numeric input, keeping `updateParallelCap`'s exact fetch shape.
2. Read `EngineCard.tsx` fully; add a new prop (or read from an already-available context) for the current `tts_engine_caps` value and a save handler.
3. Write the per-engine save handler as a small raw-JSON fetch to `POST /api/settings` with `{tts_engine_caps: {...existing, [engine.engine_id]: newValue}}` — merge with existing overrides, don't clobber other engines' settings.
4. Add client-side clamping to `engine.behavior?.max_concurrent_workers` on both controls (M5).
5. Consider (not required, but recommended given now TWO places write this pattern): extract a small shared `api.updateSettings(partial)` helper in `frontend/src/api/index.ts` used by both `GeneralSettingsPanel` and `EngineCard`, reducing duplicated raw-fetch code. If skipped, note why in the task report (e.g., scope discipline).

## Acceptance criteria

- [x] Global cap is a real numeric stepper, not a binary toggle, writing via the existing JSON-body pattern.
- [x] Each `EngineCard` has a per-engine cap override control, clamped to that engine's manifest ceiling, displayed to the user.
- [x] Neither control ever silently accepts a value the backend will reclamp — the UI's own max matches `resolve_effective_cap`'s ceiling logic.
- [x] Saving either control round-trips correctly (confirm via the settings response, which already returns the redacted full settings object per `system.py:252`).
- [x] `npm -C frontend run test -- --run`, lint, build clean. Light/dark verified (uses `var(--*)` tokens throughout, no hardcoded colors).
- [ ] **Not yet done — requires a running instance.** Manual restart verification (XTTS manifest=4, per-engine override=4, restart, confirm 4 concurrent renders). UI now carries a "takes effect on next app restart" note per the task's own suggestion, since `WarmWorkerManager` still caches its cap at first use (unchanged by this task, per task 014's scope).

## Map links

Part N in `01-map.md`'s Phase 2 section. Invariant M5. Risk R-H (both controls must use the JSON-body fetch pattern, not form-encoded).

## Dependencies

None — fully independent of 008-011, 013.

## Out of scope

Do not fix the `WarmWorkerManager`'s process-restart-required caching behavior in this task — that's a separate, deeper backend change (removing the `@lru_cache`/lazy-singleton freeze) not scoped here; if the owner wants that fixed too, it should be its own task. This task only makes the *setting* itself configurable and honest about its ceiling.

**Added 2026-07-11 — that deeper fix is now [task 014](014-live-cap-admission.md).** It closes the gap this task deliberately leaves open: today, changing `tts_parallel_cap`/`tts_engine_caps` (even via this task's new UI) has no live effect on already-running/queued work because the cap is frozen into each `ResourceClaim` at construction and `EngineClassSemaphore` is grow-only. 014 is purely additive to this task — it does not require rewriting this task's UI, and this task's raw `POST /api/settings` write path keeps working unchanged. Optional follow-up once 014 lands: switch this task's fetch calls to 014's new `PUT /api/engines/{engine_id}/concurrency` endpoint instead of the raw settings blob, since it validates against the manifest ceiling server-side with a proper 422 instead of a silent reclamp — not required, but worth doing in the same pass if convenient.
