# Parallel Segment Rendering — plan folder

**Status:** **M-PAR-1 shipped dark** (001 + 004 done 2026-06-26, cap=1 = no behavior change); 002/003/005/006/007 pending; **resume gated on W-MIX-LA 007** (spec recon + owner 👁). G0 softened 2026-06-29: synthesis core owner-verified ("best it's ever done"); remaining G0 item = owner sign-off to raise cap > 1. · **Created:** 2026-06-26 · **Workstream tag:** W-PAR · **Master:** [TASKS.md](../../TASKS.md)

## What this is

A chapter is already broken into **render groups** (≤500-char segments, each tagged with its engine). Today those groups render **sequentially**, one render at a time, and a single XTTS stream does not saturate the GPU. This workstream makes the segments of a chapter render **concurrently** across per-engine worker pools (GPU / CPU / cloud), capped per engine — a large wall-clock win for a single chapter.

**Decided up front (from the 2026-06-26 fusion design triage):**
- **Orchestrator-level segment scheduling** (parent chapter job + child segment units), not N independent jobs.
- **Each engine declares a concurrency cap** in its manifest; the scheduler enforces it via per-engine semaphores. **Default cap = 1 → ships dark** (off-by-default toggle).
- **Phase 1 (this folder):** backend parallelism + the frontend generalization so the *existing* per-segment progress bars light up in parallel ("BitTorrent effect" for free).
- **Phase 2 (fast-follow, [10-phase2-render-monitor.md](10-phase2-render-monitor.md)):** the dedicated proportional-block "render monitor" visualizer. Documented here, not tasked in detail.
- **Subsumes W5** (mixed `ResourceClaim`): per-engine caps replace the binary exclusive gate.
- **Prerequisite gate:** the W-MIX `👁 VISUAL CHECK` must be owner-verified first — do not stack parallelism on an unverified sequential core.

## How to pick up a task

1. Read [00-overview.md](00-overview.md) (goal, scope, success criteria), then [01-map.md](01-map.md) (the implementation map — parts, connections, invariants **INV-1…INV-10**, risks **R-A…R-E**).
2. Read [02-roadmap.md](02-roadmap.md) for the workload order + dependency graph.
3. Open the matching `tasks/NNN-*.md` — each is self-contained (goal, files, steps, acceptance, map links, out-of-scope).
4. TDD per `.agent/rules/verification.md`: write the failing test first, confirm red for the right reason, implement, re-run. Revert-check bug-fix tests (R1). Backend specs are jointly authoritative — bump the matching spec in the same change.

## Status protocol

Mark task status in the task file's header (`Not started` / `In progress` / `DONE (date)`) and tick the W-PAR checklist in [TASKS.md](../../TASKS.md) in the same change.

## Files

| File | Purpose |
|---|---|
| [00-overview.md](00-overview.md) | Task, goal, scope/boundary, success criteria, prerequisite |
| [01-map.md](01-map.md) | Implementation map: parts, connections, invariants, risks |
| [02-roadmap.md](02-roadmap.md) | Ordered workloads + dependency graph + milestones |
| `tasks/001-…` … `007-…` | Self-contained Phase-1 tasks |
| [10-phase2-render-monitor.md](10-phase2-render-monitor.md) | Phase-2 dedicated visualizer (design captured; fast-follow) |
