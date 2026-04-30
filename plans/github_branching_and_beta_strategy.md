# GitHub Branching And Beta Strategy For Studio 2.0

This document defines how I recommend we manage Studio 2.0 development in GitHub so beta work can move forward without destabilizing `main`.

## 1. Branch Roles

### `main`

- stable branch for normal users
- only stable, releasable changes should land here
- production releases should be cut from this branch

### `studio-2.0`

- long-lived beta and integration branch for Studio 2.0
- this is where 2.0 phase work is assembled and validated
- beta releases should be cut from this branch

## 2. Feature Branch Strategy

Do not do all work directly on `studio-2.0`.

For each contained deliverable, create a short-lived branch from `studio-2.0`, for example:

- `studio-2.0-phase-1-structure`
- `studio-2.0-phase-2-domain`
- `studio-2.0-phase-3-voice-bridge`
- `studio-2.0-progress-reconciliation`

These branches should be:

- small enough to review
- tied to one phase or one deliverable
- merged back into `studio-2.0` through a PR

## 3. Recommended Workflow

1. Keep `main` stable.
2. Create `studio-2.0` from `main`.
3. Create short-lived phase/deliverable branches from `studio-2.0`.
4. Merge those branches into `studio-2.0` after passing the relevant phase checklist.
5. Periodically merge `main` into `studio-2.0` so the beta line stays current.
6. Merge `studio-2.0` into `main` only when a stable release-worthy slice is ready.

## 4. Beta Release Strategy

### Stable Releases

- cut from `main`
- examples: `v1.9.0`, `v1.9.1`

### Beta Releases

- cut from `studio-2.0`
- mark them as GitHub pre-releases
- examples:
  - `v2.0.0-beta.1`
  - `v2.0.0-beta.2`
  - `v2.0.0-beta.3`

This allows testers to use Studio 2.0 while normal users remain on the stable branch.

## 5. Why This Strategy Is Safer

- `main` stays reliable for normal users
- `studio-2.0` becomes the integration branch for 2.0 work
- short-lived branches isolate errors and make debugging easier
- each PR stays narrow and easier to review or revert
- beta releases are possible without forcing unfinished work into stable

## 6. What To Avoid

- doing all 2.0 work directly on one branch without smaller branches
- waiting until “all of 2.0 is done” before integration review
- mixing unrelated bug fixes and large 2.0 architecture work in the same branch
- using `main` as the beta branch

## 7. Recommended Naming

### Long-Lived Branch

- `studio-2.0`

### Short-Lived Branches

- `studio-2.0-phase-1-structure`
- `studio-2.0-phase-2-domain`
- `studio-2.0-phase-3-voice-interface`
- `studio-2.0-phase-4-progress`
- `studio-2.0-phase-5-orchestrator`
- `studio-2.0-phase-6-frontend-foundations`
- `studio-2.0-phase-7-editor-ux`
- `studio-2.0-phase-8-cleanup`

## 8. Relationship To Feature Flags

Branching is not a replacement for feature flags.

We should still use feature flags so that:

- unfinished 2.0 behavior can stay off by default
- beta can contain incomplete internals safely
- safe internal refactors can merge earlier when appropriate

## 9. Recommended Next Step

Before Phase 1 begins:

1. create `studio-2.0` from `main`
2. treat it as the 2.0 integration and beta branch
3. create the first short-lived work branch for Phase 1 scaffolding
