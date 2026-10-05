# Task 005 — Correctness invariants under parallelism

**Workstream:** W-PAR  ·  **Depends on:** 002, 003  ·  **Blocks:** 007  ·  **Status:** Done (2026-07-03)

> **Scope note (2026-07-03):** `orchestrator.py`'s `submit()`/`recover()`/`cancel()` do not
> reference the `ChapterSynthesisTask`/`SegmentSynthesisTask` parent/child model at all — it is
> fully built and unit-tested (002/003) but not wired into the live dispatch path (that wiring is
> task 008's job). The invariants below were implemented against the code that is actually live
> (`plugins/tts_mixed/handler.py`) and actually concurrent (`ChapterSynthesisTask`'s
> `ThreadPoolExecutor` fan-out) rather than against `orchestrator.py:386`/`:240` literally, since
> those methods have no fan-out-aware code path yet to harden. The code-map changelog entry for this
> task has the full breakdown and what is explicitly deferred to 008.

> Read [`../01-map.md`](../01-map.md) (Part F, invariants **INV-2**, **INV-3**, **INV-4**, **INV-7**,
> **INV-8**, risk **R-C**) and [`../00-overview.md`](../00-overview.md) (Scope item 6) before starting.
> This task assumes 002 (parent/child scheduling) and 003 (per-segment dispatch isolation) have landed;
> without 003 the per-segment isolated timing state that this task validates does not exist.

## Goal

Make the parallel render **correct**. This is the highest-correctness-risk task in W-PAR — it covers
the six invariants and one risk that are most likely to produce silent data corruption, orphan
artifacts, or a hung render under concurrency. **TDD the invariants first**: write failing tests,
confirm each fails for the right reason on the pre-fix code, then implement.

## Why it matters

Tasks 002 and 003 give the scheduler the machinery to fan out child segment units and run them
concurrently. Without the correctness harness in this task:

- Segments that finish out of order produce a mis-stitched chapter WAV (INV-2) with no error surfaced.
- A segment marked done on subprocess exit code rather than a validated artifact (INV-3) creates a
  chapter that silently drops audio.
- A cancelled fan-out leaves orphan WAVs on disk and straggler `SEGMENT_SAVED` writes that corrupt the
  next run's recovery (INV-7).
- A restart after a partial render re-renders already-complete segments (waste) or skips unfinished
  ones (data loss) if recovery is not K-of-N-aware (INV-8).
- N concurrent `update_job` / `update_segments_bulk` calls against `state.json` under the full-file-
  rewrite model produce torn writes and corrupted state (R-C).
- A segment that silently hangs causes the overall chapter progress bar to stall with no observable
  signal (stuck-segment heartbeat gap).
- **Residual explicitly assigned by task 004 (dead-worker waiter hang).** `WarmWorkerManager._acquire_worker`
  (`plugins/tts_xtts/plugin/core/warm_worker.py:470-476`) blocks on `self._free_q.get()` when the pool is
  at cap and every pooled worker is busy. If a pooled worker **dies** without ever being returned to the
  free-list, a caller blocked on that `get()` hangs forever — there is no timeout by design (the
  in-code comment at that call site says "005 handles it holistically"). This is *dormant* under
  ships-dark (cap=1 + single-flight dispatch means no second acquirer ever blocks there) and becomes
  live the moment cap ≥ 2. This task must cover it: either the stuck-segment heartbeat (above) must be
  able to detect a segment stuck inside `_acquire_worker` (not just inside a running synthesis call),
  or the cancel-signal+join path must be able to unblock a waiter parked on `free_q.get()` when its
  segment is cancelled. Do not add an ad-hoc timeout at the `warm_worker.py` call site — the note there
  is explicit that 005 owns this holistically.

## Files to touch

| File | Current anchor | Change |
|------|----------------|--------|
| `plugins/tts_mixed/handler.py` | group loop, `stitch_segments`, `_group_needs_render` | Enforce stitch barrier (INV-2): call `stitch_segments` only after **all** child futures have produced validated artifacts; build the concatenation list in `DB segment order`, not completion order. Confirm `_group_needs_render` checks artifact validity (non-zero size, duration-sane) rather than raw file existence (INV-3). |
| `app/orchestration/scheduler/orchestrator.py` | cancel path (**`cancel(task_id)` — orchestrator.py:386**, not `cancel_job`; cooperative-cancel listener detach) | Cancel safety (INV-7): cancel sets a shared `threading.Event` stop signal, **signals all in-flight child futures** (via `Future.cancel()` + the stop event), then **joins every child thread/future** (`concurrent.futures.wait` with no timeout) before the terminal status write and resource release. Confirm the cooperative-cancel listener is detached after the join, not before (no straggler `SEGMENT_SAVED` writes can arrive post-join). |
| `app/orchestration/scheduler/orchestrator.py` + `recovery.py` | recovery entry (**`Orchestrator.recover()` — orchestrator.py:240**, not `recover_jobs`; `recovery.py` only exposes `load_recoverable_task_contexts`), chapter-level dedup (`dedup by chapter_id`) | Recovery K-of-N (INV-8): on restart, identify segments that already have validated artifacts (`_group_needs_render` returns False) and exclude them from the recovered fan-out. The parent chapter job is the single recovery-visible unit (INV-4); dedup must remain one-job-per-chapter. |
| `app/db/segments.py` + `app/db/state.py` | `update_segments_bulk` / **`update_job` (lives in `app/db/state_jobs.py:135`; `state.py` is a facade over it)**; full-file-rewrite path in `state.py` | Write contention (R-C): route per-segment status writes (`SEGMENT_SAVED`, segment progress) to the SQLite `segments` table (WAL mode; concurrent-safe under multiple writers). Reserve `state.json` writes for chapter-level status transitions only (not for every per-segment event). If `update_segments_bulk` already targets SQLite, confirm WAL is enabled and add a guard; if it still routes through `state.json`, redirect it. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | per-segment `_dispatch` closure; child timing state (post-003) | Stuck-segment heartbeat: add a `last_heartbeat: float` timestamp to each child's isolated timing state (set on every progress tick or marker event); a parent-side monitor thread (or the aggregation loop) compares `time.monotonic() - last_heartbeat` against a configurable stall threshold (default: `SEGMENT_STALL_TIMEOUT_SECONDS`, suggested 60 s). When exceeded, set a `stalled` flag on the segment entry (surfaced in the chapter-level progress payload as `stalled_segments`). Do **not** auto-kill the segment — flag only; the cancel path (INV-7) remains the kill surface. |

## Target shape / contract

- **Stitch barrier (INV-2):** `stitch_segments` is called exactly once per chapter, after
  `concurrent.futures.wait(all_child_futures, return_when=ALL_COMPLETED)`. The list passed to
  `stitch_segments` is ordered by `DB segment index` (`segment.order` or equivalent), never by
  future completion order.
- **Artifact-validated completion (INV-3):** a segment is "done" only when its output WAV exists,
  has `os.path.getsize > 0`, and its duration (read via soundfile / the existing WAV header check)
  falls within a sane range (>0 s, <`MAX_SEGMENT_DURATION_SECONDS`). `_group_needs_render` is the
  single gate; exit code is not sufficient.
- **Cancel safety (INV-7):** `cancel(task_id)` flow (orchestrator.py:386 — **not** `cancel_job`,
  which does not exist): (1) set shared stop event; (2) signal + cancel all
  child futures; (3) `concurrent.futures.wait(all_child_futures)` (join); (4) purge any orphan WAVs
  written by children that had already started before the signal; (5) detach cooperative listeners;
  (6) write terminal chapter status. No child writes can arrive after step 5.
- **Recovery K-of-N (INV-8):** after restart with K of N segments validated, the recovered job fans
  out only the N-K unfinished segments. Recovery dedup remains one-job-per-chapter (INV-4). The
  K already-done segments are reused as-is (not re-rendered).
- **Write contention (R-C):** per-segment status events write to `segments` SQLite table (WAL) only.
  `state.json` sees at most one write per chapter-level status transition (not per segment). Under N
  concurrent child writers + the WAL, no torn-file corruption occurs.
- **Stuck-segment heartbeat:** a chapter-level progress payload may include `stalled_segments: list[int]`
  (segment IDs past the stall threshold). The flag is cleared when the segment next emits a heartbeat.

## Steps (ordered)

1. **Write the failing tests first** (see Tests below). Confirm each is red on the pre-fix code.
2. **Stitch barrier (INV-2):** in `plugins/tts_mixed/handler.py`, wrap the existing group-loop fan-out
   (post-002) with `concurrent.futures.wait(all_child_futures, return_when=ALL_COMPLETED)`. After the
   wait, collect results in `DB segment order` (sort by `segment.order`). Pass the sorted list to
   `stitch_segments`. Remove any completion-order-dependent accumulation.
3. **Artifact-validated completion (INV-3):** audit `_group_needs_render`. Confirm it checks (a) file
   existence, (b) `getsize > 0`, (c) WAV duration > 0. Add the duration check if missing. Update all
   segment-done write sites to call through `_group_needs_render` before marking done — never mark on
   subprocess exit code alone.
4. **Cancel safety (INV-7):** in `orchestrator.py`'s `cancel(task_id)` path (orchestrator.py:386),
   thread a `threading.Event` stop signal
   through to every child future. After signalling, call `concurrent.futures.wait(all_child_futures)`.
   Only after the wait completes: purge orphan WAVs for segments that started but did not produce a
   validated artifact; detach listeners; write terminal chapter status.
5. **Recovery K-of-N (INV-8):** in `Orchestrator.recover()` (orchestrator.py:240; `recovery.py` only
   supplies `load_recoverable_task_contexts`), when building the recovered fan-out list, filter out
   segments whose validated artifact already exists (`_group_needs_render` returns False). Confirm the
   parent chapter job is the only unit submitted to the scheduler (one-job-per-chapter dedup intact).
6. **Write contention (R-C):** confirm `update_segments_bulk` targets the `segments` SQLite table and
   that the DB is opened in WAL mode (`PRAGMA journal_mode=WAL`). If any per-segment progress event
   routes through `state.json`, redirect it to the SQLite path. Add the WAL pragma to the DB init path
   if not already present.
7. **Stuck-segment heartbeat:** add `last_heartbeat` to the per-segment timing state (Part D, post-003).
   In the parent aggregation loop (or a dedicated monitor coroutine), compare against
   `SEGMENT_STALL_TIMEOUT_SECONDS`. Emit `stalled_segments` in the chapter progress payload when the
   threshold is crossed. Clear on next heartbeat tick.
8. **Revert-check (R1)** for each new test: stash the fix, confirm red, restore. Document the failure
   mode in the test docstring.
9. Run the full test commands (see below). `ruff check` the touched files.

## Tests (TDD — write first)

All tests go under `tests/orchestration/` (alongside the existing timing / ETA tests) unless
otherwise noted. Apply R1 (revert-check), R2 (mock only the boundary), R4 (no sleeps).

**Test A — shuffled-completion stitch order (INV-2, R1):**
Drive a 3-segment fan-out (via the parent/child model from 002) with a stubbed bridge that delivers
completions in **reverse manuscript order** (segment 3 finishes first, then 2, then 1). Assert the
list passed to `stitch_segments` is `[seg_1_wav, seg_2_wav, seg_3_wav]` (manuscript order). On
pre-fix code the list is in completion order → stitch is mis-ordered → red.

**Test B — one-of-N failure isolation (INV-3, R1):**
Drive a 3-segment fan-out where segment 2's bridge call exits with code 0 but writes a zero-byte WAV.
Assert: (a) `_group_needs_render` returns True for segment 2 (not done); (b) the chapter is not
marked done; (c) segments 1 and 3 are not re-rendered (their validated artifacts are reused). On
pre-fix code that gates on exit code, segment 2 is incorrectly marked done → red.

**Test C — cancel joins all in-flight (INV-7, R1):**
Start a 3-segment fan-out; cancel mid-way (after 1 segment starts, before it finishes). Assert:
(a) the `cancel(task_id)` call (orchestrator.py:386 — not `cancel_job`) blocks until all child threads are joined (no active futures remain after
`cancel(task_id)` returns); (b) no orphan WAVs remain for segments that started but did not validate;
(c) no `SEGMENT_SAVED` writes arrive after `cancel(task_id)` returns. On pre-fix code cancel does not
join → assertion (a) fails → red. Use `threading.Event` synchronization in the stub, not sleep.

**Test D — K-of-N recovery resumes only unfinished (INV-8, R1):**
Simulate a 4-segment chapter where segments 1 and 3 already have validated WAV artifacts on disk.
Call `Orchestrator.recover()` (orchestrator.py:240 — not `recover_jobs`, which does not exist; the
recovery entry point from 002). Assert: (a) the recovered fan-out submits
exactly segments 2 and 4; (b) only one chapter job appears in the scheduler (one-job-per-chapter,
INV-4). On pre-fix code that rebuilds the full fan-out, segments 1 and 3 are re-submitted → red.

**Test E — no state.json corruption under concurrent writes (R-C, R1):**
Spin up N=4 concurrent threads each calling the segment-status write path (the path that was formerly
a full `state.json` rewrite). After all threads complete, assert: (a) the `segments` SQLite table
contains 4 rows with the correct statuses; (b) the `state.json` file (if present) has not been
written more than once (chapter-level only). On pre-fix code that routes per-segment writes through
`state.json`, the torn-write race is observable (or the write count assertion fails) → red.

**Commands:**
```
./venv/bin/python -m pytest tests/orchestration -q -k "stitch or cancel or recovery or segment_write"
./venv/bin/python -m pytest tests/orchestration tests/db -q
ruff check plugins/tts_mixed/handler.py app/orchestration/scheduler/orchestrator.py app/orchestration/scheduler/recovery.py app/db/segments.py app/db/state.py app/orchestration/scheduler/orchestrator_helpers.py
```

## Acceptance criteria

- [x] Stitch order is correct (manuscript order) regardless of child completion order (INV-2); pinned
      by test A.
- [x] A segment with a zero-byte or duration-invalid WAV is not marked done; the chapter is not
      completed until all segments have validated artifacts (INV-3); pinned by test B.
- [x] Cancel joins all in-flight child threads before returning (INV-7); pinned by test C. Implemented
      as an explicit `concurrent.futures.wait(ALL_COMPLETED)` in `ChapterSynthesisTask.run()` (the
      live cancel-safety unit) rather than literally inside `orchestrator.py:386`, which has no
      fan-out to join yet — see scope note above.
- [x] After a crash with K of N segments validated, restart re-renders only the N-K unfinished
      segments; one-job-per-chapter dedup is intact (INV-4, INV-8); pinned by test D. Implemented as
      an injectable `needs_render_fn` filter on `ChapterSynthesisTask._fan_out_chapter` — the real
      predicate + `recovery.py` call site is 008's job (no live wiring exists to call it from yet).
- [x] Per-segment status writes route to SQLite (WAL); `state.json` sees only chapter-level writes;
      concurrent per-segment writes do not corrupt state (R-C); pinned by test E. Added
      `PRAGMA journal_mode=WAL` at `get_connection()`; audited existing per-segment write paths
      (already SQLite-only).
- [x] A hung segment is detectable: `ChapterSynthesisTask.stalled_segments` surfaces past
      `SEGMENT_STALL_TIMEOUT_SECONDS` with no heartbeat. Threading this onto the live chapter
      progress payload (`stalled_segments` key, analogous to 003's `active_segments_map`) is
      deferred to 008 — no kwarg exists yet on `ProgressService.publish`/`_publish` for it.
- [x] Retry-once policy (owner directive 2026-07-03): a failed segment is requeued exactly once; a
      second failure is permanent, does not block siblings, and skips stitch; pinned by test F.
- [x] 004 residual: `WarmWorkerManager._acquire_worker` no longer hangs forever on a dead worker —
      polls and gives up (one-shot fallback) instead, fixed inside `_acquire_worker` itself.
- [x] All new tests (A–F + heartbeat, 10 total) are revert-checked red on pre-fix code (R1).
- [x] `ruff check` passes on all touched files.

## Map links

- `01-map.md` Part **F** (correctness paths); invariants **INV-2** (stitch order), **INV-3**
  (validated completion), **INV-4** (one job per chapter), **INV-7** (cancel safety), **INV-8**
  (K-of-N recovery); risk **R-C** (write contention).
- Stitch barrier connects to Part **C** (parent/child model, task 002) — they must share one model.
- Recovery connects to Part **C** dedup in `recovery.py`.
- Write contention connects to `app/db/segments.py` + the SQLite WAL already used by the rest of
  the DB layer.

## Out of scope

- Per-segment dispatch isolation (timing/marker state) → **task 003** (prerequisite).
- TTS-server warm-worker semaphore / lazy spawn → **task 004**.
- Frontend multi-active display → **task 006**.
- ETA, toggle, and spec reconciliation → **task 007** (this task blocks it).
