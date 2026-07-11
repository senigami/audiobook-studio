# Task 004 — Build the real `BoothTool` body (port `ReviewStage.tsx`)

Status: done

## Goal

Replace `BoothTool`'s stub (`<ToolStub icon={Headphones} label="Booth" />`) with `ReviewStage.tsx`'s actual working listening/karaoke/flagging UI, relocated into `BoothTool/` per the design doc's module contract (§17). Port faithfully; do not build the deferred annotation-gutter glyphs.

## Exact files

- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx` — replace stub with real component.
- Reference / port source (read fully): `frontend/src/pages/Book/stages/ReviewStage.tsx` (244 lines), `frontend/src/pages/Book/stages/ReviewStage/FollowAlongPanel.tsx` (109 lines), `frontend/src/pages/Book/stages/ReviewStage/useReviewPlayback.ts` (111 lines), `frontend/src/pages/Book/stages/ReviewStage/AnnotationsPanel.tsx` (176 lines).
- Reused as-is (import, do not modify): `frontend/src/pages/Book/lib/useRenderGroups` (or wherever `useRenderGroups` is defined — grep it), `@/store/annotations`, `@/store/playerBus`.

## Important structural note

`ReviewStage.tsx` currently renders its own **chapter picker rail** (the `review-chapter-rail` CSS class, `ReviewStage.tsx:142-175`) as a left sidebar. This is a *second* chapter switcher — `ChapterWorkspaceHeader` (rendered once, above the whole `DirectorsConsole`, unaffected by this plan) already provides chapter navigation. **Do not port the `review-chapter-rail` sidebar into `BoothTool`** — port only the chapter-selection *logic* (`handleChapterSelect`, `ReviewStage.tsx:118-133`, which also kicks off playback) as an internal effect keyed off the already-resolved `resolvedChapterId` (same pattern as Task 003), not as a rendered rail. If this changes how a chapter's audio starts playing (previously triggered by clicking the rail), replace it with playback starting automatically when Booth mode is entered for a chapter that has audio — verify this against `useReviewPlayback.playChapter`'s existing signature; don't invent a new triggering mechanism.

## Critical constraint — zero-prop contract (INV-1)

Same as Task 003: resolve chapter context via `useSearchParams()` + `useBookDataContext()` internally. `ReviewStage.tsx:25-31`'s existing resolution logic (route param → `?chapter=` → first chapter) is the pattern to keep — it already matches this constraint since `ReviewStage` is also currently mounted with zero props.

## Target contract

```tsx
// frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx
import type { DirectorsTool } from '../types';
import { Headphones } from 'lucide-react'; // confirm against existing stub

const BoothToolBody: React.FC = () => { /* ported ReviewStage content, minus the rail */ };

export const BoothTool: DirectorsTool = {
  id: 'booth',
  label: 'Booth',
  icon: Headphones,
  component: BoothToolBody,
  demoPlaceholder: false,
};
```

## Steps

- [x] Read the current `BoothTool/index.tsx` stub for the exact existing `id`/`label`/`icon`.
- [x] Read `ReviewStage.tsx`, `FollowAlongPanel.tsx`, `useReviewPlayback.ts`, `AnnotationsPanel.tsx` in full.
- [x] Build `BoothToolBody`: `useReviewPlayback` hook usage (`ReviewStage.tsx:61-69`), `useRenderGroups` (`ReviewStage.tsx:39-43`), segment fetch (`ReviewStage.tsx:46-59`), `handleReRenderSegment` (`ReviewStage.tsx:78-91`), auto-scroll (`ReviewStage.tsx:94-101`), `FollowAlongPanel` (`ReviewStage.tsx:181-190`) + Annotations toggle (`ReviewStage.tsx:191-201`), the `review-text-view` click-to-seek karaoke block (`ReviewStage.tsx:213-227`), conditional `AnnotationsPanel` (`ReviewStage.tsx:232-238`) — everything except the `review-chapter-rail` (per the note above). The rail's chapter-selection *logic* (not the rendered rail) was replaced with an internal effect that auto-plays the resolved chapter's audio when Booth mode is entered (see "Deviations" below).
- [x] Confirm what CSS classes (`review-main`, `review-text-view`, etc.) are used and whether they're generic enough to keep or need renaming for the new location — checked `frontend/src/theme/components.css`. `.review-main`/`.review-text-view`/`.review-main__*` are reused as-is (they don't hard-depend on the rail; `.review-main{flex:1}` is simply inert without a flex-row parent). `.review-chapter-rail*` rules are now dead CSS (no longer referenced by any component) — left in place for Task 007's cleanup pass per the note above, not removed speculatively here.
- [x] Add/adapt a `BoothTool.test.tsx` covering: renders segments, clicking a segment calls `seekToSegment`, regenerate button calls the re-render handler, Annotations panel toggles. Also added coverage for the new auto-play-on-enter behavior (with/without rendered audio) and a no-duplicate-chapter-switcher assertion.
- [ ] Live preview: confirm Booth tool shows karaoke highlight + click-to-seek + regenerate + annotations toggle, with no rendered chapter-picker rail (that's now solely the header's job). *(Not run — no live browser/preview session available in this pass; verified via the ported unit test suite instead. Flagging for owner/live verification.)*

## Acceptance criteria

- [x] `BoothToolBody` renders working karaoke highlight, click-to-seek, segment regenerate, and annotations panel — matching current `ReviewStage` functionality (minus the redundant rail).
- [x] No duplicate chapter switcher exists anywhere on screen once this + the header are both visible. (Verified by code inspection — no rail markup — and by a unit test asserting no `listbox`/`option` roles are rendered by `BoothToolBody`.)
- [x] No prop expected from `DirectorsConsole` (INV-1).
- [x] `npx tsc -b --force` clean; tests pass.
- [x] Append a `docs/code-map/queue/` entry.

## Deviations / notes for reviewer

- Faithful-port scope was interpreted as: relocate `FollowAlongPanel.tsx`, `AnnotationsPanel.tsx`, and `useReviewPlayback.ts` (renamed `useBoothPlayback.ts`, same options/return shape, only the name changed since it now lives under `BoothTool/`) into new sibling files under `BoothTool/`, rather than importing them from the old `Book/stages/ReviewStage/` location — they need local copies since Task 007 deletes that folder entirely.
- Per the "Important structural note," the rail's click-to-play behavior was replaced with an internal `useEffect` keyed on the resolved chapter id: Booth mode auto-plays the active chapter's audio (via the existing `playChapter`/`useBoothPlayback.playChapter` signature, unchanged) whenever a chapter with rendered audio becomes active — matching the note's suggested fallback exactly.
- `DirectorsConsole.test.tsx`'s "switches the active tool body" test previously asserted Booth's stub ("Coming soon") — updated to use Revise (still a stub) instead, since Booth is no longer a stub after this task.

## Dependencies

Task 002 (console mounted for live verification). Independent of Task 003 (different files) — safe to run in parallel.

## Map links

- Part: `BoothTool` — `01-map.md`, "The parts"
- Invariant: INV-1, INV-6 (annotations store ported as-is, no persistence added)
- Risk: `multi-file` (drops a rendered sidebar — verify the CSS grid/flex around it doesn't leave a dead gap; cross-file consistency check against `ChapterWorkspaceHeader`'s own chapter-switcher to confirm no duplicate remains)

## Out of scope

- Annotation gutter glyphs (⊘/⚡/🏴/tick) — deferred.
- Deleting `ReviewStage.tsx`/folder (Task 007).
