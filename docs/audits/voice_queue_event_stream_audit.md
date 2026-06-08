# Voice Queue And Event Stream Audit

Date: 2026-06-07

Scope: current queue writers, live event-stream contracts, Voxtral mapping, and mixed-render mapping compared with the declared contract in `docs/event_stream_processing_schema.md`.

Status: audit only. No code changes were made for this report.

Audience: this file is intended to be usable as a standalone handoff for an implementation worker who has not followed the prior queue/debugging conversation.

## Contract Baseline

The current contract docs define the following ownership model:

- `queue.items` is the authoritative live queue-row topic.
- `jobs.lifecycle` owns durable job lifecycle transitions.
- `chapters.progress` and `segments.progress` own scoped render progress.
- `voice.test` owns voice preview/test telemetry.
- `tts.logs` is diagnostics only and must not be used as queue state.

Important distinction:

- Persistent queue ownership is the SQLite `processing_queue` row lifecycle.
- Live queue transport ownership is the `queue.items` websocket topic.
- Progress overlays can enrich what the user sees, but they should not create or reclassify durable queue rows by themselves.

The documented queue lifecycle order is:

1. create or refresh the queue row as `queued`
2. emit `JOB_PREPARING`
3. emit `START_SYNTHESIS`
4. emit scoped runtime progress on the correct topic
5. emit terminal job lifecycle
6. emit terminal `queue_item_status`
7. use `queue_item_invalidated` only when a refresh is needed

## Current Queue Writers

| Path | What it writes today | Contract target | Notes |
| --- | --- | --- | --- |
| `app/api/routers/voices_actions.py` | Inserts queue rows for `voice_build` and `voice_test` with `upsert_queue_row(...)` and then submits sample tasks. | `queue.items` | This is the entrypoint for voice-build/test queue rows. |
| `app/api/routers/generation.py` | Standard chapter queueing inserts `processing_queue` rows through `db_add_to_queue(...)`; bake and segment generation create `Job` objects and publish refreshes but do not insert queue rows in the same way. | `queue.items`, `jobs.lifecycle`, `chapters.progress`, `segments.progress` | This is a high-priority correctness gap: active live overlays can appear, but hard reload/persistent queue history can differ for bake/segment jobs because no durable queue row is guaranteed. |
| `app/api/routers/projects_assembly.py` | Queues assembly work with `put_job(...)` and `update_job(..., status="queued")`, but does not insert a `processing_queue` row before state sync. | `jobs.lifecycle`, `queue.items` | Assembly is routed through job state sync rather than a dedicated queue helper. This has the same durable-row risk as bake/segment jobs. |
| `app/db/state_jobs.py` | Synchronizes job status changes to existing `processing_queue` rows, updates chapter status, normalizes incoming `finalizing` status to `running`, and broadcasts websocket updates. | `queue.items` plus lifecycle topics | This keeps existing SQLite queue rows aligned with `state.json`, but it updates existing rows rather than creating missing rows. A job can emit live lifecycle updates and still be absent from durable queue history after reload. |
| `app/orchestration/progress/service.py` | Publishes orchestrator progress to `queue.items`, `voice.test`, `chapters.progress`, and `segments.progress`. | topic-specific live events | This is the canonical orchestrator publish path. |
| `app/api/ws.py` | Fan-out router that converts job updates into canonical websocket events. | `queue.items`, `jobs.lifecycle`, `chapters.progress`, `segments.progress`, `voice.test`, `tts.logs` | This is the live websocket mapper. |
| `app/jobs/worker_voice.py` | Legacy/registry voice-job handler that generates a sample, converts to MP3, and then sends final `update_job(..., status="done")`. | `jobs.lifecycle` / `queue.items` | The current voice-build/test router submits `SampleBuildTask` / `SampleTestTask`; this worker remains registered as a kind fallback and still has stale MP3 behavior. |
| `app/jobs/handlers/bridge_helpers.py` | Records synthesis duration back onto the job after bridge completion. | job metadata / queue sync | This is timing persistence, not a topic writer. |
| `app/jobs/worker_metrics.py` | Persists render performance samples after completion. | analytics / historical metrics | This does not author live queue state. |

### Evidence Anchors

Use these anchors before changing behavior. Line numbers may drift, but the functions and nearby statements should remain findable.

