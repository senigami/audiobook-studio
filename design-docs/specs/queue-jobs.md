# SP4 — Queue & Job Lifecycle Spec

```
spec_version: 1.6.0
status: active
updated: 2026-06-26
created: 2026-06-10
sources: app/db/models.py, app/db/state_jobs.py, app/db/queue.py,
         app/orchestration/scheduler/{orchestrator,orchestrator_helpers,policies,resources,recovery}.py,
         plugins/tts_xtts/plugin/studio/standard_handler.py,
         app/orchestration/progress/eta.py, app/core/boot.py, app/api/web.py,
         tests/db/test_state_rules.py, test_state_jobs_broadcast.py, test_db_reconcile.py,
         tests/orchestration/test_recovery_db_integration.py,
         tests/orchestration/test_engine_semaphores.py
```

## Changelog

| Version | Date       | Summary                         |
|---------|------------|---------------------------------|
| 1.6.0   | 2026-06-26 | **W-PAR task 001 — per-engine-class counting semaphores (§7).** `GpuAdmissionGate` / `ExclusiveAdmissionGate` binary gates replaced by `EngineClassSemaphore` counting semaphores keyed by engine class (``"gpu"``, ``"cpu_heavy"``, ``"cloud"``). Each engine declares `behavior.max_concurrent_workers` in its manifest (default 1); the scheduler sizes the semaphore to that cap. Global cap backstop (`MAX_GLOBAL_CONCURRENT_SYNTHESIS`, default 8) checked first. Ships dark behind `ENGINE_CLASS_ADMISSION` (default OFF, §7.3a): until enabled (task 007) every synthesis-class claim routes through the single shared exclusive gate, preserving the pre-W-PAR invariant that xtts/voxtral/API synthesis all serialize against one another (INV-1). Closes W5: `SynthesisTask` for `mixed` engine no longer uses `ResourceClaim.none()` — claim is derived from the manifest resource block + cap. No engine-ID string comparisons remain in `resources.py` (INV-5). |
| 1.5.1   | 2026-06-26 | §3.8 refinement: the per-group preparing phase's `indeterminate=true` / ETA suspension is carried on the `LOADING_MODEL` frame (fired only on a real model-load marker for the active group), not on the every-segment `SEGMENT_PENDING` announce — which stays ETA-neutral so warm renders don't flash. Matches `live-events.md` 1.7.1. |
| 1.5.0   | 2026-06-26 | **Distinguish the per-group render PHASE (preparing/synthesizing, carried by `reason_code` on live frames) from the durable monotonic job-status lifecycle. A group's preparing phase during model load MUST NOT regress a running job's durable status to `preparing` (INV-1). Documents the W3 mixed model-load ETA-suspension backend signals. See §3.8.** |
| 1.4.1   | 2026-06-25 | Clarify `synthesis_duration_seconds` is synthesis-only render time, derived from engine-confirmed group timing and excluding model-load windows; aligns mixed render timing with the orchestrator-owned sample path. |
| 1.4.0   | 2026-06-19 | **Rebuild vs queue semantics documented (§3.7) + `force_rerender` field (§2) + I18.** The shipped behavior was previously undocumented: queue (`POST /processing_queue`, `force_rerender=False`) is additive — deletes nothing, reuses existing segment WAVs per-group and concatenates; rebuild (`POST /chapters/{id}/reset` then `force_rerender=True`) is destructive — deletes all segment WAVs, resets `audio_status`, and re-synthesizes every group. `force_rerender` guards reuse identically in all three render paths (xtts standard, xtts bake, voxtral bake). Backfills the spec for commits 3a834144 / 6373e9ad / 23a3b7d5. |
| 1.3.0   | 2026-06-19 | Cooperative-cancel lost-update fix (I17): `cancel()` synchronously detaches the task's engine-log listener (after `on_cancel()` sets the cancel flag), and both `[SEGMENT_SAVED]` `audio_status="done"` write sites — the orchestrator `log_listener` and the xtts handler's `chapter_on_output` — drop the write when the task is cancelled. Prevents a straggler save from the not-yet-stopped subprocess resurrecting segment state a chapter reset just cleared (which made the next render reuse stale audio). Prompt subprocess-stop remains a follow-up (G6). |
| 1.2.2   | 2026-06-16 | Bug fix: `apply_status_regression_guard` now allows terminal→`preparing` (not only terminal→`queued`); matches §3.5 / `is_terminal_reset` / drop-guard which already treated both as valid resets. Fixed by expanding the `ACTIVE_STATUSES` check in `app/db/state_job_guards.py`. |
| 1.2.1   | 2026-06-16 | §3.2 corrected line citations: `put_job` remap at `app/db/state_jobs.py:74-75`, `update_job` remap at `app/db/state_jobs.py:188-189`. |
| 1.2.0   | 2026-06-13 | §10 Presentation surfaces added: documents where jobs are shown (queue drawer = glance, Activity page = depth) per north-star decision 9; dead `/queue` opens the drawer and bounces back; both surfaces read the same job data (live-events.md `queue.items` row authority) |
| 1.1.2   | 2026-06-11 | Terminal latch at the ws broadcast chokepoint (live-events.md §"Terminal ordering guarantee"): terminal reset / `queued`/`preparing` re-entry unlatches; `delete_jobs`/`clear_all_jobs` clear latch entries (§3.5) |
| 1.1.1   | 2026-06-11 | §3.6 voice-sample exception: samples auto-convert WAV→sample.mp3 (owner ruling) |
| 1.1.0   | 2026-06-11 | WAV-first synthesis (audit Slice 7): ordinary chapter synthesis never emits `finalizing` and never converts to MP3; `make_mp3` inert for ordinary synthesis (§3.6). Queue row authority lives in live-events.md §"Queue row authority". |
| 1.0.2   | 2026-06-10 | B18: startup recovery wired — interrupted tasks are recovered and resumed instead of silently cancelled |
| 1.0.1   | 2026-06-10 | B20: requeue now uses standard terminal-reset path; G4 resolved |
| 1.0     | 2026-06-10 | Initial spec, documenting v2.0 implemented behavior |

