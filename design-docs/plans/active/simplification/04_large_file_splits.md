# Phase 3 — Large-file splits (along seams, behavior-preserving)

> Map: [00_overview.md](00_overview.md). Files over `code-organization.md` §7's 600-line norm that
> conflate responsibilities. **Split along the seams the audit identified — never mechanically by
> line count.** Each split is pure refactor: same public API, same behavior, suite stays green.
> Interleave with Phase 2: when a file is both an LF split *and* a styling hotspot, **split first**,
> then convert the smaller pieces.

**Done:** LF-5 (`App.tsx`, `fc02e769`), LF-7 (`tts_server/server.py` → `plugin_staging.py`,
`b00ed04e`), and the emit-gate half of LF-6 (`8d2ee030`). Still open: LF-1, LF-2, LF-3, LF-4, and
the `enrich()` half of LF-6 (see below).

---

## Frontend

### LF-1 — `useStudioChapter.ts` (915, verified 2026-07-02) → focused sub-hooks
**Conflates:** chapter load, assignment/paint, playback, render-group counting, status/queue-hold,
commit/resync actions, deferred updates, handoff queue, debug instrumentation.
**Split:**
- `useStudioStatus` — owns `useChapterStatus` (after DC-1a extraction) + hold timer.
- `useStudioActions` — commit / resync / generate.
- `useStudioPlaybackSync` — `useChapterPlayback` + scope toggle.
`useStudioChapter` becomes a thin composer returning the same shape.
**Depends on:** DC-1a (the `useChapterStatus`/types extraction). **Effort:** M · **Risk:** med
(central live hook — lean on its existing tests; add characterization tests for any seam that lacks
coverage *before* splitting).

### LF-2 — `EngineCard.tsx` (792) → composition + parts
**Conflates:** title/badge row, settings `JsonSchemaForm`, calibration chip, dev-mode raw-JSON +
log console, action menu, trust modal.
**Split:** `EngineSettingsForm`, `EngineCalibrationSection`, `EngineDevPanel`. `EngineCard` becomes
a shell. Move `PluginTrustModal` ownership up to `EnginesPanel` (it imports the modal too) — card
fires a callback instead of owning open/close. **Effort:** M · **Risk:** low.

### LF-3 — `PredictiveProgressBar.tsx` (754) → extract render + lane
**Conflates:** lane-migration animation loop, ETA display, status-text variants
(terminal/live/queued/preparing), checkpoint-mode branching, debug snapshot, JSX.
**Split:** `ProgressStatusText` (status variants), `ProgressEtaLabel` (eta row),
`usePredictiveProgressLane` (animation/lane state). Pure math already lives in the helpers file.
Brings the main file under ~400 lines. **Depends on:** QW-5 (delete the obsolete engine stub first).
**Effort:** M · **Risk:** med — this component is governed by `progress-presentation.md`; preserve
its contract exactly and keep `sources:` accurate. Heavy existing test coverage helps.

### LF-4 — `MetadataEditorModal.tsx` (693) → extract inline widgets
**Conflates:** 5 unexported inline components — `OneSelect`, `ManySelect`, `TagsInput`,
`IconUpload`, plus a chip helper. **Split:** move each into
`pages/Voices/components/metadata/`; modal drops to ~200 lines and the widgets become unit-testable.
**Effort:** M · **Risk:** low. (Also a styling hotspot #2 — split first, then ST-3.)

### LF-5 — `App.tsx` → extract hooks — DONE (2026-07-04, `fc02e769`; 630→560 lines)
Extracted `useToast`/`useStartupOverlay`/`useChapterRedirect`; route table + shell composition
retained; full frontend suite + all `App.test.tsx` cases green, unmodified.

---

## Backend

### LF-6 — `progress/service.py` (1503) → emit-gate + kernel — emit-gate DONE, `enrich()` OPEN
Emit-gate half done (2026-07-04, `8d2ee030`; 1503→1283 lines): `_claim_emit_slot` /
`_should_emit_unlocked` / `_apply_progress_regression_guard` moved to `progress/emit_gate.py` as
`EmitGateMixin`, same lock instance and attribute names; progress suite green. Do BE-1's
`_should_emit` shim removal first (done).

**Still open — extract `enrich()`:** the ~450-line §4A math kernel (also called from `ws.py` and the
snapshot handler) was **deliberately deferred**. It is dense with numbered historical bug fixes
(FIX 2/3/6, job-47213119, Task 006-A/006-B, §4A.x cross-references) that a prior dedicated effort
(`design-docs/plans/_archive/progress_routing_unification/`) had to carefully unwind. A solo
mechanical cut-paste risks a transcription error subtle enough that "tests still pass" wouldn't
catch it — this half needs a session with closer supervision, not a rushed bundle into a general
cleanup sweep. **Risk:** med. **Spec:** `progress-presentation.md` `sources:` only if paths change.

### LF-7 — `tts_server/server.py` → extract plugin-staging module — DONE (2026-07-04, `b00ed04e`)
Staging pipeline moved to `app/tts_server/plugin_staging.py` (1351→914 lines, new module 493 lines);
every containment/symlink check moved verbatim, zero behavior change; full suite + security /
zip-install / trust-boundary suites green.

---

### Phase 3 done-check
Each split is one commit, same public surface, suite green (backend: `pytest -q` incl. plugin
suites; frontend: memory-safe vitest). Owner visual check for the frontend component splits
(LF-2/3/4). Specs' `sources:` lists updated where paths moved.
