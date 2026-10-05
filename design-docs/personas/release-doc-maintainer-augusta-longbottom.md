# 26 · Release Doc Maintainer  ☆ INFERRED

**Identity:** "A specs and changelog maintainer who ensures that every shipped behavior change has a corresponding contract document — because a feature without a discoverable spec is a liability waiting to become a regression."

## Goals
- Verify that `spec_version` is bumped and a changelog row is added in the same commit as any behavior change
- Catch code/spec drift before it reaches main — a spec that says Y when the code does X is a ticking clock
- Ensure every new behavior has a verification path documented alongside the contract
- Keep `design-docs/specs/` as a navigable index, not a graveyard of superseded proposals
- Make migration rationale discoverable for future maintainers who were not in the room when the decision was made

## Context & environment *(INFERRED)*
- Works primarily in a code review context: reads PRs in the browser, cross-references `design-docs/specs/` and `wiki/Changelog.md` from the same tab
- Came to this role after a production incident caused by undocumented behavior drift — a spec said one thing, the code did another, and no one caught it until a downstream consumer broke
- Work pattern: reviews every PR that touches `app/`, `plugins/`, or `app/api/routers/`; flags missing spec updates as blocking; approves once the spec, changelog, and behavior are consistent

## Key workflow moments
- **PR spec audit:** For each PR, checks whether any changed file has a matching spec in `design-docs/specs/`; if yes, verifies that `spec_version` was incremented and a changelog entry was added
- **Drift detection:** When a PR changes behavior without touching the spec, writes a review comment citing the exact spec line that now disagrees with the new code, and requests resolution in the same commit
- **New behavior registration:** For features with no existing spec, requests that the author create one before merge — not after; post-merge specs are never written
- **Changelog review:** Reads `wiki/Changelog.md` entries against the actual diff; flags entries that are too vague ("improved stability") or that omit breaking changes
- **Spec index maintenance:** Periodically audits `design-docs/specs/README.md` to confirm all spec files are listed, that superseded specs are marked as such, and that the router index is accurate

## Top friction points *(INFERRED)*
- **F1 — No automated spec-version check:** There is no CI gate that enforces "if you changed a file covered by spec X, you must have bumped X's `spec_version`"; catching this requires manual PR review
- **F2 — Duplicated planning docs masking the canonical spec:** Multiple files in `design-docs/plans/` describe the same system in different stages; future maintainers (and agents) cannot easily determine which document is authoritative without reading `design-docs/specs/README.md` first
- **F3 — Changelog entries written after the fact:** When a changelog entry is added in a follow-up commit, the spec bump and the behavior change are in different commits, making it impossible to verify consistency via a single diff
- **F4 — ADR/spec boundary is blurry:** Some decisions that belong in `design-docs/decisions/` (ADRs) are written into specs, and some behavioral contracts that belong in specs are written into planning docs; finding the authoritative source requires reading multiple files
- **F5 — Verification steps are not standardized:** Some specs include a "how to verify" section; others do not. When a future agent or operator needs to confirm a behavior, the verification path may not exist in the spec

## What they need from the studio
- A CI check that flags any PR touching code covered by a spec without a corresponding `spec_version` bump
- A structured changelog format with required fields: version, date, affected spec, behavior before, behavior after, verification command
- A spec template that mandates a verification section alongside the contract
- A clear boundary between specs (behavioral contracts) and ADRs (architectural rationale) so maintainers know which file to open first
- A single README index (`design-docs/specs/README.md`) that is enforced as the entry point and kept up to date by convention or automation

## Review lens — questions they ask of any screen
- "Which spec covers this behavior, and does the code in this PR match what the spec says?"
- "Was `spec_version` bumped in this commit, or was it bumped in a separate follow-up that is now inconsistent with the behavior change?"
- "Is this changelog entry specific enough that a future operator can reconstruct what changed without reading the diff?"
- "If an agent reads only `design-docs/specs/README.md` and the linked spec, will it find the correct contract — or will it find a superseded planning doc instead?"
- "Is the verification path for this behavior documented, and is it a command someone can actually run?"
- "Does this PR introduce a new behavioral contract that has no spec document yet?"
- "Which document would a future maintainer trust to understand this system — and does it match the running behavior right now?"

## Red flags that make them quit or distrust the app
- A PR that changes orchestrator behavior without touching any spec file
- A `spec_version` that was bumped in a separate commit days after the behavior change landed
- A `design-docs/specs/README.md` that does not list a spec that exists on disk
- A changelog entry that describes intent ("improve ETA accuracy") without stating the before/after behavior
- Specs that reference planning docs as their source of truth instead of standing alone as contracts

**Evidence basis:** INFERRED. Interview technical writers and senior engineers who own documentation review at developer-tool companies shipping versioned APIs; key open question is how teams enforce spec-code consistency without making the review process prohibitively slow.
