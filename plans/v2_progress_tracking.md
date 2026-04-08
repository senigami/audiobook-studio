# Proposal: Standalone Progress & ETA Service (Studio 2.0)

## 1. Objective
Extract progress calculation and ETA prediction logic into a dedicated, reusable component that provides a unified "Global Progress" view for any item processed by the system.

> [!NOTE]
> See the [Detailed Implementation Blueprint](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/plans/implementation/progress_service_impl.md) for ETA formulas and piece-mapping algorithms.

## 2. Key Responsibilities

> [!IMPORTANT]
> For the phased rollout and testing plan of this component, refer to the [Conversion & Verification Strategy](file:///Users/stevendunn/GitHub-Steven/audiobook-factory/plans/implementation/conversion_strategy.md).

### 2.1 Piece Mapping (The State Reconciler)
Instead of the worker loop manually checking for existing files, the Progress Service provides a `get_work_map(item_id)` method.
- **Function**: Compares the expected output (e.g., all segments for a chapter) against the database/filesystem.
- **Result**: Returns a detailed map of `done` vs `pending` items, allowing the queue to skip completed work and the progress bar to start at the correct offset immediately upon resumption.

### 2.2 Predictive ETA Engine
A centralized algorithm for estimating completion times.
- **Context-Aware**: Uses engine-specific performance metrics (e.g., characters-per-second for XTTS vs seconds-per-megabyte for M4B assembly).
- **Hardward Integration**: Accounts for current system load or concurrent tasks.
- **Adaptive**: Updates estimates in real-time based on actual synthesis speed during the job.

### 2.3 Consistent Broadcasting
Provides a single `BroadcastProgress(jid, value, metadata)` interface.
- **Rounding**: Enforces project-standard rounding (e.g., 2 decimal places).
- **Throttling**: Automatically handles broadcast frequency (e.g., "only broadcast on >1% change" as per rules).

## 3. Component Architecture

### 3.1 Backend: `ProgressMonitor` Service
A service that hooks into the `QueueManager`.
- **Hooks**: Listens to `on_chunk_complete` events from workers.
- **State Logic**: Aggregates sub-task progress into parent job progress (e.g., 10/20 segments done = 50% chapter progress).

### 3.2 Frontend: `useGlobalProgress` Hook
A unified hook or state-store (Zustand/Redux) that decouples progress display from individual page components.
- **Global Visibility**: The Progress Bar in the Header can listen to any active job without needing to know the context of the current page.
- **Resumption Visuals**: Ensures that when a user refreshes or switches projects, the progress bar "snaps" to the accurate state retrieved from the reconciliation map.

## 4. Item Detail Mapping
The service will support detailed mapping for complex items:
- **Chapters**: Track progress by Segment ID.
- **Books**: Track progress by Chapter ID.
- **Voice Training**: Track progress by processing step (Preprocessing -> Training -> Testing).

## 5. Planned Benefits
- **Zero-Jump UI**: Eliminates the "0% to 50% jump" when resuming a partially finished chapter.
- **Decoupled Logic**: Changes to how we calculate math for ETA won't require touching worker or engine code.
- **Mathematical Accuracy**: A single source of truth for "Total Weight" vs "Current Progress," regardless of task type.