---

## Purpose

Documents the exact behavior of the two job-tracking stores, the Job dataclass
and its status contract, terminal-reset semantics, reconciliation on restart,
scheduler policy, resource gates, ETA field ownership, and broadcast-flag
routing.  This spec is the binding reference; code that disagrees with it is a
bug in one or the other.

Broadcast/WebSocket topic details are cross-referenced to
`design-docs/specs/live-events.md` rather than duplicated here.

---

## 1. Two Tracking Stores

### 1.1 `state.json` — in-memory job store (authoritative for live status)

`app/db/state_jobs.py` maintains a JSON file (`state.json`) backed by an
in-memory dict protected by `_STATE_LOCK` (a `threading.RLock`).  Writes use
`_atomic_write_text` (write-to-temp + rename).

- **Authoritative for:** current job status, progress, ETA fields, active segment
  tracking, and all fields the WebSocket live-event stream reads.
- **Not authoritative for:** historical queue records, chapter audio-file paths,
  or render-performance samples — those live in SQLite.
- Terminal jobs are kept up to 50 entries (sorted by `finished_at` /
  `created_at`); older entries are pruned automatically after each terminal
  transition (`prune_completed_jobs`).

### 1.2 SQLite `processing_queue` — durable queue history (authoritative for records)

`app/db/queue.py` owns the `processing_queue` table.  Every job appears here
via `upsert_queue_row` at submission time.  `update_queue_item` is called by
`update_job` whenever `status` or `started_at` changes, keeping SQLite in sync.

- **Authoritative for:** audit trail, chapter audio-file path, audio-length-seconds,
  render-performance samples (via JOIN in `get_queue`), and the source for restart
  reconciliation.
- **Not authoritative for:** live progress, ETA, active-segment fields — those are
  state.json only.

**Synchronization rule:** `update_job` calls `update_queue_item` automatically
whenever `status` or `started_at` appears in `changed_fields`.  Callers must
not call `update_queue_item` directly for status changes that go through
`update_job`.

---

## 2. Job Fields

All fields live on `app.db.models.Job` (a `@dataclass`).

| Field | Type | Description |
|---|---|---|
| `id` | `str` | Stable identifier (`job-<uuid4>`) |
| `engine` | `str` | Engine ID (e.g. `"xtts"`, `"mixed"`) |
| `status` | `Status` | See §3 |
| `kind` | `JobKind \| None` | See §4 |
| `created_at` | `float` | Unix epoch, set at construction |
| `started_at` | `float \| None` | Set when status transitions to `running` |
| `updated_at` | `float \| None` | Set to `created_at` if None on `put_job`; auto-updated on every `update_job` write |
| `finished_at` | `float \| None` | Set when terminal status reached |
| `project_id` | `str \| None` | Owning project |
| `chapter_id` | `str \| None` | Owning chapter (if chapter-scoped) |
| `chapter_file` | `str \| None` | Legacy field; path context |
| `progress` | `float` | 0.0–1.0; always rounded to 2 decimal places |
| `eta_seconds` | `int \| None` | Estimated remaining seconds; see §7 |
| `eta_basis` | `str \| None` | How ETA was derived; see §7 |
| `estimated_end_at` | `float \| None` | `updated_at + eta_seconds`; see §7 |
| `eta_confidence` | `str \| None` | Optional confidence label |
| `eta_updated_at` | `float \| None` | Timestamp of last ETA update |
| `error` | `str \| None` | Error message on failure |
| `reason_code` | `str \| None` | Machine-readable reason tag on the current transition |
| `log` | `str` | Accumulated log text (not broadcast to listeners) |
| `warning_count` | `int` | Accumulated warning count |
| `output_wav` | `str \| None` | Output WAV filename |
| `output_mp3` | `str \| None` | Output MP3 filename |
| `safe_mode` | `bool` | Default True |
| `make_mp3` | `bool` | Default False |
| `bypass_pause` | `bool` | Skip pause gate |
| `force_rerender` | `bool` | Default False. When True, engine handlers bypass per-group WAV reuse and re-synthesize every render group regardless of `audio_status` (§3.7). Set by the rebuild action; threaded through `SynthesisTask` and survives recovery. |
| `speaker_profile` | `str \| None` | |
| `is_bake` | `bool` | True for bake-type jobs |
| `has_segment_support` | `bool` | Engine supports segment-level progress |
| `segment_ids` | `list[str] \| None` | For segment-scoped jobs |
| `active_segment_id` | `str \| None` | Currently rendering segment |
| `active_segment_progress` | `float` | 0.0–1.0; forced to 0.0 when `active_segment_id` is None |
| `active_segment_eta_seconds` | `int \| None` | Segment-level ETA |
| `active_segment_eta_basis` | `str \| None` | |
| `active_segment_updated_at` | `float \| None` | Cleared when `active_segment_id` goes None |
| `active_render_batch_id` | `str \| None` | Current render batch |
| `active_render_batch_progress` | `float \| None` | Forced to None when `active_render_batch_id` is None |
| `render_group_count` | `int` | Total render groups |
| `completed_render_groups` | `int` | |
| `active_render_group_index` | `int` | |
| `total_render_weight` | `int` | |
| `completed_render_weight` | `int` | |
| `active_render_group_weight` | `int` | |
| `grouped_progress` | `float` | |
| `synthesis_duration_seconds` | `float \| None` | Synthesis-only render time; excludes model load windows |
| `classification_override` | `str \| None` | Forces `classification` property result |
| `engine_activity_started_at` | `float \| None` | |
| `first_start_segment_at` | `float \| None` | |
| `chapter_render_completed_at` | `float \| None` | |
| `sum_segment_render_seconds` | `float` | |
| `model_load_seconds` | `float \| None` | |
| `inter_group_overhead_seconds` | `float \| None` | |
| `chapter_post_start_window` | `float \| None` | |
| `chapter_wall_duration` | `float \| None` | |
| `custom_title` | `str \| None` | UI display name |
| `author_meta` | `str \| None` | |
| `narrator_meta` | `str \| None` | |
| `chapter_list` | `list[dict] \| None` | |
| `cover_path` | `str \| None` | |

