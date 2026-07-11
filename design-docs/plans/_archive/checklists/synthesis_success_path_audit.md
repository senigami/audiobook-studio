# Synthesis Success Path Audit & Metric Capture Inventory

This document details the audit of all successful synthesis execution paths in the Audiobook Studio
repository, with an explicit training/non-training classification for each path.

---

## 1. Path Classification Matrix

| Path | Classification | Metrics Entry Point | Rationale |
|------|---------------|---------------------|-----------|
| Standard chapter render | **Training** | `orchestrator_helpers.py:record_render_stats_if_completed()` → `record_render_sample()` | Full production render via job orchestrator. `synthesis_duration_seconds` is written to the job row and read back at completion. |
| XTTS segment/chunk render | **Training** | `plugins/tts_xtts/plugin/studio/adapter.py:xtts_dispatch_adapter()` → `record_engine_sample()` | Production segment render inside an orchestrated chapter job. |
| Mixed synthesis render | **Training** | `plugins/synthesis_mixed/handler.py:mixed_handler()` → `record_engine_sample()` | Production segment render inside an orchestrated chapter job. |
| Engine verification (`/api/engines/{id}/verify`) | **Non-training** | None — `bridge.verify_engine()` returns a status result with no timing data forwarded to metrics | Short dummy render; including it would bias CPS calibration downward with unrepresentative short-run times. |
| Engine self-test (`/api/engines/{id}/test`) | **Non-training** | None — `bridge.run_test()` returns `{ok: true, audio_url}` with no timing data forwarded to metrics | Synthetic verification render; same contamination risk as verify. |
| Voice sample build (`SampleBuildTask`) | **Non-training** | None — `bridge.synthesize()` result is checked for `status == "ok"` but `duration_sec` is not forwarded to `record_render_sample()` | Creative/exploratory short renders with non-production text; not representative of chapter-length workloads. |
| Voice preview/test render (`SampleTestTask`) | **Non-training** | None — `bridge.synthesize()` result is checked for `status == "ok"` but `duration_sec` is not forwarded to `record_render_sample()` | One-off preview runs; non-representative of production chapter workload. |

---

## 2. Training Path Detail

### 2.1 Standard Chapter Render

- **Trigger**: Chapter/project generation submits an `ApiSynthesisTask` to the orchestrator.
- **Execution**: `app/orchestration/tasks/api_synthesis.py` delegates to `bridge.synthesize(request)`.
- **Timing capture**: `ApiSynthesisTask.run()` retrieves `duration_sec` from the bridge response and persists it via `update_job(self.task_id, synthesis_duration_seconds=duration_sec)`.
- **Metrics recording**: On task completion, `record_render_stats_if_completed()` in `app/orchestration/scheduler/orchestrator_helpers.py` reads `synthesis_duration_seconds` from the persisted job row and calls `record_render_sample(...)`.

### 2.2 XTTS Segment/Chunk Render

- **Execution**: `plugins/tts_xtts/plugin/studio/adapter.py:xtts_dispatch_adapter()` → `handle_xtts_job()`.
- **Timing capture**: `handle_xtts_job` returns `duration_sec` in its payload.
- **Metrics recording**: `xtts_dispatch_adapter` calls `record_engine_sample(j, start, chars, perf, 0)`.

### 2.3 Mixed Synthesis Render

- **Execution**: `plugins/synthesis_mixed/handler.py:mixed_handler()` processes chunk groups.
- **Timing capture**: `generate_via_bridge` updates `synthesis_duration_seconds` on the job.
- **Metrics recording**: At the end of `mixed_handler`, calls `record_engine_sample(j, start, chars, perf, 0)`.

---

## 3. Non-Training Path Rationale

Non-training paths are **intentionally excluded** from `render_performance_samples`. Adding them would contaminate CPS calibration with short synthetic or exploratory renders that are not representative of chapter-length production workloads.

| Path | Why excluded |
|------|-------------|
| Engine verify | Short dummy render, not production text length |
| Engine self-test | Synthetic verification audio, same issue |
| Voice sample build | Creative exploratory run with custom short text |
| Voice preview/test | One-off preview, non-production workload |

---

## 4. Mandatory Database Contract

- `render_performance_samples` requires a positive `synthesis_duration_seconds` value.
- `record_render_sample()` in `app/db/performance.py` enforces this: missing or non-positive `synthesis_duration_seconds` raises `ValueError`.
- `inter_group_overhead_seconds` is computed as `max(0, duration_seconds - synthesis_duration_seconds)`.
- CPS is computed from `synthesis_duration_seconds` only, not total wall-clock time.

---

## 5. Regression Coverage (Verified)

The non-training classification for `SampleBuildTask` and `SampleTestTask` is locked in by explicit
tests in `tests/db/test_performance_metrics_storage.py`:

- `test_sample_build_task_does_not_train_metrics` — mocks a successful `bridge.synthesize()` call
  and asserts `render_performance_samples` stays empty after `SampleBuildTask.run()` completes.
- `test_sample_test_task_does_not_train_metrics` — same contract for `SampleTestTask.run()`.

Both tests pass. Any future accidental metrics write from these paths will surface as a test failure.
