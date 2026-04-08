# Implementation Blueprint: Progress & ETA Service (Studio 2.0)

## 1. Objective
Centralize all progress-related calculations and broadcasting, ensuring that "Total Progress" and "Expected Finish Time" are mathematically consistent across all layers of the application.

## 2. The ETA Formula
The 2.0 system will use a weighted average formula for ETA, factoring in engine-specific multipliers.

### 2.1 Variables
- `W_total`: Total weight of the job (e.g. total characters in a chapter).
- `W_done`: Weight already completed.
- `R_base`: Baseline performance (e.g. 15 characters/sec).
- `M_engine`: The `global_speed_multiplier` from engine settings.
- `R_actual`: The moving average of actual performance during the current session.

### 2.2 The Calculation
```
EstimatedRemainingTime = (W_total - W_done) / (R_base * M_engine * alpha + R_actual * (1 - alpha))
```
- `alpha`: A smoothing factor (e.g., 0.8) that favors base performance initially but pivots to actual performance as the job progresses.

## 3. Piece Mapping (Reconciliation Logic)
The `ProgressService` provides a `map_status(item_ids)` method called before a job starts.

### 3.1 Algorithm
1. Retrieve the list of expected output files for the given `item_ids`.
2. Check the Database for `done` status.
3. Verify the Filesystem for physical exists.
4. If status is `done` but physical file is missing -> Mark `pending`.
5. If status is `pending` but physical file exists -> Mark `done` (Auto-reconciliation).
6. Return `(completed_count, total_count, pending_ids)`.

## 4. Unified Broadcaster
A singleton service that manages WebSocket frequency rules.
- **Rules Engine**:
    - Never broadcast more than once every 500ms for a single job.
    - Always broadcast if progress crosses a % threshold (default: 1%).
    - Always broadcast if the `status` string changes (e.g., `preparing` -> `running`).

## 5. Interface Definition (Python)

```python
class ProgressService:
    def get_eta(self, jid) -> int:
        """Returns seconds remaining."""
        pass

    def reconcile_chapter(self, chapter_id) -> Tuple[float, List[str]]:
        """Returns (initial_progress, pending_segment_ids)."""
        pass

    def update(self, jid, weight_delta):
        """Called by workers to advance progress."""
        pass
```

## 6. Planned Benefits
- **Mathematical Uniformity**: The Global Progress bar and individual segment bars use a single calculation source.
- **Robust Resumption**: Zero "pre-flight" synthesis; we simply don't enqueue segments that the `ProgressService` declares `done`.
- **Human-Friendly Estimates**: The weighted ETA prevents wild fluctuations in "Time Remaining" if the system briefly slows down.
