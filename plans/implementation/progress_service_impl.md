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
- `confidence`
- `reason`

## 4. Broadcast Rules

- round progress to 2 decimal places
- always emit on status changes
- emit on meaningful progress movement
- throttle repetitive events
- publish human-meaningful phase messages

## 5. Parent Aggregation

- child blocks roll up into chapters
- chapter tasks roll up into project/export jobs
- parent progress is weighted, not averaged by count alone

## 6. Testing Plan

- reconciliation tests for valid vs stale artifacts
- ETA stabilization tests with simulated workloads
- broadcast throttling tests
- parent-child aggregation tests
