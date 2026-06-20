# 003b — Wire crossfade/ceiling into `enrich` (ETA never null)

- **Status:** done
- **Workload:** WL-B ETA bootstrap
- **Severity / type:** major · correctness
- **Effort:** M
- **Blocked by:** 003a
- **Blocks:** 004

## Goal
Integrate the **existing, already-tested** `crossfade_eta` and `apply_eta_ceiling` helpers into the
`enrich` kernel so that on a null-ETA / cold / sparse frame, `enrich` computes a calculated ETA from the
003a bootstrap velocity, crossfades it toward observed ETA as the run progresses, and bounds it by the
§4A.4 mechanical ceiling — so `eta_seconds` is **never null** while running (PI3).

## Why this matters
The helpers exist and are unit-tested (`eta.py:67` `crossfade_eta`, `eta.py:119` `apply_eta_ceiling`) but
are **dead code** — nothing calls them. Path B and cold-render Path A frames arrive with no `eta_seconds`,
so today the kernel emits a null ETA and the bar shows no time remaining (PI3 fails). The bug is the
**integration gap**, not the helpers. With 003a's bootstrap velocity available, `enrich` can always produce
a calculated ETA. See `../00-architecture-map.md` D4 + §4A.8 in `docs/specs/progress-presentation.md`.

## Why a revert-check still applies (per testing-standards R1)
The helpers already have unit tests, but the **integration** is new behavior. The revert-check test for
this task drives a **cold/sparse frame (progress + status only, no `eta_seconds`)** through `enrich` and
asserts a non-null, bounded, converging `eta_seconds`. On the pre-integration `enrich` (001), that frame
yields `eta_seconds=None` → the test goes red. Stash the wiring, confirm red, restore.

## Context an executor needs
- `enrich` from 001 (the kernel; ETA assembly currently mirrors `service.py:612-623`).
- `eta.py` helpers: `crossfade_eta(progress, eta_calculated, eta_observed, velocity)` (67-116) — returns
  blended ETA bounded by ceiling, 0 at progress≥0.999, `None` only when both inputs are None;
  `apply_eta_ceiling(eta_seconds, progress, velocity, status)` (119-152) — §4A.4 ceiling + terminal
  zeroing. Constants `CEIL_SLACK`/`EPS`/`P_LO`/`P_HI` at eta.py:12-21.
- The bootstrap velocity from 003a (`state_performance.seconds_per_char(...)`) supplies `eta_calculated`
  (`remaining_chars × seconds_per_char`); the orchestrator's observed estimator (`estimate_eta_seconds`,
  `eta.py:194`) or the incoming frame supplies `eta_observed`.
- `docs/specs/progress-presentation.md` §4A.4 (ceiling), §4A.8 (crossfade calculated→observed).
- `.agent/rules/backend-progress.md` (rounding, ≥1% emit) and `backend-paths.md` if reading any per-engine
  default file.

## Target shape / contract
- Inside `enrich`, when computing the ETA fields:
  1. `eta_calculated` = `remaining_chars × seconds_per_char` using the 003a reader (cold path) or warm cps.
  2. `eta_observed` = the incoming `eta_seconds` if present, else the orchestrator observed estimate if
     available, else `None`.
  3. `eta_seconds = crossfade_eta(progress=..., eta_calculated=..., eta_observed=..., velocity=...)`, then
     `apply_eta_ceiling(...)` for the final §4A.4 bound + terminal zeroing.
  4. Keep `eta_basis`/`estimated_end_at`/`eta_updated_at` consistent with the crossfaded value (set
     `eta_basis` to reflect calculated vs observed dominance per §4A.8 if the spec distinguishes).
- ETA is `None` **only** when both calculated and observed are unavailable (e.g. truly no char_count and no
  history) — and that case feeds the cold-load UX (009), not a silent null.
- Terminal (`done/failed/cancelled`) → `eta_seconds=0`/null per existing terminal clearing; do not regress
  the terminal path (`service.py:578-581`).

## Steps
1. Revert-check test first: a cold/sparse frame through `enrich` → non-null, bounded, converging
   `eta_seconds`; a near-complete frame → ETA→0; a terminal frame → null/0 (no regression). Confirm red on
   pre-integration `enrich`, then implement.
2. Wire `seconds_per_char` (003a) + `crossfade_eta` + `apply_eta_ceiling` into the kernel's ETA assembly.
3. Add a parametric test across progress phases (start/mid/end) asserting the crossfade ramps
   calculated→observed (§4A.8) and never exceeds the ceiling (§4A.4).
4. Re-run the 001 value-equality snapshot — frames that previously HAD an `eta_seconds` must still match
   (only previously-null frames change). Update the baseline for those, and document why.
5. `./venv/bin/python -m pytest tests/orchestration/ -q` and `ruff check`.

## Acceptance criteria
- [ ] `enrich` emits a non-null, bounded, converging `eta_seconds` on a cold/sparse frame (PI3);
      revert-check confirmed red on pre-integration code.
- [ ] Crossfade ramps calculated→observed across progress (§4A.8) and respects the §4A.4 ceiling.
- [ ] ETA is null only when both calculated and observed are unavailable; terminal path unchanged.
- [ ] `crossfade_eta`/`apply_eta_ceiling` are no longer dead code.
- [ ] `pytest tests/orchestration/` and `ruff check` green.

## Out of scope
- Threading the enriched ETA into the `build_*_event` call sites — 004.
- Segment→chapter ETA composition / convergence-trust — 006.
- The indeterminate cold-load presentation when even bootstrap ETA is impossible — 009.
