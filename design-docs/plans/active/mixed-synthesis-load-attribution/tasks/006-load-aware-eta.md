# Task 006 — Load-aware ETA from history

**Workstream:** W-MIX-LA · **Depends on:** 003 · **Blocks:** — · **Status:** **DONE 2026-07-01** (built in working tree; commit pending)

> Read [`../01-map.md`](../01-map.md) parts **P-G/P-H**, connection **C5**, invariant **INV-6**. This realizes the owner's "add the loading time to the prediction" intuition using data we already store.

## As built (2026-07-01)

- Implementation landed in `app/orchestration/scheduler/orchestrator_helpers.py` — **proactive path** at dispatch (~L140-169: `get_server_health()` model_warm check + `expected_model_load_seconds()` → `pre_load_eta` preparing frame at ~L1317-1325) and **reactive reconciliation** on `MODEL_LOAD_STARTED` (~L815-853) — **NOT** in `eta.py`/`orchestrator_eta.py` as originally spec'd below. New DB reader `app/db/performance.py::expected_model_load_seconds` (L178-219, trimmed mean over `model_load_seconds >= 1.0` cold samples, returns `None` with no history — no fabrication).
- The load term clears at `START_SYNTHESIS` (~L889-892) so synthesis-only stats stay pure (W2 unregressed, tested).
- `model_load_seconds` writer is **PRE-EXISTING**: the `ENGINE_ACTIVITY_STARTED`→`START_SYNTHESIS` window (`_close_pending_engine_activity_interval`); the new `MODEL_LOAD_STARTED` marker deliberately does **NOT** open a timing interval (avoids double-count). DB accumulates real cold samples over time.
- `model_warm` surfaced end-to-end: `WarmWorker._model_ready` event (stderr "XTTS serve mode: model ready") → `WarmWorkerManager.is_model_ready()` → engine `model_warm()` → `/health` payload → orchestrator.
- Bundled riders in the same working tree: §4A.3 composition fix (trust-weighted blend + int→round) in `service.py`, spec `progress-presentation.md` 1.7.1→1.8.2; frontend `QueueItem.tsx` `preparingWithEta` retention + `PredictiveProgressBar.tsx` preparing countdown / queue-bar determinate fill.
- Tests: `tests/orchestration/test_load_aware_eta.py`, `tests/tts_server/test_health_model_warm.py`, `plugins/tts_xtts/tests/test_model_warm.py`, frontend PreparingEtaCountdown/QueueBarDeterminateFill/QueueItemPreparingEta tests. Adversarial audit 2026-07-01: CLEAN, no P0/P1.
- Known P2 follow-ups (non-blocking): two conditionally-vacuous assertion loops in `test_load_aware_eta.py` (~L336-343, 369-377 — assert nothing if no SEGMENT_PROGRESS frames observed; add a ≥1-frame precondition); `test_synthesis_only_measurement_unchanged` asserts frame ETAs, not a recorded stats artifact.

## Owner design (2026-06-26) — add ETA at load-time, do NOT pause

The owner ruled out pausing for loads. The chosen behavior:

- **Don't pre-add** the load time. We can't know a load will happen until it does (warm reuse loads nothing). **Add it only when the load actually starts** — i.e. when the `MODEL_LOAD_STARTED` marker arrives (task 002/003).
- **On `MODEL_LOAD_STARTED`:** look up the expected `model_load_seconds` for that engine/model from the DB (`render_performance_samples`) and **add it to the live ETA**. The **ETA clock keeps counting down** through the load; the **progress bar/percentage holds still** (no creep, no jump-ahead — that "hold still, don't creep" behavior is the 004 indeterminate fix). So it reads as "still working, ~N s left," never a frozen pause.
- **Account for the *extra* time only.** Under future parallelism (W-PAR), another engine (e.g. Voxtral) may be rendering *while* XTTS loads, so the load partly overlaps useful work — the load term is an additive correction to the ETA, not a stop-the-world. Keep it as "expected remaining + expected load," not "freeze everything for load."
- **Progress display will get much simpler with the BitTorrent char-based model** (W-PAR Phase 2 / the running completed-chars÷total-chars total carried on every segment update). Don't over-engineer progress-% here; this task is about the **ETA clock**, not the fill math.

