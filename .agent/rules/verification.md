# Verification Rules

## Test-Driven Updates

- Every code update must be verified by running the relevant existing test suite.
- When writing new code or modifying logic, update or add tests to reflect the new behavior.
- Prefer true TDD when practical: write the failing test first.
- Test business behavior and user outcomes, not the current implementation details.
- Do not edit tests just to match incorrect code. Fix the logic first.
- When a feature crosses layers, add or preserve integration coverage for the hand-off.

## Execution Protocol

- Run `./venv/bin/python -m pytest` after backend or shared-logic changes.
- Run frontend build/tests after UI changes.
- Document what you ran and whether it passed.

## Definition Of Done

A task is not done until:

1. Ruff and other relevant linting pass.
2. Backend tests pass for the affected area, and preferably the full suite when the change is broad.
3. Frontend tests/build pass when UI code changed.
4. Relevant docs/wiki pages are updated.
5. `wiki/Changelog.md` has a dated entry when behavior changed.
