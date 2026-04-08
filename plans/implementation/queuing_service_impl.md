# Implementation Blueprint: Queuing & Resource Service (Studio 2.0)

## 1. Objective
Build a robust, single-machine optimized queuing service that ensures maximum performance without starving system resources during heavy synthesis tasks.

## 2. Service Architecture

### 2.1 The `TaskOrchestrator`
A central Python service (singleton) that manages the lifecycle of all jobs.
- **Single-Machine Priority**: The codebase strictly assumes local execution. Decentralized workers (Redis, Celery) are explicitly omitted to keep installation and resource usage simple.
- **Resource Lock**: A `threading.BoundedSemaphore` initialized strictly to `1` ensures that only one heavy synthesis job runs at a time. This prevents thread thrashing and OS lockups.
- **Concurrent IO**: A separate `ThreadPoolExecutor` for lightweight tasks (file combining, metadata tagging) that can run in parallel with synthesis.

### 2.2 Task Registry & Logic
Instead of hardcoded `if engine == "xtts"`, tasks register their "Resource Profile".

```python
class TaskProfile(Enum):
    HEAVY = "heavy"   # Consumes GPU/CPU (e.g. Synthesis)
    LIGHT = "light"   # Consumes IO/Network (e.g. Voxtral API, Assembly)

class StudioTask:
    profile: TaskProfile
    # ... other methods
```

### 2.3 Execution Flow
1. Task is added to the `ActiveQueue` (DB-backed).
2. `TaskOrchestrator` picks the next high-priority task.
3. If profile is `HEAVY`, it waits for the `GlobalResourceLock`.
4. The worker executes `task.run()`.
5. Upon completion/error, the lock is released and callbacks are fired.

## 3. Metadata for ETA
The queue provides metadata to the `ProgressService`:
- `start_time`: Real wall-clock time synthesis began.
- `last_chunk_duration`: How long the last rendered segment took.
- `engine_speed_multiplier`: Exposed per engine in settings, used to adjust base ETA.

## 4. Error Handling & Retry Logic
- **Internal Failures**: Configurable retry count for tasks.
- **System Restarts**: The `Orchestrator` re-scans the DB on boot and re-enqueues "Interrupted" tasks, passing them through the `ProgressService`'s piece-map to skip finished work.

## 5. UI Integration
- **Queue Status Overlay**: Shows "Waiting for Resources" if a heavy task is blocked by another.
- **Batch Controls**: Ability to pause the entire queue or reprioritize individual chapters.
