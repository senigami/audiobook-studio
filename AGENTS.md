# Agent Instructions

Treat `.agent/rules.md` and the `Memory/` folder as the local source of truth for repository workflow, project state, and session continuity.

At the start of substantial work, read the relevant Memory files first, especially `Memory/rules.md`, `Memory/state.json`, `Memory/active_context.md`, and any current handoff or plan files that match the task. If the work touches architecture, progress, queues, delegation, phase planning, or project organization, check the relevant memory and handoff docs before making assumptions.

Use `.agent/rules.md` as the router for normative repo guidance. Load the smallest matching rule set from `.agent/rules/`, and always include `.agent/rules/verification.md` before calling code work complete.

Use `Memory/` to track durable project context, verified milestones, active risks, and next steps. After verified work lands, update `Memory/state.json` and append a concise note to `Memory/session_logs.md`. Treat Memory as shared agent memory, not runtime app state.

## Collaboration

- Codex owns architecture direction, final review, integration, verification, and checkpoint quality.
- Use Antigravity/Gemini for bounded, non-trivial, or parallelizable work when delegation will save local context.
- Handoff prompts should be compact and JSON-style with exact files in scope, current known state, non-goals, verification commands, and required response format.
- Verify worker output locally before trusting it.

## Architecture

- Prefer explicit, behavior-based code changes over hardcoded legacy branching.
- Do not reintroduce legacy cutover flags or app-level checks tied to specific engine names when plugin metadata or helper functions can express the behavior instead.
- Preserve the human-readable project layout described in `.agent/rules/modular_architecture.md`.
- Keep frontend runtime code, frontend tests, backend packages, backend tests, and plugin-local code separated by clear ownership.
- Plugin folders should remain self-contained mini-repos where plugin-specific tests, fixtures, verification assets, and generated test outputs stay local to the plugin.

## Work Style

- If the repo rules, Memory, and current diff disagree, inspect the actual files and trust the repository state over assumptions.
- Check the repository before asking questions that the code can answer.
- Keep local work small when the fix is surgical.
- Avoid broad rewrites when a narrow patch will do.
- Prefer the smallest safe change that preserves correctness and keeps future cleanup easy.
- When a task is bigger than a quick local fix, draft the next Antigravity/Gemini prompt instead of expanding the local token footprint.

## Testing

Follow red -> green -> refactor for new behavior and bug fixes:

1. Write the failing test first.
1. Run it and confirm it fails for the right reason.
1. Write the minimum code to make it pass.
1. Run it and confirm it passes.
1. Refactor only after the behavior is green.

For rules-only documentation changes, run lightweight verification such as `git diff --check` and inspect the diff.

## Canonical specs

Read `design-docs/specs/README.md` before changing behavior in any area — it routes to the binding spec for that domain. Specs and code are jointly authoritative; resolve drift explicitly in the same change, and bump the spec's version + changelog when shipped behavior changes. Architectural rationale lives in `design-docs/decisions/` (ADRs).

## Planning docs

The canonical plan home is `design-docs/plans/`. The master task list is `design-docs/plans/TASKS.md`. Plans for active work live under `design-docs/plans/active/<task-slug>/`; completed and archived plans move to `design-docs/plans/_archive/`. The index of all plans is `design-docs/plans/README.md`.

When creating or updating a plan:
- Place it in `design-docs/plans/active/<task-slug>/`, not outside the repo or in `docs/`.
- Register every task in `TASKS.md` using its existing checkbox format (`[ ]`/`[~]`/`[x]`, indentation, `👁 VISUAL CHECK` markers) — never invent a parallel format.
- Add a row to `design-docs/plans/README.md` under the correct bucket.
- Keep both the per-plan task files and `TASKS.md` in sync in the same commit; drift between them is the most common planning failure.
