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
| `app/orchestration/progress/service.py` (1,503 lines) | W-MIX-LA ETA fix (`4f78cc7b`/`291872bc`, this week) · W-PAR 002/006 aggregation · 005 LF-6 split | **⚠ active-edit hazard.** LF-6 split must not start until Lane-1 ETA work is fully quiescent — do not fire a splitter agent at this file while an ETA agent is live. |
| `app/orchestration/tasks/synthesis.py` (415 lines) | W-PAR 002 (split into Chapter/Segment tasks) | 002 owns it. `_manifest_resource_claim` (L29-100) already derives the claim from the manifest — no other agent edits. |
| `frontend/src/pages/Book/studio/useStudioChapter.ts` (915 lines) | 004-W1/RST-8 · W-PAR 006 (single→Set) · 005 LF-1 split · art-program | RST-8 exports first → **W-PAR 006 generalizes `chapterRenderActiveSegmentId`→Set** → LF-1 split → art-program. 006 and LF-1 must not run concurrently. |
| `ChapterHeader.tsx` (615 lines) | W-PAR 006 (multi-active props) · 005 file-split (last oversized target) | 006 threads `activeSegmentsMap` first; defer the split until after. |
| `app/api/ws.py` (L374-413) | W-PAR 003 (R-F rework) | 003 only. The single-active `SEGMENT_SAVED`-on-transition emission lives here; 003 reworks it so each child emits on its own validated completion. |
| `plugins/` paths | 005 PL-consolidation · 006 rename · 010 extraction | PL-* → 006 rename (alone, widest blast radius) → 010. |

### Ready to dispatch NOW

