# Task 012 — Update demo mock: Engines Module-Settings tab, orphaned ManuscriptPane, studio.tsx note

Status: pending

Risk: none (demo-only files, zero live-app risk)

## Goal

Bring the North Star demo mock itself back in sync with settled live-app decisions, in three small,
independent ways found during this plan's research. This is lower priority than every other task —
it doesn't fix anything a real user sees, but leaving the demo stale is exactly what caused some of
the confusion this plan exists to resolve (per `01-map.md`'s two-demo-files problem).

## Part A — Engines page gained a tab the demo doesn't show

Live `EnginesPage.tsx:56-89` now has a `role="tablist"` with "Engines" and "Module Settings" tabs
(added by commit `2ec47472`, after the last time this area was compared to the mock). The demo's
`panes/platform.tsx` `EnginesPane` still renders a single flowing page with no tab switcher.

Add a matching two-tab structure to `EnginesPane` in `panes/platform.tsx`, or at minimum a visual
note/comment in the file that this is intentionally behind live — check which is more useful before
doing a full mock rebuild (per `00_execution_contract.md`, mock updates are lower-stakes than live
changes, so err toward keeping the mock honest rather than skipping it).

## Part B — Orphaned `ManuscriptPane` in `panes/book.tsx`

`ManuscriptPane` (`panes/book.tsx:610-1196`) is exported but never imported anywhere in
`siteMockupStage.tsx`. Per task 010's decision (this task depends on that decision being recorded
first):

- If task 010 chose **Option A** (demo needs updating to match live's Contents tab): wire
  `ManuscriptPane` (or a merge of it with `ContentsPane`'s render-percent board view) into
  `siteMockupStage.tsx` in place of the current `ContentsPane` import, so the demo's wired Contents
  tab actually matches what live does.
- If task 010 chose **Option B** (live should be simplified to match demo's slim board): delete the
  now-confirmed-obsolete `ManuscriptPane` export entirely — it no longer represents any intended
  direction.
- If task 010 is still undecided when this task executes: skip Part B, leave a note here, and
  revisit once 010 resolves.

## Part C — Note `studio.tsx`'s superseded status more clearly

`panes/studio.tsx` is the historically-informative-but-not-current file described in `01-map.md`'s
Source-of-truth resolution. It's not wired into `siteMockupStage.tsx` (confirmed during research —
`directorsConsole.tsx` is what's actually mounted for the chapter-workspace equivalent), but nothing
in the file itself flags that it's superseded, which is exactly the kind of ambiguity that caused
this plan's research to need an explicit two-file comparison in the first place. Add a top-of-file
comment to `studio.tsx` noting it's superseded by `directorsConsole.tsx` for mode structure, but
that its bookmark/lexicon/contents-dropdown designs (task 012/013 markers in its own comments) were
separately ported to the live app via `ChapterWorkspaceHeader.tsx`/`BookLayout.tsx` — so a future
reader doesn't have to re-derive this plan's research from scratch.

## Steps

1. Confirm task 010's decision status before starting Part B.
2. Execute Parts A, B (if unblocked), and C independently — each is a standalone, low-risk demo-only
   edit.
3. Rebuild the static demo output (`npm run build:demo` per this repo's convention) only if this
   plan's other work is also ready to ship together — per project memory, demo builds are kept
   separate from the main launch path and shouldn't be triggered speculatively mid-plan.

## Acceptance criteria

- [ ] Part A done or explicitly deferred with a reason.
- [ ] Part B done per task 010's actual decision, or explicitly deferred if 010 is still pending.
- [ ] Part C: comment added to `studio.tsx`.
- [ ] `npm -C frontend run build` (the app build, not `build:demo`) stays clean — demo files are
      still part of the frontend TypeScript project even though they're not shipped in the main
      bundle.
- [ ] `build:demo` is NOT run as part of this task unless explicitly requested — per this project's
      standing convention that demo builds are decoupled from regular work.

## Map links

Part: "Engines/Voices/Activity/Settings" and "Book-level tabs" in `01-map.md`.

## Dependencies

Part B depends on task 010's decision.

## Out of scope

Do not touch any live-app file in this task — it is demo-only by definition.