- Durable queue row helper: `app/db/queue.py::upsert_queue_row(...)`. Its docstring says every job should appear in the global queue, but not every enqueue route calls it today.
- Update-only queue helper: `app/db/queue.py::update_queue_item(...)`. It executes `UPDATE processing_queue ... WHERE id = ?` and then reads the row back. It does not create a missing row.
- Standard chapter enqueue: `app/api/routers/generation.py::api_add_to_queue(...)` calls `db_add_to_queue(...)` before `put_job(...)`; this is the currently safest durable queue path.
- Bake enqueue: `app/api/routers/generation.py::api_bake_chapter(...)` creates `jid = "bake-..."` and calls `put_job(j)`, but does not call `upsert_queue_row(...)`.
- Segment enqueue: `app/api/routers/generation.py::api_generate_segments(...)` creates `jid = "job-..."`, calls `put_job(job)`, and then broadcasts a queue refresh, but does not call `upsert_queue_row(...)`.
- Assembly enqueue: `app/api/routers/projects_assembly.py::api_assemble_project(...)` creates a `Job`, calls `put_job(j)`, and then `update_job(..., status="queued")`, but does not call `upsert_queue_row(...)`.
- State sync: `app/db/state_jobs.py::put_job(...)` and `update_job(...)` normalize `finalizing` to `running`; `update_job(...)` calls `update_queue_item(...)` on selected updates but cannot guarantee row creation.
- Voice queue rows: `app/api/routers/voices_actions.py` calls `upsert_queue_row(...)` for voice build/test jobs and submits `SampleBuildTask` / `SampleTestTask`.
- Canonical voice-test publisher: `app/orchestration/progress/service.py::ProgressService.publish(...)` emits both `queue.items` and `voice.test` for `scope == "voice_test"`.
- Stale voice-test helper: `app/api/ws.py::broadcast_test_progress(...)` builds a `voice.test` event without adding `ids.jobId`.
- Voice-test event builder: `app/api/contracts/events.py::build_voice_test_progress_event(...)` has no explicit `job_id` argument.
- Sample MP3 conversion: `app/orchestration/tasks/sample_build.py::SampleBuildTask.run(...)`, `app/orchestration/tasks/sample_test.py::SampleTestTask.run(...)`, `app/jobs/worker_voice.py::handle_voice_job(...)`, and `plugins/tts_xtts/plugin/studio/adapter.py::xtts_dispatch_adapter(...)` still use `sample.mp3`.
- Mixed direct queue write: `plugins/synthesis_mixed/handler.py::_persist_mixed_chapter_output(...)` calls `update_queue_item(...)` directly.
- Mixed finalizing/MP3 branch: `plugins/synthesis_mixed/handler.py` still sets `status="finalizing"` and checks `j.make_mp3`.
- Frontend queue consumers: `frontend/src/config/liveEventConsumers.ts`, `frontend/src/hooks/useQueueSync.ts`, and `frontend/src/hooks/useJobs.ts` currently let non-`queue.items` topics affect queue-adjacent state.

## Frontend Consumption Mapping

Current behavior:

- `frontend/src/config/liveEventConsumers.ts` says `main-queue` listens to `jobs.lifecycle`, `queue.items`, `chapters.lifecycle`, and `chapters.progress`.
- `frontend/src/hooks/useQueueSync.ts` applies queue overlays from `jobs.lifecycle`, `queue.items`, `chapters.lifecycle`, and `chapters.progress`.
- `frontend/src/hooks/useJobs.ts` also consumes `queue.items`, `chapters.progress`, `segments.progress`, and `voice.test` into the live jobs map.
- `segments.progress` is intentionally kept out of `useQueueSync`, but it is consumed by `useJobs` for chapter/segment state and debug provenance.

Assessment:

- The audit's original statement that the queue is simply driven by `queue.items` was too absolute for the current frontend.
- The target contract says queue rows should be authoritative on `queue.items`, but current frontend state still relies on `jobs.lifecycle` and chapter events to refresh or overlay queue-visible data.
- This is not necessarily wrong for live overlays, but it should be documented as a discrepancy from the intended contract if those non-queue topics can create, reclassify, or remove main queue rows.
- The implementation plan must separate main queue row authority from live overlay enrichment. `chapters.progress`, `segments.progress`, and `voice.test` may still update live progress/detail surfaces if they do not become row identity or lifecycle authorities.

## Voice Build / Voice Test Mapping

Current behavior:

- `app/api/routers/voices_actions.py` creates the queue rows for `voice_build` and `voice_test`.
- `app/orchestration/scheduler/orchestrator_helpers.py` classifies `sample_build`, `sample_test`, `voice_build`, and `voice_test` as `scope="voice_test"`.
- `app/orchestration/progress/service.py` publishes both:
  - `queue_item_status` on `queue.items`
  - `voice_test_progress` on `voice.test`
- `app/api/ws.py` also has a `broadcast_test_progress(...)` helper, but it is not the canonical orchestrator path and does not inject `jobId` by itself.

Assessment:

- The queue row is still owned by `queue.items`, not by `voice.test`.
- `voice.test` is telemetry, not queue authority.
- The current implementation is closer to the declared contract than earlier branches, but the helper surface is still split between `ProgressService.publish(...)` and generic websocket helpers.
- `build_voice_test_progress_event(...)` does not accept a `job_id` argument directly; `ProgressService.publish(...)` patches `voice_event["ids"]["jobId"]` after building the event. The stale `broadcast_test_progress(...)` helper does not do this.
- `SampleBuildTask` and `SampleTestTask` still generate WAV internally and then convert the preview artifact to `sample.mp3`; that is separate from chapter synthesis but still part of the stale MP3 surface.
- The MP3 preview behavior needs an explicit product decision before implementation. Either voice previews are a narrow exception, previews become WAV, or MP3 preview files are generated only through the same on-demand export path as all other MP3 output.

## Voxtral Mapping

Current behavior in `plugins/tts_voxtral/plugin/studio/handler.py` and `plugins/tts_voxtral/plugin/core/implementation.py`:

