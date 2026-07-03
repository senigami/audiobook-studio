# Task 006 — Frontend multi-active segments

**Workstream:** W-PAR  ·  **Depends on:** 003 (emits per-segment multi-active signal)  ·  **Blocks:** 007  ·  **Status:** Done (2026-07-02, frontend wire + hook only; consumes 003 when it lands)

## Goal

Generalize the frontend live-progress from ONE active segment to a SET of simultaneously-active segments, each with its own progress, so the EXISTING per-segment bars (gray→black text + per-segment progress) light up in parallel. No new visualizer here — that is Phase 2 ([10-phase2-render-monitor.md](../10-phase2-render-monitor.md)). No new wire channel (INV-9) — thread an existing chapter-level `active_segments_map` end-to-end via the SAME two-layer pattern W-MIX W4 established.

This task is **frontend-only** and consumes the `active_segments_map` that task 003 (per-segment dispatch isolation) adds to the chapter job event. The existing per-segment progress UI (gray→black text + per-segment bars, generalized in W-MIX W4) already animates per segment — with a parallel backend, multiple light up at once with no new visualizer required.

## Why it matters

Today `useStudioChapter` tracks exactly **one** `chapterRenderActiveSegmentId`. When multiple segments render concurrently (Phase 1 enabled), only the last-emitted segment ID wins — all other in-flight segments display as if idle. The user sees a single bar animating while the chapter renders in parallel, which is both misleading and wastes the existing per-segment progress machinery.

The two-layer wire gap from W-MIX W4 is the central technical lesson here: a field added to the store type but not extracted in `jobEventAdapters.ts` AND not whitelisted in `queueOverlayFields.ts` AND not merged in `hydration/index.ts` is dead at runtime — it never reaches the hook. This exact gap bit W4 for `reason_code`/`indeterminate`. This task must not repeat it.

## Architecture decision — captured from owner discussion (2026-06-26)

> This section captures a design conversation and is the authoritative intent for *how* to build the below. Read it first; where the Files/Target sections sketch a bare `{progress, eta_seconds, reason_code}` entry, this supersedes it (the entry carries a full lifecycle, including the preparing/load phase).

**Confirmed current model (what we have).** Verified 2026-06-26 against the code: the live-render path is **single-active by construction.** The store (`frontend/src/store/live-jobs.ts`) is keyed by **jobId** — `eventsById: Record<jobId, OverlayDelta>` — and each job overlay holds a **single `active_segment_id`**. `useStudioChapter` derives the preparing/rendering **Sets from that one id** (`chapterRenderPreparingSegmentIds = new Set([chapterRenderActiveSegmentId])` + its batch) and passes Sets down as props to `ScriptView`. There is **no per-segment store entry and no per-segment selector subscription** (`grep active_segments_map` → nothing; `useSyncExternalStore` is used only for unrelated stores — annotations/bookmarks/player). Two segments physically cannot light up at once today.

**Target model (what to build here): normalized, segment-keyed — not job-keyed-with-one-active-id.**
- Store carries `active_segments_map` keyed by **`segmentId`**, each entry a full **per-segment lifecycle**, e.g. `{ phase: 'preparing' | 'rendering' | 'done', progress, eta_seconds, reason_code?, indeterminate? }` — **not just a progress number.** The **preparing/load state is part of the entry** (see W-MIX-LA load attribution: a segment enters `preparing` during its model-load window *before* it renders). Keep the singular `active_segment_id` only as the cap=1 fallback during migration.
- Each span subscribes to **its own segment's slice** (a per-segment selector / `useSyncExternalStore`, or the rAF-coalesced module-store subscription specified in the Performance Contract below) so a segment re-renders only on **its own** updates and N segments animate independently. This is the efficiency property the owner asked for: the coordinator **routes once** into the keyed map; fan-out to components is per-segment, *not* "re-derive every span's Set on every event."