---

## 3. Status Set and Legal Transitions

### 3.1 Defined statuses

```
Status = Literal["queued", "preparing", "running", "finalizing", "done", "failed", "cancelled"]
```

Priority ordering enforced by `update_job`:

| Status | Priority value |
|---|---|
| `queued` | 1 |
| `preparing` | 2 |
| `running` | 3 |
| `finalizing` | 4 |
| `done` | 5 |
| `failed` | 5 |
| `cancelled` | 5 |

### 3.2 `finalizing` is an alias for `running`

Both `put_job` and `update_job` silently remap `status="finalizing"` to
`status="running"` before writing.  `finalizing` never appears in `state.json`.
(Source: `put_job` ~line 74-75, `update_job` ~line 188-189, in `app/db/state_jobs.py`.)

### 3.3 Normal forward path

```
queued → preparing → running → done
                  └──────────→ failed
                  └──────────→ cancelled
```

The orchestrator also uses transient labels (`cancelling`,
`waiting_for_resources`, `completed`) in `_publish()` calls; these are
progress-service vocabulary and map to the terminal statuses above before
reaching `update_job`.

### 3.4 Transition enforcement

**Code-guarded (always enforced):**
- Status regression (new priority < current priority) is silently dropped
  unless `force_broadcast=True` or the transition is an explicit terminal reset.
- Terminal state guard: updates to a job in `done`/`failed`/`cancelled` are
  silently dropped unless the new status is `queued` or `preparing`, or
  `force_broadcast=True`.

**Conventional only (no code guard):**
- The orchestrator's documented flow (`queued → preparing → running → done`)
  is enforced only by the orchestrator; nothing prevents a caller from jumping
  directly from `queued` to `done` via `update_job`.

### 3.5 Terminal reset (rerun)

When a job in `done`/`failed`/`cancelled` is updated with
`status="queued"` or `status="preparing"`, a **terminal reset** is triggered.
The following fields are cleared (set to None) unconditionally before the
caller-supplied value is applied:

```
finished_at, started_at, eta_seconds, eta_basis, estimated_end_at,
active_segment_id, active_segment_progress, active_render_batch_id,
active_render_batch_progress, active_segment_eta_seconds,
active_segment_eta_basis, active_segment_updated_at, reason_code, error
```

**Caller-value precedence (B5 fix):** if the caller passes a non-None value
for any cleared field in the same `update_job` call, that value is applied
after the clear.  Example: passing `started_at=<timestamp>` alongside
`status="queued"` stores the caller's `started_at`, not None.

On terminal reset, two broadcasts fire outside the lock:
- `broadcast_chapter_updated(reason="JOB_RESET_TO_ACTIVE")` (if `chapter_id` present)
- `broadcast_queue_update(reason="JOB_RESET_TO_ACTIVE")`

These also fire from `put_job` when `put_job` detects a terminal → active
status change.

The `reason_code` in the broadcast dict is set to `"JOB_RESET_TO_ACTIVE"`.

A terminal reset (or any `queued`/`preparing` re-entry) also unlatches the
per-job terminal latch at the ws broadcast chokepoint, restoring normal frame
flow; `delete_jobs` and `clear_all_jobs` clear latch entries for the removed
job ids. See live-events.md §"Terminal ordering guarantee".

### 3.6 WAV-first synthesis (binding — audit Slice 7)

Ordinary chapter synthesis is **WAV-first**: engine handlers (XTTS, Voxtral)
complete with `status="done"` and `output_wav` only. They MUST NOT emit a
`finalizing` phase and MUST NOT convert to MP3 inside the synthesis lifecycle.
MP3 production is an explicit export/assembly action (`ExportTask`, assembly
pipeline) or an explicit format request on the external TTS gateway
(`/api/v1/tts`). The `Job.make_mp3` / task `make_mp3` fields remain in the
contract for those explicit paths but are **inert for ordinary synthesis**;
queue-row display filenames for chapter renders always use the `.wav` name.

**Voice-sample exception (owner ruling 2026-06-11):** voice sample/preview jobs
also synthesize WAV-first, but the result is then automatically converted to
`sample.mp3` and the WAV is deleted (`finalize_sample_artifact`,
`app/engines/audio_ops.py`); on conversion failure the WAV is kept and served
as fallback. This matches `design-docs/specs/voice-bundles.md` (previews are MP3).
Chapter renders are never auto-converted — assembly converts WAV → AAC.

---

### 3.7 Rebuild vs Queue: chapter audio reuse (binding)

Two distinct entry points act on a chapter's render audio, with **opposite**
reuse semantics. Conflating them loses already-rendered audio, so the
distinction is binding.

