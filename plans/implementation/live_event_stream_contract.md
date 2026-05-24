# Live Event Stream Contract

This document is the frontend-facing source of truth for Studio's live event
stream. It describes how browser code receives canonical websocket events,
routes them to UI consumers, and displays them on `/event-stream`.

The executable TypeScript contract lives in
`frontend/src/api/contracts/liveEvents.ts`. Keep that file and this document in
sync. The backend event builders live in `app/api/contracts/events.py`.

## Scope

The live event stream is not a database and not a replacement for REST/API
snapshots. It is a short-lived transport and routing layer for state changes,
progress updates, and diagnostics.

The current transport contract is the canonical `studio_event` envelope. Legacy
frontend compatibility paths such as `studio_job_event`, `job_updated`,
`queue_updated`, `chapter_updated`, and `segments_updated` are not current
frontend contracts.

## Browser Transport

The browser wraps every received websocket frame in a local transport envelope:

```ts
export interface StudioSocketEnvelope<T = unknown> {
  frameId: number;
  receivedAt: string;
  data: T;
  raw?: string;
}
```

`frameId` and `receivedAt` are browser-local audit metadata. They are not sent
by the backend and reset on reload.

## Backend Envelope

Every backend websocket payload should be a canonical `studio_event`:

```ts
export interface StudioEventEnvelope<TPayload = unknown> {
  type: 'studio_event';
  version: 1;
  topic: string;
  eventKind: string;
  source: string;
  emittedAt: number;
  pluginId: string | null;
  ids: {
    projectId: string | null;
    chapterId: string | null;
    jobId: string | null;
    segmentId: string | null;
  };
  payload: TPayload;
}
```

Core routing is done by `topic`. `eventKind` describes the specific action on
that topic. `source` is retained for producer provenance and debugging.

## Current Topics

| Topic | Event kinds | Purpose |
| --- | --- | --- |
| `queue.items` | `queue_item_status`, `queue_item_invalidated`, `queue_paused` | Queue row state, queue refresh signals, and pause state. |
| `chapters.lifecycle` | `chapter_lifecycle` | Durable chapter invalidation and reload signals. |
| `chapters.progress` | `chapter_progress` | Chapter render progress, grouped progress, ETA, and terminal chapter status. |
| `segments.lifecycle` | `segment_lifecycle` | Segment list/status invalidation and reload signals. |
| `segments.progress` | `segment_progress`, `segment_started`, `segment_saved` | Active segment progress, segment start, and segment completion. |
| `tts.logs` | `tts_log` | TTS/plugin diagnostic log lines. |
| `voice.test` | `voice_test_progress` | Voice test and preview progress. |
| `projects.lifecycle` | `project_invalidated` | Project-level invalidation and reload signals. |
| `system.events` | variable | Administrative and debug events that do not mutate domain state. |
| `plugins.<plugin_id>.<area>` | plugin-defined | Plugin-private diagnostics or plugin-owned UI data. |

## Payload Contracts

### `queue.items`

`queue_item_status` is authoritative queue row state.

```ts
interface QueueItemStatusPayload {
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  progress: number;
  etaSeconds: number | null;
  message: string | null;
  reasonCode: string | null;
  classification: 'job' | 'chapter' | 'segment';
  changedFields: string[] | null;
  paused?: boolean | null;
}
```

`queue_item_invalidated` is refresh-only. It must not carry fake status,
progress, ETA, or classification.

```ts
interface QueueItemInvalidatedPayload {
  reasonCode: string;
  changedFields: string[];
}
```

`queue_paused` carries queue pause state only.

```ts
interface QueuePausedPayload {
  reasonCode: 'queue_paused';
  changedFields: ['paused'];
  paused: boolean;
}
```

### `chapters.progress`

```ts
interface ChapterProgressPayload {
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';
  progress: number;
  groupedProgress: number | null;
  etaSeconds: number | null;
  message: string | null;
  reasonCode: string | null;
  renderGroupCount: number | null;
  completedRenderGroups: number | null;
}
```

Chapter progress does not create or own main queue rows. It may update chapter
state surfaces and chapter render progress displays.

### `segments.progress`

```ts
interface SegmentProgressPayload {
  status: 'preparing' | 'running' | 'processing' | 'finalizing' | 'done' | 'failed';
  progress: number;
  segmentIndex: number | null;
  segmentCount: number | null;
  message: string | null;
  reasonCode: string | null;
  activeSegmentId?: string | null;
  activeSegmentProgress?: number | null;
  etaSeconds?: number | null;
}
```