## Goal

When a model load actually begins (`MODEL_LOAD_STARTED`), fold the recorded `model_load_seconds` history into the **live ETA** so the countdown absorbs the load time — rather than the clock hitting ~0 during the load (over-optimistic) or the bar creeping/jumping. The progress bar holds; the clock keeps ticking with the load time added.

## Why it matters

Gap (C): `render_performance_samples.model_load_seconds` is written on every sample (`app/db/core.py:357-382`, `app/db/performance.py`) but **no predictor reads it** — the ETA uses only `cps` + `inter_group_overhead_seconds` (`eta.py:131-141`). The data to predict load windows already exists; we just don't use it.

## Files to touch

| File | Anchor | Change |
|------|--------|--------|
| `app/orchestration/scheduler/eta.py` | `get_calibrated_model_params` `:131-141`, `calculate_chapter_startup_eta` `:105-112` | **(superseded — see As built)** Read `model_load_seconds` from filtered history (per engine/model) and add an **expected load term** to the startup ETA when a load is anticipated. Use a robust aggregate (trimmed mean, matching the existing `cps`/overhead approach). |
| `app/orchestration/scheduler/orchestrator_eta.py` | `estimate_task_duration` `:18-26` | **(superseded — see As built)** If the estimate should include load for a cold render, incorporate the expected load term here too (keep synthesis-only vs total clearly separated — don't corrupt the W2 synthesis-only measurement). |
| `app/db/performance.py` / read path | history filter | Ensure the history query exposes `model_load_seconds`; consider a **cold-vs-warm** distinction (caveat from the map: `model_load_seconds` is job-level and cold/warm aren't segregated today — at minimum, ignore ~0 values as "warm"). |

## Design notes

- **Cold vs warm:** only add the load term when a load is actually expected (e.g. the engine/model isn't already warm for this session). If session-warmth isn't tracked, a conservative heuristic: treat near-zero historical `model_load_seconds` samples as warm and exclude them from the load aggregate; apply the load term only to the first render of an engine/model in a run. Document the heuristic.
- **Do not corrupt synthesis-only timing (W2):** the load term is additive to the *displayed* ETA, not to the synthesis duration measurement. Keep them separate.
- **Honest bracketing:** if confidence is low (few samples), prefer widening/labeling over a precise-but-wrong number — consistent with the existing ETA confidence handling.

## Tests (TDD)

- Given history with non-trivial `model_load_seconds`, a cold render's startup ETA includes the load term; a warm render does not. R1 revert-check: pre-006 ETA ignores load entirely.
- Synthesis-only duration measurement unchanged (no W2 regression).
- Mock boundary (R2): feed crafted history rows; assert the computed ETA; don't mock the estimator under test. No sleeps (R4).

## Acceptance criteria

- [x] The forward ETA incorporates expected load time from `model_load_seconds` history for cold renders; warm renders unaffected.
- [x] Cold-vs-warm heuristic documented; near-zero (warm) samples excluded from the load aggregate. *(`>= 1.0` threshold in `expected_model_load_seconds`, not a "near-zero"/`~0` cutoff as originally worded — same intent.)*
- [x] W2 synthesis-only measurement unregressed.
- [~] R1 revert-check observed; `ruff` + ETA tests green; spec note for 007 (`progress-presentation.md` / `data-model.md`). *(R1 + green suite done 2026-07-01; `progress-presentation.md` bump landed in-tree at 1.8.2 — `data-model.md` bump is still owed, tracked in task 007.)*

## Map links

- Parts **P-G** (predictor), **P-H** (perf DB); connection **C5** (history→ETA); invariant **INV-6**.

## Out of scope

- Segregating cold/warm at capture time with a new DB column (could be a follow-up if the heuristic proves insufficient) — note it for the owner rather than expanding scope here.
