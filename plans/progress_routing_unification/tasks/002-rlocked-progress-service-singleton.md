# 002 — One RLock-guarded `ProgressService` singleton

- **Status:** done
- **Workload:** WL-A Foundation
- **Severity / type:** major · architecture · concurrency
- **Effort:** M
- **Blocked by:** 001
- **Blocks:** 004, 007, 010

## Goal
Boot-wire **one** main-process `ProgressService` instance, resolved by the orchestrator, by
`ws.broadcast_job_updated`, and by the snapshot serializer. Add an `RLock` guarding all per-job state (ETA
ring, monotonic clamp floor, last-payload, last-emit tick) because the producers run on **different
threads**. Add a conftest autouse reset fixture and reconcile the tests that construct their own service.

## Why this matters
The `enrich` kernel (001) holds per-job state (`_eta_rings`, `_eta_last_sample_time`,
`_last_progress_by_job`, `_last_payload_by_job`). For both producers to share one monotonic floor / one ETA
ring / one throttle history (PI4), they must resolve the **same instance**. Today the orchestrator creates
its **own** service via `create_progress_service()` (`orchestrator.py:453`, also referenced at
`orchestrator.py:30,48`) — a **per-orchestrator-owned** service. Path B (`ws.broadcast_job_updated`)
doesn't touch a `ProgressService` at all. Wiring one shared singleton is a **behavior change** from today's
effectively-serialized per-orchestrator ownership: once two producers (orchestrator worker threads, the
`state_jobs` listener thread, the asyncio loop) write the same per-job state concurrently, the state must
be RLock-guarded or concurrent jobs race. See `../00-architecture-map.md` D1.

## Context an executor needs
- D1 (one singleton, RLock-guarded): `../00-architecture-map.md` §2.
- Boot is the only legal place for startup side effects: `app/core/boot.py` (`boot_studio`/`boot_tts_server`),
  per `.agent/rules/modular_architecture.md` (no import-time threads/listeners/global mutation).
- Current ownership: `app/orchestration/scheduler/orchestrator.py:453` calls `create_progress_service()`
  inside orchestrator construction; `create_progress_service` lives at `service.py:800-810`.
- Producers that must resolve the singleton:
  - orchestrator (`orchestrator.py:286/304/320` call `self.progress_service.publish`).
  - `ws.broadcast_job_updated` (`app/api/ws.py:283`) — needs a resolver (it currently has no service).
  - snapshot serializer (`app/api/web.py:219-236`, the `jobs_snapshot_request` handler) — used by 007.
- Per-job state to guard: `self._last_payload_by_job`, `self._last_emit_tick_by_job`,
  `self._last_progress_by_job`, `self._eta_rings`, `self._eta_last_sample_time` (`service.py:76-82`).
- Tests that construct their own `ProgressService` (must keep working — allow injection, don't force the
  global — **enumerate ALL self-constructing sites and assert they stay on local instances**):
  - `tests/orchestration/test_progress_logic.py` (~13 construction sites)
  - `tests/orchestration/test_progress_reconciliation.py:218`
  - `tests/orchestration/test_progress_service.py:19`
  - `tests/api/test_websocket_broadcast.py:1435,1781`
  - `tests/orchestration/test_progress_contract_v140.py:47`
  The conftest autouse fixture must both **CLEAR** and support **INSTALLING** a clock-injected instance
  (the Task 004 parity test installs its instance as the global).
- `broadcast_job_updated` uses `time.time()` directly (`ws.py:161,573`); for the parity gate's value-equality
  with injected clocks, route its clock-bearing values through the singleton's injected clock via `enrich` —
  don't stamp raw `time.time()` into fields that the parity test compares between paths.

## Target shape / contract
- A module-level accessor (e.g. `get_progress_service()` in `app/orchestration/progress/service.py` or a
  small `progress/registry.py`) returning the one boot-installed instance. Boot installs it; callers
  resolve it. **No import-time construction** — installation happens in `boot.py`.
- The orchestrator stops owning its own service: it resolves the singleton instead of calling
  `create_progress_service()` at construction (keep `create_progress_service()` as the factory the boot
  installer uses, and as the per-test injection path).
- `ws.broadcast_job_updated` resolves the same singleton (used in 004 to enrich before building events).
- Add `self._lock = threading.RLock()` and guard every read-modify-write of the per-job state dicts
  (inside `enrich`, `_should_emit`, and the `publish` post-emit bookkeeping at `service.py:345-354,482`).
  RLock (not Lock) because `publish`→`enrich`→`_should_emit` can re-enter on the same thread.
- Conftest autouse fixture resets the singleton's per-job state between tests (so leaked floors/rings don't
  cross-contaminate). Place near the existing reset fixtures in repo-root `conftest.py`.

## Steps
1. Test first (concurrency + deadlock):
   a. Two-thread **deadlock test** (D7): thread 1 calls `update_job(...)` → triggers `broadcast_job_updated`
      listener → calls `enrich` (which must NOT hold PS-RLock while calling `get_jobs()`); thread 2 calls
      `publish` which calls `get_jobs()` then enters the RLock. Assert both threads complete without
      deadlock (use a threading `Event` barrier; the test must finish within a timeout).
   b. Cross-job state test: two threads publish for two different jobs through the **same** singleton and
      assert no cross-job state bleed (each job's monotonic floor independent).
   c. Resolver identity test: orchestrator + direct resolver hand back the **same object**.
2. Add `threading.RLock` to `ProgressService.__init__`; wrap the per-job state read-modify-writes.
3. Add the singleton accessor + a boot installer call in `app/core/boot.py`; repoint the orchestrator to
   resolve it instead of constructing its own.
4. Add a `ws` resolver hook (so 004 can call `enrich`); leave `broadcast_job_updated` behavior unchanged in
   this task beyond resolving the instance.
5. Add the conftest autouse reset fixture; update `test_progress_contract_v140.py:47` /
   `test_progress_logic.py:90` so they either inject a fresh service or use the reset fixture (state which).
6. `./venv/bin/python -m pytest tests/orchestration/ tests/api/ -q` and `ruff check`.

## Acceptance criteria
- [ ] Exactly one boot-installed `ProgressService`; orchestrator + `ws.broadcast_job_updated` + snapshot
      serializer resolve the same instance (PI4).
- [ ] No import-time construction or side effects; installation is in `boot.py` (modular_architecture.md).
- [ ] All per-job state read-modify-writes are RLock-guarded; the concurrency test shows no cross-job bleed.
- [ ] **D7 lock-ordering test passes**: two threads simulate `update_job→listener→enrich` (thread 1) and
      `publish→get_jobs` (thread 2) concurrently; neither deadlocks. `publish` reads `get_jobs()` BEFORE
      entering the RLock-guarded region (no `_STATE_LOCK → PS-RLock` inversion).
- [ ] All self-constructing `ProgressService(...)` test sites enumerated (see Context section above) stay on
      local instances; conftest autouse fixture clears AND supports installing a clock-injected instance.
- [ ] `broadcast_job_updated`'s clock-bearing fields routed through singleton's injected clock via `enrich`,
      not raw `time.time()`, so parity-test value-equality is achievable.
- [ ] The behavior change (per-orchestrator → shared singleton) is documented in the PR description.
- [ ] `pytest tests/orchestration/ tests/api/` and `ruff check` green.

## Out of scope
- Calling `enrich` from `ws.broadcast_job_updated` / threading enriched values into builders — 004.
- Snapshot serializer calling `enrich` — 007.
- Throttle/emission policy changes beyond locking shared state — 010.
