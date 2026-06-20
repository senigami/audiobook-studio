# Roadmap

> **TL;DR:** Two workloads. Workload 1 (tasks 001–004) kills the four bug classes at their
> chokepoints — independent of each other, can run in parallel. Workload 2 (005–006) removes
> the now-redundant SDK-violating fallback and adds the backend event-ordering guarantee.

## Sequencing rationale

Workload 1 is pure correctness at existing chokepoints: each task centralizes something that
today is caller-threaded (settings, profile dir, outcome isolation, registry availability).
None changes a public contract, so they're safe to land together. Workload 2 depends on
Workload 1: task 005 deletes a fallback that only becomes safe once 002 guarantees
`voice_profile_dir` arrives in requests; task 006 is a behavior change to broadcast routing
that needs a spec update (`queue-jobs.md` / `live-events.md`) and deserves its own review.

## Dependency graph

- 001, 002, 003, 004 — independent of each other (003 and 002 both touch
  `app/jobs/handlers/bridge_helpers.py`; execute serially or by one agent if parallelizing).
- 005 — blocked by 002.
- 006 — independent, but sequenced last because it is the only contract-visible change.

## Workloads

### Workload 1 — Central fixes (kill the classes)

- **Goal:** no remaining call site can reproduce bug classes 1–4.
- **Tasks:** 001, 002, 003, 004
- **Why now:** each class has already produced shipped bugs twice or more; every week of
  instance-patching adds another fix commit to the pile.
- **Verify the workload:** `./venv/bin/python -m pytest -q` green including the new
  revert-checked tests; `grep -rn "check_env()" app/ | grep -v test` shows no bare call on a
  plugin engine outside the shared helper; no `print(` remains in
  `orchestrator_helpers.py`.

### Workload 2 — Boundary restoration + event-ordering guarantee

- **Goal:** XTTS server engine no longer imports `app.*`; the backend never emits a
  non-terminal frame for a job after its terminal frame (except requeue via
  `queued`/`preparing`).
- **Tasks:** 005, 006
- **Why now:** 005 is unblocked by 002; 006 converts the frontend's H7 suppression rules
  from load-bearing to defense-in-depth.
- **Verify the workload:** plugin-side `grep -rn "from app\." plugins/tts_xtts/plugin/server/`
  returns nothing; new ws-ordering test (terminal frame then late running frame → no
  segments.progress emission) passes and fails when the latch is reverted; spec versions
  bumped.
