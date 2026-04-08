# Phase 4: Progress And Reconciliation

## Objective

Build trustworthy progress, ETA, and artifact reconciliation before the orchestrator becomes the source of execution truth.

## Deliverables

- reconciliation service
- progress service
- ETA service
- normalized event contract
- live-progress stability rules

## Scope

- preserve smooth and monotonic-feeling progress behavior
- preserve explicit `preparing` and `finalizing` phases
- make reuse and stale detection revision-safe

## Tests

- stale-output detection tests
- monotonic progress tests
- ETA stabilization tests
- grouped render aggregation tests

## Exit Gate

- progress and reuse logic are no longer worker-local assumptions
