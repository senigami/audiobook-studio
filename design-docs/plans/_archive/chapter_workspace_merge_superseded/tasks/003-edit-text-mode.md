# Task 003 — Build the Edit Text mode

Status: pending

## Goal

Replace Task 001's stub with a working "Edit Text" mode in `StudioStage.tsx`, by porting `ContentsStage.tsx`'s exact `ChapterTextPanel` usage — not rebuilding the pattern.

## Exact files

- `frontend/src/pages/Book/stages/StudioStage.tsx` — add the Edit Text mode content (replacing Task 001's stub `<div>`).
- Reference (do not modify unless a genuine bug surfaces): `frontend/src/pages/Book/components/ChapterTextPanel.tsx`, `frontend/src/pages/Book/lib/useChapterText.ts`.
- Reference for the exact call-site pattern to copy: `frontend/src/pages/Book/stages/ContentsStage.tsx` — its `<ChapterTextPanel chapter={selectedChapter} onSaved={reload} />` usage (grep `ChapterTextPanel` in that file for full context: what `selectedChapter` is derived from, what `reload` does).

## Target contract

```tsx
{activeMode === 'edit-text' && selectedChapter && (
  <ChapterTextPanel chapter={selectedChapter} onSaved={() => { /* see below */ }} />
)}
```

`StudioStage.tsx` already resolves the active chapter (`selectedChapter`, derived from `resolvedChapterId` — see `StudioStage.tsx:39-43`) — reuse that directly, don't re-derive it. For `onSaved`, `ContentsStage.tsx` passes `reload` (its own data-refresh function from `useBookDataContext()`) — `StudioStage.tsx` has access to the same `useBookDataContext()`; check what refresh mechanism is already available there (it may not call it `reload` — check the context value's actual shape) and wire the equivalent.

## Steps

- [ ] Import `ChapterTextPanel` in `StudioStage.tsx`.
- [ ] Replace Task 001's Edit Text stub with the real `<ChapterTextPanel>` usage, wired to `selectedChapter` and the appropriate save-refresh callback.
- [ ] Verify manually (live preview) that: an unproduced chapter shows the editable textarea directly; a produced (Cast/Rendered/Stale/Error) chapter shows the lock + "Edit anyway" warning banner, identical to how Contents already behaves for the same chapter.
- [ ] Add a test to `frontend/tests/unit/pages/Book/stages/StudioStage.test.tsx` (check if this file exists; if not, this is a good moment to add one, but keep it scoped to the Edit Text mode addition, not a full StudioStage rewrite-test) covering: Edit Text mode renders `ChapterTextPanel` with the correct chapter; switching away and back preserves no stale state (component remounts cleanly).

## Acceptance criteria

- [ ] Edit Text mode works identically to Contents' existing full-text-edit for the same chapter (same lock behavior, same save mechanism — prove this with a test or a documented manual comparison).
- [ ] No regression to Contents' own `ChapterTextPanel` usage (re-run `frontend/tests/unit/pages/Book/stages/ContentsStage.test.tsx` — must still pass unchanged).
- [ ] `npx tsc -b --force` clean.
- [ ] Append a `docs/code-map/queue/` entry.

## Dependencies

Task 001 (the mode switcher and stub must exist).

## Map links

- Part: `ChapterTextPanel + useChapterText (Edit Text mode, NEW placement)` — `01-map.md`, "The parts"
- Invariant: INV-2 (produced-chapter lock must behave identically to Contents), INV-3 (no regression to Contents)
- Risk: `quality-sensitive` (this reuses a save/lock mechanism that touches real chapter text — get the "identical behavior to Contents" claim verified, not assumed)

## Out of scope

- Modifying `ChapterTextPanel.tsx`/`useChapterText.ts` themselves.
- Cleanup/dead-CSS removal (Task 004).
