# Task 002 — Parent/child segment scheduling

**Workstream:** W-PAR  ·  **Depends on:** 001  ·  **Blocks:** 003, 005, 006  ·  **Status:** Not started

> Read [`../01-map.md`](../01-map.md) (Parts **C**, **F** connections; invariants **INV-4**, **INV-5**)
> and [`../00-overview.md`](../00-overview.md) before starting. Task 001 (semaphores) MUST be merged
> first — this task dispatches child segments under those semaphore slots. The R-A keystone refactor
> (per-segment dispatch isolation) is task 003; this task only establishes the fan-out structure.

## Goal

Make a chapter render a **parent job** that fans out individual **child segment units** admitted under
the per-engine counting semaphores from task 001, replacing the current single synchronous chapter
render. The parent job is the only externally-visible unit: one job per chapter in the UI/recovery
layer (INV-4). Children carry a `parent_task_id`; the parent aggregates their progress and
completion. With `max_concurrent_workers=1` (default), children run serially — byte-identical to
today (INV-1). With cap ≥ 2, multiple children of the same engine class run concurrently.

## Why it matters

Today a chapter render is one synchronous blocking task: the orchestrator holds a single thread for
the entire render (mixed handler loops groups sequentially; standard XTTS sends the whole chapter in
one bridge call). There is no structure for the scheduler to admit multiple segments of different
engine classes simultaneously. The parent/child model is the structural prerequisite for everything
downstream: per-segment dispatch isolation (003), correctness invariants (005), and frontend
multi-active (006) all depend on the scheduler seeing discrete segment units it can admit/reject
under per-engine caps.

## Files to touch

