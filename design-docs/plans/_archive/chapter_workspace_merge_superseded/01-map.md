# Implementation Map

## Big picture

Today, `BookLayout.tsx`'s `ChapterWorkspace` renders `ChapterWorkspaceHeader` (the good switcher) plus a hard `Studio | Review` toggle that swaps in one of two entirely separate stage components, each with its own content model:

```
ChapterWorkspace (BookLayout.tsx)
 ├─ ChapterWorkspaceHeader        ← the ONE real switcher: prev/next/jump-to-unrendered/bookmarks/Contents▾
 ├─ [toggle: Studio | Review]     ← REMOVE — this is the thing being merged away
 ├─ StudioStage (if 'studio')     ← ScriptView: per-segment character-assignment, non-editable text
 └─ ReviewStage (if 'review')     ← review-chapter-rail (DUPLICATE switcher, REMOVE)
                                     + FollowAlongPanel/review-text-view (playback-synced read-only prose)
                                     + AnnotationsPanel (notes, currently a fixed side drawer)
```

Target: one workspace, one switcher, three content **modes** instead of two competing **stages**, plus a genuinely new fourth capability (full-text edit) ported in from Contents:

```
ChapterWorkspace (merged)
 ├─ ChapterWorkspaceHeader        ← unchanged, still the only switcher
 ├─ [mode toggle: Cast | Follow Along | Edit Text]   ← NEW, replaces Studio|Review
 ├─ Cast mode        = today's StudioStage/ScriptView content, unchanged internally
 ├─ Follow Along mode = today's ReviewStage's review-text-view + FollowAlongPanel toolbar, MINUS the rail
 ├─ Edit Text mode    = NEW — ChapterTextPanel + useChapterText, ported verbatim from ContentsStage.tsx
 └─ Annotations       = docked side panel (WorkspacePanel pattern, like Lexicon), available from Follow Along mode
```

## The parts

| Part | Responsibility | File |
|------|----------------|------|
| `ChapterWorkspace` | Composes header + mode content; owns the new mode state | `frontend/src/pages/Book/BookLayout.tsx:200-314` |
| `ChapterWorkspaceHeader` | The one real switcher (prev/next/bookmarks/jump-to-unrendered/Contents▾) — **unchanged, do not touch** | `frontend/src/pages/Book/components/ChapterWorkspaceHeader.tsx` |
| `WorkspacePanel` | Existing dockable side-panel primitive (built for Lexicon) — reuse for Annotations | `frontend/src/pages/Book/BookLayout.tsx:131-197` |
| `StudioStage` (Cast mode) | Per-segment character assignment via `ScriptView` — internals unchanged, just re-hosted as one mode instead of a full stage | `frontend/src/pages/Book/stages/StudioStage.tsx` |
| `ReviewStage` remnants (Follow Along mode) | `review-text-view` (playback-synced highlighted prose) + `FollowAlongPanel` toolbar — **minus** `review-chapter-rail` | `frontend/src/pages/Book/stages/ReviewStage.tsx:141-229` |
| `AnnotationsPanel` | Notes UI, becomes a `WorkspacePanel`-docked panel instead of a fixed drawer | `frontend/src/pages/Book/stages/ReviewStage/AnnotationsPanel.tsx` |
| `ChapterTextPanel` + `useChapterText` (Edit Text mode, NEW placement) | The full-text-edit pattern — **reused as-is**, not rebuilt | `frontend/src/pages/Book/components/ChapterTextPanel.tsx`, `frontend/src/pages/Book/lib/useChapterText.ts` |

## Connections & contracts

- **`ChapterTextPanel`'s existing props/contract must be honored exactly** — read `ContentsStage.tsx`'s usage of it first (grep `<ChapterTextPanel` there) to copy the exact prop shape into `StudioStage.tsx`'s new Edit Text mode. Do not modify `ChapterTextPanel.tsx` or `useChapterText.ts` themselves unless a genuine second-consumer bug surfaces (if so, fix it there once, both consumers benefit — but the goal is zero changes to this pattern, only a new call site).
- **`review-chapter-rail`'s `handleChapterSelect`** (`ReviewStage.tsx`, near the rail) likely calls `navigate(...)` to change the URL's chapter param — confirm this exact mechanism and make sure removing the rail doesn't strand any navigation logic that `ChapterWorkspaceHeader` doesn't already provide (it should — `ChapterWorkspaceHeader` is described as the definitive switcher in the design doc, but verify chapter-select behavior isn't subtly different, e.g. rail select stayed within Review mode without confirming, header select might do something else).
- **`AnnotationsPanel`'s current props** (`chapterId`, `activeSegmentId`, `onSeekToSegment`) need `activeSegmentId`/`onSeekToSegment` sourced from wherever Follow Along mode's playback state lives once it's hosted inside the merged `ChapterWorkspace` rather than standalone `ReviewStage`.
- **Mode state persistence**: `BookLayout.tsx`'s `ChapterWorkspace` currently has `activeView: WorkspaceView` state (`'studio' | 'review'`) that resets per-mount, not persisted across chapter switches. Decide (and document the choice) whether the new 3-way mode should reset to a default (e.g. always 'Cast') on every chapter switch, or persist the user's last-chosen mode — check `frontend/src/pages/Book/lib/stages.ts`'s `setLastStage`/`getLastStage` pattern (already used for book-level tab persistence) as the precedent if persistence is chosen.

## Invariants

- **[INV-1]** `ChapterWorkspaceHeader` stays the only chapter switcher. No new code may add a second chapter-picker anywhere in the merged workspace.
- **[INV-2]** `ChapterTextPanel`/`useChapterText`'s produced-chapter lock (`isProduced` — true for `Cast`/`Rendered`/`Stale`/`Error` lifecycle, per the fix that just landed in `chapterLifecycle.ts` this session) must behave identically in its new Edit Text call site as it already does in Contents — same warning banner, same "edit anyway" unlock, same autosave-vs-explicit-resync behavior. This is a port, not a reimplementation; the acceptance test should prove the two call sites behave identically for the same chapter.
- **[INV-3]** No regression to Contents' existing use of `ChapterTextPanel` — it's shared, not moved.
- **[INV-4]** This repo's testing standards (design-docs/specs/testing-standards.md) apply: R1 revert-check on the merge itself where feasible (e.g., a test asserting no Studio/Review toggle exists, which should fail red against the pre-merge code), R2 mock boundaries only.

## Risks / open questions

- **Mode-state persistence** (see Connections above) — genuinely undecided, flag in the relevant task rather than guessing silently; default recommendation: reset to 'Cast' on chapter switch (simplest, matches "each chapter switch is a fresh look" mental model) unless a task's implementer finds a strong reason to persist.
- **Follow Along's `review-text-view` vs `ScriptView`**: these are two different segment-rendering components with different purposes (Follow Along highlights the currently-playing segment; ScriptView supports character-assignment clicks). This plan keeps them as genuinely separate modes rather than merging their rendering — do not attempt to unify them into one segment-view component, that's a larger, separate redesign not asked for here.
