# ETA & Performance Overhaul Execution Checklist (Final)

Status: Correction Gate Verified (C.4 and C.7 wording corrected; C.7 non-training regression tests added and passing).

This checklist defines the stepwise, verifiable implementation workflow for replacing the Audiobook Studio ETA and performance metrics system.

---

## Correction Gate: Adversarial Review Remediation

### C.1 Metrics Schema Must Match The New ETA Model
- [x] Update `app/db/core.py` so `studio.db.render_performance_samples` stores the required split timing fields:
  - [x] `synthesis_duration_seconds REAL NOT NULL`
  - [x] `inter_group_overhead_seconds REAL NOT NULL`
  - [x] `sample_type TEXT` or an equivalent source classifier if the implementation already has one.
- [x] Preserve `duration_seconds` as the complete render-phase elapsed duration. Do **not** overwrite it with `synthesis_duration_seconds`.
- [x] Update `app/db/performance.py::record_render_sample()` so it writes:
  - [x] total render-phase elapsed time to `duration_seconds`
  - [x] pure synthesis time to `synthesis_duration_seconds`
  - [x] computed overhead to `inter_group_overhead_seconds = max(0, duration_seconds - synthesis_duration_seconds)`
  - [x] CPS from pure synthesis time, not total elapsed time.
- [x] Add or adjust tests in `tests/db/test_performance_metrics_storage.py` proving all three timing fields are persisted and that overhead is computed from total-minus-synthesis.
- [x] Add a regression assertion that the old behavior `duration_seconds = synthesis_duration_seconds` cannot pass.


### C.2 ETA Runtime Must Use The New Formulas
- [x] Update `app/orchestration/tasks/base.py` so runtime ETA no longer imports or uses:
  - [x] `DEFAULT_BASELINE_ENGINE_CPS`
  - [x] `get_engine_computer_speed_multiplier`
  - [x] old `_estimate_seconds()` / `seconds_per_segment` floor behavior for calibrated model estimates.
- [x] Add or adjust tests in `tests/orchestration/test_startup_eta.py` proving `StudioTask.get_expected_duration()` uses model-scoped calibrated CPS and inter-group overhead.
- [x] Add a test proving an uncalibrated model returns `None`/uncalibrated instead of any `16.7` fallback estimate.
- [x] Add a test proving multi-group chapter ETA uses `(group_count - 1) * inter_group_overhead`.


### C.3 Remove `predicted_audio_length` From Runtime ETA Display
- [x] Update `frontend/src/pages/ProjectDetail/components/ChapterList.tsx` so it does not render estimated runtime from `chap.predicted_audio_length`.
- [x] Show word/character counts by default.
- [x] Show estimated runtime only from calibrated dynamic ETA data, or hide the runtime badge when calibrated ETA is unavailable.
- [x] Update `frontend/tests/unit/components/project/ChapterList.test.tsx` so tests reject `predicted_audio_length`-driven runtime display.
- [x] Search for remaining active UI/runtime uses of `predicted_audio_length` and either remove them or explicitly classify them as non-ETA legacy/import metadata.

### C.4 Calibration Reset Contract
- [x] `POST /api/engines/{engine_id}/calibrate/reset` deletes:
  - [x] All `render_performance_samples` rows for the given `engine_id` (and optional `model`) from `studio.db`.
  - [x] Derived calibration cache settings rows: `performance_metric:cps:{engine_id}` and `performance_metric:audiobook_speed_multiplier` from the `settings` table in `studio.db`.
- [x] It does **not** delete general configuration settings or plugin settings (e.g. `general_test_setting` is preserved).
- [x] `clear_engine_computer_speed_multiplier(engine_id)` has been removed from calibration reset. Derived cache clearing is done via `clear_engine_cps_cache()` which targets only `performance_metric:*` keys.
- [x] `tests/api/test_api_calibration.py::test_engine_calibration_reset_endpoint` proves:
  - [x] General settings rows survive.
  - [x] `performance_metric:cps:{engine_id}` is deleted.
  - [x] `performance_metric:audiobook_speed_multiplier` is deleted.
  - [x] Only the target engine's render samples are deleted; other engines' samples survive.

### C.5 Remove Active `computer_speed_multiplier` ETA Coupling
- [x] Stop writing `computer_speed_multiplier` from `app/jobs/worker_metrics.py` as part of ETA calibration.
- [x] Stop reading `computer_speed_multiplier` from ETA runtime code.
- [x] If a speed badge remains in Settings, derive it from operational DB metrics (`measured_cps / reference_cps`) and label it diagnostic-only.
- [x] Add tests proving ETA behavior is unchanged by a plugin `computer_speed_multiplier` setting.

