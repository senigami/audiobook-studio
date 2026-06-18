# 010 — Throttle/emission reconciliation under the lock

- **Status:** not-started
- **Workload:** WL-C correctness · concurrency
- **Severity / type:** major · concurrency
- **Effort:** S
- **Blocked by:** 002
- **Blocks:** nothing

## Goal
Keep `_should_emit` (the ≥1%/silence throttle) and the terminal latch as **emission policy** that stays
**out of** `enrich` (D6 — `enrich` is math only). But because two producers now share one singleton (002),
the shared emission state (`_last_payload_by_job`, `_last_emit_tick_by_job`, the terminal latch) must be
RLock-guarded so the two producers don't race, double-suppress, or double-emit the same frame.

## Why this matters
After 002/004 both `publish` (Path A) and `broadcast_job_updated` (Path B) run on different threads against
the **same** `_last_payload_by_job` (`service.py:76`, read in `_should_emit` at 701-773, written in
`publish` at 345/482). Concurrent access can: (a) let two frames both pass the throttle because neither saw
the other's write (double-emit), or (b) one thread's write clobbers the other's last-payload so a real
change is suppressed (double-suppress / frozen bar). The terminal latch (`ws.py:312-316`,
`clear_terminal_latch`/`_terminal_latched`) has the same hazard. The fix is locking the shared state, not
moving throttle logic into `enrich`.

## Context an executor needs
- D6 (emission separate from `enrich`) + D1 (RLock): `../00-architecture-map.md` §2.
- `_should_emit` (`service.py:701-773`) reads `_last_payload_by_job` + `_last_emit_tick_by_job`; the
  regression guard `_apply_progress_regression_guard` (775-797) mutates the payload in place.
- `publish` writes shared state at `service.py:345-348` (and again 482), pops on `queued` (349-354).
- Terminal latch on Path B: `ws.py:312-316` (`clear_terminal_latch`, `_terminal_latched`); find their
  storage (grep in `ws.py` / the module that holds the latch dict) — that dict is also cross-thread shared.
- The RLock added in 002 (`self._lock`) — reuse it for emit-state guards. Do not introduce a second lock
  on the service (deadlock risk). The terminal-latch lock in ws.py is a separate leaf — do NOT merge it
  into the service RLock; see D7 in `../00-architecture-map.md`.
- `ProgressService.reconcile` (called via `orchestrator_helpers.py:56`) — its per-job state writes must
  also be inside the PS-RLock; add it to the audit alongside `_should_emit` and `publish`.

## Target shape / contract
- All read-modify-write sequences over `_last_payload_by_job` / `_last_emit_tick_by_job` /
  `_last_progress_by_job` happen inside the singleton's RLock (the `_should_emit` check and the subsequent
  write in `publish` should be one critical section so the decision and the commit are atomic).
- **Terminal-latch lock rule (FIX 8, D7):** `_terminal_latch_lock` (`ws.py`) stays a **distinct leaf
  lock**, never held while acquiring `_STATE_LOCK` or the PS-RLock, and never acquired while the PS-RLock
  is held. Do NOT guard the latch with the singleton's RLock (that would invite AB-BA). It is its own
  orthogonal leaf.
- **`ProgressService.reconcile` (FIX 8):** called via `orchestrator_helpers.py:56`, this method writes
  per-job state too — its read-modify-write MUST be under the PS-RLock. List it explicitly alongside
  `_should_emit`/`publish` in the RLock-guarding work.
- `enrich` stays free of throttle/latch logic (math only, D6).

## Steps
1. Concurrency test first: two threads publish near-simultaneous frames for the **same** job through the
   singleton; assert exactly the expected number of emits (no double-emit, no lost meaningful frame) using a
   threading barrier (R4: no sleeps). On unlocked code this is racy/flaky → demonstrates the hazard.
2. Make the `_should_emit`→commit sequence one RLock-guarded critical section in `publish`.
3. Guard the terminal-latch store; verify a post-terminal frame from either path drops once.
4. `./venv/bin/python -m pytest tests/orchestration/ tests/api/ -q` (incl. the watchdog progress logic test)
   and `ruff check`.

## Acceptance criteria
- [ ] Throttle decision + last-payload commit are one atomic RLock-guarded critical section; the
      concurrency test shows no double-emit / no lost meaningful frame.
- [ ] `ProgressService.reconcile`'s per-job state writes are RLock-guarded (listed alongside `_should_emit`
      and `publish` in the critical-section coverage).
- [ ] The terminal latch (`_terminal_latch_lock`, ws.py) is a distinct leaf lock; it is never held while
      acquiring `_STATE_LOCK` or the PS-RLock (D7 compliant); a post-terminal frame drops exactly once.
- [ ] `enrich` contains no throttle/latch logic (D6 preserved).
- [ ] `pytest tests/orchestration/ tests/api/` and `ruff check` green.

## Out of scope
- Changing the throttle thresholds (≥1% / silence) — keep current policy.
- The enrich math itself — 001/003b/006.
