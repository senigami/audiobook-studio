# Task 013 — Wire Revise mode's computed split into the real split endpoint

Status: pending

Risk: none (small, calls task 012's endpoint; self-contained to `ReviseTool`)

## Goal

Replace the discarded `splitSegmentText(...)` call in `ReviseTool/index.tsx`'s edit-commit path with a real call to task 012's `POST /api/segments/{segment_id}/split` endpoint, so editing a segment past the engine's character buffer actually produces two segments (when a valid split point exists) instead of always persisting one over-long segment behind a passive badge.

## Why this matters

`ReviseTool/index.tsx:157–164` already computes the split via `splitSegmentText(newText, ENGINE_CHAR_LIMIT)` on every over-limit commit — the result is thrown away because, until task 012, no endpoint existed to persist it. This is the last piece of Workload 5 (`02-roadmap.md` M5: "the 'running long' passive-only badge becomes a real two-way split"). This task is a small wiring change, not new design — the algorithm, the endpoint, and the UI shell (badge, overflow hint) all already exist.

## Exact contract to satisfy

Add to `frontend/src/api/index.ts`, near `updateSegment` (lines 255–263) and `generateSegments` (lines 275–281), following their exact calling convention (`FormData` body, no explicit `Content-Type`, response through the shared `parseApiResponse` helper — **not** the JSON-body convention `updateSegmentsBulk` uses):
```ts
splitSegment: async (segmentId: string, firstText: string, secondText: string): Promise<{ segments: ChapterSegment[] }> => {
  const formData = new FormData();
  formData.append('first_text', firstText);
  formData.append('second_text', secondText);
  const res = await fetch(`/api/segments/${segmentId}/split`, { method: 'POST', body: formData });
  return parseApiResponse(res);
},
```

## Current shape (verified)

- `ReviseTool/index.tsx:138–187` — `handleCommit`. The relevant block today:
  ```ts
  const isOverLimit = newText.length > ENGINE_CHAR_LIMIT;
  if (isOverLimit) {
    splitSegmentText(newText, ENGINE_CHAR_LIMIT);   // result unused — this is what changes
  }
  try {
    await api.updateSegment(editingId, { text_content: newText, audio_status: 'unprocessed' });
    await api.generateSegments([editingId]);
    setSegments((prev) => prev.map((seg) => (
      seg.id === editingId ? { ...seg, text_content: newText, audio_status: 'unprocessed' } : seg
    )));
    setLongSegmentIds((prev) => {
      const next = new Set(prev);
      if (isOverLimit) next.add(editingId);
      else next.delete(editingId);
      return next;
    });
    setEditingId(null);
    setDraftText('');
  } catch (err) { ... setSaveError(...) ... }
  finally { setSavingId(null); }
  ```
- `longSegmentIds` (`useState<Set<string>>`, line 57) drives two UI pieces that must keep working for the **no-valid-split** fallback case: the overflow hint shown while editing (`revise-text-view__overflow-hint`, lines 259–266, `draftText.length > ENGINE_CHAR_LIMIT`) and the passive "running long" badge shown on the saved, read-only segment (`revise-text-view__long-badge`, lines 305–309, driven by `longSegmentIds.has(seg.id)`).
- `savingId` (line 51) already drives the "Saving..." button state (line 277) generically — no new loading state is needed for the split network round-trip; it reuses this existing one.
- **No cross-tool state to invalidate.** Verified: `CastTool`, `BoothTool`, and `ReviseTool` each hold their own independent `segments` array and independently call `api.fetchSegments` on mount (`ReviseTool/index.tsx:46,77`; `BoothTool/index.tsx:29,87`; `CastTool` via `useStudioChapter` → `useChapterLoader.ts:69,83,147`). `DirectorsConsole/index.tsx:117` mounts only one tool body at a time — switching tabs unmounts/remounts fresh. So updating `ReviseTool`'s own local `segments` state from the split response is sufficient; Cast/Booth will see the persisted split next time they mount, with no broadcast mechanism needed or present today.
- `DirtyGuardContext` (`ReviseTool/index.tsx:9`, `DirtyGuardContext.tsx:15–50`) is write-only from `ReviseTool`'s side (`setDirty(isDirty, message?)`) — no interaction needed here beyond what already exists (dirty is already cleared on successful commit via the `editingId`-reset `useEffect`, lines 103–110).
- Existing test harness: `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/ReviseTool.test.tsx` (401 lines) already mocks `@/api`'s `fetchSegments`/`updateSegment`/`generateSegments` as getter-backed `vi.fn()`s (lines 18–32) and provides a `renderReviseTool()` helper (lines 55–61) wrapping the component in `MemoryRouter` with a `?chapter=` query param. Extend this harness with a `mockSplitSegment` the same way — do not build a new render harness.

## Target shape

1. In `handleCommit`, when `isOverLimit`:
   - Call `splitSegmentText(newText, ENGINE_CHAR_LIMIT)` (unchanged — the algorithm is already correct and tested).
   - If `result.segments.length === 2` (a valid split point exists): call `api.splitSegment(editingId, result.segments[0], result.segments[1])` **instead of** `api.updateSegment(editingId, { text_content: newText, ... })`. Do not persist the single over-long `newText` in this branch at all.
   - If `result.segments.length === 1` (no valid split point — the design doc's explicit "let it run long" case): keep today's exact behavior unchanged — `api.updateSegment` + `api.generateSegments([editingId])` + mark `editingId` in `longSegmentIds`. This is the existing passive-badge path and must not regress (INV-5, "no capability regression").
2. On a successful split response (`{ segments: ChapterSegment[] }`):
   - Replace `ReviseTool`'s local `segments` state wholesale with the response's `segments` array (`setSegments(response.segments)`) rather than manually splicing/renumbering — the response is the authoritative post-split chapter state from task 012's endpoint (which already ran `get_chapter_segments`), so a full replace avoids a whole class of manual-reorder bugs.
   - Call `api.generateSegments([...])` for **both** resulting segments, not just `editingId` — find the new segment's id by diffing the response's `segments` against the pre-split local `segments` (the id present in the response but absent before is the new right-half segment; `editingId` is the unchanged left-half id).
   - Ensure `editingId` is **not** added to `longSegmentIds` in this branch — a successful split means neither half is "running long" (remove `editingId` from `longSegmentIds` if it was previously flagged, same as today's `else` branch already does for the non-overflow case).
   - Clear `editingId`/`draftText` exactly as today.
3. Error handling: if `api.splitSegment` rejects, fall into the same `catch` block as today (`setSaveError('Save failed. Please try again.')`) — do not add a separate error path or leave `savingId` set on failure (the existing `finally { setSavingId(null); }` already covers this).
4. No new loading indicator, no new UI component — `savingId`'s existing "Saving..." button state covers the split round-trip.

## Steps

1. Add `splitSegment` to `frontend/src/api/index.ts` per the contract above.
2. Extend `ReviseTool.test.tsx`'s `vi.mock('@/api', ...)` block (lines 18–32) with a `mockSplitSegment` following the same getter-backed pattern as the existing mocks.
3. Write the new test cases first (TDD): (a) an over-limit edit with a valid sentence-boundary split point results in two segments rendered in the list, `api.splitSegment` called with the correct two text halves, `api.generateSegments` called with both resulting ids, and `editingId`'s original id is **not** added to `longSegmentIds`; (b) an over-limit edit with **no** valid split point (e.g. no punctuation in the overflow text) still shows the passive `revise-text-view__long-badge` exactly as before — this is the regression pin for INV-5, confirm it fails if you temporarily force the split call on this path, to prove the test actually distinguishes the two branches; (c) `api.splitSegment` rejecting shows `saveError` and does not leave the tool in a stuck "Saving..." state.
4. Implement the `handleCommit` branching in `ReviseTool/index.tsx` per the target shape above.
5. Run `npm -C frontend run test -- --run` (targeted to the `ReviseTool` test file first, then the full suite — see the repo's memory note on vitest memory usage: run targeted, `--maxWorkers=1` if running broadly).
6. Live-verify: in the running app, open Revise mode on a chapter, edit a segment's text to exceed ~500 chars with a clear sentence boundary past the midpoint, save, and confirm two segments appear where one did, both audio-invalidated/queued for regeneration. Then repeat with an edit that has no valid sentence boundary (e.g. one giant run-on clause) and confirm the passive badge still appears instead of a split.
7. Update `design-docs/specs/site-shell-and-book-pipeline.md`'s Revise-mode description (if it documents the passive-badge-only behavior) to reflect that a real split now occurs when a valid split point exists — bump `spec_version` + changelog row if the spec's wording changes.
8. Append a changelog-queue entry to `.agent/code-map/queue/`.

## Acceptance criteria

- [ ] `api.splitSegment` added to `frontend/src/api/index.ts`, matching the `FormData`/`parseApiResponse` convention used by `updateSegment`/`generateSegments`.
- [ ] Over-limit commit with a valid split point calls `api.splitSegment` (not `api.updateSegment`) and results in two segments in `ReviseTool`'s rendered list.
- [ ] Both resulting segments are queued via `api.generateSegments` after a real split.
- [ ] Over-limit commit with **no** valid split point is byte-for-byte unchanged from today: single segment persisted via `api.updateSegment`, passive `revise-text-view__long-badge` shown (INV-5 regression pin, verified failing-then-passing).
- [ ] A successful split does not leave the split segment(s) marked in `longSegmentIds`.
- [ ] `api.splitSegment` failure surfaces `saveError` and does not leave `savingId` stuck.
- [ ] No new cross-tool invalidation/broadcast added (confirmed unnecessary — see Current shape).
- [ ] `npm -C frontend run test -- --run` clean.
- [ ] Live-verified in the running app per Steps 6.
- [ ] Relevant spec (`site-shell-and-book-pipeline.md`) updated if its Revise-mode section describes the old passive-only behavior; changelog row added.
- [ ] `.agent/code-map/queue/` changelog entry appended.

## Map links

Part I in `01-map.md` (`Revise: two-way split (frontend wiring)`). Roadmap item 013, Workload 5, milestone M5. Depends on task 012's endpoint existing — do not start against a stubbed/nonexistent route.

## Dependencies

Task 012 (backend split endpoint) must be merged/available first.

## Out of scope

Do not touch `SegmentSplitter.ts`'s algorithm (already correct, already tested). Do not build any new UI component for the split transition — reuse `savingId`'s existing "Saving..." state. Do not add cross-tool (Cast/Booth) segment-state invalidation — verified unnecessary since each tool independently re-fetches on mount and only one tool is ever mounted at a time.
