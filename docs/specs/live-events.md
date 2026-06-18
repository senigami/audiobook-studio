# Live Event Stream Contract

```
spec_version: 1.5.2
status: active
sources:
  - app/api/ws.py
  - app/api/contracts/events.py
  - app/db/state_jobs.py
  - app/orchestration/progress/service.py
  - frontend/src/api/contracts/liveEvents.ts
  - frontend/src/store/studioSocketBus.ts
  - frontend/src/hooks/useQueueSync.ts
  - frontend/src/hooks/useJobs.ts
```

## Changelog

| Version | Date       | Change                      |
|---------|------------|-----------------------------|
| 1.5.2   | 2026-06-18 | **Single-source progress contract at the event-builder layer.** Retired the dual-path allowance (orchestrated + handler-direct as independent emit paths). Both producers (`ProgressService.publish` via Path A, and `broadcast_job_updated` via Path B) now call `ProgressService.enrich(job_id, payload)` **before** building events, then thread the enriched `confidence`/`eta_seconds`/`eta_basis`/`estimated_end_at`/`grouped_progress` into every `build_*_event(...)` call — making the **event builders in `app/api/contracts/events.py`** the single contract authority. The Python `compute_progress_confidence` echo in `events.py` is deleted; §4A progress-bearing frames (jobs.lifecycle / chapters.progress / queue.items) carry backend-authoritative numeric `confidence` and builders fail-loud on `confidence=None`. The client (`liveEvents.ts`) retains a `computeProgressConfidence` fallback **only** for Option-B direct broadcasts (`segments.progress` / `voice.test`) that legitimately carry no §4A confidence — those frames are never enriched. Snapshot/hydration (`jobs_snapshot` + running queue rows) call `enrich(sample=False)` (read-only, does not mutate the ETA ring or monotonic floor) — PI6. See new ADR-0012. |
| 1.5.2-c | 2026-06-18 | Clarification: the Python `compute_progress_confidence` echo is deleted from `events.py`; the identically-named client function in `liveEvents.ts` is **retained** as a fallback for non-§4A direct broadcasts (`segments.progress` / `voice.test`). The v1.5.2 claim of "echo deleted" referred to the backend only. |
| 1.5.1   | 2026-06-16 | `segments.progress` topic: eventKind is only `segment_progress`; segment start/saved are signalled via `reasonCode` (`SEGMENT_PENDING`/`SEGMENT_SAVED`), not as distinct eventKinds. |
| 1.5.0   | 2026-06-11 | `SEGMENT_PENDING` reason code: `[START_SEGMENT]` marker now emits `SEGMENT_PENDING` (announce, no segment ETA) rather than `START_SEGMENT`. Canonical `START_SEGMENT` with ETA is emitted only at engine confirmation (`[START_SYNTHESIS]` or first `[PROGRESS]`). Frontends must not begin pacing a progress bar on `SEGMENT_PENDING`. |
| 1.4.1   | 2026-06-11 | Engine-confirmed segment ETA clock: per-segment clock starts at engine confirmation (`[START_SYNTHESIS]` or first `[PROGRESS]`), not at `[START_SEGMENT]`; `[START_SEGMENT]` is an announcement that may precede model load. Duration falls back to announce time if no confirmation arrives before `[SEGMENT_SAVED]`. |
| 1.4.0   | 2026-06-11 | Terminal ordering guarantee: per-job terminal latch at the broadcast chokepoint (`broadcast_job_updated` / `broadcast_segment_progress` in `app/api/ws.py`). After a job's terminal frame (`done`/`failed`/`cancelled`), no non-terminal frame for that job is broadcast on any topic unless the job legally re-enters via `queued`/`preparing` (requeue). Mirrors `ProgressService._should_emit`; frontend H7 suppression (progress-presentation.md) is now defense-in-depth. |
| 1.3.1   | 2026-06-11 | `START_SEGMENT` allowed on `chapters.progress` (segment-capable engines surface the phase reason); mixed-render chapter progress is owned solely by the orchestrator marker pipeline — the mixed handler emits `[START_SEGMENT]`/`[SEGMENT_SAVED]`/`[PROGRESS]` markers and writes no chapter-level progress/ETA/group fields itself |
| 1.3.0   | 2026-06-11 | Producer obligation made real: every queue-visible job (chapter, segment, voice) emits `queue_item_status` on STATUS TRANSITIONS — from the progress service for orchestrated transitions and from `broadcast_job_updated` for handler-direct writes. Terminal `jobs.lifecycle` frames also trigger a client queue refetch (safety net). Previously chapter/segment jobs emitted no `queue_item_status` at all (the ws chapter branch returned early), so queue rows froze once Slice 5 removed status authority from other topics. |
| 1.2.0   | 2026-06-11 | Row-authority guardrails (audit Slice 5): `queue.items` is the sole row authority; all other topics are overlay-only on existing rows (see "Queue row authority") |
| 1.1.0   | 2026-06-10 | Removed `useJobs` periodic snapshot polling — snapshot hydration is event-driven only (owner ruling) |
| 1.0.0   | 2026-06-10 | Initial canonical spec      |

