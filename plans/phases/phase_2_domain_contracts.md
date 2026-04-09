# Phase 2: Domain Contracts

## Objective

Implement the 2.0 domain model and persistence contracts while runtime execution remains mostly legacy.

## Deliverables

- entity models for project, chapter, production block, render batch, voice profile, voice asset, artifact, queue job, and snapshot
- repositories or persistence adapters
- settings ownership model
- artifact manifest schema
- revision hash rules

## Deliverables Checklist

- [x] Core 2.0 entity models implemented
- [x] Persistence adapters or repositories implemented
- [x] Settings ownership model implemented
- [x] Artifact manifest schema defined in code
- [x] Revision hash rules implemented
- [x] Render-batch derivation rules implemented

## Scope

- no full queue cutover
- no full editor cutover
- persistence and contract correctness only
- cross-domain joins should prefer orchestration-level composition and ID-based lookups instead of direct domain-to-domain service coupling
- new domain contracts must not import `app.web` or depend on legacy worker startup, startup reconciliation, or middleware-side config mutation

## Tests

- revision matching tests
- stale artifact tests
- engine-version/model-revision artifact invalidation tests
- render-batch derivation tests
- project portability tests
- settings ownership tests
- import-safety tests or checks for new domain modules where practical

## Verification Checklist

- [x] Revision matching tests pass
- [x] Stale artifact tests pass
- [x] Render-batch derivation tests pass
- [x] Project portability tests pass
- [x] Settings ownership tests pass

## Verification Note

- Full `pytest` is blocked in this workspace because `tests/conftest.py` imports `psutil`, which is not installed here.
- I verified the Phase 2 contract surface with `python3 -m compileall` and a direct import harness against the new domain helpers.

## Exit Gate

- we can represent the intended 2.0 state model in code and verify it independently of queue replacement
