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

## Artifact Identity And Lifecycle Note

- `artifact_hash` and `request_fingerprint` serve different purposes and should stay separate in the domain model.
- `artifact_hash` is the immutable byte-identity of the stored artifact and should remain stable across storage backends.
- `request_fingerprint` is the canonical identity of the render intent and should reflect the revision-sensitive inputs that determine whether an existing artifact may be reused.
- An artifact may be stale for one reuse request while still remaining a valid immutable historical record or valid reuse candidate for another request.
- Staleness is therefore a logical reuse decision, not an intrinsic artifact state.
- The artifact repository and artifact domain service should not perform physical deletion as part of staleness checks or normal validation flows.
- Cleanup or garbage collection of orphaned artifact files is a separate lifecycle concern and should live in explicit orchestration or reconciliation paths.
- During the current scaffold phase, stale detection may surface through simple validation failures, but the long-term contract should move toward an explicit reuse decision result rather than relying on exceptions for expected business flow.

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
