# Task 007 — ETA under parallelism + off-by-default toggle + spec reconciliation

**Workstream:** W-PAR  ·  **Depends on:** 003, 005, 006  ·  **Blocks:** none (last)  ·  **Status:** Not started

> Read [`../01-map.md`](../01-map.md) (Parts **H**, **I**; invariants **INV-1**, **INV-5**; risk **R-D**)
> and [`../00-overview.md`](../00-overview.md) (Scope items 8, 9) before starting. This task is the
> final gate — it assumes 003 (per-segment dispatch isolation), 005 (correctness invariants), and 006
> (frontend multi-active) have all landed.

## Added scope (2026-07-01)

- **Surface `ENGINE_CLASS_ADMISSION` as a real setting.** Task 001 (DONE 2026-06-26) ships the
  per-engine-class semaphore machinery dark behind the env flag `ENGINE_CLASS_ADMISSION` (default
  OFF) — while off, every synthesis claim still funnels through the single shared exclusive gate, so
  001 is byte-identical to today. Task 001's as-built note is explicit that **this task (007) must
  surface that flag as a proper setting** and **snapshot it into the claim at reserve time** so a
  mid-render toggle flip can't desync a task's reserve/release pair (a task must release under the
  same admission mode it reserved under). This is in addition to, not a replacement for, the
  `TTS_PARALLEL_CAP` / `TTS_ENGINE_CAPS` toggle work already scoped below.
- **Spec baselines to bump from (confirm before editing — avoid version collisions):**
  `queue-jobs.md` 1.6.0, `system-architecture.md` 1.5.0, `live-events.md` 1.7.1,
  `progress-presentation.md` 1.8.2. **Coordinate with W-MIX-LA task 007**
  ([`../../mixed-synthesis-load-attribution/tasks/007-spec-reconciliation-and-g0.md`](../../mixed-synthesis-load-attribution/tasks/007-spec-reconciliation-and-g0.md)),
  which is also expected to bump `live-events.md`, `queue-jobs.md`, and `data-model.md` around the
  same time (`pre_load_eta` / `preparingWithEta` / `model_load_seconds` consumption) — if that lands
  first, re-read the new baseline before bumping again rather than clobbering its changelog row.

## Goal

Three coupled deliverables that ship together as Phase 1 completion:

1. **ETA that is honest under parallelism (H, R-D):** replace the single-stream CPS model with a
   throughput/bottleneck-based model that is correct for N heterogeneous parallel workers and degrades
   gracefully to today's behavior when cap = 1.
2. **Off-by-default toggle (I, INV-1):** cap defaults to 1 (ships dark, byte-identical to today);
   a user-facing setting raises per-engine caps and the global cap. Surfaced in Settings; documented.
3. **Spec reconciliation (joint authority):** bump version + add dated changelog rows to every spec
   touched by W-PAR, then run the full invariant suite as the final green gate.

## Why it matters

Without this task:

- **ETA is wrong under parallelism (R-D):** single-stream CPS assumes one segment renders at a time
  and that block width equals render time. With N heterogeneous workers, a slow XTTS segment and a
  fast Voxtral segment overlap — single-stream CPS double-counts throughput and produces an optimistic
  ETA that is meaningless. The fix is a rolling-throughput / bottleneck-pool model.
- **The toggle is missing (INV-1):** without a default-1 cap and an explicit raise path, parallelism
  cannot ship dark and is not opt-in. This breaks the promise that cap=1 is byte-identical to today.