### Lifecycle Topics

Lifecycle events are reload/invalidation signals. They use machine-readable
`reasonCode`, not human-readable `reason`, as the contract field.

```ts
interface LifecyclePayload {
  reasonCode: string;
  changedFields: string[];
}
```

### `tts.logs`

```ts
interface TtsLogPayload {
  line: string;
  level?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  sequence?: number | null;
  pluginId?: string | null;
  pluginShortName?: string | null;
  jobId?: string | null;
  chapterId?: string | null;
  source?: string | null;
  backendReceivedAt?: number | null;
  marker?: string | null;
}
```

TTS logs are diagnostic output. They must not drive queue, chapter, or segment
state.

## Consumer Registry

The current frontend consumer map lives in
`frontend/src/config/liveEventConsumers.ts`.

| Consumer | Listened topics | Purpose |
| --- | --- | --- |
| `main-queue` | `queue.items` | Queue rows and queue refresh. |
| `chapter-state` | `chapters.lifecycle`, `chapters.progress`, `segments.progress` | Chapter editor state and chapter/segment render state. |
| `segment-state` | `segments.lifecycle`, `segments.progress` | Segment state surfaces. |
| `tts-diagnostics` | `tts.logs` | Settings diagnostics log console. |
| `voice-test-state` | `voice.test` | Voice test and preview UI. |
| `project-state` | `projects.lifecycle` | Project dashboard/settings refresh. |
| `plugin:<plugin_id>:<area>` | exact `plugins.<plugin_id>.<area>` | Plugin-owned UI surfaces. |
| `plugin-private` | any `plugins.*` topic | Plugin-private audit filtering. |

The socket transport does not perform server-side topic subscriptions. Frontend
consumers receive the stream and match on `event.topic`.

## Audit Store

The frontend creates one `LiveEventRecord` per normalized frame before consumer
logic handles it.

```ts
export interface LiveEventRecord<T extends LiveEvent = LiveEvent> {
  event: T;
  subscribers: LiveEventSubscriberObservation[];
}
```

Subscriber observations are browser-local audit metadata. They are not sent by
the backend and should not be treated as transport fields.

## `/event-stream` Display

`/event-stream` is an audit/debug surface. It currently displays:

- `Time`
- `Topic`
- `Event`
- `Job`
- `Chapter`
- `Segment`
- `Job %`
- `Segment %`
- `Group`
- `Reason`
- `Source`
- `Message`

`Reason` displays `reasonCode` / `reason_code`. Human-readable `payload.reason`
is not part of the target contract.

`Category` is derived from `topic` by the frontend and is not shown as a
transport fact. `Handled by` / subscriber observations are browser-local audit
metadata and are not shown as transport facts.

The copied JSON may include frontend-local audit fields such as `frameId`,
`receivedAt`, derived `category`, and subscriber observations because it copies
the audit record, not the raw backend payload.

## Queue State Rules

The main queue must be driven by `queue.items` only.

- `queue_item_status` creates or updates authoritative queue row state.
- `queue_item_invalidated` triggers snapshot refresh and must not directly
  update row progress/status.
- `chapters.progress` and `segments.progress` must not create main queue rows.
- Terminal queue state should be represented by one authoritative
  `queue_item_status` event, not by a later fake queued invalidation.

## Chapter And Segment Progress Rules

- `chapters.progress` owns chapter-level render progress and grouped chapter
  render metadata.
- `segments.progress` owns active segment progress and segment completion.
- When one backend update contains both active segment progress and chapter
  progress, segment progress should be emitted first, then chapter progress.
- Segment narration messages should not overwrite stable main queue row text.

## Diagnostics Rules

- `tts.logs` lines are diagnostic output only.
- Diagnostics display should include a timestamp and plugin label when
  available.
- Logs can be noisy; log traffic should not be used to drive queue state.

## Maintenance Rules

- Update this document when topic names, event kinds, consumer ownership, or
  `/event-stream` display rules change.
- Update `frontend/src/api/contracts/liveEvents.ts` when the executable
  frontend event shape changes.
- Update `app/api/contracts/events.py` when backend envelope builders change.
- Do not add new websocket consumers that open another socket connection.
- Do not reintroduce legacy frontend normalizers for retired payloads.
