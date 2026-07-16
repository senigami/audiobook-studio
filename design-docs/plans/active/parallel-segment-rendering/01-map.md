# 01 — Implementation Map

The big picture, the parts, the connections between them, the invariants that must hold across the whole change, and the risks. Read this before any task.

## Big picture (one screen)

```
manifest behavior.max_concurrent_workers (per engine) + global cap
        │ (read at load)
        ▼
resources.py  ──  per-engine counting SEMAPHORES  (replace binary Gpu/Exclusive gates; subsumes W5)
        │ admit
        ▼
orchestrator.py  ──  PARENT chapter job  ──fans out──►  CHILD segment units
        │                                                   │ (bounded pool, capped per engine)
        │ aggregate progress/completion/ETA                 ▼
orchestrator_helpers.py  ──  per-segment _dispatch ISOLATION (own timing/marker state)
        │                                                   │ bridge call
        ▼                                                   ▼
progress service  ──  active_segments_map (chapter-level)   tts_server  ── warm-worker SEMAPHORE
        │ events                                            │  + lazy worker spawn + run_in_threadpool
        ▼                                                   ▼
frontend overlay (extract→whitelist→merge→store)         engine (XTTS local / Voxtral cloud / CPU)
        ▼                                                   │
useStudioChapter  ── SET of active segments  ──►  ScriptView per-segment bars (multiple light up)
                                                            │
                              STITCH barrier (manuscript order) ◄── all children done (validated artifacts)
```

## Parts (units of work)

| # | Part | Files | Responsibility |
|---|---|---|---|
| A | Cap declaration | `plugins/*/manifest.json` (`behavior.max_concurrent_workers`); a global cap in config/settings | Each engine declares its safe concurrency; global backstop. Default 1. |
| B | Scheduler semaphores | `app/orchestration/scheduler/resources.py` (`GpuAdmissionGate`:97, `ExclusiveAdmissionGate`:169, `reserve_task_resources`:224, `release_task_resources`:308, singletons `_gpu_gate`/`_exclusive_gate`:210) | Replace the binary one-at-a-time gates with **per-engine-class counting semaphores** sized to the cap. Admit up to N per engine class. |
| C | Parent/child scheduling | `app/orchestration/scheduler/orchestrator.py` (`submit`/`reserve`/`release`/`recover`), `app/orchestration/tasks/synthesis.py` (`_manifest_resource_claim` L29-100, constructions at L79/L93, used at L162 — **stale `:89` `ResourceClaim.none()` anchor corrected 2026-07-02: 001 already closed the mixed W5 `none()` gap; claim is manifest-derived, not hardcoded**) | A chapter becomes a parent job that fans child segment units into a bounded pool; children admitted under B; parent aggregates. Remaining work here is the fan-out/aggregation split, not the ResourceClaim gap (already closed). |
| D | Per-segment dispatch isolation | `app/orchestration/scheduler/orchestrator_helpers.py` (the `_dispatch` closure, verified ~1,460 lines as of 2026-07-02 — L88→~L1548 of the 1,563-line file, over 2× the original ~700-line estimate: `timing`, `segment_starts`, `marker_state`, `segment_load_observed`, `pending_engine_activity`) | Today one shared single-stream timing/marker state per chapter. Each concurrent segment needs its **own** isolated state; the parent owns only fan-out + aggregation. **Keystone refactor (R-A); no safe way to prep this dark — see task 003's own note.** |
| E | Server concurrency | `tts_server.py` (`uvicorn.run`:152), `app/tts_server/server.py` (`synthesize`:546, `plugin.engine.synthesize`:614), `plugins/tts_xtts/plugin/core/warm_worker.py` (`self._lock`:291, held in `run_job`:309) | Replace the warm-worker `Lock` with a bounded **semaphore**; **lazy-spawn** the N-th worker only on demand (VRAM); `run_in_threadpool` the endpoint. Cloud (Voxtral) concurrency is free. |
| F | Correctness paths | `plugins/tts_mixed/handler.py` (group loop, `stitch_segments`, `_group_needs_render`), scheduler `recovery.py`, `app/db/segments.py` / state | Stitch barrier (manuscript order), artifact-validated completion, cancel signal+join, recovery K-of-N, per-segment SQLite writes, stuck-segment heartbeat. |
| G | Frontend multi-active | `frontend/src/store/live-jobs.ts` (`OverlayDelta`), `frontend/src/utils/jobEventAdapters.ts`, `frontend/src/utils/queueOverlayFields.ts`, `frontend/src/api/hydration/index.ts`, `frontend/src/pages/Book/studio/useStudioChapter.ts` (singular `chapterRenderActiveSegmentId`), `ScriptView.tsx` | Thread a chapter-level `active_segments_map` end-to-end (extract→whitelist→merge per the W4 two-layer lesson); generalize the singular active segment to a SET with per-segment progress; rAF-coalesce. |
| H | ETA | `app/orchestration/progress/eta.py`, progress service | Throughput/bottleneck-based ETA for N heterogeneous workers; bracket / "estimating…" until ≥3 completions. |
| I | Toggle + specs | settings; `design-docs/specs/{queue-jobs,system-architecture,data-model,live-events,progress-presentation}.md` | Cap-default-1 toggle; spec reconciliation + changelog rows; invariant test suite. |