**Queue (additive — the default).** `POST /processing_queue` with
`force_rerender=False` (`app/api/routers/generation.py`). This is the normal
"render the missing parts" path: it deletes **nothing**. Engine handlers reuse
every render group whose segment WAV already exists and is marked `done`, and
synthesize only the missing/stale groups, then concatenate existing + new
segment WAVs into the chapter output. The reuse decision is per-group, made by
`_group_is_done` (xtts standard path) / `_group_needs_render` (xtts + voxtral
bake paths) against validated artifact metadata — never raw file existence
alone.

**Rebuild (destructive).** `POST /chapters/{id}/reset`
(`app/api/routers/chapters.py`) followed by a queue submission with
`force_rerender=True`. The reset physically deletes all of the chapter's
segment WAVs (`reset_chapter_audio` → `cleanup_chapter_audio_files`,
`app/db/chapters.py`) and resets every segment `audio_status` to
`unprocessed`. `force_rerender=True` then makes the handlers re-synthesize
every group unconditionally (it short-circuits `_group_is_done` /
`_group_needs_render` to "render"), so nothing is reused even if a stray WAV
survived.

The flag guards reuse in **all three render paths** — xtts standard
(`plugins/tts_xtts/plugin/studio/standard_handler.py`), xtts bake
(`plugins/tts_xtts/plugin/studio/bake.py`), and voxtral bake
(`plugins/tts_voxtral/plugin/studio/bake.py`) — so rebuild behaves identically
regardless of engine. See invariant I18.

---

### 3.8 Per-group render phase vs. durable job status (INV-1)

The durable `Job.status` lifecycle (`queued → preparing → running → done /
failed / cancelled`) is **monotonic and regression-guarded** in `state_jobs.py`.
`apply_status_regression_guard` (in `app/db/state_job_guards.py`) enforces this:
once a job reaches `"running"`, any attempt to write `status="preparing"` or
`status="queued"` is silently dropped unless it is an explicit terminal reset
(new status `queued`/`preparing` entering from a terminal state) or
`force_broadcast=True`. See §3.4 (Transition enforcement).

**Per-group preparing phase is a UI/progress concept, not a status transition.**
Within a running job, an individual render group may be in a **preparing phase**
— loading its engine's model before synthesis can begin (the model-load window
documented in `live-events.md` §"Model-load preparing window"). This per-group
state is communicated exclusively through:

- The live frame `reason_code` field (`"SEGMENT_PENDING"` on the `[START_SEGMENT]`
  announce — ETA-neutral; `"LOADING_MODEL"` when a real model-load window is
  actually detected for the active group) on `segments.progress` /
  `chapters.progress` frames.
- `indeterminate: true` on the `LOADING_MODEL` frame (not the `SEGMENT_PENDING`
  announce), signalling the UI to display a spinner rather than a paced bar. The
  announce frame stays ETA-neutral so warm renders don't flash; see
  `live-events.md` §"Model-load preparing window".

These fields are per-frame properties on the WebSocket event stream. They do NOT
correspond to a write of `status="preparing"` to `state.json`. The durable job
status MUST remain `"running"` throughout the model-load window.

**INV-1 (binding):** A job whose durable `status` has reached `"running"` MUST
NOT have its durable status regressed to `"preparing"` by any code path — including
the model-load preparing window, a `SEGMENT_PENDING` broadcast, or any per-group
phase signal. The orchestrator MUST enforce this by not calling `update_job` with
`status="preparing"` on a job that is already `"running"`.

**Initial cold-load is not a regression.** Before the very first segment of the
first render group, the job legitimately passes through `status="preparing"` (the
forward path: `queued → preparing → running`). This is the normal TTS server
warm-up path, not a regression. INV-1 prohibits only the backward transition after
`running` has been reached.

**Cross-reference:** `live-events.md` §"Model-load preparing window" documents the
exact frame shape (`indeterminate`, null ETA clears, force-emit) that carries the
per-group preparing phase to the frontend without touching the durable status.

---

## 4. JobKind Values

```
JobKind = Literal["synthesis", "assembly", "voice_build", "voice_test", "mixed", "generic"]
```

`kind` is optional; absent on jobs where the distinction is not needed.

---

## 5. SQLite Queue Statuses and Reconciliation

### 5.1 Queue status sets

```python
ACTIVE_QUEUE_STATUSES   = ("queued", "preparing", "running", "finalizing")
TERMINAL_QUEUE_STATUSES = ("done", "failed", "cancelled")
```

### 5.2 `update_queue_item` chapter-sync rules

| Job status | `started_at` column | `completed_at` | `chapters.audio_status` |
|---|---|---|---|
| `queued` | NULL | NULL | (no change) |
| `preparing` | NULL | NULL | (no change) |
| `running` | COALESCE(existing, now) | NULL | `processing` |
| `done` | (unchanged) | now | `done` + file/length written |
| `failed` | (unchanged) | now | `unprocessed` |
| `cancelled` | (unchanged) | now | (no change from this call) |

Chapter sync only fires when `chapter_scoped=True` (the default; set False for
segment-only jobs).

### 5.3 Startup order: snapshot → clear → reconcile → recover

The web-server startup sequence executes these steps in order to preserve
interrupted task state while cleaning up stale in-memory records:

1. **Snapshot** — `load_recoverable_task_contexts()` is called first, capturing
   DB rows in `running`/`queued`/`waiting` into a `recovery_contexts` list.
   Wrapped in `try/except`; startup never crashes on snapshot failure (returns
   empty list + warning log).

2. **Clear** — Stuck in-memory jobs (`state.json` entries in
   `queued`/`running`/`preparing`/`finalizing`) are deleted from `state.json`.

3. **Reconcile** — `reconcile_queue_status()` cancels any `processing_queue`
   rows that are no longer live in `state.json` (see §5.4 below).  The
   snapshotted contexts' rows are cancelled here — this is expected and
   intentional.

4. **Register listeners** — Job listeners and the progress broadcaster are wired
   so that subsequent recovery events reach the UI.

