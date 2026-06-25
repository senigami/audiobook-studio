# Task 004 — Frontend preparing presentation (per-group phase)

**Workstream:** W4  ·  **Depends on:** 003  ·  **Blocks:** none  ·  **Status:** Not started

## Goal
Make the chapter/book UI render the model-load window as **Preparing** (not Working) at **segment granularity**. Implement the LOCKED decision: the **FULL per-group phase model** — a first-class `preparing` phase the UI reads from the existing `reason_code` (`SEGMENT_PENDING` / `LOADING_MODEL`) and `indeterminate` signals — rather than minimal `reason_code` threading. A span/bar with an active segment whose engine is still loading must read **Preparing… / Loading voice model…** with a suspended (cleared) ETA, and only flip to **rendering / Working** once the engine confirms (`START_SEGMENT` or render progress arrives). `QueueItem` inherits the same label via the shared helper.

This task is **frontend-only** and consumes the corrected signals emitted by tasks 001–003 (the backend, per W1–W3, emits the per-group phase / `reason_code` and clears ETA during the load window while keeping durable job `status="running"`). It must not invent a new channel — it threads the signals that already exist end-to-end.

## Why it matters
Today the load window is mispresented in three compounding ways (see `01-map.md` surface **D** and `00-overview.md` Layer 3):
1. A span flips to `rendering` purely on `active_segment_id` **presence**, ignoring `reason_code`. During the ~30–36 s XTTS cold-load window the segment text shows the rendering cursor as if synthesis were underway.
2. There is **no `preparing` tier** in the segment span vocabulary — only `rendering | queued | pending | rendered | idle` — so even if the hook knew the phase, the view could not show it.
3. The segment progress bar is told to render indeterminate but is **hard-labeled "Working…"** and seeded with a synthetic 120 s lane, so it animates a fake countdown during a window where no synthesis is happening.

The backend fix (001–003) makes the load window detectable and suspends its ETA, but without this task the UI still classifies it as rendering/Working — the owner-visible symptom is unfixed. INV-1 (durable status stays monotonic — `running` never regresses) means the **only** way the UI can distinguish preparing from rendering is by reading `reason_code` / `indeterminate`; this task is what makes that read actually drive presentation.

## Files to touch
| File | Current anchor (file:line) | Change |
|---|---|---|
| `frontend/src/pages/Book/studio/useStudioChapter.ts` | `chapterRenderActiveSegmentId` derivation `useStudioChapter.ts:205-207`; `chapterRenderRenderingSegmentIds` `useStudioChapter.ts:234-247`; active job is `generatingSegmentJob \|\| propJob` with `reason_code` available (`useStudioChapter.ts:144`, read off jobs at `:651,:668,:685,:702`) | Derive a `chapterRenderPreparingSegmentIds` set: when the active job's `reason_code` is `SEGMENT_PENDING`/`LOADING_MODEL` (or `indeterminate` truthy), the active segment (and its active batch) belong to **preparing**, not **rendering**. Subtract preparing ids from `chapterRenderRenderingSegmentIds`. Export the new set from the hook return (`:798-804` area). |
| `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` | `ScriptSpanItem` className/`data-render-status` `ScriptView.tsx:123-137`; `renderSpan` status flags `ScriptView.tsx:455-457`; `ScriptSpanItem` props pass-down `ScriptView.tsx:473-499`; group-class builder `ScriptView.tsx:440-449` | Add a `preparing` tier: new `isPreparing` prop + `preparingSpanIds` set; `data-render-status="preparing"` (precedence above `rendering`); distinct `script-span-text-preparing` / `is-preparing` styling; suppress the rendering cursor (`SegmentProgressText` at `:155-157`) while preparing. Thread `preparingSpanIds` from `useStudioChapter`. |
| `frontend/src/store/live-jobs.ts` | `reason_code` already mapped onto the delta (`live-jobs.ts:247`, `:371`); `active_segment_id` mapping `:256-260` | Surface an explicit loading/preparing flag (e.g. `indeterminate` and/or a derived `is_preparing`) onto the overlay delta alongside `reason_code` so the hook branches on a stable field, not ad-hoc string checks scattered in the view. Preserve the existing `reason_code` mapping; do **not** drop `indeterminate` / `loadingElapsedSeconds`. |
| `frontend/src/pages/ChapterEditor/components/ChapterHeader.tsx` | `buildSegmentProgressBarProps({...})` call `ChapterHeader.tsx:561-578` — **does not pass `reasonCode`** | Pass `reasonCode` (from `status.liveSegmentProgressJob?.reason_code` / the selected segment) into `buildSegmentProgressBarProps`, so the existing `SEGMENT_PENDING` guard in `progressBarContracts.ts:43-46` fires and the synthetic 120 s lane is **not** seeded during preparation. |
| `frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers.ts` | `getBusyStatusText(visualState, indeterminate)` hard-labels indeterminate bars `'Working...'` `predictiveProgressBarHelpers.ts:214-219` | Relabel the preparing/indeterminate window **"Preparing… / Loading voice model…"** instead of the universal "Working…". Make the helper generic (take the phase / reasonCode) so `QueueItem.tsx` inherits the same label. (Note: the 120 s synthetic lane lives in `progressBarContracts.ts:46`, gated by the `SEGMENT_PENDING` guard at `:43` — the ChapterHeader change above is what actually wires the guard; no second 120 s site exists in `PredictiveProgressBar/`.) |
| `frontend/src/components/ui/StatusOrb.tsx` *(optional)* | running spinner branch `isTrulyProcessing` `StatusOrb.tsx:55-63,171-175` | Optional: distinct preparing appearance (e.g. dimmed/pulsing rather than the spinning `Loader2`) when the active job is in the preparing phase, so the orb does not imply active synthesis during load. |