## Connections (the wires that must not break)

- **A → B → C → D**: the cap value flows manifest → semaphore → admission → per-segment dispatch. A change to the cap semantics touches all four.
- **C ↔ F**: the parent/child model determines recovery, cancel, and stitch — these MUST share one model (one chapter job with child units), or recovery dedup (`recovery.py` dedupes by `chapter_id`) silently breaks.
- **D → progress service → G**: per-segment markers from concurrent children must carry segment identity into a **multi-active** progress payload; the frontend overlay must thread it through the **same two-layer path** W4 fixed (jobEventAdapters extract + queueOverlayFields whitelist + hydration merge) — a field added to the store but not whitelisted is dead at runtime.
  - **Wire shape (resolved 2026-06-29 — verify run).** `active_segments_map` is a **new field on the existing chapter job event**, not a new socket channel — that's what INV-9 means here (a field on a frame the page already receives + hydrates is fine; a parallel topic is not). It is the authoritative multi-active snapshot the overlay/hydration consume (chosen over reconstructing it client-side from the per-segment `segments.progress` stream, because the chapter event is what hydration already loads for a mid-render page open). **The live-events spec does not define this field yet** — it is single-active today (see R-F); adding `active_segments_map` + the bracketed-ETA fields to `live-events.md`/`data-model.md` is owned by task **007** (the spec-reconciliation task, not started). Until 007 lands, plan and spec are intentionally out of step here.
- **E ↔ B**: server-side cap (semaphore in the TTS server) and orchestrator-side cap (semaphore in resources.py) are **two enforcement points for the same number** — keep them consistent (both read the manifest cap). Orchestrator throttles dispatch; server throttles inference.
- **F (stitch) ↔ C (children)**: stitch is a **barrier** — it runs only after all children produce validated artifacts, in manuscript (DB segment) order, never completion order.
- **H ↔ D**: ETA reads aggregate throughput from the parent, which aggregates from isolated child timing (D). With cap=1 it must reduce to today's behavior.

## Invariants (must hold across the whole change)

- **INV-1 — Ships dark.** Default cap = 1 ⇒ behavior byte-identical to today. Parallelism is opt-in via a toggle/setting.
- **INV-2 — Stitch order.** The chapter WAV concatenates segments in **manuscript order**, regardless of completion order.
- **INV-3 — Validated completion.** A segment/chapter is "done" only on a **validated artifact** (non-zero, duration-sane), not on subprocess exit code.
- **INV-4 — Monotonic durable status, one job per chapter.** The parent chapter job is the UI/recovery-visible unit; its durable status never regresses; children are internal.
- **INV-5 — No engine-ID branching.** Concurrency is **manifest-driven** (per `.agent/rules/modular_architecture.md`); core code must not branch on engine IDs for caps/pools.
- **INV-6 — Per-segment state isolation.** Concurrent segments never share the single-stream mutable timing/marker state (`_dispatch` closure).
- **INV-7 — Cancel safety.** Cancel sets a shared stop signal, **joins all in-flight** children before the terminal write / resource release; no orphan WAVs or straggler `SEGMENT_SAVED` writes.
- **INV-8 — Recovery resumes only unfinished.** Restart re-renders only segments without a validated artifact (reuse via `_group_needs_render`).
- **INV-9 — No new wire channel (frontend).** Thread existing fields end-to-end via the W4 two-layer pattern; reuse `reason_code`/`indeterminate`/per-segment progress; no parallel channel.
- **INV-10 — VRAM-aware, fail-safe.** Lazy-spawn the N-th worker (never pre-spawn N); on spawn/OOM failure fall back to cap 1 with a logged warning.