- Voxtral is chapter-only.
- It rejects segment and bake rendering up front.
- It rejects missing `project_id` or `chapter_id`.
- It emits diagnostics through the plugin callback and the bridge layer.
- It emits `START_SYNTHESIS` before the bridge request starts.
- It still has a `make_mp3` branch with a `finalizing` phase and a terminal conversion step.

Assessment:

- Voxtral currently maps to the chapter/job path, not the segment path.
- The current start marker is a request-start marker, not a first-audio-byte marker.
- The lingering `make_mp3` and `finalizing` branches are stale relative to the WAV-first direction. `state_jobs.update_job(...)` normalizes `finalizing` to `running`, but the plugin branch and tests still exist.
- Voxtral does not currently participate in mixed rendering or segment-scoped work.
- Voxtral has no real incremental progress feed today. A chapter render is mostly lifecycle/log driven until completion.

## Mixed Render Mapping

Current behavior in `plugins/synthesis_mixed/handler.py`:

- Mixed rendering builds chunk groups and tracks weighted group progress.
- It emits `START_SEGMENT`, `PROGRESS`, and `SEGMENT_SAVED` markers through `on_output`.
- It calls `update_job(...)` repeatedly during render.
- It emits `broadcast_segments_updated(...)` during segment transitions.
- It persists final queue metadata through `_persist_mixed_chapter_output(...)`, which calls `update_queue_item(...)` directly.
- It still has a `make_mp3` branch and a `finalizing` state before conversion.

Assessment:

- Mixed rendering is the most contract-sensitive path because it currently uses both `update_job(...)` state sync and a direct queue write helper.
- Its progress model is intentionally weighted and capped for grouped rendering, so it is not a raw engine progress feed.
- The direct queue write path is a second authority that can drift from the state-sync path if the two diverge.
- Segment-scoped mixed jobs use a full `1.0` progress limit, while whole-chapter mixed jobs use a `0.9` render cap before stitch/final completion.
- Mixed render records performance history with `record_engine_sample(..., source_segment_count=0)`, which means segment count is resolved by fallback rather than an explicit true render-group count.

## XTTS Mapping

Current behavior in `plugins/tts_xtts/plugin/studio/handler.py`, `standard_handler.py`, and `segments.py`:

- XTTS routes to standard, segment, or bake handlers.
- The standard handler emits grouped progress markers and caps visible synthesis progress below completion until finalization.
- The segment handler emits per-segment progress and terminal state.
- The handler still contains `make_mp3` and `finalizing` branches.

Assessment:

- XTTS does not publish raw engine progress directly as the user-facing queue progress value.
- More precisely: XTTS raw markers are parsed, but Studio publishes a weighted/grouped render-progress model as the user-facing progress value.
- The progress contract is therefore different from forwarding a simple raw engine 0-to-1 counter.
- If future work expects exact engine-reported progress, XTTS is still implementing a higher-level render contract instead.

## Discrepancies And Risks

1. `voice.test` is correctly separated from chapter telemetry, but the helper surface is still split and `broadcast_test_progress(...)` is stale.
2. `queue.items` remains authoritative in the contract, but live queue state is still derived through a mix of `update_job(...)`, `update_queue_item(...)`, and orchestrator broadcasts.
3. The frontend main-queue path still consumes `jobs.lifecycle`, `chapters.lifecycle`, and `chapters.progress` in addition to `queue.items`. This is acceptable only if those topics enrich overlays or trigger refreshes, not if they author row identity/classification/status.
4. Standard chapter queueing persists a `processing_queue` row at enqueue time, but bake, segment generation, and assembly do not consistently use the same insert/upsert path. This is a concrete durable-queue regression risk because `update_job(...)` can update existing queue rows but does not guarantee missing row creation.
5. `finalizing` and `make_mp3` still exist in Voxtral, XTTS, mixed rendering, sample tasks, and the legacy voice worker path. Persistence normalizes some `finalizing` updates to `running`, so the main problem is stale lifecycle surface area rather than only stored status.
6. Mixed rendering still has a direct queue-write path in addition to state sync.
7. XTTS and mixed renderers both publish shaped render progress rather than forwarding raw engine progress unchanged.
8. Queue classification remains critical because `job` vs `chapter` vs `segment` determines whether a row survives hydration and retention.
9. Voice preview artifacts still use MP3 in sample paths even though chapter synthesis is WAV-first. The audit should not assume the final policy until that exception is explicitly accepted or removed.

## Next-Slice Recommendations

- Normalize queue ownership so durable row creation has one persistent path and live row transport has one `queue.items` path.
- Keep `jobs.lifecycle` for lifecycle transitions and `voice.test` for preview/test telemetry only.
- Remove or narrow stale helper surfaces that duplicate the canonical publish path.
- Align the remaining `make_mp3` and `finalizing` branches with the current WAV-first direction before the next voice slice.
- Decide whether voice preview MP3 files are allowed as an exception, replaced with WAV, or routed through the same on-demand MP3 export path.
- Add contract tests around `voice.test` job identity, queue retention, and mixed-render queue persistence if the next slice touches those paths.

## Post-Implementation Verification

The following audit items have now been implemented and verified in the repo:

