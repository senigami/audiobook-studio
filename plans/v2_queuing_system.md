# Proposal: Modular Queuing System (Studio 2.0)

## 1. Objective
Redesign the existing asynchronous job system into a standalone, modular component that can handle diverse task types (synthesis, assembly, export, build) without deep awareness of the task's internal logic.

> [!NOTE]
> See the [Detailed Implementation Blueprint](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/plans/implementation/queuing_service_impl.md) for technical specifics on resource locking and class structures.

## 2. Key Concepts

> [!IMPORTANT]
> Transitioning from the legacy worker to this modular system involves a parallel execution phase. See the [Conversion & Verification Strategy](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/plans/implementation/conversion_strategy.md) for details.

### 2.1 The `StudioTask` Abstraction
Instead of branching in the worker loop, every job in the queue becomes a subclass of a base `StudioTask`.

```python
class StudioTask:
    task_id: str
    priority: int = 10
    on_progress: Optional[Callable]
    on_complete: Optional[Callable]
    on_error: Optional[Callable]

    def run(self):
        """Implemented by specific task types."""
        raise NotImplementedError
```

### 2.2 Discrete Task Types
- **`SynthesisTask`**: Logic for calling a voice engine.
- **`AssemblyTask`**: Logic for merging chunks into a chapter or audiobook.
- **`SampleBuildTask`**: Logic for creating voice profile samples.
- **`ExportTask`**: Logic for format conversion and metadata tagging.

## 3. Modular Architecture

### 3.1 `QueueManager` (The Orchestrator)
A central service that manages multiple internal queues (Synthesis, Assembly, IO).
- **Responsibility**: Task submission, pause/cancel coordination, and dispatching to available workers.
- **Decoupling**: The backend API interacts only with the `QueueManager`, not the workers directly.

### 3.2 `WorkerPool` (Single-Machine Optimized)
A configurable pool of local workers designed to maximize UX without starving the OS.
- **The Heavy Worker Rules**: Local GPU-heavy synthesis should default to one active task at a time, but the scheduler should model this as a resource quota rather than a hardcoded universal rule.
- **Concurrent IO Pool**: Lightweight tasks (assembly, conversion, API calls) run in a secondary background pool.
- **Per-Engine Policies**: Cloud requests, CPU-bound normalization, and GPU synthesis should not all compete for the exact same slot.

### 3.3 Callback System
Each task can register "Hook" callbacks that trigger upon specific events:
- `on_start`: e.g., Update UI status to "Running".
- `on_chunk_complete`: e.g., Update individual segment progress for the Chapter Editor.
- `on_success`: e.g., Trigger the next task in a chain (Chapter -> Assembly).

## 4. Item Processing & Piece Mapping

The 2.0 system will implement an "Item Registry" that allows the queue to understand the composition of a complex job.

- **Example**: If a chapter job is submitted, the queue creates a parent task and multiple sub-tasks for segments.
- **Resumption**: The `QueueManager` can query the Item Registry to see exactly which pieces are finished before starting workers, eliminating the need for hardcoded "resume state" logic in the worker loop.
- **Revision Safety**: The registry should track a segment revision hash so a previously rendered file is only reused when it matches the exact current input.
- **Parent/Child Semantics**: Parent jobs should surface aggregate state such as `waiting`, `partially_done`, `needs_review`, and `blocked` so the UI can explain what is happening.

## 5. Persistence & Recovery

- **Source of Truth**: The Database becomes the primary source of truth for queue state.
- **Lifecycle**:
    1. API writes task to DB.
    2. `QueueManager` picks up task and creates an in-memory execution object.
    3. Status updates are written to DB *and* broadcast via WebSocket.
    4. Upon restart, the `QueueManager` re-hydrates only "pending" or "interrupted" tasks from the DB.

## 5.1 Potential Problems And Better Implementations

- **Problem: A single global lock can leave safe work idle**
  Better implementation: Model resources explicitly, such as `gpu`, `cpu_light`, `network`, and `disk_io`, then let each task declare what it needs.
- **Problem: Queue reorder can become unpredictable across parent and child jobs**
  Better implementation: Reprioritize at the parent-job level by default, with child order derived deterministically unless the user explicitly drills in.
- **Problem: Retries can loop on bad input**
  Better implementation: Distinguish retriable infrastructure failures from non-retriable content/configuration failures and move the latter into `needs_review`.
- **Problem: "Pause queue" can produce half-understood states**
  Better implementation: Define pause behavior separately for queued, running, and chained tasks, and surface the exact effect in the UI.

## 5.2 UX Refinements

- **Queue Transparency**: Show why a task is waiting, not just that it is queued. Examples: `Waiting for GPU`, `Waiting for voice module setup`, `Blocked by missing sample`.
- **Interruptibility**: Users should be able to cancel a single segment rerender without cancelling an entire book export.
- **Fast Actions**: Common queue actions should be `Pause all`, `Resume all`, `Retry failed`, and `Render selected`.
- **Recovery UX**: After app restart, recovered jobs should appear with a clear `Recovered after interruption` badge rather than silently resuming.

## 6. Planned Benefits
- **UX-First Performance**: By operating strictly as a local-first, single-heavy-worker system, we guarantee that Audiobook Studio runs predictably without slowing down the user's computer. Decentralized clustering is explicitly out-of-scope to maintain installation simplicity.
- **Maintainability**: New task types can be added by simply implementing the `StudioTask` interface.
- **Consistency**: Centralized progress math ensures that the "Global Progress Bar" and "Individual Segment Status" are always in sync.
