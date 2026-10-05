# Phase 3 — Multi-job render-monitor rows

Status: planned — 2026-07-12

## Why this phase exists

Phase 2 (tasks 008-014, complete 2026-07-11) built a real, live segment render monitor — but scoped to exactly **one** active job at a time. `ActivityPage.tsx` picks the first match via `Object.values(jobs).find(...)` and renders a single page-level `SegmentPeekStrip`/`SegmentRenderMonitor` pair driven by that one job's `useSegmentInventory` call.

Review sign-off on Phase 2 (2026-07-11) found this doesn't deliver the owner's actual stated intent for this session: *"if I had 2 chapters rendering at the same time... I would have a strip underneath each progress bar"* — i.e. every concurrently-rendering chapter gets its own inline strip, not a single global one. This matches the North Star demo (`frontend/src/demo/stages/siteMockup/SegmentRenderStrip.tsx`), whose own header comment states the strip sits "BENEATH the chapter's aggregate progress bar (additive, not a replacement)" — implicitly per-row, not per-page.

Phase 3 closes that gap: every `QueueItem` row for a concurrently-rendering job gets its own monitor/peek-strip, hydrated by its own `useSegmentInventory` call. It also fixes a perf issue flagged in the same review pass: `useSegmentInventory`'s effect re-fetches `GET /script-view` on every `active_segments_map` identity change (~once per progress tick), which is fine bounded by the Phase 2 `devMode` gate but must not survive that gate coming off.

## Scope

- Task **015**: move the monitor/peek-strip from `ActivityPage.tsx` page-singleton into `QueueItem.tsx` per-row, so N concurrently-rendering jobs each get their own strip.
- Task **016**: fix `useSegmentInventory`'s refetch-per-tick — fetch `script-view` once per `chapterId`, merge the live `active_segments_map` client-side instead of retriggering the network call.

## Out of scope (this phase)

- Removing the `devMode` gate itself — that's a separate decision, not part of this phase. Task 016 is a prerequisite for removing it later, not the removal.
- Any change to `SegmentPeekStrip`/`SegmentRenderMonitor`/`SegmentBlockRow` internals — both components already take generic `segments`/`activeCount`/callback props with no page-singleton assumption baked in (confirmed by reading their prop interfaces), so Phase 3 reuses them as-is, just instantiated once per row instead of once per page.
- `pendingJobs`/history rows in `GlobalQueue.tsx` — only `activeJobs` rows (the ones actually rendering) get a strip.

## Map links

Extends Part M (Phase 2 render monitor) in `01-map.md` — see Phase 3 addendum at the bottom of that file.
