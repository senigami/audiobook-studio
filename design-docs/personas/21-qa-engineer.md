# 21 · "Marcus Webb" — QA Engineer  ☆ INFERRED

**Identity:** "A regression-focused QA engineer who believes a fix is only a fix when it handles the exact failure mode — not just the happy path — and who will not mark a bug closed until he has a test that is red before the fix and green after."

## Goals
- Reproduce reported bugs precisely, with the smallest possible setup sequence, before writing any test
- Verify that fixes hold across the full failure surface: reload, reconnect, cancel mid-render, segment-DB divergence
- Catch contract regressions early — a WebSocket frame shape change or a status field rename should fail a test before it reaches the UI
- Ensure that the conftest isolation model is working: tests that pass because they share state from a prior test are false greens
- Keep per-test runtime under 15 seconds; flag any test that requires real sleep or a live subprocess unless explicitly justified

## Context & environment *(INFERRED)*
- Works on macOS; runs pytest with `-q` and targeted file paths to keep feedback loops short
- Came to the project after a series of bug reports that were "fixed" but immediately regressed — his mandate is to build a regression harness that makes regressions visible
- Runs the backend suite with `./venv/bin/python -m pytest -q` and the frontend suite with `npm -C frontend run test -- --run`; cross-references failures across both before filing
- Reads `design-docs/specs/testing-standards.md` before writing any new test; treats R1–R4 as hard rules
- Maintains a personal list of "known flaky" tests and files issues when a test's pass/fail rate is inconsistent across CI runs

## Key workflow moments
- **Bug reproduction:** Given a bug report ("segment shows as complete in the UI but the WAV file is missing"), builds the smallest state sequence that triggers it — no extra chapters, no UI interaction beyond what's necessary
- **Revert-check:** Before committing a fix + test, stashes the fix, runs only the new test, confirms it is red for the right reason (the described failure, not a setup error), then restores
- **Cancel-mid-render path:** Submits a render job, cancels it while a segment is in-flight, then reloads the page and verifies the UI and DB agree on job state — not just one or the other
- **WebSocket reconnect test:** Simulates a WebSocket disconnect mid-progress-stream, reconnects, and verifies the client re-subscribes and receives the current state rather than replaying from 0% or staying stale
- **Isolation audit:** Runs the full suite twice in a row without clearing state between runs; any test that passes on the second run but not the first (or vice versa) is an isolation bug

## Top friction points *(INFERRED)*
- **F1 — Segment/DB divergence is hard to set up:** The failure mode where a WAV file exists on disk but the DB says the segment is not rendered (or vice versa) requires reaching into internal state that is not exposed via any test helper. Marcus ends up calling private functions or writing to the DB directly, which is fragile across refactors.
- **F2 — WebSocket reconnect has no test fixture:** The conftest provides a WebSocket client but no helper that simulates a mid-stream disconnect and reconnect. Tests for reconnect behavior are either absent or use real `asyncio.sleep` delays, violating R4.
- **F3 — Clear state is incomplete:** `clear_all_jobs` resets in-memory job state but does not clear on-disk segment WAVs written during the test. A test that checks "segment has no audio" can fail if a prior test wrote audio to the same temp path and the GC hasn't run yet.
- **F4 — Contract-shaped frames not always enforced:** Some frontend tests build raw socket frame literals instead of using `publishStudioSocketMessage` and the typed contracts in `liveEvents.ts`. When the contract changes, those tests stay green by accident rather than catching the regression.

## What they need from the studio
- A `make_divergent_segment` test helper (or conftest fixture) that creates a segment in a specified disk/DB divergence state without reaching into internals
- A WebSocket test helper that supports simulated disconnect and reconnect with explicit synchronization, not sleep
- `clear_all_jobs` extended (or a companion `clear_all_artifacts`) that removes segment WAVs written to the test temp dir, making segment-existence assertions reliable
- CI enforcement that frontend tests use `publishStudioSocketMessage` + typed contracts — a lint rule or test-time assertion that catches raw frame literals
- A test-quality classification that marks tests using real sleep or live subprocesses as explicitly justified rather than silently acceptable

## Review lens — questions they ask of any screen
- "Is this test red before the fix and green after — for the right reason?"
- "What is the smallest state sequence that reliably reproduces this failure, without extra setup that might mask it?"
- "Does this test cover the reconnect case, the cancel-mid-render case, and the reload case — or just the happy path?"
- "If a prior test in the suite writes state that this test reads, will this test give a false green?"
- "Is this frontend test building a socket frame from the typed contract, or from a hand-rolled literal that will silently survive a contract rename?"
- "Does `clear_all_jobs` also clear the on-disk artifacts this test depends on, or only the in-memory state?"
- "Is this test's pass rate consistent across five consecutive CI runs, or does it have a flakiness pattern?"

## Red flags that make them quit or distrust the app
- A test that is green before and after the fix — the revert check never goes red — meaning the test does not actually cover the failure mode
- A test that passes only when run in isolation but fails when run as part of the full suite, indicating shared state leakage
- A WebSocket test that uses `time.sleep(0.5)` or `asyncio.sleep(0.1)` as its synchronization mechanism — timing-dependent and inherently flaky
- A frontend contract test that passes after a breaking rename because it was using a string literal rather than the typed import
- A "fix" that changes the happy-path behavior but leaves the specific edge case — cancel mid-render, DB/disk divergence — untested and unfixed

**Evidence basis:** INFERRED. Interview QA engineers or senior developers who own the regression test suite; key open question is whether the segment/DB divergence setup gap is blocking real regression tests or whether engineers are working around it with acceptable (if fragile) internal-access patterns.
