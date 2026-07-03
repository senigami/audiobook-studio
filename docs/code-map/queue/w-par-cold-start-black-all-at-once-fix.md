# W-PAR cold-start "text black all at once" fix (2026-07-03)

**Symptom:** On a cold start (first render after server boot, model-load window
present), segment text started gray and stayed gray for the whole chapter
render, then flipped black all at once at completion. Warm starts were fine.

**Root cause (regression from this session's W-PAR 003 + 006):** `_dispatch_segment`
(`orchestrator_helpers.py`) emitted a chapter-level `active_segments_map` on every
progress frame. At cap=1 each frame carried a correct single entry, but during the
cold-start `LOADING_MODEL`/`SEGMENT_PENDING` window the `preparing`-phase entries
accumulated in the frontend overlay (per-jobId), and W-PAR 006's `useStudioChapter`
map-branch consumed them — overriding the correct scalar `active_segment_id` path.
Result: `chapterRenderPreparingSegmentIds` held stale segments (shown gray via
`.script-span-text-preparing`, which is defined after `.script-span-text-ready` in
CSS and so overrode ready-black), and `chapterRenderRenderingSegmentIds` was empty
(no reveal on the actually-rendering segment). Proven by a mid-render cold-start
debug capture: `isActiveJobPreparing:false` yet `chapterRenderPreparingSegmentIds`
non-empty (impossible in the pre-006 fallback), with the active segment absent from
the rendering set.

**Fix:** Defer `active_segments_map` live emission to task 008 (real fan-out > 1).
`_current_active_segments_map` returns `None` behind module flag
`_EMIT_ACTIVE_SEGMENTS_MAP = False`. The field is now absent on the wire at cap=1 →
frontend `chapterRenderActiveSegmentsMap` is undefined → all map-branches fall back
to the proven single-active scalar path (byte-identical to pre-003, INV-1). The
W-PAR 006 frontend plumbing + tests are unchanged and dormant until 008 flips the
flag. Files: `app/orchestration/scheduler/orchestrator_helpers.py`
(flag + builder gate), `tests/orchestration/test_dispatch_isolation.py` (test 2 now
asserts deferral at cap=1), `design-docs/specs/live-events.md` (1.9.1 changelog).

**008 action:** flip `_EMIT_ACTIVE_SEGMENTS_MAP` to True when the parent aggregates
a genuine multi-entry map from concurrent children, and restore the multi-entry
assertion in test 2. Also investigate the frontend overlay accumulation (single-entry
backend frames accumulated to 4 entries — likely a merge in the jobs_snapshot path,
`applyJobUpdated`) so the map is replace-not-merge and stale entries can't linger.
