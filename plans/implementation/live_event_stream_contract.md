# Live Event Stream Contract

This document is the source of truth for Studio's frontend live event stream.
It defines the purpose, event shapes, topic taxonomy, producer/consumer
responsibilities, UI display rules, and test expectations for websocket-driven
updates.

The executable TypeScript contract lives in
`frontend/src/api/contracts/liveEvents.ts`. Keep that file and this document in
sync. The document explains policy and ownership; the TypeScript module defines
the importable producer/consumer shapes and normalizer helpers.

The live event stream is not a second database. It is a transport and routing
layer for short-lived updates that are merged into API-hydrated state or shown
in diagnostics surfaces.

## Purpose

Studio receives one websocket stream from the backend. The frontend must turn
that stream into predictable, auditable domain events so queue progress, segment
progress, diagnostics logs, and live output all update without opening duplicate
socket connections or relying on manual refresh buttons.

The stream contract exists to separate four concerns:

1. **Transport**: a raw websocket frame received by the browser.
2. **Domain event**: the backend message interpreted as job progress, logs,
   queue lifecycle, chapter invalidation, or another domain signal.
3. **Consumer routing**: which frontend subsystem reacts to the event.
4. **Display/audit**: how the event is shown in Live Output or copied as JSON.

The backend websocket payload names remain the wire contract. The frontend
normalizes them for routing and display, but does not rename backend payloads on
the wire.

## Transport Envelope

Every raw websocket message is wrapped exactly once by the frontend transport.
The envelope is infrastructure metadata. Consumers should use it for ordering,
dedupe, and audit display, not as domain state.

```ts
export interface StudioSocketEnvelope<T = unknown> {
  frameId: number;
  receivedAt: string;
  data: T;
  raw?: string;
}
```

Field meanings:

- `frameId`: frontend-local monotonic sequence number assigned on receive.
- `receivedAt`: frontend receive timestamp in ISO-8601 format.
- `data`: parsed backend websocket payload.
- `raw`: original serialized websocket payload when available.

Frame IDs reset on page reload. They are only valid within the current browser
session.

## Normalized Domain Event

Raw backend messages are normalized into a frontend event shape before being
used by topic-aware consumers or debug/audit displays.

```ts
export type LiveEventTopic =
  | 'tts.logs'
  | 'jobs.progress'
  | 'queue.lifecycle'
  | 'chapter.invalidate'
  | 'segments.invalidate'
  | 'voice.test'
  | 'system.unknown';

export type LiveEventCategory =
  | 'log'
  | 'queue'
  | 'job'
  | 'chapter'
  | 'segment'
  | 'voice'
  | 'system';

export type LiveEventSubscriber =
  | 'queue-sync'
  | 'jobs-state'
  | 'tts-diagnostics'
  | 'live-output';

export type LiveEventKind =
  | 'tts_log'
  | 'job_status'
  | 'job_progress'
  | 'job_terminal'
  | 'segment_started'
  | 'segment_progress'
  | 'segment_saved'
  | 'queue_invalidated'
  | 'queue_pause_changed'
  | 'chapter_invalidated'
  | 'segments_invalidated'
  | 'voice_test_progress'
  | 'unknown';

export interface LiveEventBase<TPayload = unknown> {
  frameId: number;
  receivedAt: string;
  rawType: string;
  topic: LiveEventTopic;
  category: LiveEventCategory;
  eventKind: LiveEventKind;
  source?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  chapterId?: string | null;
  segmentId?: string | null;
  payload: TPayload;
  raw?: string;
}
```

The normalized event must preserve the raw backend `type` as `rawType`. The
frontend topic and category are derived fields for routing and display.

Implementations should represent `LiveEvent` as a discriminated union of
concrete event shapes, not as a permanent `payload: unknown` bag. Unknown events
are the only place where the payload should remain unknown.

