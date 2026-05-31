# Synthesis Success Path Audit & Metric Capture Inventory

This document details the audit of all successful synthesis execution paths in the Audiobook Studio repository, identifying how and where synthesis duration is captured and how it maps to the mandatory database contract.

## 1. Audited Synthesis Paths

### 1.1 Standard Chapter Render
* **Trigger/Path**: Initiated via Chapter/Project generation which submits tasks (e.g. `ApiSynthesisTask`) to the orchestrator.
* **Execution**: `app/orchestration/tasks/api_synthesis.py` delegates to `bridge.synthesize(request)`.
* **Metadata Capture**: 
  - `ApiSynthesisTask.run()` retrieves `duration_sec` from the bridge response.
  - Updates the job state in SQLite via `update_job(self.task_id, synthesis_duration_seconds=duration_sec)`.
* **Metrics Recording**:
  - `app/orchestration/scheduler/orchestrator_helpers.py:record_render_stats_if_completed()` runs on task completion.
  - It retrieves `synthesis_duration_seconds` from the persisted job state.
  - It calls `record_render_sample(...)` with the retrieved value.

### 1.2 Segment Render
* **Trigger/Path**: Segment generation under specific adapters (XTTS and mixed).
* **Execution (XTTS)**:
  - `plugins/tts_xtts/plugin/studio/adapter.py:xtts_dispatch_adapter()` runs and calls `handle_xtts_job`.
  - `handle_xtts_job` returns `duration_sec` in its payload.
  - The job's `synthesis_duration_seconds` is updated by `generate_via_bridge` (which handles the call under the hood).
  - Metrics are recorded via `record_engine_sample(j, start, chars, perf, 0)` in `xtts_dispatch_adapter`.
* **Execution (Mixed)**:
  - `plugins/synthesis_mixed/handler.py:mixed_handler()` processes chunk groups.
  - For each chunk group, it calls `_render_segment` which delegates to `generate_via_bridge`.
  - `generate_via_bridge` updates the job's `synthesis_duration_seconds` using `update_job`.
  - At the end of `mixed_handler`, metrics are recorded via `record_engine_sample(j, start, chars, perf, 0)`.

### 1.3 Engine Verification
* **Trigger/Path**: API POST route `/api/engines/{engine_id}/verify` which checks if an engine is functional.
* **Execution**: Calls `bridge.verify_engine()` or similar in the bridge implementation.
* **Metrics Recording**:
  - Verification runs do not represent production render runs and are not saved as training metrics/samples to `studio.db` to avoid skewing standard runtime ETAs with short dummy/verification requests.

### 1.4 Self-Contained Test Engine
* **Trigger/Path**: API POST route `/api/engines/{engine_id}/test` or Settings page engine preview.
* **Execution**: Invokes engine generation via bridge.
* **Metrics Recording**:
  - Engine tests are primarily used to verify functionality or bootstrap a baseline.
  - If a baseline is bootstrapped, it records settings or a baseline speed sample directly in `studio.db` but does not record standard runtime chapter progress samples to prevent contamination.

---

## 2. Validation & Mandatory Database Contract
- The metrics database (`studio.db`) table `render_performance_samples` requires a non-null, non-negative float value in `synthesis_duration_seconds`.
- Any call to `record_render_sample` that passes `synthesis_duration_seconds=None` or a negative value will raise a `ValueError`.
- In standard orchestrator-based renders, `synthesis_duration_seconds` is recorded correctly and validation prevents uncalibrated values from polluting the historical data.
