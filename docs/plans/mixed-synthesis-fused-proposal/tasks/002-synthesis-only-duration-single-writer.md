# Task 002 — Synthesis-only duration, single render-sample writer

**Workstream:** W2  ·  **Depends on:** 001  ·  **Blocks:** none  ·  **Status:** Not started

> Read [`../01-map.md`](../01-map.md) (surface **B**, invariants **INV-3**, **INV-6**) and
> [`../00-overview.md`](../00-overview.md) (Layer 2 root cause) before starting. This task assumes
> task 001 has landed — `model_load_seconds` is only *matchable* for mixed after per-active-group
> marker resolution exists.

## Goal
Make the orchestrator the **sole** writer of the render-performance sample for a mixed render, on a
**synthesis-only clock**: measure each group's synthesis from engine-confirmation
(`segment_starts[leader]`) to `[SEGMENT_SAVED]`, never folding the model-load / inter-group window
into `synthesis_duration_seconds`. Stop the mixed handler from writing its own wall-time
`synthesis_duration_seconds`, eliminating the duplicate sample and the load-inclusive value that
`_record_render_stats_inner` currently *prefers*.

## Why it matters
This is **Layer 2** in `00-overview.md`. Two paths leak load time into synthesis time:
1. The mixed handler times the **whole** bridge call as wall time (including model load) and writes it
   as `synthesis_duration_seconds` — which `_record_render_stats_inner` then prefers over the
   orchestrator's clock.
2. At `[SEGMENT_SAVED]` the orchestrator falls back to the **announce** timestamp when engine
   confirmation is missing, folding the pre-render load window into per-segment render time.

Together these produce `synthesis_duration_seconds > wall time` (Codex observed 63.05 s vs ~40.8 s),
inflating `seconds_per_char` and polluting all future ETAs (INV-3). They also write the sample twice
(INV-6).

## Files to touch
| File | Current anchor (file:line) | Change |
|------|----------------------------|--------|
| `plugins/tts_mixed/handler.py` | `_seg_start = time.monotonic()` / `total_synthesis_seconds += time.monotonic() - _seg_start` at **L365-369**; `update_job(..., synthesis_duration_seconds=max(round(total_synthesis_seconds, 2), 0.01))` at **L444-451**; `record_engine_sample(...)` at **L461** | Stop writing a load-inclusive `synthesis_duration_seconds` from the handler (remove that kwarg from the final `update_job`, or compute it without the load window — the orchestrator now owns it). Stop the competing performance-sample write so the orchestrator is the single writer (see Steps for the exact decision on `record_engine_sample`). |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `[SEGMENT_SAVED]` duration capture: `started = segment_starts.get(leader_id) or segment_announced.get(leader_id)` at **L908** | When a load window exists for this group (i.e. an `ENGINE_ACTIVITY_STARTED` / announce-before-confirm gap), use **only** `segment_starts[leader_id]` (engine confirmation); never fall back to `segment_announced`. Keep the announce fallback **only** for engines that emit no confirmation signal at all (e.g. Voxtral) — i.e. fall back only when `engine_activity_started_at`/load was never observed for the group. |
| `app/orchestration/scheduler/orchestrator_helpers.py` | `_record_render_stats_inner` prefers `perf_job_obj.synthesis_duration_seconds` at **L332** (`synthesis_dur = (getattr(perf_job_obj, "synthesis_duration_seconds", None) ...) or timing.get(...)`) | With the handler no longer writing a wall-time value, this preference now reads the orchestrator-derived synthesis-only value. Confirm/ensure the orchestrator-computed `synthesis_duration_seconds` (accumulated from confirmation→saved, excluding load) is what flows here. `model_load_seconds` is accumulated from the now-matchable markers (set at **L680-686** on `[START_SEGMENT]`). |
| `app/db/performance.py` | `record_render_sample` CPS at **L63-67** (from `sum_segment_render_seconds` else `synthesis_duration_seconds`); `model_load_seconds` only feeds `inter_group_overhead_seconds` at **L57-59** | **Confirm (no change expected):** `model_load_seconds` is already kept out of `cps`. Add a regression test that pins this. |

## Target shape / contract
- **Single writer:** exactly one `render_performance_samples` row per render group for a mixed render.
  The orchestrator's `record_render_stats_if_completed` is the writer; the mixed handler writes no
  competing performance sample and no load-inclusive `synthesis_duration_seconds` on the job (INV-6).
- **Synthesis-only clock:** `synthesis_duration_seconds` for a group = `SEGMENT_SAVED_time − segment_starts[leader]`
  (engine confirmation), summed across groups. The model-load and inter-group windows are **excluded**
  and accounted separately (`model_load_seconds`, `inter_group_overhead_seconds`).
- **No announce fallback when a load window exists:** for a group that loaded a model (XTTS), duration
  is anchored on confirmation only; the `segment_announced` fallback survives solely for
  confirmation-less engines (Voxtral) where no load window is present.
