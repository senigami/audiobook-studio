# SP4 — Queue & Job Lifecycle Spec

```
spec_version: 1.12.1
status: active
updated: 2026-07-14
created: 2026-06-10
sources: app/db/models.py, app/db/state_jobs.py, app/db/queue.py,
         app/orchestration/scheduler/{orchestrator,orchestrator_helpers,policies,resources,recovery,cap_settings}.py,
         app/orchestration/tasks/{synthesis,segment_synthesis}.py,
         plugins/tts_xtts/plugin/studio/standard_handler.py,
         app/orchestration/progress/eta.py, app/core/boot.py, app/api/web.py,
         app/db/performance.py, app/db/state_settings.py, app/api/routers/engines.py,
         frontend/src/components/queue/QueueItem.tsx,
         tests/db/test_state_rules.py, test_state_jobs_broadcast.py, test_db_reconcile.py,
         tests/orchestration/test_recovery_db_integration.py,
         tests/orchestration/test_engine_semaphores.py,
         tests/orchestration/test_live_cap_admission.py
```

## Changelog

| Version | Date       | Summary                         |
|---------|------------|---------------------------------|
| 1.12.1  | 2026-07-14 | **XTTS manifest ceiling raised `2 → 8` (owner directive).** `plugins/tts_xtts/manifest.json`'s `behavior.max_concurrent_workers` moved 2 → 8, matching `MAX_GLOBAL_CONCURRENT_SYNTHESIS` and the Settings slider's max — the manifest was silently clamping `tts_parallel_cap`/`tts_engine_caps["xtts"]` with no UI feedback when a user raised the setting above 2. The user's own `tts_parallel_cap`/per-engine-cap setting (still defaulting to 2) is now the real, user-explorable lever for XTTS concurrency up to the global backstop; the manifest is no longer an effective ceiling in practice. VRAM/OOM risk from running more concurrent warm workers than the GPU can hold is now the user's own tradeoff, same as any other resource-heavy setting. Voxtral/Mixed unchanged (`max_concurrent_workers: 1`, not the same "arbitrary author ceiling" case). Full detail in `system-architecture.md` §3.1/1.7.1. |
| 1.12.0  | 2026-07-11 | **§7.3b/§7.4a — live cap admission (W-PAR task 014), corrects a stale claim in this same section.** §7.3b previously stated "`_manifest_resource_claim` calls `resolve_effective_cap` when building each `ResourceClaim.cap`" — no longer true: `ResourceClaim.cap` (plus a new `manifest_max` field, same value) is now the **structural manifest ceiling only**; `resolve_effective_cap` is called fresh inside `reserve_task_resources` on every admission attempt instead, via a new optional `limit` parameter on `EngineClassSemaphore.try_acquire`. This closes the actual gap the stale sentence implied was already closed: previously, changing `tts_parallel_cap`/`tts_engine_caps` had no effect on already-queued/in-flight work until a process restart (the effective value was frozen into the claim at task-construction time, and the semaphore itself is grow-only, §7.4a). Now a settings change reaches every currently-waiting admission attempt (orchestrator's ~1s retry loop, per-child segment dispatch's ~0.5s retry loop — confirmed each child reserves individually, not via one shared parent reservation) within one retry cycle, with no restart and no eviction of in-flight tasks (`release_task_resources` was already, and remains, unconditional). `ensure_min_cap` (§7.4a) is untouched and only ever receives the manifest ceiling. New `GET`/`PUT /api/engines/{engine_id}/concurrency` (`api-conventions.md` gets the request/response shape) backed by a new single-key-merge `state_settings.set_engine_cap` (avoids two engines' overrides clobbering each other via a whole-`tts_engine_caps` replace). See `system-architecture.md` §3.1b for the full mechanism. |
| 1.11.6  | 2026-07-06 | **§7.3a/§7.4 — `ENGINE_CLASS_ADMISSION` now defaults ON (owner directive), closing the gap left by 1.11.5.** 1.11.5 raised `tts_parallel_cap`'s default 1→2 but left the admission gate that actually lets concurrent segments render (`_engine_class_admission_enabled` in `app/orchestration/scheduler/resources.py`) defaulting OFF — so every synthesis claim still funnelled through the legacy single-flight exclusive gate regardless of the cap setting, and chapter renders stayed genuinely sequential despite the setting/toggle suggesting otherwise. Found while root-causing an owner report of confusing, jumpy segment highlighting during a render — the highlighting behavior traced to real chunk-group batching + this dormant gate, not a rendering-layer bug. `_engine_class_admission_enabled()` now returns `True` unless `ENGINE_CLASS_ADMISSION` is explicitly set to `"0"`/`"false"`/`"no"`/`"off"` (previously: `True` only for `"1"`/`"true"`/`"yes"`/`"on"`, `False` otherwise). Companion test updates: `tests/orchestration/test_engine_semaphores.py`'s `TestShipsDarkCrossClassSerialization` renamed to `TestPerClassAdmissionDefault` (default-on cross-class concurrency test added; the old default-off assertion moved to an explicit `ENGINE_CLASS_ADMISSION=0` test) and `tests/orchestration/test_eta_bracket_and_engine_cap.py::test_currently_live_engines_unaffected_toggle_off` now forces the env var off explicitly rather than relying on it as an ambient default. |
| 1.11.5  | 2026-07-05 | **§7.3b — parallel rendering is now the shipped default (owner directive, superseding the W-PAR task 007 "ships dark" cap=1 default).** `DEFAULT_GLOBAL_CAP` (`cap_settings.py`) and the `tts_parallel_cap` default materialized by `state_settings._default_state()`/`_normalize_settings` both raised `1 → 2`. Rationale: sequential rendering is just the cap=1 case of the same fan-out code path, not a mode worth maintaining separately, and the owner does not want the two behaviors treated as parallel product surfaces. Reachable in-app via a new "Parallel Segment Rendering" toggle on Settings → General → Core Synthesis Defaults (`GeneralSettingsPanel.tsx`, POSTs `{tts_parallel_cap}` as JSON) — no env var or config-file edit needed for a running install. `effective_cap = min(2, manifest_max)` still applies, so Voxtral/Mixed (`max_concurrent_workers: 1`) remain sequential by their own manifest ceiling; only XTTS (`max_concurrent_workers: 2`) is affected. INV-1's cap=1-parity guarantee is unchanged — only the default value moved, the byte-identical-at-cap=1 contract still holds and is still tested. Companion fix (same investigation, §2.6/§2.7 territory in `progress-presentation.md`): the Chapter Editor's pre-first-segment "cold start" status pill (`ChapterHeader.tsx`, shown before any `active_segment_id` exists so the animated `PredictiveProgressBar` hasn't mounted yet) now carries the shared `.is-running`/`calm-pulse` animation while `queueStatus === 'Preparing'`, instead of sitting static for the whole model-load window. |
| 1.11.4  | 2026-07-05 | **§3.10 second escaped defect — the Phase 1 visual check's OTHER failure mode: `active_segments_map` never populated during a render, even after the routing crash (1.11.3) was fixed and a chapter rendered successfully at cap=1.** Root cause: `_current_active_segments_map` only ever ran inside `_publish_progress`, itself only called from the `as_completed` loop at group-COMPLETION boundaries — structurally always empty (the just-finished child excluded, the next not yet started), regardless of concurrency level. Separately, `build_chapter_progress_event` had no `active_segments_map` parameter at all, so even a correctly-populated map could never reach a `chapters.progress` frame (the delivery leg). Diagnosed via a 4-agent fusion design panel (Sonnet-only, per owner directive) + Fable plan verification, which caught both the missing delivery leg AND a lifecycle-ordering bug in the panel's initial timer-based proposal — leading to a simpler event-driven fix with no new timer/thread/join lifecycle at all (Fable's own suggested alternative). Fixed: `_on_child_segment_tick` (event-driven, diff-gated, `skip_job_updated=True`) replaces completion-boundary sampling; `build_chapter_progress_event` + `ws.py` gain the delivery leg. Frontend companion fix (same change): `useStudioChapter.ts` was silently discarding an already-delivered `segmentProgress` prop (real per-segment live data from the existing `segments.progress` stream) — now used as a fallback active-segments map when the backend hasn't supplied its own (backend `{}` always wins — a real "nothing rendering" signal must not be overridden by stale local data). |
| 1.11.3  | 2026-07-05 | **§3.10 escaped defect fixed — fan-out children were silently routed through a legacy per-engine registry handler instead of the bridge, for any engine with one registered.** Found during the owner's W-PAR Phase 1 👁 visual check (a real cap>1 render of an xtts chapter failed with a `text must not be empty` 422). Root cause: `_dispatch_segment`'s step-1 registry lookup (`app.jobs.registry.JobHandlerRegistry.get_handler`, matches on engine name alone) ran unconditionally, ahead of `_SyntheticSegmentTask`'s intended `prefers_local_execution`/`to_bridge_request` routing (documented in 1.9.0 above) — so every xtts AND voxtral fan-out child (both still have legacy `engine_handlers` registrations; only `mixed` has none) actually executed the legacy whole-chapter handler (`handle_xtts_standard`), which re-derives ALL of the chapter's remaining groups from a live DB query with no per-child scoping. The first-dispatched child silently rendered every sibling's work too; every subsequent child then found nothing left and unconditionally called the bridge with an empty script/text (no guard existed), producing the 422. Fixed: (1) `_SyntheticSegmentTask.skip_registry_dispatch = True` makes `_dispatch_segment` skip the registry lookup for fan-out children (new opt-in `getattr` check, `False` for every other task — INV-1 unaffected); (2) `handle_xtts_standard` now treats an empty post-filter `script` as success (`rc = 0`, falls through to the existing stitch block) instead of calling the bridge with an empty payload — defense-in-depth for any future caller that reaches this legacy path with nothing left to render. Diagnosed via a 4-agent fusion-reasoning panel + Fable adversarial verification; captured in `docs/checklists/code-review.md` (per-engine routing coverage + pre-flight empty-payload guard + the "shared handler reused at a new call site" recurring pattern). |
| 1.11.2  | 2026-07-04 | **§3.7 residual drift closed.** `_group_is_done` (xtts standard path, `plugins/tts_xtts/plugin/studio/standard_handler.py`) now gates reuse via the new `StudioPluginContext.is_valid_segment_artifact(path)` method (a thin public wrapper around the same `_is_valid_segment_artifact` check `group_needs_render` uses) instead of bare `chunk_path.exists()`. §3.7's "validated artifact metadata... never raw file existence alone" claim is now true for all three render paths (xtts bake, voxtral bake, mixed, and xtts standard); no known residual drift remains. Observable change: a zero-byte or duration-insane segment WAV on the standard (non-bake) xtts path is now healed to `unprocessed` and re-rendered instead of being wrongly treated as done. |
| 1.11.1  | 2026-07-04 | **§3.7 reuse-gate realignment recorded (PL-2) + residual `_group_is_done` drift flagged.** §3.7's claim that per-group reuse is decided "against validated artifact metadata — never raw file existence alone" was written in the 1.4.0 spec reconcile while the xtts and voxtral bake `_group_needs_render` locals still used a bare `expected_path.exists()` check (only the mixed handler's INV-3 version matched the spec). PL-2 (`design-docs/plans/active/simplification/06_plugin_consolidation.md`) consolidated all three into `StudioPluginContext.group_needs_render` (`app/studio_plugin_sdk/context.py`), which standardizes on the validated-artifact logic (`_is_valid_segment_artifact`: exists, non-empty, and — when parseable as a WAV — a sane header duration `0 < d <= 3600s`) plus per-segment DB state — so the xtts/voxtral bake paths now actually match §3.7 (observable change: a zero-byte or duration-insane segment WAV is re-rendered instead of reused). **Residual drift, not yet resolved:** `_group_is_done` (xtts standard path, `plugins/tts_xtts/plugin/studio/standard_handler.py`) still gates reuse on bare `chunk_path.exists()` + DB status; §3.7's sentence now scopes its validated-metadata claim accordingly. Upgrading `_group_is_done` to `_is_valid_segment_artifact` is an open owner decision, not implied by this row. |
| 1.11.0  | 2026-07-04 | **W-PAR enable-gate — ephemeral child fan-out tasks never create a durable Job row (Finding A) + size-weighted, order-independent chapter completion.** `TaskContext` gains an `ephemeral: bool = False` field; `_SyntheticSegmentTask.describe()` (the per-child task each `SegmentSynthesisTask` dispatches through `_dispatch_segment`) sets it `True`. For any `ephemeral` context, `orchestrator_publish.OrchestratorPublishMixin._publish` skips ALL durable job-state writes (`put_job`/`update_job`) and calls `ProgressService.publish(..., ephemeral=True)`, which suppresses the JOB-scoped emissions (`jobs.lifecycle`, `queue.items`, `chapters.progress`) while still emitting SEGMENT-scoped frames (`segments.progress` ticks + the prev→new `SEGMENT_SAVED` transition) — a chapter fan-out with N chunk groups now produces exactly ONE durable `Job` row (the parent, INV-4), not N+1 phantom `{parent}-seg-{index}` rows, and the live per-segment progress bar (frontend-keyed by real segment id) keeps working (review-ratchet fix, same change — the original all-frames early return killed it). Chapter-level visibility for concurrent children remains owned by the PARENT's own `active_segments_map` aggregation (`ChapterSynthesisTask._current_active_segments_map`/`_publish_progress`). Separately, `app.db.segments.chapter_completion_by_size(chapter_id) -> (done_chars, total_chars)` is a new reusable query helper (`LENGTH(text_content)`-weighted, `audio_status = 'done'` is the sole completion value) intended for resume/recompute call sites — **no caller is wired yet** (recorded explicitly per the 1.9.3 computed-but-not-wired convention; direct unit coverage lives in `tests/db/test_chapter_completion_by_size.py`); `ChapterSynthesisTask._publish_progress` now ALSO computes a size-weighted ratio from each child's in-memory `group["text_length"]` (order-independent — no dependency on mid-render DB status-write timing) and passes it through the existing `grouped_progress` kwarg, so `groupedProgress` (`live-events.md` 1.9.0) reflects completed manuscript-TEXT-size fraction, not segment count, regardless of which order unequal-size segments complete in. The count-based `progress` field is unchanged and still published alongside it. |
| 1.10.0  | 2026-07-03 | **W-PAR task 007 — cap-default-1 toggle surfaced as a Studio setting (§7.3b) + per-engine-id admission ceiling (§7.4a, folded-in Fable merge-gate finding).** `tts_parallel_cap` (global, default 1) and `tts_engine_caps` (per-engine override dict) are now real settings (`GET/POST /api/settings`), falling back to `TTS_PARALLEL_CAP`/`TTS_ENGINE_CAPS` env vars — same settings-then-env precedence as `api_priority_mode`. `app.orchestration.scheduler.cap_settings.resolve_effective_cap(engine_id, manifest_max)` computes `min(requested_cap, manifest_max)` with no engine-ID branching (INV-5); the manifest is always the ceiling. Default stays byte-identical to pre-007 (`tts_parallel_cap=1`). Also closes the Fable-flagged latent gap in the grow-only class semaphore (commit `7dd218aa`): a new independent per-`engine_id` semaphore registry (`get_engine_id_semaphore`) is checked alongside the class-level gate whenever a claim declares `engine_id`, so one engine's declared cap can never be inflated by a same-class sibling's larger request. Not observable today (only XTTS resolves to `"gpu"`; additive/opt-in for callers that don't declare `engine_id`). `EngineClassSemaphore` also now hard-rejects growing the `"exclusive"` class above cap=1. |
| 1.9.0   | 2026-07-03 | **§3.10 — live concurrent segment fan-out wired (W-PAR 008, the enable-gate).** `app/api/routers/generation.py`'s chapter-render/bake submission now constructs `ChapterSynthesisTask` (concurrent fan-out, `app/orchestration/tasks/segment_synthesis.py`) instead of the sequential `SynthesisTask` for engines using segment orchestration. `orchestrator_helpers._dispatch` bypasses `_dispatch_segment` for the PARENT (`is_chapter_fanout` flag) and calls `task.run()` directly; each child reuses `_dispatch_segment` via `make_dispatch_segment_bridge_call` (mixed-engine groups call the newly-extracted `render_one_group`, never the full chapter-terminal `handle_mixed_job`; other engines use the existing bridge path). Recovery reconstructs `ChapterSynthesisTask` from a bare context (`_reconstruct_chapter_task_from_context`) with K-of-N resume wired to `_group_needs_render`/`_group_ready_audio_path`. Fixed alongside: a stitch-barrier bug where a recovery-skipped (already-valid) group's existing audio never reached the final stitched paths. `active_segments_map` (`live-events.md` 1.9.2) now emits genuine multi-entry snapshots at cap > 1. At `max_concurrent_workers=1` (default; requires an explicit manifest cap raise to enable visible parallelism) behavior is byte-identical to the pre-008 sequential path, pinned by a dedicated old-vs-new event-sequence regression test. **Review-pass amendments (same change, 2026-07-03):** (1) the parent consumes each child future AS IT COMPLETES (`as_completed`, not an all-complete barrier) so chapter-level progress and `active_segments_map` advance mid-render; INV-7 is unaffected (all futures are still joined before stitch/terminal work). (2) `stitch_fn` is a RAISE-on-failure contract — `ChapterSynthesisTask.run()` converts a stitch raise into a failed `TaskResult`, so a failed stitch can never terminal-publish as done with no chapter WAV. (3) `active_segments_map` entries require a child that has STARTED and not resolved (queued-behind-the-pool children are excluded), and the parent writes an explicit empty map (`{}`, force-broadcast) at any terminal outcome so stale rendering entries never ride terminal frames. (4) Recovery reconstruction falls back to `SynthesisTask.from_task_context` for segment-scoped payloads (`segment_ids` present) — only whole-chapter renders reconstruct as chapter fan-outs. |
| 1.8.0   | 2026-07-02 | **§3.10 — per-segment dispatch isolation (W-PAR 003) + `active_segments_map` (C2 contract).** `orchestrator_helpers.py`'s dispatch is now a thin `_dispatch(...)` fan-out driver over `_dispatch_segment(...)`, which owns fully isolated per-segment timing/marker/model-load state in its own local scope (closure isolation, not a shared dict keyed by `segment_id` — INV-6). At today's N=1 fan-out this is byte-identical to the pre-003 single-`_dispatch` path (INV-1) — one call, same event sequence. `_dispatch_segment` returns a `SegmentResult` (isolated `timing`/`marker_state`/`segment_load_observed`/`segment_starts`/`segment_announced`) so a future multi-child fan-out (task 005/enable-gate) can aggregate per-segment `SegmentResult`s without reaching into shared mutable state. The orchestrator additionally publishes an **additive** `active_segments_map` snapshot (`live-events.md` 1.9.0, C2 contract) alongside the existing single-active `active_segment_id` fields — absent unless the dispatch path has a concurrent-segment snapshot to report. `broadcast_job_updated`'s transition-based `segments.progress` emission (prev/new `active_segment_id`) is UNCHANGED in this version — correct as-is at N=1 (there is exactly one prev→next handoff per chapter today) — and is deferred to task 005/enable-gate for the per-child-completion rework once fan-out > 1 is wired into the live dispatch path. |
| 1.7.0   | 2026-07-02 | **§3.9 — client retention for `pre_load_eta` (W-MIX-LA load-aware ETA).** Doc catch-up for behavior shipped in `64a39c34`: the global queue row (`QueueItem.tsx`) derives `preparingWithEta = displayStatus === 'preparing' && rawEtaSeconds > 0` and retains its active display params (started/eta/etaBasis) when true, so a cold-engine dispatch's proactive `pre_load_eta` frame (`live-events.md` 1.8.0) shows a countdown instead of being suppressed by the plain-`preparing` param-discard rule. Presentation-only; does not affect durable status (§3.8) or fabricate a value absent real ETA history. |
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
segment WAVs into the chapter output. The reuse decision is per-group, made
against validated artifact metadata plus per-segment DB state — never raw
file existence alone — on **all four render paths**: xtts bake, voxtral
bake, and mixed via the shared `StudioPluginContext.group_needs_render`
(`app/studio_plugin_sdk/context.py`, PL-2 — replacing three near-identical
`_group_needs_render` locals), and xtts standard's `_group_is_done`
(`standard_handler.py`) via the same context's `.is_valid_segment_artifact`
method (1.11.2 — closes the residual drift recorded in 1.11.1, where this
path still checked bare `chunk_path.exists()`).

**Rebuild (destructive).** `POST /chapters/{id}/reset`
(`app/api/routers/chapters.py`) followed by a queue submission with
`force_rerender=True`. The reset physically deletes all of the chapter's
segment WAVs (`reset_chapter_audio` → `cleanup_chapter_audio_files`,
`app/db/chapters.py`) and resets every segment `audio_status` to
`unprocessed`. `force_rerender=True` then makes the handlers re-synthesize
every group unconditionally (it short-circuits `_group_is_done` /
`ctx.group_needs_render(..., force_rerender=True)` to "render"), so nothing is
reused even if a stray WAV survived.

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

### 3.9 Client retention: `preparingWithEta` (`QueueItem.tsx`) — W-MIX-LA load-aware ETA

The global queue row (`frontend/src/components/queue/QueueItem.tsx`) normally
retains its "active" display params (started time, ETA, ETA basis) only while
`displayStatus` is `running`/`processing`/`finalizing`, or during the brief
done-transition/visually-pending windows. A plain `preparing` row has none of
these — there is nothing to count down.

**The `pre_load_eta` frame (`live-events.md` 1.8.0) breaks that assumption:** a
cold-engine dispatch can emit a `preparing`-status frame carrying a real positive
`eta_seconds` before any segment has started. Without a retention rule, the row's
existing param-suppression logic would discard that ETA on every re-render (since
`preparing` isn't in the retained-status list), and the queue row would flash
"Preparing…" with no countdown even though the backend already knows how long the
load will take.

`preparingWithEta` is a derived boolean: `displayStatus === 'preparing' && (rawEtaSeconds ?? 0) > 0`.
When true, it is OR'd into `shouldRetainActiveParams` alongside the
running/processing/finalizing check, so the row retains `started`/`etaSeconds`/
`etaBasis` exactly as it would for an active render. This is presentation-only —
it does not touch `displayStatus`, does not imply the durable job status is
anything other than `preparing`/`running` per §3.8, and does not fabricate a
value: if `rawEtaSeconds` is absent or non-positive (no load history for the
engine), `preparingWithEta` is `false` and the row falls back to the plain
"Preparing…" label with no number (no-fabrication principle,
`progress-presentation.md`).

**Cross-reference:** `progress-presentation.md` §2.6 / I10 (amended 1.8.0) documents
the backend-side rule that a positive `eta_seconds` on a `preparing` frame MUST be
displayed, not suppressed; this section documents the specific client mechanism
(`QueueItem.tsx`) that satisfies that rule for the global queue row.

### 3.10 Per-segment dispatch isolation (W-PAR 003) + parent/child emission model

**Dispatch shape.** `app/orchestration/scheduler/orchestrator_helpers.py`
exposes two methods:

- `_dispatch(self, *, task, context) -> TaskResult` — a thin fan-out driver.
  At today's fan-out (N=1: one dispatch unit per chapter task) it calls
  `_dispatch_segment` exactly once and returns its `TaskResult`. Byte-identical
  to the pre-003 single-`_dispatch` path (INV-1: same event sequence, same
  durable status transitions, same timing fields).
- `_dispatch_segment(self, *, task, context) -> SegmentResult` — owns a fully
  isolated per-call scope for the timing/marker/model-load state that was
  previously shared `_dispatch` closure state: `timing`, `segment_starts`,
  `segment_announced`, `segment_load_observed`, `marker_state`,
  `pending_engine_activity`, `load_state` (W-MIX-LA proactive/reactive load
  blocks), and the active-segment cells. Isolation is by **Python closure
  scope**, not by keying a shared dict on `segment_id` — two concurrent
  `_dispatch_segment` calls (once a multi-child fan-out is wired into the live
  path) cannot observe or corrupt each other's state (INV-6). Returns a
  `SegmentResult` dataclass carrying `task_result` plus the isolated
  `timing`/`marker_state`/`segment_load_observed`/`segment_starts`/
  `segment_announced` dicts, so a parent aggregator (task 005/enable-gate) can
  combine multiple children's results into chapter-level stats without
  reaching into shared mutable state.

**Parent/child model — LIVE (W-PAR 008, the enable-gate).**
`app/orchestration/tasks/segment_synthesis.py` defines `ChapterSynthesisTask`
(the durable parent — the sole DB/UI/recovery-visible unit, INV-4) and
`SegmentSynthesisTask` (an ephemeral child, never persisted). As of 008,
`app/api/routers/generation.py`'s chapter-render submission
(`_build_chapter_synthesis_task`) constructs a `ChapterSynthesisTask` instead
of the sequential `SynthesisTask` for any engine using segment orchestration
(`uses_segment_orchestration(engine_id)`), for both the normal chapter-render
and bake queue endpoints. `ChapterSynthesisTask.is_chapter_fanout = True` is
checked by `orchestrator_helpers._dispatch`: a chapter fan-out coordinator
renders nothing itself, so `_dispatch` calls `task.run()` directly and
bypasses `_dispatch_segment` for the PARENT (avoids an idle log_listener
registration and a spurious "Loading voice model…" frame). Each
`SegmentSynthesisTask` child renders via
`make_dispatch_segment_bridge_call(orchestrator)`: it builds a synthetic
single-group task + `TaskContext` and calls `orchestrator._dispatch_segment`
once, reusing ALL of 003's per-segment timing/marker/load isolation. Routing
inside that call: a group whose OWN resolved engine is `"mixed"` calls
`render_one_group` (extracted from `plugins/tts_mixed/handler.py`'s
`handle_mixed_job` — the per-group render body ONLY: markers, the engine
call, INV-3 artifact validation, `[SEGMENT_SAVED]`, per-group segment DB
writes; explicitly NO chapter-terminal job-status write, NO stitch, NO
chapter-wide DB rebuild, so it is safe to call once per concurrent child);
any other engine (e.g. `xtts`) routes through the existing bridge-dispatch
branch (`orchestrator.voice_bridge.synthesize`) — enforced by
`_SyntheticSegmentTask.skip_registry_dispatch = True`, which makes
`_dispatch_segment`'s step-1 legacy per-engine registry lookup a no-op for
these children (escaped defect, fixed 2026-07-05 — see the 1.11.3 changelog
row below). `handle_mixed_job` itself is
UNCHANGED for any other caller (its sequential loop now calls
`render_one_group` internally, same behavior). The stitch barrier
(`ChapterSynthesisTask._stitch_fn`, `run()`) fires exactly once after ALL
children join, with paths in manuscript (`segment_order`) order — including
paths for any already-valid groups a recovery `needs_render_fn`/
`resolve_existing_output_fn` pair excluded from the fan-out (a K-of-N
recovery bug fixed in the same change: a skipped group's existing output
previously never reached the stitch collection at all).

At `max_concurrent_workers=1` (the default — a manifest must explicitly raise
`behavior.max_concurrent_workers` above 1 to enable visible parallelism; the
parent's own pool bound is derived from the SAME manifest cap so it is never
a second, lower ceiling) this remains byte-identical to the pre-008 sequential
path — pinned by a dedicated regression test comparing the old
(`SynthesisTask`/`handle_mixed_job`) and new (`ChapterSynthesisTask`,
cap=1) per-segment event sequences for an identical single-group chapter.

**Recovery.** `TaskOrchestrator._reconstruct_chapter_task_from_context`
(orchestrator.py) reconstructs a `ChapterSynthesisTask` from a bare recovered
`TaskContext` for `task_type == "synthesis"` when the recovered job's engine
uses segment orchestration — `needs_render_fn`/`resolve_existing_output_fn`
wire `plugins/tts_mixed/handler.py`'s `_group_needs_render`/
`_group_ready_audio_path` (INV-8) so only the N-K unfinished segments are
resubmitted, and the K already-valid segments' known-good paths still reach
the stitch barrier.

**`active_segments_map` emission (C2 contract) — event-driven, LIVE at any
cap including cap=1 (fixed 2026-07-05; see 1.11.4 changelog for the
escaped-defect writeup).** `ChapterSynthesisTask._current_active_segments_map`
now returns a snapshot of `self._live_segments_map`, an in-memory dict
maintained INCREMENTALLY by `_on_child_segment_tick` — called from each
child's OWN dispatch thread at the exact point it already publishes its
per-tick progress (`_dispatch_segment` → `orchestrator_publish._publish`,
already ≥1%-gated by `ProgressService`; `_SyntheticSegmentTask.describe()`
threads an `on_segment_tick` callback into its payload for `_publish` to
invoke, duck-typed exactly like `skip_registry_dispatch`/`is_chapter_fanout`
elsewhere — no new import/coupling). This replaced the prior
completion-boundary-only sampling (`_publish_progress`, called solely inside
the `as_completed` loop), which was structurally always empty regardless of
concurrency level — the just-finished child was already excluded and the
next hadn't started at that exact call site. Keyed by `segment_id` (the REAL
segment/leader id, never the synthetic per-child task_id), each entry
`{phase, progress, eta_seconds}`. Written via a diff-gated (0.01-quantized)
`update_job(self.task_id, active_segments_map=snapshot, skip_job_updated=True)`
call — `skip_job_updated=True` emits the chapters.progress frame (carrying
the map) but skips the queue.items frame AND the §4A ETA-velocity sample, so
a map-only tick never corrupts confidence tracking between real group
completions. At cap=1 the map generally carries at most one entry; a
transient two-entry N/N+1 handoff is possible for a few microseconds when
the ThreadPoolExecutor's single worker thread picks up the next child before
the main thread's `as_completed` loop pops the just-finished one — benign
and self-correcting, invisible against real multi-second segment render
times (see `tests/orchestration/test_correctness_invariants.py`'s
`TestActiveSegmentsMapStartedGating`).

**Delivery leg (fixed 2026-07-05).** `build_chapter_progress_event`
(`app/api/contracts/events.py`) previously had NO `active_segments_map`
parameter at all — the field could never reach a `chapters.progress` frame no
matter how often the backend wrote it to job state, since a map-only update
(no status change) never triggers the `queue.items` frame either (gated on
`status_changed or terminal_reset`). `app/api/ws.py`'s
`broadcast_job_updated` now threads `merged.get("active_segments_map")`
through on every chapter-classified event, matching
`build_queue_item_status_event`'s existing support for the same field.

**`segments.progress` per-segment completion — unchanged in this version.**
`app/api/ws.py`'s `broadcast_job_updated` infers a segment's completion from
the **transition** of `active_segment_id` (previous → new) — unchanged by
008. Each concurrent child's own `_dispatch_segment` call independently emits
its own `SEGMENT_SAVED`/completion frame (scoped to that child's own
synthetic `TaskContext`), so this per-call transition inference remains
correct per-child even though multiple children now run concurrently; a
chapter-level aggregation of these into one combined transition stream (if
ever needed) remains a candidate fast-follow, not required by this version.

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

### 7.3a Per-engine-class admission gate (`ENGINE_CLASS_ADMISSION`)

**Default ON (2026-07-06, owner directive), superseding the task 001/007
"ships dark" default of OFF.** Per-engine-class admission shipped dark
(default OFF) from task 001 through task 007 while the settings/UI surface
(§7.3b) and ETA math caught up with real concurrency — that transitional
period is over: parallel rendering is the shipped default end-to-end now, not
just at the cap-setting level, so the admission gate that actually lets more
than one segment render concurrently defaults on to match.

Pre-W-PAR, **all** synthesis tasks (xtts, voxtral, and API synthesis) shared
the *single* `_exclusive_gate`, so they serialized against one another.
Routing each engine class to its own semaphore is **not** byte-identical at a
cap above 1 — it admits an xtts (`"gpu"`) and a voxtral (`"cloud"`) task
concurrently, and (at cap>1) two same-class tasks concurrently on the *same
GPU*. That is now the intended, observable behavior.

An operator can still force the old single-flight behavior by setting
`ENGINE_CLASS_ADMISSION` to `"0"`/`"false"`/`"no"`/`"off"` — any claim with a
non-empty `engine_class` is then funnelled through the shared
`_exclusive_gate` (single-flight across all synthesis), reproducing the
pre-W-PAR invariant byte-for-byte. W5 stays closed either way because `mixed`
(`engine_class="cloud"`) passes through the same admission path (per-class
semaphore when enabled, exclusive gate when explicitly disabled) instead of
bypassing admission via `ResourceClaim.none()`.

### 7.3b Parallel-cap toggle as a Studio setting — W-PAR task 007

The per-engine concurrency cap is no longer manifest-only. Two settings (in
`state.json` `settings`, surfaced via `GET /api/home` → `settings` and
`POST /api/settings`) let an operator adjust concurrency without editing a
plugin manifest, and a "Parallel Segment Rendering" toggle on the Settings
page (General → Core Synthesis Defaults) exposes the common on/off case
in-app (`frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx`) —
raising or lowering the cap is a Studio setting, never a program-level/env-var
concern for a running install:

| Setting | Type | Default | Notes |
|---|---|---|---|
| `tts_parallel_cap` | int | `2` (was `1` through 1.10.x) | Global cap applied to any engine without a more specific override. |
| `tts_engine_caps` | dict[str, int] | `{}` | Per-`engine_id` cap overrides; takes precedence over `tts_parallel_cap` for that engine. |

Both settings fall back to the environment (`TTS_PARALLEL_CAP`,
`TTS_ENGINE_CAPS` as a JSON dict) when absent from the settings store — the
same settings-then-env precedence `policies.get_priority_mode` uses for
`api_priority_mode` / `TTS_API_PRIORITY`. As with that precedent, `state.json`
normalization always materializes a default value once it has run, so the env
var is a true fallback only before first normalization (fresh installs); an
operator raising the cap on a running Studio instance always goes through the
Settings API, not the env var.

`app/orchestration/scheduler/cap_settings.resolve_effective_cap(engine_id,
manifest_max)` is the single resolution function (INV-5 — no engine-ID
branching; `engine_id` is used only as a dict key):

```
requested_cap   = tts_engine_caps.get(engine_id, tts_parallel_cap)
effective_cap   = min(requested_cap, manifest_max)
```

The manifest's `behavior.max_concurrent_workers` is always the ceiling — a
Studio setting can only **lower** the effective cap, never raise it above what
the plugin author declared safe.

**Updated 2026-07-11 (W-PAR task 014, §7.3c below):** `_manifest_resource_claim`
(synthesis.py) no longer bakes `resolve_effective_cap`'s result into
`ResourceClaim.cap` — `cap` (and the new `manifest_max` field, same value) is
now purely the manifest ceiling. `resolve_effective_cap` is instead called
fresh, on every admission attempt, inside `reserve_task_resources` — see
§7.3c for why this split exists and what it fixes.

**Default raised to `tts_parallel_cap=2` (2026-07-05, superseding the 007
"ships dark" default of 1).** Parallel rendering is the shipped default now —
sequential is just the `cap=1` case of the same code path (still explicitly
reachable via the Settings toggle above, or `{"tts_parallel_cap": 1}`), not a
separately maintained mode. `effective_cap` for any given engine is still
`min(requested, manifest_max)`, so engines whose manifest declares a lower
ceiling (Voxtral, Mixed — both `max_concurrent_workers: 1`) stay sequential
regardless of this default. As of 1.12.1, XTTS's manifest ceiling is 8 (not
2), so `requested` — the user's own `tts_parallel_cap`/`tts_engine_caps`
setting — is the practical, user-explorable limit for XTTS up to the global
backstop. INV-1's narrower guarantee — that explicitly setting
`tts_parallel_cap=1` reproduces pre-007 single-stream behavior byte-for-byte —
is unchanged and still enforced by the cap=1 parity tests; only the *shipped
default value* changed, not that contract. **Superseded 2026-07-11 (§7.3c):**
"next job submission" undersold what actually happens after W-PAR task 014 —
a setting change now reaches *already-queued and already-running* work too,
not just newly-submitted tasks.

### 7.3c Live cap admission — settings changes reach already-queued work (W-PAR task 014)

Before this task, the sentence just above was the whole story: each
`SynthesisTask.__init__` re-resolved `resolve_effective_cap` once, into
`ResourceClaim.cap`, at construction time. That meant a setting change was
only visible to *tasks constructed after* the change — anything already
queued or already fanned out into chapter-segment children kept whatever
effective cap was baked in when it was built, until the process restarted.

**The fix separates two concerns that used to be conflated in one field:**

- `ResourceClaim.cap` (and a new `ResourceClaim.manifest_max` field, carrying
  the same value) is now purely the **structural ceiling** — the manifest's
  `behavior.max_concurrent_workers`. This is the only value `ensure_min_cap`
  (§7.4a) ever sees; the class/per-engine-id semaphores are grown to it and
  nothing else, exactly as before.
- `EngineClassSemaphore.try_acquire(task_id, limit=None)` gained the optional
  `limit` parameter — the **live limit**, resolved fresh by
  `reserve_task_resources` via `resolve_effective_cap(engine_id,
  manifest_max)` on *every single call*, never cached. The admission
  threshold for that call is `min(structural_cap, limit)` — a live limit can
  only narrow admission for that attempt, never widen it past the manifest
  ceiling.

**Why already-queued work is reached without a restart:** both the
orchestrator's top-level `submit()` (§7.1's ~1s retry loop on denial) and
per-child segment dispatch (`SegmentSynthesisTask.run()`, its own ~0.5s retry
loop — confirmed this session to reserve **individually per child**, not via
one shared parent-level reservation) re-enter `reserve_task_resources` with
the *same* claim on every retry while denied. Because the live limit is now
resolved fresh each time rather than read once from a frozen claim, a
settings write becomes visible to every currently-waiting task within one
retry cycle — no restart, and (since `release_task_resources` was already
unconditional and remains so) a shrink never evicts an in-flight task, it
only blocks the next admission until the active count drops below the new
limit.

**New API:** `GET /api/engines/concurrency` (global cap + per-engine
`engine_class`/`manifest_max`/`requested_cap`/`effective_cap`/`active_count`
snapshot) and `PUT /api/engines/{engine_id}/concurrency` (body
`{"cap": <int>|null}`, HTTP 422 on out-of-range rather than silent clamping)
in `app/api/routers/engines.py`. Writes go through
`app.db.state_settings.set_engine_cap` — a single-key read-merge-write under
the settings lock, so two concurrent writes to *different* engines' overrides
can no longer clobber each other (the prior only path, a whole-object
`update_settings({"tts_engine_caps": {...}})`, replaced the entire map).

### 7.4 Admission order

1. Pause gate checked first.
2. Legacy fallback: if `engine_class` is set and `ENGINE_CLASS_ADMISSION` is
   explicitly disabled (§7.3a), route through the shared exclusive gate and
   return.
3. Global cap backstop checked (when `engine_class` is claimed and the gate
   is enabled — the default).
4. Per-engine-class semaphore checked (acquire one of N slots).
5. Per-engine-id semaphore checked (§7.4a), only when the claim declares
   `engine_id` — acquired *in addition to* step 4, never instead of it.
   — Legacy path (no `engine_class`): exclusive gate, then GPU gate.

### 7.4a Per-engine-id admission ceiling — W-PAR task 007 (folded-in Fable finding)

The class-level semaphore (§7.2) is keyed by `engine_class` (e.g. `"gpu"`,
`"cloud"`), and its capacity is **grow-only** (`ensure_min_cap`, fixed in
commit `7dd218aa`): once any caller requests a larger cap for that class, the
shared semaphore permanently grows to that size. This means two *different*
`engine_id`s that both resolve to the same `engine_class` (e.g. two future
GPU-class plugins) would share one semaphore sized to whichever cap was
requested **largest** — an engine declaring `max_concurrent_workers=1` could
be admitted for a second concurrent task purely because a co-resident
same-class engine asked for a larger cap first. **Not live today** (only XTTS
resolves to `"gpu"`; Voxtral and mixed resolve to `"cloud"`, both at cap=1),
but a real latent bug for the next GPU-class or `cpu_heavy`-class plugin.

Fix: `get_engine_id_semaphore(engine_id, cap)` is an **independent** registry
keyed by the concrete `engine_id`, checked *alongside* (never instead of) the
class-level gate. A claim only opts in by declaring `engine_id` in
`resource_claims` — claims that omit it (any caller predating task 007) are
governed by the class gate alone, so this is purely additive: it can only
make admission **more** restrictive for opted-in callers, never less
restrictive, and changes nothing for callers that don't declare `engine_id`.
`reserve_task_resources`/`release_task_resources` acquire/release both gates
symmetrically; a per-engine-id denial releases the class-level slot it just
acquired (and the global cap slot) before returning `admitted=False`.

`EngineClassSemaphore` also hard-pins the `"exclusive"` class: constructing
or growing (`ensure_min_cap`) a semaphore for `class_name="exclusive"` above
cap=1 raises `ValueError`. Today only `ResourceClaim.exclusive_claim()` ever
requests this class (always at cap=1) — this was safe by accident; the guard
makes it an enforced contract.

### 7.5 `ResourceClaim` fields (W-PAR additions)

| Field | Type | Default | Notes |
|---|---|---|---|
| `gpu` | bool | false | GPU resource needed |
| `vram_mb` | int | 0 | Estimated VRAM usage |
| `cpu_heavy` | bool | false | Sustained heavy CPU |
| `exclusive` | bool | false | Legacy single-flight flag |
| `engine_class` | str | `""` | Semaphore key; derived from manifest resource block |
| `cap` | int | 1 | Semaphore capacity; from `resolve_effective_cap(engine_id, manifest_max)` (§7.3b) |
| `engine_id` | str | `""` | Task 007: opts the claim into the per-engine-id ceiling (§7.4a); dict key only, no behavioral branch (INV-5) |

### 7.6 `ResourceClaim` factories

| Factory | GPU | engine_class | Notes |
|---|---|---|---|
| `ResourceClaim.none()` | false | `""` | CPU-only tasks; no semaphore |
| `ResourceClaim.exclusive_claim()` | false | `"exclusive"` | Single-flight (cap=1); rejects growth above 1 (§7.4a) |
| `ResourceClaim.gpu_heavy(vram_mb=4000)` | true | `"gpu"` | Default VRAM 4000 MB |
| `ResourceClaim.from_engine_manifest(manifest)` | from manifest | from manifest | |

`SynthesisTask.__init__` calls `_manifest_resource_claim(engine_id)` which
reads the engine manifest, resolves the engine class via
`resolve_effective_cap` (§7.3b), and returns a `ResourceClaim` with
`engine_class` and `engine_id` set. No `if engine_id == "mixed"` branch
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
