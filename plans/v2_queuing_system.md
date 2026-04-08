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
- **The Heavy Worker Rules**: The system enforces a strict limit of ONE "Heavy" synthesis task at a time. This ensures system stability and prevents UI lockups.
- **Concurrent IO Pool**: Lightweight tasks (assembly, conversion, API calls) run in a secondary background pool.

### 3.3 Callback System
Each task can register "Hook" callbacks that trigger upon specific events:
- `on_start`: e.g., Update UI status to "Running".
- `on_chunk_complete`: e.g., Update individual segment progress for the Chapter Editor.
- `on_success`: e.g., Trigger the next task in a chain (Chapter -> Assembly).

## 4. Item Processing & Piece Mapping

The 2.0 system will implement an "Item Registry" that allows the queue to understand the composition of a complex job.

- **Example**: If a chapter job is submitted, the queue creates a parent task and multiple sub-tasks for segments.
- **Resumption**: The `QueueManager` can query the Item Registry to see exactly which pieces are finished before starting workers, eliminating the need for hardcoded "resume state" logic in the worker loop.

## 5. Persistence & Recovery

- **Source of Truth**: The Database becomes the primary source of truth for queue state.
- **Lifecycle**:
    1. API writes task to DB.
    2. `QueueManager` picks up task and creates an in-memory execution object.
    3. Status updates are written to DB *and* broadcast via WebSocket.
    4. Upon restart, the `QueueManager` re-hydrates only "pending" or "interrupted" tasks from the DB.

## 6. Planned Benefits
- **UX-First Performance**: By operating strictly as a local-first, single-heavy-worker system, we guarantee that Audiobook Studio runs predictably without slowing down the user's computer. Decentralized clustering is explicitly out-of-scope to maintain installation simplicity.
- **Maintainability**: New task types can be added by simply implementing the `StudioTask` interface.
- **Consistency**: Centralized progress math ensures that the "Global Progress Bar" and "Individual Segment Status" are always in sync.