**Zero blockers:**
- ~~W-MIX-LA 007 spec reconciliation~~ — **done 2026-07-02** (007a doc work + 007b owner G0 re-check both complete; W-MIX-LA fully closed). W-PAR 002/003 execution is no longer gated on this — only the cap>1 owner sign-off (gate summary #2) remains.
- **L-SIMP** — behavior-preserving cleanup, no CP overlap: ST-1 `components.css` split, ST-2 shared classes, LF-2 `EngineCard`, LF-3 `PredictiveProgressBar`, LF-4 `MetadataEditorModal`, LF-5 `App.tsx`, BE-2/BE-3/BE-5, PL-1/PL-3/PL-5. Parallel-safe among themselves. **Excludes LF-1/LF-6 (contested above) and DC-1b (live tree, gate re-verify).**
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
2. **Owner cap>1 sign-off** gates *enabling* parallelism — not *writing* 002's fan-out or 006's frontend thread (both build dark under cap=1).
3. **W-PAR 003 (keystone)** gates 005 and the *runtime* half of 006; runs alone on `orchestrator_helpers.py` + `ws.py`.
4. **`progress/service.py` quiescence** gates LF-6 — never split it while an ETA agent is live.
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

## W-PAR — Parallel segment rendering *(active — 001+004 shipped dark; 002/003/005/006/007 pending; W-MIX-LA 007 gate CLEARED 2026-07-02 — remaining gate is the owner cap>1 sign-off below)*

Plan: [active/parallel-segment-rendering/README.md](active/parallel-segment-rendering/README.md) · map: [01-map.md](active/parallel-segment-rendering/01-map.md) · roadmap: [02-roadmap.md](active/parallel-segment-rendering/02-roadmap.md)

Render a chapter's segments **concurrently** across per-engine pools (GPU/CPU/cloud), capped per engine, off-by-default (cap=1). Phase 1 = backend parallelism + multi-active frontend (existing per-segment bars light up at once); Phase 2 = dedicated render monitor (fast-follow). **Subsumes W-MIX W5.** Designed via the 2026-06-26 fusion triage.

- [x] **G0 (prereq — owner):** verify the W-MIX `👁 VISUAL CHECK` on a live mixed render before starting (don't stack parallelism on an unverified core) — *synthesis core owner-verified 2026-06-29 ("best it's ever done!"); cap>1 concurrency owner-verified live 2026-07-03 (two XTTS jobs actually overlapping) after the 001 escaped-defect fix below — parallelism enable path confirmed working.*
- [x] **001** — Per-engine cap declaration + scheduler semaphores — [task 001](active/parallel-segment-rendering/tasks/001-per-engine-cap-and-semaphores.md) *(DONE 2026-06-26: per-engine counting semaphores + manifest caps + global cap; ships dark via `ENGINE_CLASS_ADMISSION` env flag default OFF → single-flight = today; **W5 closed at runtime**; adversarial-reviewed, 434 tests green. Real caps + the toggle-as-setting land in 007.)*
  - [x] **2026-07-03 escaped-defect fix** — live cap=2 test on XTTS still ran strictly sequential. Root cause: `GpuAdmissionGate`/`ExclusiveAdmissionGate` (deprecated compat wrappers) called `get_engine_semaphore("gpu"/"exclusive", 1)` in `__init__`, eagerly registering into the SAME shared registry a real manifest-derived `engine_class="gpu"` claim also uses; since the registry cached cap at first creation and ignored it thereafter, and these wrappers construct at module-import time, every GPU-class engine was silently capped at 1 regardless of `max_concurrent_workers`. Fixed in `resources.py`: (1) the legacy wrappers now use private, non-shared semaphores; (2) `get_engine_semaphore`/`EngineClassSemaphore` made self-healing — cap grows to the largest value any caller requests, never frozen at the first caller's value. Regression test `test_xtts_cap2_admits_two_concurrent_via_real_path` (R1 revert-checked). None of the original 434 tests caught this — they only exercised synthetic non-colliding engine-class keys or the flag-off ships-dark path.
- [ ] **002** — Parent/child segment scheduling *(prep-eligible — dispatchable now, see Division of Labor map)* — [task 002](active/parallel-segment-rendering/tasks/002-parent-child-segment-scheduling.md) *(chapter parent job fans child segment units into a bounded pool; one job per chapter for UI/recovery; fan-out logic can be built+tested dark at cap=1 now, only enabling needs the owner cap>1 sign-off)*
- [ ] **003** — Per-segment dispatch isolation *(keystone, R-A — no safe prep, see Division of Labor map above)* — [task 003](active/parallel-segment-rendering/tasks/003-per-segment-dispatch-isolation.md) *(each concurrent segment gets its own timing/marker state; isolate the `_dispatch` closure — ~1,460 lines (L88→~L1548 of the 1,563-line file; verified 2026-07-02), more than 2× the original ~700-line estimate. **R-F added 2026-06-29:** must also rework single-active `SEGMENT_SAVED` emission — see task file + 01-map.md R-F)*
- [x] **004** — TTS-server concurrent inference — [task 004](active/parallel-segment-rendering/tasks/004-tts-server-concurrent-inference.md) *(DONE 2026-06-26: async `/synthesize` + `run_in_threadpool`; `WarmWorkerManager` lazy-spawned free-list pool capped at `manifest.behavior.max_concurrent_workers`; OOM degrade fail-safe; Voxtral no lock; ships dark at cap=1. **M-PAR-1 complete** together with 001 — per-engine semaphores + server-side pool exist, default cap=1 = no behavior change. Residual: dead-worker waiter hang at cap>1 → task 005.)*
- [ ] **005** — Correctness invariants under parallelism — [task 005](active/parallel-segment-rendering/tasks/005-correctness-invariants.md) *(stitch-order barrier, artifact-validated completion, cancel join-all, recovery K-of-N, SQLite per-segment writes, stuck-segment heartbeat — TDD)*
- [ ] **006** — Frontend multi-active segments *(prep-eligible — dispatchable now, see Division of Labor map)* — [task 006](active/parallel-segment-rendering/tasks/006-frontend-multi-active.md) *(chapter-level `active_segments_map` threaded end-to-end via the W4 two-layer pattern; `useStudioChapter` set; rAF-coalesced; existing bars light up in parallel; buildable now with a byte-identical cap=1 fallback — 003 gates only the field actually being non-empty)*
- [ ] **007** — ETA under parallelism + off-by-default toggle + spec reconciliation — [task 007](active/parallel-segment-rendering/tasks/007-eta-toggle-and-specs.md) *(bracketed throughput ETA; cap-default-1 toggle; bump queue-jobs/system-architecture/data-model/live-events/progress-presentation; final invariant gate)*
- [ ] **Phase 2** — dedicated BitTorrent-style render monitor *(fast-follow; design captured + demo reference mock built 2026-06-28)* — [10-phase2-render-monitor.md](active/parallel-segment-rendering/10-phase2-render-monitor.md) *(visual mock on the demo Activity screen: `SegmentRenderStrip.tsx` — char-weighted blocks, teal-track in-progress, cap-limited parallelism, fail→retry; binding presentation contract now in `progress-presentation.md` §7A / invariants M1–M3. Production build still gated behind M-PAR-3.)*

  > 👁 **VISUAL CHECK — W-PAR Phase 1 complete**
  > Raise an engine's concurrency cap above 1, then render a multi-segment chapter:
  > - Multiple segment bars (gray→black text + per-segment progress) advance **simultaneously**, not one at a time
  > - Chapter finishes noticeably faster than at cap=1; the chapter WAV plays back correct and in order (no shuffled/garbled segments)
  > - Cancel mid-render stops cleanly (no orphan audio, queue clears); re-render resumes only unfinished segments
  > - With the cap back at 1, behavior is exactly as before (ships dark)
  > - Overall progress + ETA stay coherent (ETA shown as a range / "estimating…", not a false precise countdown)

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
- [ ] C-1 residue: `grep "from app\." plugins/` → zero — module-level imports cleared; function-body imports in bake/segments/standard_handler still pending ([final_release/01](active/final_release/01_discrepancies_and_corrections.md)) *(audit 2026-07-01: 41 function-body imports in bake/segments/standard_handler = the documented deferred residue; ALSO `app_adapter.py` in both engines has 11 module-level `from app.*` imports — a factual regression vs the plan's "zero module-level" claim, needs the same S9 ctx-injection treatment)*

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
  - [ ] RST-8 segment-aware player *(→ task 004, deferred by owner)*
  - [ ] Per-span range assignment *(deferred by owner)*
  - [ ] DC-1b dead-tree deletion *(gated on RST-8)*
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

- [ ] **004** — Audio player + waveform scrubber — [task file](master_fix_plan/tasks/004-audio-player-completion.md) · [scrubber plan](active/audio_player_waveform_scrubber/README.md) · [scrubber tasks](active/audio_player_waveform_scrubber/tasks/)
  - [ ] W1: make player scope-agnostic — remove `altScope`/`switchScope`, implement `fitsLegibly()` *(spec rewrite `audio-player.md` 1.6.0 already done — task 004)*
  - [ ] RST-8: teach player the segment model for block navigation (uses segment logic from `useStudioChapter`)
  - [ ] W2 (tasks 006–009): port `WaveformTape` renderer, zoom/minimap/ruler, `PlayerBar` integration, CSS + tests
  - [ ] W2 also: "Play book" whole-book sequenced playback (`onEnded` advance), paged↔moving motion toggle (forced-paged under reduced-motion), ~10–15 min duration cap (fall back to plain bar), single-`<audio>`-owner invariant grep check
  - [ ] W3 (tasks 010–012): peaks source abstraction, backend sidecar emission, source-swap + virtualization

  > 👁 **VISUAL CHECK — 004 complete**
  > Open a chapter with rendered segments:
  > - Global player works without a scope toggle — plays book-level and chapter-level audio from the same bar
  > - **Segment navigation:** prev/next segment buttons jump between individual segment clips
  > - **Waveform tape** renders below the player bar — scrub by dragging; playhead follows
  > - Zoom presets (fit / 1× / 2× / etc.) change the tape resolution; minimap shows position in long chapters
  > - Reduced-motion: waveform renders statically, no animated transitions

---

## Milestone 3 — Simplification

- [ ] **005** — Code simplification — [task file](master_fix_plan/tasks/005-code-simplification.md) · [simplification plan](active/simplification/00_overview.md)
  - [ ] FE dead-code ([simplification/02](active/simplification/02_frontend_dead_code_removal.md)): DC-1a extract shared (`VoiceProfileSelect`/`useChapterStatus`/`ResyncPreviewData`/`ChapterEditorTab`), DC-1b dead-tree *(gated on 004)*, DC-2 stub-route infra, DC-3b safe independent deletions *(⚠ audit 2026-07-01: the `ChapterEditor`/`ProjectDetail` trees are LIVE-ROUTED and actively developed — coupling grew 4→7+ importers; DC-1b gate must be re-verified before any deletion)*
  - [ ] Styling separation ([simplification/03](active/simplification/03_styling_separation.md)): ST-1 (QW-6 dead CSS), ST-2 shared classes (`form-label` ×52 / `input-field` ×8), ST-3 inline-`style`→class in top-15 hotspots, ST-4 spec bumps (+ U3 type scale, U9 button/input, U10 z-index incl. `--z-drawer` from [final_release/10](active/final_release/10_ux_improvements.md))
  - [ ] Large-file splits ([simplification/04](active/simplification/04_large_file_splits.md)): LF-1 `useStudioChapter.ts`, LF-2 `EngineCard.tsx`, LF-3 `PredictiveProgressBar.tsx`, LF-4 `MetadataEditorModal.tsx`, LF-5 `App.tsx`, LF-6 `progress/service.py`, LF-7 `tts_server/server.py`
  - [ ] Older split audit ([file_split_plan](active/file_split_plan.md), perf-gated): `QueueItem.tsx`, `useJobs.ts`, `ChapterHeader.tsx`, `useQueueSync.ts`, `scriptViewProgress.ts` — reconcile overlap with LF-* *(audit 2026-07-01: `useJobs.ts` 288, `useQueueSync.ts` 196, `scriptViewProgress.ts` 95 — already right-sized, struck; only `ChapterHeader.tsx` 615 remains live; file_split_plan.md retired into simplification/04)*
  - [ ] Backend cleanup ([simplification/05](active/simplification/05_backend_cleanup.md)): BE-1 dead code, BE-2 `INTENDED_*`/`FORBIDDEN_*` constants, BE-3 `events.py` command-set dedup, BE-4 duplicate segment-timing math, BE-5 per-request `_resolved_segment_profiles`, BE-6 rename/move `app/jobs` package *(audit 2026-07-01: BE-1 `schema_data` claim is WRONG — those variables are live validation code, do not delete; BE-3 target is `app/api/contracts/events.py`; BE-2 scope grew to 12 modules incl. two new `app/infra/` stubs)*
  - [ ] Plugin consolidation ([simplification/06](active/simplification/06_plugin_consolidation.md)): PL-1 one SDK context factory, PL-2 shared segment-marker handler + `_group_needs_render`, PL-3 app-adapter helpers→`BaseVoiceEngine`, PL-4 shared XTTS synthesis loop, PL-5 remove ABC stubs *(PL-6: xtts adapter is LIVE — do NOT delete, INV-5)*
  - [ ] Logic-audit cleanup ([final_release/09](active/final_release/09_logic_audit.md)): D1/D2 dead FE files + D3 registry stub; R1 dup `_ensure_plugin_package_hierarchy`, R2/R3 adapter+Voxtral dedup, R6 unify queue/jobs overlay; F14 `ScriptView` `data.paragraphs` crash, F15 `useInitialData` fetch-failure signal; B14–B17 test-infra fixes; T5 coverage-honesty spot-check
  - [ ] Text-ops package ([organizational_cleanup §2](active/organizational_cleanup.md)): create `app/text/`, consolidate `textops_*`/`text_processing.py`

  > 👁 **VISUAL CHECK — 005 styling separation**
  > In both **light and dark** themes:
  > - Buttons and inputs look consistent across all pages — no rogue sizes, colors, or border radii
  > - No visible regressions from the dead-CSS removal (spot-check the demo/styleguide route `/#/styleguide`)
  > - Type scale feels consistent — body, labels, headings all use the token scale, nothing obviously oversized or tiny

- [ ] **006** — Backend namespace rename + code-org — [task file](master_fix_plan/tasks/006-backend-namespace-and-codeorg.md) · [agnostic tasks](active/master_agnostic_tasks.md)
  - [ ] Rename `plugins/` → `tts_engines/` — update all importers, manifests, `PLUGINS_DIR`, conftest, docs
  - [ ] Namespace block remainder ([master_agnostic](active/master_agnostic_tasks.md)): rename voice namespace, reserve `plugins/` for app-behavior extensions, move engine-owned tests/fixtures into bundles, `mixed.py`→`composite.py` decision
  - [ ] Finish `speakers.py` decomposition (if not done in 005)
  - [ ] API router sub-package restructure
  - [ ] doc-06 cleanup ([final_release/06](active/final_release/06_code_organization_cleanup.md)): `transient/` consolidation, `app/infra/subprocess` implement-or-delete, `app/infra/{cache,events,db}` stub decision (C-3), gate dev-only routes (`/progress-test`, `/event-stream`) behind `import.meta.env.DEV`, split `App.tsx` (QueueDrawerHost/NotificationsHost/StartupGate) + `runtimeDebug.ts`, normalize API error handling (`api/index.ts`), unify input styles (`.input-field`→`.form-input`) *(audit 2026-07-01: `app/infra/{subprocess,cache,events,db}` scaffold + `StorageManager`/`TRANSIENT_DIR` ALREADY BUILT; `api/index.ts` error-handling claim is a false positive — all 6 functions already route through `parseApiResponse`; `/progress-test` + `/event-stream` are frontend React Router routes, not backend)*
  - [ ] `JobHandlerRegistry` / plugin-driven reconciliation (`engine.check_output`) decision ([master_agnostic](active/master_agnostic_tasks.md) Phase 12)
  - [ ] Phase-12 owner decisions: generic plugin setup-loop (implement or defer), voice-settings placement, system-API surface for 3rd-party controllers, Settings→API tab honesty
  - [ ] `MobileNavDrawer` focus-trap fix (a11y — also tracked in 008)
  - [ ] `CONTRIBUTING.md` plugin/template docs + plugin-doc prep for release (Phase 13)
  - [ ] Vite ECONNRESET triage + large-book load timing check
  - [ ] Post-release/opportunistic: react-refresh lint warnings (11, demo stages), demo transport nits (`restart()`/`play()`/`warnedRoutes`)

  > 👁 **VISUAL CHECK — 006 complete**
  > - App starts cleanly with no import errors in the console
  > - On mobile viewport: open the nav drawer → **Tab key stays trapped inside** the drawer until it closes (focus-trap fix)
  > - XTTS and Voxtral render a test segment successfully end-to-end (plugins still load under the new path)

---

## Milestone 4 — Feature + polish backlog

- [ ] **007** — Voice taxonomy v2 Phase G — [task file](master_fix_plan/tasks/007-voice-taxonomy-v2.md) · [detail](active/final_release/04_voice_metadata_and_tagging.md)
  - [ ] G1–G3: add `language` (multi-select), `accent` (single), `style` (multi) attributes *(audit 2026-07-01: `accent` already shipped in taxonomy 1.0 — remaining scope is `language` (multi) + `style` (multi) only)*
  - [ ] G4 UI: category-tinted pills + "+N" overflow (absorbs U8)
  - [ ] G5: HF bundle tag mappings (`as-language`/`as-accent`/`as-style`)
  - [ ] G6: bump `voice-taxonomy.json` + `voice.schema.json` + docs with changelog
  - [ ] C6: copyable icon image-generation prompt (owner direction)

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
  - [ ] U1 undo toasts · U2 focus management · U4 startup experience
  - [ ] U5 queue-drawer affordances · U6 guided failure recovery · U7 ActionMenu correctness
  - [ ] U11 resync→queue flow · U12 cancel single queued job
  - [ ] U13 first-run onboarding · U14 route transitions
  - [ ] U15 navigation design review
  - [x] U16 unified audio-player surface *(CONFIRMED delivered — single PlayerBar + playerBus scope toggle, no competing surface; doc 10 ticked; audit 2026-07-01)*
  - [ ] R6-T7 responsive sweep — 1280/768/420px; CastPalette @420px, Voice Lab @390px ([master_agnostic](active/master_agnostic_tasks.md))
  - [ ] Stage-5 gate ([final_release/07 §4](active/final_release/07_frontend_themes_and_responsive.md)): viewport×theme Playwright snapshots + axe contrast scans; keyboard-only walkthrough; axe/visual baseline rollout decision (owner)

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
  - [ ] Stage 5: perf P1–P6 confirmed; final broad `pytest` gate; axe baseline decision
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

- [ ] **Chapter editor art-program** — Director's Console (Cast/Booth/Revise) — [design doc](../workflows/chapter-editor-modes.md) *(design decisions resolved 2026-06-26 — ready to plan; gated on WL1 bug fixes B1–B4)*

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
  - [ ] **Step 1 — Scaffold (must land before any individual tool):** create the `DirectorsConsole/` folder structure and tool registration system as defined in doc §17; stub all three tools (CastTool, BoothTool, ReviseTool) + demo placeholder slots for future tools (Casting Call, Script Supervisor, plugin); wire the Console so it renders registered tools in order. Each stub renders its icon + label + "coming soon" body. No real functionality yet — this is the skeleton that all subsequent work slots into.
  - [ ] Cast mode: brush size selector (Word/Sentence/Paragraph), voice assignment gesture, mutation collector queue, Cast palette, Match Voice, Narrator eraser
  - [ ] Booth mode: karaoke highlight, tap-line-to-play, playback speed, session-only margin pins (line flags)
  - [ ] Revise mode: in-place paragraph editor per segment, balanced segment split, structural-edit escape hatch
  - [ ] Render-on-mode-exit: queue changed segments on Cast→any switch; explicit tap in Booth bumps to top
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

  > 👁 **VISUAL CHECK — chapter editor art-program complete**
  > Open a chapter in the editor:
  > - **Director's Console** (left rail) shows Cast / Booth / Revise icons; active mode is unambiguously highlighted; future tool slots show placeholder icons
  > - Pressing `V` / `R` / `E` switches modes instantly; mode breadcrumb shown in header
  > - **Cast mode:** tap a character in the Cast panel → voice chip loads; click a sentence → it takes that character's color (brush size = Sentence default); drag across sentences → assigns a run; leaving Cast mode triggers background re-render with On Air light
  > - **Booth mode:** clean listening column; tap any line → audio plays from that point (renders first if needed); karaoke highlight follows playhead; margin pin `F` drops a session flag
  > - **Revise mode:** click a paragraph → that paragraph's text becomes editable inline; commit re-renders only that segment
  > - Switch modes rapidly — scroll position, playback position, and assignments are all preserved

- [ ] **HuggingFace voice browse + upload** — [plan](active/v2_huggingface_voice_interface.md)
  - [ ] Import flow: search HF Hub → inspect card + license → consent gate → download → build voice asset → annotate metadata
  - [ ] Browse/search UI: card UI filtered to `audiobook-studio-voice` tag
  - [ ] Export: bundle generator → `.asvoice.zip` for manual upload
  - [ ] Upload to HF: push loose files via user token; auto-set `as-*` tags
  - [ ] Token handling: optional, stored as secret, never logged or bundled
  - [ ] Design decision: full in-app browse UI vs paste-a-Hub-ID/URL for the first version
  - [ ] Shared `VoiceProvenance` data-model field + migration (also required by AI casting below)

  > 👁 **VISUAL CHECK — HuggingFace voice UI complete**
  > - Voice Lab → "Browse Hugging Face" → search returns voice cards with name, author, license badge, and a sample preview
  > - A voice with a restrictive license (non-commercial) shows a **warning badge** — not blocked, just flagged
  > - Clicking Import → consent dialog appears → confirm → voice appears in the library with pre-filled metadata from the HF card
  > - Export a voice → `.asvoice.zip` downloads correctly and contains the expected bundle structure
  > - HF token (if entered) is **not visible** anywhere in settings after saving — stored as a secret

- [ ] **AI casting + voice metadata UI** — [plan](active/v2_voice_metadata_and_casting.md)
  - [ ] Extend `VoiceProfile`: `icon_path`, `description`, `attributes`, `tags`, `provenance`, `language_primary`
  - [ ] `VoiceAttributes` controlled vocab: class, gender, age, accent, tone, timbre, pace, use_case, quality
  - [ ] Casting card: machine-readable serialization of a voice for AI scoring
  - [ ] Casting contract: ranked recommendation output with `reason` per pick (never auto-apply)
  - [ ] Voice Lab UX: icon/chip card view, edit panel, "Suggest voices for this character" action
  - [ ] Design decision: per-character multi-language handling in v1?
  - [ ] Design decision: in-app casting at release or fast-follow?

  > 👁 **VISUAL CHECK — AI casting complete**
  > - Voice Lab: each card shows **icon, name, attribute chips** (gender, age, accent), and a short description
  > - Edit a voice → can upload a 1:1 icon (cropped), write a description, and set attributes from controlled dropdowns
  > - In the chapter editor, right-click a character → **"Suggest voices"** → a ranked list appears with a one-line reason per voice
  > - Selecting a suggestion assigns it — it does **not** auto-assign without confirmation
  > - A voice with no structured attributes still appears in suggestions, with a lower confidence label

---

## Deferred / post-v2.0

- [ ] **012** — Localization + sub-sentence assignment — [task file](master_fix_plan/tasks/012-deferred-and-open-questions.md)
  - [ ] Localization: pick i18n library, implement `frontend/src/i18n/`, wire committed source catalogs *(post-v2)*
  - [ ] Sub-sentence speaker assignment ([proposals/sub_sentence](proposals/sub_sentence_speaker_assignment.md)): segments→spans model, backend vs frontend split, undo — **must land before render-group/safe-text packing is finalized** (write the packing pipeline span-aware from day one); shares the DB model with W-PERF
  - [ ] Cross-ref: the HF voice + AI casting product backlog (Unscheduled, above) is the post-v2 product surface tracked here; north-star Phase D (Review waveform annotations→re-renders, loudness QA) is future work in [site_experience_north_star](reference/site_experience_north_star.md)

---

*Legend: `[x]` done · `[~]` partially done · `[ ]` not started · `*(deferred)*` owner-gated*
*`👁 VISUAL CHECK` = human verification required — tests cannot substitute*
