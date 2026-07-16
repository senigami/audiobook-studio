# Task 012 — Update demo mock: Engines Module-Settings tab, orphaned ManuscriptPane, studio.tsx note

Status: done (2026-07-11)

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
`siteMockupStage.tsx`.

**Task 010's decision (recorded 2026-07-10): Option B** — live's Contents tab is being simplified
to match the demo's slim board, not the other way around. So `ManuscriptPane` is now
confirmed-obsolete: **delete the export entirely** once task 010 has actually executed (do not
delete it first — if task 010's Step 2b precondition check finds a capability that would be lost by
simplifying live, task 010 may get re-escalated to the owner, and this deletion would need to be
reverted). Sequence this after task 010's real-world outcome, not just its recorded decision.

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

- [x] Part A done or explicitly deferred with a reason.
- [x] Part B done per task 010's actual decision, or explicitly deferred if 010 is still pending.
- [x] Part C: comment added to `studio.tsx`.
- [x] `npm -C frontend run build` (the app build, not `build:demo`) stays clean — demo files are
      still part of the frontend TypeScript project even though they're not shipped in the main
      bundle.
- [x] `build:demo` is NOT run as part of this task unless explicitly requested — per this project's
      standing convention that demo builds are decoupled from regular work.

## Map links

Part: "Engines/Voices/Activity/Settings" and "Book-level tabs" in `01-map.md`.

## Dependencies

Part B depends on task 010's decision.

## Out of scope

Do not touch any live-app file in this task — it is demo-only by definition.

## Execution record (2026-07-11)

Confirmed task 010's decision status before starting: task 010's file records Gate 1 (Option B
executed, live's Contents tab simplified to a pure chapter board) and Gate 2 (bookmark panels)
both landed 2026-07-11 — so Part B was unblocked.

- **Part A** — done. `EnginesPane` in `frontend/src/demo/stages/siteMockup/panes/platform.tsx` now
  has a `role="tablist"` with "Engines"/"Module Settings" tabs matching live's `EnginesPage.tsx`
  (commit `2ec47472`) structure and labels. Chose the "add a real (if lighter) tab structure" branch
  rather than a comment-only note, per this task's "err toward keeping the mock honest" guidance —
  but the "Module Settings" tab content is intentionally a lighter representative view (sanitize
  toggles + a pointer to each engine's inline settings) rather than a full port of live's
  `JsonSchemaForm`-per-engine dynamic rendering; documented as such in a comment above `EnginesPane`.
- **Part B** — done. Deleted the orphaned `ManuscriptPane` export from `panes/book.tsx`, along with
  its only-consumer `AddChapterModal` helper and the ManuscriptPane-only lifecycle
  types/constants/component (`ChapterLifecycle`, `MANUSCRIPT_CHAPTERS`, `LIFECYCLE_VARIANT`,
  `LIFECYCLE_ORB`, `LifecyclePill`) and now-unused lucide imports (`Upload`, `Lock`,
  `MoreHorizontal`). Left a pointer comment to this decision record in the deleted block's place.
- **Part C** — done. Added a top-of-file comment to `panes/studio.tsx` noting it's superseded by
  `directorsConsole.tsx` for mode structure (confirmed not mounted — only its
  `STUDIO_FOLLOW_DURATION_SEC` constant is re-exported/used elsewhere), while its bookmark/lexicon/
  contents-dropdown designs were separately ported to live via `ChapterWorkspaceHeader.tsx`/
  `BookLayout.tsx`.

Verification: `npm -C frontend run build` clean; `npm -C frontend run lint` clean for touched files
(39 pre-existing warnings elsewhere in the repo, 0 new, 0 errors). `build:demo` intentionally not
run, per repo convention. Code-map changelog-queue entry appended:
`docs/code-map/queue/2026-07-11-task012-demo-side-cleanup.json`.