5. **Recover** — `run_startup_recovery(recovery_contexts)` is called with the
   pre-snapshotted contexts.  It delegates to `TaskOrchestrator.recover(contexts=…)`,
   which reconciles each task's artifact state and re-submits work that still
   needs synthesis.  Re-submission calls `submit()`, which publishes
   `status="queued"` — this reactivates the DB row (via `update_queue_item`)
   from `cancelled` back to `queued`/`preparing`.

**Escape hatch:** set `STUDIO_RECOVER_ON_STARTUP=0` to skip step 5 entirely.
The default is `"1"` (enabled).  Log line on success:
`"Startup: recovered N interrupted task(s)."`.

### 5.4 Reconciliation on restart (`reconcile_queue_status`)

Called during boot with `active_ids` = job IDs currently live in `state.json`
and `known_job_statuses` = their statuses.

Reconciliation steps:

1. For each job in `known_job_statuses` whose status is terminal
   (`done`/`failed`/`cancelled`): update its `processing_queue` row from
   active → terminal if it has not already been updated.

2. For any `processing_queue` row still active (`running`/`queued`/
   `preparing`/`finalizing`) that is **not** in `active_ids` and **not** in the
   terminal set: set status to `cancelled` with `completed_at = now`.

3. **Done-row guard (B3):** chapter `audio_status` is reset to `unprocessed`
   only when the cancelled row's chapter has **no existing `done` row** in
   `processing_queue`.  If a `done` row exists for the chapter, the chapter
   status is left untouched.

---

## 6. Priority and Fairness Modes

Controlled by `TTS_API_PRIORITY` env var or the `api_priority_mode` setting
(settings key takes precedence over env).

| Mode | Constant | Behavior |
|---|---|---|
| `studio_first` | `STUDIO_FIRST` | Default. Studio/UI tasks run before API tasks. |
| `equal` | `EQUAL` | All tasks FIFO by `submitted_at`. |
| `api_first` | `API_FIRST` | API-sourced tasks run before Studio tasks. |

Within a priority bucket, tasks are ordered by `submitted_at` ascending
(earlier submission wins).

API tasks are identified by `context.source in {"api", "external"}`.

`choose_next_task(queued_tasks=...)` returns the single highest-priority
eligible task context or `None` if the list is empty.

---

## 7. Resource Gates and Pause

### 7.1 Pause gate

`resources.set_paused(True)` sets a `threading.Event` flag and persists
`is_paused=True` to settings.  `reserve_task_resources` checks this first; if
paused, the task receives `admitted=False` with
`waiting_reason="Orchestrator is paused."` and the orchestrator returns early
without dispatching (task stays in memory in a `waiting_for_resources` state —
it is not re-queued).

### 7.2 Per-engine-class counting semaphores (`EngineClassSemaphore`) — W-PAR task 001

**Replaces the binary `GpuAdmissionGate` / `ExclusiveAdmissionGate` gates.**

Each engine manifest declares `behavior.max_concurrent_workers` (integer ≥ 1;
absent → 1).  `resources.py` exposes `get_engine_semaphore(engine_class, cap)`
which returns a module-level `EngineClassSemaphore` singleton keyed by the
engine-class string.  Engine class is derived from the manifest `resource`
block: `"gpu"` if `resource.gpu`, `"cpu_heavy"` if `resource.cpu_heavy`, else
`"cloud"`.

With `max_concurrent_workers=1` (any engine): exactly one task of that class
runs at a time — serial behavior identical to the prior binary gates (INV-1
"ships dark").  With N ≥ 2: N tasks run concurrently; the N+1th waits.

`GpuAdmissionGate` and `ExclusiveAdmissionGate` are deprecated thin wrappers
around `get_engine_semaphore("gpu", 1)` / `get_engine_semaphore("exclusive", 1)`
preserved for backward compatibility.

### 7.3 Global cap backstop

`_global_cap_gate` is an `EngineClassSemaphore` sized to
`MAX_GLOBAL_CONCURRENT_SYNTHESIS` (default 8, overridable via env var).
Checked before the per-engine semaphore when `engine_class` is present in the
claim.  Prevents a misconfigured engine from saturating the host.

### 7.3a Ships-dark gate (`ENGINE_CLASS_ADMISSION`) — INV-1

Per-engine-class admission is **OFF by default** in task 001 and is enabled by
the `ENGINE_CLASS_ADMISSION` env toggle (the full toggle/UI lands in task 007).

This is required for true "ships dark": pre-W-PAR, **all** synthesis tasks
(xtts, voxtral, and API synthesis) shared the *single* `_exclusive_gate`, so
they serialized against one another. Routing each engine class to its own cap=1
semaphore is **not** byte-identical — it admits an xtts (`"gpu"`) and a voxtral
(`"cloud"`) task concurrently, and an API-xtts (`"exclusive"`) plus a Studio
xtts (`"gpu"`) task concurrently on the *same GPU* — observable parallelism that
must not leak in before task 004 (server-side serialization) and task 007.

When the toggle is **off**, any claim with a non-empty `engine_class` is
funnelled through the shared `_exclusive_gate` (single-flight across all
synthesis), preserving the prior invariant. W5 stays closed because `mixed`
(`engine_class="cloud"`) now passes through that gate too instead of bypassing
admission via `ResourceClaim.none()`. `reserve`/`release` are symmetric on this
path (only the exclusive gate is touched).

### 7.4 Admission order

1. Pause gate checked first.
2. Ships-dark gate: if `engine_class` is set and `ENGINE_CLASS_ADMISSION` is
   off (default), route through the shared exclusive gate and return.
3. Global cap backstop checked (when `engine_class` is claimed and the toggle
   is on).
