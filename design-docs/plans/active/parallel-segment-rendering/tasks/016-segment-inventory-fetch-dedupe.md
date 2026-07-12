# Task 016 — `useSegmentInventory` fetch dedupe

Status: pending

Risk: none (single-file, no user-visible contract change)

## Goal

`useSegmentInventory.ts` fetches `GET /chapters/{chapter_id}/script-view` exactly once per `chapterId` (and once more only if `chapterId` itself changes), instead of re-fetching on every `active_segments_map` identity change (which happens roughly once per progress tick, since the object is rebuilt fresh on every websocket job-state update).

## Why this matters

Today the effect's dependency array is `[chapterId, engineId, activeSegmentsMap]` (`useSegmentInventory.ts:81`). `activeSegmentsMap` is `job?.active_segments_map` — a new object reference on every job-state tick — so the whole effect re-runs and re-fetches the static script-view on every tick, even though the script's span list (`data.spans`) never changes mid-render; only the live per-segment progress does. This is currently bounded to at most one hook instance by the Phase 2 `devMode` gate in `ActivityPage.tsx`. Task 015 moves this hook to per-row use (potentially N simultaneous instances for N concurrently-rendering jobs), and any future removal of the `devMode` gate would expose this to all users — so it must be fixed as part of Phase 3, before either of those happens, not deferred.

## Current state (read before starting)

Full current file, `frontend/src/hooks/useSegmentInventory.ts` (85 lines):

```ts
export function useSegmentInventory(job: Job | null | undefined): {
  segments: SegmentRenderMonitorSegment[];
  loading: boolean;
} {
  const [segments, setSegments] = useState<SegmentRenderMonitorSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const chapterId = job?.chapter_id;
  const engineId = job?.engine;
  const activeSegmentsMap = job?.active_segments_map;

  useEffect(() => {
    if (!chapterId) {
      setSegments([]);
      return;
    }

    const myRequestId = ++requestIdRef.current;
    setLoading(true);

    api.fetchScriptView(chapterId)
      .then((data) => {
        if (requestIdRef.current !== myRequestId) return; // stale

        const merged: SegmentRenderMonitorSegment[] = (data.spans || []).map((span) => {
          const liveEntry = activeSegmentsMap?.[span.id];
          if (liveEntry) {
            return {
              id: span.id,
              charCount: liveEntry.char_count ?? span.char_count,
              phase: liveEntry.phase,
              progress: liveEntry.progress,
              engineId: liveEntry.engine_id ?? engineId,
              reasonCode: liveEntry.reason_code,
            };
          }
          const isDone = span.status === 'done';
          return {
            id: span.id,
            charCount: span.char_count,
            phase: isDone ? 'done' : 'preparing',
            progress: isDone ? 1 : 0,
            engineId,
          };
        });

        setSegments(merged);
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setSegments([]);
      })
      .finally(() => {
        if (requestIdRef.current === myRequestId) setLoading(false);
      });
  }, [chapterId, engineId, activeSegmentsMap]); // <-- activeSegmentsMap triggers a refetch on every tick

  return { segments, loading };
}
```

Note the merge logic (the `.map((span) => {...})` block) is what needs to run on every `activeSegmentsMap` change — it's cheap (pure client-side array map, no I/O). Only the `api.fetchScriptView(chapterId)` call itself must NOT re-run on every tick.

## Target shape

Split into two effects:

1. **Fetch effect** — depends only on `[chapterId]`. Fetches `data.spans` once per chapter, stores the raw base spans in a piece of state (e.g. `const [baseSpans, setBaseSpans] = useState<ScriptViewSpan[]>([])`), keeps the existing `requestIdRef` stale-response guard and `loading` state exactly as they are today — this part barely changes.
2. **Merge computation** — a `useMemo` (not a `useEffect`) that depends on `[baseSpans, activeSegmentsMap, engineId]` and produces `segments` by running the exact same `.map(...)` merge logic that exists today, just reading from `baseSpans` state instead of the closure `data` from the fetch's `.then()`. No network call in this step — it's pure computation.

Net effect: `api.fetchScriptView` calls drop from "once per progress tick" to "once per `chapterId`" (i.e., once per chapter render, typically once per chapter open). The returned `segments` value still updates every tick (live progress must keep flowing) — only the network fetch is deduped, not the live merge.

## Steps

1. Add a `ScriptViewSpan`-shaped type for `baseSpans` if one doesn't already exist — check `frontend/src/api/` or `frontend/src/types/index.ts` for whatever type `data.spans` already has (from the `api.fetchScriptView` return type) and reuse it; don't invent a new one.
2. Change the state shape: keep `segments`/`loading` as return values, but introduce internal `baseSpans` state populated only by the fetch effect.
3. Rewrite the fetch effect to depend on `[chapterId]` only, setting `baseSpans` (not `segments`) in the `.then()`. Keep the `requestIdRef` staleness guard unchanged — it still matters for the fetch itself (e.g. rapid chapter switches).
4. Add a `useMemo` computing `segments` from `baseSpans`, `activeSegmentsMap`, `engineId` — move the existing `.map(...)` merge block here verbatim (same per-span logic, same `liveEntry` handling, same `isDone` fallback).
5. On fetch failure, `baseSpans` should reset to `[]` (matching today's `setSegments([])` on catch) — the memo will then naturally produce an empty `segments` array.
6. On `chapterId` becoming falsy, reset `baseSpans` to `[]` (matching today's early-return behavior).

## Acceptance criteria

- [ ] A test (new or added to the existing `useSegmentInventory` test file — check `frontend/tests/unit/hooks/` for one) that: renders the hook with a job, asserts `api.fetchScriptView` was called once; then updates `job.active_segments_map` to a new object reference (same `chapterId`) several times; asserts `api.fetchScriptView` is STILL called only once, but the returned `segments` array's per-span `phase`/`progress` values reflect each updated `active_segments_map`. **This test must fail against the current code before the fix (revert-check per testing-standards.md R1)** — confirm it fails (fetch call count > 1) on the pre-fix hook, then passes after.
- [ ] A second test: `chapterId` changes to a different chapter → `api.fetchScriptView` is called again (once) for the new chapter — dedup must not become "never refetch."
- [ ] Existing `useSegmentInventory` behavior (merge logic, stale-request guard, error-clears-to-empty) is unchanged — no regression in any pre-existing test for this hook.
- [ ] `npm -C frontend run test -- --run`, lint, build all clean.

## Map links

Part R in `01-map.md`'s Phase 3 section. Independent of task 015 technically, but should land in the same phase (see `01-map.md`'s Phase 3 connections: "Q multiplies R's urgency").

## Dependencies

None. Can be implemented and merged independently of task 015, in either order.

## Out of scope

Do not remove the `devMode` gate in `ActivityPage.tsx`/task 015's per-row gate as part of this task — this task only makes that future removal safe, it doesn't perform it. Do not change the hook's public return shape (`{ segments, loading }`) or its `Job | null | undefined` input contract — callers (task 015's per-row `QueueItem.tsx` usage, and any existing caller) must not need changes.