- Bake, segment, and assembly enqueue paths now create durable `processing_queue` rows at entry time.
- Voice-test events now require `jobId` and are emitted through the canonical core event builder.
- Mixed render no longer writes the queue row directly during completion; queue status now flows through the shared job update path.
- Voice preview generation is WAV-first end to end. The API routes, worker, orchestration sample tasks, and preview URL helper now use `sample.wav`, and the old MP3 preview fallback was removed.
- The sample-task/orchestration tests were updated to reflect the WAV-only preview contract.
- Timeout guards were added to the longer-running pytest cases used for the queue/voice regression passes.

Verification run after implementation:

- `./venv/bin/python -m ruff check app/api/routers/voices_helpers.py tests/orchestration/test_voices_orchestration_integration.py tests/engines/test_speaker_profiles.py tests/engines/test_xtts_timing.py tests/orchestration/test_progress_logic.py`
- `./venv/bin/python -m pytest tests/orchestration/test_voices_orchestration_integration.py tests/engines/test_speaker_profiles.py tests/engines/test_xtts_timing.py tests/orchestration/test_progress_logic.py`
- `./venv/bin/python -m pytest tests/api/test_api_generation.py tests/api/test_api_projects.py tests/api/test_websocket_broadcast.py tests/orchestration/test_progress_logic.py tests/db/test_performance_metrics_storage.py plugins/synthesis_mixed/tests/test_mixed_handler.py tests/orchestration/test_voices_orchestration_integration.py tests/engines/test_speaker_profiles.py tests/engines/test_xtts_timing.py`

Residual risk:

- Legacy MP3 preview artifacts may still exist on disk in older voice profiles, but the active preview contract no longer prefers them. Rebuilding those profiles will regenerate the preview as WAV.

## Desired Shape

### Queue ownership

Target state:

- One persistent queue-row authority that creates durable `processing_queue` rows.
- One live queue transport authority: `queue.items`.
- One live state-sync path from job state into queue transport state.
- One enqueue/upsert path that creates a durable `processing_queue` row for every queue-visible job type, including standard chapters, bake jobs, segment jobs, voice build/test jobs, and assembly jobs.
- No direct queue writes from plugin handlers except through the same canonical job-state adapter that all queue-visible jobs use.
- Queue retention should depend on job classification and terminal state, not on whether a handler happened to emit a side-channel broadcast.

### Frontend queue consumption

Target state:

- `queue.items` should be the only topic that creates main queue rows or mutates row identity, classification, lifecycle status, and terminal retention state.
- `jobs.lifecycle` may be observed for debugging or broad lifecycle state, but it should not be required for queue-row correctness.
- `chapters.lifecycle` may trigger a refresh when durable chapter data changes, but it should not mutate queue-row fields.
- `chapters.progress`, `segments.progress`, and `voice.test` may update live overlay/progress fields used by queue-adjacent UI, but they should not become main queue row authority.

### Voice test telemetry

Target state:

- `voice.test` carries only preview/test telemetry.
- Every voice-test frame includes `jobId` in `ids`.
- Voice-test queue rows are rendered from `queue.items`; `voice.test` is only an auxiliary live surface.
- The helper surface should have one canonical emitter, not a parallel helper plus a special-case patch-up.

### Voxtral rendering

Target state:

- WAV is the default terminal artifact.
- MP3 conversion is on demand and does not live inside the normal synthesis lifecycle.
- Voice preview artifacts must follow the same rule unless the product intentionally defines preview MP3 files as a narrow exception.
- No `finalizing` phase for ordinary synthesis.
- `START_SYNTHESIS` marks the real synthesis start, not model loading or preflight.

### Mixed rendering

Target state:

- Mixed rendering should still own weighted grouped progress, but final queue completion should flow through the same canonical queue-state path as other jobs.
- The mixed handler should not maintain a second direct queue-write authority.
- Progress markers should remain segment-aware, but completion metadata should not require a separate persistence branch.
- Mixed performance samples should receive the actual render-group/chunk count explicitly instead of relying on fallback resolution.

### XTTS progress shape

Target state:

- If the user-facing bar is meant to show render progress, it should reflect the actual synthesis lifecycle rather than a hidden cap/finalization model.
- If grouped progress is intentionally non-linear, the contract should say so explicitly and the UI should not present it as raw engine progress.
- ETA and progress should come from the same underlying render timeline.

## Staged Implementation Slices

These slices are intentionally small enough to delegate, implement, test, and accept independently. Complete them in order unless a product decision changes the scope.

### Slice 0: Contract Decisions

Goal: remove ambiguity before implementation.

Decisions to record:

- Bake, segment, and assembly jobs are queue-visible and must create durable `processing_queue` rows.
- Voice preview artifact policy is one of: WAV-only, MP3 exception, or on-demand MP3 export.
- Non-`queue.items` topics may update live overlays but may not create rows or mutate row identity/classification/lifecycle/terminal retention.

Measurable exit criteria:

- The chosen decisions are written into this audit or the permanent contract docs.
- No code behavior changes are made in this slice.
- The implementation slices below are adjusted if the decisions differ from the recommended answers.

Verification:

```bash
git diff --check
```