4. Per-engine-class semaphore checked (acquire one of N slots).
   — Legacy path (no `engine_class`): exclusive gate, then GPU gate.

### 7.5 `ResourceClaim` fields (W-PAR additions)

| Field | Type | Default | Notes |
|---|---|---|---|
| `gpu` | bool | false | GPU resource needed |
| `vram_mb` | int | 0 | Estimated VRAM usage |
| `cpu_heavy` | bool | false | Sustained heavy CPU |
| `exclusive` | bool | false | Legacy single-flight flag |
| `engine_class` | str | `""` | Semaphore key; derived from manifest resource block |
| `cap` | int | 1 | Semaphore capacity; from `behavior.max_concurrent_workers` |

### 7.6 `ResourceClaim` factories

| Factory | GPU | engine_class | Notes |
|---|---|---|---|
| `ResourceClaim.none()` | false | `""` | CPU-only tasks; no semaphore |
| `ResourceClaim.exclusive_claim()` | false | `"exclusive"` | Single-flight (cap=1) |
| `ResourceClaim.gpu_heavy(vram_mb=4000)` | true | `"gpu"` | Default VRAM 4000 MB |
| `ResourceClaim.from_engine_manifest(manifest)` | from manifest | from manifest | |

`SynthesisTask.__init__` calls `_manifest_resource_claim(engine_id)` which
reads the engine manifest, resolves the engine class and cap, and returns a
`ResourceClaim` with `engine_class` set.  No `if engine_id == "mixed"` branch
remains (INV-5, W5 closed).

---

## 8. ETA Field Ownership

All ETA writes on `state.json` jobs go through `update_job`.  No module may
write ETA fields directly to the JSON dict outside of `state_jobs.py`.

| Field | Written by | When |
|---|---|---|
| `eta_seconds` | `update_job` | When `eta_seconds` passed explicitly, or via observed-progress projection |
| `eta_basis` | `update_job` | Set to `"remaining_from_update"` when `eta_seconds` is set without an explicit basis |
| `estimated_end_at` | `update_job` | `updated_at + eta_seconds` when `eta_basis == "remaining_from_update"` |
| `eta_updated_at` | `update_job` | Cleared to None on terminal transition; set by callers |
| `active_segment_eta_seconds` | `update_job` | When passed in `**updates`; cleared when `active_segment_id` → None |
| `active_segment_eta_basis` | `update_job` | Same clearing rule |
| `active_segment_updated_at` | `update_job` | Same clearing rule |

### 8.1 Observed-progress projection

When `update_job` is called **without** an explicit `eta_seconds` and all of
the following hold:

- `status == "running"`
- `started_at` is set
- `0.03 ≤ progress < 0.98`
- `reason_code` is not in `ETA_PROJECTION_SKIP_REASONS`
  (`heartbeat`, `synthesis_progress`, `synthesis_finished`, `post_processing`,
  `metadata_update`, `segment_start`, `segment_saved`, `START_SEGMENT`,
  `SEGMENT_PROGRESS`, `SEGMENT_SAVED`)
- `elapsed > 1` second

…then `eta_seconds` is computed as
`ceil(elapsed × (1 − progress) / progress)`, with an EMA blend at
`progress < 0.15` (alpha = `progress / 0.15` applied between extrapolated and
previous ETA).  Values outside `[1, 86400]` are discarded.

### 8.2 Terminal ETA clear

On any transition to `done`/`failed`/`cancelled`, `update_job` sets
`eta_seconds`, `eta_basis`, `estimated_end_at`, and `eta_updated_at` all to
None before writing.

### 8.3 `estimate_eta_seconds` helper

`app/orchestration/progress/eta.py` provides `estimate_eta_seconds(completed_units,
total_units, observed_cps, baseline_cps)` for use by task implementations.  It
is separate from the observed-progress projection in `update_job` and intended
for cases where the caller has explicit throughput data.  When `observed_cps`
is less than 25% of `baseline_cps`, the baseline is used as the rate instead.

---

## 9. Broadcast-Flag Routing Summary

Full details are in `design-docs/specs/live-events.md`.  Summary of the three flags
consumed by `update_job`:

| Flag | Effect |
|---|---|
| `force_broadcast` | Bypasses terminal-state guard, regression guards, and empty-diff early-return; propagated to listeners as `broadcast_dict["force_broadcast"]=True`; triggers `broadcast_queue_update` for non-terminal statuses |
| `skip_job_updated` | Suppresses the per-job `JOB_UPDATED` WebSocket event; queue/chapter invalidation broadcasts are unaffected |
| `skip_studio_job_event` | Suppresses the `STUDIO_JOB` envelope event; all other broadcasts fire normally |

Broadcast events that fire from `update_job`:

| Event | Condition |
|---|---|
| `_JOB_LISTENERS` (all listeners) | `changed_fields` non-empty **or** `force_broadcast=True` |
| `broadcast_chapter_updated` | Terminal transition (`done`/`failed`/`cancelled`), terminal reset, or `force_broadcast=True` with `status`/`started_at` in `changed_fields` |
| `broadcast_queue_update` | `terminal_reset=True` **or** (`force_broadcast=True` and resulting status is not terminal) |

`broadcast_dict` always includes `previous_status` (captured before any
mutations) and `status_changed` (True iff the status actually changed).  The
`log` field is never included in `broadcast_dict`.

Listeners that accept `(job_id, updates, current_job)` (snapshot-aware) receive
the full post-write job dict as `current_job`; listeners with only
`(job_id, updates)` do not.  Snapshot support is cached per-listener in
`_LISTENER_SNAPSHOT_SUPPORT`.

---

## 10. Presentation Surfaces

