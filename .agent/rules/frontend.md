# Frontend Rules

Use this file when the task touches UI state ownership, overlays, local session state, interaction design, or responsive layouts.

## Read The Right Subfile

- [`frontend-state.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-state.md) for canonical data, live overlays, and local session state boundaries.
- [`frontend-ux.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-ux.md) for loading/error/recovery states, trust, and editor expectations.
- [`frontend-interactions.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-interactions.md) for styling, semantics, component boundaries, and responsive behavior.

## Load Order

1. [`frontend-state.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-state.md) for state ownership and overlay boundaries.
1. [`frontend-ux.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-ux.md) for recovery, waiting, empty, and failure experience.
1. [`frontend-interactions.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/frontend-interactions.md) for interaction quality, semantics, and responsive layouts.

## Pair With

- [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md) for Studio 2.0 boundary rules.
- [`verification.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/verification.md) for the required frontend test and lint verification.
