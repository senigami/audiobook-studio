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
