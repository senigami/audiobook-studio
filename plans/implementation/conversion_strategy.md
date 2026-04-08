# Transformation Strategy: Converting to Studio 2.0

This is the procedure I want us to follow while implementation is underway.

## 1. Core Migration Rule

Do not replace a working legacy path until the new path can prove the same behavior plus the new guarantees we want.

## 2. Feature Flag Strategy

- `USE_V2_DOMAIN_MODEL`
- `USE_V2_ENGINE_BRIDGE`
- `USE_V2_PROGRESS`
- `USE_V2_QUEUE`
- `USE_V2_EDITOR`

Flags should allow shadow validation before full cutover where practical.

## 3. Verification Stages

### Stage A: Isolated Module Verification

- mock engines
- synthetic queue workloads
- artifact reconciliation fixtures

### Stage B: Shadow Validation

- run the new logic beside legacy behavior where feasible
- compare queue, progress, and artifact outcomes

### Stage C: End-To-End Cutover Validation

- chapter edit -> targeted rerender
- queue recovery after restart
- export flow
- voice-module readiness flow
- mixed-engine grouped render flow
- bake/repair flow
- voice preview/test flow
- progress smoothing and anti-regression behavior during sparse updates

## 4. Stop Conditions

Pause implementation and update the plan if:

- the new design requires raw file existence as truth
- the store starts owning canonical entities
- engine-specific logic leaks into queue or route handlers
- migration requires deleting the rollback path too early

## 5. Definition Of Ready For Full Cutover

- queue recovery is stable
- stale artifact detection is stable
- editor targeted rerender is stable
- reconnect hydration is stable
- representative end-to-end flows pass consistently