This section documents **where** jobs are presented. Sections 1–9 own the job
*data* — its statuses, transitions, ETA fields, and broadcast routing — but say
nothing about which UI surfaces show it. The redesign settled that question
(owner north-star decision 9, "The Queue stops pretending"): there are exactly
two surfaces, with distinct postures, and **both read the same underlying job
data**. Neither surface is a separate source of truth.

| Surface | Posture | Where | Audience question |
|---|---|---|---|
| Queue drawer | Glance | Slide-over, openable from anywhere | "What's happening right now — without losing my place?" |
| Activity page | Depth | Routed page | "Show me everything: in-flight, history, calibration, totals." |

### 10.1 Queue drawer (glance)

The queue drawer is a slide-over for **at-a-glance monitoring from anywhere**
without navigating away from the current page. It is opened from the shell's
Queue button (which reflects the live queue count — see
[site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md) §2.3) and
**survives the redesign** intact: it is genuinely useful precisely because it
does not cost the user their place.

It shows a compact, live view of active and recently-terminal jobs: per-row
status, progress, ETA, and per-job cancel. It is scoped to monitoring, not
analysis — for history, calibration, and totals the user opens the Activity
page.

**Dead `/queue` URL (legacy behavior):** the old `/queue` route no longer owns a
page. Navigating to `/queue` **opens the drawer and bounces back** to the prior
route (`replace`), so the URL never settles on `/queue`. (Source:
`frontend/src/app/App.tsx` — the `/queue` effect sets the drawer open and
`navigate(prevPath, { replace: true })`.)

### 10.2 Activity page (depth)