## Risks & open questions

- **R-A (keystone) — the `_dispatch` single-stream closure.** ~700 lines of shared mutable timing/marker state assume one sequential render. Isolating per-segment state (or routing children through per-segment sub-dispatches) is the hardest, highest-value refactor (Part D). Flagged independently by the scheduler and reliability panel lenses.
- **R-B — VRAM ceiling for N XTTS instances.** ~4 GB/instance; N=2 plausible on 8 GB, N=3 tight. Mitigation: lazy spawn + manifest cap + OOM fallback (INV-10). The owner's past observation suggests headroom; pin the default conservatively.
- **R-C — `state.json` write contention.** Full-file rewrite per `update_job`/`update_segments_bulk` under N concurrent writers. Mitigation: per-segment status to the SQLite `segments` table (WAL), state.json only at chapter granularity.
- **R-D — ETA correctness under heterogeneous parallel pools.** Single-stream CPS is wrong for N mixed-speed workers. Mitigation: rolling-throughput / bottleneck model, bracketed display (Part H).
- **R-E — building on an unverified core.** W-MIX just reworked the synthesis core; its visual check is unverified. Mitigation: the prerequisite gate (00-overview). *(Update 2026-06-29: the W-MIX-LA preparing/ETA/no-fabrication core is now owner-verified on a live mixed render — G0's synthesis-core risk is largely retired; the remaining G0 item is the owner's visual sign-off to enable parallelism.)*
- **R-F (newly surfaced — verify run, 2026-06-29) — the single-active emission model collides under N.** The current per-segment progress wire is **single-active by construction**: the orchestrator tracks one `active_segment_id`, and `app/api/ws.py` fires `SEGMENT_SAVED` for `prev_active_segment_id` on the *transition* to `new_active_segment_id` (live-events.md "per-segment render clock"; §"`segments.progress` fires a `SEGMENT_SAVED` for `prev_active_segment_id`"). With N children active at once there is no single "current → next" handoff — each child renders and completes independently. **Task 003 must therefore not only isolate per-segment `_dispatch` state but also rework this emission**: each concurrent child emits its own segment-scoped progress frames and its own `SEGMENT_SAVED` on *its own* completion (validated artifact, INV-3), and the orchestrator assembles the `active_segments_map` snapshot from those — never from a single active slot. This is part of the R-A keystone and is the seam where a context-limited executor would otherwise leave a single-active artifact in place that silently drops or mis-attributes concurrent completions.

## Phase 2 — Render Monitor (added 2026-07-10, post M-PAR-3 gate clearance)

M-PAR-3 (parts G/H above) is owner-confirmed live (segments render in parallel, chapters render in parallel). This section maps the remaining work to turn the already-built, fixture-fed `SegmentRenderMonitor.tsx` into a real, interactive, configurable production surface, per [10-phase2-render-monitor.md](10-phase2-render-monitor.md) and `design-docs/specs/progress-presentation.md` §7A (invariants M1-M3).

