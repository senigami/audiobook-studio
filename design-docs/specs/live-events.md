# Live Event Stream Contract

```
spec_version: 1.9.5
status: active
updated: 2026-07-05
sources:
  - app/api/ws.py
  - app/api/contracts/events.py
  - app/db/state_jobs.py
  - app/orchestration/progress/service.py
  - app/orchestration/scheduler/orchestrator_helpers.py
  - app/db/performance.py
  - frontend/src/api/contracts/liveEvents.ts
  - frontend/src/store/studioSocketBus.ts
  - frontend/src/hooks/useQueueSync.ts
  - frontend/src/hooks/useJobs.ts
```

## Changelog

| Version | Date       | Change                      |
|---------|------------|-----------------------------|
| 1.9.5   | 2026-07-05 | **`active_segments_map` now also rides `chapters.progress` (the missing "delivery leg").** `build_chapter_progress_event` previously had no `active_segments_map` parameter — the field could reach `queue_item_status` but never `chapter_progress`, and a map-only update (no status change) never triggers `queue.items` either (gated on `status_changed`/`terminal_reset`), so the field was structurally unreachable by the frontend for any mid-render tick regardless of how often the backend wrote it. Same shape as the existing `queue_item_status` field (snake_case, additive). Companion fix, `queue-jobs.md` 1.11.4: the map is now populated event-driven (per-child tick, diff-gated) instead of only at group-completion boundaries, which were structurally always empty. |
| 1.9.4   | 2026-07-04 | **`groupedProgress` now populated by the chapter fan-out (W-PAR enable-gate) — no wire-shape change.** `ChapterSynthesisTask._publish_progress` (`app/orchestration/tasks/segment_synthesis.py`) now computes a size-weighted ratio (`done_chars / total_chars`, weighted by each child's in-memory `group["text_length"]`) and threads it through the ALREADY-DEFINED `grouped_progress` kwarg on `ProgressService.publish`, so `groupedProgress` (defined since before 1.9.0) is populated on the `chapters.progress`/`queue.items` frames a chapter fan-out emits — order-independent (weighted by completed manuscript-TEXT size, not completion sequence or segment count) and computed with no dependency on mid-render DB status-write timing. The count-based `progress` field is unchanged and still emitted alongside it. Also (same change, `queue-jobs.md` 1.11.0): ephemeral per-child fan-out `TaskContext`s (`ephemeral=True`) no longer emit any JOB-scoped frame or durable state: `ProgressService.publish(..., ephemeral=True)` suppresses `jobs.lifecycle`, `queue.items`, and `chapters.progress` emissions, and `orchestrator_publish._publish` skips all durable job-state writes (`put_job`/`update_job`) — a chapter fan-out's job/queue/chapter frames now come ONLY from the parent `ChapterSynthesisTask`'s own publish calls, never from a per-child phantom job row. **SEGMENT-scoped frames from children are deliberately preserved (review-ratchet fix, same change):** `segments.progress` ticks and the prev→new `SEGMENT_SAVED` transition frame still emit through the child's publish, because the frontend keys the live per-segment progress bar by REAL segment id (`setSegmentProgress` in `useJobs.ts`) — the phantom job id was never load-bearing for those frames, and suppressing the whole child publish killed mid-render segment-bar animation for every fan-out chapter (pinned by `tests/orchestration/test_ephemeral_child_no_durable_job.py::test_ephemeral_children_still_emit_segment_frames_but_no_job_scoped_frames`). The additive `active_segments_map` per-segment visibility (1.9.0–1.9.2) is likewise unaffected (parent-owned aggregation). |
| 1.9.3   | 2026-07-03 | **W-PAR task 007 — spec reconciliation gate; bracketed-ETA and `stalled_segments` documented as computed-but-not-yet-wired (Known gaps §7).** No wire-shape change in this version: `BracketedEtaTracker` (rolling-throughput / bottleneck-pool ETA model, `app/orchestration/progress/eta.py`) and `ChapterSynthesisTask.stalled_segments` (task 005) both exist and are unit-tested, but are not yet threaded onto any live event frame or consumed by any client type. Recorded explicitly per CLAUDE.md's "resolve drift explicitly, never silently" rather than either fabricating aspirational wire fields or silently deferring without a paper trail. `active_segments_map` (1.9.0–1.9.2) is unaffected and remains fully live-wired. |
| 1.9.2   | 2026-07-03 | **`active_segments_map` live emission ENABLED (W-PAR 008, the enable-gate).** `_EMIT_ACTIVE_SEGMENTS_MAP` flipped `True` in `orchestrator_helpers.py`. The generation.py chapter-render path now constructs `ChapterSynthesisTask` (concurrent fan-out) for engines using segment orchestration instead of the sequential `SynthesisTask`; each `SegmentSynthesisTask` child renders via `make_dispatch_segment_bridge_call`, reusing `_dispatch_segment`'s existing per-segment isolation (mixed-engine children call `render_one_group` directly — extracted from `handle_mixed_job`, which itself is unchanged for any other caller — never the full chapter-terminal handler; non-mixed children route through the existing bridge path). At genuine cap > 1 the parent (`ChapterSynthesisTask._current_active_segments_map`) aggregates ONE entry per truly in-flight child, keyed by the child's real segment/leader id (never the synthetic per-child task_id) — the first time this spec's map has more than one entry outside a single `_dispatch_segment` call's own sequential single-entry-at-a-time emission (which remains correct and unchanged for a single dispatch unit processing multiple groups serially). At cap=1 (today's default; a manifest must explicitly raise `max_concurrent_workers` to enable visible parallelism) the map still emits single-entry frames identical in shape to 1.9.0/1.9.1 — INV-1 is preserved via a dedicated byte-identical event-sequence regression test comparing the old sequential path against the new fan-out path for an identical single-group chapter. **Also (R3, deliberate, not a regression):** render-performance samples (`record_render_sample`, INV-6 sole-writer) are now recorded per concurrently-rendered group (one sample per `SegmentSynthesisTask`/synthetic child) rather than once per whole chapter for segment-orchestrated engines — more granular calibration data; the orchestrator remains the sole writer regardless of granularity. **Review-pass amendments (same change, 2026-07-03):** a parent-map entry requires a child that has genuinely STARTED and not yet resolved (presence == in flight; queued children are excluded); the parent publishes progress/map updates per child completion (not in a terminal burst); and the parent emits an explicit EMPTY `active_segments_map` (`{}`) on any terminal outcome so the frontend's map-branch never keeps finished segments in a rendering state. |
| 1.9.1   | 2026-07-03 | **`active_segments_map` live emission deferred to task 008 (fan-out > 1).** At cap=1 the single active segment is fully conveyed by `active_segment_id`; emitting a redundant single-entry map let stale `preparing` entries — created only during the cold-start model-load window — accumulate in the frontend overlay and override the correct single-active derivation, freezing completed segments gray until the job ended ("black all at once" on cold starts). The field remains defined (§ below) but is **not emitted** at cap=1: `_current_active_segments_map` returns `None` behind `_EMIT_ACTIVE_SEGMENTS_MAP = False` in `orchestrator_helpers.py`. Task 008's parent aggregation (genuine concurrent fan-out) flips the flag on and emits a real multi-entry map. Frontend consumption (W-PAR 006) is unchanged and dormant until then. INV-1 restored: cap=1 frames carry no map, identical to pre-003. |
| 1.9.0   | 2026-07-02 | **`active_segments_map` (W-PAR 003, C2 contract) — additive field on `queue_item_status`.** A new, purely additive `active_segments_map?: Record<string, {phase: 'preparing'\|'rendering'\|'done', progress: number, eta_seconds: number\|null, reason_code?: string, indeterminate?: boolean}>` field may ride the `queue.items`/`queue_item_status` payload (snake_case on the wire — no camelCase variant, matching the frontend adapter). It is the chapter-level snapshot the orchestrator's per-segment dispatch (`_dispatch_segment`, `orchestrator_helpers.py`) publishes for whichever segment(s) are currently active; `phase`/`indeterminate` generalize the existing single-segment `LOADING_MODEL`/`SEGMENT_PENDING`/`SEGMENT_PROGRESS`/`SEGMENT_SAVED` reason-code lifecycle into a per-segment map entry. **Absent or omitted at cap=1** unless the dispatch path actually has an active segment to report — the existing single-active `active_segment_id`/`segments.progress` fields and event sequence are byte-identical (INV-1); this is additive-only (INV-9: no new wire channel, same `chapter progress`/`queue.items` frame). The per-segment `segments.progress` transition emission in `broadcast_job_updated` (§"per-segment render clock") is unchanged in this version — it remains correct at the current N=1 fan-out and will be reworked to emit from each concurrent child's own completion when fan-out > 1 is wired (task 005/enable-gate, not this version). |
| 1.8.0   | 2026-07-02 | **`pre_load_eta` proactive frame (W-MIX-LA load-aware ETA); amends the "indeterminate + non-null etaSeconds forbidden" invariant.** Doc catch-up for behavior that shipped in `64a39c34` and has been described in `progress-presentation.md` since 1.8.0 — this spec (the wire contract) had not been updated to match. Two frames now carry a positive `eta_seconds` outside plain `running`, both keyed off `expected_model_load_seconds` DB history for the engine: **(1)** a `pre_load_eta` frame, `status="preparing"`, emitted once at dispatch start when the TTS-server `/health` response shows `model_warm=false` and load history exists — `eta_seconds = round(synthesis_expected + load_term)`, NOT indeterminate (this is a determinate preparing-phase countdown, distinct from the `LOADING_MODEL` frame below). **(2)** the `LOADING_MODEL` frame (§"Model-load preparing window") MAY now carry a positive reconciled `eta_seconds = synthesis_remaining + decaying_load_remainder` instead of always clearing to `null` — the 1.7.0/1.7.1 "always-null suspension" framing is superseded for this case; `indeterminate: true` and a positive `eta_seconds` together is now **allowed and expected** on this frame. If no load history exists at either point, `eta_seconds` stays `null` (unchanged fallback). The 1.5.3 invariant "a frame MUST NOT carry `indeterminate: true` together with a non-null `etaSeconds`" is **removed** — see the amended Invariants entry below. Mirrors `progress-presentation.md` I10 (amended 1.8.0). |
| 1.7.1   | 2026-06-26 | **ETA suspension is load-marker-gated, not every-announce.** The `SEGMENT_PENDING` announce frame is now ETA-neutral (`eta_seconds: null`, no clear/indeterminate/force) so it preserves the prior ETA and warm single-engine renders don't flash at every segment boundary. The clear + `indeterminate=true` + force suspension fires only on a real model-load marker for the active render-group engine, via a `LOADING_MODEL` frame (the mixed handler's generic `[ENGINE_ACTIVITY_STARTED]` placeholder does not trigger it). Refines 1.7.0. |
| 1.7.0   | 2026-06-26 | **Model-load preparing window: LOADING_MODEL frames CLEAR the persisted ETA (null + explicit clear, not merely omitted), carry `indeterminate=true` with cleared segment + chapter ETA, are force-emitted (below the ≥1% threshold), keep authoritative progress unchanged, and keep durable `status=running` — the preparing state is a per-group phase via `reason_code`, never a `running→preparing` regression (INV-1). Pacing resumes from a fresh ETA on engine confirmation. Backend signals for the mixed model-load fix (W3). See §Per-segment ETA clock semantics "Model-load preparing window".** |
| 1.6.1   | 2026-06-24 | **Mixed renders resolve marker/progress parsing from the active render-group engine.** Chapter script entries now carry their resolved `engine`, the orchestrator uses that active-group engine for `match_timing_marker(...)` and `parse_engine_progress(...)`, and the mixed plugin emits a bracketed `[ENGINE_ACTIVITY_STARTED]` marker before each bridge render call. WebSocket/log attribution remains keyed to the original job engine. |
| 1.6.0   | 2026-06-19 | **`segments.progress` carries per-segment confidence + a decayed segment ETA (Path A).** The `segment_progress` payload's `confidence` is now the **per-segment** `seg_confidence` (resets per `segment_id`; `1.0` on `SEGMENT_SAVED`), not the chapter-level `eta_confidence` that rose monotonically across the whole chapter. `etaSeconds` is now the §4A.10 confidence-gated decay-handoff blend (grounded baseline ↔ live observed, weighted by the baseline's historical confidence) rather than raw `remaining_from_update` extrapolation — fixing the per-segment bar's early surge/stall. Both are computed in `ProgressService.enrich()`; see `progress-presentation.md` §4A.10 / invariants B11, B12. Additive payload semantics — envelope `version` stays 1; Option-B direct broadcasts are unchanged. |
| 1.5.6   | 2026-06-19 | **First segment synced to the real synthesis start; plugin emits a true 0% start.** (1) At `[START_SYNTHESIS]` (the real synthesis start, after model load) the orchestrator marks the first render group's leader active at 0% on the running frame, so the segment progress bar mounts in lockstep with the queue going `running` — fixing the queue appearing ~7s before the segment and a non-zero chapter percent showing before the segment's 0%. UI-mount only: it does not set the per-segment render-timing clock or the START_SEGMENT dedup set, so real marker timing is unaffected. (2) The XTTS plugin now emits `[PROGRESS] 0%` at each segment's true start (before the first sentence), so the first progress signal is 0%, not the first sentence's ~20%. Requires a full app restart so the long-lived warm worker respawns with current plugin code. |
| 1.5.5   | 2026-06-19 | **Queue cadence narrowed to real progress; inter-group gap factored into live ETA.** (1) `queue_item_status` (Path A) now emits only on a status transition OR a real ≥1% progress advance — NOT on same-percent ETA-only/confidence-only/silence-heartbeat frames, which were re-anchoring the frontend lane and ratcheting/jittering the displayed percent. Contract: the displayed percent changes only on real progress or real segment start/stop. (2) `[SEGMENT_SAVED]` re-anchors the chapter countdown to a gap-aware ETA (`remaining_chars/cps + groups_remaining × inter_group_overhead`), wiring the previously-dead `calculate_chapter_remaining_eta` so the bar no longer coasts through the model-reload gap. |
| 1.5.4   | 2026-06-19 | **`queue.items` carries live progress (Path A); segment-id fallback when `[START_SEGMENT]` is missing.** (1) `ProgressService.publish` (Path A) now emits `queue_item_status` on every emit-gated frame (status change OR ≥1% advance) for `chapter`/`job` scope — making `queue.items` the row's live progress authority, not just status — so the global queue row no longer freezes at 0% mid-render. Segment scope stays status-only; `broadcast_job_updated` (Path B) stays status-only. See "Queue row authority". (2) When a render emits no `[START_SEGMENT]` markers, the orchestrator derives `active_segment_id` from the render-group structure at first `[PROGRESS]` (and publishes the canonical `START_SEGMENT` frame), so the segment progress bar + script highlight engage regardless of marker delivery. See "per-segment render clock". |
| 1.5.3   | 2026-06-19 | **Determinate ETA gated on `running`.** `queued`/`preparing` frames MUST carry `etaSeconds: null`; a determinate ETA appears only at `running` (the first `[START_SYNTHESIS]`/`[PROGRESS]` frame). A frame MUST NOT carry `indeterminate: true` together with a non-null `etaSeconds`. Fixes the pre-synthesis ETA leak (`enrich()` previously synthesized a calculated ETA at `queued`/`preparing`) that made the progress bar jump at synthesis start. See progress-presentation §2.6 / I10. |
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
  active_segments_map?: Record<string, {           // W-PAR 003, C2 contract (1.9.0)
    phase: 'preparing' | 'rendering' | 'done';
    progress: number;                              // 0.0–1.0
    eta_seconds: number | null;
    reason_code?: string;
    indeterminate?: boolean;
  }> | null;
}
```

`active_segments_map` (added 1.9.0, W-PAR 003) is **snake_case on the wire** —
deliberately inconsistent with the rest of this camelCase payload — because
the frontend adapter (`jobEventAdapters.ts`) reads it directly with no
camelCase variant (see the C2 contract in
`design-docs/plans/active/parallel-segment-rendering/tasks/003-per-segment-dispatch-isolation.md`).
It is **additive and optional**: absent whenever the orchestrator has no
concurrent-segment snapshot to publish (this includes today's cap=1 path,
where `_dispatch_segment`'s single active-segment entry rides the map, but
the field can be entirely omitted without changing any other behavior).
`phase`/`indeterminate` are mandatory when an entry is present — `preparing`
must be observable before `rendering` so the frontend's preparing/load pulse
is not dropped (generalizes the W-MIX-LA single-segment load attribution).

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
  active_segments_map?: Record<string, {   // W-PAR 008 escaped-defect fix (1.9.5) — additive, snake_case, same C2 shape as queue_item_status
    phase: 'preparing' | 'rendering' | 'done';
    progress: number;
    eta_seconds: number | null;
  }>;
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
  etaSeconds?: number | null;        // §4A.10 decay-handoff blend (Path A), not raw extrapolation
  activeSegmentId?: string | null;
  activeSegmentProgress?: number | null;
  confidence?: number | null;        // PER-SEGMENT confidence (resets per segment_id), not chapter eta_confidence; 1.0 on SEGMENT_SAVED — progress-presentation.md §4A.10 / B12
}
```

