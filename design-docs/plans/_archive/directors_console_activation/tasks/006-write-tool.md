# Task 006 — Build the new `WriteTool` (full source editor)

Status: done

## Goal

Add `WriteTool`, a fourth `DirectorsConsole` tool that doesn't exist yet (not even a placeholder), per `design-docs/workflows/chapter-editor-modes.md` §7b/§13 — Write mode is first-class v1, always accessible, not tucked away. It is a thin wrapper around the already-working `ChapterTextPanel`/`useChapterText` — this is exactly what the superseded `chapter_workspace_merge` plan's Task 003 had already correctly specified (full raw-textarea edit with produced-chapter lock), just relocated into the proper `DirectorsConsole` module shape instead of being bolted onto `StudioStage.tsx` directly.

## Exact files

- New folder: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/WriteTool/index.tsx`
- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/WriteTool/WriteTool.test.tsx`
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/registry.ts` — add `WriteTool` to the `directorsConsoleTools` array.
- Reference (do not modify): `frontend/src/pages/Book/components/ChapterTextPanel.tsx`, `frontend/src/pages/Book/lib/useChapterText.ts`, and the exact call-site pattern in `frontend/src/pages/Book/stages/ContentsStage.tsx` (grep `ChapterTextPanel` there for the full `chapter`/`onSaved` wiring to copy).

## Target contract

```tsx
// frontend/src/pages/ChapterEditor/components/DirectorsConsole/WriteTool/index.tsx
import { FileText } from 'lucide-react'; // or whatever "document" icon convention the other tool icons use (Mic2/Headphones/PenLine from lucide-react — pick a matching document glyph, e.g. FileText or FileEdit)
import type { DirectorsTool } from '../types';
import { useSearchParams } from 'react-router-dom';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { ChapterTextPanel } from '@/pages/Book/components/ChapterTextPanel';

const WriteToolBody: React.FC = () => {
  const { chapters, reload } = useBookDataContext(); // confirm actual reload/refresh field name in the context value — it may not be called `reload`; check ContentsStage.tsx's usage for the real name
  const [searchParams] = useSearchParams();
  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;
  const selectedChapter = chapters.find(c => c.id === resolvedChapterId) || null;
  return <ChapterTextPanel chapter={selectedChapter} onSaved={() => reload()} />;
};

export const WriteTool: DirectorsTool = {
  id: 'write',
  label: 'Write',
  icon: FileText,
  component: WriteToolBody,
  demoPlaceholder: false,
};
```

## Steps

- [x] Create the folder and file per the target contract above.
- [x] Check `useBookDataContext()`'s actual return shape (grep the context definition) for the correct refresh-callback name — do not assume it's called `reload`; `ContentsStage.tsx`'s existing `<ChapterTextPanel chapter={selectedChapter} onSaved={reload} />` usage shows the real name in context. **Confirmed: the field is `reload`** (matches the target contract verbatim; `BookDataContextValue` — see `useBookData.ts` — exposes `reload`, and `ContentsStage.tsx:33,178` uses it directly).
- [x] Add `WriteTool` to `registry.ts`'s `directorsConsoleTools` array — per the design doc, Write is a first-class mode alongside Cast/Booth/Revise, so it belongs before the three placeholder/future entries (`CastingCallPlaceholder`, etc.), not after them.
- [ ] Verify manually (live preview) that: an unproduced chapter shows the editable textarea directly in Write mode; a produced (Cast/Rendered/Stale/Error) chapter shows the lock + "Edit anyway" warning banner, identical to how Contents already behaves for the same chapter. **Not performed** — no live app/browser preview tool was available in this execution session. Structural parity is guaranteed (same `ChapterTextPanel`/`useChapterText` import, not a copy), and covered by `WriteTool.test.tsx`, but an owner should do a quick visual pass before calling this fully closed.
- [x] Add `WriteTool.test.tsx` covering: renders `ChapterTextPanel` with the correctly-resolved chapter; switching to another `DirectorsConsole` tool and back preserves no stale state (component remounts cleanly, since `DirectorsConsole` unmounts inactive tool bodies — confirm this by reading `index.tsx:75-77`, which only renders the *active* tool's component, so remount-on-switch is already guaranteed by the shell, not something this task needs to build). Note: placed under `frontend/tests/unit/...` (not `frontend/src/...`) to match the project's actual vitest `include` glob and test-location convention — see report/deviation note.
- [x] Re-run `frontend/tests/unit/pages/Book/stages/ContentsStage.test.tsx` — must still pass unchanged (INV-2: no regression to Contents' own `ChapterTextPanel` usage). Passes unchanged (11/11 tests).

## Acceptance criteria

- [x] Write mode works identically to Contents' existing full-text-edit for the same chapter (same lock behavior, same save mechanism) — prove with the test, not just a visual check. (Proven structurally: `WriteTool` imports the unmodified `ChapterTextPanel`/`useChapterText`; `WriteTool.test.tsx` asserts correct chapter resolution and `onSaved`→`reload` wiring. Live visual lock-banner check not performed — see step above.)
- [x] `ContentsStage.test.tsx` passes unchanged.
- [x] `WriteTool` appears in the console rail, before the three placeholder/future tools.
- [x] `npx tsc -b --force` clean.
- [x] Append a `docs/code-map/queue/` entry.

## Dependencies

Task 002 (mounted console). File-independent of 003/004/005 — safe to run in parallel with any of them.

## Map links

- Part: `WriteTool` — `01-map.md`, "The parts"
- Contract: `ChapterTextPanel`/`useChapterText` (unchanged) — `01-map.md`, "Contracts"
- Invariant: INV-1 (zero-prop), INV-2 (no regression to Contents), INV-3 (produced-chapter lock parity — verify, don't assume)
- Risk: `quality-sensitive` (reuses a save/lock mechanism touching real chapter text — get the "identical to Contents" claim verified, not assumed, same standard the superseded plan's Task 003 held itself to)

## Out of scope

- Modifying `ChapterTextPanel.tsx`/`useChapterText.ts` themselves.
- The Resync-preview flow's correctness (already live, already tested elsewhere — this task only wires the existing panel into a new mount point).