```ts
export interface TtsLogLiveEvent extends LiveEventBase<{
  line: string;
  marker?: string | null;
  sequence?: number | null;
  backendReceivedAt?: number | null;
}> {
  topic: 'tts.logs';
  category: 'log';
  eventKind: 'tts_log';
}

export interface JobProgressLiveEvent extends LiveEventBase<{
  status?: string | null;
  progress?: number | null;
  eta_seconds?: number | null;
  estimated_end_at?: number | null;
  eta_basis?: string | null;
  eta_confidence?: string | null;
  started_at?: number | null;
  updated_at?: number | null;
  reason_code?: string | null;
  message?: string | null;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
  active_render_group_index?: number | null;
  total_render_weight?: number | null;
  completed_render_weight?: number | null;
  active_render_group_weight?: number | null;
  grouped_progress?: number | null;
}> {
  topic: 'jobs.progress';
  category: 'job' | 'segment';
  eventKind:
    | 'job_status'
    | 'job_progress'
    | 'job_terminal'
    | 'segment_started'
    | 'segment_progress'
    | 'segment_saved';
}

export interface QueueLifecycleLiveEvent extends LiveEventBase<{
  reason?: string | null;
  changed_fields?: string[] | null;
  paused?: boolean | null;
}> {
  topic: 'queue.lifecycle';
  category: 'queue';
  eventKind: 'queue_invalidated' | 'queue_pause_changed';
}

export interface ChapterInvalidationLiveEvent extends LiveEventBase<{
  reason?: string | null;
}> {
  topic: 'chapter.invalidate';
  category: 'chapter';
  eventKind: 'chapter_invalidated';
}

export interface SegmentsInvalidationLiveEvent extends LiveEventBase<{
  reason?: string | null;
}> {
  topic: 'segments.invalidate';
  category: 'segment';
  eventKind: 'segments_invalidated';
}

export interface VoiceTestLiveEvent extends LiveEventBase<Record<string, unknown>> {
  topic: 'voice.test';
  category: 'voice';
  eventKind: 'voice_test_progress';
}

export interface UnknownLiveEvent extends LiveEventBase<unknown> {
  topic: 'system.unknown';
  category: 'system';
  eventKind: 'unknown';
}

export type LiveEvent =
  | TtsLogLiveEvent
  | JobProgressLiveEvent
  | QueueLifecycleLiveEvent
  | ChapterInvalidationLiveEvent
  | SegmentsInvalidationLiveEvent
  | VoiceTestLiveEvent
  | UnknownLiveEvent;
```

### Audit Record

Live Output should not depend on `useJobs` or `useQueueSync` side effects to
discover that a frame exists. The bus/normalizer appends one audit record for
every normalized frame before any consumer handles it. Consumers then add
observations to the existing record.

```ts
export interface LiveEventSubscriberObservation {
  subscriber: LiveEventSubscriber;
  observedAt: string;
  action: 'handled' | 'ignored' | 'recorded' | 'refreshed' | 'errored';
  detail?: string;
}

export interface LiveEventRecord<T extends LiveEvent = LiveEvent> {
  event: T;
  subscribers: LiveEventSubscriberObservation[];
}
```

Rules:

- one websocket frame creates one `LiveEventRecord`
- `frameId` is the join key between the event and subscriber observations
- `live-output` reads records from the bus/audit store; it is not a producer of
  application state
- unknown or currently unhandled event types still appear in Live Output as
  `system.unknown`
- subscriber names must be unique per record and sorted or insertion-stable, but
  never duplicated

## Topic Mapping

The normalizer owns the mapping from backend wire payloads to frontend topics.

| Backend `type` | Topic | Category | Event kind | Primary meaning |
| --- | --- | --- | --- | --- |
| `tts_log_line` | `tts.logs` | `log` | `tts_log` | Append a human-readable TTS engine log line. |
| `studio_job_event` with active status and numeric `active_segment_progress` | `jobs.progress` | `segment` | `segment_progress` | Update current segment progress and grouped chapter progress. |
| `studio_job_event` with `active_segment_id` but no numeric `active_segment_progress` | `jobs.progress` | `segment` | `segment_started` | Switch active segment/remount segment bar without treating it as a progress tick. |
| `studio_job_event` with `reason_code: "segment_saved"` or matching saved marker | `jobs.progress` | `segment` | `segment_saved` | Mark the active segment output as saved/complete. |
| `studio_job_event` with terminal status | `jobs.progress` | `job` | `job_terminal` | Apply terminal job state. |
| `studio_job_event` without `active_segment_id` | `jobs.progress` | `job` | `job_status` or `job_progress` | Update job status, overall progress, ETA, or render-group context. |
| `job_updated` | `jobs.progress` | `job` | `job_status`, `job_progress`, or `job_terminal` | Apply a fuller job update payload, often terminal state. The normalizer flattens nested `updates` payloads before mapping. |
| `queue_updated` | `queue.lifecycle` | `queue` | `queue_invalidated` | Queue snapshot invalidation or lifecycle change. |
| `pause_updated` | `queue.lifecycle` | `queue` | `queue_pause_changed` | Queue pause/resume lifecycle state. |
| `chapter_updated` | `chapter.invalidate` | `chapter` | `chapter_invalidated` | Chapter-level invalidation; refresh visible chapter data. |
| `segments_updated` | `segments.invalidate` | `segment` | `segments_invalidated` | Segment list/status invalidation for a chapter. |
| `segment_progress` | `jobs.progress` | `segment` | `segment_progress` | Legacy/direct segment progress event. The normalizer preserves `segment_id` as active segment identity. |
| `test_progress` | `voice.test` | `voice` | `voice_test_progress` | Voice test/build progress update. |
| unknown | `system.unknown` | `system` | `unknown` | Preserve and display for audit; do not mutate app state. |

