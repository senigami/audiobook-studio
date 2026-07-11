# Task 008 — Real segment inventory + char count + failed-phase hydration

Status: pending

Risk: multi-file, quality-sensitive (touches the live progress wire; a half-implemented `failed` phase would be a fabricated-looking status)

## Goal

Replace `frontend/src/pages/Activity/devSegmentRenderMonitorFixture.ts` with real data: give `SegmentRenderMonitor` a genuine `SegmentRenderMonitorSegment[]` — every segment in the active job's chapter (not just in-flight ones), each with a real `charCount`, a real `phase` including `'failed'` when applicable, and (best-effort) `engineId`.

## Why this matters

`SegmentRenderMonitor.tsx` (production component, already built and tested) is 100% fixture-fed today, even in dev mode — `ActivityPage.tsx:75-89` renders it only from `DEV_FIXTURE_RENDER_MONITOR_JOB`. This is the single highest-value Phase 2 task: everything else (popover, peek strip) is meaningless without real data behind it.

## Exact contract to satisfy

`SegmentRenderMonitor.tsx:32-48`:
```ts
export type SegmentRenderPhase = 'preparing' | 'rendering' | 'done' | 'failed';
export interface SegmentRenderMonitorSegment {
  id: string;
  charCount: number;
  phase: SegmentRenderPhase;
  progress: number;   // 0..1
  engineId?: string;
}
export interface SegmentRenderMonitorProps {
  segments: SegmentRenderMonitorSegment[];
  cap: number;
}
```

## Current shape (verified)

- `active_segments_map` (`ActiveSegmentMapEntry`, `frontend/src/types/index.ts:10-16`) carries `phase: 'preparing'|'rendering'|'done'`, `progress`, `eta_seconds`, optional `reason_code`/`indeterminate` — **no `charCount`, no `'failed'` phase, no `engineId`.** Confirmed via `app/orchestration/scheduler/orchestrator_helpers.py:758-789` (`_current_active_segments_map`) and `app/orchestration/tasks/segment_synthesis.py:708,731-735` (every entry-write site) — zero writes of `phase: 'failed'` anywhere in the backend.
- `active_segments_map` is already reachable app-wide with **no new WebSocket plumbing needed**: `frontend/src/hooks/useJobs.ts`'s `chapters.progress` handler (~L164-179) applies to ANY `event.jobId` present in `liveJobsRef.current`, not scoped to one open chapter. `ActivityPage.tsx` already receives `jobs`/`queue` props from the same `useJobs()` source every other route uses (`frontend/src/app/App.tsx:346-357`).
- Char counts exist and are cheap: `chapter_segments.text_content` (`app/db/core.py:232-246`) — `LENGTH(text_content)` is already used for chapter-level aggregates (`app/db/segments.py:102-103`). Per-segment char counts are already exposed over HTTP via the script-view endpoint: `ScriptSpan.char_count` (`app/api/routers/chapters_models.py:20-30`, backed by `GET /chapters/{chapter_id}/script-view`, `app/api/routers/chapters_production.py:24-31`).
- `active_segments_map` only ever contains in-flight + transiently-"done" entries — it is NOT a full segment inventory (cleared to `{}` at terminal, `_clear_active_segments_map`, `app/orchestration/tasks/segment_synthesis.py:762` — **corrected in independent sign-off review**: this is in `segment_synthesis.py`, not `orchestrator_helpers.py` as earlier drafts of this file cited; two similarly-named functions exist across the two files, verify which one you're reading before editing). The full list of segments (including not-yet-started and long-done ones) must come from elsewhere.
- Pattern to imitate: `frontend/src/pages/Book/studio/useStudioChapter.ts:154-178` — how the chapter editor already merges `job.active_segments_map` with a `fallbackActiveSegmentsMap` built from live WS ticks when the backend map is absent. This task's merge (inventory ⨝ active map) is the same shape of problem, applied at a different grain (whole chapter's static segment list, not per-segment fallback).

## Target shape

