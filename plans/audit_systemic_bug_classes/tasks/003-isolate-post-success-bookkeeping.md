# 003 — Post-success bookkeeping must never change a job's outcome

- **Status:** done
- **Workload:** Workload 1 — Central fixes
- **Severity / type:** critical · correctness
- **Effort:** M
- **Blocked by:** nothing (touches `bridge_helpers.py` like 002 — coordinate if parallelizing)
- **Blocks:** nothing

## Goal

Once synthesis has succeeded, no metrics/timing/bookkeeping exception can flip the result to
failed: the invariant "a `done` outcome is immutable downstream" holds at every dispatch path.

## Why this matters

`b88e13b8` shipped exactly this bug (metrics ValueError flipped a completed mixed render to
failed) and fixed one caller. Three orchestrator invocation sites, two post-success
`update_job` calls, and the raising metrics function itself remain exposed.

## Context an executor needs

- Spec: `docs/specs/queue-jobs.md` (status transitions — nothing legal transitions done→failed
  at metrics time).
- `app/orchestration/scheduler/orchestrator_helpers.py`:
  - `record_render_stats_if_completed` is defined at :141; its protective `try` starts only
    at :297 (except at :359-364). Lines 141–296 do unprotected arithmetic on timing values
    pulled from the raw bridge result (`get_val`), e.g. :184-203, :238-240 — TypeError-able.
  - Invocation sites whose enclosing try converts exceptions to failed TaskResults:
    :880 (registry-handler path, except at :884-896), :922 (local-execution path, except at
    :977-986), :945 (bridge dispatch, except at :947-962).
  - Leftover debug prints at :948, :951, :953.
- `app/jobs/handlers/bridge_helpers.py:66-69` — post-success
  `update_job(task_id, synthesis_duration_seconds=…)` inside the synthesis try; generic
  except at :83-85 wraps any raise into `EngineBridgeError` → callers fail the job.
- `app/orchestration/tasks/api_synthesis.py:150-152` — same pattern; except at :157-160
  returns `TaskResult(status="failed")`.
- `app/jobs/worker_metrics.py` `record_engine_sample`: raises ValueError at :75 when
  `synthesis_duration_seconds` is missing, and the except at :99-101 logs "Rejected logging
  sample…" then re-raises. Sole caller (`plugins/synthesis_mixed/handler.py:472-475`) is
  wrapped, but the function stays armed for the next caller.

## Target shape / contract

- `record_render_stats_if_completed`: entire body inside one try/except that logs a warning
  with `exc_info` and returns — recording stats is best-effort by definition.
- `bridge_helpers` / `api_synthesis`: the post-success `update_job` wrapped in its own
  swallow-and-log try (synthesis result already determined; bookkeeping cannot undo it).
- `record_engine_sample`: missing/invalid duration → `logger.warning(...)` + return (do not
  record, do not raise). Keep the existing caller's wrap as defense-in-depth.
- Debug prints removed.

## Steps

1. Move the try in `record_render_stats_if_completed` to the top of the function body; keep
   the existing inner wraps; delete the prints at :948-953.
2. Wrap `bridge_helpers.py:66-69` and `api_synthesis.py:150-152` post-success `update_job`
   calls individually.
3. Change `worker_metrics.record_engine_sample` to warn-and-return instead of raising;
   adjust any test asserting the raise (b88e13b8's tests assert outcome preservation, which
   still holds).
4. Tests (R1, mock at boundaries per R2):
   - orchestrator: a completed dispatch whose timing payload contains a string timestamp
     (TypeError in the pre-try region) still yields a done TaskResult — red pre-fix.
   - bridge_helpers: `update_job` raising after successful synthesize → returns 0, no
     EngineBridgeError — red pre-fix.
   - api_synthesis: same shape — red pre-fix.
   - worker_metrics: missing duration → no raise, no sample recorded — red pre-fix.

## Acceptance criteria

- [ ] All four new tests fail with the fix stashed and pass with it.
- [ ] No `print(` remains in `orchestrator_helpers.py`.
- [ ] Existing b88e13b8 tests (`plugins/synthesis_mixed/tests/test_mixed_handler.py`) still pass.
- [ ] Full backend suite green.

## Out of scope

Redesigning the metrics schema or the 1,354-line size of `orchestrator_helpers.py` (worth a
separate refactor task; do not start it here).
