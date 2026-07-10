# Chapter Workspace Merge — Studio/Review Unification + Full-Text Edit

Implements a design decision that was accepted (`design-docs/plans/active/book_view_ia_proposal.md:373,387`) but never actually built: merging the Chapter Workspace's separate Studio/Review toggle into one unified workspace, removing a duplicate chapter switcher, and bringing the app's own already-working "consolidated full text edit" pattern (currently only reachable from the Contents tab) into the workspace clicking into a chapter actually opens.

## Why this plan exists

A parallel survey of the Contents/Cast/Lexicon/chapter-workspace tabs (run this session) found the Chapter Workspace is the one surface where the accepted design and the shipped code have diverged the most:

- `frontend/src/pages/Book/BookLayout.tsx:113` still has a hard `'studio' | 'review'` toggle the design doc says to remove.
- `frontend/src/pages/Book/stages/ReviewStage.tsx:142-175` renders its own full vertical chapter-picker (`review-chapter-rail`) — a second, competing chapter switcher, when `ChapterWorkspaceHeader` (rendered once, above both Studio and Review) already provides prev/next/jump-to-next-unrendered/bookmarks navigation. The design doc is explicit: *"`Contents ▾` dropdown … in the header. No permanent rail."*
- The "consolidated full text edit" the owner wants is not missing — it already exists, works, and is tested: `frontend/src/pages/Book/components/ChapterTextPanel.tsx` (a continuous textarea over the whole chapter, gated behind a "this chapter is already produced" lock + warning banner) is live today in the **Contents** tab. But `StudioStage`/`ScriptView` — the surface you actually land on when you click into a chapter — has **no raw-text editing at all**, only per-segment character-assignment clicks. The pattern that should live in the merged workspace already exists; it's just in the wrong place.

## Scope

**In scope:** `frontend/src/pages/Book/BookLayout.tsx` (remove the toggle), `frontend/src/pages/Book/stages/ReviewStage.tsx` (remove the duplicate rail), `frontend/src/pages/Book/stages/StudioStage.tsx` (gains a full-text-edit mode alongside the segment view, reusing `ChapterTextPanel`/`useChapterText` as-is), plus whatever CSS cleanup follows from removing the rail.

**Out of scope (flagged for the owner, not fixed here):**
- `frontend/src/pages/Book/stages/ManuscriptStage.tsx` — confirmed **zero importers anywhere in `frontend/src/`** (fully orphaned). Candidate for deletion per this repo's Studio 2.0 clean-break policy, but flagged rather than deleted unilaterally since it wasn't this plan's original target.
- `frontend/src/pages/ChapterEditor/` (`ChapterEditorPage.tsx`/`EditTab.tsx`) — a second, separate implementation of the same "full chapter textarea + produced-lock warning" pattern, reachable only via the legacy `/project/:projectId/details` route (`frontend/src/app/App.tsx:295`), which was deliberately re-wired in a recent commit. Not touched — whether this legacy view should be retired, kept as a fallback, or reconciled with the new merged workspace is a product decision, not assumed here.
- RST-8 (segment-aware player, deferred by owner per `design-docs/plans/TASKS.md:317`), annotations being `localStorage`-only (no backend persistence), the dead `togglePlayPause`/`seekBy` exports in `useReviewPlayback.ts`, and no docked Cast panel in the merged workspace — all real findings from the same survey, all bigger/separate efforts, listed here so they aren't lost, not actioned in this plan.

## How to read this folder

| File | Purpose |
|------|---------|
| `00-overview.md` | Task, scope, success criteria |
| `01-map.md` | Parts, connections, the two patterns being merged, invariants |
| `02-roadmap.md` | Ordered tasks, dependency graph |
| `tasks/NNN-*.md` | Self-contained task files |

## Status protocol

Each task file starts with a `Status:` line and `- [ ]` checkboxes, updated in the same change as the work.

## Archive convention

When all tasks are complete, move this folder to `design-docs/plans/_archive/chapter_workspace_merge/` and update `design-docs/plans/TASKS.md`.