### Slice 1: Queue Row Creation For Bake Jobs

Goal: bake jobs survive hard reload and appear in `/api/processing_queue`.

Scope:

- Add or reuse a canonical enqueue/upsert helper for bake jobs.
- Touch only the bake enqueue path and its tests unless the shared helper needs a narrow adjustment.

Do not include:

- Segment jobs.
- Assembly jobs.
- Frontend consumer changes.
- MP3/finalizing cleanup.

Measurable exit criteria:

- Bake enqueue creates a durable `processing_queue` row before or with `put_job(...)`.
- `/api/processing_queue` returns the bake row after reload-style hydration.
- Bake row has the expected id prefix, status, project id, chapter id, title, and engine.

Suggested tests:

- Add/update a focused test in `tests/api/test_api_generation.py` for bake enqueue queue-row persistence.
- Add/update `tests/api/test_api_queue.py` only if hydration behavior needs direct coverage.

Verification:

```bash
./venv/bin/python -m pytest tests/api/test_api_generation.py tests/api/test_api_queue.py
git diff --check
```

### Slice 2: Queue Row Creation For Segment Jobs

Goal: segment jobs survive hard reload without being mistaken for chapter rows.

Scope:

- Add or reuse the canonical enqueue/upsert helper for segment generation.
- Preserve segment-scoped classification and do not make the chapter controls enter a fake full-chapter working state.

Do not include:

- Bake job changes beyond preserving Slice 1 behavior.
- Assembly jobs.
- Frontend topic-authority cleanup.
- Mixed-render completion cleanup.

Measurable exit criteria:

- Segment enqueue creates a durable `processing_queue` row before or with `put_job(...)`.
- `/api/processing_queue` returns the segment row after reload-style hydration.
- Segment row remains segment/job scoped as intended and does not corrupt chapter-level queue state.

Suggested tests:

- Add/update a focused test in `tests/api/test_api_generation.py` for segment enqueue queue-row persistence.
- Add/update `tests/api/test_api_queue.py` for segment classification/hydration if existing tests do not cover it.

Verification:

```bash
./venv/bin/python -m pytest tests/api/test_api_generation.py tests/api/test_api_queue.py
git diff --check
```

### Slice 3: Queue Row Creation For Assembly Jobs

Goal: assembly jobs have durable queue visibility.

Scope:

- Add or reuse the canonical enqueue/upsert helper for project assembly jobs.
- Preserve assembly-specific metadata and output behavior.

Do not include:

- Bake or segment changes beyond preserving previous slices.
- M4B output behavior changes.
- MP3/finalizing cleanup.

Measurable exit criteria:

- Assembly enqueue creates a durable `processing_queue` row before or with `put_job(...)`.
- `/api/processing_queue` returns the assembly row after reload-style hydration.
- Assembly status transitions still update the same row.

Suggested tests:

- Add/update a focused test in `tests/api/test_api_projects.py` for assembly queue-row persistence.
- Add/update `tests/api/test_api_queue.py` if hydration needs direct coverage.

Verification:

```bash
./venv/bin/python -m pytest tests/api/test_api_projects.py tests/api/test_api_queue.py
git diff --check
```

### Slice 4: Voice-Test Event Builder Contract

Goal: all queue-visible `voice.test` events carry `ids.jobId` without post-build patching.

Scope:

- Update `build_voice_test_progress_event(...)` so job id is first-class when queue-visible.
- Update `ProgressService.publish(...)` to use the builder contract directly.
- Remove, narrow, or test `broadcast_test_progress(...)` so it cannot emit queue-visible voice-test progress without a job id.

Do not include:

- Queue row creation for bake/segment/assembly.
- Frontend queue-authority cleanup.
- Voice preview MP3/WAV policy changes.

Measurable exit criteria:

- Every voice build/test `voice.test` frame includes `ids.jobId`.
- `queue.items` remains the queue-row status topic for voice build/test.
- No helper can accidentally emit queue-visible `voice.test` without job id.

Suggested tests:

- `tests/api/test_websocket_broadcast.py`: voice-test event includes `ids.jobId`.
- `tests/orchestration/test_progress_service.py`: voice-test publish emits matching `queue.items` and `voice.test` job ids.

Verification:

```bash
./venv/bin/python -m pytest tests/api/test_websocket_broadcast.py tests/orchestration/test_progress_service.py
git diff --check
```

### Slice 5: Frontend Row Authority Guardrails

Goal: frontend live overlays remain useful, but non-`queue.items` topics cannot create or reclassify main queue rows.

Scope:

- Adjust `useQueueSync.ts`, `useJobs.ts`, live jobs store, or hydration only as needed to enforce row-authority boundaries.
- Preserve overlay updates for progress, ETA, active segment id, voice-test progress, and debug provenance.

Do not include:

- Backend queue row creation.
- Voice-test event builder cleanup.
- MP3/finalizing cleanup.

Measurable exit criteria:

- `chapters.progress`, `segments.progress`, and `voice.test` can update overlays for known jobs.
- Those topics cannot create a new main queue row by themselves.
- Those topics cannot change row identity, classification, lifecycle status, or terminal retention.
- `queue.items` remains able to create/update the main queue row.

Suggested tests:

