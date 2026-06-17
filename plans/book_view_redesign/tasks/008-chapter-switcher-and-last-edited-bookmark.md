# 008 — Chapter switcher (`Contents ▾`) + last-edited bookmark

- **Status:** not-started
- **Workload:** Mock: single Chapter Workspace
- **Severity / type:** major · ux
- **Effort:** M
- **Blocked by:** 007
- **Blocks:** nothing

## Goal
Give the Chapter Workspace header a `Contents ▾` mini-TOC dropdown (chapters with mini orbs) plus prev/next controls that switch the active chapter **without leaving the workspace** (proposal §6.3). Add an automatic "last-edited" bookmark per chapter that stores the active/scrolled segment and resumes there on reopen, and make the book remember the last chapter opened (§6.8 auto bookmark).

## Why this matters
The root pain is that the chapter is not a persistent, switchable context — you get "stuck in Studio" and can't change chapters without leaving (§1 pains 1–2). A header switcher fixes that. The auto last-edited bookmark delivers "it resumes where I left off" (§6.1 step 2, §6.8). With ~16 chapters per book a dropdown (not a permanent rail) is the right form (§6.3, §8 resolved item 5).

## Context an executor needs
- Spec: `plans/book_view_ia_proposal.md` §6.3 (header: `Contents ▾` switcher + prev/next + bookmark; ~16 chapters → dropdown, no permanent rail), §6.8 (auto "last-edited" bookmark — one per chapter, moves with edits, resumes on open; book remembers last chapter opened), §6.1 steps 2 & 10.
- Roadmap: `plans/book_view_redesign/01-roadmap.md` — Workload 3; `007 ──► 008`; blocks nothing.
- Workspace header: the unified Chapter Workspace from 007 (in `frontend/src/demo/stages/siteMockup/panes/studio.tsx`, evolved from `StudioPane`). It already receives `activeChapter`. The follow-scroll exposes `activeChunkId` from `useChapterFollow` (`studio.tsx:512`) — that is the "current segment" to record as the bookmark.
- Chapter data for the dropdown: `frontend/src/demo/stages/siteMockup/shared.tsx:964-972` (`CHAPTERS`), `:962` (`CHAPTER_RENDER_PCT`). Mini orbs = `StatusOrb` (reuse; see 006), at a small size (e.g. `size={12}`), driven by the same per-chapter status mapping used on Contents.
- Active-chapter state lives in the root: `siteMockupStage.tsx:940` (`activeChapter`/`setActiveChapter`), already threaded to the Rail (`:1208-1209,1256-1258`) and (after 007) into the workspace. The switcher and prev/next call `setActiveChapter`.
- ⚠️ **Coordination:** this task adds per-chapter bookmark state to the root component in `siteMockupStage.tsx` and may pass new props through `BookPane`. The concurrent player-bar / minimap worker also edits `siteMockupStage.tsx` (player block ~790-861, `MockTapeControls.tsx`). **Confirm the root-state and `BookPane` regions are free before editing** and avoid the player block. The header UI itself lives in `panes/studio.tsx`.

## Target shape / contract
- **Workspace header gains:**
  - `Contents ▾` button opening a mini-TOC dropdown listing all `CHAPTERS`, each with a mini `StatusOrb` and title; selecting one calls `setActiveChapter(n)` and the workspace re-tracks that chapter **without unmounting / leaving the workspace** (the four book tabs stay out of view).
  - `◄ prev` / `next ►` controls that step `activeChapter` (clamped to the chapter range), also without leaving the workspace.
- **Auto last-edited bookmark:** a per-chapter record of the current segment, keyed by chapter number, e.g. `Record<number, string /* segmentId */>`. It updates as the user scrolls/edits (track `activeChunkId` from `useChapterFollow`). On switching to / reopening a chapter, the workspace scrolls/highlights to that chapter's stored segment if present (else top). State lives in the root (`SiteMockup`) so it survives chapter switches within the session.
- **Book remembers last chapter opened:** root keeps a `lastOpenedChapter` (can reuse `activeChapter`); opening the book / returning to the workspace lands on it.

## Steps
1. In `frontend/src/demo/stages/siteMockupStage.tsx` root state: add `lastEditedSegmentByChapter` (a `Record<number,string>`), and a setter the workspace can call. Confirm `activeChapter` already persists (it does, `:940`). Thread the bookmark map + setter and `setActiveChapter` into the workspace via `BookPane`.
2. In `frontend/src/demo/stages/siteMockup/panes/studio.tsx` workspace header: add the `Contents ▾` dropdown (list `CHAPTERS` + mini `StatusOrb` per the Contents status mapping) and prev/next buttons. Wire selection / stepping to `setActiveChapter` so the workspace re-tracks the chapter in place.
3. Record the bookmark: when `activeChunkId` changes, call the setter to store `{ [activeChapter]: activeChunkId }`. On chapter open/switch, if a stored segment exists, scroll/highlight to it (use the existing `scrollRef` / follow mechanism — do not re-implement scrolling); else default to top.
4. Ensure switching chapters via the dropdown or prev/next does not leave the workspace (no return to the tab row) and does not lose the open-chapter state from 005/007.
5. Run `npm -C frontend run build`.

## Acceptance criteria
- [ ] `npm -C frontend run build` passes.
- [ ] The workspace header shows a `Contents ▾` dropdown listing all chapters with a mini `StatusOrb` each, plus `◄ prev` / `next ►` controls.
- [ ] Selecting a chapter from `Contents ▾`, or using prev/next, switches the active chapter and the workspace re-tracks it **without returning to the book tab row** (you stay in the workspace).
- [ ] After scrolling within a chapter and switching away and back, the workspace resumes at the previously active segment (the auto last-edited bookmark), not the top.
- [ ] The book remembers the last chapter opened (reopening lands there).
- [ ] `useChapterFollow` / scroll logic in `shared.tsx` is reused, not re-implemented.

## Out of scope
- Named bookmarks, the global cross-book bookmark list, and "jump to next unrendered section" (012).
- The Cast slide-out / span assignment (009+).
- Inline phonetic edit (013).
- Persisting bookmarks beyond the in-memory session.
- Editing the player-bar / minimap block in `siteMockupStage.tsx`.