**Rejected alternative (owner proposal, discussed and declined): "each segment component becomes its own event-bus listener"** — spawn a listener on segment-start, self-watch its own indicator until done, then stop. The *intuition* (localize per-segment work; the coordinator only spawns listeners) is correct and is what the target model delivers — but the *mechanism* is wrong:
- It's **one multiplexed websocket**, not a channel-per-segment. Every component would filter the full stream → **O(events × components)** work — *more* total work than a single keyed ingest, not less.
- **Lifecycle races** (a late `SEGMENT_SAVED` after unmount, reconnect/replay, out-of-order frames) are hard to handle in ephemeral per-component socket subscriptions and trivial in a store.
- It **loses the single source of truth** and the contract-shaped testability (R3 tests publish one frame and assert store state; per-component listeners fragment that).
- The same localized-efficiency win is achieved correctly by **normalized store + granular per-segment selectors**: route once, re-render only the changed segment's component.

**Launch-trigger gotcha.** Do **not** key a segment's active/preparing state off the worker's `START_SEGMENT` — the **preparing / model-load window precedes `START_SEGMENT`** (the whole point of W-MIX-LA). The per-segment entry must flip `preparing` on the load signal → `rendering` on start → `done` on save. A component that only reacts to start would miss the pulse we built.

**Cross-dependency on 003.** For this to have data, **task 003's `active_segments_map` entries must carry the per-segment lifecycle phase (incl. preparing/`indeterminate`)**, not only progress — i.e. 003 generalizes the W-MIX-LA single-segment load attribution to per-segment map entries. Confirm 003's emitted entry shape includes the preparing phase before finalizing the adapter here.

**Companion cleanup.** Replace the Set-derivation in `useStudioChapter` (recomputing `preparing/rendering` Sets over all spans from one active id) with per-segment selection over the keyed map, so adding parallel segments doesn't re-derive all spans on every frame.

## Files to touch

| File | Current anchor | Change |
|---|---|---|
| `frontend/src/store/live-jobs.ts` | `OverlayDelta` type definition; `active_segment_id` mapping | Add `active_segments_map?: Record<string, { progress: number; eta_seconds: number \| null; reason_code?: string }>` to `OverlayDelta`. Surface `is_multi_active` convenience flag if cleaner. |
| `frontend/src/utils/jobEventAdapters.ts` | Payload extraction / field mapping | EXTRACT `active_segments_map` from the chapter job event payload. **Critical two-layer lesson (W4):** the store type is not enough — the adapter must explicitly pull this field or it is silently dropped. |
| `frontend/src/utils/queueOverlayFields.ts` | Whitelist of fields that flow from event → overlay | WHITELIST `active_segments_map` (and `is_multi_active` if added). A field not in this whitelist does not reach the overlay, regardless of store type or adapter. |
| `frontend/src/api/hydration/index.ts` | Overlay merge on page load / hydration | MERGE `active_segments_map` when hydrating an in-progress chapter job, so the set is populated even when the user opens the page mid-render (not just on a live update frame). |
| `frontend/src/pages/Book/studio/useStudioChapter.ts` | `chapterRenderActiveSegmentId` derivation and `chapterRenderRenderingSegmentIds` set | Generalize the singular `chapterRenderActiveSegmentId` to a SET `chapterRenderActiveSegmentIds` with per-segment progress. Today it tracks one active segment and populates `chapterRenderRenderingSegmentIds`. Replace with: read `active_segments_map` from the overlay; expose a `chapterRenderActiveSegmentsMap` (keyed by segId, value `{progress, eta_seconds, reason_code}`) and keep `chapterRenderRenderingSegmentIds` as a derived set of all keys. Preserve backward-compat: if `active_segments_map` is absent (cap=1, 003 not yet emitting it), fall back to the single `active_segment_id` path — the behavior must be byte-identical to today at cap=1 (INV-1). |
| `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` | Per-span `isRendering` logic; per-segment progress bar props | Multiple segments render their progress simultaneously. The per-span machinery already exists; remove the single-active assumption. Thread `activeSegmentsMap` (not just a single `activeSegmentId`) from `useStudioChapter` into `ScriptView`. Each span reads its own entry from the map for its progress value. |

## Two-layer wire contract (W4 lesson — do not skip)

The field must pass through ALL four of these points or it is dead:

1. **`OverlayDelta` type** (`live-jobs.ts`) — declares the field exists on the store shape.
2. **`jobEventAdapters.ts`** — EXTRACTS it from the raw socket payload into the delta object.
3. **`queueOverlayFields.ts`** — WHITELISTS it so the overlay merge engine passes it through.
4. **`hydration/index.ts`** — MERGES it on initial page load so the map is populated for mid-render page opens, not just live-update frames.

All four are required. Missing any one = field is dead at runtime (confirmed by W4 debugging).

## Performance contract

Per-frame re-render fan-out is a known concern (vitest also leaks; memory-safe targeted runs required — see test commands below). Keep updates **out of the React render hot path**:

- Module store + **rAF-coalesced** subscription: batch incoming `active_segments_map` updates; publish to subscribers once per animation frame, not once per socket message.
- **Memoize per-span**: each `ScriptSpanItem` (or equivalent) should be memoized so only spans whose progress value changed re-render.
- Do NOT wire each span to a per-frame state update via `useState` in the span component — the span reads from the coalesced subscription.
- This matches the pattern already established for single-segment progress; the multi-active path is an extension, not a new mechanism.

## Target shape / contract

- **Signal consumed (not invented):** `active_segments_map` on the chapter job event — a chapter-level map `{segId: {progress, eta_seconds, reason_code}}` emitted by the progress service / 003's per-segment dispatch isolation. One frame per chapter progress event, not N frames (INV-9: no new wire channel).
- **Fallback (cap=1 / 003 absent):** if `active_segments_map` is absent from the payload, fall back to the existing single `active_segment_id` path. Behavior byte-identical to today at cap=1 (INV-1).
- **INV-4:** durable chapter job status stays monotonic — no regression. Children are internal; only the parent chapter job is the UI-visible unit.
- **INV-5:** no engine-ID branching. The `active_segments_map` is a progress payload, not an engine selector — ScriptView and the hook must not branch on engine IDs.
- **INV-9:** no new socket channel or field invented. `active_segments_map` is added by 003 to the existing chapter event frame.

## Steps (ordered)