- `frontend/tests/unit/hooks/useQueueSync.test.tsx`: non-queue topic cannot create main row.
- `frontend/tests/unit/hooks/useJobs.test.tsx`: overlay updates still work for existing jobs.
- Existing queue retention tests still pass.

Verification:

```bash
cd frontend && ./node_modules/.bin/vitest run tests/unit/hooks/useQueueSync.test.tsx tests/unit/hooks/useJobs.test.tsx tests/unit/components/queue/GlobalQueue.test.tsx
git diff --check
```

### Slice 6: Mixed Render Queue Completion Authority

Goal: mixed render completion uses the same queue-state path as other jobs.

Scope:

- Remove or wrap `_persist_mixed_chapter_output(...)` direct queue writes.
- Preserve output file, audio duration, chapter status, queue terminal status, and segment status updates.
- Pass explicit render-group/chunk count to performance metrics if touched in this slice.

Do not include:

- Frontend queue-authority cleanup.
- Voxtral cleanup.
- General WAV/MP3 policy cleanup beyond what is directly required for mixed completion.

Measurable exit criteria:

- Mixed completion updates the durable queue row through the canonical path exactly once.
- Mixed completion still records output metadata and audio duration.
- Mixed performance sample records actual render-group count rather than fallback `0`, if performance persistence is part of the patch.

Suggested tests:

- Mixed handler test for canonical queue completion.
- `tests/db/test_performance_metrics_storage.py` if render-group count persistence is changed.

Verification:

```bash
./venv/bin/python -m pytest tests/db/test_performance_metrics_storage.py
git diff --check
```

### Slice 7: WAV-First Cleanup For Voxtral And Normal Synthesis

Goal: ordinary synthesis does not use `finalizing` or MP3 conversion as part of the normal queue lifecycle.

Scope:

- Remove or isolate `make_mp3` and `finalizing` from Voxtral and normal chapter synthesis paths.
- Preserve WAV output and terminal queue completion.

Do not include:

- Voice preview artifact policy unless Slice 0 decided previews are in scope.
- Frontend queue-authority cleanup.
- Mixed completion authority unless still open from Slice 6.

Measurable exit criteria:

- Voxtral chapter render selects WAV output and does not call MP3 conversion in ordinary synthesis.
- Ordinary synthesis does not emit/persist `finalizing`.
- Existing queue completion and output metadata remain intact.

Suggested tests:

- Voxtral plugin test or backend orchestration test proving WAV output and no MP3 conversion.
- Existing finalizing regression tests updated to the new contract.

Verification:

```bash
./venv/bin/python -m pytest tests/orchestration/test_progress_logic.py tests/orchestration/test_submit.py
git diff --check
```

### Slice 8: Voice Preview Artifact Policy

Goal: voice build/test preview artifacts follow the product decision from Slice 0.

Scope:

- If WAV-only: update sample build/test, legacy voice worker, XTTS adapter sample paths, voice preview URL helpers, and tests to use `sample.wav`.
- If MP3 exception: document the exception clearly and add tests proving it is preview-only and not a normal synthesis lifecycle phase.
- If on-demand MP3: route preview MP3 creation through the same explicit export/on-demand mechanism.

Do not include:

- Chapter synthesis WAV-first cleanup beyond preserving previous slices.
- Queue row creation.
- Frontend row-authority cleanup.

Measurable exit criteria:

- Voice build/test output artifact matches the chosen policy.
- Tests no longer accidentally enforce stale `sample.mp3` behavior unless approved as a preview exception.
- Voice preview URLs resolve the selected artifact correctly.

Suggested tests:

- `tests/orchestration/test_voices_orchestration_integration.py`
- Voice router/helper tests if present.
- XTTS plugin sample adapter tests if the sample path changes.

Verification:

```bash
./venv/bin/python -m pytest tests/orchestration/test_voices_orchestration_integration.py
git diff --check
```

### Slice 9: Contract Documentation And Final Cross-Checks

Goal: make the finished contract discoverable for plugin authors and prevent regressions.

Scope:

- Update `docs/event_stream_processing_schema.md` and `docs/plugin-guide.md` with final behavior.
- Add any missing contract-level tests that do not belong to the earlier slices.
- Run the focused backend/frontend suites touched by the prior slices.

Do not include:

- New behavior not already decided and implemented.
- Broad wiki rewrites.

Measurable exit criteria:

- Plugin authors can find queue lifecycle order, topic ownership, voice-test exception, overlay boundaries, and WAV-first policy in permanent docs.
- All slice-specific tests pass together.
- `git diff --check` passes.

Verification:

```bash
./venv/bin/python -m pytest tests/api/test_api_generation.py tests/api/test_api_projects.py tests/api/test_api_queue.py
./venv/bin/python -m pytest tests/api/test_websocket_broadcast.py tests/orchestration/test_progress_service.py
./venv/bin/python -m pytest tests/db/test_performance_metrics_storage.py
cd frontend && ./node_modules/.bin/vitest run tests/unit/hooks/useQueueSync.test.tsx tests/unit/hooks/useJobs.test.tsx tests/unit/components/queue/GlobalQueue.test.tsx
git diff --check
```

## Worker Handoff Brief

