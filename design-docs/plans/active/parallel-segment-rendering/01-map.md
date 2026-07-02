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

## Map links out

- Master roadmap & checklist: [TASKS.md](../../TASKS.md) (W-PAR).
- Subsumes W5 from [mixed-synthesis-fused-proposal](../mixed-synthesis-fused-proposal/00-overview.md) (§Scope, Layer 4).
- Architecture contracts: `design-docs/specs/{system-architecture,queue-jobs,data-model,live-events,progress-presentation}.md`; `.agent/rules/modular_architecture.md`.
- Phase-2 visualizer design: [10-phase2-render-monitor.md](10-phase2-render-monitor.md).
