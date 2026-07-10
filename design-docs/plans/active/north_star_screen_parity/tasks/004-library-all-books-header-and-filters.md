# Task 004 — Library: add "All Books" section header + quick-filter chips + cover-size slider

Status: pending

Risk: multi-file

## Goal

Add the demo's "All Books" eyebrow-labeled section header with quick-filter chips (Recent / A–Z /
In Progress) and a Finder-style cover-size slider (grid view only), above the existing grid/list
toggle and sort dropdown.

## Why this matters

Demo: `library.tsx:366-472` — an "All Books" section label, three quick-filter chips, and a
cover-size slider sit above the book grid, alongside the existing grid/list toggle. Live only has
`LibraryControls` (`ProjectLibraryPage.tsx:227-232`) — a grid/list toggle plus a single sort
`<select>` with different options (`LibraryControls.tsx:88-94`: Recently Updated / Newest First /
Series A-Z / Title A-Z / Title Z-A). No section header, no quick-filter chips, no cover-size
control exist today.

## Exact files

- `frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx`
- `frontend/src/pages/ProjectLibrary/components/LibraryControls.tsx`

## Current shape (verified)

`LibraryControls.tsx:88-94` sort options: Recently Updated, Newest First, Series A-Z, Title A-Z,
Title Z-A. `ProjectLibraryPage.tsx:227-232` renders `LibraryControls` directly under the page
header, no section label above the grid.

## Target shape (matches `library.tsx:366-472`)

- An "All Books" eyebrow/section label above the controls row (or above the grid, depending on
  final visual read — follow the demo's exact placement relative to the grid/list toggle).
- Quick-filter chips: **Recent**, **A–Z**, **In Progress**. "Recent" and "A–Z" can map directly onto
  existing sort options already in `LibraryControls.tsx` (Recently Updated ≈ Recent; Title A-Z ≈
  A–Z) — check whether the demo's chips are meant to *replace* the sort dropdown or sit alongside it
  as quick shortcuts to the same sort options (read `library.tsx:366-472` closely for the exact
  interaction model before deciding). **"In Progress" requires knowing which projects are
  in-progress — this depends on task 005's status-derivation research; if task 005 hasn't
  landed yet, stub this chip as present-but-disabled with a code comment pointing at task 005,
  rather than inventing a separate progress signal.**
- Cover-size slider: grid view only, following whatever slider/range-input pattern already exists
  elsewhere in the codebase (grep before inventing a new one).

## Steps

1. Read `library.tsx:366-472` fully to understand exact chip/slider layout and behavior.
2. Read `LibraryControls.tsx` fully to see what's reusable vs. what needs adding.
3. Add the "All Books" section label.
4. Add quick-filter chips, wiring "Recent"/"A–Z" to existing sort logic; wire or stub "In Progress"
   per the note above.
5. Add the cover-size slider, grid-view-only, persisting the chosen size (check whether other
   view-preference toggles in this codebase persist to localStorage/user settings — match that
   pattern rather than inventing a new persistence mechanism).
6. Verify responsive behavior at the breakpoints this repo already checks (1280/768/420 per
   `master_agnostic_tasks.md`'s device-sweep convention) — don't let the new controls row overflow
   or wrap awkwardly on narrow viewports.

## Acceptance criteria

- [ ] "All Books" label present above (or per final read: alongside) the controls.
- [ ] Recent/A–Z chips filter/sort correctly using existing sort logic (no duplicate sort
      implementation).
- [ ] "In Progress" chip either works (if task 005 already landed) or is visibly disabled with a
      code comment, not silently broken.
- [ ] Cover-size slider works in grid view, has no effect in list view (or is hidden in list view —
      match demo behavior exactly), and its chosen size persists across a page reload.
- [ ] Responsive check at 1280/768/420 — no overflow.
- [ ] `npm -C frontend run test -- --run`, lint, and build all clean.

## Map links

Part: "Library (home)" in `01-map.md`'s Parts table.

## Dependencies

Soft dependency on task 005 for the "In Progress" chip's data source — do not block the rest of
this task on it; stub per the note above if 005 hasn't landed.

## Out of scope

Do not implement the Status column (task 005) or Continue section (task 006) here — this task is
scoped to the header/filter/slider row only.