---

## Purpose

This spec defines the WebSocket live event stream between the Studio 2.0 backend
and the React frontend. It is the binding contract for:

- What envelope shape every frame has (and what fields are absent today).
- Which topics exist, what they carry, and which backend module owns them.
- The lifecycle ordering as the code actually produces it.
- Client bootstrap, buffering, and reconnect semantics.
- Progress rules (rounding, regression protection, advancement threshold).
- Invariants a conformance checker can assert.

---

## WebSocket endpoint

`GET /ws` — managed by `ConnectionManager` in `app/api/ws.py`.
All frames are JSON objects sent via `send_json`.
The server never sends binary frames on this endpoint.

---

## Wire envelope

Every frame emitted by the backend via `broadcast_studio_event` has this shape
(built by `build_studio_event` in `app/api/contracts/events.py`):

```jsonc
{
  "type": "studio_event",          // always this literal string
  "version": 1,                    // integer; currently always 1
  "topic": "<topic-string>",
  "eventKind": "<kind-string>",
  "source": "<module.function>",   // Python call-site, best-effort
  "emittedAt": 1718000000.000,     // unix float, server wall-clock
  "pluginId": null,                // string | null
  "ids": {
    "projectId": null,             // string | null
    "chapterId": null,             // string | null
    "jobId": null,                 // string | null
    "segmentId": null              // string | null
  },
  "payload": { /* topic-specific */ }
}
```

**Client-side envelope** (`StudioSocketEnvelope` in `liveEvents.ts`): the client
bus (`studioSocketBus.ts`) wraps each raw frame in a client-side envelope before
dispatching:

```ts
interface StudioSocketEnvelope<T = unknown> {
  frameId: number;      // monotonic integer assigned by publishStudioSocketMessage
  receivedAt: string;   // ISO-8601 timestamp assigned on receipt
  data: T;              // the raw wire JSON object
  raw?: string;         // the original JSON string if available
}
```

The `StudioSocketEnvelope` has **no backend-assigned `version` field** — `version`
lives inside `data` (the wire object). See Known Gaps.

---

## Topics

The `LiveEventTopic` union in `liveEvents.ts` defines the complete set recognized
today. The backend emits on all of them. Verified against `build_*` calls in
`app/api/contracts/events.py` and `broadcast_*` helpers in `app/api/ws.py`.

| Topic                     | eventKind(s)                                                            | Category   | Backend owner                          |
|---------------------------|-------------------------------------------------------------------------|------------|----------------------------------------|
| `jobs.lifecycle`          | `job_lifecycle`                                                         | `job`      | `app/api/ws.py broadcast_job_updated`  |
| `queue.items`             | `queue_item_status`, `queue_item_invalidated`, `queue_paused`           | `queue`    | `app/api/ws.py broadcast_job_updated`, `broadcast_queue_update`, `broadcast_pause_state` |
| `chapters.lifecycle`      | `chapter_lifecycle`                                                     | `chapter`  | `app/api/ws.py broadcast_chapter_updated` |
| `chapters.progress`       | `chapter_progress`                                                      | `chapter`  | `app/api/ws.py broadcast_job_updated` (chapter-classified jobs) |
| `segments.lifecycle`      | `segment_lifecycle`                                                     | `segment`  | `app/api/ws.py broadcast_segments_updated` |
| `segments.progress`       | `segment_progress`                                                      | `segment`  | `app/api/ws.py broadcast_job_updated`, `broadcast_segment_progress` |
| `voice.test`              | `voice_test_progress`                                                   | `voice`    | `app/api/ws.py broadcast_test_progress` |
| `tts.logs`                | `tts_log`                                                               | `log`      | `app/api/ws.py broadcast_tts_log_line` |
| `system.events`           | `system_event`                                                          | `system`   | `app/api/contracts/events.py build_system_event` |
| `projects.lifecycle`      | `project_invalidated`                                                   | `project`  | `app/api/ws.py broadcast_project_updated` |
| `plugins.<id>.<area>`     | plugin-defined                                                          | `plugin`   | plugin via `build_plugin_event`        |