**What already exists (verified 2026-07-10, do not rebuild):** `frontend/src/components/progress/SegmentRenderMonitor/SegmentRenderMonitor.tsx` (299 lines) already implements M1 (char-weighted aggregate, `charWeightedProgress()`), M2 (crosshatch failure cue), M3 (reduced-motion gating, no internal timer), the `<10`/`10-60`/`>60` degrade thresholds (hardcoded and tested, matching the design doc's numbers exactly), and an always-present accessible `<table>` fallback. It is a **pure, static, prop-driven, no-interaction component** — no click handlers, no popover, no retry, and (a real gap) **no `aria-live` milestone region** despite the spec requiring one. It is wired into `ActivityPage.tsx` but 100% behind a `devMode` fixture (`devSegmentRenderMonitorFixture.ts`) — zero live data flows into it today, even in dev mode.

### New parts (Phase 2)

| # | Part | Files | Responsibility |
|---|---|---|---|
| J | Segment inventory hydration | `app/orchestration/tasks/segment_synthesis.py` (`_on_child_segment_tick`, `_current_active_segments_map`), `app/api/contracts/events.py`, `frontend/src/types/index.ts` (`ActiveSegmentMapEntry`), a new per-chapter segment-inventory source (script-view endpoint reuse or a new lightweight query) | Give the monitor a real, complete `SegmentRenderMonitorSegment[]` — every segment (not just active ones) with real `charCount`, a real `failed` phase, and (optionally) `engineId`. |
| K | Milestone accessibility | `SegmentRenderMonitor.tsx` | Add the spec-required `aria-live="polite"` milestone region (chapter start/complete, major thresholds) — currently entirely missing, a real defect against the binding spec, not just an enhancement. |
| L | Interaction layer | `SegmentRenderMonitor.tsx` (or a new wrapper), a new popover component | Click/tap a block → popover with per-segment detail (engine, attempt count, elapsed, reason code, retry). Keyboard-reachable via the existing accessible table (a "Details" affordance per row), not popover-only. |
| M | Progressive disclosure (peek strip) | `ActivityPage.tsx` or a new `RenderMonitorPeekStrip.tsx` | The design doc's Level 2 ("opt-in peek strip") doesn't exist today — the shipped component is an all-or-nothing Level-3 field. Build the peek→expand transition; auto-appear at N≥2 concurrently-active segments, dismissible, not re-surfaced every session. |
| N | Cap configuration UI | `frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx` (already has a **binary 1/2 toggle** for `tts_parallel_cap` — upgrade to a numeric stepper), `frontend/src/pages/Engines/components/EngineCard.tsx` (new per-engine override control for `tts_engine_caps[engine_id]`, using the already-available `engine.behavior.max_concurrent_workers` as the displayed ceiling) | Closes the exact "why is my manifest edit to 4 having no effect" gap surfaced this session — `tts_parallel_cap` currently only has a 1↔2 toggle in the UI; `tts_engine_caps` has **zero** frontend consumer despite being fully wired server-side. |
| O | ETA wiring | `app/orchestration/progress/eta.py` (`BracketedEtaTracker`, built 2026-07-04, **never wired into any live event builder** — confirmed gap), whatever event builder feeds the chapter/monitor ETA | The monitor's ETA display needs `BracketedEtaTracker` actually connected to a live frame; today it's built and unit-tested but produces nothing an event consumes. |
| P | Live cap admission (added 2026-07-11) | `app/orchestration/scheduler/resources.py` (`EngineClassSemaphore.try_acquire`, `ResourceClaim`, `reserve_task_resources`/`release_task_resources`), `app/orchestration/scheduler/cap_settings.py` (`resolve_effective_cap`, reused not reimplemented), `app/orchestration/tasks/synthesis.py` (`_manifest_resource_claim`), `app/db/state_settings.py` (new `set_engine_cap`), new `GET`/`PUT /api/engines/{id}/concurrency` in `app/api/routers/engines.py` | Closes the deeper gap N's UI deliberately defers: even with N's honest cap UI, a cap change has no live effect on already-queued/in-flight work — `ResourceClaim.cap` freezes the effective cap at construction, and the semaphore is grow-only. Separates the manifest ceiling (still grow-only) from a live limit resolved fresh on every admission attempt. |

### New connections (Phase 2)

- **J is the prerequisite for everything else.** L (interaction), M (peek strip), and the monitor's very presence on real data all depend on J's real segment array existing — do not build L or M against the fixture; they'd need re-wiring once J lands. Sequence J first.
- **J ↔ existing Part G (frontend multi-active).** `active_segments_map` is already reachable app-wide (`useJobs.ts`'s handler is not chapter-scoped — confirmed 2026-07-10) — J does NOT need new WebSocket plumbing to reach the Activity page, only to enrich what's already reachable with `charCount`/`failed`/`engineId`, and to source the full (not just active) segment inventory.
- **N is independent of J/K/L/M** — it's a settings/config UI change with no dependency on the monitor's data pipeline, and can be built in parallel. It directly closes the cap-configuration confusion diagnosed this session (`TASKS.md`'s W-PAR entry, 2026-07-10).
- **O ↔ J.** The monitor's ETA display is meaningless without O; but O is also independently valuable to Phase 1's existing chapter-level ETA display (not monitor-specific) — building O benefits both.
- **K is fully independent** — a self-contained fix to the existing component, no data-pipeline dependency.
- **P ↔ N.** P is the backend half of the same cap-configuration story N's UI opens — N makes the setting writable and honest about its ceiling; P makes writing it actually do something to live/queued work. P is independent of N technically (N's existing raw-`POST /api/settings` write path keeps working unchanged even without P), but the two are only a complete fix together. P is otherwise fully independent of J/K/L/M/O — no shared files, no ordering constraint.

### New invariants (Phase 2, extending M1-M3 from progress-presentation.md §7A)

- **M4 — No second data source of truth.** J's segment inventory + enrichment must not create a parallel/competing progress channel — it enriches the existing `active_segments_map` field (INV-9 from Phase 1 applies here too) and reuses the existing script-view segment fetch, not a new WS topic.
- **M5 — Cap UI never exceeds the manifest ceiling.** N's numeric stepper/per-engine override must clamp its own input to `engine.behavior.max_concurrent_workers` (already available client-side) — do not let the UI accept a value `resolve_effective_cap` will silently reclamp; that's exactly the confusing-three-knobs problem this closes, not a new instance of it.
- **M6 — Popover never replaces the accessible table.** L's popover is a decoration-layer convenience; `SegmentAccessibleTable` remains the authoritative keyboard/screen-reader surface (per the existing M-series dual-layer a11y rule) — every popover affordance needs a table-reachable equivalent.
- **M7 — A live cap change reaches admission within one retry cycle, never requires a restart, and never evicts in-flight work.** P's whole purpose. `ensure_min_cap` is called only with the manifest ceiling, never with a live/effective value, so a shrink can never accidentally regrow via the existing grow-only path; a shrink blocks new admissions without touching already-admitted tasks (`release()` never consults cap).

### New risks

- **R-G — `active_segments_map`'s `phase` type has no `'failed'` value anywhere on the wire today** (confirmed: zero backend writes of `phase: 'failed'`). J must either add it end-to-end (backend emit → contract → frontend type) or define a clear client-side inference rule — do not half-implement (a `'failed'` UI state with no backend source is a fabricated-looking status, which this project's progress-no-fabrication principle forbids).
- **R-H — Two places already write `POST /api/settings`-driven cap UI** (the existing binary toggle in `GeneralSettingsPanel` and the new per-engine control in `EngineCard`) — per the research, `tts_engine_caps`/`tts_parallel_cap` are **only parsed from the JSON-body branch** of the settings endpoint, not the form-encoded branch. N's tasks must follow the existing raw-JSON-fetch pattern (`updateParallelCap`'s shape) exactly, not the form-encoded helpers used for other settings, or the new UI will silently no-op.
- **R-I — P's per-child segment admission is unverified (added 2026-07-11).** The chapter-parent `ThreadPoolExecutor`'s pool sizing (`generation.py:286-288`) was confirmed to use the manifest ceiling correctly under P's design, but whether individual child segment dispatches are separately reserved through `reserve_task_resources` (making a mid-chapter shrink actually throttle them) was NOT traced before this task was written — task 014 makes tracing this a mandatory first step, not an assumption.

