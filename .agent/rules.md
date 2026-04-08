# Agent Rules

This is the canonical entry point for repository rules.

Use this file as the quick summary, then read the focused rule files in `.agent/rules/` that apply to the task at hand.

## Read First

- Verify changes with the relevant tests and linting before calling work complete.
- Use the local `./venv` for backend tooling.
- Update tests when behavior or logic changes.
- Keep implementation docs, wiki pages, and `wiki/Changelog.md` aligned with shipped behavior.
- Treat project paths, asset paths, and output publication as security-sensitive and correctness-sensitive surfaces.
- For Studio 2.0 work, follow the plan set in `plans/` as architecture constraints, not optional ideas.
- Prefer the better long-term boundary when a quick fix would deepen worker-centric or UI-state coupling.

## Rule Map

- [`verification.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/verification.md)
  Verification requirements, migration validation, and definition of done.
- [`workflow.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/workflow.md)
  Ownership expectations, plan maintenance, documentation, and rollout discipline.
- [`backend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend.md)
  Backend correctness, artifact safety, path rules, and structural guidance.
- [`frontend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend.md)
  State ownership, UI recovery expectations, accessibility, and UX quality.
- [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md)
  Studio 2.0 architecture boundaries for engines, queueing, progress, and migration.

## Priority Order

1. Correctness and verification
2. Security and artifact/path safety
3. User-visible trust and recovery behavior
4. Maintainability and architectural consistency
