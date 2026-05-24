# Studio Event Broadcaster Contract

This document is the backend-facing source of truth for Studio Event
Broadcaster behavior. It defines the canonical websocket envelope, core topic
ownership, producer helper APIs, plugin-private namespace, and frontend
consumer registry expectations.

The executable backend contract lives in `app/api/contracts/events.py`. The
frontend executable contract lives in `frontend/src/api/contracts/liveEvents.ts`.

## 1. Rationale

Studio is a single-host FastAPI application with in-process orchestration. The
event broadcaster remains in-process and emits over the existing browser
websocket. No external broker is part of the Studio 2.0 contract.

This keeps the desktop/server install self-contained, avoids extra services,
and lets the browser consume one websocket stream that is routed by topic.

## 2. Canonical Envelope

Every backend websocket frame should use the canonical `studio_event` envelope:

```typescript
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

`topic` is the routing key. `eventKind` is the action on that topic. `source`
identifies the backend producer path for debugging and audit.

## 3. Core Topics

Core topics are strict app-owned channels. They should be produced through
helpers in `app/api/contracts/events.py`, not by hand-built dictionaries.

| Topic | Producer helper | Event kinds | Owner |
| --- | --- | --- | --- |
| `queue.items` | `build_queue_item_status_event`, `build_queue_item_invalidated_event`, `build_queue_paused_event` | `queue_item_status`, `queue_item_invalidated`, `queue_paused` | Main queue state and refresh. |
| `chapters.lifecycle` | `build_chapter_lifecycle_event` | `chapter_lifecycle` | Chapter invalidation and reload. |
| `chapters.progress` | `build_chapter_progress_event` | `chapter_progress` | Chapter render progress and terminal chapter status. |
| `segments.lifecycle` | `build_segment_lifecycle_event` | `segment_lifecycle` | Segment invalidation and reload. |
| `segments.progress` | `build_segment_progress_event` | `segment_progress`, `segment_started`, `segment_saved` | Active segment progress and completion. |
| `tts.logs` | `build_tts_log_event` | `tts_log` | Diagnostic TTS/plugin output. |
| `voice.test` | `build_voice_test_progress_event` | `voice_test_progress` | Voice test/preview progress. |
| `projects.lifecycle` | `build_project_lifecycle_event` | `project_invalidated` | Project invalidation and reload. |
| `system.events` | `build_system_event` | variable | Administrative/debug events. |

## 4. Queue Payload Contract

`queue.items` has multiple event kinds with different payload meanings.

### `queue_item_status`

This is the authoritative queue row state.

```typescript
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

### `queue_item_invalidated`

This is a refresh signal only. It must not contain fake row state.

```typescript
interface QueueItemInvalidatedPayload {
  reasonCode: string;
  changedFields: string[];
}
```

### `queue_paused`

```typescript
interface QueuePausedPayload {
  reasonCode: 'queue_paused';
  changedFields: ['paused'];
  paused: boolean;
}
```

## 5. Progress Payload Contracts

### `chapters.progress`

```typescript
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

### `segments.progress`

```typescript
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

When one backend update contains both segment and chapter progress, emit
`segments.progress` first and `chapters.progress` second.

## 6. Lifecycle Payload Contract

Lifecycle topics are reload/invalidation signals. Use `reasonCode`, not
human-readable `reason`, for machine-readable semantics.

```typescript
interface LifecyclePayload {
  reasonCode: string;
  changedFields: string[];
}
```

This applies to:

- `chapters.lifecycle`
- `segments.lifecycle`
- `projects.lifecycle`

## 7. TTS Logs