## New parts (Phase 3, added 2026-07-12)

| # | Part | Files | Responsibility |
|---|---|---|---|
| Q | Per-row monitor mount | `frontend/src/components/queue/QueueItem.tsx`, `frontend/src/pages/Activity/ActivityPage.tsx` | Move the `SegmentPeekStrip`/`SegmentRenderMonitor` pair from a page-level singleton (driven by one `activeJob`) into each `activeJobs` row in `GlobalQueue.tsx`, so N concurrently-rendering jobs each get their own strip beneath their own progress bar, matching the North Star (`SegmentRenderStrip.tsx`). |
| R | Segment-inventory fetch dedupe | `frontend/src/hooks/useSegmentInventory.ts` | Fix the effect at line 81 (`[chapterId, engineId, activeSegmentsMap]`) so `GET /script-view` fires once per `chapterId`, not once per progress tick — merge the live `active_segments_map` into the fetched base inventory client-side instead of re-fetching. |

### New connections (Phase 3)

- **Q depends on J (Phase 2 real hydration)** — already satisfied, J shipped 2026-07-11. Q is purely a mount-point change: `useSegmentInventory`, `SegmentPeekStrip`, and `SegmentRenderMonitor` are reused unmodified (confirmed their prop interfaces are generic — `segments`/`activeCount`/callbacks, no page-singleton assumption baked in).
- **Q and R are independent of each other** — Q changes *where* the hook is called (once per row instead of once per page); R changes *how often* the hook's internal effect fires. Either can land first; R is lower-risk to land first since it has no visible UI surface to regress.
- **Q multiplies R's urgency.** Today the refetch-per-tick issue (R) is bounded to at most one `useSegmentInventory` instance (the single active job) by the `devMode` gate. Once Q moves the hook to per-row, an N-job Activity page would run N concurrent instances of the same refetch-per-tick pattern — R should land in the same phase as Q, not deferred, even though technically independent.
- **Q must not regress `QueueItem`'s existing layout invariants** — `PredictiveProgressBar` (lines 521-552) is the existing anchor; the strip mounts directly after it (line 553), inside the same `flex:1` container, not as a sibling that could reflow the row's other elements (status badge, remove button).

