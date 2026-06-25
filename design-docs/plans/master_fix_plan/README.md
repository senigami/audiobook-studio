# Master Fix Plan

The single consolidated roadmap of **everything left to fix/finish** for Studio 2.0, built 2026-06-19
from this session's findings + the still-open backlog across all existing plans. It is an **umbrella**:
it maps and orders the workstreams and resolves overlaps (newer plan wins), but defers task-level
detail to the authoritative sub-plans it references.

## Read in this order
1. [00-overview.md](00-overview.md) — goal, scope, and the **supersession table** (which older plans
   are folded into which newer ones).
2. [01-map.md](01-map.md) — the workstreams (W1–W13), their **connections**, the **invariants** (INV-1..8),
   and risks. The centerpiece.
3. [02-roadmap.md](02-roadmap.md) — ordered milestones, dependency graph, and the 3 owner-decision forks.
4. `tasks/001..012` — one consolidated task per workstream.

## Status as of 2026-06-21
- **Done:** 001 (foundation cleanup), 002 (WIRE-1/2/3), 009 (security S6/S7/S10/S11). All committed on `studio2/phase-12.5-style`.
- **Substantially done:** 003 (IA port) — RST-1..7 + book Lexicon shipped; RST-8 + range-assignment deferred by owner; DC-1b gated.
- **Partial:** 008 (UX/A11y/Perf) — A11y A4/A6/A7/A8/A10 + Perf P7/P8/P9 done; A5/A11/A12 + all UX U-items pending.
- **Not started:** 004, 005, 006, 007, 010, 011 (012 is holding/deferred).
- See `OVERNIGHT_LOG.md` for the running session-by-session detail.

## Newer workstreams folded in 2026-06-25 (postdate the original 001–012)
These plans were created after this folder and are now tracked here so nothing falls outside the master:
- **W-MIX — Mixed-engine model-load progress/ETA** → [`../active/mixed-synthesis-fused-proposal/`](../active/mixed-synthesis-fused-proposal/README.md). A residual bug the core Progress/ETA work (above) did **not** cover. **W1 done** (committed `studio2/phase-12.5-style`); W2–W4 + W6 spec reconciliation pending; W5 (mixed `ResourceClaim`) deferred.
- **W-PERF — Per-span performance metadata / casting export** → [`../proposals/performance_script_model/`](../proposals/performance_script_model/README.md). **Design draft, not scheduled.** Shares the span/DB model with W13 sub-sentence assignment — the two must ship together or the DB migrates twice.
- **W-QS — Quiet Studio visual redesign** → [`../reference/quiet_studio_migration/`](../reference/quiet_studio_migration/README.md). **Done** (06-24); only the owner-gated `--accent`→`--action-primary` 94-file rename is deferred (alias kept as a permanent compat pointer).

## How to pick up work
- Open the task file for the workstream + [01-map.md](01-map.md). The task names its **authoritative
  source** (e.g. `simplification/07`, `final_release/04`) — that source holds the executable detail;
  this task file holds the *ordering, the fold-ins, the invariants, and the dependencies*.
- Check the task's **map links** and the **invariants** before editing — especially:
  - **INV-2 harvest-before-delete** (002 before 005's tree deletion),
  - **INV-4 preserve segment-playback logic** (004 needs it; 005 must not strip it),
  - **INV-5 the xtts adapter is live** (don't delete it).
- See the **Status as of 2026-06-21** section above for what has been executed.
- **Owner forks RESOLVED 2026-06-20** (see [02-roadmap.md](02-roadmap.md)): (1) lost-feature
  restoration **folds into the IA port** (003) as a carried checklist; (2) the **two-level Book +
  Chapter workspace IA is the target**, replacing the broken 5-stage pipeline — **a pipeline design
  review is pending and should precede the W4 build**; (3) **localization is post-v2.0**. The one
  remaining open question is sub-sentence speaker assignment (W13, needs a design decision).

## Status protocol
Mark progress in the task file header as `proposed → in-progress → done`. When a workstream's
authoritative sub-plan is fully executed, note it here and in [../README.md](../README.md).

## Relationship to other plan docs
- [../COMPLETED_WORK_REPORT.md](../COMPLETED_WORK_REPORT.md) — what's already **done** (the mirror of this).
- [../README.md](../README.md) — the per-plan status index.
- This folder is the **forward-looking consolidation**; the referenced sub-plans remain the source of
  executable detail.
