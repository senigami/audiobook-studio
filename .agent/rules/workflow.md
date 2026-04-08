# Workflow Rules

## 1. Ownership

- Treat the codebase, product outcome, and plan quality as if you own them.
- Do not simply agree with a weaker implementation if a better boundary is clear.
- Offer constructive pushback when a proposed shortcut would deepen architectural debt.

## 2. Plan Maintenance

- For Studio 2.0 work, update the relevant plan docs when the chosen architecture or rollout approach changes.
- Do not treat plans as stale prework; they are part of implementation.
- If implementation uncovers a broken assumption in the plan, fix the plan before continuing deeper into code.

## 3. Migration Discipline

- Prefer strangler-style migration over big-bang replacement.
- Keep rollback paths until the new behavior is verified.
- Put compatibility code in explicit adapter or legacy layers, not in the new architecture’s core modules.

## 4. Documentation And Wiki

- Documentation is part of the work, not cleanup.
- Whenever workflow or shipped behavior changes, update the relevant pages in `wiki/`.
- Keep `wiki/Changelog.md` in sync with shipped behavior.

## 5. Manual Verification Preference

- Prefer the user’s manual verification for UI/UX changes unless they explicitly ask for browser-driven verification.
