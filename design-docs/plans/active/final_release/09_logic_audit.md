# 09 — Logic Error & Redundancy Audit

Code-verified findings from a 2026-06-10 audit of the backend (`app/`, `plugins/`) and frontend
(`frontend/src/`). Owner policy applies throughout: legacy code is deleted, not preserved; only
the v1→v2 migration path survives.

## Shipped (all fixed, see commit history for detail)

- **Backend — Critical (B1–B4):** broadcast race in `put_job`; `previous_status` clobbered in
  `update_job`; chapter status wrongly flipped to `unprocessed` in reconcile; unsynchronized
  `_cancelled_tasks` read in `cancel_check`.
- **Backend — Likely bugs (B5–B11):** terminal-reset discarding caller-supplied values;
  self-identical fallback path in the Voxtral adapter; double profile-dir resolution divergence;
  paragraph breaks destroyed by the sentence splitter; `pack_text_to_limit` emitting oversized
  chunks; bare `except: pass` in progress handlers; live HTTP call on every registry read.
- **Frontend — Critical (F1–F5):** socket listener churn dropping live events; WebSocket
  reconnect leak/stale URL; events dropped during bootstrap hydration; concurrent hydrations
  clobbering each other on reconnect; unchecked `res.ok` on core fetches.
- **Frontend — Likely bugs (F6–F9):** ref mutation during render in `PredictiveProgressBar`;
  untracked `showToast` timeout; duplicate identical `getVal` reads; duplicated terminal-field-
  nulling logic between `useQueueSync`/`useJobs`.
- **Dead code (D1–D3):** obsolete `predictiveProgressBarEngine.ts`, unused
  `useSegmentProgressLifecycle.ts`, unconditional-stub `_load_plugin_engines` — all deleted.
- **Redundancy (R1–R3):** duplicated `_ensure_plugin_package_hierarchy` extracted to
  `studio_plugin_sdk`; duplicated adapter helpers resolved via the shared SDK base; Voxtral
  `synthesize`/`preview` staging blocks extracted into `_run_voxtral_generate`.
- **Addendum — queue/segment progress pipeline (B12–B13, F10–F13):** segment-group join
  separator mismatch; inconsistent backward-detection gating in `PredictiveProgressBar`;
  unreachable duplicate ETA branch; stale "no-op" comment on `evidenceWeightFraction`; unbounded
  `progressMemory` map; contradictory broadcast-suppression flags documented.
- **Addendum 3 — canonical specs pass (B18–B20):** restart recovery was a silent no-op
  (`list_jobs_by_status` didn't exist) — fixed with startup wiring + gate + dedup; XTTS grouper
  now reads the manifest chunk limit instead of a hardcoded constant; `requeue()` now uses the
  standard terminal-reset broadcast path.
- **Addendum 2 — full test audit (F14–F15, B14–B17):** `ScriptView` crash on undefined
  `data.paragraphs` fixed + regression test; `useInitialData` now surfaces fetch failure instead
  of an infinite spinner; `test_voice_bridge_...` and the resource-gate flaky test both
  investigated and found already covered by upstream fixes (no code change needed); `/tmp/*.db`
  fixture paths migrated to `tmp_path`.

## Still open

- [ ] **D4.** Already tracked in doc 06: `api/client.ts`, `api/queries/index.ts`, `shared/*`
  stubs, `.burger` CSS — cross-check they're covered before closing this doc.
- [ ] **R4.** Input styling defined four ways — `frontend/src/theme/components.css:216-249,384-399`
  + `GlassInput.tsx:53-66` inline overrides. Owner confirmed `.form-input` + `GlassInput` as
  canonical on 2026-06-14; delete `.input-field`, `.input-group input`. (Owned by doc 06; listed
  for traceability.)
- [ ] **R5.** `components/VoicesModals.tsx` pure forwarding wrapper over `pages/Voices/components/*`
  modals — remove the wrapper, render sub-modals in `VoicesPage.tsx`. (Owned by doc 06.)
- [ ] **R6.** `useQueueSync` + `useJobs` both subscribe to `jobs.lifecycle`/`queue.items`/
  `chapters.progress` with parallel overlay logic — longer-term: one live-overlay store consumed
  by both views (F9's shared `applyTerminalReset` helper was the immediate fix).

## Verification gate for this doc

- [ ] `pytest` green after backend fixes; new regression tests for B2, B3, B8, B9 included.
- [ ] `cd frontend && npm run build && npm test` green after frontend fixes.
- [ ] grep checks: no `except: pass` (bare) under `app/` or `plugins/`; no unchecked `res.json()`
      in `frontend/src/api/index.ts`.
