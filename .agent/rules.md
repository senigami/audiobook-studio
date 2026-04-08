# Agent Rules

This is the canonical entry point for repository rules.

Use this file as the quick-reference summary, then consult the focused rule files in `.agent/rules/` for the details that match the task.

## Read First

- Verify all changes with the appropriate test and lint commands before considering a task done.
- Use the local `./venv` for backend commands.
- Update tests when logic changes; do not weaken tests to fit broken behavior.
- Keep wiki docs and `wiki/Changelog.md` aligned with shipped behavior.
- Prefer manual verification by the user for UI changes unless they explicitly ask for browser-driven verification.
- Treat filesystem paths as a security surface; follow the backend security/path rules.
- Push back when the requested implementation is weaker than the better pattern already available in the repo.

## Rule Map

- [`verification.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/verification.md)
  Test-first expectations, verification commands, and definition of done.
- [`workflow.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/workflow.md)
  Ownership, pushback, documentation, and manual verification expectations.
- [`backend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend.md)
  Progress/state consistency, worker sync, path safety, and backend structural guidance.
- [`frontend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend.md)
  UI consistency, accessibility, responsiveness, and frontend quality guidance.
- [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md)
  Rules for engine abstraction, task genericity, and centralized progress tracking in Studio 2.0.

## Priority Order

When rules overlap, follow them in this order:

1. Verification and correctness
2. Security and data safety
3. User-visible behavior and documentation accuracy
4. Maintainability and consistency