- **Spec drift is permanent:** W-PAR changes the scheduler contract (per-engine semaphores), the
  system architecture (per-engine pools), the data model (parent/child + validated-artifact
  completion), and the live-events + progress-presentation contracts (multi-active segments,
  `active_segments_map`). If specs are not bumped here, the repo's joint-authority constraint is
  broken (this repo's "resolve drift explicitly in the same change" convention).

## Files to touch

| File | Current anchor | Change |
|------|----------------|--------|
| `app/orchestration/progress/eta.py` | Single-stream CPS: `seconds_per_char`, `remaining_chars / cps` | Replace with rolling-throughput / bottleneck model (see Target shape). Add "estimating…" guard until ≥3 segment completions. Add bracket computation (`low`, `high`). With cap=1 the model reduces to today's CPS. |
| `app/orchestration/progress/` (progress service, broadcast) | Chapter-level progress payload | Thread `eta_low_seconds`, `eta_high_seconds`, `eta_display` (string: `"~40–70 s"` or `"estimating…"`) through the broadcast payload. When cap=1 and ≥3 completions, `eta_low == eta_high` (single-stream). |
| `app/core/config.py` + `app/db/state_settings.py` | Engine cap settings | Add `TTS_PARALLEL_CAP` (global default 1) and `TTS_ENGINE_CAPS` (per-engine overrides, JSON dict). Read from env + settings DB. Validate against each engine manifest's `behavior.max_concurrent_workers` (cap may not exceed manifest max). |
| `app/api/routers/settings.py` (or the relevant settings router) | Settings CRUD | Expose the cap toggle as a user-facing setting: read/write `TTS_PARALLEL_CAP` and per-engine caps. Return current effective caps in the settings response. |
| `design-docs/specs/queue-jobs.md` | Scheduler contract | Bump `spec_version`; add changelog row dated 2026-06-26 referencing W-PAR. Add: per-engine counting semaphores (replace binary gates); parent/child segment scheduling; per-engine and global concurrency caps; cap-default-1 invariant; manifest `max_concurrent_workers` as the source of truth (INV-5). |
| `design-docs/specs/system-architecture.md` | Architecture overview | Bump `spec_version`; add changelog row. Add: per-engine worker pools in the TTS server; server-side warm-worker semaphore; no engine-ID branching rule (INV-5, `design-docs/engineering-rules/modular_architecture.md`); orchestrator ↔ watchdog ↔ VoiceBridge ownership split. |
| `design-docs/specs/data-model.md` | Job / segment schema | Bump `spec_version`; add changelog row. If the parent/child job shape or validated-artifact completion fields changed the stored schema, document the new fields (`parent_job_id`, `validated_at`, etc.). If shape is unchanged, add a note confirming it. |
| `design-docs/specs/live-events.md` | WebSocket event envelope | Bump `spec_version`; add changelog row. Add `active_segments_map` to the chapter progress event shape; add `eta_low_seconds`, `eta_high_seconds`, `eta_display` fields; add `stalled_segments` (from task 005). Confirm all new fields are in the extract → whitelist → hydration path (W4 two-layer, INV-9). |
| `design-docs/specs/progress-presentation.md` | Frontend progress contract | Bump `spec_version`; add changelog row. Document: multiple concurrently-active segments in the per-segment bar UI; bracketed ETA display format (`"~40–70 s"` / `"estimating…"`); rAF-coalesce rule for multi-active updates; stalled-segment flag presentation. |

## Target shape / contract

### ETA model (H, R-D)

- **Rolling throughput:** maintain a sliding window of the last K segment completions (suggested
  K = 10). For each completed segment, record `chars_completed` and `wall_seconds`. Throughput =
  `sum(chars) / sum(wall_seconds)` over the window.
- **Bottleneck pool:** when N workers are active, throughput is bounded by the slowest pool. Compute
  per-pool throughput (XTTS pool, Voxtral pool, CPU pool). The bottleneck rate is `min(pool_rates)`
  where a pool rate = `pool_cps * pool_cap`. Use this as `effective_cps`.
- **Bracketed display:** `eta_low` = remaining chars / `effective_cps * global_cap`;
  `eta_high` = remaining chars / `effective_cps * 1` (worst case). Display as `"~{low}–{high} s"`.
  When `low == high` (cap=1 or single remaining worker), display as `"~{low} s"` (no bracket).
  Display `"estimating…"` until ≥3 segment completions have been observed in the current render.
- **Cap=1 parity:** with cap=1, the model reduces exactly to today's single-stream CPS with a single
  eta value (no bracket). The ETA progression must be numerically equivalent to the pre-W-PAR path
  for the same render sequence. Pin this with a test.

### Toggle (I, INV-1)

- **Default:** `TTS_PARALLEL_CAP = 1`. At this default, no behavior change: single child segment
  dispatched at a time, single-stream ETA, sequential stitch.
- **Raise path:** user sets `TTS_PARALLEL_CAP = N` (globally) or `TTS_ENGINE_CAPS = {"tts_xtts": 2, "tts_voxtral": 4}` (per-engine). The effective cap for an engine is `min(env_cap, manifest.max_concurrent_workers)`.
- **Settings UI:** expose a "Parallel rendering" numeric input (or engine-specific sliders in an
  advanced section). The setting persists to the settings DB. On change, the orchestrator picks up
  the new cap on the next job submission (no restart required).
- **Documentation:** add a note to the settings UI tooltip and to `docs/handbook/` (or an
  appropriate user-guide location) describing the setting, the default, the VRAM consideration for
  XTTS, and the recommended values (XTTS: 1–2; Voxtral: 4–8; CPU: 2–4).

### Spec reconciliation (I, joint authority)

Every spec listed in the Files table above must:
1. Have its `spec_version` bumped (minor version, e.g. `1.3 → 1.4`).
2. Have a dated changelog row (`2026-06-26 | W-PAR | <one-line description of the change>`).
3. Reflect the actual post-W-PAR contract — no partial or aspirational descriptions.

This is this repo's "resolve drift explicitly" obligation. If a spec is found to be already
accurate (no drift), add a changelog row confirming it was reviewed and no change was needed.

### Final gate

After all spec bumps:
1. Run the full invariant test suite (all five tests from task 005 + the multi-active tests from
   task 006).
2. Run targeted backend: `./venv/bin/python -m pytest tests/orchestration tests/db -q`.
3. Run targeted frontend: `npm -C frontend run test -- --run`.
4. Run ruff: `ruff check app/orchestration/progress/ app/core/config.py app/api/routers/settings.py`.
5. Run tsc: `npm -C frontend run build` (confirms the new ETA fields typecheck end-to-end).
All must be green before task 007 is marked complete.

## Steps (ordered)

1. **Write the failing tests first** (see Tests). Confirm red on pre-fix code.
2. **ETA model:** in `app/orchestration/progress/eta.py`, add the rolling-throughput sliding window
   and the bracketed low/high computation. Add the `"estimating…"` guard for <3 completions. Thread
   `eta_low_seconds`, `eta_high_seconds`, `eta_display` into the progress broadcast payload. Confirm
   cap=1 reduces to today's behavior (test B).
3. **Toggle — config:** add `TTS_PARALLEL_CAP` and `TTS_ENGINE_CAPS` to `app/core/config.py` with
   defaults 1 / `{}`. Wire them through to the semaphore sizing in `resources.py` (from task 001).
   Enforce `min(env_cap, manifest.max_concurrent_workers)`.
4. **Toggle — settings API:** expose the cap fields in the settings router. GET returns current
   effective caps; PATCH writes and propagates. No restart required for the change to take effect on
   the next job.
5. **Spec reconciliation:** open each spec file in the table above. Bump `spec_version`. Add the
   changelog row. Update the contract prose to match the post-W-PAR state. Diff against the previous
   version to confirm no drift was silently dropped.
6. **Revert-check (R1)** each new test: stash the fix, confirm red, restore.
7. **Final gate:** run all five commands listed in the Final gate section above. Fix any failures
   before marking done.

## Tests (TDD — write first)

Apply R1 (revert-check), R2 (mock only the boundary), R4 (no sleeps / fake timers or explicit
timestamps where needed).

**Test A — bracketed ETA under parallel workers (H, R-D, R1):**
In `tests/orchestration/`, drive a 6-segment render (3 XTTS + 3 Voxtral, cap=2 per engine) through
the ETA model with a stubbed completion sequence delivering segments at mixed speeds. Assert:
(a) `eta_display` returns `"estimating…"` before 3 completions;
(b) after ≥3 completions, `eta_display` is a bracketed string (`"~N–M s"` where N < M);
(c) `eta_low_seconds < eta_high_seconds` (low is optimistic, high is pessimistic);
(d) the bottleneck rate is the min of the per-pool rates (assert against manually computed value).
On pre-fix single-stream CPS, `eta_low == eta_high` (no bracket) → assertion (b)/(c) fail → red.

**Test B — cap=1 ETA parity (INV-1, guard):**
Drive the same ETA model with cap=1 and a single-worker completion sequence. Assert the
`eta_low_seconds` and `eta_high_seconds` values match the pre-W-PAR single-stream CPS output to
within floating-point tolerance. If current behavior already passes, note in docstring this is a
guard test, not a bug-fix test (no R1 requirement for this one).

**Test C — toggle cap enforcement (INV-1, INV-5, R1):**
Set `TTS_PARALLEL_CAP=1` (default). Assert the effective cap for each engine is 1 regardless of
`manifest.max_concurrent_workers`. Set `TTS_PARALLEL_CAP=3` with `manifest.max_concurrent_workers=2`.
Assert the effective cap is clamped to 2 (manifest wins). Assert no engine-ID branching in the cap
resolution path (INV-5): the same code path applies to `tts_xtts`, `tts_voxtral`, and any future
engine. On pre-fix code where the cap is not read from config or is hardcoded per engine → red.

**Commands:**
```
./venv/bin/python -m pytest tests/orchestration -q -k "eta or toggle or cap"
./venv/bin/python -m pytest tests/orchestration tests/db -q
npm -C frontend run test -- --run
ruff check app/orchestration/progress/ app/core/config.py app/api/routers/settings.py
npm -C frontend run build
```

## Acceptance criteria

- [ ] `eta_display` returns `"estimating…"` until ≥3 segment completions, then a bracketed
      `"~N–M s"` string; at cap=1 it degrades to `"~N s"` (no bracket) and matches pre-W-PAR
      numerics (H, R-D); pinned by tests A and B.
- [ ] `TTS_PARALLEL_CAP` defaults to 1; behavior at cap=1 is byte-identical to today (INV-1);
      pinned by test B.
- [ ] Raising the cap (via env or settings UI) is reflected in the next job submission without
      restart; effective cap is `min(env_cap, manifest.max_concurrent_workers)` (INV-5); pinned by
      test C.
- [ ] Settings endpoint exposes the cap and persists changes to the settings DB.
- [ ] All five specs listed in Files are bumped (`spec_version` minor bump) with dated changelog
      rows referencing W-PAR; no post-W-PAR behavior is undocumented.
- [ ] Full invariant suite (tasks 005 + 006) green; targeted backend pytest green; targeted frontend
      vitest green; ruff green; tsc/build green.
- [ ] All new tests are revert-checked red on pre-fix code (R1).

## Map links

- `01-map.md` Parts **H** (ETA), **I** (toggle + specs); invariants **INV-1** (ships dark),
  **INV-5** (no engine-ID branching); risk **R-D** (ETA correctness under heterogeneous pools).
- ETA reads aggregate throughput from the parent which aggregates from isolated child timing
  (Part D, task 003) — with cap=1 it must reduce to today's behavior (H ↔ D connection).
- Toggle connects to cap declaration (Part A, task 001) and semaphore sizing (Part B, task 001).
- Spec reconciliation covers all five architecture/contract specs touched by W-PAR.
- This task is the **final gate** for Phase 1; Phase 2 (render monitor) starts here.

## Out of scope

- Per-segment dispatch isolation → **task 003** (prerequisite).
- Correctness invariants (stitch/cancel/recovery) → **task 005** (prerequisite).
- Frontend multi-active display → **task 006** (prerequisite).
- The dedicated Phase 2 render monitor (proportional-block visualizer, popover detail, per-segment
  retry from UI) → **[10-phase2-render-monitor.md](../10-phase2-render-monitor.md)**.
- Multi-GPU / distributed rendering; cross-machine pools.
- Live per-engine worker sliders / throughput diagnostics panel (power-user controls) → Phase 2.