```typescript
interface TtsLogsPayload {
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

TTS logs are diagnostic output. They are not queue state, chapter state, or
segment state.

## 8. Plugin-Private Topics

Plugins may emit flexible plugin-private events under:

```text
plugins.<plugin_id>.<area>
```

Plugin-private events must not mutate core app stores such as Queue, Projects,
Chapters, or Segments. They are for plugin-owned panels, plugin diagnostics, or
audit output.

## 9. Frontend Consumer Registry

The frontend consumer registry lives in
`frontend/src/config/liveEventConsumers.ts`.

| Consumer surface | Listened topics | Target surfaces |
| --- | --- | --- |
| `main-queue` | `queue.items` | Queue row state and queue refresh. |
| `chapter-state` | `chapters.lifecycle`, `chapters.progress`, `segments.progress` | Chapter Editor and chapter render state. |
| `segment-state` | `segments.lifecycle`, `segments.progress` | Segment state and segment progress surfaces. |
| `project-state` | `projects.lifecycle` | Project/dashboard refresh. |
| `tts-diagnostics` | `tts.logs` | Engine diagnostics console. |
| `voice-test-state` | `voice.test` | Voice test UI. |
| `plugin:<plugin_id>:<area>` | exact `plugins.<plugin_id>.<area>` | Plugin-owned UI. |
| `plugin-private` | any `plugins.*` topic | Plugin-private audit filtering. |

The browser receives the stream and matches on `event.topic`; the server does
not maintain per-topic browser subscriptions.

## 10. `/event-stream` Display

`/event-stream` is an audit page. It currently displays:

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

`Reason` is `reasonCode` / `reason_code`. `Category` is derived client-side
from topic and is not shown as a transport field. Subscriber observations
(`Handled by`) are browser-local audit metadata and are not shown as transport
fields.

## 11. Lifecycle Audit Matrix

| Lifecycle step | Producer | Durable state write | Topic | eventKind | Required IDs | Payload fields |
| --- | --- | --- | --- | --- | --- | --- |
| Browser enqueue | Queue API / orchestrator submit | Queue/job row is created as queued | `queue.items` | `queue_item_status` or `queue_item_invalidated` plus snapshot refresh | `projectId`, `chapterId`, `jobId` when known | `status: "queued"` for status events; `reasonCode`, `changedFields` for invalidation. |
| Processor pickup | Orchestrator / ProgressService | Job status becomes preparing | `queue.items`, `chapters.progress` | `queue_item_status`, `chapter_progress` | `projectId`, `chapterId`, `jobId` | `status: "preparing"`, `progress`, `message`, `reasonCode`. |
| Plugin receipt/ack | Orchestrator / ProgressService | Job status becomes running | `queue.items`, `chapters.progress` | `queue_item_status`, `chapter_progress` | `projectId`, `chapterId`, `jobId` | `status: "running"`, `progress`, `etaSeconds`. |
| Segment render start | ProgressService / plugin progress parser | Active segment metadata is updated | `segments.progress` | `segment_progress` or `segment_started` | `projectId`, `chapterId`, `jobId`, `segmentId` | `status`, `progress`, `segmentIndex`, `segmentCount`, `reasonCode`. |
| Segment render progress | ProgressService / plugin progress parser | Active segment progress is updated | `segments.progress` | `segment_progress` | `projectId`, `chapterId`, `jobId`, `segmentId` | `progress`, `activeSegmentProgress`, `etaSeconds`. |
| Chapter render progress | ProgressService | Job progress/grouped progress is updated | `chapters.progress` | `chapter_progress` | `projectId`, `chapterId`, `jobId` | `progress`, `groupedProgress`, `renderGroupCount`, `completedRenderGroups`, `etaSeconds`. |
| Segment completion | Orchestrator helper / segment persistence | Segment audio status/path is saved | `segments.progress`, `segments.lifecycle` | `segment_progress`, `segment_lifecycle` | `projectId`, `chapterId`, `jobId`, `segmentId` | `status: "done"`, `progress: 1.0`, or lifecycle `reasonCode`, `changedFields`. |
| Chapter/job completion | ProgressService / orchestrator helper | Job status becomes terminal | `chapters.progress`, `queue.items` | `chapter_progress`, `queue_item_status` | `projectId`, `chapterId`, `jobId` | `status: "done"`, `progress: 1.0`, `message`, `reasonCode`. |
| Queue invalidation | Queue API / state jobs | None directly | `queue.items` | `queue_item_invalidated` | `projectId` / `jobId` when known | `reasonCode`, `changedFields`. |
| Queue pause status | Websocket pause broadcaster | Queue pause state | `queue.items` | `queue_paused` | None | `paused`, `reasonCode: "queue_paused"`, `changedFields: ["paused"]`. |
| TTS logs | Watchdog/orchestrator log listener | In-memory log buffer only | `tts.logs` | `tts_log` | `projectId`, `chapterId`, `jobId` when known | `line`, `level`, `sequence`, `pluginId`, `pluginShortName`. |

## 12. Migration Status

The legacy-to-canonical frontend normalizer and topic router are retired. New
work should not add support for legacy websocket frames. If a non-canonical
frame is observed, treat it as a bug in the producer path or a `system.events`
diagnostic, not as a contract to preserve.

## 13. Verification

Docs-only updates should at minimum pass:

```bash
git diff --check
```

Runtime event changes should additionally run the focused backend websocket
tests and affected frontend live-event tests.
