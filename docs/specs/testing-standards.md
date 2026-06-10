# Testing Standards

**spec_version:** 1.0

## Changelog

- **1.0** (2026-06-10) — Initial spec, promoted from CLAUDE.md rules R1–R4 and the classification rubric in doc 17.

## Purpose

During the queue debugging effort, tests repeatedly claimed to cover behavior that later broke in production—the tests asserted the wrong thing, mocked away the code under test, or passed vacuously. This spec defines the four binding rules and review vocabulary that prevent false coverage going forward, ensuring tests exercise real observable behavior with realistic production scenarios.

## The Four Rules

### R1 — Revert-check every bug-fix test

**Rule:** Every test that lands alongside a bug fix must fail on the pre-fix code. A reviewer or agent must actually verify this: stash the fix, run the test, confirm it turns red, restore the fix.

**Why:** Tests written after the fix often pass on both correct and buggy code; revert-checking exposes whether the test actually exercises the bug.

**Good example:**
```python
def test_processing_queue_reconciles_db_running_row_when_memory_job_is_done():
    """Regression: DB running row must transition to done when in-memory job is done.
    
    Before fix: DB row stayed 'running' even after in-memory job completed.
    Test was added and fails on pre-fix code (DB row still 'running').
    """
    create_and_enqueue_job(state, "ch1")
    job = get_job(state, job_id)
    mark_done(job)
    
    # After fix, GET /api/queue reconciles DB:
    response = client.get("/api/queue")
    rows = response.json()["processing_queue"]
    assert rows[0]["status"] == "done"  # Would fail before fix
```

**Bad example:**
```python
def test_job_reconciliation():
    # No assertion on what changed; passes even if fix deleted
    result = reconcile()
    assert result is not None
```

---

### R2 — Mock boundaries only

**Rule:** A test may mock only what is *outside* the unit under test (network, clock, filesystem, the TTS engine itself, websocket frame capture at the boundary). Never mock the module the test file is named for, and never mock the internals of the state-store function under test.

**Why:** Mocking the code under test defeats the test; the mock becomes the spec and real bugs hide behind it.

**Good example:**
```python
# tests/api/test_api_queue.py
def test_queue_api():
    """Real queue API, real state, only the orchestrator mocked."""
    with patch("app.orchestration.orchestrator.TaskOrchestrator.submit"):
        response = client.post("/api/queue", json={"chapter_id": "ch1", ...})
        assert response.status_code == 200
        # Real queue code executed; only the job submission boundary mocked
```

**Bad example:**
```python
# tests/db/test_state_jobs.py
def test_put_job_updates_state():
    """Mocks put_job — the very function being tested."""
    with patch("app.db.state_jobs.put_job") as mock_put:
        mock_put.return_value = {"id": "j1"}
        result = put_job(...)
        assert mock_put.called  # Exercises the mock, not the function
```

---

### R3 — Contract-shaped event frames

**Rule:** Frontend live-event tests must build socket frames using the contract types in `frontend/src/api/contracts/liveEvents.ts` and publish through `publishStudioSocketMessage`, ensuring compile-time type safety. Never hand-roll untyped object literals for socket frames the app receives.

**Why:** Type-unsafe frame literals let tests pass with frames the backend never sends, creating false confidence in the frame contract and missing real integration bugs.

**Good example:**
```typescript
// frontend/tests/unit/hooks/useQueueSync.test.tsx
import { StudioQueueEvent } from '@api/contracts/liveEvents';  // Contract type

it('updates queue when item added', async () => {
  const frame: StudioQueueEvent = {
    type: 'queue',
    version: 1,
    data: { added: [{ id: 'j1', ... }], removed: [], updated: [] }
  };
  publishStudioSocketMessage(frame);
  
  await waitFor(() => {
    expect(getByRole('listitem')).toHaveTextContent('j1');
  });
});
```

**Bad example:**
```typescript
it('updates queue when item added', async () => {
  // Untyped literal; compiler doesn't check field names or nesting
  socket.emit('message', {
    type: 'queue',
    data: { added: [{ id: 'j1' }] }
    // Missing 'version', 'removed', 'updated'; test passes anyway
  });
  await waitFor(...);
});
```

---

### R4 — No sleep-based timing