`queue_updated` is not a progress event. It is an invalidation signal that may
trigger canonical queue hydration. Progress comes from `studio_job_event`,
`job_updated`, or legacy `segment_progress`.

## Event Examples

### TTS log line

Backend payload:

```json
{
  "type": "tts_log_line",
  "job_id": "job-8793039f-d2a8-46da-9f0a-c21a9e6ada83",
  "project_id": "5a7b020b-dd06-43cd-8b29-880865646d63",
  "chapter_id": "684ce461-9e2c-41af-877e-17ee74a0358e",
  "line": "Loading cached latents...",
  "marker": "raw",
  "sequence": 2,
  "received_at": 1779396535.090896,
  "source": "app.orchestration.scheduler.orchestrator_helpers.log_listener"
}
```

Normalized event:

```json
{
  "frameId": 10,
  "receivedAt": "2026-05-21T20:48:55.092Z",
  "rawType": "tts_log_line",
  "topic": "tts.logs",
  "category": "log",
  "eventKind": "tts_log",
  "source": "app.orchestration.scheduler.orchestrator_helpers.log_listener",
  "jobId": "job-8793039f-d2a8-46da-9f0a-c21a9e6ada83",
  "projectId": "5a7b020b-dd06-43cd-8b29-880865646d63",
  "chapterId": "684ce461-9e2c-41af-877e-17ee74a0358e",
  "payload": {
    "line": "Loading cached latents...",
    "marker": "raw",
    "sequence": 2
  }
}
```

### Job progress with active segment

Backend payload:

```json
{
  "type": "studio_job_event",
  "job_id": "job-8793039f-d2a8-46da-9f0a-c21a9e6ada83",
  "scope": "job",
  "status": "running",
  "progress": 0.67,
  "active_segment_id": "1777057465137731000_5",
  "active_segment_progress": 0.5,
  "render_group_count": 2,
  "completed_render_groups": 1,
  "active_render_group_index": 1,
  "total_render_weight": 949,
  "completed_render_weight": 466,
  "active_render_group_weight": 483,
  "grouped_progress": 0.67,
  "reason_code": "synthesis_progress",
  "message": "Synthesizing...",
  "source": "app.orchestration.scheduler.orchestrator_helpers._publish"
}
```

Normalized event:

```json
{
  "frameId": 42,
  "receivedAt": "2026-05-21T20:49:20.000Z",
  "rawType": "studio_job_event",
  "topic": "jobs.progress",
  "category": "segment",
  "eventKind": "segment_progress",
  "source": "app.orchestration.scheduler.orchestrator_helpers._publish",
  "jobId": "job-8793039f-d2a8-46da-9f0a-c21a9e6ada83",
  "segmentId": "1777057465137731000_5",
  "payload": {
    "status": "running",
    "progress": 0.67,
    "active_segment_progress": 0.5,
    "grouped_progress": 0.67,
    "completed_render_groups": 1,
    "render_group_count": 2,
    "reason_code": "synthesis_progress",
    "message": "Synthesizing..."
  }
}
```

### Queue lifecycle invalidation

Backend payload:

```json
{
  "type": "queue_updated",
  "source": "app.db.state_jobs.update_job",
  "reason": "job_reset_to_active",
  "job_id": "job-8793039f-d2a8-46da-9f0a-c21a9e6ada83",
  "project_id": "5a7b020b-dd06-43cd-8b29-880865646d63",
  "changed_fields": ["status"]
}
```

Normalized event:

```json
{
  "frameId": 8,
  "receivedAt": "2026-05-21T20:48:33.933Z",
  "rawType": "queue_updated",
  "topic": "queue.lifecycle",
  "category": "queue",
  "eventKind": "queue_invalidated",
  "source": "app.db.state_jobs.update_job",
  "jobId": "job-8793039f-d2a8-46da-9f0a-c21a9e6ada83",
  "projectId": "5a7b020b-dd06-43cd-8b29-880865646d63",
  "payload": {
    "reason": "job_reset_to_active",
    "changed_fields": ["status"]
  }
}
```

