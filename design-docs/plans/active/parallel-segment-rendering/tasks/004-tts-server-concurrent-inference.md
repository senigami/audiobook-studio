# Task 004 — TTS-server concurrent inference

**Workstream:** W-PAR  ·  **Depends on:** 001 (cap value)  ·  **Blocks:** none  ·  **Status:** Not started

> Read [`../01-map.md`](../01-map.md) (Part **E**, invariants **INV-1**, **INV-5**, **INV-10**,
> risks **R-B**) and [`../00-overview.md`](../00-overview.md) (§Scope item 5) before starting.
> This task can run **in parallel** with tasks 002 and 003 — it only needs 001's cap value, which
> is set at manifest load time.

## Goal

Make the TTS server capable of serving **N concurrent inferences per engine**, up to the engine's
`behavior.max_concurrent_workers` cap declared in its manifest (set by task 001). Today the server
is a single-worker sequential bottleneck at three layers:

1. **One uvicorn worker** (`tts_server.py:152`) — a single-threaded ASGI process that can only
   handle one HTTP request at a time.
2. **Synchronous inline synthesis** (`app/tts_server/server.py:546`) — the `/synthesize` endpoint
   runs `plugin.engine.synthesize(req)` (L614) directly in the request handler, blocking the
   uvicorn event loop for the full inference duration (seconds to tens of seconds per segment).
3. **Exclusive `threading.Lock` in the XTTS warm-worker** (`plugins/tts_xtts/plugin/core/warm_worker.py:291`) —
   `self._lock` (a `threading.Lock`) is held for the entire duration of `run_job` (L309 `with self._lock:`),
   serializing all inference through a single lock even if the endpoint were non-blocking.

With cap=1 these three bottlenecks are invisible because only one request arrives at a time. With
cap≥2 (task 001 sets the cap; task 002 fans out multiple concurrent segment dispatches), all three
must be opened. This task opens all three.

## Why it matters

Part E in the implementation map: the orchestrator-side semaphore (task 001, `resources.py`) throttles
**dispatch** — it controls how many segment inferences are sent to the TTS server concurrently. The
server-side changes here throttle **inference** inside the server — they ensure the TTS server can
actually accept and service N concurrent HTTP requests without blocking or serializing them. The two
enforcement points are complementary and must be consistent (both keyed to the same manifest cap —
see **Connection E ↔ B** in `01-map.md`).

For cloud engines (Voxtral), which call an external HTTP API (`mistral` remote), concurrency is free:
no GPU, no single-process model, no warm worker. The only cap is the Mistral API rate limit. This
task verifies that the server endpoint does not artificially serialize cloud requests.

For XTTS (local GPU), each concurrent inference requires a **separate subprocess instance** (~4 GB
VRAM per instance, **R-B**). Instances must be **lazy-spawned** (spawn the N-th only when a
concurrent request actually arrives — never pre-spawn N instances at startup). On OOM or spawn
failure, fall back to cap=1 gracefully (logged warning; existing `is_alive`/`_get_or_spawn` hook
pattern) — **INV-10**.

Do NOT attempt CUDA stream concurrency inside one XTTS model instance. The model is autoregressive
and not thread-safe within a single process. Separate subprocess instances only.

## Files to touch

