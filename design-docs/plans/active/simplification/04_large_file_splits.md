# Phase 3 — Large-file splits (along seams, behavior-preserving)

> Map: [00_overview.md](00_overview.md). Files over `code-organization.md` §7's 600-line norm that
> conflate responsibilities. **Split along the seams the audit identified — never mechanically by
> line count.** Each split is pure refactor: same public API, same behavior, suite stays green.
> Interleave with Phase 2: when a file is both an LF split *and* a styling hotspot, **split first**,
> then convert the smaller pieces.

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

### LF-5 — `App.tsx` (564) → extract hooks
**Conflates:** routing, toast state+timing, startup overlay timing, queue-drawer state, the
`/chapter/:id` redirect fetch.
**Split:** `useToast`, `useStartupOverlay`, `useChapterRedirect`. Route table + shell composition
stay. Drops under ~350 lines. **Effort:** M · **Risk:** low.

---

## Backend

### LF-6 — `progress/service.py` (1503, verified 2026-07-02) → emit-gate + kernel
**Conflates (verified seams):** (1) `publish()` + `_build_progress_payload()` public API
(~171–578); (2) `enrich()` §4A math kernel (~652–1054), also called from `ws.py` and the snapshot
handler; (3) the emit rate-limit gate `_claim_emit_slot()`/`_should_emit_unlocked()` (~1178–1382).
**Split:** extract the emit-gate to `progress/emit_gate.py`; confirm `enrich()` is independently
importable/testable (extract to its own module if not). `design-docs/plans/progress_routing_unification/`
already describes this split — follow it. **Do BE-1's `_should_emit` shim removal first.**
**Effort:** L · **Risk:** med — this is hot, recently-stabilized progress code. Keep the RLock
discipline and event routing identical; lean on the existing progress test suite + revert-check.
**Spec:** `progress-presentation.md` `sources:` only if paths change (no version bump for a pure
split that preserves behavior).

### LF-7 — `tts_server/server.py` (1333) → extract plugin-staging module *(done 2026-07-04, `commit b00ed04e`; 1351→914 lines, new `plugin_staging.py` 493 lines; every containment/symlink check moved verbatim, zero behavior change; full suite 2221 passed/3 skipped identical to pre-change; security + zip-install + trust-boundary suites green)*
**Conflates (verified seams):** core synthesis endpoints (`/synthesize`, `/preview`, `/plan`,
~531–815) vs. the plugin import/staging pipeline (zip upload, preview/staging, GitHub preview,
confirm/cancel, `_sweep_orphaned_staging_dirs`, helpers `_normalize_github_repo_url`,
`_reject_staging_symlinks`, `_parse_requirements`, the `_staging` dict + lock — ~850–end).
**Split:** move the staging concern to `app/tts_server/plugin_staging.py`; `server.py` keeps
synthesis + wiring. **Effort:** L · **Risk:** med — security-sensitive (symlink rejection, path
containment). Preserve every containment check exactly; CodeQL must still recognize the pattern
(`security.md`). **Spec:** `system-architecture.md` / `engines-and-plugins.md` if they pin
`server.py` responsibilities — update references, no behavior change.

---

### Phase 3 done-check
Each split is one commit, same public surface, suite green (backend: `pytest -q` incl. plugin
suites; frontend: memory-safe vitest). No file the audit flagged remains over ~600 lines without a
documented reason. Owner visual check for the frontend component splits (LF-2/3/4/5). Specs'
`sources:` lists updated where paths moved.
