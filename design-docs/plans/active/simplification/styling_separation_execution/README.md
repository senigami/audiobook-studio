# Styling separation — execution plan

This is the **executable task breakdown** for ST-1 through ST-4 of
[`../03_styling_separation.md`](../03_styling_separation.md) (the "Zen-garden" phase of
[`../00_overview.md`](../00_overview.md)'s Milestone 3 simplification effort). The parent doc is
the strategy/rationale; this folder is the mapped, per-file task list an executor runs from
directly.

**Why a separate folder now:** a 2026-07-10 fusion-reasoning fact-check found the parent doc's
file list, line counts, and CSS domain boundaries had drifted since it was written (components.css
grew from 3,772→4,440 lines; two target files were split by an unrelated cleanup; one target file
turned out to be dead code; a domain doubled in size; two new feature areas were never accounted
for). This plan's numbers are the **re-verified, current** ones — trust these over the parent doc
wherever they differ. See `00-overview.md` for the full list of corrections.

## Status protocol

Every task file starts with `Status: pending | in-progress | complete — <date>`. **Whoever executes
a task updates its status line and ticks its `- [ ]` checkboxes in the same change as the work** —
a checklist that doesn't match reality poisons every later session that reads it.

## Archive convention

When every task below is complete and the final visual-check checkpoint (see `02-roadmap.md`) has
been signed off by the owner, move this whole folder to
`design-docs/plans/active/simplification/archive/styling_separation_execution/` and flip the
parent `03_styling_separation.md` doc's ST-1–ST-4 checkboxes in `../../../TASKS.md` (Milestone 3 /
task 005 / "Styling separation" line).

## Reading order

1. `00-overview.md` — the task, corrected scope, success criteria.
2. `01-map.md` — the CSS domain map (exact current file boundaries) + the file/contract map for
   ST-2/ST-3/ST-4.
3. `02-roadmap.md` — workload order, dependency graph, risk flags, the final visual-check
   checklist.
4. `tasks/000-conversion-procedure.md` — the shared per-file conversion procedure every ST-3 task
   references instead of repeating.
5. `tasks/NNN-*.md` — one self-contained task per unit of work.

## Orchestrator note

Routed as **Config C** (no frontier involvement) by `plan-advisor` — this is mechanical,
zero-entanglement work (no contract/API changes, no concurrency, established conventions). Every
task below is safe for a mid-tier implementer at low effort; `review-adversarial` after each
workload is the only review gate, no `review-gate`/frontier dispatch needed.