| File | Current anchor (file:line) | Change |
|------|---------------------------|--------|
| `tts_server.py` | `uvicorn.run(` L152 | Add `workers=1` (already implied) but configure `--loop asyncio` / use `anyio.from_thread.run_sync` or `run_in_threadpool` pattern; **or** keep single worker and rely on threadpool inside the endpoint (preferred — simpler, no multiprocess IPC). No change to uvicorn worker count needed if endpoint is non-blocking via threadpool. |
| `app/tts_server/server.py` | `def synthesize(body: SynthesizeRequest) -> dict[str, Any]:` L546; `result = plugin.engine.synthesize(req)` L614 | Wrap the `plugin.engine.synthesize(req)` call in `run_in_threadpool` (Starlette) or `asyncio.get_event_loop().run_in_executor(thread_pool)` so the ASGI event loop is not blocked during inference. Convert `synthesize` to `async def`. The threadpool size must be ≥ the max engine cap. |
| `plugins/tts_xtts/plugin/core/warm_worker.py` | `self._lock = threading.Lock()` L291; `with self._lock:` L309 in `run_job` | Replace `threading.Lock()` with `threading.Semaphore(cap)` where `cap` is the engine's `max_concurrent_workers`. The `WarmWorkerManager` (which wraps `WarmWorker`) must maintain a **pool** of up to `cap` `WarmWorker` subprocess instances. |
| `plugins/tts_xtts/plugin/core/warm_worker.py` | `WarmWorkerManager.run_job` L298; `_get_or_spawn` / `is_alive` pattern | Implement lazy pool: on a new `run_job` call, if all existing workers are busy (semaphore count = 0) AND pool size < cap, **spawn a new worker instance** (`WarmWorker.__init__` + start). If spawn fails (OOM, process exit), log a warning, reduce effective cap to current pool size, and proceed with remaining workers (INV-10 fail-safe). |
| `plugins/tts_xtts/plugin/core/warm_worker.py` | Pool size tracking | Add `self._pool: list[WarmWorker]` and `self._sem: threading.Semaphore(cap)` to `WarmWorkerManager.__init__`. Acquire sem before dispatch; release on completion. On pool-full + cap-not-reached, spawn before acquiring. |
| `plugins/tts_voxtral/` (or equivalent Voxtral plugin) | Warm worker / engine entry | Verify no artificial serialization lock. Voxtral calls the Mistral HTTP API — the only lock should be a rate-limit semaphore if one exists. Remove any `threading.Lock` that serializes concurrent Voxtral requests. |
| `app/tts_server/server.py` | Threadpool configuration near uvicorn startup or module init | Ensure the threadpool has enough threads: `max(engine_cap for all engines) * len(engines)` or a fixed generous ceiling (e.g. 16). Document the sizing. |

## Target shape / contract

- **cap=1 (default, ships dark):** behavior is byte-identical to today. One warm worker, lock
  serializes — same as the existing `threading.Lock`. The endpoint is now async but inference is
  still serial (semaphore of 1). INV-1 — no behavior change.
- **cap≥2 (XTTS):** the `WarmWorkerManager` holds up to `cap` warm-worker subprocess instances.
  When two concurrent `/synthesize` requests arrive:
  1. Request 1 acquires the semaphore (count 1→0) and dispatches to worker-0.
  2. Request 2 arrives while worker-0 is busy. Semaphore count = 0 → no free worker.
     Pool size (1) < cap (2) → spawn worker-1 lazily.
  3. Request 2 acquires a slot on worker-1 (via a per-worker mechanism).
  4. Both inferences run concurrently in separate subprocess instances.
  5. On completion, both slots are released.
- **OOM on spawn (INV-10):** if spawning worker-1 raises `MemoryError` or the subprocess exits
  immediately, log `WARNING: XTTS worker-1 failed to spawn (OOM?); capping at 1 concurrent worker`.
  Reduce `cap` in the manager to 1. The pending request waits for worker-0 to free, then proceeds.
  No render crash; no unhandled exception propagates to the chapter job.
- **Voxtral concurrency:** the `/synthesize` endpoint now being async means concurrent Voxtral
  requests are handled by the event loop without blocking each other. No warm worker means no
  serialization lock. Concurrency is limited only by Mistral API rate limits (outside this task).
