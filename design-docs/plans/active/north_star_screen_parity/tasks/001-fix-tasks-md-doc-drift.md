# Task 001 — Fix TASKS.md doc drift (phantom chapter_workspace_merge entry)

Status: pending

Risk: none

## Goal

Remove the misleading "Chapter Workspace Merge — PLANNED, not yet executed" section from
`design-docs/plans/TASKS.md` (lines 75–82) and replace it with an accurate pointer to the plan that
actually superseded it and shipped.

## Why this matters

`TASKS.md` is this repo's single status source (per its own header and `CLAUDE.md`). This section
currently links to `active/chapter_workspace_merge/02-roadmap.md` and four task files under
`active/chapter_workspace_merge/tasks/` — **none of which exist on disk**. The work it describes
was superseded, before ever being dispatched, by `_archive/directors_console_activation/`, which
completed and was archived on 2026-07-10. Anyone reading `TASKS.md` today (including a future
planning session) is told real, useful work is "planned, not yet executed" when it's actually
already done under a different name. This exact kind of drift is part of why the owner is seeing
confusing gaps — the docs don't reliably reflect current reality.

## Exact file and content

File: `design-docs/plans/TASKS.md`

Current content (lines 75–82, verified via direct read):

```markdown
### Chapter Workspace Merge — PLANNED, not yet executed

Merges the Chapter Workspace's Studio/Review toggle (never actually unified per the accepted design doc) into one workspace with a Cast/Follow Along/Edit Text mode switcher, removes a duplicate chapter-picker rail in ReviewStage, and ports the app's own already-working full-text-edit pattern (`ChapterTextPanel`, live today only in Contents) into the workspace you actually land in when opening a chapter. See [plan](active/chapter_workspace_merge/02-roadmap.md) — 4 tasks, not yet dispatched.

- [ ] **L-WORKSPACE 001** — Cast/Follow Along/Edit Text mode switcher shell — [plan](active/chapter_workspace_merge/tasks/001-mode-switcher-shell.md)
- [ ] **L-WORKSPACE 002** — Remove duplicate chapter rail, dock Annotations — [plan](active/chapter_workspace_merge/tasks/002-remove-rail-dock-annotations.md)
- [ ] **L-WORKSPACE 003** — Edit Text mode via ChapterTextPanel — [plan](active/chapter_workspace_merge/tasks/003-edit-text-mode.md)
- [ ] **L-WORKSPACE 004** — Cleanup + full green gate — [plan](active/chapter_workspace_merge/tasks/004-cleanup-and-green-gate.md)
```

Replace with:

```markdown
### Chapter Workspace Merge — DONE 2026-07-10 (via Director's Console Activation, superseded before dispatch)

The mode-switcher merge this section originally planned was superseded, before any of its 4 tasks
were dispatched, by a broader effort that discovered `DirectorsConsole/` (a more complete
Cast/Booth/Revise/Write scaffold) already existed, shipped dark 2026-07-03. See
[`_archive/chapter_workspace_merge_superseded/SUPERSEDED.md`](_archive/chapter_workspace_merge_superseded/SUPERSEDED.md)
for the supersession note, and [`_archive/directors_console_activation/README.md`](_archive/directors_console_activation/README.md)
for the plan that actually shipped this capability.
```

## Steps

1. Read `design-docs/plans/TASKS.md` lines 70–85 fresh (line numbers may have shifted since this
   task was written) to confirm the section is still present and unchanged.
2. Replace the block exactly as shown above — do not touch anything else in the file.
3. Grep `design-docs/plans/TASKS.md` for any OTHER reference to `chapter_workspace_merge` (not
   `_superseded`) to confirm no other stale link to the phantom folder remains elsewhere in the
   file.

## Acceptance criteria

- [ ] The phantom `active/chapter_workspace_merge/` links are gone from `TASKS.md`.
- [ ] The replacement text correctly links to both archived folders and is accurate (verify both
      target files actually exist before committing).
- [ ] No other part of `TASKS.md` was modified.
- [ ] `grep -n "chapter_workspace_merge/" design-docs/plans/TASKS.md` returns only lines referencing
      `_superseded` (not the phantom `active/` path).

## Map links

Part: "TASKS.md" in `01-map.md`'s Parts table. No shared components — pure documentation.

## Dependencies

None. Do this first — it's fast and unblocks nothing else, but there's no reason to delay it.

## Out of scope

Do not audit the rest of `TASKS.md` for other drift in this task — a broader scan was already run
during this plan's research and found no other broken links (see `01-map.md`). If a future session
suspects new drift, that's a separate, standalone check, not part of this plan.
