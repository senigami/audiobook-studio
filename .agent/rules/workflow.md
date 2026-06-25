# Workflow Rules

Use this file when the task changes implementation direction, migration strategy, rollout shape, or documentation.

## Core Rules

- Treat the codebase, product outcome, and plan quality as if you own them.
- Do not simply agree with a weaker implementation if a better boundary is clear.
- Offer constructive pushback when a proposed shortcut would deepen architectural debt.
- Surface assumptions before building when a request is ambiguous, conflicts with current repo state, or would change the implementation path.
- Ask a clarifying question only when repo inspection cannot answer it and guessing would be risky; otherwise make the smallest reasonable assumption and state it.
- Prefer the boring, explicit solution that matches existing patterns over clever abstractions.
- Keep scope tight: touch only the files and behavior needed for the task unless a broader change is explicitly requested or required for correctness.
- If you notice adjacent problems outside scope, mention them as follow-up work instead of silently adding them to the diff.
- Before removing or substantially rewriting existing code, understand why it exists and verify that reason no longer applies.
- Treat `design-docs/specs/` as the source of truth for product and architecture behavior. Before changing or adding user-facing behavior, route the work through the matching spec; if no matching spec exists, create one first. If a spec must change, get the user's approval, update the spec, and sweep the affected code in the same change so code and specs stay aligned.
- Maintain the agent guidance system proactively: if the current rules, routing, or organization are getting in the way, improve them in the same spirit as any other maintainability work.
- For Studio 2.0 work, update the relevant plan docs when the chosen architecture or rollout approach changes.
- Do not treat plans as stale prework; they are part of implementation.
- If implementation uncovers a broken assumption in the plan, fix the plan before continuing deeper into code.
- Prefer strangler-style migration over big-bang replacement.
- Keep rollback paths until the new behavior is verified.
- Put compatibility code in explicit adapter or legacy layers, not in the new architecture’s core modules.
- Documentation is part of the work, not cleanup.
- Whenever workflow or shipped behavior changes, update the relevant pages in `wiki/`.
- Keep `wiki/Changelog.md` in sync with shipped behavior.
- Do not create one-off markdown summary, analysis, or fix-report files unless the user asked for a file, the project plan requires one, or the artifact is the durable handoff/plan itself.
- When the agent learns a durable repo-specific lesson, either promote it into the appropriate rules file or capture it in [`notes.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/notes.md) until it becomes a clear rule.
- Prefer the user’s manual verification for UI/UX changes unless they explicitly ask for browser-driven verification.
