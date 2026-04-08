# Phase 2: Domain Contracts

## Objective

Implement the 2.0 domain model and persistence contracts while runtime execution remains mostly legacy.

## Deliverables

- entity models for project, chapter, production block, render batch, voice profile, voice asset, artifact, queue job, and snapshot
- repositories or persistence adapters
- settings ownership model
- artifact manifest schema
- revision hash rules

## Scope

- no full queue cutover
- no full editor cutover
- persistence and contract correctness only

## Tests

- revision matching tests
- stale artifact tests
- render-batch derivation tests
- project portability tests
- settings ownership tests

## Exit Gate

- we can represent the intended 2.0 state model in code and verify it independently of queue replacement