## Target shape / contract
- **Signals consumed (preserved, not invented)** — all already defined in `frontend/src/api/contracts/liveEvents.ts`:
  - `reasonCode` / `reason_code`: `SEGMENT_PENDING` (announce-only) and `LOADING_MODEL` (load window). Verified present on `QueueItemPayload` (`liveEvents.ts:84,107`), `JobLifecyclePayload` (`:119,125`), `ChapterProgressPayload` (`:158,174`), `SegmentProgressPayload` (`:205,215`).
  - `indeterminate?: boolean | null` — "in the model-load window … render as indeterminate with 'loading voice model…' label" (`QueueItemPayload` `:97-102`, `ChapterProgressPayload` `:163-170`).
  - `loadingElapsedSeconds?: number | null` — optional elapsed counter (`:103-104`, `:169-170`). Thread through intact; an elapsed counter is optional UI, not required for acceptance.
- **Phase derivation (single source):** `isPreparing := reasonCode ∈ {SEGMENT_PENDING, LOADING_MODEL} || indeterminate === true`. Compute it once (store delta + hook), not re-derived per component.
- **Precedence:** `preparing` outranks `rendering` for a given active segment — an active segment that is preparing is **not** in the rendering set (`useStudioChapter`) and renders `data-render-status="preparing"` (`ScriptView`).
- **Bar contract:** during preparation, `buildSegmentProgressBarProps` receives `reasonCode`, the 120 s lane is suppressed (guard already at `progressBarContracts.ts:43-46`), the bar is indeterminate, ETA is cleared (003 sends null ETA → bar shows no countdown), and the label reads "Preparing… / Loading voice model…".
- **INV-1 / INV-5 hold:** durable `status` stays `running`; the UI reads phase from `reason_code`/`indeterminate` only — it must not require or introduce a `status="preparing"` regression to detect the window. (`status==='preparing'` may still arrive from genuinely preparing jobs and should map to the same presentation; the load window of a *running* job is detected via `reason_code`/`indeterminate`.)

## Steps (ordered)
1. **Store (`live-jobs.ts`):** derive and surface `indeterminate` (and an `is_preparing` convenience flag if cleaner) onto the overlay delta next to the existing `reason_code` mapping (`:247`, `:371`). Keep `loadingElapsedSeconds` flowing through. No change to `active_segment_id` semantics.
2. **Hook (`useStudioChapter.ts`):** add `chapterRenderPreparingSegmentIds` (active segment + active batch when `isPreparing`), and subtract it from `chapterRenderRenderingSegmentIds` (`:234-247`). Export the new set (`:798-804`).
3. **View (`ScriptView.tsx`):** add `preparingSpanIds` prop → per-span `isPreparing`; add the `preparing` tier to `data-render-status` and class logic (`:123-137`), with precedence above rendering; suppress the rendering cursor while preparing (`:155-157`); extend the group-class builder (`:440-449`) and props pass-down (`:473-499`). Wire `preparingSpanIds` from the hook at the ScriptView call site.
4. **Header (`ChapterHeader.tsx`):** pass `reasonCode` into `buildSegmentProgressBarProps` at `:561`.
5. **Bar label (`predictiveProgressBarHelpers.ts`):** change `getBusyStatusText` (`:214-219`) so the preparing/indeterminate case reads "Preparing… / Loading voice model…"; keep it generic so `QueueItem.tsx` inherits it. Verify `QueueItem` picks up the new label without a bespoke branch.
6. **(Optional) `StatusOrb.tsx`:** distinct preparing appearance.
7. **Styles:** add `script-span-text-preparing` / `is-preparing` (and `is-book-preparing` if the book mode needs it) tokens consistent with the existing rendering/queued/pending styling.
8. Run the targeted vitest paths + lint (commands below).

## Tests (TDD — write first)
Write these **before** the implementation; per **R1** each must fail on current code (a preparing-window frame currently classifies the span as `rendering` and the bar shows "Working…").

