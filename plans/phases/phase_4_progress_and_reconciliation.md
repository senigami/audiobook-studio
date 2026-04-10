# Phase 4: Progress And Reconciliation

## Objective

Build trustworthy progress, ETA, and artifact reconciliation before the orchestrator becomes the source of execution truth.

## Deliverables

- reconciliation service
- progress service
- ETA service
- normalized event contract
- live-progress stability rules

## Implementation Order

1. Land the normalized websocket event contract and keep the legacy event names as a compatibility layer.
2. Route progress publication through the new progress service boundary while leaving legacy persistence in place.
3. Move preflight stale-output and revision-safe reuse checks into reconciliation service calls before execution begins.
4. Add ETA stabilization behind the progress service so live throughput can refine confidence without worker-local heuristics.
5. Replace startup-time listener registration with explicit app wiring once the new event path is stable end to end.

## Deliverables Checklist

- [x] Reconciliation service implemented
- [x] Progress service implemented
- [x] ETA service implemented
- [x] Normalized event contract implemented
- [x] Live-progress stability rules implemented

## Scope

- preserve smooth and monotonic-feeling progress behavior
- preserve explicit `preparing` and `finalizing` phases
- make reuse and stale detection revision-safe
- normalized live progress must be published as websocket-friendly events rather than assuming polling-based refresh loops
- REST should remain the bootstrap and reconnect recovery path for live state, not the steady-state transport for active progress
- listener registration and event broadcasting must move toward explicit application wiring rather than hidden legacy global registration
- progress services must not depend on `app.state` listener globals as a permanent architecture choice

## Initial Cutover Rules

- `app.state` may continue to persist queue state and synchronize SQLite during the transition, but it should stop being the long-term websocket publisher.
- `app.api.ws` should become the transport adapter for a normalized event contract, not the place where progress semantics live.
- frontend live job handling should accept both the normalized event envelope and the legacy queue-update payloads until hydration and reconnect flows are in place.
- worker-local progress calculations should be treated as compatibility inputs to the new progress service, not as the final source of truth.
- progress throttling and heartbeat decisions belong in `ProgressService`; the broadcaster should stay transport-only.
- explicit recovery/reset events may move progress backward only when the progress service is told to allow that regression.
- reconciliation is still the next structural slice after the progress service lands, and it should be reviewed as a separate risk area rather than folded into the broadcaster work.
- reconciliation now accepts a normalized request mapping plus an optional manifest lookup callback so orchestration can stay ID-based without importing worker or web modules directly.

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