## Producers

There is one websocket producer in the browser:

- `useStudioSocketTransport`: owns the actual socket receive callback and
  publishes framed events to the frontend bus.

No feature hook or component should open a second websocket connection for live
job, queue, segment, or log updates.

The transport publisher is responsible for:

- parsing raw websocket payloads
- assigning `frameId`
- stamping `receivedAt`
- preserving `raw`
- publishing the raw envelope and normalized event

It is not responsible for:

- mutating queue state
- mutating job state
- fetching snapshots
- deciding UI visibility
- smoothing progress

## Consumers

Consumers subscribe to topics. A consumer may record that it observed a frame,
but the frame identity remains the same.

### `tts-diagnostics`

Subscribes to:

- `tts.logs`

Responsibilities:

- append `payload.line` to the TTS Engine Diagnostics panel live
- preserve backend `sequence` ordering when available
- keep manual "Refresh Logs" as a resync action, not as the only update path

Non-responsibilities:

- queue state
- job progress state
- segment progress state

### `queue-sync`

Subscribes to:

- `jobs.progress`
- `queue.lifecycle`

Responsibilities:

- apply `jobs.progress` to live queue overlays immediately
- use `queue.lifecycle` to refresh canonical queue snapshots
- preserve overlay progress during refresh unless reconnect cleanup is active
- keep receipt-order progress visible while canonical snapshots catch up

Non-responsibilities:

- TTS diagnostics display
- chapter editor segment list refresh

### `jobs-state`

Subscribes to:

- `jobs.progress`
- `chapter.invalidate`
- `segments.invalidate`
- `voice.test`

Responsibilities:

- maintain the live `jobs` map used by components
- propagate `active_segment_id` and `active_segment_progress`
- trigger visible chapter/segment refresh callbacks
- keep terminal status precedence and monotonic progress protections

Non-responsibilities:

- canonical queue hydration
- diagnostics panel text rendering
- TTS engine log storage or display

### `live-output`

Observes:

- all topics

Responsibilities:

- render the bus-level auditable event timeline
- preserve receipt order
- show subscriber observations attached to the same `frameId`
- expose copied JSON that includes frame, topic, category, raw type, subscriber,
  and payload details

Non-responsibilities:

- mutating application state
- fetching snapshots
- smoothing progress

`live-output` should not subscribe as a normal domain consumer that can miss
frames based on hook mount order. It should read the bus/audit store that is
fed by the normalizer for every received frame.

## Display Rules

Live Output should display domain/event concepts, not debug implementation
names.

Preferred columns:

- `Time`
- `Topic`
- `Category`
- `Event`
- `Subscribers`
- `Job`
- `Chapter`
- `Segment`
- `Job %`
- `Segment %`
- `Group`
- `Reason`
- `Source`
- `Message`

Deprecated display labels:

- `Kind`: replace with `Category`.
- `Consumer`: replace with `Subscribers`.
- `Audience`: replace with `Topic` or hide from the table.
- `Listener`: keep only as internal subscriber metadata.

Rows must be ordered by `frameId` or `receivedAt` insertion order. Distinct
frames must never collapse together because they share `type`, `job_id`, or a
close timestamp.

## Progress Absorption Rules

### Main Queue

The queue's progress bar consumes `jobs.progress`.

Fields used from `studio_job_event` or `job_updated`:

- `status`
- `progress`
- `eta_seconds`
- `started_at`
- `updated_at`
- `reason_code`
- `message`
- `active_segment_id`
- `active_segment_progress`
- `render_group_count`
- `completed_render_groups`
- `active_render_group_index`
- `total_render_weight`
- `completed_render_weight`
- `active_render_group_weight`
- `grouped_progress`

Rules:

- `progress` is whole-job progress.
- `grouped_progress` is the grouped chapter render progress when present.
- `active_segment_progress` is current segment progress only.
- `segment_started` events set segment identity and render-group context, but do
  not advance the numeric segment bar unless a numeric
  `active_segment_progress` is present.
- `queue_updated` triggers refresh; it does not update the progress bar directly.
- `job_updated` may carry terminal state and must be merged with the same field
  rules as `studio_job_event`.
- queue refreshes must not clear newer overlay progress unless a reconnect,
  terminal, cancellation, or explicit snapshot reconciliation says the overlay
  is stale.

### Segment Bar

The segment bar consumes `jobs.progress` where:

- `active_segment_id` is present
- `active_segment_progress` is numeric
- status is active: `preparing`, `running`, `processing`, or `finalizing`

