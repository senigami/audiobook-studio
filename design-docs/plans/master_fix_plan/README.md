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

## Status

**Live status (what's done/pending/next) lives in [`../TASKS.md`](../TASKS.md) — check there, not
here.** Tracking done/pending state in two places let them drift (caught 2026-07-02: this file and
`02-roadmap.md` both said W-MIX-LA 006 was uncommitted days after it had landed). This folder now
holds only the **structural** map — which sub-plan is authoritative for which workstream, how they
connect, and the invariants that must hold across all of them — never a point-in-time status claim.
`OVERNIGHT_LOG.md` remains a narrative session-by-session history, not a current-status source.

## Newer workstreams folded in 2026-06-25 (postdate the original 001–012)
These plans were created after this folder and are routed here so nothing falls outside the master.
For status, see `../TASKS.md`.
- **W-MIX — Mixed-engine model-load progress/ETA** → [`../active/mixed-synthesis-fused-proposal/`](../active/mixed-synthesis-fused-proposal/README.md). A residual bug the core Progress/ETA work (above) did **not** cover.
- **W-MIX-LA — Mixed-synthesis load attribution** → [`../active/mixed-synthesis-load-attribution/`](../active/mixed-synthesis-load-attribution/README.md). W-MIX follow-up from the failed 2026-06-26 G0 check; task 007 (spec reconciliation + 👁 G0 re-check) gates W-PAR resume.
- **W-PAR — Parallel segment rendering** → [`../active/parallel-segment-rendering/`](../active/parallel-segment-rendering/README.md). Subsumes W-MIX W5.
- **W-PERF — Per-span performance metadata / casting export** → [`../proposals/performance_script_model/`](../proposals/performance_script_model/README.md). Design draft, not scheduled. Shares the span/DB model with W13 sub-sentence assignment — the two must ship together or the DB migrates twice.
- **W-QS — Quiet Studio visual redesign** → [`../reference/quiet_studio_migration/`](../reference/quiet_studio_migration/README.md). Only the owner-gated `--accent`→`--action-primary` 94-file rename remains (alias kept as a permanent compat pointer).

## How to pick up work
- Open the task file for the workstream + [01-map.md](01-map.md). The task names its **authoritative
  source** (e.g. `simplification/07`, `final_release/04`) — that source holds the executable detail;
  this task file holds the *ordering, the fold-ins, the invariants, and the dependencies*.
- Check the task's **map links** and the **invariants** before editing — especially:
  - **INV-2 harvest-before-delete** (002 before 005's tree deletion),
  - **INV-4 preserve segment-playback logic** (004 needs it; 005 must not strip it),
  - **INV-5 the xtts adapter is live** (don't delete it).
- See [`../TASKS.md`](../TASKS.md) for what has been executed.
- **Owner forks RESOLVED 2026-06-20** (see [02-roadmap.md](02-roadmap.md)): (1) lost-feature
  restoration **folds into the IA port** (003) as a carried checklist; (2) the **two-level Book +
  Chapter workspace IA is the target**, replacing the broken 5-stage pipeline — **a pipeline design
  review is pending and should precede the W4 build**; (3) **localization is post-v2.0**. The one
  remaining open question is sub-sentence speaker assignment (W13, needs a design decision).

## Status protocol
Mark progress in **[`../TASKS.md`](../TASKS.md)** only — that's the single live checklist. Don't add
done/pending status back into this file, `01-map.md`, or `02-roadmap.md`; they hold structure, not
state.

## Relationship to other plan docs
- [../COMPLETED_WORK_REPORT.md](../COMPLETED_WORK_REPORT.md) — what's already **done** (the mirror of this).
- [../README.md](../README.md) — the per-plan status index.
- This folder is the **forward-looking consolidation**; the referenced sub-plans remain the source of
  executable detail.
