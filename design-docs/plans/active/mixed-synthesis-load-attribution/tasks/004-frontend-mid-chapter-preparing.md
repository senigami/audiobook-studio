# Task 004 — Frontend mid-chapter preparing render

**Workstream:** W-MIX-LA · **Depends on:** 003 (emits the correctly-attributed frame) · **Blocks:** 007 · **Status:** DONE (2026-06-26) — carrier = `indeterminate` on the segment frame (`build_segment_progress_event` + service.py threading; `reason_code=LOADING_MODEL` is stripped from `segments.progress`, so `indeterminate` is the durable signal); `live-jobs.ts` scope-gate relaxed (R-C). Typecheck + 101 FE / 252 BE tests green.

> Read [`../01-map.md`](../01-map.md) parts **P-E/P-F**, connection **C3**, invariants **INV-1/INV-6**, risk **R-C**. With 003 publishing the correct frame, this ensures the right span actually pulses.

## Goal

Make the mid-chapter XTTS segment render the **"Preparing… / Loading voice model…"** pulse (not the "first letter black, frozen" state) when the orchestrator (003) publishes a `LOADING_MODEL`/indeterminate frame for it. Fix the store scope-gate that drops the segment attribution for non-segment-scoped frames.

## Why it matters

Even with 003 emitting the correct frame, the frontend store currently only updates `active_segment_id` on `scope:'segment'` (`live-jobs.ts:262`), and the preparing-set in `useStudioChapter` is derived from that id — so a chapter/job-scoped load frame won't light the right span. This is the display half of gap (A).

## Files to touch

| File | Anchor | Change |
|------|--------|--------|
| `frontend/src/store/live-jobs.ts` | `:260-269` (scope gate) | Relax with **precise semantics** (R-C): set `active_segment_id` from a frame that carries a concrete `active_segment_id` together with a load signal (`reason_code === 'LOADING_MODEL'` or `indeterminate === true`), even when `scope !== 'segment'`. Never set it from a stale/absent id. Keep the explicit-`null` clear behavior. Mirror the same treatment for `active_segment_progress` only if needed. |
| `frontend/src/pages/Book/studio/useStudioChapter.ts` | `:205-246` | Confirm `chapterRenderActiveSegmentId` → `chapterRenderPreparingSegmentIds` correctly includes the load segment once the store carries it. Adjust if the preparing-set derivation needs the load-segment even when it isn't the "rendering" segment. |
| `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` | `:126-161,457-511` | Verify the `isPreparing` span path wins over `isRendering` for the load segment (so it pulses, not animates a frozen first char). No new state expected — just ensure precedence is correct given the corrected ids. |

## Tests (TDD — write first; R3 contract-shaped frames)

- **Scope-gate fix (R1 revert-check):** publish a `LOADING_MODEL` frame (chapter/job scope) carrying `active_segment_id = seg-2` via `publishStudioSocketMessage` (build the frame from `frontend/src/api/contracts/liveEvents.ts` types — **R3**, no hand-rolled literals). Assert the store's job overlay now has `active_segment_id === seg-2`. Revert-check: on pre-004 code it stays at the previous id.
- **Span renders preparing (the visible fix):** with the store carrying the load frame for seg-2, assert (via the hook/render or `useStudioChapter` output) that seg-2 is in the preparing set / `isPreparing` and **not** in a frozen-rendering state. Revert-check: pre-fix → seg-2 frozen-first-letter (not preparing).
- **No regression (INV-1):** a `scope:'segment'` frame still sets `active_segment_id` as before; a Voxtral-only render shows no preparing span.
- Mock boundary (R2): drive through the real `publishStudioSocketMessage` → store → hook path; do not mock the store or the projector (units under test). No sleeps; use fake timers / `waitFor` (R4).

## Acceptance criteria

- [ ] A `LOADING_MODEL`/indeterminate frame carrying `active_segment_id` updates the store even when not segment-scoped, with the precise semantics above (R-C) — never from a stale/absent id.
- [ ] The correct mid-chapter segment span shows the preparing pulse, not frozen-first-letter.
- [ ] `scope:'segment'` path and Voxtral-only path unregressed (INV-1).
- [ ] Tests use contract-shaped frames via `publishStudioSocketMessage` (R3); R1 revert-checks observed; `eslint` + vitest green.

## Map links

- Parts **P-E** (store), **P-F** (render); connection **C3** (frame contract); invariant **INV-1/6**; risk **R-C** (scope-gate semantics).

## Out of scope

- Backend frame emission → **task 003**. Chapter-level presentation → **task 005**.
