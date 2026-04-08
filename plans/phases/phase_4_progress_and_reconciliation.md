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