The wiki page (`wiki/Queue-and-Jobs.md`) lists only 6 topics (omitting
`chapters.lifecycle`, `segments.lifecycle`, `system.events`, `projects.lifecycle`,
and the plugin namespace). The code defines 10 stable topics plus the open-ended
plugin namespace. This spec is authoritative.

---

## Per-topic payload shapes

Canonical TypeScript shapes live in
`frontend/src/api/contracts/liveEvents.ts`. Key payloads summarized:

### `jobs.lifecycle` / `job_lifecycle`

```ts
interface JobLifecyclePayload {
  status: 'queued'|'preparing'|'running'|'finalizing'|'done'|'failed'|'cancelled';
  reasonCode: string | null;
  message: string | null;
  startedAt: number | null;   // unix float
  updatedAt: number | null;
  hasSegmentSupport?: boolean;
  parentJobId?: string | null;
}
```

### `queue.items` / `queue_item_status`

```ts
interface QueueItemPayload {
  status?: 'queued'|'preparing'|'running'|'finalizing'|'done'|'failed'|'cancelled';
  progress?: number;
  etaSeconds?: number | null;
  message?: string | null;
  reasonCode?: string | null;
  classification?: 'job'|'chapter'|'segment';
  changedFields?: string[] | null;
  paused?: boolean | null;           // set on queue_paused only
  hasSegmentSupport?: boolean;
  startedAt?: number | null;
  completedAt?: number | null;
  customTitle?: string | null;
  engine?: string | null;
  producedAudioLength?: number | null;
  producedChars?: number | null;
  producedSegmentCount?: number | null;
}
```

### `chapters.progress` / `chapter_progress`

```ts
interface ChapterProgressPayload {
  status: string;
  progress: number;             // 0.0–1.0, rounded to 2 decimals
  groupedProgress: number | null;
  etaSeconds: number | null;
  message: string | null;
  reasonCode: string | null;
  renderGroupCount: number | null;
  completedRenderGroups: number | null;
}
```

### `segments.progress` / `segment_progress`

Segment start and saved transitions are signalled via the `reasonCode` field
(`SEGMENT_PENDING` for announce, `START_SEGMENT` for engine-confirmed start,
`SEGMENT_SAVED` for completion) — never as a distinct envelope `eventKind`.

```ts
interface SegmentProgressPayload {
  status: 'preparing'|'running'|'processing'|'finalizing'|'done'|'failed';
  progress: number;
  segmentIndex: number | null;
  segmentCount: number | null;
  message: string | null;
  reasonCode: string | null;
  etaSeconds?: number | null;
  activeSegmentId?: string | null;
  activeSegmentProgress?: number | null;
}
```

### `voice.test` / `voice_test_progress`

```ts
interface VoiceTestPayload {
  voiceName: string;
  status: 'preparing'|'running'|'done'|'failed';
  progress: number;
  startedAt: number;
  message: string | null;
}
```

### `tts.logs` / `tts_log`

```ts
interface TtsLogPayload {
  line: string;
  level?: 'DEBUG'|'INFO'|'WARNING'|'ERROR';
  sequence?: number | null;    // per-job monotonic counter (resets each session)
  pluginId?: string;
  jobId?: string | null;
  chapterId?: string | null;
  source?: string;
  backendReceivedAt?: number | null;
  marker?: string | null;      // legacy
}
```

---

## Topic ownership and broadcast routing

Defined by `update_job` in `app/db/state_jobs.py` (B13 docstring) and
`broadcast_job_updated` in `app/api/ws.py`:

### Broadcast-flag routing (keywords consumed from `**updates`)

| Flag                  | Effect                                                                      |
|-----------------------|-----------------------------------------------------------------------------|
| `force_broadcast`     | Bypasses terminal-state early-return, regression protection, and the "no changed fields" guard. Propagated downstream so `broadcast_job_updated` can detect it. |
| `skip_job_updated`    | Suppresses the `queue_item_status` WebSocket event for `classification=job` rows. SQLite sync and chapter/queue invalidation broadcasts are unaffected. |
| `skip_studio_job_event` | Suppresses all studio_event emissions inside `broadcast_job_updated`. Other broadcasts fire normally. |

### What fires and when (inside `broadcast_job_updated`)

