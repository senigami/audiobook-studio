# Frontend Rules

Use this file when the task touches UI state ownership, overlays, local session state, interaction design, or responsive layouts.

For frontend folder organization, follow the project structure rules in [`modular_architecture.md`](modular_architecture.md): route-level pages live in `frontend/src/pages`, reusable UI in `frontend/src/components`, app shell/routing in `frontend/src/app`, site-wide styling in `frontend/src/theme`, and tests outside runtime source under `frontend/tests`.

## Read The Right Subfile

- [`frontend-state.md`](frontend-state.md) for canonical data, live overlays, and local session state boundaries.
- [`frontend-ux.md`](frontend-ux.md) for loading/error/recovery states, trust, and editor expectations.
- [`frontend-interactions.md`](frontend-interactions.md) for styling, semantics, component boundaries, and responsive behavior.

## Load Order

1. [`frontend-state.md`](frontend-state.md) for state ownership and overlay boundaries.
1. [`frontend-ux.md`](frontend-ux.md) for recovery, waiting, empty, and failure experience.
1. [`frontend-interactions.md`](frontend-interactions.md) for interaction quality, semantics, and responsive layouts.

## Pair With

- [`modular_architecture.md`](modular_architecture.md) for Studio 2.0 boundary rules.
- [`verification.md`](verification.md) for the required frontend test and lint verification.
