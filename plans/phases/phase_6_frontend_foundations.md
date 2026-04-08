# Phase 6: Frontend Foundations

## Objective

Adopt the 2.0 live-state and hydration model before migrating the full editor.

## Deliverables

- live overlay store
- reconnect hydration logic
- anti-regression merge rules
- queue and header progress cutover

## Deliverables Checklist

- [ ] Live overlay store implemented
- [ ] Reconnect hydration logic implemented
- [ ] Anti-regression merge rules implemented
- [ ] Queue progress cut over to 2.0 live-state model
- [ ] Header progress cut over to 2.0 live-state model

## Scope

- canonical entities stay API-backed
- store owns live overlays and session state
- no full editor migration yet

## Tests

- reconnect tests
- reload tests
- queue consistency tests
- anti-regression merge tests

## Verification Checklist

- [ ] Reconnect tests pass
- [ ] Reload tests pass
- [ ] Queue consistency tests pass
- [ ] Anti-regression merge tests pass

## Exit Gate

- the frontend can consume 2.0 events safely without yet moving the entire editor
