# Implementation map

## The big picture

```
BookLayout.tsx (ChapterWorkspace, ~L200-314)
  BEFORE: [Studio | Review] toggle → <StudioStage /> | <ReviewStage />
  AFTER:  <DirectorsConsole />  (renders its own internal tool rail: Cast | Booth | Revise | Write)
```

`DirectorsConsole` is a **zero-prop** component (`index.tsx:17`, `<DirectorsConsole initialToolId?: string />`) that renders whichever tool is active from `registry.ts`'s `directorsConsoleTools` array. Each tool's `component: ComponentType` (`types.ts:19`) is **also zero-prop** — it is rendered as `<ActiveToolBody />` with nothing passed in (`index.tsx:76`).

**This is the single most important contract in this plan:** every tool body must resolve its own chapter/book context internally, exactly the way `StudioStage.tsx` and `ReviewStage.tsx` already do today — there is no prop-passing path from `BookLayout` through `DirectorsConsole` down to a tool body. Concretely, each tool body must call, itself:
- `useSearchParams()` (react-router-dom) → `searchParams.get('chapter')` for the active chapter id, falling back to `chapters[0]?.id` (verbatim pattern: `StudioStage.tsx:33-40`).
- `useBookDataContext()` (`@/pages/Book/BookDataContext`) for `chapters`, `jobs`, `speakerProfiles`, etc.

Do not add a `chapterId` prop to `DirectorsTool`/`DirectorsConsoleProps` — that would diverge from the shipped scaffold's contract for no benefit, since the context/route-param path already works and is proven by the two components being ported.

## The parts

| Part | File(s) | Responsibility |
|---|---|---|
| `DirectorsConsole` (existing, unmodified) | `.../DirectorsConsole/index.tsx` | Renders the tool rail + active tool body. Not touched by this plan except being newly *mounted*. |
| Tool registry (existing, gains one entry) | `.../DirectorsConsole/registry.ts` | Ordered `DirectorsTool[]`. Task 006 adds `WriteTool` to this array. |
| `CastTool` (stub → real) | `.../DirectorsConsole/CastTool/` | Voice/speaker paint assignment. Port target: `StudioStage.tsx`'s paint banner (L256-291) + `ScriptView` assign wiring (L293-337) + `CastPalette` (L343-365). |
| `BoothTool` (stub → real) | `.../DirectorsConsole/BoothTool/` | Listening/karaoke/flagging. Port target: `ReviewStage.tsx`'s `review-text-view` click-to-seek block (L213-227) + `useReviewPlayback.ts` (percent-based active-segment mapping) + `FollowAlongPanel.tsx` (segment counter/regenerate) + `AnnotationsPanel.tsx` (notes). |
| `ReviseTool` (stub → real, NEW logic) | `.../DirectorsConsole/ReviseTool/` | In-place paragraph edit. No existing UI to port — new component. Backend already supports it (see Contracts below). |
| `WriteTool` (new folder) | `.../DirectorsConsole/WriteTool/` | Full-source edit. Thin wrapper around `ChapterTextPanel`/`useChapterText`, unchanged. |
| `BookLayout.tsx` `ChapterWorkspace` | `frontend/src/pages/Book/BookLayout.tsx:200-314` | Mounts `<DirectorsConsole />` in place of the `activeView === 'studio' ? <StudioStage/> : <ReviewStage/>` ternary (L302-304) and removes the `WorkspaceView` state/toggle (L113, L203, L246-263). |
| Demo `DirectorsConsole` (rename only) | `frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`, `siteMockupStage.tsx:66,1038` | Unrelated, self-contained demo component with the same export name. Rename to remove the collision — no functional change. |

## Contracts

**Segment text update (already live, no backend change needed):**
```
PUT /api/segments/{segment_id}
  body: { text_content?: string, audio_status?: string, character_id?: string|null, speaker_profile_name?: string|null }
```
`app/api/routers/chapters.py:197-216` forwards the request body verbatim to `app/db/segments.py:295 update_segment(segment_id, **updates)` — no field whitelist at the route layer. `update_segment` already special-cases `text_content` and `audio_status="unprocessed"` to trigger the correct stale-audio/re-render cleanup path (`segments.py:303`). Revise mode's commit action is: `api.updateSegment(segmentId, { text_content: newText, audio_status: 'unprocessed' })`, then trigger a re-render of that one segment the same way `ReviewStage.tsx:78-91`'s `handleReRenderSegment` does (`api.generateSegments([segmentId])`).

