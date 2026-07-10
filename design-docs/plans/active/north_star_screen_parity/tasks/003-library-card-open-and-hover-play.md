# Task 003 — Library grid card: restore "Open" action + hover-play affordance

Status: pending

Risk: multi-file

## Goal

Restore an explicit "Open" item to the project grid card's action menu (currently Delete-only), and
add a hover-reveal play button on the cover thumbnail, matching the demo.

## Why this matters

Demo grid cards have a persistent `⋯` menu with Open + Delete (`library.tsx:496-516`,
`BookActionMenu` at `library.tsx:181-210`) plus a hover-reveal ▶ on the cover
(`library.tsx:517-525`). Live's `ProjectCard.tsx` calls the shared `ActionMenu` with only an
`onDelete` prop (`ProjectCard.tsx:139-158`), which per `ActionMenu.tsx:39-41` falls back to a
legacy single-item ("Delete Project" only) mode — there's no menu-driven way to open a project, and
no cover-hover play affordance at all. Instead live has a persistent "Details" button
(`ProjectCard.tsx:181-193`) the demo doesn't have.

## Exact files

- `frontend/src/pages/ProjectDetail/components/ProjectCard.tsx`
- Whichever file defines the shared `ActionMenu` component (grep for its export — used at
  `ProjectCard.tsx:139-158`)

## Current shape (verified)

- `ProjectCard.tsx:139-158` — `ActionMenu` called with only `onDelete`, no `items` prop → legacy
  single-item mode (`ActionMenu.tsx:39-41`).
- `ProjectCard.tsx:181-193` — persistent "Details" button at the card's bottom.
- No hover-reveal play control on the cover image anywhere in this file.

## Target shape (matches `library.tsx:181-210, 496-525`)

- `ActionMenu` called with an `items` array containing at least "Open" (navigates the same way
  clicking the card body already does — check the card's existing click handler for the route) and
  "Delete" (existing `onDelete` behavior, unchanged).
- A hover-reveal ▶ play-button overlay on the cover thumbnail. Since the live app doesn't have a
  meaningful "play the whole book" action at the library level the way a rendered-audio system
  might (check whether an assembled audiobook exists for a project before deciding what this button
  does) — if there's no direct live equivalent action, this button should navigate to the project's
  Publish tab (where playback of assembled audio lives) rather than being invented from nothing.
  Confirm this mapping makes sense by checking what "Continue Listening" does elsewhere in the demo
  (`library.tsx:296-364`) for consistency, since task 006 covers that section separately.

## Decision on "Details" button (recorded here, not a fork requiring owner input)

Keep the "Details" button — it's an intentional live enhancement the demo has no equivalent for
because the demo has no separate project-details route. Do not remove it to match the demo exactly;
INV-1 (capabilities never vanish) means adding "Open" to the menu should not come at the cost of
removing "Details". If the resulting card feels crowded (persistent Details button + hover-play +
overflow menu), that's a call for task 011's designer-agent visual pass, not a decision to make
blind here.

## Steps

1. Read `ProjectCard.tsx` fully to find the existing route/navigation the card body's click handler
   uses (for "Open" to reuse) and to find the `ActionMenu` import.
2. Read the `ActionMenu` component's prop types (`items` shape) to build a correct items array.
3. Add "Open" + "Delete" as `items` to the `ActionMenu` call, replacing the `onDelete`-only legacy
   call.
4. Add a hover-reveal play button overlay on the cover image, following whatever hover-overlay
   pattern already exists elsewhere in this codebase (check for a similar hover-reveal control on
   another card component before inventing a new CSS approach) — wire it to navigate to Publish per
   the mapping above.
5. Verify light AND dark mode rendering of the new hover overlay (INV-2).

## Acceptance criteria

- [ ] Grid card's overflow menu shows both "Open" and "Delete", each functioning correctly.
- [ ] Cover thumbnail shows a play button on hover only (not persistently visible), navigating to
      Publish.
- [ ] "Details" button is unchanged/still present (INV-1).
- [ ] `npm -C frontend run test -- --run` passes; add/update a render+interaction test for the new
      menu items and hover control per this repo's testing standards (R4 — no sleep-based timing;
      use `waitFor`/fake timers for any hover-state assertions).
- [ ] Light and dark mode both verified.

## Map links

Part: "Library (home)" in `01-map.md`'s Parts table. Connection: `ActionMenu` (see `01-map.md`
"Connections"). Invariant: INV-1, INV-3 (if any status indicator is touched incidentally — it
shouldn't be in this task).

## Dependencies

None on other tasks in this plan, but check the styling-separation lane's state on
`ProjectLibraryPage.tsx`/`ProjectCard.tsx` first (`01-map.md` "Coupling risk").

## Out of scope

Do not add the Status column/pill (task 005) or the "All Books" header/filters (task 004) in this
task — keep the diff to the card's action menu and hover-play only.
