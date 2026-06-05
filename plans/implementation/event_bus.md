# Shared Job Lifecycle Contract With Scoped ETA Payloads

## Summary
Introduce `jobs.lifecycle` as the shared job-state topic for queue and progress surfaces, and retire `queue.items` as a first-class live topic. Plugins stay restricted to the canonical lifecycle commands already defined. The backend normalizes once, then routes by topic scope so queue/chapter/segment consumers get only what they need. `tts.logs` remains the full-fidelity stream.

## Topic and Payload Matrix

| Topic | Allowed commands | Expected payload shape | Notes |
|---|---|---|---|
| `jobs.lifecycle` | `JOB_QUEUED`, `JOB_PREPARING`, `START_SYNTHESIS`, `JOB_RESET_TO_ACTIVE`, `JOB_FINALIZING`, `JOB_DONE`, `JOB_FAILED`, `QUEUE_INVALIDATED` | `{ jobId, projectId, chapterId?, parentJobId?, status, reasonCode, message?, startedAt?, updatedAt, hasSegmentSupport, source }` | Shared state only. No ETA fields. No chapter/segment-specific progress. |
| `chapters.progress` | Chapter-scoped progress events only, plus chapter-specific lifecycle transitions | `{ jobId, projectId, chapterId, status, progress, groupedProgress?, etaSeconds?, estimatedEndAt?, etaBasis?, etaConfidence?, confidence?, message?, reasonCode?, renderGroupCount?, completedRenderGroups?, activeRenderGroupIndex?, totalRenderWeight?, completedRenderWeight?, activeRenderGroupWeight?, startedAt?, updatedAt, hasSegmentSupport }` | Chapter ETA only. Segment ETA must not leak here. |
| `segments.progress` | `START_SEGMENT`, `SEGMENT_PROGRESS`, `SEGMENT_SAVED` | `{ jobId, projectId, chapterId, segmentId, status, progress, segmentIndex?, segmentCount?, etaSeconds?, estimatedEndAt?, etaBasis?, etaConfidence?, confidence?, message?, reasonCode?, activeSegmentId?, activeSegmentProgress?, startedAt?, updatedAt, hasSegmentSupport }` | Segment ETA only. Chapter ETA must not leak here. |
| `tts.logs` | raw markers and all plugin chatter | `{ line, level?, sequence?, pluginId?, jobId?, chapterId?, source?, backendReceivedAt?, marker? }` | Full-fidelity diagnostics. |

## Execution Slices

### Slice 1: Contract and event schema
- Add the new shared topic to backend and frontend contract definitions.
- Define the exact payload shape for each topic, including which fields are allowed and which are forbidden.
- Keep the canonical command normalization layer as the single place that interprets legacy reason strings.
- Make the topic routing rules explicit so the implementer does not have to infer scope from status.

### Slice 2: Backend publication routing
- Restrict plugin-facing and orchestrator-facing emissions to the canonical command set.
- Route `JOB_*` and `START_SYNTHESIS` events to `jobs.lifecycle`.
- Route chapter-only ETA/progress to `chapters.progress`.
- Route segment-only ETA/progress to `segments.progress`.
- Remove `queue.items` as a primary broadcast target; keep only transitional compatibility if needed during rollout.

### Slice 3: Consumer migration
- Point queue and progress surfaces at `jobs.lifecycle` plus the appropriate scoped progress topic.
- Keep `tts.logs` untouched so diagnostics still receive everything.
- Update Live Output consumer labels and documentation so the topic ownership is obvious.
- Make consumers ignore irrelevant topics rather than relying on duplicated broadcasts.

### Slice 4: ETA and timer contract
- Define the job timer trigger as `START_SYNTHESIS`.
- Define the segment timer trigger as `START_SEGMENT`.
- Define terminal stop conditions as `JOB_DONE`, `JOB_FAILED`, and `QUEUE_INVALIDATED`.
- Keep `JOB_PREPARING` as preflight and not a timer start.
- Keep chapter ETA and segment ETA separate on purpose.
- Preserve `eta_confidence` as the human-readable trust state and use numeric `confidence` only as a weighting input.

### Slice 5: ETA storage and weighted history
- Keep live job anchors on the job row: `started_at`, `updated_at`, `status`, `reason_code`, `eta_seconds`, `estimated_end_at`, `eta_basis`, `eta_confidence`.
- Store sample history with `chars_per_minute`, `confidence`, `chars`, `duration_seconds`, `scope`, `plugin_id`, `tts_model`, `job_id`, `chapter_id`, `segment_id`.
- Collapse completed samples into a weighted per-plugin baseline using confidence-weighted character volume.
- Use the plugin/model baseline for future ETA prediction, with engine-keyed fallback only as migration support.

### Slice 6: Tests and verification
- Add contract tests for allowed commands per topic and forbidden-field checks.
- Add regression tests proving chapter ETA never leaks into segment payloads and segment ETA never leaks into chapter payloads.
- Add timer tests proving the start/stop commands are the only authoritative boundaries.
- Add storage tests for weighted baseline aggregation.
- Add compatibility tests for cloud/whole-body plugins that emit lifecycle-only events and never segment commands.

## Assumptions
- `jobs.lifecycle` is the final shared topic name.
- `queue.items` is retired, not kept permanently.
- Chapter ETA and segment ETA remain separate by design.
- Numeric `confidence` is a weight, not a replacement for `eta_confidence`.
- A short compatibility window is acceptable only if needed to migrate consumers safely.
