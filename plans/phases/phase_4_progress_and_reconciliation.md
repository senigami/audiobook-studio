# Phase 4: Progress And Reconciliation

## Objective

Build trustworthy progress, ETA, and artifact reconciliation before the orchestrator becomes the source of execution truth.

## Deliverables

- reconciliation service
- progress service
- ETA service
- normalized event contract
- live-progress stability rules

## Deliverables Checklist

- [ ] Reconciliation service implemented
- [ ] Progress service implemented
- [ ] ETA service implemented
- [ ] Normalized event contract implemented
- [ ] Live-progress stability rules implemented

## Scope

- preserve smooth and monotonic-feeling progress behavior
- preserve explicit `preparing` and `finalizing` phases
- make reuse and stale detection revision-safe
- normalized live progress must be published as websocket-friendly events rather than assuming polling-based refresh loops
- REST should remain the bootstrap and reconnect recovery path for live state, not the steady-state transport for active progress
- listener registration and event broadcasting must move toward explicit application wiring rather than hidden legacy global registration
- progress services must not depend on `app.state` listener globals as a permanent architecture choice

## Tests

- stale-output detection tests
- monotonic progress tests
- ETA stabilization tests
- grouped render aggregation tests
- restart and startup-reconciliation parity tests

## Verification Checklist

- [ ] Stale-output detection tests pass
- [ ] Monotonic progress tests pass
- [ ] ETA stabilization tests pass
- [ ] Grouped render aggregation tests pass
- [ ] Restart and startup-reconciliation parity tests pass

## Exit Gate

- progress and reuse logic are no longer worker-local assumptions
- websocket event delivery is the primary live-state path for active jobs, with REST reserved for hydration and recovery
