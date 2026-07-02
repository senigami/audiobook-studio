# 02 — Roadmap

Ordered workloads, the dependency graph, and milestones. Each task file in `tasks/` is self-contained; this is the order to execute and what gates what.

## Prerequisite

**G0 — W-MIX visual check verified (owner).** Not a task in this folder; the gate from [00-overview.md](00-overview.md). Phase-1 execution starts only after it passes.

## Workloads (Phase 1)

| Task | Title | Part(s) | Depends on | Gist |
|---|---|---|---|---|
| [001](tasks/001-per-engine-cap-and-semaphores.md) | Per-engine cap declaration + scheduler semaphores | A, B | G0 | **DONE (2026-06-26).** Manifest `max_concurrent_workers` + global cap; replace binary gates with per-engine counting semaphores. Default 1 ⇒ no behavior change. **Subsumes W5.** |
| [002](tasks/002-parent-child-segment-scheduling.md) | Parent/child segment scheduling | C | 001 | Chapter parent job fans child segment units into a bounded pool admitted under 001's semaphores; ResourceClaim derives from child engines. |
| [003](tasks/003-per-segment-dispatch-isolation.md) | Per-segment dispatch isolation (keystone) | D | 002 | Give each concurrent segment its own timing/marker state; parent owns aggregation. The R-A refactor. |
| [004](tasks/004-tts-server-concurrent-inference.md) | TTS-server concurrent inference | E | 001 (cap) | **DONE (2026-06-26).** Warm-worker semaphore + lazy spawn (VRAM-aware) + `run_in_threadpool`; cloud concurrency free. |
| [005](tasks/005-correctness-invariants.md) | Correctness invariants under parallelism | F | 002, 003 | Stitch-order barrier, artifact-validated completion, cancel signal+join, recovery K-of-N, SQLite per-segment writes, stuck-segment heartbeat. TDD the invariants. |
| [006](tasks/006-frontend-multi-active.md) | Frontend multi-active segments | G | 003 (emits multi-active) | `active_segments_map` end-to-end (extract→whitelist→merge→store→hook set→ScriptView); rAF-coalesce; existing bars light up in parallel. |
| [007](tasks/007-eta-toggle-and-specs.md) | ETA under parallelism + off-by-default toggle + spec reconciliation | H, I | 003, 005, 006 | Throughput/bracketed ETA; cap-default-1 toggle/setting; spec bumps + changelog; final invariant test gate. |

> **G0 softened (2026-06-29).** 001 and 004 above were already executed dark (default cap=1, no behavior change) ahead of a formal G0 re-check; the owner separately confirmed the synthesis core is now "best it's ever done" on 2026-06-29. The surviving gate before 002/003 is (a) W-MIX-LA task 007 closing (spec recon + its own G0 re-check) and (b) owner sign-off to raise cap > 1. See [`../mixed-synthesis-load-attribution/README.md`](../mixed-synthesis-load-attribution/README.md).

## Dependency graph

```
G0 (prereq, owner)
 └─► 001 ─┬─► 002 ─► 003 ─┬─► 005 ─┐
          │               │        ├─► 007
          └─► 004         └─► 006 ─┘
```

- **001** is the foundation (cap + semaphores) and is independently safe (default 1 = no-op). **Subsumes W5** — once 001 lands, the mixed `ResourceClaim.none()` gap is closed.
- **004** (server concurrency) depends only on 001's cap and can run in parallel with 002/003.
- **003** is the keystone (R-A) and gates both 005 (correctness) and 006 (frontend, which needs the multi-active signal 003 emits).
- **007** is last — ETA + the toggle + spec reconciliation + the full invariant test gate.

## Milestones

- **M-PAR-1 — "ships dark":** 001 (+004) merged. Per-engine caps + server concurrency exist; default 1 ⇒ no behavior change; W5 subsumed. Safe to land pre-release.
- **M-PAR-2 — "parallel backend":** 002, 003, 005. A chapter actually renders segments concurrently with the caps raised; stitch/cancel/recovery correct under load. Still off-by-default.
- **M-PAR-3 — "visible parallelism":** 006, 007. Existing per-segment bars light up in parallel; bracketed ETA; toggle + specs; full invariant suite green. Phase 1 complete.
- **Phase 2 (fast-follow):** the dedicated render monitor — [10-phase2-render-monitor.md](10-phase2-render-monitor.md).

## Cross-references

- Implementation map + invariants/risks: [01-map.md](01-map.md).
- Master checklist: [TASKS.md](../../TASKS.md) (W-PAR).
