# Parallel Segment Rendering — plan folder

**Status:** **Parallel rendering is the shipped default, cap > 1** (owner directive, 2026-07-06 — see `app/orchestration/scheduler/resources.py` `_engine_class_admission_enabled`). Phase 1 (001–007) and Phase 2 (008–016, render-monitor UI: segment inventory hydration, milestone a11y, interaction popover, peek strip, cap config UI, bracketed ETA, live cap admission, multi-job rows) are all built and `accepted`/`complete` per [status.json](status.json), `green_gate: passed`. Several tasks (008, 011, 012, 013, 015) still carry a **"live-render verification still pending owner"** note in status.json — the code is in and gate-passed, but nobody has confirmed the concurrent-render visual behavior end-to-end in a real render yet. · **Created:** 2026-06-26 · **Workstream tag:** W-PAR · **Master:** [TASKS.md](../../TASKS.md)

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
