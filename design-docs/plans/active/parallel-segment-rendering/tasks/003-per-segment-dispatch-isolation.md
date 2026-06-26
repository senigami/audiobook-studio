# Task 003 — Per-segment dispatch isolation (keystone)

**Workstream:** W-PAR  ·  **Depends on:** 002  ·  **Blocks:** 005, 006  ·  **Status:** Not started

> Read [`../01-map.md`](../01-map.md) (Part **D**, invariants **INV-4**, **INV-6**, risk **R-A**) and
> [`../00-overview.md`](../00-overview.md) (§Scope item 4) before starting. This is the keystone
> refactor (R-A): until per-segment state is isolated, tasks 005 (correctness invariants) and 006
> (frontend multi-active) cannot be built correctly.

## Goal

Give each concurrently-dispatched segment its **own** isolated timing/marker state. The parent chapter
job owns only fan-out coordination and aggregation. Ensure the progress/marker layer emits
**per-segment identity** on every concurrent event so downstream consumers (including 006's
`active_segments_map`) can distinguish segments unambiguously.

> **Forward note for 006 (captured 2026-06-26).** The `active_segments_map` entries this task emits
> must carry the full **per-segment lifecycle phase**, not just a progress number — specifically the
> **preparing / model-load phase** (`indeterminate`/`LOADING_MODEL`), generalizing the W-MIX-LA
> single-segment load attribution to per-segment map entries. 006's frontend renders each segment's
> preparing pulse *before* it renders progress, so a per-segment entry shaped only as `{progress}`
> would drop the parallel preparing state. Emit `{phase: 'preparing'|'rendering'|'done', progress,
> eta_seconds, reason_code?, indeterminate?}` per active segment. See the "Architecture decision"
> section in [tasks/006](006-frontend-multi-active.md) for the full rationale (normalized segment-keyed
> store + per-segment selectors; per-component socket listeners explicitly rejected).

## Why it matters

Today `app/orchestration/scheduler/orchestrator_helpers.py` holds a single `_dispatch` method (L88)
whose closure captures **one set of shared mutable timing/marker scalars**:

- `timing` dict (L92) — render start, engine activity, wall duration, model load, etc.
- `segment_starts` (L104) — map of `sid → float` start timestamp
- `segment_load_observed` (L106) — set of segment IDs that saw a load event
- `marker_state` (L107) — `start_synthesis_emitted`, `start_segment_ids`, etc.
- `pending_engine_activity` (L111) — started_at, activity_after_start_segment flag

These variables were designed for **one sequential render at a time** — a single chapter processes
one segment at a time. When two concurrent child segments share this state (as task 002's parent/child
fan-out enables), their events interleave and corrupt each other:

- A `[START_SEGMENT]` from segment B resets marker state that segment A's listener still depends on.
- `segment_starts[sid]` entries from concurrent segments overwrite each other's timing clocks.
- `pending_engine_activity` is a scalar region — two concurrent engine-load events produce
  one winner and one silently dropped load window.
- `segment_load_observed` is a shared set — a load seen for segment B marks segment A as
  "load observed", suppressing the fallback timing path for A (L1158).

This is **INV-6** (per-segment state isolation) and the root of **R-A** (keystone risk). The bug is
latent today; it becomes critical the moment cap ≥ 2.

Additionally, the progress/marker events emitted inside `log_listener` must carry the dispatching
segment's identity so 006's frontend `active_segments_map` can key on `segment_id`, not infer it
from position (feeds INV-4 — one canonical job; children are internal but must be distinguishable
in the event stream).

## Design options

### Option (a) — Recommended: extract `_dispatch_segment()` with its own isolated closure state

Extract a `_dispatch_segment(*, segment_id, script_entry, context, parent_timing_aggregator)` function
(or method on a `SegmentDispatch` dataclass). Each concurrent segment instantiates **its own local
copies** of `timing`, `segment_starts`, `marker_state`, `segment_load_observed`, and
`pending_engine_activity`. The parent chapter job:

1. Fans out one `_dispatch_segment` call per child unit (bounded by 001's semaphore).
2. Aggregates results: collects per-segment timing dicts, stitches them into the chapter-level
   performance record, accumulates `active_segments_map` from per-segment events.

**Why this is correct:** state isolation is guaranteed by Python closure scope — no shared dict to key
by `segment_id`. The per-segment function is independently testable. It also unlocks the natural
model for 005's stitch barrier (each child returns a `TaskResult`; parent joins all and stitches in
DB order).

**Cost:** substantial refactor of the most complex orchestration file (~1400 lines). The `log_listener`
closure (which captures all the shared state at L587+) needs to become part of the per-segment
function's scope. The existing single-segment path (cap=1) becomes the same code path with N=1 —
no separate branch.

### Option (b) — Interim: key all per-segment state by `segment_id` (maps instead of scalars)

Keep the single chapter-level `log_listener` but convert every mutable scalar/set into a
`dict[segment_id, ...]`:

- `timing` → `timings: dict[str, dict]`, keyed by `segment_id`
- `segment_load_observed` stays a set (already keyed by sid)
- `marker_state` → `marker_states: dict[str, dict]`, keyed by `segment_id`
- `pending_engine_activity` → `pending_engine_activities: dict[str, dict]`, keyed by `segment_id`

Every access in the ~800 lines of `log_listener` body switches from `timing["x"]` to
`timings[active_seg_id]["x"]` with a `setdefault` initialization on first sight of each sid.

**Why this is acceptable as a smaller first step:** no restructuring of the `_dispatch` method shape;
the listener boundary stays the same; existing tests break less. The isolation guarantee holds as long
as `active_seg_id` is correctly set per concurrent invocation (which 002's child dispatch structure
ensures).

**Why option (a) is better long-term:** (b) still has one listener instance per chapter — concurrent
log lines from two concurrent segments must be serialized through one listener. With async/threadpool
child dispatches, synchronization must be explicit. (a) eliminates the problem by construction.

**Recommendation:** implement (a). If scope proves too large in a single slice, land (b) first as
an interim (flagged in the PR), then follow immediately with (a) in the same milestone.

## Files to touch

| File | Current anchor (file:line) | Change |
|------|---------------------------|--------|
| `app/orchestration/scheduler/orchestrator_helpers.py` | `_dispatch` method L88; `timing` L92; `segment_starts` L104; `segment_load_observed` L106; `marker_state` L107; `pending_engine_activity` L111; `log_listener` closure L587+ | Extract per-segment state into an isolated `_dispatch_segment()` scope (option a) or key all mutable dicts by `segment_id` (option b). Ensure every event emitted from the listener carries `segment_id` in its payload. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `_close_pending_engine_activity_interval` (L624), `run_job` inner loop, `_match_timing_marker_with_job_fallback` (L587) | These nested helpers capture the shared closure state — move them inside the per-segment scope (option a) or thread the correct keyed dict through (option b). |
| `app/orchestration/scheduler/orchestrator.py` | `submit` / chapter job fan-out (added by task 002) | Accept per-segment `TaskResult` returns from `_dispatch_segment`; aggregate into chapter-level timing and `active_segments_map`. |
| `app/orchestration/progress/` (broadcasting helpers) | Events emitted from `log_listener` that currently carry a single `active_seg_id` | Confirm every progress event carries `segment_id` explicitly; the parent aggregator builds `active_segments_map: dict[str, float]` (segment_id → progress 0–1) from the stream. |

## Target shape / contract

- With cap=1: behavior is **byte-identical to today**. The per-segment dispatch path with N=1 must
  produce the same timing dict, the same progress events, and the same durable chapter status as the
  current single-stream `_dispatch`. This is the regression gate.
- With cap≥2: two concurrent segments each hold **independent** timing/marker/load state. One
  segment reaching `[ENGINE_ACTIVITY_STARTED]` does not affect the other's `pending_engine_activity`.
  One segment's `[SEGMENT_SAVED]` does not advance the other's marker state.