**Rule:** Do not use `setTimeout(n)`, `sleep(n)`, or other wall-clock delays to wait for async behavior. Use vitest fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime()`) on the frontend, and explicit synchronization (threading events) in pytest on the backend.

**Why:** Sleep-based tests are slow, flaky (timeout on overloaded CI), and hide real synchronization bugs. Fake timers make timing deterministic and tests run in milliseconds.

**Good example (frontend):**
```typescript
it('resyncs after a short delay so fast jobs do not get stuck in queued state', async () => {
  vi.useFakeTimers();
  
  addProcessingQueue({ chapter_id: 'ch1', ... });
  
  // Fast job completes and calls fetchChapters
  vi.advanceTimersByTime(100);
  
  // Resync fires 100ms later
  vi.advanceTimersByTime(100);
  
  await waitFor(() => {
    expect(mockFetchChapters).toHaveBeenCalledTimes(3); // initial, fast, resync
  });
});
```

**Bad example:**
```typescript
it('resyncs after a short delay', async () => {
  addProcessingQueue(...);
  
  await sleep(200);  // Waits real 200ms; slow, flaky
  
  expect(mockFetchChapters).toHaveBeenCalledTimes(3);
});
```

**Good example (backend pytest):**
```python
def test_job_timeout_recovery():
    """Explicit threading event, no sleep."""
    job_started = threading.Event()
    job_done = threading.Event()
    
    def mock_engine_run(request):
        job_started.set()
        job_done.wait(timeout=1)
        return result
    
    with patch("bridge.synthesize", side_effect=mock_engine_run):
        submit_job(...)
        
        # Wait for engine to start (not a fixed sleep)
        assert job_started.wait(timeout=2)
        
        # Cancel the job
        mark_job_cancelled(job_id)
        job_done.set()
        
        # Verify recovery logic fired
        assert get_job(job_id).status == "cancelled"
```

---

## Classification Rubric

Use this vocabulary when auditing tests:

- **VACUOUS** — Passes regardless of the behavior it names. Smells: no assert on actual output (only "doesn't throw"); asserting a mock was called with the same value the test provided; `assert result is not None` on something that cannot be None; try/except swallowing assertions.

- **MOCKED-OUT** — The code path under test is itself mocked, so the test exercises the mock, not the real code. Smells: patching the function the test name claims to test; frontend tests stubbing the store/hook being verified; fetch mocks that bypass `parseApiResponse` or other parsing logic the test claims to validate.

- **WRONG-SCENARIO** — Asserts a behavior the product doesn't (or shouldn't) have, or sets up state that cannot occur in production (e.g., queue rows in combinations the code never produces). These rot into "the test is the spec now" hazards and miss real bugs when the spec changes.

- **FRAGILE** — Asserts incidental details (exact strings, timing/sleeps, ordering that isn't contractual) so it breaks on harmless changes and trains people to update tests without thinking.

- **REAL** — Sets up a production-plausible scenario, exercises unmocked code under test under realistic conditions, and asserts the externally observable contract. (Sleep-based timing is FRAGILE even if the scenario is otherwise REAL; use fake timers instead.)

**Disposition:**
- VACUOUS/MOCKED-OUT → Rewrite as REAL if the behavior matters, else delete.
- WRONG-SCENARIO → Delete or correct the scenario.
- FRAGILE → Loosen to contractual assertions; replace sleep with fake timers or events.
- REAL → Keep.

---

## Conformance Checklist

When reviewing a new test, verify all five items:

1. **Is it revert-checked?** (R1) If a bug fix lands with it, was the fix stashed and the test confirmed red on pre-fix code?
2. **Are only boundaries mocked?** (R2) The test does not patch the module named in the test filename or the state-store internals of the function under test.
3. **Are frames contract-typed?** (R3 for frontend socket tests) Socket/websocket test frames are built from `liveEvents.ts` types and published via `publishStudioSocketMessage`, not hand-rolled literals.
4. **No sleep-based timing?** (R4) Timing assertions use fake timers or threading events, not `sleep()`/`setTimeout(n)`.
5. **Classify and justify.** Name the classification (VACUOUS/MOCKED-OUT/WRONG-SCENARIO/FRAGILE/REAL) and cite the production scenario it covers (or why it was deleted).

---

## Classification Tables & Audit Records

Test classification tables live under `plans/final_release/audits/`:
- `test_audit_queue_jobs.md` — Queue/job lifecycle tests (T1)
- `test_audit_progress_segments.md` — Segment/progress tests (T2)
- `test_audit_frontend_components.md` — Frontend websocket/socket tests (T3 scope)
- `test_audit_api_part1.md`, `test_audit_api_part2.md` — API tests (T4)
- `test_audit_backend_misc.md` — Remaining backend suites (T4)

Each table documents the file, test name, classification, action taken (KEEP/DELETE/REWRITE), and notes. Use these tables as the record of audit decisions and reference them in code review.

---

## See Also

- **CLAUDE.md** — High-level testing guidance and isolation setup (conftest, timeouts).
- **doc 17** (`plans/final_release/17_test_quality_audit.md`) — Full audit strategy and priority sequencing.
- **doc 18** (`plans/final_release/18_canonical_specs.md`) — Spec versioning and conformance conventions.
