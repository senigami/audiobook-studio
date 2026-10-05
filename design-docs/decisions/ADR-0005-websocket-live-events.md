# ADR-0005: WebSocket Live Events Over HTTP Polling

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

Job progress updates fire multiple times per second during synthesis (one event per
synthesized chunk). The Studio UI shows a live progress bar, ETA, and job status that
must feel responsive.

HTTP polling options:
- Short interval (1–2s): acceptable latency but creates a continuous stream of requests
  even when nothing changes; scales poorly with many concurrent jobs.
- Long interval (10–30s): low overhead but progress bars lag noticeably.

Long-polling adds server complexity without meaningful benefits over WebSocket for this
use case.

## Decision

A single WebSocket connection per client (`/ws`) carries all live events. On connect,
the client receives a full snapshot to hydrate state. Subsequent updates are delta
events using the `studio_event` envelope (typed in
`frontend/src/api/contracts/liveEvents.ts`).

Disconnected fallback: `useQueueSync` polls `GET /api/queue` every 60 seconds but only
while the WebSocket is disconnected. The live stream is the primary source of truth;
the poll is a safety net, not a parallel feed.

`useJobs` does not maintain its own periodic snapshot poll — it subscribes to the live
event stream exclusively (legacy 60s `jobs_snapshot` polling removed).

## Consequences

### Positive
- Sub-second progress updates with no polling overhead while connected.
- Single connection carries all event types (progress, status, settings changes, alerts).
- Lost events surface as bugs immediately rather than being masked by a periodic resync.

### Negative / Trade-offs
- Reconnect logic is non-trivial: generation guards prevent stale events from a
  previous connection being applied, and pending events must be buffered during
  reconnection.
- WebSocket connection state must be tracked explicitly; the UI must handle connected,
  reconnecting, and disconnected modes.

### Neutral
- The 60s disconnected poll is intentionally conservative — it is a fallback, not a
  design goal. If the WebSocket is reliable, this poll never fires.
- Frontend live-event tests must build frames via `liveEvents.ts` types and publish
  through `publishStudioSocketMessage` — no hand-rolled frame literals (testing
  standards R3).