- Every progress/marker event from a concurrent child carries a `segment_id` field that is the
  segment's own id (not inferred from position). This field is what 006 extracts into
  `active_segments_map`.
- The parent job aggregates `active_segments_map: dict[segment_id, progress_fraction]` from live
  per-segment events and emits it on the chapter-level progress broadcast.
- **INV-4:** the parent chapter job remains the sole UI/recovery-visible unit; child segment state is
  internal to the fan-out.
- **INV-6:** no shared mutable timing/marker dict or scalar between concurrent segments.
- **INV-5:** no `if engine_id == "xtts"` branching introduced; isolation is structural.

## Steps (ordered)

1. **Write the failing tests first** (see Tests section). Confirm both are red on current code.
2. Decide option (a) vs (b): if task 002's child dispatch model is straightforward to thread
   through, prefer (a). If 002 is still in-flight, (b) is the safe interim.
3. **(Option a path)** Extract `_dispatch_segment(*, segment_id, script_entry, context, on_progress)`:
   - Move `timing`, `segment_starts`, `segment_load_observed`, `marker_state`,
     `pending_engine_activity` into the function's local scope.
   - Move all nested helpers (`_close_pending_engine_activity_interval`, `_active_segment_is_announced_and_unconfirmed`, etc.) inside `_dispatch_segment` or pass them as closures over the local state.
   - `_dispatch_segment` returns a `SegmentResult` (timing dict + artifact path + status).
   - The parent `_dispatch` becomes a thin fan-out loop: acquire semaphore → launch
     `_dispatch_segment` per child → join all → aggregate.
3. **(Option b path)** In the existing `_dispatch` / `log_listener`:
   - Replace `timing` with `timings: dict[str, dict]` (init on first `active_seg_id` sight).
   - Replace `marker_state` with `marker_states: dict[str, dict]`.
   - Replace `pending_engine_activity` with `pending_engine_activities: dict[str, dict]`.
   - All reads/writes route through `active_seg_id[0]` key with `setdefault` initialization.
   - `segment_load_observed` already uses `sid` as key — no change needed.
   - Add `segment_id` to every emitted progress event.
4. In the parent aggregation path, build `active_segments_map` from per-segment progress callbacks
   and emit it as a chapter-level broadcast field.
5. Revert-check (R1): stash the isolation fix; run the two-concurrent-segments test; confirm
   cross-contamination is detectable (red). Restore fix; confirm green.
6. Verify cap=1 regression: run the full existing synthesis/orchestration test suite; no failures.
7. Update specs: `design-docs/specs/live-events.md` (add `segment_id` to per-segment progress
   event contract; bump `spec_version` + changelog row); `design-docs/specs/queue-jobs.md`
   (note parent/child model; child segment events carry `segment_id`).

## Tests (TDD — write first)

All tests go in `tests/orchestration/test_dispatch_isolation.py` (new file).

### Test 1 — Two concurrent segments do not cross-contaminate (primary, R1 revert-check)

Drive two simulated `_dispatch_segment` invocations (or two `log_listener` calls if option b)
concurrently using `threading.Thread` with interleaved log lines:

- Segment A: feed `[ENGINE_ACTIVITY_STARTED]` → later `[START_SEGMENT] A` → `[SEGMENT_SAVED] A`
- Segment B (interleaved): feed `[ENGINE_ACTIVITY_STARTED]` → `[START_SEGMENT] B` → `[SEGMENT_SAVED] B`
- Assert: `timing_A["engine_activity_started_at"]` is non-None AND independent of B's value.
- Assert: `timing_B["engine_activity_started_at"]` is non-None AND independent of A's value.
- Assert: `segment_load_observed` for A does not contain B's sid, and vice versa.
- Assert: `marker_state_A["start_segment_ids"]` contains only A's id; same for B.
- **R1 revert-check:** stash the isolation change; run this test; confirm it fails (A and B share state
  and cross-contaminate). Restore; confirm green.

### Test 2 — `active_segments_map` carries both segment IDs