- **No engine-ID branching (INV-5):** the pool/semaphore sizing is driven by
  `plugin.manifest.behavior.max_concurrent_workers` (from 001's cap declaration) — not by
  `if engine_id == "xtts"` checks in the server or manager.

## Steps (ordered)

1. **Write the failing tests first** (see Tests section). Confirm they are red on current code.
2. In `app/tts_server/server.py`, convert the `synthesize` endpoint to `async def synthesize(...)`.
   Wrap `plugin.engine.synthesize(req)` (L614) in `await run_in_threadpool(plugin.engine.synthesize, req)`
   (Starlette's `run_in_threadpool` from `starlette.concurrency`). Verify the endpoint still returns
   the same dict shape.
3. In `plugins/tts_xtts/plugin/core/warm_worker.py`:
   a. In `WarmWorkerManager.__init__` (≈ L291 region), replace `self._lock = threading.Lock()` with
      `self._sem = threading.Semaphore(cap)` and `self._pool: list[WarmWorker] = [self._spawn_worker()]`
      (one worker at startup — pre-spawn only the first, not all N).
   b. Implement `_spawn_worker() -> WarmWorker | None` — constructs and starts a new `WarmWorker`;
      returns `None` on failure (logs warning).
   c. Rewrite `WarmWorkerManager.run_job` (L298): acquire `self._sem`; if no free worker exists in
      the pool and `len(self._pool) < cap`, try `_spawn_worker()`; if spawn fails, log + reduce cap;
      dispatch to any alive pool member via round-robin or least-loaded; release `self._sem` on completion.
4. In `tts_server.py`, verify the uvicorn invocation (L152) uses a mode compatible with the async
   endpoint (e.g. `loop="asyncio"` or default uvicorn behavior for ASGI is fine). No worker count
   change needed.
5. For Voxtral: inspect the plugin's engine entry for any `threading.Lock`. If found, replace with
   a rate-limit `Semaphore` or remove. Confirm concurrent requests do not block each other.
6. Revert-check (R1): stash the semaphore/lazy-spawn changes; run the concurrent-request test;
   confirm it serializes (red). Restore; confirm concurrent execution (green).
7. Verify cap=1 regression: run the existing XTTS plugin tests and synthesis integration tests;
   assert no behavioral change.
8. Update specs: `design-docs/specs/system-architecture.md` (note TTS server concurrent inference
   model; bump `spec_version` + changelog row).

## Tests (TDD — write first)

Tests go in `plugins/tts_xtts/tests/test_concurrent_inference.py` (new file) and
`tests/tts_server/test_server_concurrency.py` (new file).

### Test 1 — Semaphore admits N concurrent workers (unit, R1 revert-check)

```python
# In plugins/tts_xtts/tests/test_concurrent_inference.py
def test_semaphore_admits_cap_concurrent_jobs(monkeypatch):
    cap = 2
    # Patch _spawn_worker to return a mock WarmWorker that reports itself alive
    # and completes immediately after a threading.Event is set.
    manager = WarmWorkerManager(cap=cap)
    barrier = threading.Barrier(cap)  # both jobs must be in-flight simultaneously
    results = []

    def fake_job(release_event):
        barrier.wait()  # both arrive before either finishes
        release_event.wait()
        return {"rc": 0, "output": b""}

    threads = [threading.Thread(target=lambda: results.append(manager.run_job(...))) for _ in range(cap)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=5)
    assert len(results) == cap  # both completed, not deadlocked
```

The key assertion: both threads pass `barrier.wait()` simultaneously, proving they were in-flight
concurrently. On pre-fix code with `threading.Lock`, the second thread blocks on lock acquisition
and the barrier never completes → `Barrier` timeout → test fails (red). Post-fix: green.

### Test 2 — Lazy spawn: N-th worker spawned only on demand

Mock `_spawn_worker`. Assert it is called **once** at `WarmWorkerManager.__init__` (worker-0 only).
Send one `run_job` → assert `_spawn_worker` call count = 1. Send two concurrent `run_job` calls
(using threads + barrier) → assert `_spawn_worker` call count = 2 (worker-1 spawned on demand).
Confirm worker-1 is NOT spawned until the second concurrent request arrives.

### Test 3 — OOM fallback: cap reduces to 1 on spawn failure

Mock `_spawn_worker` to return `None` on the second call (simulating OOM). Send two concurrent
`run_job` calls. Assert: only one runs at a time (serialized); a warning is logged containing
`"OOM"` or `"failed to spawn"`; no exception propagates; both jobs eventually complete.

### Test 4 — `/synthesize` endpoint is non-blocking (server concurrency test)

In `tests/tts_server/test_server_concurrency.py`, use `httpx.AsyncClient` against a live
`TestClient(app)` (or `ASGITransport`). Send two concurrent POST `/synthesize` requests with
monkeypatched `plugin.engine.synthesize` that sleeps 0.1s (via `asyncio.sleep` / thread sleep).
Assert both requests complete in < 0.25s total (i.e., they ran concurrently, not 0.1 + 0.1 = 0.2s
sequentially). On pre-fix synchronous endpoint: total ≥ 0.2s and requests are serialized.

### Test 5 — cap=1 regression (golden path)

Run the existing `plugins/tts_xtts/tests/` suite with `cap=1` (default). Assert no test failures —
the semaphore(1) path produces identical behavior to the old `Lock` path.

### Mock boundaries (R2)

- Mock: subprocess spawning (`WarmWorker.__init__` / process start), `plugin.engine.synthesize`
  (the TTS engine itself — outside the unit under test), filesystem artifact writes.
- Do NOT mock: `WarmWorkerManager` itself, `threading.Semaphore`, `run_in_threadpool` — those are
  the units under test.

### Timing (R4)

- Use `threading.Barrier` + `threading.Event` for synchronization in concurrency tests.
- Use wall-clock assertions only where strictly necessary (Test 4); keep tolerances generous (2×).
- No `time.sleep` in test body — use the barrier pattern for deterministic synchronization.

**Commands:**
```
./venv/bin/python -m pytest plugins/tts_xtts/tests/test_concurrent_inference.py -q
./venv/bin/python -m pytest tests/tts_server/ -q
./venv/bin/python -m pytest plugins/tts_xtts/tests/ -q  # regression
ruff check plugins/tts_xtts/plugin/core/warm_worker.py app/tts_server/server.py tts_server.py
```

## Acceptance criteria

- [ ] With cap=1: behavior byte-identical to today — same XTTS inference serialization, same
      endpoint response shape, same error handling. Existing XTTS plugin tests green (INV-1).
- [ ] With cap=2: two concurrent `/synthesize` requests dispatch to two separate XTTS warm-worker
      subprocess instances and run concurrently (confirmed by the barrier test, not just timing).
- [ ] Worker-1 (and N-th worker generally) is **never pre-spawned** — only created when a second
      concurrent request actually arrives and all existing workers are busy (INV-10 lazy-spawn).
- [ ] On OOM / spawn failure for the N-th worker: a warning is logged; the effective cap is reduced
      to the current live pool size; the pending request waits for a free worker; no render crash;
      no unhandled exception (INV-10 fail-safe).
- [ ] The `/synthesize` endpoint is `async def` and uses `run_in_threadpool` (or equivalent) so the
      uvicorn event loop is not blocked during inference.
- [ ] Voxtral (remote API) engine: concurrent requests are not serialized by any `threading.Lock`
      in the plugin.
- [ ] Pool/semaphore sizing is driven by `manifest.behavior.max_concurrent_workers` (from task 001)
      — no `if engine_id == "xtts"` branching (INV-5).
- [ ] R1 revert-check: the concurrent-request test is demonstrably red on pre-semaphore code
      (lock serializes both requests; barrier deadlocks or times out).
- [ ] `design-docs/specs/system-architecture.md` updated: TTS server concurrent inference model;
      version bump + changelog row.
- [ ] `ruff check` clean on all touched files.

## Map links

- `01-map.md` Part **E** (TTS-server concurrent inference);
  invariants **INV-1** (ships dark / cap=1 identical), **INV-5** (no engine-ID branching),
  **INV-10** (VRAM-aware, fail-safe lazy spawn);
  risk **R-B** (VRAM ceiling for N XTTS instances).
- Connection **E ↔ B** (`01-map.md` §Connections): server-side semaphore and orchestrator-side
  semaphore (task 001, `resources.py`) are two enforcement points for the same cap number — both
  must read `manifest.behavior.max_concurrent_workers`.
- Milestone **M-PAR-1** ("ships dark"): this task can land together with 001 — cap+server
  concurrency exist, default 1 = no behavior change, safe to land pre-release.

## Out of scope

- Per-segment dispatch isolation in the orchestrator (`_dispatch` closure) → **task 003**.
- Stitch-order barrier, cancel/recovery under parallelism → **task 005**.
- Frontend `active_segments_map` threading → **task 006**.
- ETA throughput model under parallelism → **task 007**.
- CUDA stream concurrency inside a single XTTS model instance — **explicitly excluded**; the model
  is autoregressive and not thread-safe within one process. Separate subprocess instances only.
- Multi-GPU / distributed rendering — Phase 2 / out of scope entirely.
- Live per-engine worker sliders / throughput diagnostics panel — Phase 2.
