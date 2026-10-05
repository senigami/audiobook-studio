# Chapter Editor Catalog Completion

**What this is:** the remaining, already-specified-but-unbuilt catalog of Director's Console features
(Cast/Booth/Revise modes) that the 2026-07-10 scaffold-and-wire-in pass deliberately deferred. That
pass (`_archive/directors_console_activation/`) explicitly scoped itself to "port current working
functionality faithfully, don't invent the full v1 catalog" — this plan is the follow-on that builds
the rest of what `design-docs/workflows/chapter-editor-modes.md` specifies.

**This plan does NOT execute anything.** Produced by `/plan-architect` in research-only mode. Run
`/plan-run` pointed at this folder to execute it.

## Where this fits

Source design doc: [`design-docs/workflows/chapter-editor-modes.md`](../../../workflows/chapter-editor-modes.md)
— read it before any task; this plan's map cites specific sections but doesn't repeat the full
design. Status ledger: `design-docs/plans/TASKS.md`'s "Unscheduled — design decisions pending" →
"Chapter editor art-program" section (all design decisions there are already resolved; only the
catalog-additions bullet list remains unbuilt — this plan decomposes that list).

## How to read this folder

| File | Purpose |
|---|---|
| `00-overview.md` | Task, scope, success criteria |
| `01-map.md` | Parts, connections, invariants, risks — critically, the **sequencing dependency**: mutation-batching must land before the palette additions that call the assignment API directly |
| `02-roadmap.md` | Ordered workloads + dependency graph |
| `tasks/NNN-slug.md` | One self-contained, map-linked task per unit of work |

## Status protocol

Whoever executes a task updates its `Status:` line and ticks its checkboxes in the same change as
the work. When every task is complete, move this folder to
deleted outright (narrative to `wiki/Changelog.md`; the repo keeps no `_archive/`) and update `REMAINING_TASKS.md`'s "Chapter
editor art-program" catalog-additions bullets to reflect completion (do not delete that section —
convert its bullets to `[x]` with a pointer here, matching this repo's convention for closing out a
tracked backlog).