1. **Store (`live-jobs.ts`):** add `active_segments_map` to `OverlayDelta`; keep `active_segment_id` for the cap=1 fallback path.
2. **Adapter (`jobEventAdapters.ts`):** extract `active_segments_map` from the payload into the delta. Confirm the field name matches what 003 emits (align with 003's backend contract before finalizing).
3. **Whitelist (`queueOverlayFields.ts`):** whitelist `active_segments_map` (and convenience flags if any).
4. **Hydration (`hydration/index.ts`):** merge `active_segments_map` during page-load hydration of in-progress jobs.
5. **Hook (`useStudioChapter.ts`):** derive `chapterRenderActiveSegmentsMap` from the overlay; keep `chapterRenderRenderingSegmentIds` as the key set; preserve single-ID fallback.
6. **View (`ScriptView.tsx`):** accept `activeSegmentsMap` prop; pass each span its own progress entry from the map; remove single-active assumption; memoize per-span.
7. **Coalesced subscription:** verify the rAF-coalesced update path handles N-entry maps without per-frame full re-renders.
8. Run targeted vitest paths + lint (see commands below).

## Tests (TDD — write first)

Write these **before** the implementation; per **R1** each must fail on current code (today only one segment can be active; the store has no `active_segments_map` field; the two-layer pipeline does not carry it).

- **Frame construction (R3):** build socket frames via the types in `frontend/src/api/contracts/liveEvents.ts` and publish through `publishStudioSocketMessage` (`src/store/studioSocketBus.ts`). No hand-rolled frame literals.
- **Timing (R4):** vitest fake timers / `waitFor`. No `setTimeout(n)` / `sleep(n)` waits.
- **Test files (mirror source under `frontend/tests/`):**
  1. `frontend/tests/unit/hooks/useQueueSync.test.tsx` (existing) — **integration test through the real dispatch path** (not just `applyEvent` in isolation — the W4 lesson): emit a chapter progress frame with `active_segments_map: {S1: {progress:0.3, eta_seconds:10}, S2: {progress:0.6, eta_seconds:5}}`; assert both `S1` and `S2` land in the store overlay's `active_segments_map`. (R1: fails today — field is not extracted or whitelisted.)
  2. `frontend/tests/unit/pages/Book/studio/useStudioChapter.test.tsx` (existing) — add: a chapter overlay with `active_segments_map: {S1:..., S2:...}` exposes both in `chapterRenderActiveSegmentsMap` and both appear in `chapterRenderRenderingSegmentIds`; with `active_segments_map` absent, the single `active_segment_id` fallback still populates the set with the one ID (cap=1 compatibility). (R1: fails today — only one active ID is tracked.)
  3. `frontend/tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx` (existing) — add: when `activeSegmentsMap` contains `{S1: {progress:0.3}, S2: {progress:0.6}}`, two spans simultaneously render their respective progress values (assert both progress bars have non-idle values). (R1: fails today — only one span can be in the active/rendering state.)
  4. `frontend/tests/unit/utils/jobEventAdapters.test.ts` (existing or new) — assert `active_segments_map` is extracted from a chapter progress payload into the `OverlayDelta`; assert `queueOverlayFields` whitelist passes it through. (R1: fails today — field is not in the adapter output.)
- **Commands (memory-safe targeted runs):**
  ```bash
  npm -C frontend run test -- --run --maxWorkers=1 \
    tests/unit/hooks/useQueueSync.test.tsx \
    tests/unit/pages/Book/studio/useStudioChapter.test.tsx \
    tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx \
    tests/unit/utils/jobEventAdapters.test.ts
  npm -C frontend run lint
  ```
  Run targeted (memory safety: vitest leaks gigs on full suite; `--maxWorkers=1` + targeted paths).

## Acceptance criteria

1. A chapter progress frame with `active_segments_map: {S1:..., S2:..., S3:...}` causes three segments to simultaneously show their per-segment progress bars animating in `ScriptView`, each with their individual progress value.
2. With `active_segments_map` absent (cap=1 or 003 not yet emitting), behavior is byte-identical to today: one `active_segment_id` → one bar animating (INV-1).
3. The `active_segments_map` field passes through all four wire points: `OverlayDelta` type + adapter extraction + overlay whitelist + hydration merge (verified by the `useQueueSync` integration test, not by inspecting store types alone — the W4 lesson).
4. Updates do not cause per-frame full re-renders of unaffected spans; the rAF-coalesced path is used; per-span memoization holds.
5. No engine-ID branching in any touched frontend file (INV-5).
6. New tests fail on pre-change code (R1 revert-check), build frames via `liveEvents.ts` types through `publishStudioSocketMessage` (R3), use fake timers/`waitFor` (R4); `npm -C frontend run lint` passes.
7. Durable chapter job status presentation is unaffected (INV-4).

## Map links

- `../01-map.md` — Part G (frontend multi-active), INV-1/INV-4/INV-5/INV-9, connection **D → progress service → G** (the two-layer wire path), Risk R-E.
- `../00-overview.md` — Scope item 7 (frontend multi-active) and Scope OUT (Phase 2 visualizer deferred).
- `../02-roadmap.md` — W-PAR task 006; depends on 003; blocks 007; milestone M-PAR-3.
- W-MIX W4 precedent: `design-docs/plans/active/mixed-synthesis-fused-proposal/tasks/004-frontend-preparing-presentation.md` — the two-layer lesson that this task must not repeat as an omission.
- Phase-2 visualizer: `../10-phase2-render-monitor.md` — the dedicated block-field render monitor is out of scope here.

## Out of scope

- **Backend** per-segment dispatch isolation and `active_segments_map` emission — task **003** (W-PAR). This task only consumes 003's output.
- **ETA under parallelism** — task **007**; this task passes `eta_seconds` through from the map but does not own the bracketed ETA logic.
- **The dedicated render monitor** (block-field visualizer, popover, dual-layer a11y table, power controls) — **Phase 2**, [10-phase2-render-monitor.md](../10-phase2-render-monitor.md).
- Inventing any new socket field or channel — INV-9 forbids it; `active_segments_map` is added to the existing chapter event frame by 003.
- Engine-ID-based UI branching — INV-5 forbids it.
- Per-segment retry/stall controls — Phase 2 power controls (gated behind Production disclosure).
