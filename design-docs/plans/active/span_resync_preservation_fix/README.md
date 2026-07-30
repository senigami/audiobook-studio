# Span-preservation fix — plan folder

**Supersedes `00-plan.md`** (the first-draft plan from 2026-07-19). That draft was reviewed by three
independent panelists (Fable + this repo's Esther/Tamsin reasoning twins — see
`.agent/frontier-calibration/reviews/RC-1-plan-comparison.md`) and found **not build-ready**: its
core mechanism (re-derive fragments) was wrong, its anchor model under-counted real splits, and it
conflicted with an existing committed test. `00-plan.md` is kept for the historical record — do not
build from it. This folder (`01-map.md` onward) is the corrected plan, built via `plan-architect`
from the original RC-1 finding plus all three reviews' feedback, with three additional verification
scouts resolving the open questions the reviews raised.

## Status protocol

Each task file in `tasks/` starts with `Status: pending | in-progress | complete — <date>` and its
steps/acceptance criteria as `- [ ]` checkboxes. Whoever executes a task updates its status line and
ticks its checkboxes **in the same change** as the work — a stale checklist poisons every later
session that reads it.

## Archive convention

When every task is complete, move this whole folder to
`design-docs/plans/active/../archive/span_resync_preservation_fix/` (or wherever this repo's plan
archive lives — check `design-docs/plans/REMAINING_TASKS.md` conventions at archive time).

## Files

- `00-overview.md` — the task, goal, scope, success criteria
- `01-map.md` — the implementation map: parts, connections, invariants, risks
- `02-roadmap.md` — ordered workloads + dependency graph
- `tasks/` — one self-contained, map-linked task per unit of work
- `00-plan.md` — **historical, superseded** — the first draft, kept for the record
