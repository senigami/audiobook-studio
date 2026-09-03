# Task 009 — Milestone `aria-live` region for the render monitor

Status: complete — 2026-07-11

Risk: none

## Goal

Add the spec-required (`progress-presentation.md` §7A, dual-layer a11y rule) milestone-only `aria-live="polite"` announcement region to `SegmentRenderMonitor.tsx` — currently entirely missing.

## Why this matters

This is a real, standalone defect against a binding spec, not a nice-to-have. The design doc (`10-phase2-render-monitor.md:85-93`) and the spec both require: (1) the block field is `aria-hidden` (already true), (2) a parallel `aria-live` region announces MILESTONES ONLY (chapter start, chapter complete, major thresholds like "25 of 60 done") — **never per-segment**, since that would deafen a screen-reader user for the render's duration, (3) the always-present accessible table as the real keyboard surface (already true, `SegmentAccessibleTable`). Item (2) is the one piece not built.

## Exact file

- `frontend/src/components/progress/SegmentRenderMonitor/SegmentRenderMonitor.tsx`

## Current shape (verified)

Grepped the full 299-line file: no `aria-live` attribute anywhere. The block field wrapper has `role="img"` with a summary `aria-label` (recomputed on every render, not announced as a live update) — this is a *static* label, not a live region; a screen reader only reads it when the element receives focus, not when it changes.

## Target shape

A separate, visually-hidden (`sr-only`, matching this repo's existing utility class — do not invent a new one) `<div aria-live="polite" aria-atomic="true">` that receives a NEW text node only at these boundaries, matching the design doc's language exactly:
- Chapter/job start: "Rendering started" (or equivalent).
- Major count thresholds: e.g. "25 of 60 segments done" — pick threshold cadence proportional to total count (e.g. every 25% or every 10 segments, whichever is coarser) so this doesn't itself become a per-segment spam risk at small segment counts.
- Chapter/job complete: "Rendering complete" (or "N segments failed" if applicable).
- Never fires on every individual segment completion.

## Steps

1. Read the full component to find where `charWeightedProgress()`'s aggregate is computed (existing hook point for "what changed") and where phase-degrade branching happens (`FULL_STRIP_MIN`/`SUMMARY_THRESHOLD`).
2. Add local state tracking "last announced milestone" (e.g. last threshold crossed) to avoid re-announcing the same milestone on every re-render.
3. Add the `aria-live="polite"` region, visually hidden, updated only when a new milestone is crossed.
4. Verify with a screen reader (or the project's existing a11y test tooling, `@axe-core/playwright` per this repo's convention) that per-segment progress changes do NOT trigger announcements, only milestones.

## Acceptance criteria

- [x] `aria-live="polite"` region present, visually hidden via the repo's existing `.sr-only`-equivalent pattern (grep for one before inventing).
- [x] Announces: start, major thresholds (proportional to segment count, not literal segment-by-segment), completion (success and failed-segment-count variants).
- [x] Does NOT announce on every individual segment phase change — verify via a test that simulates rapid per-segment updates and asserts the live region's text changes far less often than the segment count.
- [x] Existing `role="img"`/`SegmentAccessibleTable` behavior unchanged.
- [x] `npm -C frontend run test -- --run`, lint, build clean. New test added for the milestone-announcement logic (not sleep-based — use fake timers/direct prop updates per this repo's testing standards).

## Map links

Part K in `01-map.md`'s Phase 2 section. Spec: `progress-presentation.md` §7A dual-layer a11y rule.

## Dependencies

None — fully independent of data-pipeline work (008) or interaction work (010/011).

## Out of scope

Do not touch the block field's `aria-hidden`/`role="img"` treatment or the accessible table — both already correct. Do not add per-segment announcements under any circumstance.
