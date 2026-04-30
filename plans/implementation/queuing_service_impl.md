# Implementation Blueprint: Queuing & Resource Service (Studio 2.0)

This document describes how I want the new orchestrator built in practical terms.

## 1. Files I Want To Create

- `app/orchestration/tasks/base.py`
- `app/orchestration/tasks/synthesis.py`
- `app/orchestration/tasks/assembly.py`
- `app/orchestration/tasks/export.py`
- `app/orchestration/tasks/export_repair.py`
- `app/orchestration/scheduler/resources.py`
- `app/orchestration/scheduler/policies.py`
- `app/orchestration/scheduler/orchestrator.py`
- `app/orchestration/scheduler/recovery.py`

## 2. Resource Model

```python
class ResourceClaim(BaseModel):
    gpu: int = 0
    cpu_light: int = 0
    disk_io: int = 0
    network: int = 0
```

Initial policy:

- one GPU-heavy synthesis job at a time
- allow safe concurrent network or IO work when it does not threaten responsiveness

## 2.1 Special Queue Policies To Preserve

- `finalizing` remains a first-class state for jobs that have finished core synthesis but are still stitching, synchronizing metadata, or publishing outputs.
- mixed-engine render jobs may generate progress at the render-batch level rather than a single segment level.
- bake jobs should be able to queue only the work still needed to complete a chapter.
- voice build and voice test jobs should have dedicated task types rather than being treated as generic synthesis.

## 3. Queue Procedure

### Submit

1. Validate request and dependencies.
2. Reconcile already-valid artifacts.
3. Create parent and child queue records.
4. Publish `queued` or `waiting_for_dependency`.

### Dispatch

1. Select eligible jobs by priority and age.
2. Check dependency satisfaction.
3. Check resource availability.
4. Allocate claims.
5. Start the task and publish `running`.

### Finish

1. Validate task output.
2. Release resources.
3. Update parent aggregation.
4. Trigger dependent work.
5. Publish completion or failure.

## 4. Recovery Procedure

1. Load incomplete jobs on startup.
2. Reconcile artifacts for their requested revisions.
3. Mark now-satisfied work complete.
4. Requeue only the truly pending work.
5. Publish `recovered` status before execution resumes.

## 5. Failure Policy

- infrastructure failures: retriable
- request/content failures: `needs_review`
- explicit cancelation: `cancelled`
- dependency invalidation: back to `waiting_for_dependency`

## 5.1 Pause And Cancel Policy Matrix

- synthesis: pausable unless policy says otherwise
- bake/repair: policy-defined, but must be explicit
- voice build/test: cancelable and not blocked behind unrelated exports by default
- export/assembly: may continue during a synthesis pause if that is the intended queue policy
- export repair/backfill: lightweight and user-visible, but should not quietly bypass queue visibility just because they are “small”

## 6. Testing Plan

- scheduler fairness tests
- resource-claim contention tests
- recovery tests after simulated interruption
- parent-child aggregation tests
- cancelation and retry behavior tests
