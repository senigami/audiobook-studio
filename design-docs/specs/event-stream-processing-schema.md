# Event Stream Processing Schema

This document is the developer-facing schema for how live event stream data is
processed into queue, job, chapter, segment, voice-test, and diagnostics
surfaces.

It is intentionally narrower than the full broadcaster docs:

- `app/api/contracts/events.py` defines the executable backend envelope schema
- `frontend/src/api/contracts/liveEvents.ts` defines the executable frontend
  schema
- this document defines the processing order and ownership rules that plugin
  and orchestration code should honor

## 1. Ownership Model

### `queue.items`

`queue.items` is the authoritative queue-row stream.

Use it for:

- row creation
- row state updates
- queue refresh invalidation
- queue pause state

Do not use `queue.items` as a diagnostic stream.

### `jobs.lifecycle`

`jobs.lifecycle` is the shared job-state stream.

Use it for:

- queued
- preparing
- running
- finalizing
- done / failed / cancelled

It carries job-level lifecycle state only. It does not own diagnostics or
chapter/segment progress payloads.

### `chapters.progress`

`chapters.progress` owns chapter-level render progress.

Use it for chapter-scoped progress only.

### `segments.progress`

`segments.progress` owns segment-level progress.

Use it for segment-scoped progress only.

### `voice.test`

`voice.test` owns voice-test / preview progress.

Use it for voice-test-specific progress only.

It must not be used as a chapter-progress substitute.

### `tts.logs`

`tts.logs` owns diagnostics only.

It must never be used to infer queue state.

## 2. Canonical Queue Lifecycle

Any queue-visible job should communicate lifecycle in this order:

1. create or refresh the queue row as `queued` on `queue.items`
2. emit `JOB_PREPARING` on `jobs.lifecycle`
3. emit `START_SYNTHESIS` on `jobs.lifecycle`
4. emit scoped runtime progress on the correct topic
5. emit a terminal state on `jobs.lifecycle`
6. emit a terminal `queue_item_status` on `queue.items`
7. emit `queue_item_invalidated` only when a snapshot refresh is needed

The queue contract is about visibility and final state.
The scoped progress topics are about the active render surface.

## 3. Voice-Test Contract

Voice test and preview jobs are a special case of the same queue lifecycle.

They must:

- emit queue-state updates so the queue row appears while rendering
- emit `voice.test` for live voice-test progress
- emit `jobs.lifecycle` for queued / preparing / running / terminal changes
- avoid `chapters.progress` entirely
- include `jobId` on voice-test frames so frontend stores can correlate the
  telemetry with the queue row

The frontend may refresh the queue from the first queued/preparing `voice.test`
frame when the queue row lacks chapter context.

That is a display/hydration rule, not a replacement for queue-state updates.

## 4. Required IDs

| Topic | Required IDs | Notes |
| --- | --- | --- |
| `queue.items` | `jobId` when known; `projectId` / `chapterId` when known | Queue rows should be identifiable enough for hydration and refresh. |
| `jobs.lifecycle` | `jobId` | May include `projectId`, `chapterId`, and `parentJobId` when known. |
| `chapters.progress` | `jobId`, `chapterId` | Chapter-scoped only. |
| `segments.progress` | `jobId`, `chapterId`, `segmentId` | Segment-scoped only. |
| `voice.test` | `jobId` | `projectId` / `chapterId` may be null for preview/sample jobs. |
| `tts.logs` | `jobId` when known | Diagnostics may be emitted before full context exists. |

## 5. Forbidden Mixes

- Do not emit `chapters.progress` for voice-test jobs.
- Do not use `voice.test` to own queue-row state.
- Do not use `tts.logs` to drive queue overlays.
- Do not emit fake queue state in `queue_item_invalidated`.
- Do not hide `JOB_PREPARING` or `START_SYNTHESIS` behind engine-specific
  branches in app code.

## 6. Developer Checklist

When adding a new queue-visible render path:

1. create the queue row
2. emit `JOB_PREPARING`
3. emit `START_SYNTHESIS`
4. choose the correct scoped progress topic
5. emit terminal state
6. verify the frontend queue and job stores update without a hard reload

For voice test, that means `voice.test` plus queue visibility, not chapter
progress reuse.