### Objective

Bring queue-visible voice/chapter/segment/assembly work into one clear contract:

- Durable queue visibility is created through a persistent `processing_queue` row.
- Live main queue row state is transported through `queue.items`.
- Scoped progress topics can update live overlays, but cannot create or reclassify main queue rows.
- Voice-test telemetry uses `voice.test` and always carries `ids.jobId`, while its queue row still comes from `queue.items`.
- Ordinary synthesis is WAV-first. MP3 should not be a normal synthesis lifecycle phase unless voice previews are explicitly accepted as a narrow exception.

### Non-Goals

- Do not rewrite the whole websocket/event system.
- Do not remove live overlay behavior that keeps Chapter Editor, segment progress, or voice-test debug surfaces responsive.
- Do not hardcode fixes to a specific engine name when a task type, scope, capability, or shared helper can express the behavior.
- Do not preserve legacy v1 or beta compatibility unless the product owner explicitly approves a specific exception.

### Slice 0 Detail: Product Decisions To Confirm

These must be resolved before the worker implements behavior:

1. Are bake jobs, segment jobs, and assembly jobs always supposed to appear in persistent queue history after a hard reload?
   - Recommended answer: yes, every queue-visible job should get a `processing_queue` row at enqueue time.
2. Are voice preview files allowed to remain `sample.mp3`?
   - Recommended answer: no, use WAV previews unless the product owner explicitly approves preview MP3 as an exception.
3. Can non-`queue.items` topics update queue-adjacent live progress fields?
   - Recommended answer: yes for overlays and progress display; no for row identity, classification, lifecycle status, and terminal retention.

### Slices 1-3 Detail: Durable Queue Row Creation

Problem:

- Standard chapter jobs create durable queue rows through `db_add_to_queue(...)`.
- Bake, segment, and assembly jobs create `Job` objects and live broadcasts, but do not consistently create `processing_queue` rows.
- `update_job(...)` can make those jobs appear live, but `update_queue_item(...)` only updates existing rows. Missing rows remain missing after reload.

Desired behavior:

- Every queue-visible job type creates or upserts a durable `processing_queue` row before or at the same time it calls `put_job(...)`.
- The enqueue helper should be shared and named clearly enough that future plugin/task routes naturally use it.

Likely files:

- `app/db/queue.py`
- `app/api/routers/generation.py`
- `app/api/routers/projects_assembly.py`
- `tests/api/test_api_generation.py`
- `tests/api/test_api_projects.py`
- `tests/api/test_api_queue.py`

Suggested first failing tests:

- Enqueue a bake job, call `/api/processing_queue`, and assert the bake job row exists with expected id/status/title/engine.
- Enqueue a segment job, call `/api/processing_queue`, and assert the segment job row exists and retains segment/job classification.
- Enqueue an assembly job, call `/api/processing_queue`, and assert the assembly row exists after reload-style hydration.
- Create a `Job` without a queue row, call `update_job(..., force_broadcast=True)`, and assert this does not silently satisfy durable queue history unless the new canonical helper explicitly creates the row.

### Slice 5 Detail: Queue Topic Authority vs Live Overlays

Problem:

- `useQueueSync.ts` currently applies updates from `jobs.lifecycle`, `queue.items`, `chapters.lifecycle`, and `chapters.progress`.
- `useJobs.ts` applies `chapters.progress`, `segments.progress`, and `voice.test` into live job state.
- This is useful for live UI, but dangerous if those topics create/reclassify/remove main queue rows.

Desired behavior:

- `queue.items` is the only topic that can create main queue rows or mutate row identity, classification, lifecycle status, and terminal retention.
- `chapters.progress`, `segments.progress`, and `voice.test` may still update live overlay fields such as progress, ETA, active segment id, messages, debug provenance, and voice-test progress.
- `chapters.lifecycle` may trigger a refresh, but should not directly author row fields.

Likely files:

- `frontend/src/config/liveEventConsumers.ts`
- `frontend/src/hooks/useQueueSync.ts`
- `frontend/src/hooks/useJobs.ts`
- `frontend/src/store/live-jobs.ts`
- `frontend/src/api/hydration`
- `frontend/tests/unit/hooks/useQueueSync.test.tsx`
- `frontend/tests/unit/hooks/useJobs.test.tsx`

Suggested first failing tests:

- A `chapters.progress` frame can update progress/ETA overlay for an existing queue row but cannot create a new main queue row by itself.
- A `voice.test` frame with `jobId` can update voice-test progress but cannot create the queue row if no `queue.items` row exists.
- A `queue.items` frame with classification `job` remains job-scoped even if progress overlay fields later include null segment fields.
- `chapters.lifecycle` triggers refresh/invalidation behavior only and does not mutate row identity/classification locally.

### Slice 4 Detail: Voice-Test Contract Cleanup

Problem:

- The canonical `ProgressService.publish(...)` path patches `ids.jobId` onto `voice.test` events after calling `build_voice_test_progress_event(...)`.
- The older `broadcast_test_progress(...)` helper builds the same topic without job id.
- Split helper behavior is likely to regress the browser event stream or queue visibility.

Desired behavior:

