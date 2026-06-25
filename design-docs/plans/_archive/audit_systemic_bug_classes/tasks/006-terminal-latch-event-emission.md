# 006 — Per-job terminal latch at the broadcast chokepoint

- **Status:** done
- **Workload:** Workload 2 — Boundary restoration
- **Severity / type:** major · contract / correctness
- **Effort:** M
- **Blocked by:** nothing (sequenced after Workload 1 because it is contract-visible)
- **Blocks:** nothing

## Goal

The backend guarantees that after a job's terminal frame (`done`/`failed`/`cancelled`), no
further non-terminal frame for that job is broadcast on any topic — unless the job legally
re-enters via `queued`/`preparing` (requeue). The frontend's H7 suppression rules become
defense-in-depth instead of load-bearing.

## Why this matters

`segments.progress` frames are emitted from five sites in two modules
(`app/orchestration/progress/service.py:286,323`; `app/api/ws.py:315,380,429`), but the only
"no frames after terminal" guard is `ProgressService._should_emit`
(`app/orchestration/progress/service.py:620-640`), which covers only the service's own path.
`b88e13b8` shipped because a trailing `segments.progress` frame arrived after the failure
frame and re-mounted UI the frontend had just cleared; the frontend has now grown two
generations of suppression rules (progress-presentation.md H7, 1.3.0→1.3.1) to defend
against frames the backend should never send. Each future emitter is another regression
waiting.

## Context an executor needs

- Specs to update in the same change (binding, `design-docs/specs/README.md`):
  `design-docs/specs/queue-jobs.md` ("broadcast routing", "terminal-reset semantics") and/or
  `design-docs/specs/live-events.md` — add the ordering guarantee, bump spec_version + changelog.
  `design-docs/specs/progress-presentation.md` H7 stays, re-labelled defense-in-depth.
- The chokepoint: `app/api/ws.py broadcast_job_updated` — all five segment emitters are
  reachable from it or from `ProgressService.publish`.
- The existing rule to mirror: `service.py:634` — prev terminal + curr not in
  `{done, failed, cancelled, queued, preparing}` → don't emit.
- Job state source: `app/db/state.py` merged job dict already carries prior status at the
  ws layer (`broadcast_job_updated` computes `status_changed`, `terminal_reset`).
- Frontend tests for H7 live at `frontend/tests/unit/hooks/useSegmentHandoffQueue.test.tsx`
  — they must keep passing untouched (H7 remains).

## Target shape / contract

A small per-job latch consulted once in `broadcast_job_updated` before any event building:

```python
# ws.py (module-level, RLock-guarded, cleared on terminal_reset/requeue)
def _terminal_latched(job_id, prev_status, new_status) -> bool:
    """True → drop all frames for this update (job already terminal,
    incoming status is not a legal re-entry)."""
```

Rules: latch sets on first terminal status; `queued`/`preparing` (and terminal statuses
themselves, for the final frame) unlatch/pass; everything else while latched is dropped and
logged at debug. The latch must be cleared when a job id is removed (`clear_all_jobs`) to
avoid leak across tests/runs.

## Steps

1. Implement the latch in `app/api/ws.py`; consult it at the top of `broadcast_job_updated`.
2. Wire cleanup: clear latch entries on terminal_reset/requeue paths and in
   `app.db.state.clear_all_jobs` test-reset (or expose `_reset_for_tests`).
3. Tests (R1, frames built per R3 on the frontend side — backend tests capture at the
   websocket broadcast boundary per R2): terminal failure frame followed by a late
   `running` update with an active segment → no `segments.progress` emission (red pre-fix);
   requeue (`failed` → `queued` → `running`) → frames flow again.
4. Update `queue-jobs.md` / `live-events.md` (version bump + changelog row) and add a dated
   `wiki/Changelog.md` entry.

## Acceptance criteria

- [ ] New backend ordering tests red pre-fix, green post-fix.
- [ ] All existing H7 frontend tests pass unmodified.
- [ ] Spec versions bumped with changelog rows in the same change.
- [ ] Full backend + frontend suites green.

## Out of scope

Consolidating the five emitters into one module (worthwhile, but a larger refactor);
changing event envelope schemas; touching the frontend hook.
