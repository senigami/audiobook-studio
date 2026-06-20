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

## How to pick up work
- Open the task file for the workstream + [01-map.md](01-map.md). The task names its **authoritative
  source** (e.g. `simplification/07`, `final_release/04`) — that source holds the executable detail;
  this task file holds the *ordering, the fold-ins, the invariants, and the dependencies*.
- Check the task's **map links** and the **invariants** before editing — especially:
  - **INV-2 harvest-before-delete** (002 before 005's tree deletion),
  - **INV-4 preserve segment-playback logic** (004 needs it; 005 must not strip it),
  - **INV-5 the xtts adapter is live** (don't delete it).
- This is **planning only** — nothing here has been executed.
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
