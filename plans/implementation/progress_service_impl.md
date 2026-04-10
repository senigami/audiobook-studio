# Implementation Blueprint: Progress & ETA Service (Studio 2.0)

This document specifies how I want progress and ETA implemented so the UI can trust it.

## 1. Files I Want To Create

- `app/orchestration/progress/service.py`
- `app/orchestration/progress/reconciliation.py`
- `app/orchestration/progress/eta.py`
- `app/orchestration/progress/broadcaster.py`

## 2. Reconciliation Procedure

1. Receive requested scope such as block ids, chapter id, or export id.
2. Load expected revisions and required outputs.
3. Resolve referenced artifacts.
4. Validate each artifact manifest against the current revision request.
5. Return `valid`, `stale`, `missing`, or `unknown` per work item.

## 3. ETA Model

Use:

- historical engine baseline
- live moving throughput
- task-type-specific work weighting
- optional advanced user override multiplier

ETA output should include:

- `eta_seconds`
- `estimated_end_at`
- `eta_basis`
- `confidence`
- `reason`

ETA semantics:

- `started_at` is written once when the run starts and stays stable for that run
- `eta_seconds` should be emitted as the backend's current remaining-seconds estimate
- `estimated_end_at` should be emitted whenever the backend can provide a stable absolute finish time
- `eta_basis="total_from_start"` is temporary compatibility only; Studio 2.0 should converge on `eta_basis="remaining_from_update"`
- `evidence_weight_fraction` belongs to the update event, not the initial launch state
- for segment-style updates, derive `evidence_weight_fraction` from the processed character count divided by the maximum segment batch size
- when a producer cannot provide a better signal, use a fallback confidence of about `0.8`

## 4. Broadcast Rules

- round progress to 2 decimal places
- always emit on status changes
- emit on meaningful progress movement
- throttle repetitive events
- publish human-meaningful phase messages

## 4.1 Visual Stability Rules

- backend progress is the authoritative floor for live work
- the frontend may smooth between updates
- active progress should not visibly regress except on explicit reset/revision invalidation
- explicit reset/revision invalidation should be opt-in at the progress-service boundary, not inferred by the broadcaster
- tiny ETA changes should be coalesced to avoid noisy UI churn

## 5. Parent Aggregation

- child blocks roll up into chapters
- chapter tasks roll up into project/export jobs
- parent progress is weighted, not averaged by count alone
- grouped render batches should also be representable so current mixed/grouped rendering semantics are preserved

## 6. Testing Plan

- reconciliation tests for valid vs stale artifacts
- ETA stabilization tests with simulated workloads
- broadcast throttling tests
- parent-child aggregation tests