### New invariants (Phase 3)

- **M8 — One `useSegmentInventory` instance per rendering job, not per page.** Q's core change. A page showing 3 concurrently-rendering jobs must produce 3 independent hook instances, each scoped to its own `chapterId`/`activeSegmentsMap`, not a shared/pooled one — no cross-job state bleed.
- **M9 — `useSegmentInventory`'s network fetch is keyed on `chapterId` alone; `active_segments_map` only ever merges into already-fetched state, never re-triggers the fetch.** R's core change. The effect's dependency array must drop `activeSegmentsMap` (and `engineId`, if unused in the request) from the fetch-triggering condition; a separate, cheap merge step (not a new network call) applies the live map to the fetched base segments on every tick.
- **M10 — Only `activeJobs` rows get a strip; `pendingJobs`/history rows never do.** Matches Phase 2's `ACTIVE_STATUSES` gate (`queued`, `preparing`, `running`, `finalizing`) — Q must reuse that same status set (or the equivalent already inlined in `QueueItem.tsx`, e.g. `isTrulyActive`), not invent a second one.

### New risks

- **R-J — `QueueItem.tsx` is 556 lines and already inlines its own status-set logic (`isTrulyActive`, `isRunningOrProcessing`) rather than importing `ACTIVE_STATUSES` from `ActivityPage.tsx`.** Q must confirm which existing inline check (if any) is equivalent to `ACTIVE_STATUSES` before gating the strip on it — a mismatch (e.g. `QueueItem` treating `'processing'` as active when `ACTIVE_STATUSES` doesn't) would show a strip Phase 2's own logic wouldn't have shown for the same job.
- **R-K — `ActivityPage.tsx`'s stale comment (lines 54-58) explicitly claims the "popover/peek-strip UI for choosing among several is a later task (010/011), out of scope here"** — this is factually wrong now (010/011 never built multi-job choosing) and must be corrected as part of Q's change, not left to drift further once Q actually does add multi-job support.

## Map links out

- Master roadmap & checklist: [TASKS.md](../../TASKS.md) (W-PAR).
- Subsumes W5 from [mixed-synthesis-fused-proposal](../mixed-synthesis-fused-proposal/00-overview.md) (§Scope, Layer 4).
- Architecture contracts: `design-docs/specs/{system-architecture,queue-jobs,data-model,live-events,progress-presentation}.md`; `.agent/rules/modular_architecture.md`.
- Phase-2 visualizer design: [10-phase2-render-monitor.md](10-phase2-render-monitor.md).
- Phase-3 multi-job rows design: [11-phase3-multi-job-rows.md](11-phase3-multi-job-rows.md).
