# Systemic Bug Classes — Improvement Plan

This folder is the live implementation plan produced by the 2026-06-11 code audit of the
recurring Voxtral / mixed-render / progress-presentation bug churn (commits `daedcfea` →
`b88e13b8`). The specs in `design-docs/specs/` remain the source of truth; any task here that
changes behavior must update the matching spec (version bump + changelog row) in the same
change, per `design-docs/specs/README.md`.

- `00-audit-report.md` — what was found and why the same bugs keep recurring.
- `01-roadmap.md` — ordered workloads and the dependency graph.
- `tasks/NNN-*.md` — one self-contained, executable task per unit of work.

## How to pick up work

1. Read `01-roadmap.md`; take the next task in the current workload whose blockers are `done`.
2. Read that task file in full — it is self-contained.
3. Execute it under the repo's binding testing standards (`design-docs/specs/testing-standards.md`,
   especially R1: a bug-fix test must fail on the pre-fix code).
4. Update the task's **Status** field when you start and when you finish.

Status legend: `not-started | in-progress | blocked | done`.
