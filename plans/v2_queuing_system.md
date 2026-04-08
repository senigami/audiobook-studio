# Proposal: Resource-Aware Queuing System (Studio 2.0)

This is the operational heart of Studio 2.0. The queue must be predictable, explainable, and recoverable. “Async” is not the goal. Trustworthy production flow is the goal.

## 1. Objectives

- Replace worker-centric branching with task-based orchestration.
- Protect the machine from overload while still using safe parallelism.
- Support parent-child job structure, targeted rerender, cancelation, recovery, and exports.
- Make queue state understandable to users and other systems.

## 2. What I Want To Create

### 2.1 StudioTask Hierarchy

- `SynthesisTask`
- `AssemblyTask`
- `ExportTask`
- `SampleBuildTask`
- `ProjectBackupTask`

All queueable work should derive from a common base:

```python
class StudioTask:
    task_id: str
    job_type: str
    resource_claim: ResourceClaim
    priority: int
    parent_job_id: str | None

    def validate(self) -> None: ...
    def run(self) -> TaskResult: ...
    def on_cancel(self) -> None: ...
```

### 2.2 Scheduler With Resource Claims

Instead of a single “heavy lock,” each task will declare a resource claim such as:

- `gpu: 1`
- `cpu_light: 1`
- `disk_io: 1`
- `network: 1`

The initial policy will still allow only one GPU-heavy synthesis task at a time, but that rule will live in scheduler policy instead of being hardcoded everywhere.

### 2.3 Job Tree Model

- Parent job: chapter render, book export, or batch action
- Child jobs: block renders, assembly pieces, metadata tasks
- Parent status is derived from child execution plus orchestration-level state

## 3. Queue States

I want explicit, user-explainable states:

- `queued`
- `validating`
- `waiting_for_resources`
- `waiting_for_dependency`
- `running`
- `paused`
- `cancelling`
- `completed`
- `failed`
- `needs_review`
- `recovered`

## 4. Scheduling Procedures

### Submission

1. Validate the request.
2. Resolve dependencies and target block set.
3. Reconcile current artifacts and skip already-valid work.
4. Create parent and child job records in the DB.
5. Publish queue-visible status immediately.

### Dispatch

1. Read queued jobs ordered by priority, submission time, and policy.
2. Ignore jobs whose dependencies are not satisfied.
3. Allocate resources only when the full claim can be honored.
4. Move jobs to `waiting_for_resources` with a visible reason when blocked.
5. Start execution and emit status transition events.

### Completion

1. Validate the task result.
2. Persist artifact or output metadata.
3. Release resources.
4. Recompute parent job status and progress.
5. Trigger dependent tasks if appropriate.

## 5. Failure Handling

- Distinguish retriable infrastructure failures from non-retriable request/content failures.
- Retriable failures increment attempt count and return to queue with clear reason metadata.
- Non-retriable failures move to `needs_review` with actionable remediation suggestions.
- Cancelation must be explicit and must propagate in a controlled way through parent and child jobs.

## 6. Recovery Rules

- On startup, reload jobs that were `queued`, `waiting_for_resources`, `running`, or `cancelling`.
- Reconcile each affected block or artifact before requeueing actual work.
- Recovered jobs must be labeled visibly so users know why the queue resumed.
- Recovery may skip child work that is now already satisfied by valid artifacts.

## 7. Queue UX Requirements

- Always show why a task is waiting.
- Support canceling a single rerender without nuking a whole book export.
- Support `Pause all`, `Resume all`, `Retry failed`, and `Render changed`.
- Surface `Recovered after restart`, `Needs setup`, and `Needs review` as first-class states.

## 8. Risks And Planned Solutions

- **Risk: One bad policy starves useful work**
  Solution: keep resource policy centralized and test scheduling fairness.
- **Risk: Parent and child reordering becomes confusing**
  Solution: reprioritize parent jobs by default and derive child order deterministically.
- **Risk: Retries loop forever on bad inputs**
  Solution: classify failure types and move content/configuration issues to `needs_review`.

## 9. Implementation References

- `plans/implementation/queuing_service_impl.md`
- `plans/implementation/domain_data_model.md`
- `plans/v2_progress_tracking.md`
