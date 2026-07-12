# Task 011 — Peek-strip progressive disclosure

Status: complete — 2026-07-11 (light/dark visual verification below still pending owner)

Risk: multi-file

## Goal

Build the design doc's missing Level-2 UI: a narrow "peek strip" that auto-appears when N≥2 segments are concurrently active, showing a condensed block row below the chapter header, dismissible, and expandable into the full `SegmentRenderMonitor` field (Level 3, already built).

## Why this matters

Today the shipped component is all-or-nothing: either the full block field renders (dev-gated) or nothing does. The actual design is a 4-level ladder (default bar → peek strip → full field → popover) — the peek strip (level 2) is the one rung that doesn't exist, so there's no progressive path from "plain bar" to "full field" for a real user.

## Dependencies

**Depends on task 008** (real segment data) — building this against the fixture would need rework.

## Target shape (per `10-phase2-render-monitor.md:33-43`, Q4's resolution)

- Auto-appears when ≥2 segments are concurrently active for the currently-viewed job (per this session's Q4 recommendation: auto-appear, not opt-in-only, since the whole point is making parallelism visible; users who don't care can dismiss it).
- A narrow (a few px tall) condensed block row — reuse the same char-weighted block rendering as the full field, just visually condensed (do not build a second encoding).
- Clicking/tapping the peek strip expands it inline to the full `SegmentRenderMonitor` field — no navigation, no modal.
- Dismissible back to the plain default bar; the dismissal should persist (a lightweight per-session or localStorage flag, not a permanent settings toggle) but re-surface if new information appears (e.g., a failure) per this session's Q4 recommendation — do not silently suppress a failure indication because of an earlier dismiss.

## Steps

1. Confirm task 008 has landed.
2. Determine where in `ActivityPage.tsx` (or wherever the per-job card renders) the concurrently-active-segment count for a job is available (should already be derivable from the real segment inventory task 008 built).
3. Build a condensed strip variant — reuse `SegmentRenderMonitor`'s block-rendering logic at a smaller scale rather than duplicating it (consider extracting a shared `SegmentBlockRow` sub-component both the peek strip and the full field render, to avoid two implementations of the same encoding).
4. Wire the auto-appear threshold (N≥2) and the dismiss/expand interaction.
5. Persist the dismiss state (check for an existing localStorage-preference pattern in this codebase, e.g. the Wave-toggle preference on the player bar, and match it) and the re-surface-on-new-information rule (a failure appearing should override a prior dismiss).

## Acceptance criteria

- [x] Peek strip auto-appears when a job has ≥2 concurrently active segments.
- [x] Expands inline to the full block field on click/tap — no navigation away from the current page.
- [x] Dismiss persists across the session/reload (localStorage, matching `railState.ts`'s pattern) but does not suppress failure information — a segment failure re-surfaces the strip even after a prior dismiss.
- [x] No second implementation of the block-encoding logic — extracted shared `SegmentBlockRow`, used by both the peek strip and the full field.
- [x] `npm -C frontend run test -- --run` (28 new/updated tests + 17 pre-existing SegmentRenderMonitor tests, all pass), lint, build clean.
  - [ ] **Not yet done — requires a browser.** Light/dark mode visual verification (code uses only existing `var(--*)` tokens, no hardcoded colors, so it should theme correctly, but not visually confirmed).

## Map links

Part M in `01-map.md`'s Phase 2 section.

## Dependencies

Task 008.

## Out of scope

Do not build the popover (010) here. Do not add a numeric-threshold settings control for the auto-appear trigger — N≥2 is the decided default per this plan's research; revisit only if the owner asks for it later.
