# SP4 — Queue & Job Lifecycle Spec

```
spec_version: 1.0.2
status: active
created: 2026-06-10
sources: app/db/models.py, app/db/state_jobs.py, app/db/queue.py,
         app/orchestration/scheduler/{orchestrator,policies,resources,recovery}.py,
         app/orchestration/progress/eta.py, app/core/boot.py, app/api/web.py,
         tests/db/test_state_rules.py, test_state_jobs_broadcast.py, test_db_reconcile.py,
         tests/orchestration/test_recovery_db_integration.py
```

## Changelog

| Version | Date       | Summary                         |
|---------|------------|---------------------------------|
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
`docs/specs/live-events.md` rather than duplicated here.

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
| `synthesis_duration_seconds` | `float \| None` | Wall time for synthesis phase |
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
(Source: `put_job` line 67, `update_job` line 182.)

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

### 7.2 GPU gate (`GpuAdmissionGate`)

One task at a time may hold the GPU slot.  `try_acquire` succeeds only if the
slot is unoccupied.  `release` is always called after the task completes or is
cancelled.  The gate is a module-level singleton (`_gpu_gate`).

### 7.3 Exclusive gate (`ExclusiveAdmissionGate`)

Same single-flight semantics as the GPU gate, for tasks that must run
one-at-a-time regardless of GPU needs (`ResourceClaim.exclusive=True`).

### 7.4 Admission order

1. Pause gate checked first.
2. Exclusive gate checked next (if claimed).
3. GPU gate checked last (if claimed); if denied, exclusive gate is released.

### 7.5 `ResourceClaim` factories

| Factory | GPU | Exclusive | Notes |
|---|---|---|---|
| `ResourceClaim.none()` | false | false | CPU-only tasks |
| `ResourceClaim.exclusive_claim()` | false | true | Single-flight non-GPU |
| `ResourceClaim.gpu_heavy(vram_mb=4000)` | true | false | Default VRAM 4000 MB |
| `ResourceClaim.from_engine_manifest(manifest)` | from manifest | from manifest | |

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

Full details are in `docs/specs/live-events.md`.  Summary of the three flags
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

## 10. Invariants

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

---

## 11. Conformance Checklist

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
| I13 — progress regression blocked | `tests/db/test_state_rules.py::test_progress_regression_protection` |
| I14 — status regression blocked | `tests/db/test_state_rules.py::test_status_regression_protection` |
| I15 — terminal updates dropped | `tests/db/test_state_rules.py::test_force_broadcast_overrides_protection` |
| requeue clean slate | `tests/db/test_state_rules.py::test_requeue_clean_slate` |
| requeue terminal-reset broadcast | `tests/db/test_state_jobs_broadcast.py::test_requeue_emits_terminal_reset_broadcast` |
| ETA projection uses clamped progress | `tests/db/test_state_rules.py::test_eta_projection_uses_clamped_progress` |
| segment ETA fields not clobbered by chapter update | `tests/db/test_state_rules.py::test_chapter_queue_updates_do_not_overwrite_active_segment_eta` |
| B2 concurrency: status_changed invariant | `tests/db/test_state_jobs_broadcast.py::test_concurrent_put_job_update_job_broadcast_consistency` |

---

## 12. Known Gaps

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