The segment progress key is:

```ts
`${jobId}:${activeSegmentId || 'none'}`
```

Rules:

- when `active_segment_id` changes, the segment bar may remount/reset for the
  next segment
- when terminal status arrives with `active_segment_id: null`, the terminal job
  display owns the 100% state
- `active_segment_progress` must not override a `done` terminal bar

### TTS Diagnostics

Diagnostics consumes `tts.logs`.

Fields used:

- `line`
- `marker`
- `sequence`
- `job_id`
- `project_id`
- `chapter_id`
- `source`
- frontend `frameId`
- frontend `receivedAt`

Rules:

- initial diagnostics load comes from `/api/engines/all/logs`
- live updates append from `tts.logs`
- manual refresh reconciles the buffer with backend logs
- duplicate live lines should be de-duped by `(job_id, sequence)` when both are
  present, otherwise by `frameId`
- refresh reconciliation should rebuild from backend text, then preserve newer
  live records that are not present in the backend response by `(job_id,
  sequence)`; append-only live records should not disappear just because the log
  endpoint is slightly behind the websocket stream

## Ordering And Dedupe

Ordering authority:

1. `frameId` for frontend receipt order.
2. backend `sequence` for ordered TTS log lines within one job.
3. backend `updated_at` for stale progress rejection.

Dedupe authority:

- Same `frameId`: same raw websocket message observed by multiple subscribers.
- Different `frameId`: separate event, even if `type`, `job_id`, or timestamp
  match.
- TTS log diagnostics may additionally de-dupe by `(job_id, sequence)` to avoid
  repeated display after manual refresh.
- Subscriber observations are de-duped by `(frameId, subscriber)`.
- The audit store must append unknown frames before any consumer filtering, so
  filtering cannot hide stream-level evidence.

## Testing Requirements

Normalizer tests must cover:

- `tts_log_line` -> `tts.logs` / `log`
- `studio_job_event` with `active_segment_id` and numeric
  `active_segment_progress` -> `jobs.progress` / `segment` /
  `segment_progress`
- `studio_job_event` with `active_segment_id` and no numeric
  `active_segment_progress` -> `jobs.progress` / `segment` /
  `segment_started`
- terminal `studio_job_event` or `job_updated` -> `jobs.progress` / `job` /
  `job_terminal`
- `studio_job_event` without `active_segment_id` -> `jobs.progress` / `job`
- `queue_updated` -> `queue.lifecycle` / `queue`
- `chapter_updated` -> `chapter.invalidate` / `chapter`
- unknown type -> `system.unknown` / `system`

Consumer tests must cover:

- diagnostics appends live `tts.logs` without pressing refresh
- queue applies `jobs.progress` immediately
- queue refreshes canonical state on `queue.lifecycle`
- jobs state carries `active_segment_id` and `active_segment_progress`
- live output preserves distinct frames in receipt order
- live output merges subscriber names only for the same `frameId`
- live output shows unknown/unhandled frames even when no domain consumer handles
  them
- a `segment_started` frame changes active segment identity without advancing
  segment progress

Suggested frontend verification:

```bash
cd frontend && /opt/homebrew/bin/npx vitest run tests/unit/store/studioSocketBus.test.ts tests/unit/utils/runtimeDebug.test.ts tests/unit/hooks/useJobs.test.tsx tests/unit/hooks/useQueueSync.test.tsx tests/unit/pages/Settings/SettingsRoute.test.tsx tests/unit/pages/ChapterEditor/components/LiveOutputTab.test.tsx --reporter=dot
cd frontend && /opt/homebrew/bin/npm run lint
git diff --check
```

## Manual QA

After implementation, start a rebuild and verify:

1. TTS Engine Diagnostics appends new log lines without pressing "Refresh Logs".
2. Live Output shows `Topic`, `Category`, `Event`, and `Subscribers`.
3. Queue progress advances from `jobs.progress` frames before terminal
   `job_updated`.
4. Segment bar appears and advances when `active_segment_id` and
   `active_segment_progress` arrive.
5. Copied JSON includes `frameId`, `rawType`, `topic`, `category`, and payload
   details for every displayed row.

## Maintenance Rules

- Update this document before changing topic names, subscriber ownership, or
  normalized event shape.
- Do not add new websocket consumers that open their own socket connection.
- Do not use Live Output table labels as application state concepts.
- Do not let REST refreshes hide missing live-event handling.
- Backend wire event names are allowed to evolve only with matching frontend
  normalizer tests.
