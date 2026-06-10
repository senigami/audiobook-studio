# 17 — Test Quality Audit

**Owner directive (2026-06-10):** existing tests are not trusted. During the queue debugging effort, tests were repeatedly claimed to cover a behavior and later the behavior broke anyway — the tests asserted the wrong thing, mocked away the very code under test, or passed vacuously. This doc audits every test for *real* coverage: remove bad tests, fix weak ones, and write real-scenario tests where claims of coverage were false.

Scope: `tests/` (pytest, 959 tests) and `frontend/tests/` (vitest, ~785 tests).

## 1. What makes a test "bad" here (the rubric)

Classify every test into one of:

- **VACUOUS** — passes regardless of the behavior it names. Smells: no assert on the actual output (only "doesn't throw"); asserting a mock was called with the same value the test passed in; `assert result is not None` on something that can't be None; try/except swallowing the assertion.
- **MOCKED-OUT** — the code path under test is itself mocked, so the test exercises the mock. Smells: patching the function the test name claims to test; frontend tests stubbing the store/hook being verified; fetch mocks that bypass `parseApiResponse`-style logic the test claims to validate.
- **WRONG-SCENARIO** — asserts a behavior the product doesn't (or shouldn't) have, or sets up state that can't occur in production (e.g. queue rows in combinations the writer never produces). These rot into "the test is the spec now" hazards.
- **FRAGILE** — asserts incidental details (exact strings, ordering that isn't contractual, timing/sleeps) so it breaks on harmless changes and trains people to update tests without thinking.
- **REAL** — sets up a production-plausible scenario, exercises unmocked code under test, and asserts the externally observable contract.

Disposition: VACUOUS/MOCKED-OUT → rewrite as REAL if the behavior matters, else delete. WRONG-SCENARIO → delete or correct the scenario. FRAGILE → loosen to contractual assertions.

## 2. Priority order (audit where the pain was)

- [ ] **T1. Queue/job lifecycle tests** — `tests/db/test_db_queue.py`, `test_db_reconcile.py`, `test_state_queue_sync.py`, `test_state_rules.py`, `test_clear_logic.py`, the new `test_state_jobs_broadcast.py`; frontend `tests/unit/hooks/useQueueSync.test.tsx`, `useJobs.test.tsx`. This is where false coverage already burned us. For each test: name the production scenario it represents; if you can't, it's WRONG-SCENARIO or VACUOUS.
  *Accept:* a written classification table (file → test → class → action taken); every surviving test maps to a documented lifecycle behavior in the Live Event Stream Contract (wiki) or doc 09.
- [ ] **T2. Segment/progress tests** — anything touching `segments`, chapter progress, `PredictiveProgressBar` (incl. doc 15's new ETA model tests when they land). Bar tests must assert displayed-progress invariants (monotonic unless backward allowed, lane transitions, floor honoring) against the real component — not a re-implementation of its math in the test.
- [ ] **T3. Websocket/event-stream tests** — frontend socket-bus driven tests: verify they publish realistic envelope frames (versioned, correct topics per doc 02) rather than hand-rolled shapes the app never sends. Any fixture frame that doesn't validate against `frontend/src/api/contracts/liveEvents.ts` is WRONG-SCENARIO.
- [ ] **T4. Remaining backend suites** — `tests/api`, `tests/domain`, `tests/engines`, `tests/utils`, etc. Lower priority sweep with the same rubric; bias toward deletion of vacuous tests over rewriting low-value ones.
- [ ] **T5. Coverage honesty check** — coverage % is currently 77% but that includes vacuous execution. After T1–T3, spot-check 10 random "covered" lines in `app/db/state_jobs.py`, `app/db/queue.py`, `frontend/src/hooks/useQueueSync.ts`: is there a test that would FAIL if that line's behavior inverted? Record the hit rate.

## 3. Standing rules going forward (add to CLAUDE.md / contributor docs)

- [ ] **R1.** Every bug fix lands with a test that fails on the pre-fix code. Reviewer (or agent) must actually revert-check: stash the fix, run the test, confirm red, restore. (The Stage 1a tests were written this way; keep it.)
- [ ] **R2.** A test may mock only what is *outside* the unit under test (network, clock, filesystem, the TTS engine) — never the module named in the test file.
- [ ] **R3.** Frontend live-event tests must build frames via the contract types in `liveEvents.ts` (compile-time enforcement) — no untyped object literals for socket frames.
- [ ] **R4.** No `sleep`-based timing assertions; use fake timers (vitest) / explicit synchronization (pytest threading events).

## 4. Execution

Run T1 immediately after Stage 1b (the fixes in 1b add more tests to audit in one pass), and gate Stage 1's exit on T1+T2: the queue/segment/progress suites must be classified and cleaned before the Stage 1 "full real render session" gate, because that gate relies on trusting them. T3 lands with Stage 3 (contract work) at the latest; T4/T5 may run in parallel with Stage 2.

*Final acceptance:* classification tables committed under `plans/final_release/audits/test_audit_*.md`; zero VACUOUS or MOCKED-OUT tests remaining in T1–T3 scope; rules R1–R4 recorded in CLAUDE.md.
