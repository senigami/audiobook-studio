# Book View Redesign — implementation plan

This folder is the live, ordered implementation plan for the **book/chapter workspace redesign** and
the real-app bugs it surfaced. The design **spec** is [`design-docs/plans/book_view_ia_proposal.md`](../../active/book_view_ia_proposal.md)
and remains the source of truth — this folder turns it into executable, verifiable tasks.

> Built with the `code-audit-planner` conventions, but **no audit was run** — the spec was already
> agreed with the owner. Findings here are the spec's gaps vs. current code, grounded by a read-only
> code sweep (file:line in `00-audit-report.md`).

## Scope split (read this first)

- **Track B — real-app bug fixes (`app/` + `frontend/src/`):** four pre-existing bugs (B1–B4). **No
  overlap with the demo mock**, so they're safe to start immediately and independently.
- **Track A — mock IA redesign (`frontend/src/demo/stages/siteMockup/`):** restructure the book view.
  ⚠️ **Another worker is concurrently editing the mock** (player-bar / minimap: `MockTapeControls.tsx`,
  parts of `siteMockupStage.tsx`). Track A tasks name the files they touch; coordinate before starting
  a task whose files overlap that work.

## Status protocol

Each task carries a **Status**: `not-started | in-progress | blocked | done`. Update it in the task
file as work lands. Tasks are executed one at a time.

## How to pick up work

1. Read [`01-roadmap.md`](01-roadmap.md) — it orders tasks into **workloads** with a dependency graph.
2. Take the next task in the current workload whose **Blocked by** tasks are all `done`.
3. Open that `tasks/NNN-*.md` in full and execute it — it's self-contained (goal, files, target shape, steps, acceptance).
4. Honor the testing standards in `design-docs/specs/testing-standards.md` (R1 revert-check bug-fix tests; mock only boundaries).
5. Update the task **Status**, then return to the roadmap.

## Files

- `00-audit-report.md` — current state, the four bugs + IA gaps (with code evidence), plan reconciliation.
- `01-roadmap.md` — workloads, sequencing rationale, dependency graph.
- `tasks/NNN-*.md` — one self-contained task each.