On the Path A `segments.progress` frame (from `ProgressService.publish`), `confidence` is the
**per-segment** `seg_confidence` and `etaSeconds` is the §4A.10 confidence-gated decay blend — both
computed in `enrich()`. The chapter-level `eta_confidence` is NOT used for segment frames. (Option-B
direct `broadcast_segment_progress` frames remain outside the §4A contract and keep the client
`computeProgressConfidence` fallback.)

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

**Inter-group gap in the live ETA (`[SEGMENT_SAVED]`):** At each group completion
the `SEGMENT_SAVED` frame re-anchors the chapter countdown to a **gap-aware** ETA =
`remaining_chars / cps + groups_remaining × inter_group_overhead` (via
`calculate_chapter_remaining_eta`, using the calibrated `inter_group_overhead` from
render history; degrades to the overhead-free estimate when no calibration exists).
This stops the bar from coasting to completion during the model-reload gap before
the next group starts. The overhead is the same calibrated quantity already used in
the startup estimate; it is now also applied to the live mid-render countdown.

**Missing `[START_SEGMENT]` entirely (active-segment fallback):** If a render emits
`[PROGRESS]`/`[SEGMENT_SAVED]` but **no** `[START_SEGMENT]` at all (e.g. a stale
engine build), `active_segment_id` would otherwise stay null and `segments.progress`
frames would be gated out — collapsing the segment progress bar and the script text
highlight. The orchestrator derives the active segment from the known render-group
structure (`completed_group_count` → that group's leader id) when `active_seg_id` is
null: **primarily at `[START_SYNTHESIS]`** (the first group's leader is put on the
running frame, UI-mount only — see 1.5.6), and **as a fallback at the first
`[PROGRESS]`** (publishing the canonical `START_SEGMENT` frame) if synthesis began
without a START_SYNTHESIS marker. `[START_SEGMENT]` is thus advisory for segment
identity, not load-bearing.

### Model-load preparing window (ETA suspension)

During the gap between a group's `[START_SEGMENT]` announcement and its engine
confirmation (`[START_SYNTHESIS]` or first `[PROGRESS]`), the orchestrator enters
a **model-load preparing window** for that group. This window requires special ETA
handling because the engine has not yet begun synthesis and no reliable throughput
data is available.

**The announce frame is ETA-neutral; suspension fires only on a real load
marker.** The `SEGMENT_PENDING` frame (emitted immediately on every
`[START_SEGMENT]`) is **ETA-neutral**: it carries `eta_seconds: null` with **no
explicit clear, no `indeterminate`, and no force** — so the previously persisted
chapter ETA is *preserved*, not cleared. This is deliberate: `[START_SEGMENT]`
fires for every segment of every render (including warm single-engine renders that
load no model), so clearing/flashing on every announce would make the bar flicker
at each segment boundary. The ETA is suspended **only when a real model-load window
is actually detected** — i.e. when the active render-group engine emits its own
specific load marker (resolved per W1 active-group marker matching; the mixed
handler's generic `[ENGINE_ACTIVITY_STARTED]` placeholder, which resolves to the
job engine, does **not** count). On that detection the orchestrator emits a
`LOADING_MODEL` frame that suspends the ETA.

**Frame shape — `LOADING_MODEL` (the suspension frame; amended 1.8.0 for the
load-aware case).** When a real load window opens for the active segment, the
`LOADING_MODEL` frame carries:

- `eta_seconds` — **`null` as an explicit clear** when no `expected_model_load_seconds`
  DB history exists for the engine (the original 1.7.0 behavior; the distinction
  between explicit-null and omitted still matters: an omitted `eta_seconds` lets the
  frontend retain the last positive ETA and keep animating, while an explicit null
  instructs it to clear the persisted chapter ETA and flip to indeterminate
  immediately). **OR**, when load history exists (W-MIX-LA load-aware ETA, 1.8.0), a
  **positive reconciled value** — `eta_seconds = synthesis_remaining +
  decaying_load_remainder` (the load term shrinks as elapsed time since the check is
  subtracted, floored at 0, so the countdown keeps ticking instead of going blank).
- `indeterminate: true` — signals the UI to render a spinner / indeterminate bar.
  This is set **regardless of which `eta_seconds` case above applies** — the
  `indeterminate: true` + positive `eta_seconds` combination is intentional on this
  frame (see the amended Invariants entry).
- `active_segment_eta_seconds: null` (segment ETA cleared) — explicit, not omitted,
  in both cases; the load-aware reconciled ETA is chapter-level only.
- **force-emitted** (broadcast even when authoritative progress changed less than
  the normal ≥ 1% threshold), so the UI transitions to preparing state immediately
  rather than waiting for the next real progress tick.

**Frame shape — `pre_load_eta` (the proactive dispatch-time frame, 1.8.0).** Before
`LOADING_MODEL` fires reactively off a real load marker, the orchestrator may already
know the engine is cold: at dispatch start it checks the TTS-server `/health`
response for `model_warm=false` on the target engine, and if `expected_model_load_seconds`
DB history exists for it, publishes a frame with `status="preparing"`,
`reason_code="pre_load_eta"`, `eta_seconds = round(synthesis_expected + load_term)`.
Unlike `LOADING_MODEL`, this frame is **not indeterminate** — it is a determinate
preparing-phase countdown shown before any load marker has actually been observed.
If the proactive check finds no `/health` cold signal or no load history, no
`pre_load_eta` frame is emitted and the window is covered reactively by
`LOADING_MODEL` alone (or not at all, if no history exists at either point). The load
term set by whichever frame fires first is cleared at `[START_SYNTHESIS]` so
subsequent frames carry only synthesis-remaining time (no double-count); this is
**display-only** and never enters recorded `synthesis_duration_seconds`, `cps`, or
`model_load_seconds` performance stats.

**Authoritative progress is unchanged.** Only ETA is suspended. The `progress` and
`grouped_progress` values on the frame reflect the actual synthesis progress
accumulated so far (what was completed before this group's model load began). They
are not zeroed, reset, or withheld during the window.

**Durable job status stays `"running"` — no regression (INV-1).** The preparing
window is a **per-group render phase**, not a durable status transition. It is
carried on live frames via `reason_code` (`SEGMENT_PENDING` for the announce,
`LOADING_MODEL` for an active load window) and, on the `LOADING_MODEL` frame,
`indeterminate: true`. The durable `Job.status` in `state.json` remains `"running"`
throughout — the orchestrator MUST NOT write `status="preparing"` to a job that has
already reached `"running"`. Such a write would violate the monotonic status
lifecycle enforced by `apply_status_regression_guard` in `app/db/state_job_guards.py`
(§3.4 of `queue-jobs.md`). See also `queue-jobs.md` §"Per-group render phase vs.
durable job status" for the full invariant.

Note: the initial cold-load before the very first segment legitimately uses
`status="preparing"` — this is the normal forward path (`queued → preparing →
running`). Only a regression *after* `running` is forbidden by INV-1.

**Superseded (1.8.0):** this section previously claimed all model-load-window frames
carry `indeterminate: true` paired with `eta_seconds: null`, citing an invariant that
forbade the opposite pairing. That invariant is **removed** — see the amended
Invariants entry below. A `LOADING_MODEL` frame now legitimately carries
`indeterminate: true` together with a **positive** `eta_seconds` when load history
exists (the load-aware reconciled value above); the null-clear case still applies
when no history exists.

**ETA resumes fresh on confirmation.** When the engine emits `[START_SYNTHESIS]`
or the first `[PROGRESS]` line (ending the model-load window), ETA pacing resumes
from a **fresh anchor** — re-computed from 0 against the current progress and
throughput, not snapped from the stale pre-load value. This avoids a discontinuous
jump where the bar suddenly resumes from an ETA that was computed before a ~19s
model-load gap inflated remaining time.

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
  backend emits a `queue_item_status` frame so the authoritative row state arrives
  on its own topic. **Cadence (Path A vs Path B differ deliberately):**
  - `ProgressService.publish` (Path A — orchestrated chapter/job renders, which
    suppress the legacy listener via `skip_job_updated`) emits `queue_item_status`
    on a **status transition OR a real ≥1% progress advance** for `chapter`/`job`
    scope. This makes `queue.items` the row's live **progress** authority, not just
    its status authority; without it the global queue row freezes at its last
    status's progress and snaps to done. It deliberately does **NOT** re-emit the
    row on same-percent frames (ETA-only / confidence-only / silence-heartbeat):
    those re-anchor the frontend lane and ratchet/jitter the displayed percent.
    **The displayed percent changes only on real progress or real segment
    start/stop.** **Segment** scope is excluded except on status change (segment
    ticks drive the segment bar, not the parent queue row).
  - `broadcast_job_updated` (`app/api/ws.py`, Path B — handler-direct `update_job`
    writes) stays status-transition-only for the queue row.
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
- Emit `etaSeconds: null` on any frame whose status is `queued` (progress-presentation
  §2.6 / I10, amended 1.8.0). A `preparing` or `running+indeterminate` frame MAY carry
  a **positive** `etaSeconds` when the backend has load-aware history to justify it
  (`reason_code="pre_load_eta"` at `preparing`; the reconciled `LOADING_MODEL` value
  at `running+indeterminate`) — otherwise it stays `null`. **The 1.5.3 rule "never
  emit `indeterminate: true` together with a non-null `etaSeconds`" is removed
  (1.8.0)** — that combination is now intentional and expected on `LOADING_MODEL`
  frames; see "Model-load preparing window" above.

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

7. **Bracketed ETA (`eta_low_seconds`/`eta_high_seconds`/`eta_display`) and
   `stalled_segments` are computed but not yet on the wire (W-PAR task 007).**
   `app.orchestration.progress.eta.BracketedEtaTracker` implements the rolling-
   throughput / bottleneck-pool bracket model (reduces exactly to today's
   single-stream CPS at cap=1) and `ChapterSynthesisTask.stalled_segments`
   (task 005) computes the stalled-child list from the heartbeat monitor —
   both are unit-tested and available to callers, but neither is threaded
   through `ProgressService.enrich()` / the chapter-progress event builder
   onto a live frame yet. No client type or UI currently expects these
   fields. Wiring them into the live payload (and the corresponding
   `progress-presentation.md` bracket-display UI) is left as explicit
   follow-up work rather than bolted onto this task's already-large surface
   area — flagging it here per the "resolve drift explicitly, never
   silently" rule rather than documenting aspirational wire behavior that
   isn't actually emitted.