- **CPS purity (INV-3):** `seconds_per_char` is computed from synthesis-only time; `model_load_seconds`
  never enters CPS (already true in `performance.py` — pin it with a test).
- **Resulting invariant:** `synthesis_duration_seconds ≤ wall duration` for the render.

## Steps (ordered)
1. **Write the failing tests first** (see Tests). Confirm red on current code.
2. In `plugins/tts_mixed/handler.py`, remove the `synthesis_duration_seconds=` kwarg from the final
   `update_job` (L444-451) so the handler stops writing a load-inclusive duration. Decide
   `record_engine_sample` (L461): the orchestrator is now the sole render-sample writer for the
   chapter render — remove/guard the handler's `record_engine_sample` call so only one sample per
   group is written. (Keep handler-side segment DB writes intact.)
3. In `orchestrator_helpers.py` `[SEGMENT_SAVED]` branch (L908), gate the `segment_announced`
   fallback: use it only when no load/confirmation window was observed for the group; otherwise require
   `segment_starts[leader_id]`.
4. Verify `_record_render_stats_inner` now sources the synthesis-only duration and the
   orchestrator-accumulated `model_load_seconds` (L332-339). Adjust the preference if the now-empty
   handler value would otherwise short-circuit it.
5. Add the `performance.py` regression test pinning `model_load_seconds` out of CPS.
6. Revert-check (R1) for each new test: stash the fix, confirm red, restore.
7. Update specs (W6): `docs/specs/data-model.md` / progress docs as needed for the render-sample
   contract (single writer, synthesis-only duration); bump version + changelog row.

## Tests (TDD — write first)
- **Failing test A — single writer + synthesis-only duration (R1):** in
  `tests/orchestration/` (alongside `test_job_timing.py` / `test_inter_group_gap_eta.py`), drive a
  mixed multi-group render (XTTS group + Voxtral group) through the orchestrator with a stubbed
  bridge that emits markers including a load window for the XTTS group. Assert:
  - exactly **one** `render_performance_samples` row per group (count the writes / rows);
  - the recorded `synthesis_duration_seconds` **excludes** the load window (≤ wall, and < the
    naive announce-to-saved span);
  - `model_load_seconds` is populated for the XTTS group.
  On current code the handler also writes a wall-time duration that is preferred → duration includes
  load and/or a duplicate sample exists → red.
- **Failing test B — CPS purity (R1, `tests/db/`):** call `record_render_sample` with
  `synthesis_duration_seconds`, `sum_segment_render_seconds`, and a large `model_load_seconds`; assert
  the stored `cps` equals `chars / synthesis_duration_seconds` (or `chars / sum_segment_render_seconds`)
  and is **independent** of `model_load_seconds`. (If current behavior already passes, this test is a
  guard, not a bug-fix test — note that in the test docstring so reviewers don't expect an R1 red.)
- **R2:** mock only the bridge / engine boundary (the subprocess stdout) and DB *connection* where
  appropriate; do **not** mock `record_render_sample` for test A (assert the real row/write), do not
  mock `performance.py` internals for test B.
- **R4:** feed marker lines synchronously; no sleeps. Use explicit timestamps (monkeypatch `time.time`
  / `time.monotonic` at the clock boundary if needed) rather than wall-clock deltas.
- **Commands:**
  `./venv/bin/python -m pytest tests/orchestration -q -k "timing or mixed or sample"; ./venv/bin/python -m pytest tests/db/test_state_performance.py plugins/tts_mixed/tests -q`
  ; `ruff check app/orchestration/scheduler/orchestrator_helpers.py app/db/performance.py plugins/tts_mixed`

## Acceptance criteria
- [ ] A mixed multi-group render records **exactly one** sample per group (INV-6); the mixed handler
      writes no competing performance sample.
- [ ] Recorded `synthesis_duration_seconds ≤ wall duration` and excludes the model-load window.
- [ ] `model_load_seconds` is captured for the XTTS group (depends on task 001).
- [ ] `seconds_per_char` is computed from synthesis-only time; `model_load_seconds` never enters CPS
      (INV-3), pinned by a test.
- [ ] The `segment_announced` fallback survives only for confirmation-less engines (Voxtral); it is
      not used when a load window exists.
- [ ] Spec(s) updated with version bump + changelog row.

## Map links
- `01-map.md` surface **B** (duration / metrics capture — orchestrator + db); invariants **INV-3**
  (load out of synthesis/CPS), **INV-6** (one sample per group). Builds on surface **A** (task 001).

## Out of scope
- Per-active-group marker resolution itself → **task 001** (prerequisite).
- ETA suspension / null-clear / preparing phase → **task 003**.
- Frontend presentation → task 004 (W4).
- Mixed `ResourceClaim` (W5) — deferred.
