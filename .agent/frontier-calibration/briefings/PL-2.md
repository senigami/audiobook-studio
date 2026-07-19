# Calibration briefing — PL-2: plan the standalone plugin repo extraction + install E2E

**Activity:** planning / decomposition · **Gradeable:** semi

## The task

Produce a self-contained implementation plan to extract XTTS (and Voxtral) into their own
installable repos, decomposed so a mid-tier executor could run it without losing the whole
picture. The plan must cover:

- The extraction sequence — how to pull each engine into its own repo **without breaking the
  bundled default** at any step.
- An end-to-end acceptance test for the install flow, plus a trust-warning test for the
  install security surface.
- The `synthesis_mixed` registration items.
- The state / docs updates that must land with it.

Treat the SDK inversion (already shipped, PR #140) as the foundation to build on.

## Read (reason from these, not from memory of the repo)

- `design-docs/plans/active/final_release/05_standalone_plugin_repos.md`
- `design-docs/plans/active/final_release/stage3_sdk_migration_plan.md` (if present under that plan folder)
- `studio_plugin_sdk/` — the SDK surface the plugins build against
- `tts_engines/tts_xtts/` — the engine being extracted (manifest, interface, requirements, tests)
- `design-docs/specs/plugin-contract.md`, `design-docs/specs/install-distribution.md`
- `design-docs/plans/REMAINING_TASKS.md` — "010 standalone plugin repos"

## Produce

An ordered plan: the slices (each self-contained, each with a verification gate), the sequencing
that keeps the bundled default working throughout, the two tests (install E2E + trust-warning),
the `synthesis_mixed` registration items, and the docs/state updates. Call out the release-gating
dependencies.

## Discipline

- Ground the plan in the actual SDK/contract surface and the existing plan docs (`path`), not a generic extraction template.
- Separate checkable required elements (hook points, tests, contract obligations) from sequencing judgment.
- Flag the riskiest step and state what would change the plan.