1. **`jobs.lifecycle`** (`job_lifecycle`) — fires when status changes, when
   `previous_status` is None, or when `terminal_reset=True`.

2. **`segments.progress`** — fires a `SEGMENT_SAVED` event for `prev_active_segment_id`
   when the active segment ID changes (segment transition).

3. **`chapters.progress`** (for `classification=chapter`) — fires on every call
   when the job is classified as a chapter job. A `segments.progress` event for the
   current active segment precedes it if `new_active_segment_id` is set.

4. **`segments.progress`** (for `classification=segment`) — fires on every call
   when the job is classified as a segment job.

5. **`queue.items` / `queue_item_status`** (for `classification=job`) — fires when
   status changed, progress changed, ETA changed, `force_broadcast` is set, or
   specific display fields changed.

### What fires from `update_job` directly (outside `broadcast_job_updated`)

- **`chapters.lifecycle`** — fires on terminal status transitions
  (`done`/`failed`/`cancelled`), terminal resets, or `force_broadcast` with
  `status`/`started_at` in `changed_fields`.
- **`queue.items` / `queue_item_invalidated`** — fires only on terminal reset or
  `force_broadcast` when the resulting status is **not** terminal. Never fires for
  ordinary running/progress updates.

---

## Lifecycle ordering

The wiki page (`Queue-and-Jobs.md`) describes a 7-step ordering:

1. `queue.items` — create/refresh row as `queued`
2. `jobs.lifecycle` — `JOB_PREPARING`
3. `jobs.lifecycle` — `START_SYNTHESIS`
4. scoped progress topic (runtime)
5. `jobs.lifecycle` — terminal state
6. `queue.items` — terminal `queue_item_status`
7. `queue.items` — `queue_item_invalidated` (snapshot refresh)

**Code verification:** Steps 2, 3, 5, and 6 follow from `broadcast_job_updated`'s
emission logic, which fires `jobs.lifecycle` on status changes and `queue_item_status`
for job-classified rows. Steps 1 and 7 originate from explicit orchestrator calls
(`broadcast_queue_update`). The backend does not enforce an ordering lock across
these calls — each fires independently from its respective update path. The ordering
is **documented intent**, not enforced by a sequencing gate in the code.

---

## Terminal ordering guarantee (per-job terminal latch)

After a job's terminal frame (`done`/`failed`/`cancelled`) has been broadcast,
the backend guarantees that **no further non-terminal frame for that job is
broadcast on any topic** — unless the job legally re-enters via
`queued`/`preparing` (requeue / terminal reset).

