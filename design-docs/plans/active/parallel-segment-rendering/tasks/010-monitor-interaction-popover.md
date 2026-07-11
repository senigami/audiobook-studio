# Task 010 — Per-segment popover + keyboard-reachable detail

Status: pending

Risk: multi-file

## Goal

Add the design doc's Level-4 interaction ("select block → inline popover detail") to `SegmentRenderMonitor`: clicking/tapping a block opens a small popover anchored to it, showing engine, attempt count, elapsed time, reason code, and a retry action for failed/stalled segments — with a keyboard-reachable equivalent so this isn't mouse-only.

## Why this matters

The shipped component is currently 100% static/non-interactive — no click handlers exist at all. This is the design doc's stated Power Controls entry point (per-segment retry, `10-phase2-render-monitor.md:118`) and the natural home for "why is this segment stuck" diagnosis.

## Exact files

- `frontend/src/components/progress/SegmentRenderMonitor/SegmentRenderMonitor.tsx`
- A new popover component (check for an existing popover primitive in this codebase first — `ScriptView.tsx`'s selection-assign popover, `ScriptView.tsx:395-431`, is the closest existing pattern to imitate for anchored-popover behavior; reuse or extend rather than inventing a new one)

## Dependencies

**Depends on task 008** — this needs real per-segment data (engine, retry count) to have anything meaningful to show. Do not build this against the fixture.

## Target shape

- Each block in the `10-60` full-strip mode gets a click/tap handler opening a popover anchored to that block.
- Popover content: segment index, phase, engine id (once 008 lands), elapsed time, `reason_code` (already on the wire type, `ActiveSegmentMapEntry.reason_code`), and — for `failed`/stalled segments — a "Retry" button.
- Retry action: wire to whatever existing per-segment retry mechanism this repo has (check the Activity/GlobalQueue per-job cancel/retry pattern, `GlobalQueue.tsx`, for the closest existing per-item action to imitate — do not invent a new retry API if one exists at the segment level already; if none exists at segment granularity, this task's retry button should be scoped to what's actually wireable today and clearly noted if it's chapter-level retry rather than true per-segment retry).
- **Keyboard equivalent (M6 in `01-map.md` — mandatory, not optional):** since the block field is `aria-hidden`, the popover cannot be the only way to reach retry. Add a "Details"/"Retry" affordance to each row of the existing `SegmentAccessibleTable` (already rendered, `SegmentRenderMonitor.tsx:136-183`) that triggers the same action the popover's button does.

## Steps

1. Confirm task 008 has landed (real segment data available) before starting.
2. Read `ScriptView.tsx:395-431` for the existing anchored-popover pattern in this codebase.
3. Add click/tap handling per block in the full-strip render mode.
4. Build the popover (reuse an existing popover/modal primitive if one exists at `frontend/src/components/` — grep before building a new one).
5. Find the existing per-job cancel action (`GlobalQueue.tsx` or similar) to determine what retry mechanism, if any, exists at segment granularity; wire the Retry button to it, or clearly scope it to what's actually available.
6. Add the table-row "Details"/"Retry" equivalent to `SegmentAccessibleTable`.
7. Verify the popover doesn't interfere with `aria-hidden` semantics (popover itself must NOT be `aria-hidden` when open — only the decorative block field is).

## Acceptance criteria

- [ ] Clicking/tapping a block (10-60 mode) opens a popover with real segment detail.
- [ ] A retry action exists for failed segments, wired to whatever the actual available retry granularity is (documented clearly if it's chapter-level, not segment-level, due to backend constraints).
- [ ] The same detail/retry action is reachable via the accessible table without ever touching the block field (M6) — verified by a keyboard-only interaction test.
- [ ] Popover itself is not `aria-hidden`; only the decorative block field remains so.
- [ ] `npm -C frontend run test -- --run` (render + interaction tests per R4 — no sleep-based timing), lint, build clean.

## Map links

Part L in `01-map.md`'s Phase 2 section. Invariant M6.

## Dependencies

Task 008 (real data).

## Out of scope

Do not build the peek-strip disclosure (011) or the aria-live milestone region (009) here.
