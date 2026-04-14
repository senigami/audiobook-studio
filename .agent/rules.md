# Agent Rules

This is the router for repository rules.

## Task Map

Use the smallest rule set that matches the task.

1. Always read [`verification.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/verification.md) before calling code work complete.
1. For frontend UI or UI-state work, read [`frontend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend.md), the relevant frontend subfile(s), and [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md).
1. For frontend state ownership or overlays, read [`frontend-state.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-state.md) plus [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md).
1. For frontend UX, recovery, waiting, or editor-flow work, read [`frontend-ux.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-ux.md) plus [`frontend-state.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-state.md) when state ownership is involved.
1. For frontend interaction, styling, semantics, or responsive layout work, read [`frontend-interactions.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-interactions.md).
1. For backend progress or ETA work, read [`backend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend.md), [`backend-progress.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-progress.md), and usually [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md).
1. For artifact publication or recovery work, read [`backend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend.md), [`backend-artifacts.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-artifacts.md), and usually [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md).
1. For backend path handling, read [`backend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend.md) and [`backend-paths.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-paths.md).
1. For routing, service boundaries, queue policy, or migration shape, read [`backend.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend.md), [`backend-boundaries.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-boundaries.md), and [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md).
1. For plan, rollout, or documentation changes, read [`workflow.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/workflow.md) and usually [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md).

## What Matters Most

- Verify changes with the relevant tests and linting before calling work complete.
- Use the local `./venv` for backend tooling.
- Update tests when behavior or logic changes.
- Fix concrete bugs or regression risks in the same pass.
- Keep implementation docs, wiki pages, and `wiki/Changelog.md` aligned with shipped behavior.
- Treat paths, assets, and output publication as security-sensitive.
- Prefer the better long-term boundary when a quick fix would deepen worker-centric or UI-state coupling.

## Rule Ownership

- The agent owns the organization and maintainability of `.agent/rules.md`, `.agent/rules/`, and related agent guidance files.
- The agent may restructure, split, rename, cross-link, and refine these rule files without asking for additional permission when doing so improves discoverability, routing, or long-term usability.
- Normative, repo-level guidance should live in the rules files.
- Durable repo learnings, heuristics, and reminders that are useful to the agent but are not yet normative rules may be stored in [`notes.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/notes.md).
