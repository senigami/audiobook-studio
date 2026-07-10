# Task 006 — Green gate + verification

Status: pending

## Goal

Final check across all touched files: full green gate, a grep-based uniqueness sanity check, and a note on natural follow-on work.

## Steps

- [ ] Run `npx tsc -b --force` from `frontend/` — clean.
- [ ] Run `npx vitest run` (no path filter) from `frontend/` — no regressions.
- [ ] Run `npm -C frontend run lint` — clean.
- [ ] Run `npm -C frontend run build` — succeeds.
- [ ] Grep-based uniqueness check: for each touched component with a `data-testid={`...-${entity.id}`}` pattern, confirm the interpolation is real (not accidentally hardcoded) by grepping for the literal template-string syntax, not just the presence of `data-testid`.
- [ ] Check whether `frontend/tests/e2e/a11y/axe.spec.ts`'s currently-`.fixme`'d assertions are affected by these changes (likely not, since this plan only adds attributes) — do NOT attempt to un-skip/fix them as part of this task, that's a separate, larger effort; just confirm this plan didn't make anything worse.
- [ ] Note in the completion summary: the 3 existing Playwright specs (`chapter-render.spec.ts`, `settings-navigation.spec.ts`, `a11y/axe.spec.ts`) still use inconsistent selector strategies relative to each other — consolidating them to the new convention is flagged as a natural follow-on, not required by this plan's success criteria.
- [ ] Update `design-docs/plans/TASKS.md` with a completion entry.

## Acceptance criteria

- [ ] Full green: typecheck, tests, lint, build.
- [ ] Uniqueness check passes for all touched components.
- [ ] `TASKS.md` updated.

## Dependencies

Tasks 002-005.

## Map links

- Closes `00-overview.md`'s success-criteria list.
- Risk: `none` (verification-only)

## Out of scope

- Rewriting the existing 3 Playwright specs to the new convention.
- Un-skipping `axe.spec.ts`'s `.fixme` assertions.