Enforced by a per-job latch in `app/api/ws.py` (RLock-guarded module state),
consulted at the top of `broadcast_job_updated` before any event building and
read-only in `broadcast_segment_progress`. It mirrors the
`ProgressService._should_emit` rule (prev terminal + curr not in
`{done, failed, cancelled, queued, preparing}` → don't emit):

- The latch **sets** on the first terminal status seen for a job id (and when a
  stale snapshot shows the job already terminal).
- Terminal frames themselves always pass (the final frame is delivered; repeat
  terminal frames are still legal).
- `queued`/`preparing` **unlatch** and pass — requeue restores normal flow.
- Anything else while latched is **dropped** and logged at debug.
- The latch is cleared on `terminal_reset` broadcasts, on job removal
  (`delete_jobs`), and on `clear_all_jobs` (test/state reset), so entries do
  not leak across runs.

The frontend's H7 suppression rules (progress-presentation.md) remain as
defense-in-depth; they are no longer load-bearing for this ordering.

---

## Per-segment ETA clock semantics

The orchestrator's `log_listener` maintains a per-segment render clock used to
compute `active_segment_eta_seconds` and the `sum_segment_render_seconds` timing
sample stored on the job.

**Announce vs confirmation — two distinct published frames:**

- **`[START_SEGMENT]` marker → `SEGMENT_PENDING` frame** (announcement): emitted
  immediately when the `[START_SEGMENT]` log line is received. Payload carries
  `active_segment_id`, chapter-level grouped progress, and group fields — but
  `active_segment_eta_seconds` is `null` and `reason_code` is `"SEGMENT_PENDING"`.
  Frontends must **not** begin pacing a progress bar on this frame; the engine has
  not confirmed synthesis has started. In mixed renders this announcement arrives
  ~19 seconds before the engine is ready.

- **Engine confirmation → canonical `START_SEGMENT` frame** (clock start): emitted
  from one of two confirmation sites:
  1. `[START_SYNTHESIS]` — engine confirmed after model load (mixed-render pattern).
  2. First `[PROGRESS]` line for the active segment — fallback for engines that skip
     `[START_SYNTHESIS]`.
  The canonical `START_SEGMENT` frame carries the same fields as the announce frame
  plus a non-null `active_segment_eta_seconds`. In the PROGRESS-branch confirmation
  this frame is published **before** the `SEGMENT_PROGRESS` frame.

**No confirmation at announce:** A `[START_SEGMENT]` line never confirms the clock,
even when a `[START_SYNTHESIS]` was seen earlier — in mixed renders that earlier
signal belongs to a previous group's subprocess, and the next group still has to pay
its own model load. In plain single-process renders (engine-emitted START_SEGMENT,
model already warm), the segment shows SEGMENT_PENDING only until its first
`[PROGRESS]` line — typically under two seconds. Mixed renders emit one
`[START_SYNTHESIS]` per group subprocess; the job-level dedup of that marker must
not suppress the per-segment confirmation for groups after the first.

**Clock start rule (engine-confirmed):** The per-segment clock starts when the
engine confirms synthesis has begun, not when the segment is announced:

- `[START_SYNTHESIS]` — if an active segment has been announced (via `[START_SEGMENT]`)
  but not yet confirmed, this line sets the confirmed start time. In mixed renders the
  XTTS subprocess emits `[START_SYNTHESIS]` after the model finishes loading (~19s),
  so using this timestamp avoids counting model-load time as synthesis time.
- First `[PROGRESS]` line for the active segment — fallback confirmation for engines
  that do not emit `[START_SYNTHESIS]` at all.

**Announce time (`[START_SEGMENT]`):** `[START_SEGMENT]` records an announce
timestamp only. It is emitted by the mixed handler *before* spawning the engine
subprocess and may therefore precede model load by many seconds. It must not be
used as the clock start for ETA or duration accounting.

**Fallback (no confirmation before `[SEGMENT_SAVED]`):** If neither
`[START_SYNTHESIS]` nor any `[PROGRESS]` arrives before `[SEGMENT_SAVED]` (e.g.
fast remote-API engines such as Voxtral that complete before emitting synthesis
markers), `sum_segment_render_seconds` falls back to `now − announce_time` so that
timing samples are always recorded.

---

## Client contract

### Bus (`studioSocketBus.ts`)

`publishStudioSocketMessage(data, raw?)` is the single entry point. It:
1. Assigns a monotonic `frameId` and a wall-clock `receivedAt`.
2. Calls `recordLiveEventEnvelope(envelope)` — creates one audit record per frame
   before any subscriber filters it.
3. Dispatches to all `messageListeners`.

Tests MUST use `publishStudioSocketMessage` to inject frames; never call listeners
directly (testing standard R3).

### Bootstrap

On mount, `useQueueSync` calls `refreshQueue('bootstrap')`, which hits
`GET /api/queue` (REST) and stores the result as the canonical snapshot.

`useJobs` bootstraps by sending a `jobs_snapshot_request` WebSocket message, which
the server responds to with a `jobs_snapshot` frame (not a `studio_event` — this is
a control frame that rides the raw bus).

### Event buffering before snapshot (F3)

Events that arrive on the WebSocket before the initial REST snapshot lands (for
`useQueueSync`) are stored in `pendingEventsRef` as closures and replayed in order
immediately after the snapshot is set. If the hydration fails, the pending buffer is
cleared (only by the generation that owns it — see generation guards).

### Reconnect hydration with generation guard (F4)

Each call to `refreshQueue` increments `hydrationGenerationRef`. On completion, the
result is discarded unless `myGeneration === hydrationGenerationRef.current`. This
prevents stale concurrent hydrations from overwriting fresher data.

On reconnect (WebSocket transition from disconnected to connected, skipping the
initial mount), `useQueueSync` calls `refreshQueue('reconnect')`, which additionally
prunes live overlays older than `(hydratedAtSeconds - 5)` to evict stale in-flight
state accumulated during the disconnect.

`useJobs` tracks reconnects via `useStudioSocketConnection` and calls `refreshJobs()`
(WS `jobs_snapshot_request`) on reconnect.

### Fallback polling

When the WebSocket is disconnected, `useQueueSync` falls back to polling
`GET /api/queue` every 60 seconds. The poll stops as soon as the socket reconnects.

`useJobs` has **no** periodic polling. Snapshot hydration is event-driven only:
one `jobs_snapshot_request` on (re)connect, plus explicit `refreshJobs()` calls on
queue-invalidation events (`QUEUE_INVALIDATED`, `queue_item_invalidated`). The live
event stream is the source of truth between snapshots — a periodic snapshot poll
MUST NOT be reintroduced as a workaround for lost events; lost events are a bug.

---

## Progress rules

### Rounding

Progress values are rounded to 2 decimal places (`round(v, 2)`) in
`app/orchestration/progress/service.py` before being written into job state and
broadcast. The client receives values already rounded.

In `update_job`, the `progress` field is also explicitly rounded:
```python
v = round(float(v), 2)
```

### Regression protection

**Backend (`update_job`):** progress regression is prevented for statuses
`running`, `finalizing`, `done` unless `force_broadcast=True` or the current
progress is below 0.03 (allowing the `preparing→running 0.0` handoff). Regressed
values are clamped to the current progress rather than dropped entirely.

**Frontend (`useJobs`):** incoming progress is dropped (not applied) if it is
lower than the current job's progress, unless the job is in a rollback status
(`queued`/`preparing`) and timestamp checks confirm it is a newer run.

### Advancement threshold

`ProgressService` uses `min_progress_delta=0.01` (default). A broadcast is only
emitted when the absolute change in progress meets or exceeds this threshold (i.e.,
≥ 1 percentage point). The check applies separately to job progress, batch progress,
and segment progress.

---

## Progress contract authority — single-source at the event-builder layer

### Why the event-builder layer (not a broadcast chokepoint)

Progress frames reach the WebSocket via two paths:

- **Path A (orchestrated):** `ProgressService.publish` → `build_*_event(...)` → `broadcast_studio_event` → `manager.broadcast`. Path A sets `skip_job_updated=True` on `update_job`, deliberately bypassing `broadcast_job_updated`.
- **Path B (handler-direct / TTS subprocess):** `state_jobs.update_job` / `put_job` → `_JOB_LISTENERS` → `broadcast_job_updated` (`app/api/ws.py`) → `build_*_event(...)` → `broadcast_studio_event`.

Because Path A bypasses `broadcast_job_updated`, wiring `broadcast_job_updated` as a universal chokepoint is **incorrect** — it only intercepts Path B. The true convergence point both paths share is the **event builders in `app/api/contracts/events.py`** (`build_chapter_progress_event`, `build_segment_progress_event`, `build_queue_item_status_event`).

### Single-source contract (v1.5.2+)

Both producers call `ProgressService.enrich(job_id, payload)` **before** building events, then pass the enriched values into every `build_*_event(...)` call:

```
Path A: ProgressService.publish ──► enrich(job_id, payload, sample=True) ──► build_*_event(confidence=, eta_seconds=, …)
Path B: broadcast_job_updated   ──► enrich(job_id, payload, sample=True) ──► build_*_event(confidence=, eta_seconds=, …)
```

`enrich` is the single math kernel (RLock-guarded singleton, boot-installed) that applies:
- §4A.2 numeric `eta_confidence` (variance × completion × freshness — monotone-rising in progress)
- §4A.3 share-weighted segment→chapter ETA/confidence composition
- §4A.4 mechanical ETA ceiling (`apply_eta_ceiling`)
- §4A.5 convergence-trust (converging ETA does NOT lower confidence)
- §4A.8 calculated→observed ETA crossfade (`crossfade_eta`, cold-start bootstrap `DEFAULT_BASELINE_ENGINE_CPS`)
- Monotonic-clamped `progress` / `grouped_progress` (grouped forced to `1.0` at terminal)

The Python `compute_progress_confidence` echo (that set `confidence = coverage_ratio * progress`) in `app/api/contracts/events.py` is **deleted**. §4A progress-bearing frames (jobs.lifecycle / chapters.progress / queue.items) carry backend-authoritative numeric `confidence`; builders that receive such a frame with `confidence=None` raise loudly. The client (`frontend/src/api/contracts/liveEvents.ts`) retains a `computeProgressConfidence` function as a **fallback only for non-§4A frames** — specifically Option-B direct broadcasts (`segments.progress` via `broadcast_segment_progress`, `voice.test` via `broadcast_test_progress`) that legitimately carry no `confidence`. Removing the client fallback would leave those frames without confidence; it is not the authoritative path for §4A frames.

### Snapshot / hydration path (PI6)

The `jobs_snapshot` handler and running-queue row serializers call
`enrich(job_id, payload, sample=False)` — **read-only**: all ETA values are computed from the current ring state without pushing a velocity sample or mutating the monotonic floor. This ensures hydration frames carry the same §4A enrichment as live frames.

### Out-of-contract paths

The following broadcast helpers carry their own `progress` field and are **outside** the enriched-confidence contract — `enrich` is not called for them, and the builders do not require `confidence` on these paths:

- `broadcast_test_progress` (`voice.test` / `voice_test_progress`) — voice test frames have no chapter/char_count/ETA semantics.
- `broadcast_segment_progress` and `broadcast_tts_log_line` — segment-direct and log frames route via `broadcast_studio_event` without a chapter-level builder.

### Lock hierarchy (D7)

`_STATE_LOCK` (`state_jobs.py`) is always the **outer** lock; the `ProgressService` RLock is a **leaf** lock. Code that already holds the PS-RLock MUST NOT call into `app.db.state_jobs` (which acquires `_STATE_LOCK`). `ProgressService.publish` performs all `get_jobs()` reads **before** entering the RLock-guarded region to avoid `PS-RLock → _STATE_LOCK` inversion. See ADR-0012.

---

## The "queue must never infer state from tts.logs" rule

The `tts.logs` topic carries diagnostics and engine output only. `useQueueSync` and
`useJobs` do not subscribe to or act on `tts.logs` frames for queue-row state
mutations. The queue state derives exclusively from `jobs.lifecycle`, `queue.items`,
`chapters.progress`, `chapters.lifecycle`, and `segments.progress`.

---

## Queue row authority (binding — audit Slice 5)

`queue.items` is the **only** topic with row authority over main queue rows.
Enforced in `useQueueSync.ts` (row creation guard + overlay-field stripping) and
`useJobs.ts` (unknown-job guards); the allowed overlay fields are the exported
`QUEUE_OVERLAY_FIELDS` constant in `frontend/src/utils/queueOverlayFields.ts`.

| Capability | `queue.items` | `jobs.lifecycle` | `chapters.progress` / `segments.progress` / `voice.test` | `chapters.lifecycle` |
|---|---|---|---|---|
| Create a queue row | ✅ | ❌ | ❌ | ❌ |
| Change row identity / classification (kind, engine, title, project, chapter) | ✅ | ❌ | ❌ | ❌ |
| Change row lifecycle **status** | ✅ | ❌ | ❌ | ❌ |
| Drive terminal retention / removal | ✅ | ❌ | ❌ | ❌ |
| Update live overlay fields (`QUEUE_OVERLAY_FIELDS`) on an **existing** row | ✅ | ✅ | ✅ | ❌ |
| Trigger refetch / invalidation | ✅ (`queue_item_invalidated`) | ❌ | ❌ | ✅ |

Rules:

- An overlay frame for a job id that is unknown in both the canonical snapshot and
  the live store MUST be dropped (dev builds may log it). It is NOT buffered: the
  backend emits a `queue_item_status` frame on every STATUS TRANSITION of every
  queue-visible job — from `ProgressService.publish` for orchestrated transitions
  (which suppress the legacy listener via `skip_job_updated`) and from
  `broadcast_job_updated` (`app/api/ws.py`) for handler-direct `update_job`
  writes — so the authoritative row state arrives on its own topic. Progress-only
  ticks do NOT emit `queue.items`; they flow on the scoped topics as overlays.
- A terminal `jobs.lifecycle` frame (`done`/`failed`/`cancelled`) additionally
  triggers a client queue REFETCH (`useQueueSync`) — a legal re-read of the
  durable rows, guaranteeing eventual consistency if a queue.items frame drops.
- Overlay application MUST preserve the row's current status (from store, then
  snapshot); a terminal `jobs.lifecycle` frame may be used **read-only** as the
  trigger for clearing segment-overlay fields (`applyTerminalLifecycleReset`), but
  its status is never written to the row.