| File | Current anchor (file:line) | Change |
|------|---------------------------|--------|
| `app/orchestration/scheduler/orchestrator.py` | `submit()` at top of class (≈ line 60+); `_dispatch_loop` / `_run_task` pattern; entire chapter render executes in one blocking thread | Add `_fan_out_chapter(parent_task, context)` method: decompose the chapter task into child segment units, dispatch each into the bounded thread pool, admit under 001's semaphores. Parent thread aggregates child futures for progress/completion. |
| `app/orchestration/tasks/synthesis.py` | `SynthesisTask` (single class, handles both chapter and per-segment concerns); `ResourceClaim` at line 88–90 | Split into `ChapterSynthesisTask` (parent — owns fan-out, aggregation, durable status) and `SegmentSynthesisTask` (child — owns one chunk group's bridge call, admitted under per-engine semaphore). `SegmentSynthesisTask` carries `parent_task_id`. |
| `app/domain/chunk_groups.py` | `build_chunk_groups` at line 41 — already produces per-segment work-list tagged with `engine`, `profile_name`, `segments`, `text_parts` | Reuse as the fan-out source: call once in the parent, iterate groups to construct child `SegmentSynthesisTask` instances. No change to this file required; document the reuse. |
| `plugins/tts_mixed/handler.py` | `handle_mixed_job` group loop at line 289+; sequential `_render_segment` calls | The parent/child model makes the mixed handler's sequential group loop redundant for parallelism. In this task: route the mixed handler's groups through the same `_fan_out_chapter` dispatcher (standard XTTS chapters will follow in 003). The mixed handler becomes a thin adapter that emits groups; the orchestrator owns concurrency. |
| `app/orchestration/scheduler/recovery.py` | `load_recoverable_task_contexts` — dedupes by `chapter_id`; restores one task per chapter | Must stay one durable job per chapter (INV-4). Children are transient (in-memory only); only the parent chapter job is persisted and recovered. Verify the dedup logic still holds after the split; add an assertion test. |
| `app/orchestration/progress/service.py` | Progress publication (broadcasts per-job updates) | Parent aggregates child progress fractions (weighted by segment count) and publishes chapter-level progress. Children publish segment-level markers; parent collects. Segment-level `active_seg_id` tracking moves into children. |

### Design note — standard XTTS unification

Standard XTTS currently sends the whole chapter in one bridge call (no group loop). Routing it
through `_fan_out_chapter` per chunk-group (like mixed already does) is the correct unification —
each chunk group becomes a child regardless of engine. This task introduces the structure; task 003
isolates the per-segment `_dispatch` state so children run safely in parallel. A small-model
executor can defer the XTTS unification into task 003 if it is cleaner — document the decision in
the task commit message.

## Target shape / contract

- `ChapterSynthesisTask` (parent):
  - Persisted to DB as the one job per chapter (INV-4). Has `task_id`, `chapter_id`, durable
    `status` that never regresses.
  - On `run()`: calls `build_chunk_groups(...)` to get the group list, constructs one
    `SegmentSynthesisTask` per group, submits each to a bounded `ThreadPoolExecutor` (pool size
    bounded by `MAX_GLOBAL_CONCURRENT_SYNTHESIS` from settings).
  - Waits for all children via `Future.result()` with cancellation awareness.
  - Aggregates child progress: `parent_progress = sum(child.completed_segments) / total_segments`.
  - Publishes chapter-level progress via the progress service (≥1% advancement gating from INV-1 in
    `backend-progress.md`).
  - On cancel: sets a shared `threading.Event` stop signal; each child checks it before/during its
    bridge call; parent joins all futures before terminal write (INV-7).

- `SegmentSynthesisTask` (child):
  - Not persisted to DB; in-memory only. Carries `parent_task_id`, `group` (one chunk group dict
    from `build_chunk_groups`), `engine_class`, `semaphore_cap`.
  - Admitted to its engine-class semaphore (from task 001) before the bridge call.
  - On `run()`: acquires semaphore slot → calls bridge → releases slot.
  - Returns `TaskResult` to the parent future. Parent checks for errors/cancellation.

- `recovery.py`: `load_recoverable_task_contexts` still dedupes by `chapter_id`. Children are never
  in the DB, so dedup is unaffected. Add an assertion: after fan-out, exactly one job per chapter
  exists in the DB.

- `build_chunk_groups(...)` is called once per chapter in the parent (no changes to that function).
  Group list order is manuscript order — stitch order is preserved (INV-2, enforced in task 005).

- With `max_concurrent_workers=1` (default): the semaphore admits one child at a time → serial
  execution of groups → byte-identical to today (INV-1). The only structural change is the fan-out
  scaffolding.

## Steps (ordered)

1. **Write the failing tests first** (see Tests section). Confirm red on current code.
2. Create `SegmentSynthesisTask` in `app/orchestration/tasks/synthesis.py` (or a new
   `app/orchestration/tasks/segment_synthesis.py` — keep files under 500 lines per CLAUDE.md).
   Give it `parent_task_id`, `group`, `engine_class` fields; implement `validate()`, `run()` (stub
   that calls the bridge for this group), `cancel_flag` check.
3. Refactor `SynthesisTask` (rename to `ChapterSynthesisTask` or keep the name for compatibility;
   check all import sites). Add `_fan_out_chapter(ctx, groups) -> list[Future]` method using
   `concurrent.futures.ThreadPoolExecutor`.
4. In `_fan_out_chapter`: iterate `build_chunk_groups(segments, profile)` groups, construct a
   `SegmentSynthesisTask` per group, submit to pool. Each child acquires its engine-class semaphore
   slot (via `reserve_task_resources` from task 001) before its bridge call.
5. Implement parent progress aggregation: as each child future completes, update chapter-level
   progress (weighted sum). Broadcast via progress service at ≥1% thresholds.
6. Wire cancel: parent `cancel()` sets a shared `threading.Event`; children poll it. Parent calls
   `future.cancel()` for not-yet-started children; joins running futures with a timeout.
7. For the mixed handler (`plugins/tts_mixed/handler.py`): route groups through `_fan_out_chapter`
   instead of the sequential loop. The handler becomes a group-list provider; the orchestrator owns
   concurrency.
8. In `recovery.py`: verify `load_recoverable_task_contexts` still dedupes by `chapter_id` and
   returns exactly one task per chapter (children are ephemeral). Add a guard assertion.
9. Revert-check (R1): stash the fan-out changes, run the serial-equivalence test and the one-job-
   per-chapter test, confirm red, restore.
10. Do NOT touch per-segment `_dispatch` timing/marker state isolation yet — that is task 003 (R-A).
    With cap=1 the serial order means shared state is not yet a problem.

## Tests (TDD — write first)

Write these before implementing. Confirm each is red on current code (R1 revert-check).

**File:** `tests/orchestration/test_parent_child_scheduling.py` (new)

- **`test_chapter_fans_correct_child_count`** — Construct a `ChapterSynthesisTask` for a chapter
  with 3 chunk groups (build a minimal `script` / segment list; use the real `build_chunk_groups`).
  After `run()` completes (with mock bridge calls that return immediately), assert exactly 3 child
  `SegmentSynthesisTask` instances were constructed and submitted. **Red on current code** (fan-out
  doesn't exist).
- **`test_cap1_children_run_serially`** — With `max_concurrent_workers=1` on the engine-class
  semaphore, assert that child completions arrive in sequential order (child N+1 starts only after
  child N's semaphore slot is released). Sequence with a `threading.Barrier` or mock semaphore.
  **Pins INV-1.** Red on current code.
- **`test_cap2_children_run_concurrently`** — With cap=2 and 3 children, assert that at least 2
  children have their bridge call active simultaneously (use a `threading.Event` latch in the mock
  bridge). The 3rd waits. Red on current code.
- **`test_parent_progress_aggregation`** — With 4 children completing in sequence, assert
  chapter-level progress increments by ≈25% per completion and reaches 1.0 at the end. Progress
  service calls captured with a mock; assert ≥1% gating (no sub-1% broadcasts). Red on current code.
- **`test_recovery_sees_one_job_per_chapter`** — After fan-out of a chapter with 5 groups, assert
  the DB contains exactly one job with `chapter_id=X`. Children must not be persisted. Red on
  current code (no child tasks in DB to violate this, but the assertion itself is new).
- **`test_cancel_stops_all_children`** — Start a chapter fan-out with 4 children whose bridge calls
  block on a latch. Call `parent.cancel()`. Assert the stop signal is set and all in-flight children
  exit before the parent returns. Assert no `SEGMENT_SAVED` writes after cancel. **INV-7.** Red on
  current code.

**Constraints (R2, R4):** mock only the bridge (`VoiceBridge.synthesize`) and DB writers
(`update_job`, `update_segment`). Do not mock the orchestrator or `build_chunk_groups` (they are
not the unit under test). No `sleep` waits — use `threading.Event` / `Future` completion.

**Commands:**
```
./venv/bin/python -m pytest tests/orchestration/test_parent_child_scheduling.py -q
./venv/bin/python -m pytest tests/orchestration -q -k "parent or child or fan_out or cap"
ruff check app/orchestration/scheduler/orchestrator.py app/orchestration/tasks/
```

## Acceptance criteria

- [ ] A chapter render fans N child `SegmentSynthesisTask` units (one per chunk group from
      `build_chunk_groups`).
- [ ] With `max_concurrent_workers=1` (default): children run serially — behavior is byte-identical
      to today (INV-1). Full existing test suite passes unchanged.
- [ ] With `max_concurrent_workers=N` (N ≥ 2): N children of the same engine class run
      concurrently; the N+1th waits for a slot.
- [ ] Parent progress aggregation is correct: chapter progress = completed children / total children
      (weighted by segment count); only broadcasts at ≥1% advancement.
- [ ] `recovery.py` still dedupes by `chapter_id`; exactly one job per chapter exists in the DB
      after fan-out (INV-4). Children are ephemeral.
- [ ] Cancel: stop signal set → all in-flight children exit → no orphan WAVs or straggler writes
      (INV-7).
- [ ] No engine-ID branching added in orchestrator or task code (INV-5). Engine-class is derived
      from manifest resource block.
- [ ] All new tests pass; R1 revert-check confirmed for serial-equivalence and one-job-per-chapter
      tests.

## Map links

- `../01-map.md` Part **C** (parent/child scheduling); connections **C ↔ F** (recovery/cancel/stitch
  share the same parent/child model — must not diverge); **A → B → C** (cap flows manifest →
  semaphore → admission).
- Risk **R-C** (`state.json` write contention under N concurrent writers) — mitigated by routing
  per-segment status writes to SQLite `segments` table (WAL); `state.json` only at chapter
  granularity. Implement this routing in this task or flag explicitly for task 005.
- Invariants: **INV-1** (ships dark), **INV-4** (one job per chapter), **INV-5** (no engine-ID
  branching), **INV-7** (cancel safety).

## Out of scope

- Per-segment dispatch state isolation (timing/marker state, the R-A keystone) → **task 003**. With
  cap=1 default, shared state is safe; do not isolate it here.
- Stitch-order barrier (WAV assembly in manuscript order) → **task 005**. Fan-out produces unordered
  completions; 005 adds the stitch barrier.
- Stuck-segment heartbeat and recovery K-of-N → **task 005**.
- Frontend `active_segments_map` threading → **task 006** (depends on 003 emitting multi-active
  signals).
- ETA under parallelism → **task 007**.
- TTS-server warm-worker semaphore / `run_in_threadpool` → **task 004** (independent of this task;
  runs in parallel with 002/003 per the dependency graph).
