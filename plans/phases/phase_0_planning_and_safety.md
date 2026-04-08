# Phase 0: Planning And Safety Baseline

## Objective

Freeze the Studio 2.0 direction and document the safety constraints before code starts moving.

## Why This Phase Exists

The conversion is large enough that weak planning will create debugging debt immediately. Phase 0 exists so later phases can move quickly without constantly renegotiating boundaries.

## Deliverables

- final Studio 2.0 plan set in `plans/`
- updated `.agent/rules`
- known list of current behaviors that must be preserved or intentionally replaced
- feature-flag strategy
- verification strategy

## Expected Work

- audit the current implementation for critical behaviors
- finalize domain boundaries
- finalize migration discipline
- document known risks and stop conditions

## Verification

- plan coherence review
- rules coherence review
- current behavior audit is reflected in the plans

## Exit Gate

- architecture and migration discipline are documented clearly enough to begin scaffolding
