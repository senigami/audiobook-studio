# Phase 6: Frontend Foundations

## Objective

Adopt the 2.0 live-state and hydration model before migrating the full editor.

## Deliverables

- live overlay store
- reconnect hydration logic
- anti-regression merge rules
- queue and header progress cutover

## Scope

- canonical entities stay API-backed
- store owns live overlays and session state
- no full editor migration yet

## Tests

- reconnect tests
- reload tests
- queue consistency tests
- anti-regression merge tests

## Exit Gate

- the frontend can consume 2.0 events safely without yet moving the entire editor
