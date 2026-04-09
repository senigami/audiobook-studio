# Implementation Blueprint: Feature Flag Strategy (Studio 2.0)

This document makes the Phase 0 feature-flag strategy explicit so rollout and rollback rules stay clear during implementation.

## 1. Goals

- Allow narrow cutovers instead of all-at-once replacement
- Keep rollback paths available while 2.0 modules mature
- Support shadow validation where practical

## 2. Proposed Flags

- `USE_V2_DOMAIN_MODEL`
- `USE_V2_ENGINE_BRIDGE`
- `USE_V2_PROGRESS`
- `USE_V2_QUEUE`
- `USE_V2_EDITOR`

## 3. Flag Semantics

### `USE_V2_DOMAIN_MODEL`

- Enables reads/writes through the new domain contracts where safe
- Must not require queue cutover

### `USE_V2_ENGINE_BRIDGE`

- Routes synthesis and preview/test requests through the new voice bridge
- Must preserve existing engine capabilities before becoming default
- Should be enabled for preview/test flows before full synthesis cutover where practical, so the new bridge can be validated on a narrower and more reversible path first
- Must not advertise engines as ready through the v2 bridge unless the bridge-backed execution path and preflight checks are actually implemented for that engine
- Bridge-facing preview failures should prefer typed error codes or exception classes over fragile string matching so UI feedback stays stable across engine refactors

### `USE_V2_PROGRESS`

- Enables new progress/reconciliation/event contracts
- Can be used with legacy execution during validation

### `USE_V2_QUEUE`

- Enables the resource-aware orchestrator for selected flows
- Must remain reversible until representative flows pass consistently

### `USE_V2_EDITOR`

- Enables the 2.0 editor and related voice UX surfaces
- Should only be used after the lower-level contracts are proven

## 4. Rollout Rules

- Turn flags on in dependency order, not convenience order
- Do not enable a later-phase flag if it silently depends on a disabled earlier-phase system
- If a flag changes user-visible behavior, document the intended scope in the relevant phase plan
- A flag must not rely on hidden import-time worker startup or startup-hook side effects from legacy modules in order to function correctly

## 5. Rollback Rules

- Any flag must be disable-able without requiring emergency code edits
- Rollback should restore a known legacy path, not a half-migrated hybrid
- If rollback is no longer realistic for a flag, update the plan and explain why before proceeding
