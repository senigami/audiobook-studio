# Task 015 — Multi-job render-monitor rows

Status: complete — 2026-07-12

Risk: multi-file

## Goal

Every concurrently-rendering job in `GlobalQueue.tsx`'s `activeJobs` section gets its own `SegmentPeekStrip`/`SegmentRenderMonitor` pair, mounted per-row inside `QueueItem.tsx`, instead of `ActivityPage.tsx` showing at most one page-level strip for the first active job it finds.

## Why this matters

Today `ActivityPage.tsx:54-60` picks a single `activeJob` via `Object.values(jobs).find(...)` and renders one `SegmentPeekStrip`/`SegmentRenderMonitor` at page level driven by that job alone. If 2+ chapters render concurrently, only the first one found (order is whatever `Object.values` returns, not deterministic) gets a strip — the others show only their plain `PredictiveProgressBar`, no segment detail. This is the exact intent the owner stated this session ("if I had 2 chapters rendering at the same time... I would have a strip underneath each progress bar") and which the Phase 2 sign-off confirmed was NOT delivered by tasks 008-011 despite their comments implying it would be handled by "010/011" (it wasn't — see the stale comment fix below).

## Current state (read before starting)

**`frontend/src/pages/Activity/ActivityPage.tsx`** — lines 54-61:
```js
// W-PAR task 008: the currently-active chapter render job (first match) —
// real segment inventory hydration is scoped to one active job at a time;
// the popover/peek-strip UI for choosing among several is a later task
// (010/011), out of scope here.
const activeJob = useMemo(() => (
  Object.values(jobs).find((j) => ACTIVE_STATUSES.has(j.status) && !!j.chapter_id) ?? null
), [jobs]);
const { segments: inventorySegments } = useSegmentInventory(devMode ? activeJob : null);
```
`ACTIVE_STATUSES` (line 21): `new Set(['queued', 'preparing', 'running', 'finalizing'])`.

Strip rendering (lines 165-183) — `SegmentPeekStrip`/`SegmentRenderMonitor` mounted once, driven by `inventorySegments` from that single `activeJob`.

**`frontend/src/components/queue/GlobalQueue.tsx`** — `activeJobs` render (lines 329-342):
```jsx
{activeJobs.map(job => (
  <QueueItem
    key={job.id}
    job={job}
    liveJob={jobs[job.id]}
    ...
  />
))}
```
Each row is already keyed by stable `job.id`, and `liveJob={jobs[job.id]}` gives `QueueItem` per-row access to that job's own `Job` object (including `chapter_id`, `active_segments_map`).

**`frontend/src/components/queue/QueueItem.tsx`** (556 lines) — props (lines 12-22):
```ts
interface QueueItemProps {
    job: ProcessingQueueItem;
    liveJob?: Job;
    localPaused: boolean;
    formatJobTitle: (job: any) => string;
    formatTime: (ts: number | null | undefined) => string;
    onRemove: (id: string) => void;
    compact?: boolean;
    engines?: import('@/types').TtsEngine[];
    onVisualPendingChange?: (jobId: string, pending: boolean) => void;
}
```
`PredictiveProgressBar` render is at lines 521-552, inside a `flex:1` container closing at line 553. No `ACTIVE_STATUSES`-equivalent import — status checks are inlined, e.g. line 41: `const isTrulyActive = ['preparing', 'running', 'processing', 'finalizing'].includes(status);` (note: includes `'processing'`, which `ACTIVE_STATUSES` does not — reconcile this, see step 3).

**Component contracts (reuse as-is, no modification needed):**

`SegmentPeekStripProps` (`frontend/src/components/progress/SegmentRenderMonitor/SegmentPeekStrip.tsx:15-21`):
```ts
export interface SegmentPeekStripProps {
  segments: SegmentRenderMonitorSegment[];
  activeCount: number;
  onExpand: () => void;
  onDismiss: () => void;
}
```

`SegmentRenderMonitorProps` (`frontend/src/components/progress/SegmentRenderMonitor/SegmentRenderMonitor.tsx:39-51`):
```ts
export interface SegmentRenderMonitorProps {
  segments: SegmentRenderMonitorSegment[];
  cap: number;
  onRetry?: (segmentId: string) => void;
}
```
`SegmentRenderMonitor` internally gates on `segments.length < 10` returning `null` — no page-level gating needed.

`useSegmentInventory(job: Job | null | undefined)` (`frontend/src/hooks/useSegmentInventory.ts`) takes a single `Job`, no page context — safe to call once per row.

## Steps

1. In `QueueItem.tsx`: import `useSegmentInventory`, `SegmentPeekStrip`, `SegmentRenderMonitor`, and the peek/expand/dismiss local state (`useState<'peek'|'full'|'dismissed'>`, mirroring whatever local state `ActivityPage.tsx` currently owns for this — read `ActivityPage.tsx`'s full peek/expand handler logic, e.g. `handlePeekExpand`/`handlePeekDismiss`/`showPeekStrip`/`showFullMonitor`, before reimplementing; move that state and those handlers into `QueueItem.tsx`, scoped per-row).
2. Call `useSegmentInventory(liveJob ?? null)` inside `QueueItem` (not gated by a page-level `devMode ? activeJob : null` pattern — confirm whether the `devMode` gate needs to move into `QueueItem` too, or whether it should gate the whole feature at a higher level; if `devMode` is a settings/context value already reachable via a hook, call that hook directly in `QueueItem` rather than threading it through as a new prop).
3. Determine this row's "is this job actively rendering with segments" gate. Reconcile `QueueItem`'s existing `isTrulyActive` (includes `'processing'`) against `ActivityPage.tsx`'s `ACTIVE_STATUSES` (does not include `'processing'`) — pick one canonical set (recommend: export `ACTIVE_STATUSES` from a shared location, e.g. `frontend/src/utils/jobStatus.ts` or similar existing status-utils file if one exists, and have both `QueueItem.tsx` and `ActivityPage.tsx` import it) so the strip's gating condition matches whatever `ACTIVE_STATUSES` already means elsewhere in the codebase. Do not invent a third status set.
4. Mount `SegmentPeekStrip`/`SegmentRenderMonitor` directly after the `PredictiveProgressBar` closing (`QueueItem.tsx` line 553), inside the same `flex:1` container — same insertion point the North Star (`SegmentRenderStrip.tsx`) header comment describes ("BENEATH the chapter's aggregate progress bar (additive, not a replacement)").
5. Wire retry: `SegmentRenderMonitor`'s `onRetry` callback should call the same `api.generateSegments([segmentId])` path task 010 wired in `ActivityPage.tsx` — move/duplicate that handler into `QueueItem.tsx` scoped to this row's job.
6. Remove the now-dead page-level `activeJob`/`inventorySegments`/strip-rendering code from `ActivityPage.tsx` (lines 54-61 and 165-183, plus any peek/expand state that moved to `QueueItem.tsx`). If `ActivityPage.tsx` renders `GlobalQueue`/its own job list directly rather than delegating, confirm this removal doesn't orphan other logic that depended on `activeJob`.
7. **Fix the stale comment.** Replace the comment at `ActivityPage.tsx:54-57` (quoted above) — it falsely claims 010/011 handle "choosing among several" jobs. Since this task is what actually adds that, either delete the comment (the code now speaks for itself once per-row rendering lands) or replace it with an accurate one-liner noting Phase 3/task 015 moved multi-job rendering into `QueueItem.tsx`.
8. Add/update tests: a `QueueItem.test.tsx` (or extend the existing test file for it, if one exists — check `frontend/tests/unit/components/queue/`) covering: (a) two simultaneously-active jobs each render their own strip with their own segment data (no cross-contamination), (b) a job below the `ACTIVE_STATUSES`/gate threshold renders no strip, (c) retry on one row's segment doesn't affect another row. Per testing-standards.md R2, mock only the network boundary (`api.fetchScriptView`, `api.generateSegments`), not `useSegmentInventory` itself or `QueueItem`'s own state.

## Acceptance criteria

- [x] Two or more concurrently-rendering jobs each show their own `SegmentPeekStrip`/`SegmentRenderMonitor`, independently hydrated (verify via a test asserting distinct `segments` per row, not a shared reference). See `frontend/tests/unit/components/queue/QueueItemSegmentMonitor.test.tsx`.
- [x] A job not in the active-status set renders no strip.
- [x] Retry action on one row's segment does not affect any other row's state.
- [x] The stale "010/011 handle choosing among several" comment in `ActivityPage.tsx` is removed or corrected.
- [x] `isTrulyActive`/`ACTIVE_STATUSES` reconciled to one canonical status set — `ACTIVE_STATUSES` now lives in `frontend/src/utils/jobStatus.ts` and is imported by `QueueItem.tsx`'s strip-gating condition. `isTrulyActive` itself was left as-is (it feeds ETA/progress selection elsewhere in `QueueItem.tsx`, not the strip gate — reconciling every other use was out of this task's scope per its own step 3 wording).
- [x] `npm -C frontend run test -- --run`, `npm -C frontend run lint`, `npm -C frontend run build` all clean.
- [ ] 👁 **Owner visual check (non-blocking, cannot be verified without a browser):** two chapters rendering simultaneously actually show two independent strips in the real UI, light and dark theme.

## Implementation notes (2026-07-12)

- Moved the segment-inventory hook call, peek/expand/dismiss local state, and the `SegmentPeekStrip`/`SegmentRenderMonitor` mount from `ActivityPage.tsx` into `QueueItem.tsx`, scoped per-row via `liveJob`/`job.id`. `GlobalQueue.tsx` now passes `onRefresh` through to each `QueueItem` so per-row retry can re-pull job state.
- Added `frontend/src/utils/jobStatus.ts` exporting the canonical `ACTIVE_STATUSES` set, imported by `QueueItem.tsx` for the strip's gating condition.
- `ActivityPage.tsx`'s stale comment claiming tasks 010/011 already handled "choosing among several" jobs was removed and replaced with an accurate pointer to `QueueItem.tsx`.
- `frontend/tests/unit/pages/Activity/ActivityPagePeekStrip.test.tsx` was moved to `frontend/tests/unit/components/queue/QueueItemPeekStrip.test.tsx` (same single-row peek/expand/dismiss/re-surface scenarios, now exercising `QueueItem` directly since that's where the behavior lives).
- New `frontend/tests/unit/components/queue/QueueItemSegmentMonitor.test.tsx` covers the actual multi-job fix: two concurrently-active jobs each get an independent strip/monitor with no cross-contamination on retry, and a non-active-status job renders neither. Revert-checked: these tests fail against the pre-fix code (only one row's strip/monitor rendered; the second row had no retry button since `QueueItem` had no segment-monitor code at all).

## Map links

Part Q in `01-map.md`'s Phase 3 section. Depends on Part J (Phase 2 real hydration, already shipped).

## Dependencies

None outstanding — Phase 2 (tasks 008-014) is complete and this task reuses its components unmodified.

## Out of scope

Do not modify `SegmentPeekStrip`, `SegmentRenderMonitor`, or `SegmentBlockRow` internals — their prop interfaces are already generic enough for per-row use. Do not add strips to `pendingJobs`/history rows. Do not remove the `devMode` gate as part of this task (see task 016's out-of-scope note — that's a separate future decision). Do not fold task 016's fetch-dedupe fix into this task's diff — land them as separate reviewable changes even though both are part of Phase 3.