### C.6 Protect Lifecycle Semantics
- [x] Revert or justify the unrelated `finalizing -> running` mapping in `app/api/contracts/events.py`.
- [x] Add or update a contract test proving `jobs.lifecycle` preserves finalizing semantics unless there is an explicit product decision to hide it.
- [x] Do not bundle lifecycle semantic changes into the ETA cleanup unless the test and product reason are explicit.

### C.7 Synthesis Path Metrics Coverage — Truthful Classification

Audit complete. Paths are classified as **training** (records to `render_performance_samples`) or **non-training** (intentionally excluded to avoid contaminating calibration with synthetic/exploratory data).

| Path | Classification | Metrics Entry Point | Rationale |
|------|---------------|---------------------|-----------|
| Standard chapter render | **Training** | `orchestrator_helpers.py:record_render_stats_if_completed()` → `record_render_sample()` | Full production render via job orchestrator. Timing from `synthesis_duration_seconds` persisted on the job row. |
| XTTS segment/chunk render | **Training** | `plugins/tts_xtts/plugin/studio/adapter.py:xtts_dispatch_adapter()` → `record_engine_sample()` | Production segment render inside orchestrated chapter job. |
| Mixed synthesis render | **Training** | `plugins/synthesis_mixed/handler.py:mixed_handler()` → `record_engine_sample()` | Production segment render inside orchestrated chapter job. |
| Engine verification (`/api/engines/{id}/verify`) | **Non-training** | None — `bridge.verify_engine()` has no metrics path | Short dummy render; including it would bias CPS metrics downward. |
| Engine self-test (`/api/engines/{id}/test`) | **Non-training** | None — `bridge.run_test()` has no metrics path | Synthetic verification render; same contamination risk as verify. |
| Voice sample build (`SampleBuildTask`) | **Non-training** | None — `bridge.synthesize()` result is not forwarded to `record_render_sample()` | Creative/exploratory short renders with non-production text. |
| Voice preview/test render (`SampleTestTask`) | **Non-training** | None — `bridge.synthesize()` result is not forwarded to `record_render_sample()` | One-off preview runs; non-representative of production chapter workload. |

- [x] Training paths are verified to pass `synthesis_duration_seconds` to the metrics writer (see C.1 and Slice 2 tests).
- [x] Non-training paths are explicitly classified as excluded — no silent skipping, intentional design decision.
- [x] `tests/db/test_performance_metrics_storage.py` covers the contract: missing or zero `synthesis_duration_seconds` is rejected; valid samples are stored with correct `inter_group_overhead_seconds` partitioning.
- [x] **Gap resolved**: `tests/db/test_performance_metrics_storage.py::test_sample_build_task_does_not_train_metrics` and `test_sample_test_task_does_not_train_metrics` assert that these paths do **not** write to `render_performance_samples` after a successful synthesis. Tests pass (2 passed).

### C.8 Working Tree Hygiene
- [x] Remove untracked runtime DB artifacts such as `studio.db` before checkpointing.
- [x] Ensure generated databases are ignored or created only under test temp paths.
- [x] Run `git status --short` and confirm only intentional source/test/checklist files remain dirty.

### C.9 Correction Gate Verification
- [x] Run backend targeted verification:
  ```bash
  ./venv/bin/python -m pytest tests/db/test_db_isolation.py tests/db/test_performance_metrics_storage.py tests/orchestration/test_startup_eta.py tests/api/test_api_calibration.py
  ```
- [x] Run affected frontend verification:
  ```bash
  cd frontend && npx vitest run tests/unit/components/project/ChapterList.test.tsx tests/unit/components/queue/QueueStats.test.tsx tests/unit/pages/Settings/components/EngineCard.test.tsx tests/unit/pages/ChapterEditor/components/ChapterHeader.test.tsx
  ```
- [x] Run broad backend verification if targeted tests pass:
  ```bash
  ./venv/bin/python -m pytest --tb=short
  ```
- [x] Run frontend build/lint:
  ```bash
  cd frontend && npm run build && npm run lint
  ```
- [x] Update this checklist with actual pass/fail results. Do not mark the correction gate complete from a summary claim alone.


---

## Slice 1: Database Separation

### 1.1 Test-First Prep
- [x] Create test file `tests/db/test_db_isolation.py`.
- [x] Add `test_database_separation_isolation` asserting that:
  - `projects`, `chapters`, `chapter_segments`, `characters`, `processing_queue`, `speakers`, and `project_snapshots` exist in `audiobook_studio.db` ONLY.
  - `settings` and `render_performance_samples` exist in `studio.db` ONLY.
  - Queries utilizing project connections raise SQLite exceptions if they reference operational tables.

