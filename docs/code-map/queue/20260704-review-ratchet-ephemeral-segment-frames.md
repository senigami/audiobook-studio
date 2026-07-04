# Review-ratchet fix: ephemeral publish suppresses job-scoped frames only (2026-07-04)

- `app/orchestration/progress/service.py` — `ProgressService.publish` gains `ephemeral: bool = False`;
  when True it suppresses `jobs.lifecycle`, `queue.items`, and `chapters.progress` emissions but still
  emits segment-scoped frames (`segments.progress` ticks + prev→new SEGMENT_SAVED transition) and keeps
  its per-job/per-segment ETA bookkeeping.
- `app/orchestration/scheduler/orchestrator_publish.py` — the W-PAR Finding A "early return for
  ephemeral contexts" is replaced: ephemeral contexts now route through
  `progress_service.publish(..., ephemeral=True)` and skip only the durable state writes
  (`put_job`/`update_job`). Rationale: the all-frames early return killed the live per-segment
  progress bar (frontend keys it by real segment id via `setSegmentProgress` in `useJobs.ts`).
- `app/db/segments.py` — `chapter_completion_by_size` unchanged; now covered by
  `tests/db/test_chapter_completion_by_size.py` (was uncalled + untested); queue-jobs.md 1.11.0
  amended to record it as computed-but-not-wired.
- Tests: `tests/orchestration/test_ephemeral_child_no_durable_job.py` gains
  `test_ephemeral_children_still_emit_segment_frames_but_no_job_scoped_frames` (revert-checked red on
  the suppress-everything version).
- Specs amended in place (same uncommitted change): live-events.md 1.9.4 row, queue-jobs.md 1.11.0 row,
  wiki/Changelog.md 2026-07-04 entry.
- Checklists grown: docs/checklists/code-review.md (chokepoint-suppression check + "Fix-one-channel,
  kill-the-bus" pattern; untested-uncalled-helper check), docs/checklists/spec-drift-review.md
  (advertised-but-unwired capability check).