- **Frame construction (R3):** build socket frames via the types in `frontend/src/api/contracts/liveEvents.ts` and publish through `publishStudioSocketMessage` (`src/store/studioSocketBus.ts:26`). No hand-rolled frame literals. Reference existing patterns in `frontend/tests/unit/pages/ChapterEditor/components/ChapterHeaderProgressContract.test.tsx` and `frontend/tests/unit/hooks/useQueueSync.test.tsx`.
- **Timing (R4):** vitest fake timers / `waitFor`. No `setTimeout(n)` / `sleep(n)` waits.
- **Test files (mirror source under `frontend/tests/`):**
  1. `frontend/tests/unit/pages/Book/studio/useStudioChapter.test.tsx` (existing) — add: a job frame with `active_segment_id=S` + `reason_code='LOADING_MODEL'` (and `indeterminate=true`) puts `S` in `chapterRenderPreparingSegmentIds` and **not** in `chapterRenderRenderingSegmentIds`; a follow-up `START_SEGMENT` frame moves `S` into rendering. (R1: fails today — `S` lands in rendering on presence alone.)
  2. `frontend/tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx` (existing) — add: a preparing span renders `data-render-status="preparing"` with the preparing class and **no** rendering cursor. (R1: fails today — no `preparing` tier exists.)
  3. `frontend/tests/unit/pages/ChapterEditor/components/ChapterHeaderProgressContract.test.tsx` (existing) — add: a `SEGMENT_PENDING`/`LOADING_MODEL` segment frame yields a bar with the "Preparing… / Loading voice model…" label and **no** 120 s seeded lane (assert `reasonCode` reaches `buildSegmentProgressBarProps`). (R1: fails today — `reasonCode` dropped at `ChapterHeader.tsx:561`, bar reads "Working…".)
  4. `frontend/tests/unit/components/progressBarContracts.test.ts` (existing) — assert `buildSegmentProgressBarProps` with `reasonCode='SEGMENT_PENDING'` does not seed `etaSeconds: 120`; with `reasonCode` absent + zero progress it still seeds 120 (guards the existing behavior). Then a `getBusyStatusText` unit asserting the preparing label.
- **Commands:**
  ```bash
  npm -C frontend run test -- --run \
    tests/unit/pages/Book/studio/useStudioChapter.test.tsx \
    tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx \
    tests/unit/pages/ChapterEditor/components/ChapterHeaderProgressContract.test.tsx \
    tests/unit/components/progressBarContracts.test.ts \
    tests/unit/components/PredictiveProgressBarRendering.test.tsx
  npm -C frontend run lint
  ```
  Run targeted (memory safety): single pass `--run`, do not run the whole suite.

## Acceptance criteria
1. During the model-load window (job `reason_code` `SEGMENT_PENDING`/`LOADING_MODEL` or `indeterminate`), the active segment span renders **Preparing** (`data-render-status="preparing"`, distinct styling, no rendering cursor) and is **excluded** from the rendering set.
2. The segment progress bar reads **"Preparing… / Loading voice model…"**, is indeterminate, shows **no** ETA countdown, and is **not** seeded with the synthetic 120 s lane.
3. On engine confirmation (`START_SEGMENT` / real render progress), the span flips to **rendering** and the bar resumes pacing/"Working" from a fresh ETA — re-anchoring cleanly, not snapping from a stale value.
4. `QueueItem` shows the same preparing label via the shared helper (no QueueItem-specific branch).
5. Durable job status presentation never depends on a `running→preparing` regression (INV-1); phase is read from `reason_code`/`indeterminate` only (INV-5: existing signals threaded, none invented).
6. New tests fail on pre-change code (R1 revert-check), build via `liveEvents.ts` types through `publishStudioSocketMessage` (R3), use fake timers/`waitFor` (R4); `npm -C frontend run lint` passes.

## Map links
- `../01-map.md` — surface **D. Preparing presentation** (the authoritative edit list this task implements) and **INV-1 / INV-5** (monotonic durable status; preserve existing live-event signals).
- `../00-overview.md` — Layer 3 (root cause: "running" + uncleared ETA, no per-segment preparing tier); Decisions 1 & 6; Scope ("the frontend change is the FULL per-group phase model").
- `../02-roadmap.md` — **W4** (frontend preparing presentation; depends on W3's emitted signals).
- Contract source of truth: `frontend/src/api/contracts/liveEvents.ts` ↔ `app/api/contracts/events.py` (must agree; R3 tests build frames from the TS types).

## Out of scope
- **Backend** marker resolution, synthesis-only metrics, ETA suspension / null-clear, per-group phase emission — tasks **001–003** (W1–W3). This task only consumes their output.
- **Mixed `ResourceClaim`** cross-job GPU contention — **W5**, owner-gated / deferred (`00-overview.md` Scope).
- **Spec reconciliation** (`live-events.md`, `progress-presentation.md`, `queue-jobs.md`) — W6; update the spec rows alongside whichever code change alters documented behavior, but the spec authorship is tracked separately.
- Inventing any new event field or parallel channel — INV-5 forbids it; thread only `reason_code` / `indeterminate` / `loadingElapsedSeconds`.
- Changing `active_segment_id` semantics in the store or reordering the handoff queue.