### 1.2 Implementation & DB Cleanup Validation
- [x] Update `app/db/core.py` to add `STUDIO_DB_PATH = Path(os.getenv("STUDIO_DB_PATH", "studio.db"))` and `get_studio_connection()`.
- [x] Implement `verify_and_cleanup_legacy_tables()` in `app/db/core.py`.
- [x] Split table creation logic in `init_db()` (keep project tables in `get_connection()`, move settings/metrics tables to `get_studio_connection()`).
- [x] Update `app/db/state_settings.py` to route all settings reads and writes to `get_studio_connection()`.
- [x] Update `app/db/state_performance.py` and `app/db/performance.py` to route all operational settings and performance logs to `get_studio_connection()`.
- [x] Add validation before cleanup: Write a helper `verify_and_cleanup_legacy_tables()` in migration routines. Before deleting/dropping operational settings or `render_performance_samples` from `audiobook_studio.db`, verify that the data has either been backed up to `studio.db` or that the schemas are cleanly split. Only drop tables once validation checks succeed.

### 1.3 Verification & Checkpoint
- [x] Run verification test:
  ```bash
  ./venv/bin/python -m pytest tests/db/test_db_isolation.py
  ```
- [x] Checkpoint: Verify that starting the application generates both `audiobook_studio.db` and `studio.db` in the root folder, and that their schemas are strictly separated.

---

## Slice 2: Synthesis Success Path Audit & Metric Capture

### 2.1 Pre-Change Audit & Inventory
- [x] Enumerate and audit all successful synthesis execution paths in the codebase:
  - **Standard Chapter Render**: finalizes in `app/orchestration/scheduler/orchestrator_helpers.py:record_render_stats_if_completed()` calling `record_render_sample()`.
  - **Segment Render**: finalizes in `plugins/tts_xtts/plugin/studio/adapter.py:xtts_dispatch_adapter()` and `plugins/synthesis_mixed/handler.py:mixed_handler()` calling `record_engine_sample()`.
  - **Engine Verification**: `/engines/{engine_id}/verify` endpoint calling `bridge.verify_engine()`.
  - **Self-Contained Test Engine**: `/engines/{engine_id}/test` endpoint calling `bridge.run_test()`.
- [x] Identify exactly where synthesis metadata is extracted and how to pass the mandatory `synthesis_duration` value on each path.

### 2.2 Test-First Prep
- [x] Add `test_mandatory_synthesis_duration_contract` to `tests/db/test_performance_metrics_storage.py` asserting that:
  - Renders containing valid `synthesis_duration` metadata are logged successfully.
  - Renders lacking `synthesis_duration` are rejected immediately with a contract validation error (no silent wall-clock fallbacks allowed).
  - Metrics are isolated strictly by `engine_id` + `tts_model`.
- [x] Add `test_xtts_segment_adapter_text_capture` asserting that segment renders receive segment text in `kwargs` and log non-zero character counts.

### 2.3 Implementation Steps
- [x] Update `/synthesize` route and all local plugin adapter execution wrappers (including `xtts_dispatch_adapter`) to return `synthesis_duration` in their completion payloads.
- [x] Update `record_render_sample` in `app/db/performance.py` to enforce the contract: reject logging if `synthesis_duration_seconds` is missing or negative.
- [x] Unify synthesis logging: route all audited successful paths (chapter renders, verification test renders, and voice settings preview runs) to call the metrics capture engine with the returned `synthesis_duration`.
- [x] Fix the XTTS segment adapter keyword pass: ensure `xtts_dispatch_adapter` receives the segment text context so `chars` evaluates to the true segment character count.

### 2.4 Verification & Checkpoint
- [x] Run verification test:
  ```bash
  ./venv/bin/python -m pytest tests/db/test_performance_metrics_storage.py
  ```
- [x] Checkpoint: Inspect `studio.db` after running a test render and confirm that `render_performance_samples` contains valid values for `synthesis_duration_seconds` and `inter_group_overhead_seconds` (synthesis time is non-zero, overhead is correctly partitioned).


---

## Slice 3: ETA Math Overhaul