- The audit-era allowance for `jobs.lifecycle` to refresh queue-visible data is
  retired; it is an overlay topic for queue purposes.

## Invariants

**Server MUST:**
- Include `"type": "studio_event"` and `"version": 1` in every live event frame.
- Populate `ids.jobId` for every frame that relates to a tracked job.
- Never emit `queue_item_status` or `queue_item_invalidated` on the `jobs.lifecycle`
  topic; these belong on `queue.items`.
- Assign a per-job monotonically increasing `sequence` to every `tts.logs` frame.
- Round progress to 2 decimal places before broadcast.
- Not broadcast `queue.items` invalidation for ordinary running/progress updates
  (only for terminal resets and explicit force-broadcast with non-terminal status).
- Not broadcast a non-terminal frame for a job after its terminal frame, except
  via the `queued`/`preparing` re-entry (see "Terminal ordering guarantee").

**Client MUST:**
- Enforce the queue row-authority table above: only `queue.items` creates,
  reclassifies, status-transitions, or retires main queue rows.
- Use `publishStudioSocketMessage` as the single injection point (not raw listener
  calls) so the audit store record is always created before subscribers run.
- Not infer queue-row status from `tts.logs` frames.
- Buffer events that arrive before the REST snapshot, then replay them in order.
- Discard a hydration result whose generation has been superseded.
- Apply status regression protection when merging live events into job state.

