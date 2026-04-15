# Phase 6: Frontend Foundations

## Objective

Adopt the 2.0 live-state and hydration model before migrating the full editor.

## Deliverables

- live overlay store
- reconnect hydration logic
- anti-regression merge rules
- queue and header progress cutover
- shell hydration and global navigation state

## Deliverables Checklist

- [ ] Live overlay store implemented
- [ ] Reconnect hydration logic implemented
- [ ] Anti-regression merge rules implemented
- [ ] Queue progress cut over to 2.0 live-state model
- [ ] Header progress cut over to 2.0 live-state model
- [ ] Shell hydration and global navigation state implemented

## Scope

- canonical entities stay API-backed
- store owns live overlays and session state
- live overlays should be websocket-first, with REST used for hydration, reconnect recovery, and explicit refresh only
- no full editor migration yet
- mock or dev-shape hydration is acceptable in this phase so frontend 2.0 routes can be built against stable response shapes before full backend cutover
- frontend hydration must not assume legacy startup reconciliation has already repaired queue state unless that behavior is explicitly provided by the active backend path
- shell and live-state foundations should preserve compatibility with current startup-driven pause state and reconnect behavior until the replacement path is fully verified

## Phase 5 Handoff Assumptions

Phase 6 starts after the backend foundations from Phase 5 have landed, but
before the main visible queue/render route has been fully cut over.

### Backend State Available To Phase 6

- explicit feature flags separate engine transport from scheduler rollout:
  `USE_TTS_SERVER` and `USE_STUDIO_ORCHESTRATOR`
- TTS Server boot is explicit through app startup wiring rather than
  import-time side effects
- the orchestrator, reconciliation, recovery, progress publication, and task
  contracts now exist and are stable enough to build frontend state against
- the registry can query the TTS Server path when that flag is active

### Legacy State Phase 6 Must Still Respect

- the default visible queue/render submission route can still be legacy-backed
- queue hydration after reload still uses legacy snapshots and heuristics in
  important places
- refresh behavior such as briefly showing `finalizing` during active work can
  still occur on the current queue page and should not automatically be treated
  as a backend regression
- frontend work in this phase must tolerate both legacy-backed and 2.0-backed
  hydration shapes until the visible cutover is complete

## Recommended First Slice

1. Introduce the live overlay store and hydration coordinator behind an
   explicit compatibility boundary.
2. Make queue/header consumers capable of merging:
   - canonical API hydration
   - websocket/live overlay updates
   - reconnect snapshots from either legacy-backed or 2.0-backed sources
3. Preserve the anti-regression merge rules from Phase 4 rather than
   reintroducing UI-side snapping or backward drift.
4. Keep the queue page honest about the active data source until the submission
   route is fully cut over.

## Phase 6 Guardrails

- do not move progress math, reconciliation, or scheduling policy into the
  frontend store
- do not assume a full editor migration in this phase
- do not rely on legacy startup side effects as hidden prerequisites for
  frontend correctness
- prefer strangler-style queue/header cutover over a big-bang UI rewrite
- if a frontend state shape needs a temporary compatibility adapter, keep it
  explicit and removable

## Tests

- reconnect tests
- reload tests
- queue consistency tests
- anti-regression merge tests
- hydration behavior tests against both legacy-backed and mock/dev-shape snapshots

## Verification Checklist

- [ ] Reconnect tests pass
- [ ] Reload tests pass
- [ ] Queue consistency tests pass
- [ ] Anti-regression merge tests pass
- [ ] Hydration behavior tests pass for legacy-backed and mock/dev-shape snapshots

## Exit Gate

- the frontend can consume 2.0 events safely without yet moving the entire editor
- queue and header live state no longer depend on steady-state polling during normal connected operation
- queue/header hydration semantics are explicit enough that refresh and
  reconnect behavior no longer need legacy-only heuristics to look stable
