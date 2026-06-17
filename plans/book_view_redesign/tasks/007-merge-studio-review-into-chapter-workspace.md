# 007 — Merge Studio + Review into one Chapter Workspace

- **Status:** not-started
- **Workload:** Mock: single Chapter Workspace
- **Severity / type:** major · organization
- **Effort:** L
- **Blocked by:** 005
- **Blocks:** 008, 009, 013

## Goal
Replace the separate Studio and Review surfaces with **one** Chapter Workspace (proposal §6.2). The single highlighted-prose surface does triple duty — reading position, render progress, and playback — reusing the follow-scroll already built (`useChapterFollow`). Remove `ReviewPane` as a separate destination; fold any genuinely-wanted Review pieces (e.g. annotations) into the workspace, or drop them.

## Why this matters
The highlighted-prose surface does reading + render-progress + playback with one mechanism, which is exactly why a separate Review tab is redundant (§6.2). Merging them restores the self-contained chapter (§1 pain 3) and gives cast, switcher, bookmarks, and pronunciation a single home — which is why this task blocks 008, 009, and 013.

## Do not rebuild the follow-scroll
The player-piano follow-scroll is already implemented in `shared.tsx` (`useChapterFollow`, `buildSegmentTimeline`, `ResumeFollowingPill`, `SPEAKER_TOKEN`, `FOLLOW_DURATION_SEC`) and is consumed by both `StudioPane` and `ReviewPane`. **Reuse it as-is** — this task consolidates the two consumers into one, it does not re-implement scroll/highlight logic.

## Context an executor needs
- Spec: `plans/book_view_ia_proposal.md` §6.2 (the one unified Chapter Workspace; triple-duty highlight; no Review), §6.3 (chapter-level = the one Workspace, no sub-tabs), §6.5 step 1 ("Merge Studio + Review into one Chapter Workspace — drop the Review tab; reuse the follow-scroll already built").
- Roadmap: `plans/book_view_redesign/01-roadmap.md` — Workload 3; `005 ──► 007`; `007 ──► 008,009,013`.
- `StudioPane`: `frontend/src/demo/stages/siteMockup/panes/studio.tsx:491-...` — takes `activeTrack`/`setActiveTrack`; uses `useChapterFollow({ activeTrack, matchTrackName: 'Chapter 4', timeline })` at `:512-513`; renders the render-progress `StatusOrb` at `:1238`. Exports `STUDIO_FOLLOW_DURATION_SEC` (`:489`).
- `ReviewPane`: `frontend/src/demo/stages/siteMockup/panes/book.tsx:894-...` — same `useChapterFollow` shape, `matchTrackName: 'Chapter 7'` (`:899-900`). The follow-scroll usage is near-identical to Studio's — that duplication is the thing being collapsed.
- Follow-scroll API in `shared.tsx`: `useChapterFollow` returns `{ scrollRef, activeChunkId, followEngaged, isFollowing, resume }`; `ResumeFollowingPill`; `SPEAKER_TOKEN` color map (`shared.tsx:989-994`); `buildSegmentTimeline` (`shared.tsx:1021-...`).
- The 005 workspace placeholder + `openChapter`/`onOpenChapter`/`onCloseChapter` routing in `siteMockupStage.tsx` `BookPane` — replace the placeholder with the real workspace here.
- `activeTrack`/`setActiveTrack` threading: root → `BookPane` (`siteMockupStage.tsx:871-872`) → previously into Studio/Review. Route it into the workspace instead. **Preserve this threading.**
- ⚠️ **Coordination:** this task edits `siteMockupStage.tsx` (drop the Review route in `BookPane`, render the workspace in the placeholder slot). The concurrent player-bar / minimap worker also edits `siteMockupStage.tsx` (player block ~790-861, and `MockTapeControls.tsx`). **Confirm the `BookPane` region is free before editing** and stay out of the player block. Most code changes are in `panes/studio.tsx` and `panes/book.tsx`.

## Target shape / contract
- **One Chapter Workspace component** (let `StudioPane` become/feed it, e.g. a `ChapterWorkspacePane` in `studio.tsx`, or rename `StudioPane`). It renders the single highlighted-prose surface that handles reading, render-progress, and playback via `useChapterFollow`.
- `matchTrackName` is derived from the active chapter (e.g. `Chapter ${activeChapter}`) rather than hard-coded to `'Chapter 4'`, so the workspace tracks the chapter opened from Contents. Accept an `activeChapter` prop (threaded from root).
- `ReviewPane` is **removed** as a separate destination/tab. Any wanted Review-only affordance (e.g. annotations) is folded into the workspace; otherwise dropped. Remove the `ReviewPane` export and its now-dead imports.
- The workspace is rendered when a chapter is open (the 005 `openChapter` slot); the four book tabs are unchanged.

## Steps
1. In `frontend/src/demo/stages/siteMockup/panes/studio.tsx`: evolve `StudioPane` into the unified Chapter Workspace. Accept an `activeChapter` prop and derive `matchTrackName` from it (replace the hard-coded `'Chapter 4'` at `:513`). Keep the existing `useChapterFollow` wiring, the render-progress `StatusOrb`, and the prose surface.
2. Review `ReviewPane` (`panes/book.tsx:894-...`) for anything not already in Studio (e.g. annotations). Fold the wanted parts into the workspace; drop the rest.
3. Remove `ReviewPane` and its export from `panes/book.tsx`; remove now-unused follow-scroll imports there if Review was their only consumer.
4. In `frontend/src/demo/stages/siteMockupStage.tsx`: remove the `ReviewPane` import (`:63`) and any `Review` references; render the unified workspace in the `openChapter` placeholder slot from 005, passing `activeChapter`, `activeTrack`, `setActiveTrack`.
5. Verify the follow-scroll still engages on the workspace surface (highlight marches, Resume pill appears after a manual scroll). Do not modify `useChapterFollow` itself.
6. Run `npm -C frontend run build` and clear any dead-import / unused-symbol type errors.

## Acceptance criteria
- [ ] `npm -C frontend run build` passes.
- [ ] There is no Review tab or Review destination anywhere in the book view.
- [ ] Opening a chapter from Contents shows one workspace whose single highlighted-prose surface handles reading, render-progress highlight, and playback (the existing follow-scroll), with the Resume pill behavior intact.
- [ ] The workspace tracks the chapter that was opened (highlight/track name follows `activeChapter`, not a hard-coded chapter).
- [ ] `useChapterFollow`/`buildSegmentTimeline`/`ResumeFollowingPill` in `shared.tsx` are unchanged (reused, not re-implemented).
- [ ] No dead `ReviewPane` import or unused follow-scroll import remains.

## Out of scope
- The `Contents ▾` mini-TOC switcher + prev/next + last-edited bookmark (008).
- The Cast slide-out and span assignment gesture (009+).
- Inline phonetic edit (013).
- Changing the follow-scroll mechanism itself.
- Editing the player-bar / minimap block in `siteMockupStage.tsx`.
