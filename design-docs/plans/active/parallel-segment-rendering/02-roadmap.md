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
- **M-PAR-3 — "visible parallelism":** 006, 007. **CONFIRMED 2026-07-10 (owner-verified live):** segments render in parallel, chapters render in parallel. Phase 1 COMPLETE.
- **Phase 2 — render monitor (this roadmap, below):** the dedicated BitTorrent-style visualizer, now unblocked.

## Workloads (Phase 2 — render monitor, added 2026-07-10)

Gate cleared (M-PAR-3 confirmed). See [01-map.md](01-map.md)'s "Phase 2" section for parts J-O, connections, invariants M4-M6, and risks R-G/R-H. **008 (segment inventory hydration) is the prerequisite for 010/011** — do not build the peek strip or popover against the fixture.

| Task | Title | Part(s) | Depends on | Gist |
|---|---|---|---|---|
| [008](tasks/008-segment-inventory-hydration.md) | Real segment inventory + char count + failed-phase hydration | J | M-PAR-3 (done) | Replace the fixture: real `SegmentRenderMonitorSegment[]` for the Activity page, joining `active_segments_map` (already app-wide reachable) with a per-chapter segment inventory for char counts; add `'failed'` phase end-to-end. |
| [009](tasks/009-monitor-milestone-a11y.md) | Milestone `aria-live` region | K | none | Add the spec-required (§7A) milestone-only announcement region — a real, standalone defect fix, independent of the data pipeline. |
| [010](tasks/010-monitor-interaction-popover.md) | Per-segment popover + keyboard-reachable detail | L | 008 | Click/tap a block → popover (engine, attempts, elapsed, reason, retry); keyboard equivalent via the accessible table. |
| [011](tasks/011-monitor-peek-strip.md) | Peek-strip progressive disclosure | M | 008 | Build the missing Level-2 "opt-in peek strip" → Level-3 expand transition; auto-appear at N≥2 active, dismissible. |
| [012](tasks/012-cap-configuration-ui.md) | Cap configuration UI (global stepper + per-engine override) | N | none | Upgrade `GeneralSettingsPanel`'s binary 1/2 toggle to a numeric stepper; add a per-engine `tts_engine_caps` override on `EngineCard`, clamped to `engine.behavior.max_concurrent_workers`. Independent of 008-011. |
| [013](tasks/013-bracketed-eta-wiring.md) | Wire `BracketedEtaTracker` into a live event | O | 008 (for monitor use; independently valuable to Phase 1's chapter ETA too) | Connect the already-built, unit-tested `BracketedEtaTracker` to an actual live frame — currently produces nothing any consumer reads. |
| [014](tasks/014-live-cap-admission.md) | Live per-engine cap admission (added 2026-07-11) | N (extends) | none | Closes the gap 012 deliberately defers: a cap change (however written) has no live effect on already-queued/in-flight work until a process restart, because `ResourceClaim.cap` freezes the *effective* cap at construction and `EngineClassSemaphore` is grow-only. Separates the manifest ceiling (still grow-only) from a live limit resolved fresh on every admission attempt; adds `GET`/`PUT /api/engines/{id}/concurrency`. Independent of 008-013; optionally consumed by 012's UI once both land. |

### Phase 2 dependency graph

```
M-PAR-3 (done)
 └─► 008 ─┬─► 010
          └─► 011
      013 (008 for monitor context, but independently valuable standalone)

009 ─────────────────────► (fully independent)
012 ─────────────────────► (fully independent)
014 ─────────────────────► (fully independent; 012 may optionally consume its API once both land)
```

### Phase 2 milestones

- **M-PAR2-1 — "real data":** 008 done. The monitor (once surfaced) shows genuine render state, no fixture.
- **M-PAR2-2 — "interactive + accessible":** 009, 010, 011 done. Milestone announcements, popover detail, and progressive disclosure all real.
- **M-PAR2-3 — "configurable":** 012 done. The cap-confusion this session diagnosed is closed with a real UI.
- **M-PAR2-4 — "honest ETA":** 013 done. Bracketed ETA reaches a live frame.
- **M-PAR2-5 — "changes actually take effect live":** 014 done. A cap change reaches admission within one retry cycle, no restart required, no in-flight work evicted.
- **Phase 2 complete** when all of 008-014 are done AND the monitor is un-gated from `useDevMode()` for real users (a final task-013-adjacent step: remove the dev gate once 008 lands and is verified live).

## Cross-references

- Implementation map + invariants/risks: [01-map.md](01-map.md).
- Master checklist: [TASKS.md](../../TASKS.md) (W-PAR).
