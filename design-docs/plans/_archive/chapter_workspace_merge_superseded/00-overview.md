# Overview

## The task

Merge the Chapter Workspace's Studio/Review toggle into one unified workspace (accepted design decision, never built), remove the resulting duplicate chapter switcher, and add a "full text edit" mode to the workspace by reusing the app's own already-working `ChapterTextPanel` pattern (currently only reachable from Contents) rather than building something new.

## Scope

**In scope:**
- `frontend/src/pages/Book/BookLayout.tsx` — remove the `WorkspaceView = 'studio' | 'review'` toggle (lines ~113, 246-263, 303); the Chapter Workspace renders one thing.
- `frontend/src/pages/Book/stages/ReviewStage.tsx` — remove the `review-chapter-rail` duplicate chapter picker (lines ~142-175); its remaining content (`FollowAlongPanel`, `AnnotationsPanel`) gets folded into the merged workspace as a **docked panel**, reusing the exact `WorkspacePanel` pattern `BookLayout.tsx` already established for Lexicon (`BookLayout.tsx:131-197` — "the first of the dockable workspace panels pattern... follow the same shape to add more panels").
- `frontend/src/pages/Book/stages/StudioStage.tsx` — add a full-text-edit mode, reusing `frontend/src/pages/Book/components/ChapterTextPanel.tsx` + `frontend/src/pages/Book/lib/useChapterText.ts` exactly as they already work in Contents (continuous textarea, produced-chapter lock, "editing re-analyzes" warning banner) — do not rebuild this pattern, port it.
- CSS cleanup for the removed rail (`.review-chapter-rail*` in `frontend/src/theme/components.css`) and any dead `.book-stage-review` layout rules that assumed a rail existed.

**Out of scope (see README.md's "flagged for the owner" list — do not touch in this plan):** `ManuscriptStage.tsx` (orphaned, flag for deletion separately), the legacy `ChapterEditorPage`/`EditTab.tsx` surface reachable via `/project/:projectId/details`, RST-8, annotations backend persistence, the dead `togglePlayPause`/`seekBy` exports, a docked Cast panel.

**Important — do not confuse two different things named similarly:** `StudioStage.tsx` already has a `viewMode: 'book' | 'script'` state (`StudioStage.tsx:34`) — this is a **display-density toggle within the existing non-editable `ScriptView`** (segment spans styled as flowing prose vs. a denser technical view), not a text-editing mode. Neither `viewMode` value lets you type. The new full-text-edit mode this plan adds is a third, separate thing: an actual editable textarea (via `ChapterTextPanel`), toggled independently of `viewMode`.

## Success criteria

1. Clicking into a chapter from Contents shows one Chapter Workspace with no Studio/Review toggle — the per-segment casting view (today's `StudioStage`/`ScriptView`) and the follow-along/annotations content are both reachable from the same screen.
2. Only one chapter switcher exists in the workspace — `ChapterWorkspaceHeader`'s (prev/next/jump-to-next-unrendered/bookmarks/Contents-dropdown). The `review-chapter-rail` is gone.
3. The merged workspace has a working "edit full text" mode using the existing `ChapterTextPanel`/`useChapterText` pattern — clicking it shows the continuous textarea (or the produced-chapter lock + warning banner if the chapter is Cast/Rendered/Stale/Error, exactly as Contents already does), and saved edits round-trip identically to how they already do in Contents (same hook, same API calls — this plan does not touch the save mechanism, only where it's surfaced).
4. Follow-along playback and annotations are still reachable in the merged workspace (as a docked panel, not lost).
5. `npm -C frontend run build`, `npx tsc -b --force`, full frontend test suite, and `./venv/bin/python -m pytest -q` all pass. No behavior regression to Contents' own use of `ChapterTextPanel` (it's being reused, not moved — Contents keeps working exactly as it does today).
