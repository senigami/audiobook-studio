# Studio 2.0 Work Order

Epic-level checklist with individual tasks indented beneath each epic. One line per task — full detail lives in the linked files.

`👁 VISUAL CHECK` markers call out places where human eyes are required. Tests verify code; they cannot verify what you see.

Index: [README.md](README.md) · Master roadmap: [master_fix_plan/README.md](master_fix_plan/README.md)

---

## Division of Labor / Parallelization Map *(verified against code 2026-07-02)*

> How the checklist below splits across parallel agents/orchestrator dispatch. Verified against the
> tree, not copied from planning docs (those have drifted before). Legend: **CP** = critical path ·
> **prep** = safe to build dark now, integration-gated · **∥** = fully parallel-safe now.

### Lane / dependency diagram

```
CP (serial):  W-MIX-LA 007 ✓ CLEARED ──► W-PAR 002 ─► 003 (keystone) ─┬─► 005 ─┐
                  (007a+007b done 2026-07-02)   │ cap>1 owner-gated │        ├─► 007
                                                 └── 004 DONE(dark)  └─► 006 ─┘
                                                             │ prep buildable now
∥ lanes (zero overlap w/ CP, run concurrently right now):
  L-SIMP   M3/005 subsets: ST-1/2, LF-2/3/4/5, BE-2/3/5, PL-1/3/5   (frontend + plugin SDK)
  L-TAX    M4/007 taxonomy: G1–G6 (language/style only; accent shipped)
  L-DOC    Stage-6 wiki/SP9 · doc-01 corrections
  L-SEC    009 npm audit re-run (hygiene, release-gate)
```

### Contested surfaces — serialize these (line counts verified 2026-07-02)

| File | Claimants | Required order |
|---|---|---|
| `app/orchestration/scheduler/orchestrator_helpers.py` (1,563 lines) | W-PAR 002/003 · 005 heartbeat · any BE cleanup | **003 owns it** — the `_dispatch` closure is L88→~L1548 (~1,460 lines, one single-active blob). 002 touches it lightly; 005 adds heartbeat *after* 003. No BE agent here until 003 lands. |
| `app/orchestration/progress/service.py` (1,283 lines) | W-MIX-LA ETA fix (`4f78cc7b`/`291872bc`) · W-PAR 002/006 aggregation · 005 LF-6 split | **⚠ active-edit hazard for the remaining `enrich()` extraction.** LF-6's emit-gate half is done (`8d2ee030`, gate re-verified clear 2026-07-04 — last ETA-lane commit was `dc5b13ea`). The rule still applies to any future edit here: don't fire a splitter/ETA agent at this file while the other kind is live. |
| `app/orchestration/tasks/synthesis.py` (415 lines) | W-PAR 002 (split into Chapter/Segment tasks) | 002 owns it. `_manifest_resource_claim` (L29-100) already derives the claim from the manifest — no other agent edits. |
| `frontend/src/pages/Book/studio/useStudioChapter.ts` (915 lines) | 004-W1/RST-8 · W-PAR 006 (single→Set) · 005 LF-1 split · art-program | RST-8 exports first → **W-PAR 006 generalizes `chapterRenderActiveSegmentId`→Set** → LF-1 split → art-program. 006 and LF-1 must not run concurrently. |
| `ChapterHeader.tsx` (615 lines) | W-PAR 006 (multi-active props) · 005 file-split (last oversized target) | 006 threads `activeSegmentsMap` first; defer the split until after. |
| `app/api/ws.py` (L374-413) | W-PAR 003 (done) → 005 (R-F rework, deferred) | 003 added the additive `active_segments_map` passthrough only and left the transition-based `SEGMENT_SAVED` emission unchanged (correct at N=1). 005/enable-gate owns replacing it with per-child completion emission once fan-out > 1 is wired. |
| `plugins/` paths | 005 PL-consolidation · 006 rename · 010 extraction | PL-* → 006 rename (alone, widest blast radius) → 010. |

### New usability lane — Library / chapter import

- [~] **L-LIB 001** — Project create series combo box, existing-series suggestions, and next-number hint — [plan](active/library_project_usability/README.md)
- [~] **L-LIB 002** — Optional series position field and series-aware sorting — [plan](active/library_project_usability/README.md)
- [~] **L-LIB 003** — Chapter import drag-and-drop with multi-file support for already-supported formats only — [plan](active/library_project_usability/README.md)
- [~] **L-LIB 004** — Spec updates, tests, and master task accounting — [plan](active/library_project_usability/README.md)

### Book tab front door (design critique follow-through) — DONE 2026-07-09

Phase 1 of the critique (default-tab fix, `--text-subtle` contrast fix, stepper target-size fix, copy cleanup) plus all 8 Big Bet tasks below are complete: build/typecheck/lint/pytest/ruff green, one adversarial review round (zero blockers), live dev-preview verification of the North Star hero layout, the Continue Listening play flow, the Publish identity strip, and mobile reflow. Archived — see [plan](_archive/book_tab_front_door/README.md) and its `status.json` for the full run log.

- [x] **L-BOOK 001** — Add `'book'` scope to the player bus — [plan](_archive/book_tab_front_door/tasks/001-player-bus-book-scope.md)
- [x] **L-BOOK 002** — Additive `description` column + spec update — [plan](_archive/book_tab_front_door/tasks/002-description-column-migration.md)
- [x] **L-BOOK 003** — API param for `description` — [plan](_archive/book_tab_front_door/tasks/003-description-api-param.md)
- [x] **L-BOOK 004** — Frontend contract for `description` (type/api/hook) — [plan](_archive/book_tab_front_door/tasks/004-description-frontend-contract.md)
- [x] **L-BOOK 005** — Extract `BookIdentityStrip`, swap into Publish's sidebar — [plan](_archive/book_tab_front_door/tasks/005-book-identity-strip.md)
- [x] **L-BOOK 006** — Continue Listening card (listen/resume affordance) — [plan](_archive/book_tab_front_door/tasks/006-continue-listening-card.md)
- [x] **L-BOOK 007** — Wire real description field into `BookStage.tsx` — [plan](_archive/book_tab_front_door/tasks/007-description-card-wiring.md)
- [x] **L-BOOK 008** — North Star hero layout restructuring — [plan](_archive/book_tab_front_door/tasks/008-hero-layout-restructure.md)

### Demo North Star book pane — DONE 2026-07-10

Demo-only, no real-app changes; additive (the North Star demo is the aspirational direction, not a mirror trimmed to match production — nothing existing was removed). Live-verified: Book is the first/default tab, hero renders correctly, Contents unaffected, Continue Listening drives the demo's global player bar with zero console errors. Archived — see [plan](_archive/demo_north_star_book_pane/README.md).

- [x] **L-DEMO 001** — Build `BookPane` component — [plan](_archive/demo_north_star_book_pane/tasks/001-build-book-pane.md)
- [x] **L-DEMO 002** — Wire `Book` tab registration + default landing — [plan](_archive/demo_north_star_book_pane/tasks/002-wire-book-tab.md)
- [x] **L-DEMO 003** — Rebuild + verify static demo output — [plan](_archive/demo_north_star_book_pane/tasks/003-rebuild-verify-demo.md)

### Chapter tabs quick-fix batch — DONE 2026-07-10 (ad hoc, no plan folder)

Found via a parallel survey of Contents/Cast/Lexicon (6 independent fixes, dispatched and verified directly, no formal plan folder since each was small/self-contained): Contents silent create/import/export failures now toast; Contents lifecycle pill no longer contradicts the StatusOrb (new Stale/Error states, `useBookData.ts` totals reworked to not double-count/drop chapters); Cast tab mutation failures now toast+revert consistently, a "Promote" action was wired up for chapter-scoped temp characters (backend already existed, unused), rename input got an aria-label; AddChapterModal rejects whitespace-only titles; a debug segment UUID was removed from FollowAlongPanel; Lexicon rejects duplicate words and no longer no-ops silently on empty submit. One `--border-strong`/pill-contrast token gap found and fixed along the way. Adversarial review: zero blockers; one real behavior-change finding (Stale/Error chapters now correctly excluded from Publish/Assembly even with a prior valid render) flagged to the owner, not silently accepted.

### Chapter Workspace Merge — SUPERSEDED, superseding work DONE 2026-07-10

