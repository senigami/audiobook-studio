# Task 006 — Load-aware ETA from history *(optional)*

**Workstream:** W-MIX-LA · **Depends on:** 003 · **Blocks:** — · **Status:** Not started (optional — ML-3)

> Read [`../01-map.md`](../01-map.md) parts **P-G/P-H**, connection **C5**, invariant **INV-6**. This realizes the owner's "add the loading time to the prediction" intuition using data we already store.

## Goal

Fold the recorded `model_load_seconds` history into the **forward ETA**, so a render that will incur a model load reflects that load time in its prediction (rather than treating it as unattributed delay that the user perceives as a stall or an over-optimistic countdown).

## Why it matters

Gap (C): `render_performance_samples.model_load_seconds` is written on every sample (`app/db/core.py:357-382`, `app/db/performance.py`) but **no predictor reads it** — the ETA uses only `cps` + `inter_group_overhead_seconds` (`eta.py:131-141`). The data to predict load windows already exists; we just don't use it.

## Files to touch

| File | Anchor | Change |
|------|--------|--------|
| `app/orchestration/scheduler/eta.py` | `get_calibrated_model_params` `:131-141`, `calculate_chapter_startup_eta` `:105-112` | Read `model_load_seconds` from filtered history (per engine/model) and add an **expected load term** to the startup ETA when a load is anticipated. Use a robust aggregate (trimmed mean, matching the existing `cps`/overhead approach). |
| `app/orchestration/scheduler/orchestrator_eta.py` | `estimate_task_duration` `:18-26` | If the estimate should include load for a cold render, incorporate the expected load term here too (keep synthesis-only vs total clearly separated — don't corrupt the W2 synthesis-only measurement). |
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

- [ ] The forward ETA incorporates expected load time from `model_load_seconds` history for cold renders; warm renders unaffected.
- [ ] Cold-vs-warm heuristic documented; near-zero (warm) samples excluded from the load aggregate.
- [ ] W2 synthesis-only measurement unregressed.
- [ ] R1 revert-check observed; `ruff` + ETA tests green; spec note for 007 (`progress-presentation.md` / `data-model.md`).

## Map links

- Parts **P-G** (predictor), **P-H** (perf DB); connection **C5** (history→ETA); invariant **INV-6**.

## Out of scope

- Segregating cold/warm at capture time with a new DB column (could be a follow-up if the heuristic proves insufficient) — note it for the owner rather than expanding scope here.
