# Task 001 — Mutation-batching collector queue

Status: pending

Risk: quality-sensitive (fixes a known 409-conflict bug class, B2; foundational — 002 and 004 build on its interface)

## Goal

Build `MutationCollector.ts` — an event-collector class that decouples the *optimistic UI commit* of a Cast-mode assignment from the *timing of the network write* — and rewire `useChapterAssignments.ts`'s two handlers (`handleScriptAssign`, `handleScriptAssignRange`) to route through it instead of each firing one immediate, individually-awaited `api.saveScriptAssignments` call.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §5 ("Hard requirements", item 1) and §13's "Mutation batching (B2)" row, this is not optional UX polish: *"This is mandatory — the assignment model cannot ship without it."* It is also load-bearing for two other tasks in this plan (002 brush-size, 004 variation toggle) and for task 014 (render-on-mode-exit) in a later workload, which needs a public `flush()` method to call when the user leaves Cast mode. Build this first — see `01-map.md`'s Connections section.

## Exact files

- **NEW** `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/MutationCollector.ts` — the collector class (this is the only file in that directory besides `index.tsx` today; per design doc §17's file layout this is exactly where it belongs).
- **NEW** `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/CastTool/MutationCollector.test.ts` — direct unit tests of the collector (tests live outside runtime source per this repo's convention; sibling tests for this same tool already exist at `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/CastTool/CastTool.test.tsx`).
- **MODIFY** `frontend/src/hooks/chapter/useChapterAssignments.ts` — rework `handleScriptAssign` (lines 31–79) and `handleScriptAssignRange` (lines 81–115) to route through the collector instead of calling `api.saveScriptAssignments` directly.
- **VERIFY UNCHANGED (do not rewrite)** `frontend/tests/unit/hooks/useChapterAssignments.test.tsx` — this existing B2-regression test asserts that two back-to-back `handleScriptAssign`/`handleScriptAssignRange` calls each resolve with an immediate, individually-observable `api.saveScriptAssignments` call carrying the correct `base_revision_id`. Your rework must keep this test green with **zero edits to it** (see "Target shape" below for why this is achievable).

## Current shape (verified)

- **Nothing exists yet.** Confirmed via search: no `MutationCollector.ts` anywhere in the repo. `CastTool/index.tsx`'s own doc comment (lines 29–31) states plainly: *"Deliberately deferred (see 00-overview.md): brush-size selection, variation toggle, Match Voice, Stage Direction, Performance Cue, mutation-batching."*
- `frontend/src/hooks/chapter/useChapterAssignments.ts`:
  - `handleScriptAssign` (lines 31–79): on call, does one synchronous optimistic `setScriptViewData` update (lines 42–52), then `await`s a single `api.saveScriptAssignments(chapterId, { base_revision_id: latestRevisionIdRef.current, assignments: [{ span_ids, character_id, speaker_profile_name }] })` (lines 54–64), then on success updates `latestRevisionIdRef.current`, `setScriptViewData(result)`, and re-fetches segments (lines 66–70). On a 409 it calls `onConflict()`; on any other error it calls `loadChapter('assignment-error-rollback')` (lines 71–78).
  - `handleScriptAssignRange` (lines 81–115): same shape, but has **no optimistic update** before the await (unlike `handleScriptAssign`) — it goes straight to the awaited `api.saveScriptAssignments` call with a `range_assignments: [...]` array (lines 92–102), same ref/error handling.
  - `latestRevisionIdRef` (lines 19–29): a `useRef<string | null>` kept in sync with `scriptViewData?.base_revision_id` via a no-dep-condition `useEffect`. Comment at lines 19–23 explicitly frames this as *"the fix for B2"* for **stale-revision-id 409s on rapid sequential immediate calls** — it does not batch anything; it only makes each individual immediate call use a fresh revision id. Keep this ref pattern; the collector needs read access to the current revision id.
- **The call sites that will route through the new collector:** `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` calls `handleScriptAssign` at lines 344–349 (`onAssign`) and 356–361 (`onAssignToCharacter`), and `handleScriptAssignRange` at lines 350–355 (`onAssignRange`). These call sites do **not** change in this task — only what happens *inside* `useChapterAssignments.ts`'s two handlers changes.
- **No drag-paint gesture exists in the codebase today.** `ScriptView.tsx`'s span click (lines 149–156) is a single discrete `onClick`, not a mousedown-drag-across-spans gesture; there is no "held drag fires many assignment events" call site yet (that would come from a future brush-paint drag, not built in this plan's current scope). This means the ~120ms drag-throttle path in the collector has no live caller yet — it must still be built correctly and unit-tested directly (see Steps), because task 002's brush-size work and any future paint-drag work will be the first real consumers.
- Backend contract (`frontend/src/types/index.ts:162–166`, `ScriptAssignmentsUpdate`): `{ assignments: ScriptAssignment[]; range_assignments?: ScriptRangeAssignment[]; base_revision_id: string | null }` — `assignments` and `range_assignments` are already **arrays**. Batching N discrete assignment events into ONE HTTP call is just populating these arrays with N entries instead of calling the endpoint N times — no backend/contract change needed for this task.
- `api.saveScriptAssignments` (`frontend/src/api/index.ts:186–201`): `PUT /api/chapters/{chapterId}/script-view/assignments`; on HTTP 409 it throws an `Error` with `.status = 409` and `.expected_base_revision_id`/`.base_revision_id` attached — this is exactly the shape `handleScriptAssign`/`handleScriptAssignRange`'s existing `catch` blocks already branch on.

## Target shape

A `MutationCollector` class with two enqueue methods (one per assignment kind) and one public `flush()` — the exact method task 014 (a later, different task) will call on Cast mode-exit. Each enqueue call performs its optimistic UI update **synchronously and immediately** (so painting still feels instant), then pushes onto an internal queue and schedules a flush. Critically: **every existing call site in this task is a discrete, self-contained gesture (one click = one gesture-end)**, so `handleScriptAssign`/`handleScriptAssignRange` must enqueue *and then immediately await `flush()`* — this preserves today's exact network timing (one call per click, immediately awaited) so the existing `useChapterAssignments.test.tsx` needs no changes. The ~120ms throttle only matters for a *future* caller that enqueues multiple times without calling `flush()` in between (a held drag) — build and test that path, but nothing in this task drives it yet.

```ts
// frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/MutationCollector.ts
import { api } from '@/api';
import type { ScriptAssignment, ScriptRangeAssignment, ScriptViewResponse } from '@/types';

export interface MutationCollectorCallbacks {
  /** Read the latest known base_revision_id (mirrors useChapterAssignments's latestRevisionIdRef). */
  getRevisionId: () => string | null;
  onFlushSuccess: (result: ScriptViewResponse) => void;
  onConflict: () => void;
  onError: (error: unknown) => void;
}

const DEFAULT_FLUSH_INTERVAL_MS = 120; // per chapter-editor-modes.md §5/§13: "~120ms for held drags"

export class MutationCollector {
  private queueAssignments: ScriptAssignment[] = [];
  private queueRangeAssignments: ScriptRangeAssignment[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private chapterId: string,
    private callbacks: MutationCollectorCallbacks,
    private flushIntervalMs: number = DEFAULT_FLUSH_INTERVAL_MS,
  ) {}

  /** Call every render with fresh chapterId/callbacks so closures never go stale
   *  (same reasoning as useChapterAssignments's existing latestRevisionIdRef pattern) —
   *  keeps this one collector instance stable across re-renders instead of recreating
   *  it (and losing any in-flight queue) on every render. */
  configure(chapterId: string, callbacks: MutationCollectorCallbacks) {
    this.chapterId = chapterId;
    this.callbacks = callbacks;
  }

  enqueueAssign(spanIds: string[], characterId: string | null, profileName: string | null) {
    this.queueAssignments.push({ span_ids: spanIds, character_id: characterId, speaker_profile_name: profileName });
    this.scheduleFlush();
  }

  enqueueRangeAssign(range: ScriptRangeAssignment) {
    this.queueRangeAssignments.push(range);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return; // a flush is already pending; it will pick up this entry too
    this.flushTimer = setTimeout(() => { void this.flush(); }, this.flushIntervalMs);
  }

  /** Flushes the queue as ONE batched write. No-op on an empty queue. Public: gesture-end
   *  call sites (this task) and task 014's render-on-mode-exit hook (a later task) both
   *  call this directly to force an immediate flush instead of waiting for the timer. */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queueAssignments.length === 0 && this.queueRangeAssignments.length === 0) return;

    const assignments = this.queueAssignments;
    const rangeAssignments = this.queueRangeAssignments;
    this.queueAssignments = [];
    this.queueRangeAssignments = [];

    try {
      const result = await api.saveScriptAssignments(this.chapterId, {
        base_revision_id: this.callbacks.getRevisionId(),
        assignments,
        range_assignments: rangeAssignments,
      });
      this.callbacks.onFlushSuccess(result);
    } catch (e: any) {
      if (e?.status === 409) {
        this.callbacks.onConflict();
      } else {
        this.callbacks.onError(e);
      }
    }
  }
}
```

`useChapterAssignments.ts` then becomes (illustrative — keep every existing optimistic-update and `setSegments`/`loadChapter` behavior byte-identical, just move the network call behind the collector):

```ts
const collectorRef = useRef<MutationCollector | null>(null);
if (!collectorRef.current) {
  collectorRef.current = new MutationCollector(chapterId, buildCallbacks());
}
useEffect(() => {
  collectorRef.current!.configure(chapterId, buildCallbacks());
}); // no dep array — refresh callbacks every render, same idiom as latestRevisionIdRef

function buildCallbacks(): MutationCollectorCallbacks {
  return {
    getRevisionId: () => latestRevisionIdRef.current,
    onFlushSuccess: (result) => {
      latestRevisionIdRef.current = result.base_revision_id;
      setScriptViewData(result);
      api.fetchSegments(chapterId).then(setSegments);
    },
    onConflict: () => onConflictCallbackRef.current?.(),
    onError: (e) => { console.error('Script assignment failed', e); loadChapter('assignment-error-rollback'); },
  };
}
```

`handleScriptAssign` keeps its existing synchronous optimistic `setScriptViewData` block (lines 42–52) unchanged, then calls `collectorRef.current!.enqueueAssign(spanIds, characterId, profileName)` followed by `await collectorRef.current!.flush()` instead of the current inline `await api.saveScriptAssignments(...)` block. `handleScriptAssignRange` does the same with `enqueueRangeAssign`. Because each `onConflict` callback is per-call (passed as a function argument, not fixed at construction), stash it in a ref (`onConflictCallbackRef`) set at the top of each handler before enqueuing, exactly as `latestRevisionIdRef` already demonstrates the "ref for cross-closure freshness" pattern in this file.

## Steps (ordered, concrete)

1. Write `MutationCollector.ts` per the target shape above (adjust only if TypeScript strictness in this repo demands it — check `tsc -b` cleanliness at the end).
2. Write `MutationCollector.test.ts` covering, using vitest fake timers (`vi.useFakeTimers()`) and mocking only `@/api` (R2 — mock the network boundary, not the collector itself):
   - `enqueueAssign` + immediate `flush()` → exactly one `api.saveScriptAssignments` call with one entry in `assignments`.
   - Two `enqueueAssign` calls with **no** `flush()` in between, then advancing fake timers by `flushIntervalMs` → exactly one `api.saveScriptAssignments` call with **two** entries in `assignments` (the batching behavior itself).
   - `enqueueRangeAssign` populates `range_assignments`, not `assignments`.
   - A 409 response calls `onConflict`, not `onError`.
   - A non-409 rejection calls `onError`, not `onConflict`.
   - `flush()` on an empty queue does not call `api.saveScriptAssignments` at all.
3. Rework `useChapterAssignments.ts`'s `handleScriptAssign` and `handleScriptAssignRange` per the target shape — keep every existing optimistic-update line, error-branch, and `setSegments`/`loadChapter` call exactly as today; only the "how does the write actually reach the network" mechanism changes.
4. Run `npm -C frontend run test -- --run useChapterAssignments` and confirm the **existing, unmodified** `frontend/tests/unit/hooks/useChapterAssignments.test.tsx` still passes with zero edits — this is your proof the rework is behavior-preserving for today's discrete-click call pattern.
5. Run `npm -C frontend run test -- --run MutationCollector` for the new suite.
6. Run `npm -C frontend run lint` and `npm -C frontend run build` (or `tsc -b`) on the touched files.
7. Append a changelog-queue entry to `.agent/code-map/queue/` per this repo's code-map convention (new file + two modified files).

## Acceptance criteria

- [ ] `MutationCollector.ts` exists at the exact path above, exports the class shown (or an equivalent with the same public method names — `enqueueAssign`, `enqueueRangeAssign`, `flush`, `configure` — since task 014 will call `flush()` by name later).
- [ ] `MutationCollector.test.ts` passes and includes, at minimum, the six cases listed in Step 2.
- [ ] `useChapterAssignments.ts`'s two handlers route every write through the collector; no direct `api.saveScriptAssignments` call remains inside either handler.
- [ ] `frontend/tests/unit/hooks/useChapterAssignments.test.tsx` passes **unmodified** (this proves no regression in the existing B2 revision-id fix or the 409/onConflict path).
- [ ] A rapid-fire scenario (two `enqueueAssign` calls before any flush) produces exactly one network call, not two — verified by a real test, not asserted by inspection.
- [ ] `npm -C frontend run lint` and `npm -C frontend run test -- --run` (full suite) both clean.
- [ ] `.agent/code-map/queue/` has a new entry for this change.

## Map links

Part A in `01-map.md`. Invariants: none new (this task doesn't touch data model). Risk: none of R-A..R-E apply directly, but see roadmap's risk-flag table row 001 ("quality-sensitive — fixes a known 409-conflict bug class (B2); foundational for 002/004").

## Dependencies

None. This is the foundation task (Workload 1) — 002 and 004 depend on it; 003 is independent.

## Out of scope

- Do not wire `flush()` into any mode-switch/mode-exit handler — that is task 014 (Workload 6), a separate task with its own console-shell architecture work (R-C: `onModeExit` has zero runtime hook today).
- Do not build a drag-paint gesture (mousedown + drag-across-spans firing repeated `enqueueAssign` calls) — no such UI exists yet; that arrives with brush-drag painting, which is not part of task 002's Word/Sentence/Paragraph *click* interactions either. This task only needs the throttle path to be correct and unit-tested in isolation.
- Do not change the `ScriptAssignmentsUpdate`/`ScriptAssignment`/`ScriptRangeAssignment` backend contract — the existing array shape already supports batching.