This plan folder was never built — before it was dispatched, the "Director's Console activation" work independently delivered the same merge (mode switcher shell, duplicate-rail removal, a fourth Write/Edit-Text mode via `ChapterTextPanel`) plus more. See `_archive/chapter_workspace_merge_superseded/SUPERSEDED.md` for the supersession note and the **Chapter editor art-program** entry below for the actual shipped plan (`_archive/directors_console_activation/README.md`) — full green gate (1807 frontend + 2252 backend tests, tsc/build/lint clean), live-verified in-browser. The one residual bug flagged during that pass (`CastPalette.tsx`'s `CharacterRow` nesting a `<button>` inside `ColorSwatchPicker`'s own `<button>`) is **already fixed** — the very next PR (#126, Quiet Studio redesign, `b87e1890`) restructured the outer element to `<div role="button" tabIndex={0}>` as part of its foundation cleanup, with a regression test at `frontend/tests/unit/pages/Book/studio/CastPaletteNestedButton.test.tsx`. Confirmed 2026-07-11 — no work remains here.

- [x] **L-WORKSPACE 001** — Cast/Follow Along/Edit Text mode switcher shell — superseded by Director's Console activation, DONE 2026-07-10
- [x] **L-WORKSPACE 002** — Remove duplicate chapter rail, dock Annotations — superseded by Director's Console activation, DONE 2026-07-10
- [x] **L-WORKSPACE 003** — Edit Text mode via ChapterTextPanel — superseded by Director's Console activation, DONE 2026-07-10 (shipped as the "Write" tool)
- [x] **L-WORKSPACE 004** — Cleanup + full green gate — superseded by Director's Console activation, DONE 2026-07-10

### North Star screen parity — ALL 13 TASKS DONE 2026-07-11

Reconciles the live app's layout against the North Star reference demo (`frontend/src/demo/stages/siteMockup/`), starting from owner-reported drift on the Home/Welcome screen, the Library page, and the Book view's chapter list. See [plan](active/north_star_screen_parity/README.md). Executed via `/mastermind` 2026-07-11: tasks 001-010, 012-013 done (full green gate — 227 frontend files/1884 tests, 0 lint errors, clean build, backend `tests/db/` 224 passed); only 011 (live-browser visual verification) remains. One real regression was caught during consolidation, not by any agent's self-report: task 005's parallel work copied a stale snapshot of `ProjectLibraryPage.tsx` back over the checkout, silently dropping task 010's `LibraryBookmarksPanel` wiring — found by cross-checking file contents against every task's acceptance criteria before trusting completion, fixed, full suite re-verified green after. Also found and merged two more worktree-isolated agents (002, 008) whose changes had never been copied out of their isolated worktrees into the shared checkout, before this was caught the same way.

- [x] **L-NS 001** — Fix `TASKS.md` doc drift (this section's own former phantom entry, see above) — DONE — [plan](active/north_star_screen_parity/tasks/001-fix-tasks-md-doc-drift.md)
- [x] **L-NS 002** — WelcomePage: CTA placement + secondary-CTA element type — DONE — [plan](active/north_star_screen_parity/tasks/002-welcomepage-cta-placement.md)
- [x] **L-NS 003** — Library grid card: restore "Open" action + hover-play — DONE — [plan](active/north_star_screen_parity/tasks/003-library-card-open-and-hover-play.md)
- [x] **L-NS 004** — Library: "All Books" header + quick-filter chips + cover-size slider — DONE — [plan](active/north_star_screen_parity/tasks/004-library-all-books-header-and-filters.md)
- [x] **L-NS 005** — Library: per-project workflow status — DONE, partial scope (owner-approved): Drafting/Casting/Rendered shipped via a new no-schema-change aggregate query; Studio (live-render) and Published (assembled) states deferred — no DB-tracked signal exists for either without an N+1 pattern or a new live-job subscription architecture — [plan](active/north_star_screen_parity/tasks/005-library-project-status.md)
- [x] **L-NS 006** — Library: "Continue" section — DONE, scoped down (owner-approved): status + a real static rendered-fraction progress bar for up to 2 most-recently-active in-progress projects, no ETA (genuinely unavailable at book grain without an active job — omitted per the project's no-fabrication rule, not approximated) — [plan](active/north_star_screen_parity/tasks/006-library-continue-section.md)
- [x] **L-NS 007** — Library: remove unreachable dead empty-state branch — DONE — [plan](active/north_star_screen_parity/tasks/007-library-dead-code-cleanup.md)
- [x] **L-NS 008** — Chapter Workspace: status orb in the chapter-switcher dropdown — DONE — [plan](active/north_star_screen_parity/tasks/008-chapter-dropdown-status-orb.md)
- [x] **L-NS 009** — Backups tab: relocate real functionality from Publish — DONE, cross-project scoping verified safe — [plan](active/north_star_screen_parity/tasks/009-decision-backups-tab-fate.md)
- [x] **L-NS 010** — Contents tab: simplify to match demo's board — DONE, both gates resolved: Write mode confirmed to cover the removed inline editor; bookmark-panel scope ambiguity resolved by the owner as BOTH a book-scoped panel (Contents tab) and a new library-wide panel (Library page, scope addition beyond the original task) — [plan](active/north_star_screen_parity/tasks/010-decision-contents-tab-fate.md)
- [x] **L-NS 011** — Designer agent: screenshot-verify bookmark discoverability + Library header copy — DONE, both verdicts recorded with citations (ship as-is); found a real, unrelated defect while checking — `ChapterWorkspaceHeader.tsx`'s inline bookmarks dropdown has zero theme CSS (broken in dark mode) — flagged as a separate follow-up, not fixed here — [plan](active/north_star_screen_parity/tasks/011-designer-visual-verification.md)
- [x] **L-NS 012** — Demo-side cleanup: Engines Module-Settings tab, orphaned `ManuscriptPane`, `studio.tsx` note — DONE, all 3 parts — [plan](active/north_star_screen_parity/tasks/012-demo-side-cleanup.md)
- [x] **L-NS 013** — Refresh terminology in the R1-18 owner-validation checklist — DONE, no structural-change flags found — [plan](active/north_star_screen_parity/tasks/013-refresh-validation-checklist-terminology.md)

### Ready to dispatch NOW

**Zero blockers:**
- ~~W-MIX-LA 007 spec reconciliation~~ — **done 2026-07-02** (007a doc work + 007b owner G0 re-check both complete; W-MIX-LA fully closed). W-PAR 002/003 execution is no longer gated on this — only the cap>1 owner sign-off (gate summary #2) remains.
- **L-SIMP** — behavior-preserving cleanup, no CP overlap: ST-1 `components.css` split, ST-2 shared classes, LF-2 `EngineCard`, LF-3 `PredictiveProgressBar`, LF-4 `MetadataEditorModal`, ~~LF-5 `App.tsx`~~ (done), BE-2/BE-3/BE-5, PL-1/PL-3/PL-5. Parallel-safe among themselves. **Excludes LF-1/LF-6's remaining `enrich()` half (contested above) and DC-1b (live tree, gate re-verify).**
- **L-TAX** — 007 taxonomy G1–G6 (`language` multi + `style` multi only; `accent` already shipped). No CP overlap.
- **L-SEC** — 009 `npm audit` re-run (currently 0 vulns; release hygiene).

**Prep work (build dark now, integration-gated):**
- **W-PAR 006 frontend multi-active** *(prep)* — the two-layer thread (`live-jobs.ts` `OverlayDelta.active_segments_map` → `jobEventAdapters.ts` → `queueOverlayFields.ts` → `hydration/index.ts` → `useStudioChapter` Set → `ScriptView`) can be built + unit-tested now with a byte-identical cap=1 fallback: if `active_segments_map` is absent, behave exactly as today's single `active_segment_id` path. **Integration point:** consumes the `active_segments_map` field W-PAR 003 will emit. 006's "depends on 003" is an *enable* dependency, not a *write* dependency.
- **W-PAR 002 parent/child scheduling** *(partial prep)* — `SegmentSynthesisTask` + `_fan_out_chapter` can be written and unit-tested now (001's semaphores are live; `_manifest_resource_claim` already derives caps). Stays dark at cap=1 (fan-out of 1 = today). **Integration point:** enabling needs the owner cap>1 sign-off; the fan-out logic itself isn't gated.

**No safe prep available (honest flags — don't manufacture busywork):**
- **W-PAR 003 (keystone)** — this IS the risky part: isolating the ~1,460-line single-active `_dispatch` closure + the `ws.py` R-F `SEGMENT_SAVED` rework rewrites the live single-flight path itself. One focused agent, serialized, after 002.
- **W-PAR 005 correctness invariants** — depends on 002+003 existing; nothing to build ahead.

### Gate summary (the hard serialization points that matter)

1. ~~W-MIX-LA 007 👁 G0 re-check gates W-PAR 002/003 execution~~ — **cleared 2026-07-02.**
2. ~~**Owner cap>1 sign-off** gates *enabling* parallelism~~ — **owner signed off 2026-07-04**; enable-gate implemented (Findings A + B + size-weighted completion, commit `dc5b13ea`). See W-PAR section.
3. **W-PAR 003 (keystone)** gates 005 and the *runtime* half of 006; runs alone on `orchestrator_helpers.py` + `ws.py`.
4. **`progress/service.py` quiescence** gates the remaining LF-6 `enrich()` extraction (emit-gate half done, `8d2ee030`) — never touch it while an ETA agent is live.
5. **004 RST-8** gates DC-1b; **006 namespace rename** runs alone; **011 release gating** is last, owner-run.

---

## W-MIX — Mixed-engine model-load progress/ETA fix *(active)*

Plan: [active/mixed-synthesis-fused-proposal/README.md](active/mixed-synthesis-fused-proposal/README.md)

- [x] **W1** — Per-active-engine marker resolution — [task 001](active/mixed-synthesis-fused-proposal/tasks/001-marker-resolution-per-active-engine.md)
  - [x] `generation.py`: add `"engine"` key to each script entry
  - [x] `orchestrator_helpers.py`: resolve active render-group engine for marker + progress matching
  - [x] `tts_mixed/handler.py`: emit `[ENGINE_ACTIVITY_STARTED]` before each group's bridge call
  - [x] `tts_mixed/manifest.json`: declare `ENGINE_ACTIVITY_STARTED` timing marker
  - [x] Tests: mixed marker resolution; Voxtral-first masking regression (R1 revert-checked)

- [x] **W2** — Synthesis-only duration; orchestrator sole writer — [task 002](active/mixed-synthesis-fused-proposal/tasks/002-synthesis-only-duration-single-writer.md) *(commit 28a8317a + review fixes 077d5251)*
  - [x] `tts_mixed/handler.py`: remove load-inclusive `synthesis_duration_seconds` from final `update_job`
  - [x] `tts_mixed/handler.py`: remove competing `record_engine_sample` call (orchestrator is sole writer; wrapper kept as a documented test guard target)
  - [x] `orchestrator_helpers.py`: gate `segment_announced` fallback — only use when no load window exists (retain `segment_load_observed` latch through chapter-complete; INV-3 fix)
  - [x] `orchestrator_helpers.py`: verify `_record_render_stats_inner` sources synthesis-only duration
  - [x] `performance.py`: CPS purity (`model_load_seconds` out of CPS) covered by existing `test_record_render_sample_stores_load_and_pure_render_seconds`; positive marker-path test added in `test_startup_eta.py`

- [x] **W3** — ETA suspension + per-group preparing phase — [task 003](active/mixed-synthesis-fused-proposal/tasks/003-eta-suspension-preparing-phase.md) *(commit f474d300 + refinement 94ee199f)*
  - [x] `orchestrator_publish.py`: `clear_eta` param — null `eta_seconds` + clear → persisted ETA `None`; incidental null never clobbers a good ETA
  - [x] `orchestrator_helpers.py`: force-emit preparing frame with `indeterminate=true`, cleared ETA, `status="running"` — **gated on a real load marker** (per-group `LOADING_MODEL` frame), not every `SEGMENT_PENDING` announce, so warm renders don't flash
  - [x] Verify ETA resumes fresh at engine confirmation (no stale-value snap) — pinned in `test_preparing_window.py`
  - [x] Backend signals verified on the wire (`etaSeconds: null` + `indeterminate: true`); **user-visible chapter-bar effect lands in W4** (frontend consumption)

- [x] **W4** — Frontend preparing-state presentation — [task 004](active/mixed-synthesis-fused-proposal/tasks/004-frontend-preparing-presentation.md) *(mastermind run; commit pending — not pushed)*
  - [x] `live-jobs.ts` + `OverlayDelta`: surface `indeterminate` / `loadingElapsedSeconds` on the delta — **plus the two-layer runtime gap**: `jobEventAdapters.ts` (extract from payload), `queueOverlayFields.ts` (whitelist), `api/hydration/index.ts` (merge) — the fields were dropped at two layers; integration test through `publishStudioSocketMessage`→`useQueueSync` guards it
  - [x] `useStudioChapter.ts`: `chapterRenderPreparingSegmentIds` (reason_code/indeterminate), subtracted from rendering set + exported
  - [x] `ScriptView.tsx` + `.css`: `preparing` tier (`data-render-status="preparing"`, precedence over rendering, no render cursor, reduced-motion-guarded pulse); wired at **both** call sites (`StudioStage.tsx`, `ChapterEditorPage.tsx`)
  - [x] `ChapterHeader.tsx`: pass `reasonCode` into `buildSegmentProgressBarProps` (activates the existing 120s-lane suppression)
  - [x] Label: `getBusyStatusText` → generic `"Preparing…"` (shared across all indeterminate bars — fixes the over-broad relabel an adversarial pass caught); the **segment** load-window bar gets `"Preparing… / Loading voice model…"` via a scoped `busyLabel` prop (`progressBarContracts` + `PredictiveProgressBar`)
  - [x] `segmentsProgressProjector.ts`: forward `indeterminate` (completes end-to-end threading)
  - [ ] `StatusOrb.tsx`: distinct preparing appearance *(optional — deferred; not in acceptance criteria)*

  > 👁 **VISUAL CHECK — W-MIX complete**
  > Trigger a mixed XTTS+Voxtral render on a book with multiple chapters. During the ~30s XTTS model-load window:
  > - Active segment span reads **"Preparing… / Loading voice model…"** — NOT "Working…"
  > - Progress bar is indeterminate (no countdown, no 120s fake lane)
  > - No render cursor animation on the active span
  > - StatusOrb shows a distinct preparing state (dimmed/pulsing, not the spinning loader)
  > - Once synthesis starts: bar flips to "Working…" with a fresh ETA from zero — no stale-value snap
  > - A Voxtral-only render is unaffected (shows Working immediately, no preparing flash)

- [ ] **W5** — Mixed `ResourceClaim` *(superseded — folded into W-PAR 001; per-engine semaphores replace the binary gate and close the mixed `none()` gap)*

- [x] **W6** — Spec reconciliation — [task 005](active/mixed-synthesis-fused-proposal/tasks/005-spec-reconciliation.md) *(all 5 specs landed alongside their behavior per joint-authority)*
  - [x] `live-events.md` → 1.7.1: mixed marker resolution (1.6.1, W1) + load-window frame contract + load-marker-gated suspension (1.7.0/1.7.1, W3)
  - [x] `progress-presentation.md` → 1.6.0: segment-granularity preparing tier (§2.7), 120s-lane suppression, ETA suspend/resume, load-marker-gated suspension (W4)
  - [x] `queue-jobs.md` → 1.5.1: per-group phase vs monotonic durable status (1.5.0/1.5.1, W3) + synthesis-only clock note (1.4.1, W2)
  - [x] `data-model.md` → 1.4.1: synthesis-only clock + orchestrator sole-writer contract (W2) *(landed as 1.4.1, not 1.5.0 — content complete)*
  - [x] `system-architecture.md` → 1.3.0: per-active-engine marker-resolution note (W1 added the explicit `[ENGINE_ACTIVITY_STARTED]` marker; documented as manifest-driven, not engine-ID branching)

---

## W-MIX-LA — Mixed-synthesis load attribution *(done 2026-07-02 — 001–007 all complete)*

Plan: [active/mixed-synthesis-load-attribution/README.md](active/mixed-synthesis-load-attribution/README.md) · map: [01-map.md](active/mixed-synthesis-load-attribution/01-map.md) · roadmap: [02-roadmap.md](active/mixed-synthesis-load-attribution/02-roadmap.md)

W-MIX follow-up — **G0 visual check failed (2026-06-26)**. A mixed Voxtral→XTTS render exposed three gaps in the sequential core: (A) mid-chapter XTTS cold-load shows "frozen first letter" instead of "preparing" because load windows are attributed by ambient context, not segment identity; (B) chapter/queue never pauses + ETA isn't load-aware; (C) `model_load_seconds` is recorded but never used. Lands the segment-tagged load-marker **log contract** that also unblocks W-PAR 006. **Gates resuming W-PAR.**

- [x] **001** — Diagnostic: pin exact marker ordering *(DONE 2026-06-26 — [001-findings.md](active/mixed-synthesis-load-attribution/tasks/001-findings.md): root cause = XTTS cold-load line dropped at `engine.py` `relay_marker` (non-bracket → None), never reaches orchestrator; XTTS-first works via dispatch-time frame only)*
- [x] **002** — Real-load marker *(DONE 2026-06-26)* — XTTS emits dedicated `[MODEL_LOAD_STARTED] {sid?} {task_id}` only on real cold load; watchdog extracts task_id; manifest + `behavior.py` pass-through
- [x] **003** — Orchestrator identity-based attribution *(keystone — DONE 2026-06-26)* — `log_listener` fires the LOADING_MODEL/indeterminate frame on `MODEL_LOAD_STARTED` (clear_eta, attributed to marker sid / `active_seg_id`); warm/cloud silent by construction; adversarial CLEAN
- [x] **004** — Frontend mid-chapter preparing render *(DONE 2026-06-26; refixed after live G0)* — (a) segment frame carries `indeterminate` (`build_segment_progress_event` + service.py) + `live-jobs.ts` scope-gate relaxed; (b) **bar now honors `indeterminate`** — `PredictiveProgressBar` pulses + suppresses the predictive lane (no 120s creep / jump-ahead) regardless of status, threaded via `progressBarContracts` + `ChapterHeader`. Pulse + no-jump confirmed by tests; **👁 owner re-render pending.**
- [x] **005** — Chapter-level preparing *(SUPERSEDED 2026-06-26)* — owner: "pausing doesn't make sense." Don't pause; ETA-add (006) instead.
- [x] **006** — Load-aware ETA *(chosen approach)* — on `MODEL_LOAD_STARTED`, add DB `model_load_seconds` to the live ETA; clock counts down while the bar holds; account for the *extra* time only (parallel-aware); no pre-add, no pause. *(landed in `64a39c34` — implemented in `orchestrator_helpers.py` (proactive `pre_load_eta` at dispatch + reactive reconcile on `MODEL_LOAD_STARTED`) + `performance.py::expected_model_load_seconds`, NOT the originally-spec'd eta.py/orchestrator_eta.py; bundled with the §4A.3 chapter-ETA composition fix, spec 1.8.2)*
  - [x] **2026-07-02 follow-on fix** *(commits `4f78cc7b` / `291872bc`)* — same live mixed render (job-47213119) exposed two more bugs downstream of 006: the §4A.4 mechanical ceiling clipped a correct end-game ETA (flat `EtaSampleRing.mean()` → new recency-weighted `weighted_mean()`), and chapter `eta_confidence` bounced instead of ramping (→ monotone running-state floor in `service.py`). Frontend `clampSlope` also crawled instead of snapping after a stall (`MIN_SLOPE_CAP_BASE_MS`). Spec → 1.8.4; `wiki/Changelog.md` entry added. Owner-verified via live render ("ETA is looking good").
- [x] **007a** — Spec reconciliation (doc-only) *(DONE 2026-07-02, via /flow-feature — Config C, no code changes)* — `live-events.md` → 1.8.0 (`pre_load_eta` frame shape + amended the 1.5.3 "no indeterminate+positive-eta" invariant, which progress-presentation.md had already superseded at 1.8.0 but this spec hadn't caught up to); `queue-jobs.md` → 1.7.0 (new §3.9, `QueueItem.tsx` `preparingWithEta` client retention); `data-model.md` → 1.5.0 (`model_load_seconds` now documented as consumed by `expected_model_load_seconds()`, not just recorded); `wiki/Changelog.md` — added the missing load-aware-ETA feature entry (006 itself had none; only the 2026-07-02 follow-on fix did). progress-presentation.md needed no changes (already at 1.8.4).
- [x] **007b** — 👁 **G0 re-check** *(DONE 2026-07-02 — owner confirmed the live `pre_load_eta` countdown was already showing correctly on real renders prior to 007a's doc work; 007a touched zero application code so it could not have affected the behavior. W-MIX-LA is now fully complete.)*

  > 👁 **VISUAL CHECK — ML-2 (mid-chapter preparing fixed)**
  > Re-run the mixed render: Voxtral→XTTS shows the preparing pulse on the XTTS segment (not frozen first letter); XTTS-first still pulses-then-animates; Voxtral-only + warm XTTS group show no preparing flash.

---

## W-PAR — Parallel segment rendering *(active — 001–007 done; ENABLE-GATE LANDED 2026-07-04 (owner cap>1 sign-off + Findings A/B + size-weighted completion, commit `dc5b13ea`); **Phase 1 / M-PAR-3 CONFIRMED 2026-07-10** — owner-verified live: segments render in parallel, chapters render in parallel; Phase 2 (render monitor) unblocked)*

> **Enable-gate resolved 2026-07-04** (owner-directed): **Finding A** → synthetic fan-out children no longer create durable Job rows / queue.items broadcasts (`TaskContext.ephemeral` + per-channel `ProgressService.publish(ephemeral=)` suppression — job-scoped frames only; segment-scoped progress frames still flow, verified by Fable review after an initial blanket-suppression bug that killed live per-segment bars). **Finding B** → interleaving accepted; chapter-level FIFO intentionally NOT enforced ("only completion % matters, no matter the order"). **Completion** → size-weighted, order-independent `grouped_progress` from in-memory child text sizes; `chapter_completion_by_size(chapter_id)` DB helper added (computed-but-not-wired). Specs: queue-jobs 1.11.0, live-events 1.9.4.

Plan: [active/parallel-segment-rendering/README.md](active/parallel-segment-rendering/README.md) · map: [01-map.md](active/parallel-segment-rendering/01-map.md) · roadmap: [02-roadmap.md](active/parallel-segment-rendering/02-roadmap.md)

Render a chapter's segments **concurrently** across per-engine pools (GPU/CPU/cloud), capped per engine, off-by-default (cap=1). Phase 1 = backend parallelism + multi-active frontend (existing per-segment bars light up at once); Phase 2 = dedicated render monitor (fast-follow). **Subsumes W-MIX W5.** Designed via the 2026-06-26 fusion triage.

- [x] **G0 (prereq — owner):** verify the W-MIX `👁 VISUAL CHECK` on a live mixed render before starting (don't stack parallelism on an unverified core) — *synthesis core owner-verified 2026-06-29 ("best it's ever done!"); cap>1 concurrency owner-verified live 2026-07-03 (two XTTS jobs actually overlapping) after the 001 escaped-defect fix below — parallelism enable path confirmed working.*
- [x] **001** — Per-engine cap declaration + scheduler semaphores — [task 001](active/parallel-segment-rendering/tasks/001-per-engine-cap-and-semaphores.md) *(DONE 2026-06-26: per-engine counting semaphores + manifest caps + global cap; ships dark via `ENGINE_CLASS_ADMISSION` env flag default OFF → single-flight = today; **W5 closed at runtime**; adversarial-reviewed, 434 tests green. Real caps + the toggle-as-setting land in 007.)*
  - [x] **2026-07-03 escaped-defect fix** — live cap=2 test on XTTS still ran strictly sequential. Root cause: `GpuAdmissionGate`/`ExclusiveAdmissionGate` (deprecated compat wrappers) called `get_engine_semaphore("gpu"/"exclusive", 1)` in `__init__`, eagerly registering into the SAME shared registry a real manifest-derived `engine_class="gpu"` claim also uses; since the registry cached cap at first creation and ignored it thereafter, and these wrappers construct at module-import time, every GPU-class engine was silently capped at 1 regardless of `max_concurrent_workers`. Fixed in `resources.py`: (1) the legacy wrappers now use private, non-shared semaphores; (2) `get_engine_semaphore`/`EngineClassSemaphore` made self-healing — cap grows to the largest value any caller requests, never frozen at the first caller's value. Regression test `test_xtts_cap2_admits_two_concurrent_via_real_path` (R1 revert-checked). None of the original 434 tests caught this — they only exercised synthetic non-colliding engine-class keys or the flag-off ships-dark path.
- [x] **002** — Parent/child segment scheduling + the enable-gate (live wiring) — [task 002](active/parallel-segment-rendering/tasks/002-parent-child-segment-scheduling.md) *(DONE 2026-07-03 in two parts: fan-out structure landed dark 2026-07-02; **live wiring landed 2026-07-03** — `app/api/routers/generation.py`'s chapter-render/bake submission now constructs `ChapterSynthesisTask` instead of `SynthesisTask` for segment-orchestrated engines; `orchestrator_helpers._dispatch`'s `is_chapter_fanout` branch routes the parent to `task.run()` directly (bypasses `_dispatch_segment` for a task that renders nothing itself); each child renders via `make_dispatch_segment_bridge_call`, reusing `_dispatch_segment`'s isolation (003) — mixed-engine groups call the newly-extracted `render_one_group` (NOT the chapter-terminal `handle_mixed_job`, which is unchanged for its other callers); other engines use the existing bridge path. Recovery reconstructs `ChapterSynthesisTask` via `_reconstruct_chapter_task_from_context` with K-of-N resume. Fixed a stitch-barrier data-loss bug found during this work: a recovery-skipped (already-valid) group's existing audio never reached the final stitched paths (now seeded via `resolve_existing_output_fn`). `active_segments_map` (C2) now emits genuine multi-entry snapshots at cap>1 (`_EMIT_ACTIVE_SEGMENTS_MAP` flipped on). At `max_concurrent_workers=1` (default; a manifest must explicitly raise `behavior.max_concurrent_workers` to enable visible parallelism) behavior is byte-identical to the pre-wiring sequential path — pinned by a dedicated old-vs-new event-sequence regression test (`tests/orchestration/test_cap1_old_vs_new_path_equivalence.py`). Full suite 2038 passed/3 skipped (baseline 2030+8, zero regressions); ruff clean. Live verification against a real running server with real XTTS synthesis was NOT performed this session — it would have required mutating persistent local state (enabling the XTTS plugin, writing to the real project DB) beyond what the user had authorized; owner should run the 👁 VISUAL CHECK below before relying on this in production. See `docs/code-map/queue/w-par-008-enable-gate.md`.)*
- [x] **003** — Per-segment dispatch isolation — [task 003](active/parallel-segment-rendering/tasks/003-per-segment-dispatch-isolation.md) *(DONE 2026-07-03: option (a) extraction landed — `_dispatch` is now a thin fan-out driver delegating to `_dispatch_segment`, which owns fully closure-isolated timing/marker/model-load state (INV-6) and returns a `SegmentResult`; byte-identical at cap=1/N=1 (INV-1, pinned via an ordered-event-sequence golden test). Additive `active_segments_map` (C2 contract) now rides the existing `queue.items` frame — `live-events.md` 1.9.0, `queue-jobs.md` 1.8.0 §3.10. **R-F scope note:** wiring fan-out > 1 into the live dispatch path (`orchestrator.submit()`, `tts_mixed/handler.py`) and the corresponding per-child `segments.progress` emission rework (replacing today's transition-inferred `SEGMENT_SAVED`, which remains correct at N=1) are deferred to task 005/enable-gate — see queue-jobs.md §3.10 and the task file's Implementation notes.)*
- [x] **004** — TTS-server concurrent inference — [task 004](active/parallel-segment-rendering/tasks/004-tts-server-concurrent-inference.md) *(DONE 2026-06-26: async `/synthesize` + `run_in_threadpool`; `WarmWorkerManager` lazy-spawned free-list pool capped at `manifest.behavior.max_concurrent_workers`; OOM degrade fail-safe; Voxtral no lock; ships dark at cap=1. **M-PAR-1 complete** together with 001 — per-engine semaphores + server-side pool exist, default cap=1 = no behavior change. Residual: dead-worker waiter hang at cap>1 → task 005.)*
- [x] **005** — Correctness invariants under parallelism — [task 005](active/parallel-segment-rendering/tasks/005-correctness-invariants.md) *(DONE 2026-07-03: INV-2 stitch-order barrier + INV-3 artifact validation (`_is_valid_segment_artifact`, WAV-header duration check) landed in `plugins/tts_mixed/handler.py` (today's live sequential path); INV-7 explicit `futures_wait(ALL_COMPLETED)` join, INV-8 K-of-N `needs_render_fn` filter hook, owner-directive retry-once policy, and stuck-segment heartbeat (`stalled_segments`) landed in `app/orchestration/tasks/segment_synthesis.py`'s `ChapterSynthesisTask`/`SegmentSynthesisTask` (002's not-yet-live concurrent model — full `orchestrator.submit()`/`recover()` wiring remains 008's job, per 003's own scoping). R-C: `PRAGMA journal_mode=WAL` added at `get_connection()`; audited `update_segments_bulk`/`update_segments_status_bulk` — already SQLite-only, `state.json` untouched. 004 residual fixed: `WarmWorkerManager._acquire_worker` polls instead of blocking forever on a dead worker. 10 new tests in `tests/orchestration/test_correctness_invariants.py`, all R1 revert-checked. Full suite 2030 passed/3 skipped (baseline 2020+10, zero regressions); ruff clean. See `docs/code-map/queue/w-par-005-correctness-invariants.md`.)*
- [x] **006** — Frontend multi-active segments — [task 006](active/parallel-segment-rendering/tasks/006-frontend-multi-active.md) *(DONE — shipped in `fa6cf37b` alongside 002/003/005 but the checkbox was never flipped; TASKS.md was stale, not the code — audited 2026-07-03. `chapterRenderActiveSegmentsMap`/`RenderingSegmentIds`/`PreparingSegmentIds` live in `useStudioChapter.ts`, threaded end-to-end via the W4 two-layer pattern; byte-identical cap=1 fallback confirmed by `test_dispatch_isolation.py`.)*
- [x] **007** — ETA under parallelism + off-by-default toggle + spec reconciliation — [task 007](active/parallel-segment-rendering/tasks/007-eta-toggle-and-specs.md) *(DONE 2026-07-04: **(1) Fable merge-gate finding fixed** — `resources.py` gained an independent `get_engine_id_semaphore(engine_id, cap)` registry checked alongside (never instead of) the existing per-`engine_class` semaphore whenever a claim declares `engine_id`; closes the latent "two same-class engine_ids converge to the larger grow-only cap" gap (not live today — only XTTS is `"gpu"`-class; opt-in via `engine_id`, so zero behavior change for any caller that doesn't declare it). Also hard-pinned the `"exclusive"` class to reject growth above cap=1 (`ValueError`) in `EngineClassSemaphore`. **(2) Cap toggle surfaced as a real setting** — new `app/orchestration/scheduler/cap_settings.py` (`resolve_effective_cap`, settings-then-env precedence matching `policies.get_priority_mode`); `tts_parallel_cap` (default 1) / `tts_engine_caps` added to `state_settings.py` defaults/normalization and to `POST /api/settings`; `_manifest_resource_claim` now resolves `min(setting/env cap, manifest max)` instead of using the raw manifest cap directly — default behavior unchanged (INV-1). **(3) Bracketed ETA utility** — `BracketedEtaTracker`/`BracketedEtaResult` added to `app/orchestration/progress/eta.py`: rolling-throughput (K=10) / bottleneck-pool model, `"estimating…"` no-fabrication guard until ≥3 completions, exact cap=1 parity with today's single-stream CPS (pinned by test). **Not wired** into `ProgressService.enrich()` or any live frame this session — explicitly documented as a known gap (`live-events.md` 1.9.3 §7, `progress-presentation.md` 1.9.0 §4A.11) rather than silently left undone or half-wired; flagged as real follow-up scope, not hidden debt. **(4) Specs bumped:** `queue-jobs.md` → 1.10.0 (§7.3b toggle, §7.4a per-engine-id gate), `system-architecture.md` → 1.6.0 (§3.1a), `data-model.md` → 1.6.0 (settings fields), `live-events.md` → 1.9.3 (Known gaps §7), `progress-presentation.md` → 1.9.0 (§4A.11). **Tests:** new `tests/orchestration/test_eta_bracket_and_engine_cap.py` (17 tests, TDD red→green, R1 revert-checked) + 2 new `tests/api/test_api_system.py` settings-endpoint tests + one existing `test_engine_semaphores.py` test updated for the new cap-resolution contract (documented inline why). Full `tests/orchestration` (497) + `tests/api/test_api_system.py` (9) green; ruff clean on all touched files. Confirmed dark/safe: XTTS/Voxtral/mixed are unaffected at default settings — `tts_parallel_cap` defaults to 1 and `ENGINE_CLASS_ADMISSION` still defaults off, so the per-engine-id gate is inert until both an operator raises the cap AND the class-admission flag is enabled.)*
- [x] **Phase 2** — dedicated BitTorrent-style render monitor — [10-phase2-render-monitor.md](active/parallel-segment-rendering/10-phase2-render-monitor.md) · tasks [008](active/parallel-segment-rendering/tasks/008-segment-inventory-hydration.md)-[014](active/parallel-segment-rendering/tasks/014-live-cap-admission.md) *(DONE 2026-07-11, commit `c34147dd`, executed via `/plan-run` with per-slice orchestrator verification + one Opus adversarial pass + one Fable sign-off, all zero-blocker: **008** real per-segment `char_count` + genuine `'failed'` phase in `active_segments_map` (never a render-group's combined total — traced end to end, confirmed by two independent reviews), replacing the Activity page's dev fixture with live hydration (`useSegmentInventory.ts`); **009** milestone-only `aria-live` region (never per-segment); **010** click-to-open popover + keyboard-reachable Details/Retry table actions (M6), wired to true per-segment retry (`POST /api/segments/generate`); **011** peek-strip progressive disclosure (auto-appears at ≥2 concurrently-rendering segments, dismissible but a failure always re-surfaces it), shared `SegmentBlockRow` so there's one block-encoding implementation, not two; **012** cap configuration UI — numeric stepper replacing the old binary 1/2 toggle + a new per-engine override control on `EngineCard`; **013** wires the already-built `BracketedEtaTracker` into a live event frame (plus a necessary `engine_id` plumbing fix through `OrchestratorPublishMixin` that was silently missing); **014** live per-engine cap admission — separates the manifest structural ceiling (`ResourceClaim.cap`/`manifest_max`, grow-only via existing `ensure_min_cap`) from a live limit resolved fresh on every `reserve_task_resources` call, so a settings change now reaches already-queued/in-flight work within ~1s with no restart and no eviction (hard-gate trace confirmed: per-child segments ARE individually reserved, not just the parent); new `GET`/`PUT /api/engines/{id}/concurrency`. Spec bumps: `live-events.md` 1.9.5→1.9.7, `progress-presentation.md` 1.10.1→1.10.3, `system-architecture.md` 1.6.2→1.7.0, `queue-jobs.md` 1.11.6→1.12.0. Full green gate: 2295 backend + 1914 frontend tests, lint clean, build clean. **Per-row placement was the owner's explicit direction this session** — the intent is multiple concurrently-rendering chapters each getting their own strip directly in the Activity/GlobalQueue list, matching the North Star demo (`SegmentRenderStrip.tsx`); a chapter-workspace placement was considered and explicitly rejected. **⚠ Fable sign-off (2026-07-11) found this intent is NOT actually delivered by 008-011 as shipped**: `ActivityPage.tsx` tracks exactly ONE active job (`Object.values(jobs).find(...)`, first match, order-dependent), so today only one chapter's monitor/peek-strip can show at a time, not one per concurrently-rendering row — see **015** below, a real follow-up, not a nitpick. **Owner verification still open (3 items, non-blocking):** live-render visual check of real char-weighted blocks (008), light/dark visual check of the peek strip (011), manual XTTS-cap-4 restart verification (012) — see the 👁 VISUAL CHECK below.)*
- [x] **Phase 3** — multi-job render-monitor rows *(DONE 2026-07-12)* — [11-phase3-multi-job-rows.md](active/parallel-segment-rendering/11-phase3-multi-job-rows.md) · tasks [015](active/parallel-segment-rendering/tasks/015-multi-job-render-monitor-rows.md)-[016](active/parallel-segment-rendering/tasks/016-segment-inventory-fetch-dedupe.md): closes the gap Fable's Phase 2 sign-off flagged — extend `QueueItem.tsx`/`GlobalQueue.tsx` so EVERY concurrently-rendering job gets its own inline monitor/peek-strip row, not just the first active job found (the actual owner-stated intent: "if I had 2 chapters rendering at the same time... I would have a strip underneath each progress bar"), which 008-011 only partially delivered (single-job scoping). **016** *(landed first)* fixed `useSegmentInventory.ts` re-fetching `GET /script-view` on every `active_segments_map` identity change (roughly once per progress tick) — split fetch (keyed on `chapterId` only) from the live-map merge (a `useMemo`, no network); public contract unchanged. **015** moved the `SegmentPeekStrip`/`SegmentRenderMonitor` mount (plus the peek/expand/dismiss state and segment-retry handler) from `ActivityPage.tsx`'s page-singleton `activeJob` into per-row `QueueItem.tsx`, reusing both components unmodified — each concurrently-active job now gets its own `useSegmentInventory` instance and strip, wired via `GlobalQueue.tsx` passing `onRefresh` through to each row; added shared `frontend/src/utils/jobStatus.ts` (`ACTIVE_STATUSES`) for the strip's gating condition; fixed the stale `ActivityPage.tsx` comment claiming 010/011 already handled "choosing among several" (they didn't). New tests: `QueueItemSegmentMonitor.test.tsx` (two concurrent jobs, independent hydration, retry isolation, non-active job renders nothing — revert-checked against pre-fix code) and `QueueItemPeekStrip.test.tsx` (moved/adapted from the retired `ActivityPagePeekStrip.test.tsx`, same single-row scenarios now exercised on `QueueItem`). Full frontend gate: 1918 tests, lint clean (0 errors), tsc clean, build clean. **Owner visual check still open (non-blocking):** two chapters rendering simultaneously actually showing two independent strips in the real UI, light and dark theme.

  > 👁 **VISUAL CHECK — W-PAR Phase 2 render monitor (3 items, non-blocking)**
  > - Enable dev mode (`studio-dev-mode` localStorage flag), raise an engine's cap ≥2,
  >   render a chapter with ≥10 segments: confirm the Activity page shows real
  >   char-weighted blocks sized to actual segment lengths (not synthetic/uniform),
  >   and a genuinely failed segment shows the crosshatch failure cue, not a silent
  >   disappearance (008).
  > - With ≥2 segments concurrently rendering, confirm the peek strip auto-appears
  >   below the job row, expands inline on click with no navigation, and check both
  >   light and dark mode (011).
  > - In Settings, set XTTS's manifest `max_concurrent_workers` to 4 and the new
  >   per-engine override to 4, restart the app, and confirm 4 concurrent XTTS
  >   renders actually occur — this closes the exact "setting has no effect" gap
  >   diagnosed this session (012; note task 014 makes a LIVE cap change take effect
  >   without a restart, but this specific manifest-ceiling check still wants one
  >   full restart to be sure the ceiling itself is read correctly at boot).
  >
  > 👁 **VISUAL CHECK — W-PAR Phase 1 complete**
  > Raise an engine's concurrency cap above 1, then render a multi-segment chapter:
  > - Multiple segment bars (gray→black text + per-segment progress) advance **simultaneously**, not one at a time
  > - Chapter finishes noticeably faster than at cap=1; the chapter WAV plays back correct and in order (no shuffled/garbled segments)
  > - Cancel mid-render stops cleanly (no orphan audio, queue clears); re-render resumes only unfinished segments
  > - With the cap back at 1, behavior is exactly as before (ships dark)
  > - Overall progress + ETA stay coherent (ETA shown as a range / "estimating…", not a false precise countdown)
  >
  > **First attempt FAILED (2026-07-05, owner-run):** an XTTS chapter re-render at cap>1
  > crashed with a `text must not be empty` 422 (attributed to the parent job); no
  > per-segment bars ever advanced simultaneously, chapter status sat on "preparing"
  > throughout. Root-caused via a 4-agent fusion-reasoning panel + Fable adversarial
  > verification (see `queue-jobs.md` 1.11.3 changelog for the full mechanism):
  > `_dispatch_segment`'s legacy per-engine registry lookup silently pre-empted the
  > isolated per-group bridge routing W-PAR 008 built, for BOTH xtts and voxtral (only
  > `mixed` was ever exercised, since its manifest has no legacy registration) — every
  > fan-out child re-ran the whole chapter's remaining work instead of just its own
  > group, and the last-dispatched child crashed on an empty payload with no guard.
  > Fixed same-day: `_SyntheticSegmentTask.skip_registry_dispatch` bypass (routing) +
  > `handle_xtts_standard` empty-script no-op guard (defense-in-depth). Also found:
  > the "permanent partial completion showing errors" the owner separately saw in
  > Activity/History is unrelated — it's the documented TEMPORARY `SegmentRenderMonitor`
  > dev fixture (Phase 2 above), gated behind the `studio-dev-mode` localStorage flag,
  > not live job data. **Owner needs to re-run this visual check** now that the crash
  > is fixed — genuine simultaneous-parallelism behavior (criterion 1) was never
  > actually observed even before the crash (timestamps show strictly serial
  > execution for this run), so that criterion still needs a fresh live check.
  >
  > **Second attempt FAILED differently (2026-07-05, owner-run):** the crash is
  > confirmed fixed — the re-render completed successfully — but criterion 1
  > (simultaneous segment highlighting) and ETA animation still did not appear.
  > Root-caused via a Sonnet-only 4-agent fusion DESIGN panel (per owner directive:
  > fusion Sonnet-only, Fable scoped to plan verification) + Fable plan review:
  > `_current_active_segments_map` only ever sampled at group-COMPLETION
  > boundaries (`_publish_progress`, called from the `as_completed` loop) — the
  > just-finished child was already excluded and the next hadn't started at that
  > exact call site, so the map was structurally always empty regardless of
  > concurrency level. Separately, `build_chapter_progress_event` had no
  > `active_segments_map` parameter at all (the "delivery leg") — even a
  > correctly-populated map could never reach the frontend on a mid-render,
  > status-unchanged tick. Fable's plan review caught a lifecycle-ordering bug in
  > the panel's initial timer-based proposal and suggested a simpler event-driven
  > alternative (owner-approved): each child's own already-rate-limited per-tick
  > publish now also updates the parent's live map directly (`_on_child_segment_tick`,
  > diff-gated, `skip_job_updated=True`) — no new timer/thread/join lifecycle at
  > all. See `queue-jobs.md` 1.11.4 / `live-events.md` 1.9.5 for the full
  > mechanism. Frontend companion fix (same change): `useStudioChapter.ts` was
  > silently discarding an already-delivered `segmentProgress` prop (real live
  > per-segment data) — now used as a fallback when the backend map is absent.
  > **Owner needs to re-run this visual check again** — both fixes are unit- and
  > integration-tested (backend: real per-tick dispatch through `_dispatch_segment`
  > proves a non-empty map appears mid-render even at cap=1; frontend: fallback
  > precedence tests) but have not yet been observed in a live render.
  >
  > **CONFIRMED WORKING (2026-07-10, owner-run):** criterion 1 (simultaneous
  > segment highlighting) verified live — segments render in parallel, AND
  > separately-confirmed: chapters also render in parallel with each other.
  > **W-PAR Phase 1 / M-PAR-3 visual check now PASSES.** This unblocks Phase 2
  > (dedicated render monitor, above) from its M-PAR-3 gate.
  >
  > **Separately found while verifying (not a regression, a pre-existing config
  > gap):** owner raised `plugins/tts_xtts/manifest.json`'s `max_concurrent_workers`
  > from 2 to 4 expecting more parallel XTTS renders; observed cap stayed at 2.
  > Root cause (confirmed via code read, 2026-07-10): **three independent knobs
  > currently coincide at 2**, and the manifest is only a *ceiling*, never the
  > actual requested cap: (1) `plugins/tts_xtts/manifest.json` `max_concurrent_
  > workers` — a ceiling only; (2) the Studio-level setting `tts_parallel_cap`
  > (`app/db/state_settings.py:22`, default **2**, changeable only via
  > `POST /api/settings` — **no UI control exists for this yet**, confirming the
  > owner's own suspicion); `resolve_effective_cap` (`cap_settings.py:119-156`)
  > computes `min(tts_parallel_cap, manifest_max)`, so the manifest can only ever
  > lower the effective cap, never raise it past whatever this setting says; (3)
  > the XTTS plugin's own in-process `WarmWorkerManager` worker pool
  > (`plugins/tts_xtts/plugin/core/implementation.py:66-80`,
  > `warm_worker.py:328-340`) reads the manifest **once via `@lru_cache` and
  > freezes it at first use for the life of the process** — a manifest edit made
  > while Studio is already running is invisible to the actual worker-pool size
  > until the process restarts. To genuinely reach 4 concurrent XTTS renders, all
  > three must move together: manifest → 4, `tts_parallel_cap` (or
  > `tts_engine_caps["xtts"]`) → 4 via `POST /api/settings`, AND a process
  > restart. **Follow-up scope, not yet a task:** exposing `tts_parallel_cap`/
  > `tts_engine_caps` as an actual UI control (Phase 2's design doc already lists
  > "per-engine cap sliders" as explicitly deferred, §"Power controls") and/or
  > making the manifest ceiling and the settings-cap visibly reconciled so this
  > three-knob interaction isn't silently confusing.

---

## W-QS — Quiet Studio visual redesign *(done — for the record)*

Plan: [reference/quiet_studio_migration/README.md](reference/quiet_studio_migration/README.md) · registered in [master README](master_fix_plan/README.md)

- [x] P0 fonts · P1 token re-skin · P2 forms/Switch · P3 status/progress · P4 glass audit · P6 demo baseline
- [ ] P5 sub-task B: `--accent` → `--action-primary` 94-file rename *(deferred — owner-gated; alias kept as a permanent compat pointer)*

---

## W-PERF — Per-span performance metadata / casting export *(proposal — not scheduled)*

Plan: [proposals/performance_script_model/README.md](proposals/performance_script_model/README.md) · registered in [master README](master_fix_plan/README.md)

- [ ] Design decision: schedule it? Shares the span/DB model with sub-sentence assignment (012) — the two must ship together or the DB migrates twice
- [ ] Canonical performance-script JSON format ([01](proposals/performance_script_model/01-canonical-json-format.md))
- [ ] Rich character profiles + AI extraction pipeline ([02](proposals/performance_script_model/02-character-profiles-and-extraction-spec.md), [05](proposals/performance_script_model/05-ai-extraction-agent-prompt.md))
- [ ] DB schema changes ([03](proposals/performance_script_model/03-db-schema-changes.md))
- [ ] Multi-target export layer ([04](proposals/performance_script_model/04-export-targets.md))
- [ ] Plugin-contract addition: `behavior` block fields (`export_format`, `supports_per_span_voice`, `supports_emotion_style`) — not yet in the contract

---

## Plugin SDK / contract — Stage 3 *(done — for the record)*

Plan: [final_release/stage3_sdk_migration_plan.md](active/final_release/stage3_sdk_migration_plan.md)

- [x] S1–S10: versioned plugin SDK + communication contract migration complete; `synthesis_mixed` → `tts_mixed` rename done
- [x] C-1 residue: `app_adapter.py`'s 11 module-level `from app.*` imports (both engines) fixed 2026-07-11 — `studio_plugin_sdk` gained 5 new app-adapter-contract exports (`BaseVoiceEngine`, `EngineHealthModel`, `EngineManifestModel`, `EngineExecutionError`, `EngineRequestError`); both files migrated; `test_s4_import_cleanliness.py`/`test_s5_import_cleanliness.py` now include `app_adapter` in their target list (the actual gap that let this regression through originally); spec bumped to `plugin-contract.md` 1.5.0. Function-body imports in bake/segments/standard_handler remain — confirmed still the intentional, documented S9 residue (deferred, not a regression; see [final_release/01](active/final_release/01_discrepancies_and_corrections.md) and `stage3_sdk_migration_plan.md`), not touched in this pass.

---

## Milestone 1 — Safe base *(done)*

- [x] **001** — Foundation cleanup — [task file](master_fix_plan/tasks/001-foundation-cleanup.md)
  - [x] QW-1: remove dead deps (`clsx`, `tailwind-merge`, `mistralai`, `beautifulsoup4`)
  - [x] QW-2: delete legacy scripts (`audiobook.py`, `audit_routes.py`, `text_progress_demo.html`)
  - [x] QW-3: migrate `.coveragerc` settings into `pyproject.toml`, delete `.coveragerc`
  - [x] QW-4: add `last_test.json` to `.gitignore`
  - [x] QW-5: delete confirmed-dead FE stubs
  - [x] QW-6 *(deferred to 005)*: dead CSS selectors in `components.css`
  - [x] QW-7: fix 5 hardcoded-color `§2.2` violations
  - [x] QW-8: audit/trim `shared/` barrel exports

---

## Milestone 2 — Two-level IA port

- [x] **002** — Wire orphaned features — [task file](master_fix_plan/tasks/002-restore-lost-functionality.md)
  - [x] WIRE-1: mount `VoiceDropzone` in the New Voice modal (samples at creation + duration validation)
  - [x] WIRE-2: expose `VoiceModules` as a live "Module Settings" tab on `/engines`
  - [x] WIRE-3: swap `SearchableSelect` into speaker-assignment `<select>`s

  > 👁 **VISUAL CHECK — 002 complete**
  > - **WIRE-1:** Create a new voice → verify you can drop/upload sample files in the modal and see duration validation feedback
  > - **WIRE-2:** Open `/engines` → confirm a "Module Settings" tab exists and shows per-engine settings
  > - **WIRE-3:** Open speaker assignment → confirm dropdowns are searchable (type to filter)

- [~] **003** — Book/Chapter IA live-app port — [task file](master_fix_plan/tasks/003-ia-live-app-port.md) · [IA plan](active/book_view_ia_proposal.md) · [port tasks](reference/book_view_redesign/tasks/)
  - [x] Two-level shell: Contents / Cast / Lexicon / Publish / Backups tabs
  - [x] Chapter Workspace + chapter switcher + last-edited bookmark
  - [x] Review redesign: left rail + load-on-select
  - [x] Cast panel 3-tier + chapter-scoped temp characters
  - [x] Bookmarks + jump-to-next-unrendered
  - [x] RST-1 per-row live progress bar
  - [x] RST-2 chapter play via global player
  - [x] RST-3 audio download
  - [x] RST-4 destructive-action guards (rebuild / large-chapter / delete confirms)
  - [x] RST-5 in-Studio source edit
  - [x] RST-6 chapter default-voice picker
  - [x] RST-7 engine-unavailable banner
  - [x] Book-scope pronunciation Lexicon (`apply_lexicon` wired across all render paths)
  - [x] RST-8 segment-aware player *(done — see task 004 row below, 2026-07-10; this line was stale, RST-8 was never actually owner-deferred, it just moved to a dependent task and completed there)*
  - [x] Per-span range assignment *(already shipped — `chapter_segments` is the span table, `_apply_range_assignment()` is the backend split; word-boundary snapping shipped 2026-07-17, PR #143, plan archived at [span_word_boundary_snapping](active/archive/span_word_boundary_snapping/README.md). Remaining gaps: spans don't survive source-text resync — now scoped in [span_resync_preservation](proposals/span_resync_preservation.md); undo is generic U1 work, not span-specific.)*
  - [x] DC-1b dead-tree deletion *(CLOSED 2026-07-16 as will-not-delete, not "still blocked" — re-verified again and coupling grew further: `App.tsx` now mounts a real, rendered `/project/:projectId/details` route directly into `ProjectDetailPage`→`ChapterEditorPage`, and the live `Book/BookLayout.tsx` now imports a brand-new `ChapterEditor/components/DirectorsConsole` subtree that didn't exist at the 2026-07-12 check. Zero files in either tree are orphaned or transitively-dead-only. Deleting would require first detaching a mounted route and re-homing `DirectorsConsole` — a real behavior/architecture change out of scope for dead-code cleanup, so this task is closed rather than re-deferred; see [02_frontend_dead_code_removal.md](active/simplification/02_frontend_dead_code_removal.md) 2026-07-16 audit correction)*
  - [x] Follow-up: fix the underlying XTTS synthesis failure surfaced by [task 015](reference/book_view_redesign/tasks/015-surface-xtts-worker-error-on-failure.md) (diagnostics shipped; root-cause fix still open) *(RESOLVED 2026-06-19 by commit `8b9ae90a` — warm-worker orphaned stderr reader corrupted 2nd+ render markers; revert-checked test `test_every_job_receives_its_own_markers`; closure confirmed by audit 2026-07-01)*
  - [x] Follow-up: live-verify XTTS progress relay + segment highlights; check task_id mismatch if highlights don't fire ([task 019](reference/book_view_redesign/tasks/019-relay-xtts-progress-over-http.md)) *(RESOLVED — relay live + extended by the W-MIX-LA series; owner live-verified the synthesis core 2026-06-29)*

  > 👁 **VISUAL CHECK — 003 substantially done (RST-1..7)**
  > Open any book with multiple chapters and some rendered audio:
  > - Book view shows **Contents / Cast / Lexicon / Publish / Backups** tabs (not the old 5-stage pipeline)
  > - Open a chapter → Chapter Workspace loads; chapter switcher (prev/next) works; last-edited chapter remembered on return
  > - Contents tab: each chapter row shows a **live progress bar** while rendering (RST-1)
  > - Contents tab: **Play** button plays the chapter audio via global player (RST-2)
  > - Contents tab: **Download** button downloads rendered audio (RST-3)
  > - Attempt rebuild / delete → confirm dialog appears before proceeding (RST-4)
  > - Chapter editor has an **Edit Source** action that opens the source text inline (RST-5)
  > - Chapter editor shows a **Default Voice** picker in the header (RST-6)
  > - Disable an engine → verify the **engine-unavailable banner** appears (RST-7)
  > - Lexicon tab exists; adding a word applies it when rendering

- [~] **004** — Audio player + waveform scrubber — [task file](master_fix_plan/tasks/004-audio-player-completion.md) · [scrubber plan (W0-1 history)](active/audio_player_waveform_scrubber/README.md) · [completion plan (W2-3 + RST-8)](active/audio_player_completion_004/README.md)
  - [x] W1: make player scope-agnostic — remove `altScope`/`switchScope`, implement `fitsLegibly()`.
  - [x] RST-8: segment/block navigation *(2026-07-10, `audio_player_completion_004` tasks 003-005 — reshaped after research found the real gap was narrower than originally scoped: fixed a real bug where manual Prev/Next on the global bar restarted a multi-segment audio block instead of advancing/going back a block, by normalizing the playback queue to one entry per block; added a plain "Block N of M" passive subtitle. No new segment-model abstraction was needed — `useChapterPlayback.ts`'s existing queue mechanism already carried segment playback end-to-end, just with this one navigation bug.)*
  - [x] W2 (PlayerBar tape wiring + CSS/tests): *(2026-07-10, `audio_player_completion_004` tasks 001-002 — wired the already-built `WaveformTape`/`WaveformTapeZoom`/`WaveformTapeMinimap` into the live `PlayerBar`: open/close via `AudioLines`, paged↔moving motion toggle, 600s duration cap with plain-bar fallback, tape CSS, tests.)*
  - [x] W3 (peaks source abstraction, backend sidecar, source-swap): *(2026-07-10, `audio_player_completion_004` tasks 006-009 — reshaped from the original design after research found the planned orchestrator-completion chokepoint doesn't fire for this app's default engines. Shipped instead: a self-describing, versioned `<chapter>.peaks.json` sidecar computed lazily on first request by the chapter-asset serving route (not a manifest/DB field — that layer is scaffold-only in production), staleness detected by comparing a file-stat stamp; frontend `usePeaks`/`PlayerBar` source-swap seam. "Virtualization" was scoped out — verified false premise, the tape/minimap renderers are already O(visible-bars) regardless of array length.)*
  - Dropped from scope (not part of 004): the drafted "Play book" whole-book affordance — found duplicative of the already-shipped `ContinueListeningCard` (`scope:'book'`); logged as a future backlog item if chapter-chaining from the Library page is still wanted. Full completion audit + adversarial review passed (3 real findings fixed: a route-side 500→404 hardening, a decode memory/CPU DoS guard, a minimap peak-source bug); see `audio_player_completion_004/status.json` for detail.

  > 👁 **VISUAL CHECK — 004 (owner sign-off pending, see `audio_player_completion_004/02-roadmap.md`)**
  > Open a chapter with rendered segments:
  > - Global player works without a scope toggle — plays book-level and chapter-level audio from the same bar
  > - **Segment navigation:** prev/next segment buttons correctly jump between distinct audio blocks (not mid-block restarts); a "Block N of M" label shows during segment playback
  > - **Waveform tape** opens via the `AudioLines` toggle for chapters under 10 minutes — scrub by dragging; playhead follows; motion toggle (paged/moving); minimap; zoom presets
  > - A chapter over 10 minutes still renders the tape, fed by a server-computed peaks sidecar (check the network tab for a `/assets/peaks` request) instead of a full browser decode
  > - Reduced-motion: tape renders statically, no animated transitions, motion toggle disabled

---

## Milestone 3 — Simplification

- [ ] **005** — Code simplification — [task file](master_fix_plan/tasks/005-code-simplification.md) · [simplification plan](active/simplification/00_overview.md)
  - [x] FE dead-code ([simplification/02](active/simplification/02_frontend_dead_code_removal.md)): DC-1a extract shared (`VoiceProfileSelect`/`useChapterStatus`/`ResyncPreviewData`/`ChapterEditorTab`) — no payoff, not attempted since DC-1b is now permanently closed as will-not-delete, ~~DC-2 stub-route infra~~ / ~~DC-3b safe independent deletions~~ **done 2026-07-04 (`9d03e483`; found `VoiceModulesPanel` live inside a file slated for wholesale deletion — kept it, surgically stripped only the dead stub)**. **DC-1b CLOSED 2026-07-16 as will-not-delete (not "blocked"):** re-verification found coupling grew further still — `App.tsx` mounts a live `/project/:projectId/details` route into `ProjectDetailPage`→`ChapterEditorPage`, and `Book/BookLayout.tsx` now imports a brand-new `ChapterEditor/components/DirectorsConsole` subtree. Zero orphaned/transitively-dead-only files exist in either tree; deleting would require detaching a mounted route first, which is an architecture decision out of scope for dead-code cleanup — see audit correction in doc 02.
  - [~] Styling separation ([simplification/03](active/simplification/03_styling_separation.md), execution plan [styling_separation_execution/](active/simplification/styling_separation_execution/README.md)) — **ST-1–ST-4 done 2026-07-10** (mastermind run: `52be0584`…`20c31386`): dead-selector deletion, `components.css`→11-file domain split (`theme/components/{core,nav,book,book-tabs,publish,activity,shared,player,voice-lab,review-tools,misc}.css`, grew from the doc's original 5-file scheme since two feature areas were added after it was written), 6 new shared label classes + owner-requested tokenization (hardcoded colors/spacing/type-size substituted for existing `tokens.css` values wherever an exact match existed), 20 files' inline styles converted to classes (`EditTab.tsx` dropped — confirmed dead code), spec bumps (`code-organization.md`→1.2.0, `design-system.md`→1.14.0), new CI guard (`scripts/check_hardcoded_styles.py`) against hardcoded-color/spacing regressions. Full suite green (218 files/1810 tests). Also removed a second dead selector (`.action-menu-item:focus-visible`, `utilities.css`) found during this close-out pass. **U3/U9 status corrected 2026-07-16:** U3's `--type-*` token scale already exists in `tokens.css` (matches `design-system.md:234-251`) — only real-page *adoption* (~11/615 `var(--type-*)` refs) is open, tracked under `active/site_redesign_rollout/`. U9's `GhostButton` JS-hover removal was attempted then reverted — adversarial review found the component's inline `style` prop sets border/color/background explicitly, which overrides CSS pseudo-classes and made hover a no-op; `GhostButton` is unchanged from before this PR (see `10_ux_improvements.md` U9 for the full finding). The four-way input-class consolidation remains open, redesign-scale. U10 z-index still not done; owner visual sign-off still pending.
  - [~] Large-file splits ([simplification/04](active/simplification/04_large_file_splits.md)): LF-1 `useStudioChapter.ts` *(blocked on DC-1a)*, ~~LF-2 `EngineCard.tsx`~~ **done 2026-07-04 (792→562, `b9b1dcc6`)**, ~~LF-3 `PredictiveProgressBar.tsx`~~ **done 2026-07-04 (789→668, `7cd888f8`; stopped short of a risky stateful-hook extraction — file still >600, revisit if needed)**, ~~LF-4 `MetadataEditorModal.tsx`~~ **done 2026-07-04 (717→298, `aebf70ec`)**, ~~LF-5 `App.tsx`~~ **done 2026-07-04 (630→560, `fc02e769`; extracted `useToast`/`useStartupOverlay`/`useChapterRedirect`; route table + shell composition stay per spec)**, LF-6 `progress/service.py` **partially done 2026-07-04 (`8d2ee030`; ETA-quiescence gate re-verified clear — last ETA-lane commit was `dc5b13ea` (W-PAR enable-gate), now only awaiting owner visual sign-off, not further code changes; extracted the emit-gate (`_claim_emit_slot`/`_should_emit_unlocked`/`_apply_progress_regression_guard`) into `progress/emit_gate.py` via `EmitGateMixin`, 1503→1283 lines. Deliberately did NOT extract `enrich()` — the ~450-line §4A math kernel is dense with numbered historical bug fixes (FIX 2/3/6, job-47213119, Task 006-A/006-B) that a prior dedicated unification effort had to carefully unwind; a mechanical cut-paste risks transcription errors "tests pass" wouldn't necessarily catch. Left for a follow-up session with closer supervision.)**, ~~LF-7 `tts_server/server.py`~~ **done 2026-07-04 (1351→914 + new `plugin_staging.py` 493 lines, `b00ed04e`; security-sensitive plugin-staging pipeline extraction, every containment/symlink check preserved verbatim)**, ~~LF-new `tts_server/plugin_loader.py`~~ **done 2026-07-16 (998→738 + new `plugin_manifest.py` 311 lines; manifest parsing/validation extracted, instantiation/registry stayed; `code-organization.md`→1.3.0)**
  - [ ] Older split audit ([file_split_plan](active/file_split_plan.md), perf-gated): `QueueItem.tsx`, `useJobs.ts`, `ChapterHeader.tsx`, `useQueueSync.ts`, `scriptViewProgress.ts` — reconcile overlap with LF-* *(audit 2026-07-01: `useJobs.ts` 288, `useQueueSync.ts` 196, `scriptViewProgress.ts` 95 — already right-sized, struck; only `ChapterHeader.tsx` 615 remains live; file_split_plan.md retired into simplification/04)*
  - [~] Backend cleanup ([simplification/05](active/simplification/05_backend_cleanup.md)): ~~BE-1 dead code~~ **done 2026-07-04 (4/5 sub-items — `2c0b6f83` web.py, `bfbbdf02` service.py; 5th `schema_data` item confirmed invalid, not attempted)**, ~~BE-2 `INTENDED_*`/`FORBIDDEN_*` constants~~ **done 2026-07-04 (`38492c46`; enforced import-boundary test for orchestrator.py/bridge_utils.py, comment-only for the other 10 modules; flagged a pre-existing real boundary drift in `progress/service.py` — documented, not silently fixed)**, ~~BE-3 `events.py` command-set dedup~~ **done 2026-07-04 (`ef264ba1`; target was `app/api/contracts/events.py`)**, ~~BE-4 duplicate segment-timing math~~ **done 2026-07-04 (`0cba74d8`; shared formula → `app/utils/render_timing.py`, kept outside the two-process boundary; found and preserved a real pre-existing `model_load_seconds` None-vs-0.0 divergence rather than silently unifying it)**, ~~BE-5 per-request `_resolved_segment_profiles`~~ **done 2026-07-04 (`a202ad44`)**, BE-6 rename/move `app/jobs` package — deliberately deferred to its own dedicated session per the plan doc's explicit "do it alone, not bundled" (97 refs/~40 files, widest blast radius of anything in this phase)
  - [x] Plugin consolidation ([simplification/06](active/simplification/06_plugin_consolidation.md)): ~~PL-1 one SDK context factory~~ **done 2026-07-04 (`746ba0a9`)**, ~~PL-2 shared segment-marker handler + `_group_needs_render`~~ **done 2026-07-04 (`ffbac939`; chokepoint-audited against all 4 original `on_output` closures before unifying — 2 real non-formula differences preserved via explicit params, not engine_id branches; `group_needs_render` upgrades xtts/voxtral from bare `exists()` to mixed's stricter validated-artifact check — recorded as a deliberate behavior change in `queue-jobs.md` v1.11.1 §3.7, which also flags a residual drift in `standard_handler.py`'s `_group_is_done`, spun off as a follow-up task)**, ~~PL-3 app-adapter helpers→`BaseVoiceEngine`~~ **done 2026-07-04 (`1c919456`; `run_test` correctly landed on `StudioTTSEngine`, not `BaseVoiceEngine` as originally scoped)**, ~~PL-4 shared XTTS synthesis loop~~ **done 2026-07-04 (`d692f030`; highest-risk task, done solo per plan guardrail — extracted `_run_synthesis_loop` from `_run_serve_job`/`main()`, 6 genuine divergences preserved as explicit params, parity locked by a new byte-identical-output test)**, ~~PL-5 remove ABC stubs~~ **done 2026-07-04 (`bf8755ec`)** *(PL-6: xtts adapter is LIVE — do NOT delete, INV-5)*
  - [~] Logic-audit cleanup ([final_release/09](active/final_release/09_logic_audit.md)): ~~D1~~/~~D2~~ dead FE files + ~~D3~~ registry stub (all done — D2 `commit c552f5d0`), R1 dup `_ensure_plugin_package_hierarchy` (done, prior session), ~~R2~~/~~R3~~ adapter+Voxtral dedup **done 2026-07-04 (`fb99def5`, `9bed6f22`; R2 mostly already resolved by plugin consolidation, only a trivial residual duplicate remained)**, R6 unify queue/jobs overlay (not attempted — longer-term item); ~~F14 `ScriptView` `data.paragraphs` crash~~ / ~~F15 `useInitialData` fetch-failure signal~~ **done 2026-07-04 (`0dc0b0d5`, hardened by a Fable adversarial review pass in `c4040090` — 5 escapes fixed and ratcheted into `docs/checklists/code-review.md`)**; ~~B14~~/~~B15~~/~~B16~~/~~B17~~ test-infra **done 2026-07-04 (`4df48ef8` B15 new test, `f83b84f2` B16 tmp_path fix; B14/B17 investigated and resolved with no code change needed — both were stale reports of already-fixed issues)**; ~~T5~~ coverage-honesty spot-check **done 2026-07-04 (8/10 hit rate; 2 real coverage gaps found — both closed same day, `002fec82` (`app/db/queue.py:265-266` chapter-reset-on-failure test + `frontend/src/hooks/useQueueSync.ts:143-145` unhandled/skipped-suppression tests), each verified mutation-sensitive — see [17_test_quality_audit.md](active/final_release/17_test_quality_audit.md))**
  - [x] Text-ops package ([organizational_cleanup §2](active/organizational_cleanup.md)): DONE — already consolidated at `app/utils/text/` (not `app/text/` as originally worded); 0 stray files remain; corrected 2026-07-14.

  > 👁 **VISUAL CHECK — 005 styling separation**
  > In both **light and dark** themes:
  > - Buttons and inputs look consistent across all pages — no rogue sizes, colors, or border radii
  > - No visible regressions from the dead-CSS removal (spot-check the demo/styleguide route `/#/styleguide`)
  > - Type scale feels consistent — body, labels, headings all use the token scale, nothing obviously oversized or tiny

- [ ] **006** — Backend namespace rename + code-org — [task file](master_fix_plan/tasks/006-backend-namespace-and-codeorg.md) · [agnostic tasks](active/master_agnostic_tasks.md)
  - [ ] Rename `plugins/` → `tts_engines/` — update all importers, manifests, `PLUGINS_DIR`, conftest, docs
  - [ ] Namespace block remainder ([master_agnostic](active/master_agnostic_tasks.md)): rename voice namespace, reserve `plugins/` for app-behavior extensions, move engine-owned tests/fixtures into bundles, `mixed.py`→`composite.py` decision
  - [x] `speakers.py` decomposition — DONE 2026-07-14: split into a facade (`app/db/speakers.py`, ~73L) + `speakers_paths/settings/crud/sync.py`, imitating `state.py`'s existing facade precedent; zero import-site changes needed
  - [x] API router sub-package restructure — DONE 2026-07-14 (scoped): `generation.py`/`engines.py` (the two oversized routers) split into facade + sub-router files; all other routers already well-decomposed via filename-prefix grouping, confirmed not to need the same treatment
  - [ ] doc-06 cleanup ([final_release/06](active/final_release/06_code_organization_cleanup.md)): `transient/` consolidation, `app/infra/subprocess` implement-or-delete, `app/infra/{cache,events,db}` stub decision (C-3), normalize API error handling (`api/index.ts`) *(audit 2026-07-01: `app/infra/{subprocess,cache,events,db}` scaffold + `StorageManager`/`TRANSIENT_DIR` ALREADY BUILT; `api/index.ts` error-handling claim is a false positive — all 6 functions already route through `parseApiResponse`)*
  - [x] doc-06's gate dev-only routes (`/progress-test`, `/event-stream`) behind `import.meta.env.DEV` — DONE 2026-07-14 (new `runtimeDebug.ts`'s `getDevRoutes()`)
  - [x] doc-06's split `App.tsx` (QueueDrawerHost/NotificationsHost/StartupGate) + `runtimeDebug.ts` — DONE 2026-07-14 (599L→425L; route-table prop-wiring bulk not further reducible without a follow-up route-element-builder extraction, flagged honestly rather than claimed as fully met)
  - [x] doc-06's unify input styles (`.input-field`→`.form-input`) — DONE 2026-07-14 (`CharactersTab.tsx`'s 2 usage sites; visually verified both themes before removing the old CSS rule)
  - [ ] `JobHandlerRegistry` / plugin-driven reconciliation (`engine.check_output`) decision ([master_agnostic](active/master_agnostic_tasks.md) Phase 12)
  - [x] Phase-12 owner decisions: generic plugin setup-loop (DECIDED 2026-07-10: deferred — see [master_agnostic](active/master_agnostic_tasks.md)), voice-settings placement (relocated from Script Editor to catalog-card action menu, 2026-07-09), ~~system-API surface for 3rd-party controllers~~ (verified adequate + a real unauthenticated-docs-route gap found and fixed 2026-07-09 — S12, see `active/master_agnostic_tasks.md`), ~~Settings→API tab honesty~~ *(resolved 2026-07-09: `/settings/api` already redirects to `/integrations`; `ApiGuidePanel.tsx` content corrected to match the real `/api/v1/tts` gateway — see master_agnostic_tasks.md)*
  - [x] `MobileNavDrawer` focus-trap fix (a11y — also tracked in 008)
  - [x] `CONTRIBUTING.md` plugin/template docs + plugin-doc prep for release (Phase 13) — added plugin lifecycle section to CONTRIBUTING.md, closed submission-guidelines gaps, fixed a real template/dispatcher drift (template taught a not-yet-live S9 handler calling convention)
  - [x] Vite ECONNRESET triage — confirmed benign dev-only StrictMode/proxy race, no runtime data loss (see [master_agnostic](active/master_agnostic_tasks.md) line 103)
  - [x] Large-book load timing check (2026-07-09): list/Contents-view load is already fast (~60-100ms for a real 28-chapter/730K-char project) — the real bug was `useChapterLoader` re-fetching the *entire* project chapter list (incl. every other chapter's full text) just to load one chapter, repeated on every WS tick and completion-poll tick; fixed to call the single-chapter endpoint instead (~4ms/~700B vs ~60-100ms/~780KB per call) — see `master_agnostic_tasks.md` line 104
  - [ ] Post-release/opportunistic: react-refresh lint warnings (11, demo stages), demo transport nits (`restart()`/`play()`/`warnedRoutes`)

  > 👁 **VISUAL CHECK — 006 complete**
  > - App starts cleanly with no import errors in the console
  > - On mobile viewport: open the nav drawer → **Tab key stays trapped inside** the drawer until it closes (focus-trap fix)
  > - XTTS and Voxtral render a test segment successfully end-to-end (plugins still load under the new path)

---

## Milestone 4 — Feature + polish backlog

- [~] **007** — Voice taxonomy v2 Phase G — [task file](master_fix_plan/tasks/007-voice-taxonomy-v2.md) · [detail](active/final_release/04_voice_metadata_and_tagging.md)
  - [x] G1–G3: add `language` (multi-select) + `style` (multi) attributes *(done 2026-07-04; `accent` already shipped in taxonomy 1.0 per the 2026-07-01 audit — not touched)*
  - [x] G4 UI: Edit Metadata modal gained Language/Style multi-select chip sections; catalog pills needed no code change — `voicePillsFromMetadata`/`VoicePillRow` already render `attributes` generically as tinted "extended" pills with "+N" overflow *(done 2026-07-04, pending owner 👁 visual check below)*
  - [x] G5: HF bundle tag mappings (`as-language-*`/`as-style-*`; `as-accent-*` already existed) *(done 2026-07-04)*
  - [x] G6: bumped `voice-taxonomy.json` (1.0→2.0) + `voice.schema.json` (additive `language`/`style` array props) + `voice-bundles.md` (1.3.0→1.4.0) + `docs/user-guide/voice-tags-icons.md` + `wiki/Changelog.md`, all with changelog rows *(done 2026-07-04)*
  - [ ] C6: copyable icon image-generation prompt (owner direction) — separate scope, not part of this pass

  > 👁 **VISUAL CHECK — 007 complete**
  > Open the Voice Lab with several voices that have metadata:
  > - Each voice card shows **tinted pills** for language, accent, and style — each category has a distinct color tint
  > - When a voice has many tags, extra pills collapse to **"+N more"** rather than overflowing the card
  > - Editing a voice lets you set language (multi), accent (one), and style (multi) from controlled dropdowns
  > - In both light and dark themes — pill contrast is legible in both

- [~] **008** — UX / A11y / Perf backlog — [task file](master_fix_plan/tasks/008-ux-a11y-perf-backlog.md) · [UX detail](active/final_release/10_ux_improvements.md) · [A11y/Perf detail](active/final_release/11_accessibility_and_performance.md)
  - [x] A4 icon-button aria-labels · A6 live regions · A7 JsonSchemaForm labels · A8 StatusOrb `role=img` · A10 landmarks
  - [x] P7 interval hygiene · P8 bundle chunking · P9 mega-payload debounce · P10 model warm-holding spike
  - [ ] A5 keyboard drag-reorder *(deferred — no Framer Motion public API)*
  - [x] A11 --text-muted contrast fix *(done — tokens.css:35,266, AA-passing values both themes; audit 2026-07-01)*
  - [x] A12 prefers-reduced-motion guards *(done — global CSS guard in base.css:1-16 with documented `.is-running` exemption; CSS-only approach, no useReducedMotion hook; audit 2026-07-01)*
  - [x] U1 undo toasts — DONE 2026-07-14 (deferred-delete + "Undo" pattern across `useVoiceManagement`/`useProjectActions`/`useProjectLibrary`/`CharactersTab`/`useGlobalQueue`)
  - [x] U2 focus management — DONE 2026-07-14 (focus-trap audit across `AddChapterModal`/`TempCharacterModal`/`VoiceModals`/`ProjectLibraryPage`)
  - [ ] U4 startup experience
  - [x] U5 queue-drawer affordances — DONE 2026-07-14, no code change: literal TASKS.md wording already fully satisfied by the existing `AppShell`/`NavRail` queue-toggle button + `queueCount` badge; gap confirmed zero
  - [x] U6 guided failure recovery — DONE 2026-07-14 (`QueueItem.tsx`'s `handleSegmentRetry` catch now surfaces a toast, not just `console.error`)
  - [ ] U7 ActionMenu correctness — dropped from scope 2026-07-14 per owner decision, no confirmed bug exists
  - [x] U11 resync→queue flow — DONE 2026-07-14: was genuinely missing in both `useChapterText.ts`/`useStudioChapter.ts` resync-confirm paths, now wired (`force=true`, mirroring "Rebuild Audio" semantics)
  - [x] U12 cancel single queued job — DONE — already implemented in `frontend/src/components/queue/QueueItem.tsx` (Cancel Job button + cancelled-status handling); corrected 2026-07-14.
  - [ ] U13 first-run onboarding
  - [x] U14 route transitions — DONE 2026-07-14 (`App.tsx`'s `<Routes>` wrapped in `AnimatePresence` + reduced-motion CSS guard)
  - [x] U15 navigation design review — DONE 2026-07-15 (`~/.claude/plans/audiobook-factory/archive/contextual-left-nav/`): left rail no longer shows a permanent/cut-off chapter list at any width; chapter switching lives in the Chapter Workspace header's `Contents ▾` dropdown, hardened to full ARIA listbox semantics (keyboard nav, focus management, 44px targets, aria-live status). Live-verified in browser; 4 review rounds + full regression green.
  - [x] U16 unified audio-player surface *(CONFIRMED delivered — single PlayerBar + playerBus scope toggle, no competing surface; doc 10 ticked; audit 2026-07-01)*
  - [x] R6-T7 responsive sweep — 1280/768/420px; CastPalette @420px, Voice Lab @390px — DONE 2026-07-14 ([master_agnostic](active/master_agnostic_tasks.md)); CastPalette confirmed structurally unreachable at ≤640px post mobile-mode-filter, VoiceLab verified clean at 390px, 2 new overflow risks fixed in toast/startup-overlay wrapping
  - [x] Stage-5 gate ([final_release/07 §4](active/final_release/07_frontend_themes_and_responsive.md)) — DONE 2026-07-14: new Playwright spec (`frontend/tests/e2e/a11y/mobile_mode_gate.spec.ts`) covers ChapterEditor mobile Booth/Queue drawer/Voices-empty-state × 2 themes; viewport×theme snapshots + axe contrast scans; keyboard-only walkthrough. Axe rollout decision **resolved 2026-07-09**: runs in CI now on every PR/main push (`a11y-axe` job, non-blocking via `test.fixme`), 3 pages × 2 themes — see [master_agnostic_tasks.md](active/master_agnostic_tasks.md) and [final_release/08 Stage 5](active/final_release/08_release_sequence.md) for the known-violations list and the "gate = list is empty" criterion.

  > 👁 **VISUAL CHECK — 008 A11y contrast**
  > - In dark theme: muted text (timestamps, helper labels, secondary copy) is **legible against the background** — not washed out
  > - Run `axe` in devtools on the book view and chapter editor — zero serious/critical violations

  > 👁 **VISUAL CHECK — 008 reduced-motion**
  > Enable **Reduce Motion** in your OS accessibility settings, reload:
  > - Progress bar breathing stripes are **static** (not animated)
  > - StatusOrb does not spin or pulse
  > - Page transitions are instant cuts, not slides or fades
  > - Waveform tape (if 004 is done) renders statically

  > 👁 **VISUAL CHECK — 008 UX flows** *(check each when implemented)*
  > - **U1:** Delete a segment → an **undo toast** appears with a timer and undo action
  > - **U4:** First load with no project → startup experience guides you to create one (not a blank screen)
  > - **U5:** Queue drawer has a clear affordance for opening (not hidden)
  > - **U6:** A failed render shows a **recovery action** — not just a red error state with no path forward
  > - **U13:** Brand-new install with no voices → onboarding flow explains what to do first

- [x] **009** — Security backlog — [task file](master_fix_plan/tasks/009-security-backlog.md)
  - [x] S6 WebSocket origin check · S7 rate-limiter docs · S10 secret-aware plugin settings · S11 ffmpeg quoting verified
  - [x] S12 dep bumps: ALL SATISFIED as of 2026-07-01 — vite 7.3.5, @babel/core 7.29.7, js-yaml 4.2.0; `npm audit` = 0 vulnerabilities *(re-run `npm audit` at release as hygiene)*

- [ ] **010** — Standalone plugin repos — [task file](master_fix_plan/tasks/010-standalone-plugin-repos.md) · [detail](active/final_release/05_standalone_plugin_repos.md)
  - [ ] Extract XTTS into standalone installable plugin repo
  - [ ] Extract Voxtral into standalone installable plugin repo
  - [x] Publish official registry JSON (catalog of installable engines) *(shipped — `app/engines/official_registry.py` + `GET` route in `app/api/routers/engines.py`; audit 2026-07-01)*
  - [x] Paste-URL install UI (install a plugin from a git URL) *(shipped — `OfficialRegistryPanel.tsx` install-from-GitHub form + `preview_github_plugin` endpoint; audit 2026-07-01)*
  - [ ] E2E acceptance test for the install flow + trust-warning test (5.3)
  - [ ] State/docs updates (6.1–6.3); update-flow test (5.2) *(post-v2)*
  - [ ] `synthesis_mixed` registration items (doc 05 §4.1 Group 4) *(M1 `tts_mixed` rename already done)*

  > 👁 **VISUAL CHECK — 010 complete**
  > - Open Settings → Engines (or equivalent) → paste a GitHub URL for the XTTS plugin repo
  > - Confirm the plugin installs, appears in the engine list, and can render a test segment
  > - Verify the registry card shows name, version, and description from the repo manifest

---

## Milestone 5 — Release *(owner-run, last)*

- [ ] **011** — Release gating — [task file](master_fix_plan/tasks/011-release-gating.md) · [release sequence](active/final_release/08_release_sequence.md)
  - [ ] Stage 1 (owner): manual XTTS / Voxtral / mixed render verification session
  - [ ] Stage 1 (owner): site-redesign live-app validation items 1–18 + manually verify fixed-but-pending Phase-11 behaviors ([site_redesign 99](reference/site_redesign_rollout/99_progress_log.md))
  - [ ] Stage 2: doc-06 cleanup checkpoint + Phase-11 closeout + doc-01 plan-file corrections (P-4 casting header, P-5 SDK directory-naming note, P-6 settings cross-ref)
  - [ ] Stage 4: voice metadata Phase G (→ 007) + standalone repos (→ 010) complete
  - [ ] Stage 5: perf P1–P6 confirmed; final broad `pytest` gate; axe baseline decision **resolved 2026-07-09** — CI-now, non-blocking (see [final_release/08 Stage 5](active/final_release/08_release_sequence.md))
  - [ ] Stage 6: ~~author missing specs~~ SP2/SP3/SP5/SP7 ALL EXIST (plugin-contract 1.4.0, voice-bundles 1.2.0, progress-presentation 1.8.2, install-distribution 1.2.0 — stale claim corrected 2026-07-01); remaining work = SP9 conformance cross-check against them ([final_release/18](active/final_release/18_canonical_specs.md))
  - [ ] Stage 6: wiki — W1/W3/W4 (doc-01 items: WAV/MP3 callout, responsive/theming/plugin-distro pages, Mixed Generation concept) *(W5–W20 already done)*; refresh 12 stale wiki screenshots
  - [ ] Stage 6: demo/showcase + `v1.html` screenshot refresh to current 2.0 UI; R6-T10 dead-code retirement (supervised, full-suite run)
  - [ ] Stage 6: Pinokio PK3 (publish wrapper — owner) · PK7 (demo bundle refresh, needs 007) · PK8 (smoke test macOS+Windows) · PK5/PK6/PK9/PK10 (update-flow hardening, deep-reset, version-pinning, bash-only doc)
  - [ ] Stage 6: SP9 spec-conformance cross-check pass *(gates the tag)*
  - [ ] Stage 6: release notes + install matrix + v2.0.0 tag
  - [ ] Stage 6 cleanup: strip planning scaffolding before squash merge; **before deleting spec-cited plans, repoint provenance** — specs link into `site_experience_north_star.md` (×9), `audio_player_scrubbing_waveform_proposal.md` (×3), the `v2_*` set, `site_redesign_rollout/`, `phases/phase_12_multilingual_*`

  > 👁 **VISUAL CHECK — Stage 1 (owner-run render verification)**
  > Run these in the live app — not tests, not the demo:
  > - **XTTS cold render:** queue a chapter with XTTS from a cold start — confirm the model-load preparing state shows, then synthesis begins with a correct ETA
  > - **Voxtral render:** queue a chapter with Voxtral — no preparing state, synthesis starts immediately, ETA is accurate
  > - **Mixed render:** queue a chapter with mixed XTTS+Voxtral groups — XTTS groups show preparing, Voxtral groups skip straight to working; overall progress and ETA are coherent
  > - **Cancel mid-render:** cancel a running job — confirm the queue clears cleanly, no orphan processes
  > - **Concurrent renders:** queue two books simultaneously — confirm fairness / priority mode behaves as configured

  > 👁 **VISUAL CHECK — Stage 6 demo + screenshots**
  > - Open `docs/demo/` in a browser — confirm it loads, all stages work, no broken assets
  > - `v1.html` screenshots reflect the current 2.0 UI (not old pre-redesign screenshots)
  > - Pinokio wrapper (PK8): fresh install on macOS → app launches, home screen loads, can create a project

---

## Unscheduled — design decisions pending

These plans exist but need a design/owner call before they become schedulable work.

- [~] **Chapter editor art-program** — Director's Console (Cast/Booth/Revise/Write) — [design doc](../workflows/chapter-editor-modes.md) *(design decisions resolved 2026-06-26; scaffold + wiring + all four tool bodies DONE 2026-07-10 — [archived plan](_archive/directors_console_activation/README.md); remaining catalog items below are real, tracked follow-on work, not silently dropped)*

  **Decisions resolved (see doc §13 for full detail):**
  - [x] Design decision: assignment granularity → Word / Sentence / Paragraph brush sizes; Sentence default; never raw segments
  - [x] Design decision: mutation-batching (B2) → event→collector queue→flush on gesture-end; render queued on mode-exit from Cast
  - [x] Design decision: Revise mode → in-place paragraph edit per segment; structural editing = labeled escape hatch; balanced split on buffer overflow (sentence boundary nearest midpoint, 80-char floor)
  - [x] Design decision: primary persona → narrator-first; Cast panel hidden until characters are assigned
  - [x] Design decision: quasimode → replaced by ambient auto-render + Booth play-what's-ready; no hold-Space v1
  - [x] Design decision: flag depth → session-only margin pins in v1; persistent + notes = post-v2
  - [x] Design decision: terminology → Cast / Booth / Revise / Director's Console / On Air (recording studio + authorship language)
  - [x] Design decision: left rail → slotted/extensible; demo placeholders for all future tool slots from day one; internal-only

  **Ready to build (after WL1) — sequence matters: scaffold first, then fill:**
  - [x] **Step 1 — Scaffold (must land before any individual tool):** create the `DirectorsConsole/` folder structure and tool registration system as defined in doc §17; stub all three tools (CastTool, BoothTool, ReviseTool) + demo placeholder slots for future tools (Casting Call, Script Supervisor, plugin); wire the Console so it renders registered tools in order. Each stub renders its icon + label + "coming soon" body. No real functionality yet — this is the skeleton that all subsequent work slots into. *(DONE 2026-07-03: built under `frontend/src/pages/ChapterEditor/components/DirectorsConsole/` — types, registry, ToolStub, Cast/Booth/Revise + three placeholder slots. Shipped dark: not yet imported by any mounted route/page — still gated on WL1 bug fixes B1-B4 before Cast mode work begins. **Naming collision flagged by frontier review (2026-07-03):** `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx` already exports a live, mounted `DirectorsConsole` for the demo site stage — two same-named exported components in the app. No live conflict today (verified zero cross-imports), but the wiring pass should rename or retire the demo pane first so a future `import { DirectorsConsole }` doesn't grab the wrong one.)*
  - [x] **Step 2 — Wire in + complete (DONE 2026-07-10):** archived plan at [_archive/directors_console_activation/README.md](_archive/directors_console_activation/README.md) — mounted the real `DirectorsConsole` into `BookLayout.tsx`'s `ChapterWorkspace` (replacing the `studio|review` toggle) and filled in Cast/Booth/Revise by porting the *already-working* logic from `StudioStage.tsx`/`ReviewStage.tsx` (both now deleted, fully superseded), plus a **fourth tool, Write** (full-source edit via `ChapterTextPanel`/`useChapterText`), which this doc's §7b specifies as first-class v1 and had never been scaffolded until this pass. Supersedes an earlier plan that would have hand-built a duplicate toggle without knowing this scaffold existed (see `_archive/chapter_workspace_merge_superseded/SUPERSEDED.md`). Full green gate clean (1807 frontend + 2252 backend tests, tsc/build/lint all clean) and live-verified by the orchestrator in-browser: all four modes render and function correctly, playback state persists across mode switches, only one chapter switcher exists. One pre-existing (not a regression) bug surfaced during live verification: `CastPalette.tsx`'s `CharacterRow` renders a `<button>` containing `ColorSwatchPicker`'s own `<button>` — invalid HTML nesting, flagged as a separate follow-up task, not fixed here (that file was reused unmodified per this plan's scope). **Already fixed as of PR #126** (`b87e1890`, Quiet Studio redesign) — restructured to `<div role="button" tabIndex={0}>`, with a regression test at `frontend/tests/unit/pages/Book/studio/CastPaletteNestedButton.test.tsx`; confirmed 2026-07-11, no work remains. Scope was deliberately capped at porting current functionality faithfully — the fuller catalog below (brush sizes, variation toggle, Stage Direction/Performance Cue, mutation batching, etc.) is real, specified work that `StudioStage`/`ReviewStage` didn't have either, so it remains open, not silently dropped.
  - [ ] Cast mode catalog additions: brush size selector (Word/Sentence/Paragraph), variation 3-way toggle, Match Voice eyedropper, Stage Direction (`S`)/Performance Cue (`P`) + Cue Editor, mutation-batching collector queue *(the base paint-assignment UI itself — swatch selection, click/drag span assign, cast sidebar — already ships, ported faithfully from `StudioStage`)*
  - [ ] Booth mode catalog additions: annotation gutter glyphs, playback speed control if not already present, session-only margin pins (line flags) *(karaoke highlight, click-to-seek, regenerate-segment, and an annotations panel already ship, ported faithfully from `ReviewStage`)*
  - [ ] Revise mode catalog additions: a real two-way segment split on buffer overflow *(needs a new backend endpoint to insert a segment row — confirmed none exists today; v1 always persists as one, possibly-long segment with a passive overflow indicator instead)* — the balanced-split **algorithm** itself is built and fully unit-tested, just not wired to an actual split since the backend can't yet support it
  - [x] Write mode: full-source editor tool — DONE, `WriteTool/` wraps the existing `ChapterTextPanel`/`useChapterText` verbatim, produced-chapter lock parity confirmed live
  - [ ] Render-on-mode-exit: queue changed segments on Cast→any switch; explicit tap in Booth bumps to top *(not built — Cast mode doesn't currently batch/queue on exit either, ported as-is)*
  - [ ] Ambient On Air indicator + render progress pill (visible from all modes)
  - [ ] Kill Script/Source-Text tab pair; kill per-span inline dropdowns; unify generate actions
  - [ ] A11y keyboard model: roving-tabindex composite manuscript, `C+N` keyboard load-brush, `Shift+Arrow` range select *(hard requirement)*

  **Future / post-v2 (not scheduled — see doc §16):**
  - [ ] Casting Call tool slot: AI speaker detection (seeds Cast mode; triage panel; re-detect never clobbers confirmed)
  - [ ] Script Supervisor tool slot: character discovery, chapter summaries, timeline, locations, scene breakdown, map
  - [ ] Session-persistent flags with written notes
  - [ ] Plugin tool slots (internal architecture reserved; external API deferred)
  - [ ] Dyslexia reading layer (`D` toggle: wider spacing, 65ch column, desaturated tints)
  - [ ] Narrow viewport / mobile collapse strategy

  > 👁 **VISUAL CHECK — chapter editor art-program** *(this checklist was written for the full catalog; items covering scope actually shipped in the 2026-07-10 pass are marked ✅-confirmed live, items describing catalog additions above that remain unbuilt are marked 🔜-deferred, not silently passed)*
  > Open a chapter in the editor:
  > - **Director's Console** (left rail) shows Cast / Booth / Revise / Write icons; active mode is unambiguously highlighted; future tool slots (Casting Call/Script Supervisor/Plugin) show placeholder icons — ✅ confirmed live
  > - Pressing `V` / `R` / `E` switches modes instantly; mode breadcrumb shown in header — 🔜 deferred (click-to-switch works; keyboard shortcuts not wired in this pass)
  > - **Cast mode:** tap a character in the Cast panel → voice chip loads; click a sentence → it takes that character's color (brush size = Sentence default); drag across sentences → assigns a run — ✅ confirmed live (ported faithfully from `StudioStage`). Leaving Cast mode triggers background re-render with On Air light — 🔜 deferred (render-on-mode-exit/On Air catalog item, not built)
  > - **Booth mode:** clean listening column; tap any line → audio plays from that point; karaoke highlight follows playhead — ✅ confirmed live, plus auto-plays on entry for a chapter with rendered audio. Margin pin `F` drops a session flag — 🔜 deferred
  > - **Revise mode:** click a segment → its text becomes editable inline; commit re-renders only that segment — ✅ confirmed live (segment-level, not paragraph-level — confirmed a paragraph can span multiple segments in this codebase's data model, so v1 scope is segment-level per the archived plan's Task 005 finding)
  > - **Write mode:** full chapter source editor, produced-chapter lock parity with Contents — ✅ confirmed live (new in this pass, not in the original catalog above)
  > - Switch modes rapidly — scroll position, playback position, and assignments are all preserved — ✅ confirmed live (playback state specifically verified to persist across Cast→Booth→Revise→Write switches)

- [x] **Dynamic recording-guide prompts** — archived plan at [_archive/dynamic_recording_guide/README.md](_archive/dynamic_recording_guide/README.md) *(DONE 2026-07-10)* — adds a "Suggest from voice qualities" action to the voice-profile Script Editor: given a voice's tagged Class/Gender/Age/Tone/Timbre/Pace, suggests a recording prompt matching one of 39 curated archetypes ([design-docs/reference/voice-archetypes/](../reference/voice-archetypes/README.md), also as `.csv`/`.json`, plus a new 52-entry (28 Tone + 24 Timbre) tone/timbre phrase-fragment dictionary for the composed-fallback path) when close, or composes a fallback otherwise. Augments `test_text` (a suggestion, not a forced replacement) — no backend/schema change needed, confirmed `test_text` already round-trips through the existing settings-save path. All 4 tasks done: fragment dictionary (authored directly by the orchestrator, not delegated), `suggestRecordingPrompt()` (scoring thresholds validated against real archetype data before writing tests), wiring into `ScriptEditor.tsx` (threaded the previously-unused `voiceMetadataMap` through `VoicesPage.tsx`→`VoicesModals.tsx`→`ScriptEditor.tsx`), green gate (131/131 relevant tests, full suite 1809 passing, tsc/lint/build clean). Live verification was partial: confirmed the app loads and the Voices page renders tagged voices correctly, but the exact click path to the Script Editor drawer wasn't found within budget, and one exploratory click accidentally triggered a real (non-destructive) `POST /api/speaker-profiles/{name}/build` job — no data lost, just recomputed an existing voice's latent. The button's correctness rests on thorough static-diff review + unit tests rather than an in-browser click-through; recommend a quick owner sanity check.
  - [x] **Follow-up (DONE 2026-07-12): archetype-matched sample text for "Generate Sample."** The 39-archetype dataset gained a `sample_text` field (a short TTS-showcase line, distinct from the longer `recording_prompt` written for a human voice actor). `suggestRecordingPrompt()`'s result now also carries `sampleText` (archetype match only, no composed-fallback guess). Backend: new `app/domain/voices/recording_archetypes.py` ports the same scoring algorithm and `submit_sample_test_job` (the shared job-builder behind `POST /{name}/test`) now auto-applies the matched sample text the *first* time a tagged-but-never-customized voice generates a sample — clicking "Generate Sample" on a fresh archetype-tagged voice gets a tailored line instead of the generic `DEFAULT_SPEAKER_TEST_TEXT`, and never overwrites anything already customized. New `app/db/speakers.py::profile_has_custom_test_text()` is the exact-key-presence check that makes "never customized" reliable. 10 new backend tests (Python matcher + real endpoint wiring, R1 revert-checked without git stash — a concurrent agent session shared this working tree, so stash was unsafe and a targeted in-place disable was used instead) + updated frontend suggester tests, full suites green.

- [~] **HuggingFace voice browse + upload** — [plan](active/v2_huggingface_voice_interface.md) *(LIVE as of 2026-07-03 — real `huggingface_hub` network client, router, and frontend Discover tab all wired; see per-item notes for what's genuinely done vs. still deferred)*
  - [x] Import flow: search HF Hub → inspect card + license → consent gate → download → register as local voice → annotate metadata *(DONE 2026-07-03 — `HFHubClient` in `app/domain/voices/huggingface.py` makes real HTTPS calls via `huggingface_hub`; `POST /api/voices/huggingface/import` in `app/api/routers/voices_huggingface.py` runs the full flow synchronously and writes `provenance = {"source": "imported", "author", "consent_ack": true, "created_at"}` — the correct §8.1 shape, not the north-star mockup's stale `source: "huggingface"`/`hub_id` shape. Deliberately does NOT call the engine-specific `build_voice_asset` — see next line.)*
  - [~] Build voice asset from downloaded audio *(NOT done as a distinct HF step — `app/engines/bridge.py`'s `build_voice_asset` is itself unimplemented for the TTS Server path (`NotImplementedError`). The import endpoint registers the downloaded reference audio as raw samples on a new voice profile; the user then picks an engine and clicks the existing "Build" action (`POST /api/speaker-profiles/{name}/build`, async orchestrator job) exactly as with any other new voice. Flagged for owner: an end-to-end async job that also triggers the build is a reasonable v2 but wasn't built here.)*
  - [x] Browse/search UI: card UI filtered to `audiobook-studio-voice` tag *(DONE 2026-07-03 — `frontend/src/pages/Voices/components/HuggingFaceDiscover.tsx`, real in-app search wired to `GET /api/voices/huggingface/search`, replaces `DiscoverPlaceholder` in the "🤗 Discover" tab of `VoicesPage.tsx`. Note: this reverses the R5-T4 scoping note in `DiscoverPlaceholder.tsx`/`07_phase_r5_platform.md` that explicitly deferred HF — done here on direct owner instruction this session; `DiscoverPlaceholder.tsx` itself was left on disk, just unused, since deleting it was out of scope.)*
  - [x] Export: bundle generator → `.asvoice.zip` for manual upload *(DONE 2026-07-03, gap closed 2026-07-12 — `POST /api/voices/huggingface/export` wraps `export_hf_voice_bundle` for an installed voice by id; still intentionally separate from `app.domain.voices.bundles.export_voice_bundle`, the existing on-disk `.voice.zip` exporter — the two bundle formats/use-cases were kept distinct rather than unified, matching the original plan's `.asvoice.zip` vs `.voice.zip` split. [huggingface_voice_upload plan](active/huggingface_voice_upload/README.md) task 002 (DONE 2026-07-12): the bundle now also includes the generated `README.md` (reusing `bundles.generate_readme_md`) and `icon.png` when present, both additive/optional; when a real sample is published but the local manifest has no `samples[]` (the common case), a `{"path": "samples/preview.mp3", "primary": true}` entry is synthesized into both the bundle's `voice.json` and the README so the on-Hub manifest and its own widget agree — verified live against a real installed voice's export.)*
  - [x] Upload to HF: push loose files via user token; auto-set `as-*` tags *(DONE 2026-07-03, gap closed 2026-07-12 — `POST /api/voices/huggingface/upload` extracts the exported bundle and calls `HFHubClient.upload_files`; requires a configured token, 422s otherwise (verified live). [huggingface_voice_upload plan](active/huggingface_voice_upload/README.md) task 003 (DONE 2026-07-12): switched from N sequential `upload_file()` calls (flattened directory structure, non-atomic, plus a separate best-effort tag-card push) to one `HfApi.upload_folder()` call — one atomic commit, structure preserved, `repo_type="model"` explicit on both `create_repo` and `upload_folder`. Signature change (`files: list[Path]` → `folder_path: Path`) rippled through `upload_voice_to_hub` and the router, which now passes the extracted bundle directory straight through. Task 004 (engine-asset inclusion, DONE 2026-07-12) — owner directly confirmed the scoping question this session: the published sample must be the one already generated by the same variant whose engine asset (`latent.pth`) is being published, never mixed across variants/models; `_resolve_publish_variant()` (new helper in `voices_huggingface.py`) picks one variant (same default-variant fallback chain as `bundles.export_voice_bundle`) and both the sample and the engine asset are read from it together. **Also fixed while implementing this**: the export endpoint's sample lookup previously checked the voice ROOT for `samples/preview.mp3`/`sample.mp3` — paths that never exist on any real installed voice (samples live per-variant) — so every real export had silently shipped a 0-byte sample and a non-playable README `widget:` block; confirmed via a live re-export of a real voice both before (0 bytes, no widget) and after (265KB sample, widget present) the fix. The additive `variant_name` override (plan's option (b)) was not built — not requested; only the always-resolve-default-variant path (a) shipped. Implementation research: [v2_huggingface_upload_implementation.md](reference/v2_huggingface_upload_implementation.md).)*
  - [x] Token handling: optional, stored as secret, never logged or bundled *(DONE 2026-07-03, Settings UI added 2026-07-12 — `huggingface_token` settings field, same `_SECRET_FIELDS`/redaction/round-trip-safe mechanism as `tts_api_key`. A real Settings → General → Publishing panel now exists (`GeneralSettingsPanel.tsx`) to enter/clear the token; previously server-side-only, unusable outside direct API calls.)*
  - [x] Voice Lab UI: "Publish to Hugging Face" wired to a real flow *(DONE 2026-07-12 — the button was a disabled/decorative "planned" placeholder pill in `VoiceLabPage.tsx` despite the backend + frontend API client (`api.uploadHfVoice`) already existing and working. Replaced with a real button opening `PublishToHuggingFaceModal.tsx`: repo-id input → `POST /api/voices/huggingface/upload` → success state with a Hub link + commit id, or the 422/502 error surfaced verbatim. Found and flagged (not fixed, out of scope) a pre-existing, unrelated crash: `VoiceLabPage` throws in `<SamplesSection>` for every voice in this dev environment, blocking live click-through verification of this and every other Voice Lab control — confirmed pre-existing by reverting the new code and reproducing the same crash.)*
  - [x] Design decision: full in-app browse UI vs paste-a-Hub-ID/URL for the first version *(DECIDED — owner explicitly chose full in-app browse for v1, this session; implemented as such, no paste-ID fallback UI.)*
  - [x] Shared `VoiceProvenance` data-model field + migration (also required by AI casting below) *(DONE 2026-07-03 — see "AI casting + voice metadata UI" below; `provenance` is now genuinely read/write through `/api/voices/{id}/metadata`, `voice-bundles.md` bumped to 1.3.0; the HF import path above now populates it.)*
  - [x] Security: `hub_id` strictly validated (`namespace/repo-name`, alphanumeric+`-`/`_`/`.` only, `fullmatch` not `match`) before any outbound call or file path use; all downloaded/exported/uploaded files routed through `contained_path`/`safe_join_flat`/`safe_basename` under `TRANSIENT_DIR` subfolders or the voices root *(DONE 2026-07-03)*

  > 👁 **VISUAL CHECK — HuggingFace voice UI complete**
  > - Voice Lab → Voices tab → "🤗 Discover" → search returns voice cards with hub id, author, and tags
  > - A voice with a restrictive license (non-commercial) shows a **warning badge** in the import wizard — not blocked, just flagged
  > - Clicking Import → inspect → consent checkbox → confirm → voice appears in "My Voices" with pre-filled description/tags/languages and correct provenance
  > - Export/Upload a voice via the `/api/voices/huggingface/export` and `/upload` endpoints (no dedicated Voices-tab button wired for these two yet — API-only for now)
  > - HF token (if set via the settings API) is **not visible** anywhere in `/api/home` or `/api/settings` responses after saving — stored as a secret

- [ ] **AI casting + voice metadata UI** — [plan](active/v2_voice_metadata_and_casting.md)
  - [x] Extend `VoiceProfile`: `description`, `attributes`, `tags`, `provenance`, `language_primary` *(shipped in 1e475d5e — audited 2026-07-03, TASKS.md was stale; lives on the `voice.json` manifest via `app/domain/voices/manifest.py`/`metadata.py`, not the `VoiceProfileModel` dataclass; naming differs from the plan doc — schema uses `image`/`languages[0]` for `icon_path`/`language_primary`; `provenance` write-path wired 2026-07-03)*
  - [x] `VoiceAttributes` controlled vocab: class, gender, age, accent, tone, timbre, pace, use_case, quality *(shipped in 1e475d5e — audited 2026-07-03, TASKS.md was stale; `design-docs/specs/voice-taxonomy.json` v1.0 + `app/domain/voices/taxonomy.py`)*
  - [x] Casting card: machine-readable serialization of a voice for AI scoring *(shipped in 1e475d5e — audited 2026-07-03, TASKS.md was stale; `app/domain/voices/metadata.py` casting-card shape, spec'd in `voice-bundles.md` §9)*
  - [x] Casting contract: ranked recommendation output with `reason` per pick (never auto-apply) *(shipped in 1e475d5e — audited 2026-07-03, TASKS.md was stale; `cast_voices()` in `app/domain/voices/metadata.py`, live at `POST /api/voices/cast`; returns ranked suggestions only, no auto-apply)*
  - [x] Voice Lab UX: icon/chip card view, edit panel *(shipped — audited 2026-07-03, TASKS.md was stale; `frontend/src/pages/Voices/components/{VoiceCatalogCard,VoicePills,MetadataEditorModal}.tsx`, `frontend/src/pages/VoiceLab/`)*
  - [x] Voice Lab UX: "Suggest voices for this character" action *(shipped 2026-07-03 — `POST /api/voices/cast` now has a frontend caller: the real Cast surface, `frontend/src/components/CharactersTab.tsx` (rendered by `frontend/src/pages/Book/stages/CastingStage.tsx`), gained a per-character "Suggest voices" button opening `CastingSuggestionsModal.tsx`. It builds the catalog from `GET /api/voices/` + the character brief, renders ranked name/score/reason, and confirming a suggestion resolves the `voice_id` back to a `speaker_profile_name` and calls the same `api.updateCharacter` mutation the manual voice dropdown uses — no auto-assign, no new assignment path. Handles `needs_input` (thin-brief empty-state copy) and 422 (unknown contract/card version) verbatim. Not wired into the chapter-editor right-click menu described in the VISUAL CHECK below — that surface (`DirectorsConsole/CastTool`) is still a stub gated on WL1; this ships on the live, mounted casting UI instead.)*
  - [ ] Design decision: per-character multi-language handling in v1?
  - [ ] Design decision: in-app casting at release or fast-follow?

  > 👁 **VISUAL CHECK — AI casting complete**
  > - Voice Lab: each card shows **icon, name, attribute chips** (gender, age, accent), and a short description
  > - Edit a voice → can upload a 1:1 icon (cropped), write a description, and set attributes from controlled dropdowns
  > - In the chapter editor, right-click a character → **"Suggest voices"** → a ranked list appears with a one-line reason per voice
  > - Selecting a suggestion assigns it — it does **not** auto-assign without confirmation
  > - A voice with no structured attributes still appears in suggestions, with a lower confidence label

---

## Pre-built, not yet wired *(agent-built ahead of schedule — audit 2026-07-12)*

Sweep for substantial code that exists but is never imported/registered anywhere on a live path, to
close the gap where an agent finds a "new" task already nearly done and nobody had documented it.
Frontend turned up nothing new — every orphan (`src/demo/`, `src/i18n/`, the `Studio 2.0 boundary —
not implemented yet` stubs) is already deliberate, already-documented scaffolding (see i18n line
above). Two backend items were genuinely undocumented:

- [x] **`app/domain/demo_bundle.py`** (90 lines, from `bb2bb025` #114/phase 11) — demo-library
  restore from a zip, with real path-traversal validation (`ALLOWED_TOP_LEVEL` check) and a
  `status`/`restore` CLI. **Found broken, not just unwired**: `run.sh`/`run.ps1` invoked it as
  `python -m app.demo_bundle`, but the module lives at `app.domain.demo_bundle` — the module moved
  into `app/domain/` without updating the two launchers, so every real `./run.sh`/`run.ps1` launch
  with a `demo.zip` present silently skipped the demo-library install (`ModuleNotFoundError` was
  swallowed by the launcher's own `if ! ( ... ); then return 0; fi` guard). *(FIXED 2026-07-12:
  both launchers corrected to `app.domain.demo_bundle`; new test
  `test_launcher_invokes_the_module_at_its_real_import_path` in `tests/domain/test_demo_bundle.py`
  greps both launchers for the real module path so this can't silently drift again — R1
  revert-checked red on the pre-fix scripts via `git stash`, green after.)*
- [ ] **`app/engines/video_utils.py`** (63 lines, same commit `bb2bb025`) — `generate_video_sample()`
  builds a real ffmpeg command (background + audio + optional logo overlay) to render an MP4 voice
  preview. Exercised only by `tests/engines/test_engines.py`; zero production callers (no router, no
  task, no plugin references it) and no matching spec under `design-docs/specs/`. Not fixed here —
  flagged as pre-built future work with no landing spot yet. **Owner: is this still wanted (a
  video-preview feature for voices), and if so what UI/route should call it?**
- [x] **`app/orchestration/tasks/export.py` (`ExportTask`) + `bake.py` (`BakeTask`)** — MISSED by the
  original 2026-07-12 sweep despite fitting its definition exactly (complete `StudioTask`s, `task_type`
  `"export"`/`"bake"`, zero live callers, absent from the orchestrator reconstruction table). Surfaced
  2026-07-16 by a fable feature-parity comparison. **Both are REDUNDANT with shipped, wired paths**:
  `ExportTask` (M4B) duplicates `AssemblyTask(is_audiobook=True)` → `handle_audiobook_job` → `assemble_audiobook`
  (route `POST /projects/{id}/assemble`, in recovery table, live UI) — the shipped path forwards every
  field ExportTask exposes and adds chapter_titles + recovery reconstruction. `BakeTask` (chapter WAV→MP3)
  duplicates `export_chapter_audio()` → `wav_to_mp3` (route `POST /chapters/{id}/export-audio`, live UI) —
  the shipped path adds caching + atomic write + path containment. *(DELETED 2026-07-16 as redundant;
  capabilities unchanged. Comparison verdict: nothing to port.)*
- [x] **Latent bug found during that comparison — M4B filename doubled to `<name>.m4b.m4b`.** The wired
  `handle_audiobook_job` (`app/jobs/handlers/audiobook.py`) re-derived `out_file = f"{chapter_file}.m4b"`
  from a `chapter_file` that already ended in `.m4b` (it's `Path(output_path).name`), so shipped
  audiobooks were written (and recorded as `output_mp3`) with a doubled extension. No test exercised the
  derived filename (the assembly test stubs the render). *(FIXED 2026-07-16: strip the trailing `.m4b`
  before re-appending; new revert-checked `tests/orchestration/test_audiobook_handler_filename.py`
  exercises the derived name with a stubbed `assemble_audiobook`, red on pre-fix.)*

### Backlog surfaced by the export/bake comparison (real gaps — do NOT resurrect the dead code)
- [ ] **Audio loudness normalization / post-render polish** — genuinely unbuilt anywhere (grep: no
  `loudnorm`/`dynaudnorm`/`-af` in `app/`; `BakeTask`'s "normalization" comment was empty aspiration). If
  wanted, add it to the shipped `wav_to_mp3` / `export_chapter_audio` chain, not a resurrected task class.
- [ ] **Async-queued MP3 export** — `export_chapter_audio` is synchronous (runs in the request threadpool;
  fine at chapter sizes). Only worth an orchestrator-queued variant (with progress/cancel) if bulk export
  or very-large-chapter encoding becomes a measured latency/threadpool concern.

## Declined / deferred with rationale *(not doing now — recorded so it isn't re-investigated cold)*

- [x] **Voice catalog grid virtualization — declined, 2026-07-15.** A Large Catalog Curator persona
  review flagged `frontend/src/pages/Voices/components/VoicesTabContent.tsx`'s catalog grid (plain
  `.map()`, every `VoiceCatalogCard` stays mounted regardless of scroll visibility) as a risk at
  40-100+ voices. Investigated fresh: the "40-100+" premise traces to
  `design-docs/personas/41-large-catalog-curator.md`, which is entirely about the **projects** list
  (a publisher's "2,000 titles") — it never discusses a large *voice* roster, and nothing else in
  `design-docs/` (specs, task docs, fixtures) supports real voice rosters at that scale; voice
  creation is a manual per-voice cloning workflow that self-limits count far more than a project
  list ever would. Per-card cost is also genuinely cheap, not theoretical-but-real: `usePlayerBus()`
  is one small `useSyncExternalStore` subscription with no polling/timers, and
  `getVoicePhase`/`getPrimaryCta` are pure synchronous functions over already-fetched props.
  **Decision: defer.** No virtualization library is a dependency today, and the grid is fluid
  (`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`), which breaks `react-window`'s
  fixed-cell-size assumption — adopting it would need `react-virtualized-auto-sizer` + a
  resize-observer column-count recompute, or a hand-rolled `IntersectionObserver` mount-near-viewport
  approach, plus rework of keyboard nav and two existing test files that assume every card is in the
  DOM. **Revisit trigger:** a real workspace reporting 150+ voices with observed Voices-page jank —
  profile first (a `React.memo` on `VoiceCatalogCard` may be sufficient) before reaching for full
  windowing.

## Voice-variant version history *(fast-follow, built 2026-07-15 — all 9 tasks + 3 review fixes shipped)*

Voice-Clone-Trainer persona finding (`design-docs/personas/42-voice-clone-trainer.md`):
rebuilding a voice variant (`POST /api/speaker-profiles/{name}/build`) destroys the previous
sample set and `profile.json` state in place, with no recovery and no in-app A/B between clone
attempts. Deliberately scoped out of the voice-card/Voice-Lab consolidation redesign as a
fast-follow.

Full plan (map, roadmap, 9 task files): `~/.claude/plans/audiobook-factory/voice-variant-version-history/`.
Filesystem-based `versions/` schema per variant (no DB table), non-destructive rebuild (snapshot
before delete + snapshot after build), a promote-to-active endpoint (file copy only, no
re-synthesis), and an A/B panel reusing `SampleTestTask` unmodified. No backfill for pre-existing
voices — history starts at the first rebuild after this ships.

- [x] **001** — Variant versions schema module (`app/domain/voices/variant_versions.py`)
- [x] **002** — Snapshot before delete in the build endpoint (`voices_actions.py`)
- [x] **003** — Record new version after a successful rebuild (`sample_build.py`)
- [x] **004** — Versions router: list + promote (`voices_versions.py`, new)
- [x] **005** — Versions router: A/B test endpoint (same file)
- [x] **006** — Frontend: `SpeakerProfile` type + API client methods
- [x] **007** — Version history list + promote UI (`VariantEditor.tsx`)
- [x] **008** — A/B playback panel
- [x] **009** — This TASKS.md entry stays current as 001-008 land
- [x] **010** — Review fix: static route filename whitelist excluded `artifact.mp3` (cached playback of any version was unreachable via HTTP)
- [x] **011** — Review fix: A/B job-mode completion signal was wrong (watched `has_artifact`, could silently serve stale/wrong audio) — replaced with real job-status polling + new `/out/voice-ab-test/{job_id}/render.mp3` static route
- [x] **012** — Fable sign-off fix: stale in-flight A/B poll tick could overwrite a fresh comparison run's result with an old job's audio — fixed with a generation-counter guard

## Voice variant tagging + IA redesign *(fast-follow, built 2026-07-15)*

Owner finding: variants of a character had no way to carry their own performance tags (tone,
pace) distinct from the character-level taxonomy, and the stacked-full-card variant list didn't
scale. Preceded by a 5-lens design critique, two rounds of adversarial technical review, and two
rounds of design review, all in `docs/design-critique/voices-variants/`.

Full plan (map, roadmap, 13 task files, archived after completion):
`~/.claude/plans/audiobook-factory/archive/voice-variant-tagging-and-ia/`. Adds per-variant
user-extensible `performance_tags`; replaces the stacked variant list with a count-based switcher
(horizontal tab strip for a few variants, filterable vertical rail for more) sharing one detail
editor; adds a default-variant star with a new backend write path (none existed before); restores
a previously-shipped-then-orphaned icon image-generation-prompt feature; and consolidates
secondary variant chrome into one overflow menu per variant.

- [x] **001** — Restore icon image-generation-prompt affordance
- [x] **002** — Verify Script/recording-guide reachability
- [x] **003** — Pill primitive token hygiene
- [x] **004** — Backend: `performance_tags` read/write path
- [x] **005** — Backend: default-variant write endpoint
- [x] **006** — `TagAutocompleteInput` component
- [x] **007** — Wire `performance_tags` into `VariantEditor`
- [x] **008** — `VariantSwitcher` component (count-based strip/rail + default-star)
- [x] **009** — `VariantsSection` master-detail rewrite
- [x] **010** — Performance-tag filter bar
- [x] **011** — Catalog-card "Set as App Default" relabel + bug fix
- [x] **012** — Cleanup fill-ins (reduced-motion guard, icon fix, shared `EngineBadge`, button sizing)
- [x] **013** — Test tab preselects the active variant
- [x] **014** — Adversarial review fix: `performance_tags` whitespace normalization now matches the frontend exactly

## Deferred / post-v2.0

- [ ] **012** — Localization + sub-sentence assignment — [task file](master_fix_plan/tasks/012-deferred-and-open-questions.md)
  - [~] Localization: pick i18n library, implement `frontend/src/i18n/`, wire committed source catalogs *(post-v2)* *(foundation landed dark 2026-07-03: `i18next`/`react-i18next` chosen, `frontend/src/i18n/` scaffolded with a lazy `initI18n()`/`useTranslation` wrapper — zero side effects on import, not called from the app root yet — plus one sample catalog (`WelcomePage` strings). Repo-wide string extraction, provider wiring, and additional locale catalogs still outstanding.)*
  - [~] Sub-sentence speaker assignment ([proposals/sub_sentence](proposals/sub_sentence_speaker_assignment.md)): segments→spans model, backend vs frontend split, undo — **must land before render-group/safe-text packing is finalized** (write the packing pipeline span-aware from day one); shares the DB model with W-PERF *(research done: [OSS prior-art survey](proposals/research_speaker_assignment_prior_art.md) + [academic deep-research](proposals/research_word_level_voice_assignment_academic.md) both confirm span/quotation-level attribution — never per-word — across every shipped tool and paper found; LLM chain-of-thought-over-chapter flagged as strongest auto-attribution method for the no-tail case when auto-suggestion is built. **Status corrected 2026-07-04**: this line previously read `[ ]`/unstarted, which was stale — direct code inspection found the feature is already ~90% built (`chapter_segments` already is the span table, `_apply_range_assignment` already does the surgical split-and-assign, Book-mode drag-select already wired end-to-end, render-group packing already span-aware with no changes needed). **Word-boundary snapping SHIPPED 2026-07-17** (PR #143, plan complete and archived at [span_word_boundary_snapping](active/archive/span_word_boundary_snapping/README.md)) — backend + frontend now snap selection offsets to whole-word boundaries, backend authoritative. Remaining gaps, all genuinely unbuilt: (1) sub-sentence spans don't survive a source-text resync — now scoped in [span_resync_preservation](proposals/span_resync_preservation.md); (2) undo (generic doc-10 U1 work, not span-specific); (3) character auto-detection. This entry may no longer belong under "Deferred / post-v2.0" given how much has shipped — flagged for owner, not moved here.)*
  - [ ] Cross-ref: the HF voice + AI casting product backlog (Unscheduled, above) is the post-v2 product surface tracked here; north-star Phase D (Review waveform annotations→re-renders, loudness QA) is future work in [site_experience_north_star](reference/site_experience_north_star.md)

---

*Legend: `[x]` done · `[~]` partially done · `[ ]` not started · `*(deferred)*` owner-gated*
*`👁 VISUAL CHECK` = human verification required — tests cannot substitute*
