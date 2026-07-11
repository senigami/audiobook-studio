# North Star Screen Parity

**What this is:** a plan to reconcile the live app's layout/IA against the "North Star" reference
demo (`frontend/src/demo/stages/siteMockup/`) — the owner noticed the Home screen, the Library
page, and the Book/chapter-list area don't match the demo, and asked for a systematic comparison
and a plan to close the gaps.

**This plan does NOT execute anything.** It was produced by `/plan-architect` in research-only
mode while a separate agent executes unrelated work elsewhere. Run `/plan-run` pointed at this
folder to execute it.

## Where this fits in the repo's planning picture

This is **not** a from-scratch redesign — a large prior effort
(`design-docs/plans/reference/site_redesign_rollout/`, phases R1–R7) already converted most of the
app's IA to match an earlier version of the demo, and a validation log
(`reference/site_redesign_rollout/99_progress_log.md`) confirmed most areas still matched as of
2026-06-14. This plan's research (see `01-map.md`) found that log is now a month stale in a few
places — the chapter workspace was substantially rebuilt since (Director's Console, 2026-07-10),
the Engines page grew a tab the demo doesn't have, and the demo itself grew features (bookmarks,
lexicon, AI-casting-suggestion panel) that were partially — not fully — ported into the demo's
*own* wired tabs. Read `01-map.md` before touching any task; it explains which of the two
plausible "reference" files is actually current for each area, because in one case
(`studio.tsx` vs `directorsConsole.tsx`) they disagree and only one is live.

## How to read this folder

| File | Purpose |
|---|---|
| `00-overview.md` | The task, scope, success criteria, and the explicit **decisions the owner needs to make** before some tasks can execute |
| `01-map.md` | The parts (screens), the connections (shared components/data), invariants, and the source-of-truth resolution for each disputed area |
| `02-roadmap.md` | Ordered workloads + dependency graph |
| `tasks/NNN-slug.md` | One self-contained, map-linked task per unit of work |

## Status protocol

Whoever executes a task updates its `Status:` line and ticks its `- [ ]` checkboxes in the same
change as the work. A checklist that doesn't match reality poisons every later session that reads
it — this plan was born from exactly that failure mode (a phantom, already-superseded entry sat in
`TASKS.md` for weeks; see `tasks/001-fix-tasks-md-doc-drift.md`). Don't repeat it here.

When every task is complete, move this whole folder to
`design-docs/plans/_archive/north_star_screen_parity/` and update `design-docs/plans/TASKS.md`
with a summary entry (this plan's own Task 001 is precisely about keeping that file honest — treat
it as a live example, not just a one-off fix).

## Decision-gated tasks

Several tasks in this plan cannot execute until the owner picks between two real options (see
`00-overview.md` §"Decisions needed"). Those task files start with a **DECISION** step that
produces a recorded answer; the implementation steps that follow are written for *both* possible
answers so the executor doesn't stall — but the decision must be captured in writing (append to
that task's file) before code changes land.
