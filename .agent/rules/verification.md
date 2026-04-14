# Verification Rules

Use this file whenever you change code, behavior, tests, or migration paths.

## Core Rules

- Every code change must be verified with the relevant tests and linting.
- When writing new logic, add or update tests to reflect the intended behavior.
- Prefer true TDD when practical.
- Test business behavior and user outcomes, not only implementation details.
- For migration work, verify both the new behavior and the cutover safety where practical.
- High-risk Studio 2.0 changes should cover restart recovery, stale-artifact detection, and parent-child queue behavior when relevant.
- Frontend state changes should be verified for reload and reconnect behavior, not just initial render.
- Run `./venv/bin/python -m pytest` after backend or shared-logic changes.
- Run Ruff and any relevant frontend tests/build steps after frontend or shared changes.
- Document what you ran and whether it passed.
- Work is not done until relevant linting passes, relevant tests pass, cross-layer handoffs are verified when applicable, and plans/docs/wiki are updated when behavior changed.
- `wiki/Changelog.md` needs a dated entry when shipped behavior changed.
