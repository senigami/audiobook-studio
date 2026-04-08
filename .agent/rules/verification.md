# Verification Rules

## 1. Test Expectations

- Every code change must be verified with the relevant tests and linting.
- When writing new logic, add or update tests to reflect the intended behavior.
- Prefer true TDD when practical.
- Test business behavior and user outcomes, not only implementation details.

## 2. Studio 2.0 Verification Expectations

- For migration work, verify both the new behavior and the cutover safety where practical.
- High-risk Studio 2.0 changes should cover restart recovery, stale-artifact detection, and parent-child queue behavior when relevant.
- Frontend state changes should be verified for reload and reconnect behavior, not just initial render.

## 3. Execution Protocol

- Run `./venv/bin/python -m pytest` after backend or shared-logic changes.
- Run Ruff and any relevant frontend tests/build steps after frontend or shared changes.
- Document what you ran and whether it passed.

## 4. Definition Of Done

Work is not done until:

1. Relevant linting passes.
2. Relevant tests pass.
3. Cross-layer handoffs are verified when the change crosses boundaries.
4. Plans, docs, and wiki are updated when architecture or behavior changed.
5. `wiki/Changelog.md` has a dated entry when shipped behavior changed.