The Activity page (`frontend/src/pages/Activity/ActivityPage.tsx`, reached from
the rail's MONITOR group) is the **depth view** — the global "what's going on"
surface. It composes four panels, all derived from the same job data:

- **Now / in-flight + ETA** — active jobs with progress and ETA, via the
  `GlobalQueue` component (non-compact mode).
- **History** — full terminal-job history with filters (`All` / `Renders` /
  `Samples` / `API`).
- **Stats — per-engine calibration** (`EngineCalibrationCard`): calibrated
  characters-per-second and confidence percentage per engine, derived from
  render-performance samples (the same calibration the ETA model in §8 consumes).
- **Production Tally** (`ProductionTallyCard`): cumulative audio rendered,
  word/character counts, render time spent, and per-engine breakdown — the
  long-run "X hours generated" totals, formerly buried in Settings → About.

### 10.3 Shared data; no duplicate authority

Both surfaces render from the same job state described in §1–§2 and receive the
same live updates. The drawer and the Activity page are **views**, not stores:
neither holds an independent copy of queue truth, and a job's status/progress/ETA
shown in one MUST match the other. Live-row authority is unchanged — the
`queue.items` topic is the sole row authority and every other topic is overlay-
only on existing rows (see [live-events.md](live-events.md) §"Queue row
authority" / `QUEUE_OVERLAY_FIELDS`). Chapter-status and progress presentation
that these surfaces render are governed by
[progress-presentation.md](progress-presentation.md).

---

## 11. Invariants

**MUST:**

- I1. `progress` MUST be rounded to exactly 2 decimal places before storage.
- I2. `status="finalizing"` MUST be remapped to `"running"` by both `put_job` and `update_job`.
- I3. `updated_at` MUST be set to a float on every write that changes at least one field.
- I4. On terminal reset, all fields in the cleared-field list MUST be set to None before any caller-supplied value is applied.
- I5. Caller-supplied non-None values for cleared fields MUST be applied after the clear (B5 rule).
- I6. `previous_status` in `broadcast_dict` MUST reflect the job's status before any mutations in the current `update_job` call.
- I7. Terminal ETA fields (`eta_seconds`, `eta_basis`, `estimated_end_at`, `eta_updated_at`) MUST be None after a terminal transition.
- I8. `active_segment_progress` MUST be 0.0 when `active_segment_id` is None.
- I9. `active_render_batch_progress` MUST be None when `active_render_batch_id` is None.
- I10. Reconciliation MUST NOT reset a chapter's `audio_status` to `unprocessed` if a `done` row exists for that chapter in `processing_queue` (B3 rule).
- I11. `update_queue_item` MUST be called by `update_job` for every status or `started_at` change; callers MUST NOT write queue status directly.

**MUST NOT:**

- I12. `state_jobs.py` MUST NOT be imported at module level by code outside `app.db`; it MUST NOT start threads or register listeners on import.
- I13. Progress MUST NOT regress once `progress ≥ 0.03` while `status` is `running`/`finalizing`/`done` unless `force_broadcast=True`.
- I14. Status MUST NOT regress to a lower-priority value unless it is a terminal reset or `force_broadcast=True`.
- I15. Updates to terminal jobs MUST NOT be applied unless the incoming status is `queued`/`preparing` (reset) or `force_broadcast=True`.
- I16. ETA fields MUST NOT be written by any path other than `update_job` / `state_jobs.py`.
- I17. A cancelled render MUST NOT write segment `audio_status="done"`. `cancel()` sets the task's cancel flag (`on_cancel()`) and detaches its engine-log listener synchronously; both `[SEGMENT_SAVED]` done-write sites (orchestrator `log_listener`, xtts `chapter_on_output`) MUST drop the write while the task is cancelled, so a straggler save cannot resurrect state a chapter reset cleared.
- I18. When `force_rerender=True`, engine handlers MUST NOT reuse an existing segment WAV regardless of its `audio_status`; every render group is re-synthesized. The flag MUST be honored identically in all three render paths (xtts standard, xtts bake, voxtral bake) — §3.7.

---

## 12. Conformance Checklist

Each invariant is verified by at least one existing test.

| Invariant | Test |
|---|---|
| I1 — progress rounding | `tests/db/test_state_rules.py::test_progress_rounding_rule` |
| I2 — finalizing→running remap | `tests/db/test_state_rules.py::test_finalizing_status_mapped_to_running` |
| I3 — updated_at stamped | `tests/db/test_state_rules.py::test_update_job_stamps_updated_at_for_state_and_broadcast` |
| I4/I5 — terminal reset clear + caller value | `tests/db/test_state_jobs_broadcast.py::test_terminal_reset_preserves_explicit_started_at` |
| I6 — previous_status not clobbered | `tests/db/test_state_jobs_broadcast.py::test_update_job_status_transition_broadcast_previous_status` |
| I6 — status_changed=False when unchanged | `tests/db/test_state_jobs_broadcast.py::test_update_job_no_status_change_status_changed_false` |
| I7 — terminal ETA clear | `tests/db/test_state_rules.py::test_reset_to_queued_from_terminal_status` (implicit via progress=0.0) |
| I8 — active_segment_progress forced 0 | `tests/db/test_state_rules.py::test_active_segment_progress_forced_to_zero_when_id_is_none` |
| I8 — active_segment ETA cleared | `tests/db/test_state_rules.py::test_active_segment_eta_fields` |
| I10 — B3 done-row guard | `tests/db/test_db_reconcile.py::test_reconcile_queue_status_does_not_reset_chapter_with_done_row` |
| I17 — cancelled render no segment resurrection (path A: orchestrator listener) | `tests/orchestration/test_cancel_no_segment_resurrection.py::test_cancelled_render_does_not_remark_segment_done` |
| I17 — cancelled render no segment resurrection (path B: xtts handler) | `plugins/tts_xtts/tests/test_handler.py::test_cancelled_chapter_render_does_not_remark_segment_done` |
| I13 — progress regression blocked | `tests/db/test_state_rules.py::test_progress_regression_protection` |
| I14 — status regression blocked | `tests/db/test_state_rules.py::test_status_regression_protection` |
| I15 — terminal updates dropped | `tests/db/test_state_rules.py::test_force_broadcast_overrides_protection` |
| requeue clean slate | `tests/db/test_state_rules.py::test_requeue_clean_slate` |
| requeue terminal-reset broadcast | `tests/db/test_state_jobs_broadcast.py::test_requeue_emits_terminal_reset_broadcast` |
| terminal → preparing reset applies status + clears reset fields | `tests/db/test_state_rules.py::test_reset_to_preparing_from_terminal_status` |
| ETA projection uses clamped progress | `tests/db/test_state_rules.py::test_eta_projection_uses_clamped_progress` |
| segment ETA fields not clobbered by chapter update | `tests/db/test_state_rules.py::test_chapter_queue_updates_do_not_overwrite_active_segment_eta` |
| B2 concurrency: status_changed invariant | `tests/db/test_state_jobs_broadcast.py::test_concurrent_put_job_update_job_broadcast_consistency` |

---

## 13. Known Gaps

**G1 — `finalizing` in SQLite queue statuses.**  `ACTIVE_QUEUE_STATUSES` in
`queue.py` includes `"finalizing"`, but `update_job` / `put_job` both silently
remap `finalizing` → `running` before writing to `state.json`.  A
`processing_queue` row could therefore show `finalizing` only if inserted
directly (e.g. via `upsert_queue_row` with a `finalizing` status string from
an external caller) — this cannot occur through the normal orchestrated path.
The mismatch is benign but should be documented when SQLite statuses are next
revised.

**G2 — RESOLVED (v1.0.2 / B18).** `list_jobs_by_status(status: str) -> list[dict]`
is implemented in `app.db.queue` and used by `load_recoverable_task_contexts()`.
The function returns all `processing_queue` rows for a given status string.
Startup recovery is now fully wired via `run_startup_recovery()` in `app.core.boot`.

**G3 — `waiting_for_resources` / `cancelling` / `completed` are
orchestrator-internal transition labels**, not members of the `Status` Literal in
`models.py`.  They appear in `_publish()` calls and are surfaced as progress
events to WebSocket listeners, but `state.json` will never store these strings
(the orchestrator maps them to proper `Status` values before calling
`update_job`).  A future spec revision should enumerate the complete set of
orchestrator-internal transition labels.

**G4 — RESOLVED (v1.0.1 / B20).** `requeue()` now calls `update_job` with
`status="queued"` and no `force_broadcast=True`, relying on the standard
terminal-reset branch.  The broadcast therefore carries `terminal_reset=True`,
`reason_code="JOB_RESET_TO_ACTIVE"`, `previous_status`, and `status_changed`
identically to any other terminal→active transition.  Stale ETA and segment
fields are cleared by the branch rather than by explicit caller arguments.
Covered by `tests/db/test_state_jobs_broadcast.py::test_requeue_emits_terminal_reset_broadcast`.

**G5 — No test for I7 (terminal ETA clear) in isolation.**  The behavior is
exercised as a side-effect of other tests but there is no dedicated test
asserting that all four ETA fields are None after a `done`/`failed`/`cancelled`
transition.

**G6 — Cancellation is cooperative, not prompt.** `cancel()` signals the engine
(`on_cancel()` → bridge cancel) and returns immediately; the engine subprocess
keeps rendering its in-flight segment until it next checks the cancel signal.
I17 makes this *correct* (the dead render can no longer resurrect segment state),
but not *prompt* — wasted compute continues until the subprocess stops. A future
hardening should make `cancel()` (or the chapter-reset path) wait, with a bounded
timeout, for the engine to confirm the task stopped, and add a between-segments
cancel poll in the xtts worker loop (`plugins/tts_xtts/plugin/core/xtts_inference.py`)
so an in-flight chapter render aborts within one segment instead of running to
completion.
