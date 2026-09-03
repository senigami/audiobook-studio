# Engineering rules

Working constraints for changing this codebase: the boundaries you have to respect, the checks a
change owes before it is done, and the failure modes that have already cost this project a debugging
round. Read the one that matches the area you are touching rather than all of them.

These are rules about the code. The canonical description of *how the system works* is
`design-docs/specs/` (start at `specs/README.md`), and the *why* behind structural decisions is
`design-docs/decisions/` (the ADRs). Where a rule here and a spec disagree, that is drift: resolve it
explicitly in the same change, never silently.

## Router

| Touching | Read |
|---|---|
| Anything that crosses domain, queue, engine, frontend-state, or migration boundaries | [modular_architecture.md](modular_architecture.md) — the most load-bearing file here |
| Backend work generally: queueing, progress, artifacts, path handling | [backend.md](backend.md) |
| Routing, service layers, queue policy, migration boundaries | [backend-boundaries.md](backend-boundaries.md) |
| Filesystem paths derived from a request, scanned directories, containment checks | [backend-paths.md](backend-paths.md) |
| ETA, progress values, WebSocket state consistency | [backend-progress.md](backend-progress.md) |
| Completion checks, artifact publication, recovery, cache safety | [backend-artifacts.md](backend-artifacts.md) |
| Frontend work generally: state ownership, overlays, interaction, layout | [frontend.md](frontend.md) |
| API-backed entities, live overlays, reconnect state, local draft ownership | [frontend-state.md](frontend-state.md) |
| Styling decisions, component boundaries, semantics, responsiveness | [frontend-interactions.md](frontend-interactions.md) |
| Waiting, error, and recovery states; editor workflow expectations | [frontend-ux.md](frontend-ux.md) |
| Any change to code, behavior, tests, or a migration path | [verification.md](verification.md) — read before calling work complete |
| Reviewing a diff or triaging review comments | [code-review.md](code-review.md) |
| Changing implementation direction, migration strategy, rollout shape, or docs | [workflow.md](workflow.md) |

## The two that apply to nearly everything

**[modular_architecture.md](modular_architecture.md)** — Studio 2.0's boundaries. Importing a module
must not start threads, register listeners, or mutate global settings; side effects belong behind the
explicit boot sequence. Engine-specific logic stays behind the engine registry. Completion and reuse
decisions use validated artifact metadata, never raw file existence.

**[verification.md](verification.md)** — what a change owes before it is done. Tests first, confirmed
failing for the right reason, then the implementation.

Testing standards (R1 through R4) are a spec rather than a rule file, and live at
`design-docs/specs/testing-standards.md`.