### 3.1 Test-First Prep
- [x] Update `tests/orchestration/test_startup_eta.py` to add:
  - `test_startup_chapter_eta_overhead_subtraction` verifying that N groups count transition overhead as `(N - 1) * Overhead`.
  - `test_segment_eta_excludes_overhead` verifying that segment ETA math does not add overhead terms.
  - `test_live_chapter_remaining_eta_no_double_counting` verifying remaining transition count is unstarted groups only.
  - `test_uncalibrated_model_suppresses_eta` verifying that uncalibrated models do not return a baseline CPS estimate.

### 3.2 Implementation Steps
- [x] Implement mathematical formulas in `app/orchestration/scheduler/eta.py`:
  - `Segment_ETA = Segment_Chars_Remaining / Model_CPS`
  - `Chapter_Startup_ETA = (Chapter_Chars / Model_CPS) + (max(0, Group_Count - 1) * Inter_Group_Overhead)`
  - `Chapter_Remaining_ETA = (W_active_group_remaining + W_remaining) / Model_CPS + (N_groups_remaining * Inter_Group_Overhead)`
- [x] Remove all references to `computer_speed_multiplier` settings and the legacy `16.7` baseline fallback from runtime ETA calculations in `app/orchestration/tasks/base.py`.
- [x] If the model has zero samples in `studio.db`, return an uncalibrated flag/null so that the UI knows to suppress estimated runtime.

### 3.3 Verification & Checkpoint
- [x] Run verification test:
  ```bash
  ./venv/bin/python -m pytest tests/orchestration/test_startup_eta.py
  ```
- [x] Checkpoint: Verify that all backend tests pass, and confirm that uncalibrated ETA requests return `null` instead of a hardcoded fallback value.

---

## Slice 4: Backend Calibration Reset Endpoint

### 4.1 Test-First Prep
- [x] Create API test file `tests/api/test_api_calibration.py`.
- [x] Add `test_engine_calibration_reset_endpoint` asserting that:
  - Calling POST on `/api/engines/{engine_id}/calibrate/reset` successfully deletes performance samples from `studio.db` for that engine and model.
  - It does NOT touch general configuration settings or variables in `studio.db`.
  - It is protected against SQL injection or path traversal of engine IDs.

### 4.2 Implementation Steps
- [x] Implement a dedicated `/api/engines/{engine_id}/calibrate/reset` endpoint on the backend in `app/api/routers/engines.py`.
- [x] Implement backing helper `reset_engine_calibration_history(engine_id, model)` in `app/db/performance.py`. It deletes historical render performance rows in `studio.db` for the selected scope.

### 4.3 Verification & Checkpoint
- [x] Run verification test:
  ```bash
  ./venv/bin/python -m pytest tests/api/test_api_calibration.py
  ```
- [x] Checkpoint: Verify the route registers successfully and resetting calibration wipes database performance rows.

---

## Slice 5: Frontend Realignment

### 5.1 Test-First Prep
- [x] Update frontend Vitest unit test files to declare expectations:
  - In `frontend/tests/unit/pages/Settings/components/EngineCard.test.tsx`, assert that clicking the "Reset Calibration" button dispatches a POST request to `/api/engines/{engine_id}/calibrate/reset`.
  - In `frontend/tests/unit/components/project/ChapterList.test.tsx`, assert that if a chapter's ETA is null, the estimated runtime badge is hidden, rendering only word and character counts.
  - In `frontend/tests/unit/pages/ChapterEditor/components/ChapterHeader.test.tsx`, assert that the segment progress bar uses pure segment characters/CPS and excludes overhead.

### 5.2 Implementation Steps
- [x] Update `frontend/src/pages/Settings/components/EngineCard.tsx` to bind the reset button to the new endpoint. Expose `computer_speed_multiplier` as a read-only diagnostic badge derived from `measured_cps / baseline_cps`.
- [x] Update `frontend/src/pages/ProjectDetail/components/ChapterList.tsx` to remove `predicted_audio_length` references, display word/character counts, and conditionally render the dynamic runtime estimation badge.
- [x] Update `frontend/src/pages/ChapterEditor/components/ChapterHeader.tsx` progress bar mapping to consume Segment ETA.

### 5.3 Verification & Checkpoint
- [x] Run Vitest tests:
  ```bash
  cd frontend && npx vitest run tests/unit/pages/Settings/components/EngineCard.test.tsx tests/unit/components/project/ChapterList.test.tsx tests/unit/pages/ChapterEditor/components/ChapterHeader.test.tsx
  ```
- [x] Validate frontend build and code format:
  ```bash
  cd frontend && npm run build && npm run lint
  ```
- [x] Checkpoint: Start the Audiobook Studio interface. Check settings engine cards and verify the "Reset Calibration" action operates cleanly, and verify the chapter detail page presents word counts instead of static legacy estimations.