**Client MUST NOT:**
- Mutate segment-progress fields (`active_segment_id`, `active_segment_progress`,
  etc.) on the basis of `jobs.lifecycle` or `queue.items` events unless the event
  carries an explicit segment reset (null fields from a terminal lifecycle event).

---

## Conformance checklist

| # | Check | How to verify |
|---|-------|---------------|
| C1 | Every wire frame has `type === "studio_event"` and `version === 1` | `grep -n '"type".*"studio_event"' app/api/contracts/events.py` + test fixture assertion |
| C2 | `ids` object is always present with the four ID keys | Unit test `build_studio_event` return value |
| C3 | Progress values in payloads are rounded to 2 decimals | `tests/orchestration/test_progress_service.py` progress assertions |
| C4 | `tts.logs` frames carry a per-job monotonic `sequence` | `test_broadcast_tts_log_line_sequence` or equivalent |
| C5 | `queue.items` invalidation is NOT emitted for ordinary progress updates | Search `broadcast_queue_update` callers; none should be inside hot progress paths |
| C6 | `publishStudioSocketMessage` is used in all frontend tests that inject socket frames | `grep -r "publishStudioSocketMessage\|studioSocketBus" frontend/tests/` |
| C7 | Client advancement threshold is ≥ 1% in `ProgressService` | `assert service.min_progress_delta == 0.01` in progress service test |
| C8 | Bootstrap buffering: events arriving before snapshot are replayed after snapshot lands | `useQueueSync` test with delayed `getProcessingQueue` mock |
| C9 | Generation guard: stale hydration result is discarded | `useQueueSync` test with two concurrent hydration calls |
| C10 | Reconnect prunes overlays older than `(hydratedAtSeconds - 5)` | `useQueueSync` reconnect test asserting stale overlays gone |

