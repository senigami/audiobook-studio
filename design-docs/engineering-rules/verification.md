# Verification Rules

Use this file whenever you change code, behavior, tests, or migration paths.

## Core Rules

- Every code change must be verified with the relevant tests and linting.
- For every new behavior or bug fix, follow red -> green -> refactor unless there is a clear reason not to:
  1. write the failing test first
  2. run it and confirm it fails for the intended reason
  3. write the minimum implementation
  4. rerun the test and confirm it passes
  5. refactor while keeping the test green
- When writing new logic, add or update tests to reflect the intended behavior, including important edge/error paths.
- Test business behavior and user outcomes, not only implementation details.
- Test code should read like a specification. Prefer clear, explicit setup over over-abstracted helpers that hide the contract under test.
- Avoid low-value assertions such as `toBeDefined`, `toBeTruthy`, loose length checks, static-copy-only checks, or mocked passthroughs that do not prove behavior.
- When modifying a test file, audit nearby tests you touch or rely on; rewrite weak adjacent assertions when they would undermine the new contract.
- Do not weaken assertions, skip tests, or delete coverage just to make a run green. Classify the failure as a production bug, intentional contract change, obsolete test, or brittle test before changing it.
- For migration work, verify both the new behavior and the cutover safety where practical.
- High-risk Studio 2.0 changes should cover restart recovery, stale-artifact detection, and parent-child queue behavior when relevant.
- Frontend state changes should be verified for reload and reconnect behavior, not just initial render.
- **A live backend/TTS render is not a precondition for visual confidence — simulate it.** When a fix's observable effect is "does this render/highlight/animate correctly," build a FULL simulated harness (mock every network + websocket boundary, drive the REAL running app/component tree with realistic data shaped exactly like the real backend's wire contract) BEFORE telling the owner a live check is needed. This repo already has the tooling for this at every layer — Playwright's `page.route`/`page.routeWebSocket` for full-app E2E (see `frontend/tests/e2e/`), vitest + `renderHook`/RTL for hook/component-level simulation, and pytest fixtures that drive real dispatch code with only the true engine boundary mocked (R2) for backend behavior. "I can't verify without a live render" is very rarely actually true; it usually means the simulated harness hasn't been built yet. The owner's own manual visual check should be answering "does this look and feel right to me" (a taste/polish question), not "does the plumbing work at all" (a question simulation should have already answered). If a manual check is still requested after simulated verification, say explicitly what remains genuinely impossible to simulate (e.g., actual model-load timing, audio correctness) — don't default to "please verify" as a substitute for building the harness.
- Run `./venv/bin/python -m pytest` after backend or shared-logic changes.
- Run Ruff after backend or Python changes.
- Run relevant frontend Vitest tests, `cd frontend && /opt/homebrew/bin/npm run build`, and `cd frontend && /opt/homebrew/bin/npm run lint` after frontend or shared TypeScript changes when the scope warrants full confidence.
- Narrow tests are the first signal; they do not replace the broader affected suite before handoff or commit.
- Review the actual diff before handoff or commit. Look for correctness, edge cases, resource cleanup, type safety, accessibility, security, performance, test quality, and consistency with local patterns.
- Document what you ran and whether it passed.
- Work is not done until relevant linting passes, relevant tests pass, the self-review is complete, cross-layer handoffs are verified when applicable, and plans/docs/wiki are updated when behavior changed.
- `wiki/Changelog.md` needs a dated entry when shipped behavior changed.