**Frontend type gap:** `frontend/src/api/index.ts:254`'s `updateSegment` currently types its `data` param as `{ character_id?, speaker_profile_name?, audio_status? }` — missing `text_content`. Task 004 (Revise) adds `text_content?: string` to this type. This is additive; no other caller is affected.

**`ChapterTextPanel` contract (Write mode, unchanged):**
```ts
ChapterTextPanel({ chapter: Chapter | null; onSaved?: () => Promise<void> | void })
useChapterText(chapter: Chapter | null, onSaved?): { text, setText, loading, lifecycle, isProduced, saveState, hasTextChanges, previewData, previewLoading, resyncing, requestResyncPreview, confirmResync, clearPreview }
```
(`frontend/src/pages/Book/components/ChapterTextPanel.tsx:46,7-10`, `frontend/src/pages/Book/lib/useChapterText.ts:9,142-157`.)

**`DirectorsTool` registration contract (existing, unmodified — Task 006 just adds an entry):**
```ts
export interface DirectorsTool {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  component: ComponentType;      // zero props — see "The parts" above
  shortcut?: string;
  demoPlaceholder?: boolean;
}
```

## Invariants

- **INV-1 (zero-prop tool bodies):** every tool `component` resolves chapter/book context via `useSearchParams()` + `useBookDataContext()` internally. No task in this plan adds a prop-passing path through `DirectorsConsole`.
- **INV-2 (no regression to Contents' `ChapterTextPanel` usage):** `WriteTool` reuses `ChapterTextPanel`/`useChapterText` verbatim — it must not modify those files. `ContentsStage.tsx`'s existing usage and its test (`ContentsStage.test.tsx`) must still pass unchanged.
- **INV-3 (produced-chapter lock parity):** Write mode's lock/warning banner behavior for a produced chapter must be identical to Contents' current behavior for the same chapter — this is a shared hook (`useChapterText`), so parity is automatic *unless* something is copy-pasted instead of imported. Verify with a live comparison, not assumption.
- **INV-4 (mutation batching is explicitly NOT required for this pass):** the design doc calls batched-write-on-gesture-end "mandatory" for Cast (§5), but `StudioStage`'s current assign handlers don't batch either — porting current behavior faithfully does not regress anything that exists today. Do not block Task 003 on building a batching system; note the gap in `TASKS.md` instead (Task 007's cleanup step).
- **INV-5 (segment ids are engine units, not the Revise edit unit):** Revise mode edits and commits at the **segment** level (matches what the backend supports today), not a user-visible "paragraph" that might span multiple segments. If a paragraph maps to multiple segments in the current data model, Revise's v1 scope is "edit one segment's text inline" — confirm this against real data during Task 005 and narrow scope explicitly if a paragraph-spans-segments case is common, rather than silently assuming 1:1.
- **INV-6 (annotations store is unchanged):** `AnnotationsPanel`'s `@/store/annotations` (localStorage-only, no backend persistence — a known, already-flagged limitation) is ported as-is in Task 004. Not this plan's job to add persistence.

## Risks

- `multi-file`: Task 007 (deletion) touches `BookLayout.tsx`, deletes two stage files, and must not break any other route that might still reference `StudioStage`/`ReviewStage` (grep before deleting).
- `quality-sensitive`: Task 005 (Revise) is the one task with genuinely new logic touching real chapter segment text and triggering re-renders — gets adversarial review regardless of diff size.
- Open question flagged for whoever executes Task 005: confirm via real chapter data whether "paragraph" (the user-facing edit unit per the design doc) reliably maps 1:1 to a segment in this codebase's current chunking, or whether Revise's v1 must scope down to "edit the segment's full text" as the practical unit. Don't guess — check `ScriptView`'s segment-to-paragraph grouping logic (`groupNumberForSpan`, referenced in the Cast port) for the existing convention.
