# Task 008 — Chapter Workspace: add status orb to the chapter-switcher dropdown

Status: pending

Risk: none

## Goal

Add the existing `StatusOrb` component to each row of `ChapterDropdown` (the "Contents ▾" switcher
inside the Chapter Workspace), so a user can see chapter render status at a glance while switching
chapters — matching the North Star framing's "mini chapter list with status indicators."

## Why this matters

The live `ChapterDropdown` (`ChapterWorkspaceHeader.tsx:110-147`) lists every chapter with an index
number and title (`:138-141`) but no status indicator. The historically-informative demo file
`studio.tsx`'s equivalent (`ContentsDropdown`, `studio.tsx:947-948`) uses a `StatusOrb` per chapter.
This is a small, concrete, low-risk gap — everything else about this dropdown (navigation,
active-item highlighting, prev/next, jump-to-next-unrendered) already works correctly and is not
part of this task.

## Exact file

- `frontend/src/pages/Book/components/ChapterWorkspaceHeader.tsx`

## Current shape (verified)

`ChapterDropdown` component: `ChapterWorkspaceHeader.tsx:110-147`. Each row renders an index number
(`:138-140`) and title, with `aria-current` on the active chapter (`:136`). No `StatusOrb` or any
status indicator per row.

## Target shape

Each row in `ChapterDropdown` also renders the chapter's `StatusOrb` (the same component already
used in `ChapterTable.tsx` — reuse it directly, do not build a second status indicator per INV-3).
The row needs access to each chapter's status/render-progress data — check what shape of chapter
data is already available to `ChapterWorkspaceHeader` (it must already have the chapter list to
render titles; confirm whether status/progress fields are already present on that data or need to
be included in whatever fetch populates it).

## Steps

1. Read `ChapterWorkspaceHeader.tsx` fully, focusing on where the chapter list data passed into
   `ChapterDropdown` comes from (a prop, a hook, context) and what fields it currently carries.
2. Check `ChapterTable.tsx`'s usage of `StatusOrb` to see its exact prop contract (what status/
   progress shape it expects).
3. If the chapter data already flowing into `ChapterWorkspaceHeader` has the fields `StatusOrb`
   needs, just add `<StatusOrb .../>` to each `ChapterDropdown` row. If not, find where that data is
   fetched (likely the same source `ChapterTable`/`ContentsStage` already uses) and thread the
   needed fields through — do not add a second, separate fetch for the same data if an existing one
   is already in scope.
4. Verify the dropdown's layout still fits its existing width/styling with the added orb (small
   visual check, not a full designer pass).

## Acceptance criteria

- [ ] Every chapter row in `ChapterDropdown` shows its `StatusOrb`, matching the same visual
      language used in `ChapterTable.tsx` and elsewhere (INV-3).
- [ ] No second/duplicate data fetch introduced — reuses whatever chapter data source is already in
      scope wherever possible.
- [ ] `npm -C frontend run test -- --run`, lint, build clean.
- [ ] Light and dark mode both verified (INV-2).

## Map links

Part: "Chapter Workspace" in `01-map.md`. Connection: `StatusOrb` (INV-3 — the only status
indicator).

## Dependencies

None.

## Out of scope

Do not touch bookmarks, the lexicon panel, or the Write/Cast/Booth/Revise mode tools — this task is
scoped strictly to the chapter-switcher dropdown's per-row status indicator.