- `build_voice_test_progress_event(...)` accepts `job_id` or otherwise makes `ids.jobId` a first-class required field when a queue-visible voice test/build job is involved.
- `ProgressService.publish(...)` and any websocket helper use the same canonical builder contract.
- If `broadcast_test_progress(...)` is obsolete, remove it or narrow it so it cannot be used for queue-visible jobs without `jobId`.

Likely files:

- `app/api/contracts/events.py`
- `app/api/ws.py`
- `app/orchestration/progress/service.py`
- `tests/api/test_websocket_broadcast.py`
- `tests/orchestration/test_progress_service.py`

Suggested first failing tests:

- Every emitted `voice.test` frame for a voice build/test job includes `ids.jobId`.
- `broadcast_test_progress(...)`, if kept, either requires a job id or is tested as diagnostics-only and not queue-visible.
- A voice test emits both `queue.items` for row status and `voice.test` for telemetry, with matching job id.

### Slices 7-8 Detail: WAV-First / MP3 Lifecycle Cleanup

Problem:

- `make_mp3` and `finalizing` branches remain in multiple active paths.
- Sample build/test still converts generated WAV previews into `sample.mp3`.
- Voxtral and mixed rendering still contain MP3/finalizing logic even though normal synthesis is intended to be WAV-first.

Desired behavior:

- Ordinary synthesis completes as WAV.
- MP3 conversion is an explicit export/on-demand action, not a queue lifecycle status.
- `finalizing` is not emitted by ordinary synthesis paths.
- Voice preview output follows the product decision from Priority 0.

Likely files:

- `app/orchestration/tasks/sample_build.py`
- `app/orchestration/tasks/sample_test.py`
- `app/jobs/worker_voice.py`
- `plugins/tts_xtts/plugin/studio/adapter.py`
- `plugins/tts_xtts/plugin/studio/handler.py`
- `plugins/tts_voxtral/plugin/studio/handler.py`
- `plugins/synthesis_mixed/handler.py`
- `app/db/models.py`
- `app/orchestration/tasks/synthesis.py`
- `app/orchestration/tasks/bake.py`
- `tests/orchestration/test_voices_orchestration_integration.py`
- plugin-local tests under `plugins/tts_xtts/tests/` and `plugins/tts_voxtral/tests/` if present

Suggested first failing tests:

- A normal chapter render never emits or persists `finalizing`.
- A Voxtral chapter render chooses WAV output and does not run MP3 conversion.
- A mixed render completes through WAV output and does not call `wav_to_mp3(...)` in the normal path.
- Voice sample tests assert the chosen preview artifact policy exactly: WAV if WAV-first, or documented MP3 exception if approved.

### Slice 6 Detail: Mixed Render Queue Completion

Problem:

- Mixed render uses both `update_job(...)` and `_persist_mixed_chapter_output(...) -> update_queue_item(...)`.
- This creates two queue-state authorities and can drift from the canonical state-sync path.
- Mixed performance samples use `source_segment_count=0`, leaving segment/render-group count to fallback resolution.

Desired behavior:

- Mixed completion goes through the same canonical queue-state path as other jobs.
- Direct queue row writes from plugin code are removed or wrapped in the same shared adapter.
- Mixed performance samples receive the actual render group/chunk count explicitly.

Likely files:

- `plugins/synthesis_mixed/handler.py`
- `app/db/state_jobs.py`
- `app/db/queue.py`
- `tests/db/test_performance_metrics_storage.py`
- mixed plugin tests if present

Suggested first failing tests:

- Mixed chapter completion updates the durable queue row through the canonical path exactly once.
- Removing `_persist_mixed_chapter_output(...)` direct queue write does not lose output file, audio duration, chapter status, or queue terminal status.
- Mixed performance sample records the true render-group count instead of `0` fallback.

### Acceptance Criteria

The next implementation slice should not be considered done unless these conditions are true:

- Hard reload after enqueue shows durable queue rows for standard chapter, bake, segment, voice build/test, and assembly jobs.
- Live websocket stream shows `queue.items` for row lifecycle and the appropriate scoped progress topic for runtime progress.
- `voice.test` frames for queue-visible work always include `ids.jobId`.
- Non-`queue.items` topics cannot create a main queue row or change its identity/classification/terminal retention.
- Ordinary synthesis does not emit `finalizing`.
- Ordinary synthesis does not do MP3 conversion unless the action is explicitly an MP3 export or an approved voice-preview exception.
- Mixed render completion does not maintain a second direct queue-row authority.
- Tests document the contract clearly enough that a future plugin author can infer the lifecycle from test names and assertions.

### Suggested Verification Commands

Run only the relevant subset for the files changed, but this is the expected verification pool:

```bash
./venv/bin/python -m pytest tests/api/test_api_generation.py tests/api/test_api_projects.py tests/api/test_api_queue.py
./venv/bin/python -m pytest tests/api/test_websocket_broadcast.py tests/orchestration/test_progress_service.py
./venv/bin/python -m pytest tests/db/test_performance_metrics_storage.py
cd frontend && ./node_modules/.bin/vitest run tests/unit/hooks/useQueueSync.test.tsx tests/unit/hooks/useJobs.test.tsx
git diff --check
```