1. **Backend**: thread `char_count` (or reuse `LENGTH(text_content)` inline) into each `active_segments_map` entry written by `segment_synthesis.py` (`_on_child_segment_tick` and the terminal-write sites at L708/731-735) — the child already has `group["text_length"]` in scope at these call sites (used today only for chapter-level `grouped_progress`, `_child_char_len`, ~L1140-1141) — add it as `entry["char_count"]`.
2. **Backend**: add a `'failed'` value to the phase contract end-to-end — `app/api/contracts/events.py`'s `ActiveSegmentMapEntry`-equivalent type, plus write `phase: "failed"` at whatever call site currently marks a segment's terminal failure (find the segment-attempt-failure handling near the retry-once policy, `app/orchestration/tasks/segment_synthesis.py` — this project's own history flags a `retry-once policy` and `stalled_segments` heartbeat as already built; hook the phase write there).
3. **Frontend**: `frontend/src/types/index.ts`'s `ActiveSegmentMapEntry` gains `'failed'` to its phase union and an optional `char_count`/`engine_id`.
4. **Frontend**: build the full segment inventory for the Activity page's currently-selected/expanded active job by fetching `GET /chapters/{job.chapter_id}/script-view` (reuse the existing endpoint — `job.chapter_id` is already on `Job`/`ProcessingQueueItem`) once per active job shown, then merge each span's `char_count` with the live `active_segments_map` entry for that span id (present segments get live phase/progress; absent-from-map segments default to `'done'` if `audio_status==='done'` per the script-view payload, else `'preparing'`/queued treated as not-yet-active — do not invent a new phase for "not started," map it to whatever `SegmentRenderMonitor` already treats as its dimmest/idle state per its own rendering, verify against `SegmentRenderMonitor.tsx`'s handling of segments absent from an "active" set).
5. Replace the `devSegmentRenderMonitorFixture.ts` import in `ActivityPage.tsx:75-89` with this real data source, still behind the existing `useDevMode()` gate for THIS task (removing the dev-gate entirely is a later step once this is verified live — see roadmap's "Phase 2 complete" note).

## Steps

1. **Corrected in independent sign-off review — the original instruction here was wrong, do not
   follow it as first drafted.** `_on_child_segment_tick`'s signature is
   `(self, *, segment_id, status, progress, eta_seconds, reason_code)` — it has **no `group` in
   scope**, so `group["text_length"]` does not exist at this call site. Even if it did,
   `group["text_length"]` is the **render-group's total** character count (a group can merge
   multiple contiguous segments up to the chunk limit, per `build_chunk_groups`,
   `app/domain/chunk_groups.py:70-81`) — using it as a per-segment `char_count` would silently
   inflate every segment in a multi-segment group to the group's combined total, which is exactly
   the "fabricated-looking data" this task's own quality-sensitive risk note forbids. **Correct
   approach:** derive `char_count` per segment directly by its own `segment_id`, reusing the
   existing, proven `LENGTH(text_content)` pattern (`app/db/segments.py:102-103`) — either look up
   the segment's own text length via a small helper/query keyed on `segment_id` at the point
   `_on_child_segment_tick` runs, or (simpler, avoiding a query in a hot per-tick path) thread the
   segment's own already-known text length in from wherever `_on_child_segment_tick` is actually
   called with `segment_id` (find that call site fresh — do not assume `group` is available there
   either; verify what IS in scope before writing code).
2. Find the segment-attempt-failure/retry-once code path; add a `phase: "failed"` write for a segment's final (non-retryable) failure — confirm this doesn't collide with the job-level terminal `status` field, which remains the source of truth for whether the WHOLE job failed.
3. **Corrected in independent sign-off review**: `app/api/contracts/events.py` does **not** have a
   typed `ActiveSegmentMapEntry`-equivalent contract to update — `active_segments_map` there is an
   untyped `dict | None` pass-through (confirmed at `events.py:395` and `:507`). The typed contract
   exists only in `frontend/src/types/index.ts` (already covered by step 3 below) and in the spec
   docs. This step is really: bump `live-events.md`/`progress-presentation.md`'s documentation of
   the `active_segments_map` shape (adding `char_count`/`failed` to the documented fields) per this
   repo's "behavior change updates the spec in the same commit" convention — there is no backend
   Python type to change here, only the spec prose and the frontend TS type (step 3 below).
4. Update `frontend/src/types/index.ts`'s `ActiveSegmentMapEntry` to match.
5. Write a small hook/utility (e.g. `useSegmentInventory(job)`) that fetches script-view once per active job and merges it with `job.active_segments_map`, producing `SegmentRenderMonitorSegment[]`.
6. Wire this into `ActivityPage.tsx` in place of the fixture import, keeping the `useDevMode()` gate for this task.
7. Delete `devSegmentRenderMonitorFixture.ts` only once this is verified working live (not in this task — leave it until then so there's a fallback to compare against).

## Acceptance criteria

- [ ] `active_segments_map` entries carry real `char_count` for at least the in-flight/recently-done segments.
- [ ] A genuinely failed segment (final retry exhausted) shows `phase: "failed"` on the wire, verified by a backend test forcing a failure.
- [ ] `ActivityPage.tsx` renders `SegmentRenderMonitor` from real script-view + `active_segments_map` data for at least one active job, with the fixture no longer in the render path (fixture file itself can remain on disk for now).
- [ ] No second WebSocket channel/topic introduced (M4 in `01-map.md`) — this enriches the existing field and reuses the existing script-view REST endpoint.
- [ ] `./venv/bin/python -m pytest -q` and `npm -C frontend run test -- --run` both clean; relevant spec files bumped with changelog rows.
- [ ] Live-verify: render a chapter with several segments, confirm the monitor (even dev-gated) shows real per-segment character-weighted blocks matching actual segment lengths, not the fixture's synthetic ones.

## Map links

Part J in `01-map.md`'s Phase 2 section. Invariants M4, INV-9 (Phase 1, reused). Risk R-G (the `'failed'` phase gap).

## Dependencies

None — this is the Phase 2 prerequisite; tasks 010 and 011 depend on this, not the other way around.

## Out of scope

Do not remove the `useDevMode()` gate in this task — that's a follow-up once this is verified live per the roadmap. Do not build the popover (010) or peek strip (011) here — this task only makes real data available to whatever renders `SegmentRenderMonitor` today.