Set up a two-segment concurrent chapter dispatch and capture all progress broadcast calls.
Assert that at least one broadcast carries `active_segments_map` with both segment IDs as keys,
each with a progress value in [0.0, 1.0].

### Test 3 — cap=1 regression (golden path)

Run a single-segment dispatch through the refactored path. Assert the emitted timing dict,
durable status, and progress events match the pre-refactor baseline (snapshot from current test
suite). This is the ship-dark gate — any regression here is a blocker.

### Mock boundaries (R2)

- Mock: `broadcast_tts_log_line`, `update_job`, `update_segments_bulk`, the TTS bridge call
  (return a synthetic `TaskResult` with a fake artifact path).
- Do NOT mock: `orchestrator_helpers` itself, the `timing`/`marker_state` dicts, any
  `app.orchestration.progress` math — those are the units under test.

### Timing (R4)

- Feed log lines synchronously into the listener (no `sleep`).
- Use `threading.Event` for inter-thread synchronization in the concurrency test (not `sleep`).
- Use vitest fake timers / explicit `time.monotonic` patching if wall-clock values matter.

**Commands:**
```
./venv/bin/python -m pytest tests/orchestration/test_dispatch_isolation.py -q
./venv/bin/python -m pytest tests/orchestration/ -q  # regression suite
ruff check app/orchestration/scheduler/orchestrator_helpers.py app/orchestration/scheduler/orchestrator.py
```

## Acceptance criteria

- [ ] Two concurrent segments each maintain completely independent `timing`, `marker_state`,
      `pending_engine_activity`, and `segment_load_observed` state — no cross-talk under interleaved
      log lines (INV-6).
- [ ] Every progress/marker event emitted by a concurrent child carries its own `segment_id`
      explicitly (not inferred from position).
- [ ] The parent chapter job aggregates a `active_segments_map: dict[segment_id, progress]` from
      the per-segment stream and emits it on chapter-level broadcasts (feeds task 006).
- [ ] With cap=1: behavior is byte-identical to today — same timing dict shape, same durable status
      transitions, same progress event sequence (INV-1).
- [ ] R1 revert-check passes: the two-concurrent-segments isolation test is demonstrably red on
      pre-isolation code (cross-contamination is real, not hypothetical).
- [ ] No `if engine_id == "xtts"` or similar engine-ID branches introduced (INV-5).
- [ ] The parent chapter job remains the sole UI/recovery-visible unit; child state is internal
      (INV-4).
- [ ] `design-docs/specs/live-events.md` updated: `segment_id` in per-segment events; version bump +
      changelog row.
- [ ] `design-docs/specs/queue-jobs.md` updated: parent/child model noted; version bump + changelog.
- [ ] `ruff check` clean; no new lines-over-600 (refactor along existing boundaries per
      `modular_architecture.md`).

## Map links

- `01-map.md` Part **D** (per-segment dispatch isolation — keystone refactor);
  invariants **INV-4** (monotonic durable status, one job per chapter),
  **INV-5** (no engine-ID branching), **INV-6** (per-segment state isolation);
  risk **R-A** (the `_dispatch` single-stream closure).
- Feeds: **005** (correctness invariants — stitch barrier, cancel/recovery depend on per-segment
  `TaskResult` returns from isolated dispatch); **006** (frontend multi-active — needs
  `active_segments_map` with `segment_id` keys).
- Connection **D → progress service → G** (`01-map.md` §Connections): per-segment markers from
  concurrent children → multi-active progress payload → frontend overlay (same two-layer path W4
  fixed).

## Out of scope

- Stitch-order barrier, cancel signal/join, recovery K-of-N → **task 005**.
- Frontend `active_segments_map` extraction → whitelist → merge → store → hook → ScriptView →
  **task 006**.
- ETA throughput/bottleneck model under parallelism → **task 007**.
- TTS-server warm-worker semaphore / lazy spawn → **task 004** (parallel-safe with this task).
- Per-engine cap declaration and scheduler semaphores → **task 001** (prerequisite, already done
  before this task starts via 002).
