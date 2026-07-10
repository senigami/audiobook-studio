# Task 007 — Library: remove unreachable duplicate empty-state branch

Status: pending

Risk: none

## Goal

Remove a genuinely unreachable code branch found during this plan's research: a second
`projects.length === 0` check in `ProjectLibraryPage.tsx` that can never execute because the
component already returns early for the empty-library case earlier in the render.

## Why this matters

Not a visual-parity issue — this was found incidentally while researching the Library page for
tasks 003–006 and is flagged separately per this project's convention (flag adjacent findings,
don't silently bundle them into an unrelated task). Dead code left in place is exactly the kind of
thing that confuses the next person who touches this file.

## Exact file

- `frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx`

## Current shape (verified)

- `ProjectLibraryPage.tsx:76-91` — an early return renders the empty-library state
  ("No projects yet" / "Create a project to start turning text into audio.") when
  `projects.length === 0`.
- `ProjectLibraryPage.tsx:219-224` — a SECOND `projects.length === 0` branch rendering a "No
  projects found" empty state. Since the function already returned at line ~91 for this exact
  condition, this second branch can never be reached with the current logic — it's most likely a
  leftover from a since-removed search/filter feature that would have filtered `projects` into a
  different array before this check (the check should probably be against a *filtered* list, not
  the raw `projects` array, if a filter feature is ever re-added).

## Steps

1. Read `ProjectLibraryPage.tsx:1-230` fully to independently confirm the branch at lines 219-224 is
   truly unreachable given the current control flow (don't trust this task file's line numbers
   blindly — re-verify against current file state, since other tasks in this plan may have already
   shifted lines).
2. If confirmed unreachable: delete the dead branch entirely. Do not leave a comment like "// removed
   dead code" — just remove it (per this repo's convention against explaining removals in comments).
3. If it turns out NOT to be unreachable (e.g. a filter step was added between research and
   execution that makes it reachable again), leave it alone and note that in this file instead of
   deleting live code.

## Acceptance criteria

- [ ] Confirmed unreachable before deleting (or confirmed still-reachable and left alone).
- [ ] If deleted: no behavior change for any real user path (this is provably true if it was
      genuinely unreachable).
- [ ] `npm -C frontend run test -- --run`, lint, build clean.

## Map links

Part: "Library (home)".

## Dependencies

None.

## Out of scope

Do not investigate whether a search/filter feature should be re-added — that's a product decision
outside this plan's scope, not a parity issue.
