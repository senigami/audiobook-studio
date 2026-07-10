# Task 018 — ST-4: spec bump + CI regression guard

Status: pending

## Goal

Bump the two affected specs, add a CI-wired script that rejects new hardcoded colors/inline styles
going forward, and aggregate the token-gap report from every prior task (owner-requested
tokenization addition — see `../01-map.md` Part 5).

## Map links

- Map: `../01-map.md` Part 4.
- Risk flag: `none`.
- Depends on: Workload C (004–017) complete — the guard should be checked against the final,
  fully-converted tree, not partway through.

## Exact targets

**Spec bumps:**

| File | From | To |
|---|---|---|
| `design-docs/specs/code-organization.md` | 1.1.0 | **1.2.0** |
| `design-docs/specs/design-system.md` | **1.13.0** (not 1.2.0 — re-verify the current version header before editing; it may have moved again since 2026-07-10) | next minor above current |

Add a changelog row to each spec documenting: the `theme/components/` split (11 files, list them),
the new shared classes added, and the regression guard. Follow this repo's existing spec changelog
row format (look at the most recent row in each file for the format to match).

**New CI guard script:**

Create a script (Python or Node, matching this repo's existing `scripts/` convention — see
`scripts/validate_plugin_manifests.py` for the pattern of a repo-hygiene script) that:
- Scans `frontend/src` **excluding** `frontend/src/demo/` **and**
  `frontend/src/theme/tokens.css` (that file legitimately defines the hex/rgb source values every
  token points to — its own literals are not violations).
- Flags any `style={{...}}` block, or any rule in `theme/components/*.css`, containing a hardcoded
  hex color (`#[0-9a-fA-F]{3,8}`), an `rgb(`/`rgba(` literal, or a raw px number for a property
  that should be a spacing/size token (use judgment — the goal is catching regressions like
  `padding: '12px'` instead of `padding: 'var(--space-3)'`, not flagging every legitimate one-off).
- Exits non-zero with a clear list of file:line violations if any are found.
- Exits 0 cleanly otherwise.

Wire it into `.github/workflows/ci.yml` as a new step alongside the existing lint/test steps.

**Token-gap report:** collect every "no matching token" note left by tasks 002 and 004–017 (per
`../01-map.md` Part 5's aggregation rule) into a short list — file:line + value — and include it in
this task's completion note under a "Token gaps found" heading. These are real candidates for new
tokens in a future session; don't add new tokens to `tokens.css` in this task, just surface them.

## Steps

- [ ] Confirm Workload C is fully complete (all 14 ST-3 tasks' commits landed).
- [ ] Re-verify current spec versions for both files (they may have moved since this plan was
      written).
- [ ] Bump both specs, add changelog rows.
- [ ] Write the guard script under `scripts/`.
- [ ] Run the guard script against the current tree — it should pass clean (if it finds violations,
      that means Workload C left some hardcoded values behind — fix those first, don't ship a guard
      that immediately fails).
- [ ] Add the CI step to `.github/workflows/ci.yml`.
- [ ] Collect the token-gap notes from every prior task's completion note into this task's own
      completion note.
- [ ] `npm -C frontend run build` — still succeeds (sanity check nothing broke).

## Acceptance criteria

- [ ] Both specs bumped with correct version numbers (double-check `design-system.md` isn't bumped
      to a number that collides with real history — see the "Important context" warning above).
- [ ] Guard script exists, runs clean against the current tree, and is wired into CI.
- [ ] Token-gap report compiled in this task's completion note (empty list is a valid, fine
      outcome).
- [ ] One commit (or two, if the spec bumps and the guard script feel cleaner as separate commits —
      executor's judgment).

## Dependencies

- Blocked by: `004` through `017` (all of Workload C).
- Blocks: none — this is the last task; once complete, the plan folder can be archived per
  `../README.md`'s archive convention (after the owner visual-check pass in `../02-roadmap.md`).
