# Task 001 — Delete 5 dead CSS selectors

Status: complete — 2026-07-10

## Goal

Delete 5 confirmed-dead CSS selectors from `frontend/src/theme/components.css` before the file is
split (task 002), so the split doesn't move dead rules into a new home.

## Map links

- Map: `../01-map.md` Part 1, Invariant I2 ("pure move... except the 5 dead selectors are deleted
  before the split").
- Risk flag: `multi-file` (see `../02-roadmap.md`) — deletion must be verified against JSX usage
  repo-wide, not just the CSS file.

## Exact target

File: `frontend/src/theme/components.css` (4,440 lines as of 2026-07-10 — re-count with `wc -l`
before editing, in case another task landed first).

Delete these rule blocks (verified present at these approximate lines on 2026-07-10 — re-grep to
get exact current line numbers, since prior edits may have shifted them):

| Selector | Approx. lines (2026-07-10) |
|---|---|
| `.btn-home` | 96, 103, 109, 115 |
| `.btn-menu-destructive` | 152 |
| `.action-menu-item` | 156, 160, 165, 170 |
| `.select-glass` | 3182, 3192 |
| `.engine-chunk` | 3207, 3227, 3232, 3248 |

Use `grep -n "\.btn-home\|\.btn-menu-destructive\|\.action-menu-item\|\.select-glass\|\.engine-chunk" frontend/src/theme/components.css`
to find the exact current blocks, then delete each full rule block (selector through closing
`}`, including any adjacent pseudo-selectors like `:hover`/`:focus` for the same base class).

## Steps

- [x] `grep -n` the 5 selectors above to confirm current line numbers and full rule extents.
- [x] **Before deleting**, `grep -rn` each selector across `frontend/src` (not just the CSS file) —
      if any `.tsx`/`.ts` file references one of these classes in a `className`, **stop and report
      it** rather than silently deleting (that would be a real, if minor, existing bug — a
      component referencing a class with no styles — worth surfacing to the user, not fixing here).
- [x] Delete the 5 rule blocks from `components.css`.
- [x] Run `npm -C frontend run build` — confirm it still succeeds.

## Acceptance criteria

- [x] All 5 selectors and their rule blocks are gone from `components.css`.
- [x] `grep -rn "btn-home\|btn-menu-destructive\|action-menu-item\|select-glass\|engine-chunk" frontend/src`
      returns 0 hits anywhere in the repo (or you've reported a genuine JSX reference to the user
      instead of silently deleting). No `.tsx`/`.ts` file referenced any of the 5 classes in
      `className`; only remaining non-JSX hits are an unrelated duplicate `.action-menu-item:focus-visible`
      rule in `theme/utilities.css` and a code comment in `theme/tokens.css` — both out of scope
      (not `components.css`), left untouched.
- [x] `npm -C frontend run build` succeeds.
- [x] One commit, message describing the dead-selector removal.

## Dependencies

- Blocks: `002-st1-split-components-css.md` (must run first so line numbers in that task's grep
  anchors are accurate).
- Blocked by: none.

## Out of scope

- Don't touch any other selector in this file — only these 5.
- Don't start the domain split in this task; that's 002.