---

## Known gaps

1. **Envelope version field absent on client type.** The wire envelope has
   `"version": 1` inside the frame, but `StudioSocketEnvelope` in `liveEvents.ts`
   has no `version` field — `data` is typed as `unknown`. Consumers access `version`
   via `data.version`. Planned: promote `version` to the top of `StudioSocketEnvelope`
   in a doc-02-planned addition; until then, version validation at the client boundary
   is not enforced.

2. **7-step lifecycle ordering is not sequencing-gate-enforced.** The wiki documents
   a strict 7-step ordering but the backend emits steps from independent call paths
   with no mutex or sequencing primitive between them. Out-of-order delivery is
   theoretically possible under concurrent updates.

3. **Wiki topic list is incomplete.** `wiki/Queue-and-Jobs.md` lists 6 topics;
   the code implements 10 stable topics plus the plugin namespace. The wiki should
   be updated to reference this spec.

4. **`chapters.lifecycle` vs `chapters.progress` split.** `useQueueSync` triggers a
   full `refreshQueue('refresh')` on any `chapters.lifecycle` event. The distinction
   between structural chapter changes (lifecycle) and render progress (progress) is
   observed on the client, but the lifecycle event does not carry enough fields to
   apply an incremental update — hence the full refresh.

5. **`finalizing` status mapped to `running` at write time.** Both `put_job` and
   `update_job` convert `status="finalizing"` to `"running"` before writing to
   `state.json`. However, the `JobLifecyclePayload` and `QueueItemPayload` types
   include `"finalizing"` as a valid status literal. Frames from the progress
   service can carry `finalizing`; state.json never stores it.

6. **Dual camelCase/snake_case fields.** Many payload types carry both camelCase and
   snake_case variants of the same field (e.g. `etaSeconds`/`eta_seconds`) for
   backward compatibility. This is not yet normalized; clients should read whichever
   is present.
