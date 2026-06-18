# 003a — Bootstrap cps + velocity reader in `state_performance`

- **Status:** done
- **Workload:** WL-B ETA bootstrap
- **Severity / type:** major · correctness
- **Effort:** M
- **Blocked by:** 001
- **Blocks:** 003b

## Goal
Add a `seconds_per_char` reader to `app/db/state_performance.py` that returns a usable velocity even on a
**cold render** — when `engine_cps` is empty. On a cold render it seeds from `DEFAULT_BASELINE_ENGINE_CPS`
(already in `orchestrator_eta.py:85`) or a per-engine manifest default. This is the velocity source
`enrich` will use (in 003b) to compute a calculated ETA that is never null.

**⚠️ Corrected premise (v2.1):** The original task claimed `predicted_audio_length` and `char_count` "are
both present on the Job." This is **false** — these fields live on the chapter/queue rows, not on the
`Job` dataclass (`app/db/models.py`). Do NOT read them from the `Job` object. The genuine cold-null
scenario is chapter-level `eta_seconds` when `expected_duration` is unavailable; the segment-ETA path
already has `DEFAULT_BASELINE_ENGINE_CPS` as its baseline. Seed cps from the existing constant and/or a
per-engine manifest value. If char-count-based seeding is ever needed, it must be threaded in as a new
explicit parameter — that is separate new-work, not part of this task.

## Why this matters
The captured freeze was a **cold render**: `state_performance.py:11-13` defaults `engine_cps` to `{}`, so
the orchestrator's observed-ETA estimator (`estimate_eta_seconds`, `eta.py:194`) returns `None` for the
first render of an engine — there is no historical throughput yet and no live samples. With null velocity,
`enrich` cannot produce a calculated ETA, so the bar sits with a null ETA (PI3 fails). A bootstrap rate
from `DEFAULT_BASELINE_ENGINE_CPS` (or a per-engine manifest value) gives `enrich` a starting velocity
until live samples arrive. See `../00-architecture-map.md` D4 (corrected) + acknowledged-scope (cold-load).

## Context an executor needs
- `app/db/state_performance.py`: `_DEFAULT_PERFORMANCE_METRICS` (lines 11-14) → `engine_cps: {}`,
  `render_history: []`; `_normalize_performance_metrics` (23-35); existing per-engine cps recording
  (`metrics["engine_cps"][engine_id]` at ~line 84) and reader (~line 104). Mirror the existing
  read/normalize style — do **not** branch on specific engine IDs for core behavior
  (`.agent/rules/modular_architecture.md`).
- `DEFAULT_BASELINE_ENGINE_CPS` is at `orchestrator_eta.py:85` — this is the primary bootstrap constant.
  The new reader should return `1 / DEFAULT_BASELINE_ENGINE_CPS` (seconds-per-char) as its cold-render
  fallback, OR let the consumer supply its own fallback constant via a parameter.
- **Do NOT attempt to read `predicted_audio_length`/`char_count` from a `Job` object** — these fields do
  not exist on `Job`. If a caller wants to supply per-render char-based seeding, it is the caller's
  responsibility to thread those values in explicitly (that is out of scope for this task).
- Per-engine manifest default: the engine's `manifest.json` `behavior` block (`plugins/*/manifest.json`,
  e.g. `text_chunk_limit`); add a `seconds_per_char` (or equivalent) default there if one is needed, OR
  document a single conservative constant fallback. Read via the engine registry / behavior helper, not by
  hardcoding an engine ID.
- `.agent/rules/backend-progress.md` — values rounded to 2 decimals, broadcast only when advancing ≥1%.

## Target shape / contract
- New function in `state_performance.py`, e.g.
  `seconds_per_char(engine_id, *, fallback_cps: float | None = None) -> float | None`:
  1. If `engine_cps[engine_id]` exists and is plausible → return `1 / cps` (warm path, unchanged behavior).
  2. Else if `fallback_cps` is provided → return `1 / fallback_cps` (caller threads in
     `DEFAULT_BASELINE_ENGINE_CPS` or a per-engine value).
  3. Else → per-engine manifest default (read via engine-behavior helper, no engine-ID branch in core),
     or `None` if truly unknown.
- Pure read (no writes to `state.json` in this reader). It must not mutate `engine_cps`.
- Return units must be explicit and documented (seconds-per-char); the consumer in 003b converts as needed.
- **Note:** char-count-based seeding is NOT in scope — see corrected premise above.

## Steps
1. Test first (boundary unit test in a new/extended `tests/db/test_state_performance.py` or the orchestration
   ETA test): with `engine_cps={}` and a `fallback_cps` supplied, the reader returns the bootstrap rate;
   with a populated `engine_cps`, it returns the warm rate; with neither, the manifest default (or `None`).
2. Implement the reader; reuse `_normalize_performance_metrics`/the existing read path.
3. In `enrich`/003b, pass `DEFAULT_BASELINE_ENGINE_CPS` (from `orchestrator_eta.py:85`) as `fallback_cps`.
4. If a manifest default is introduced, add the field to the relevant `plugins/*/manifest.json` `behavior`
   block and read it via the engine-behavior helper (no engine-ID branch in core).
5. `./venv/bin/python -m pytest tests/db/ tests/orchestration/ -q` and `ruff check app/db/`.

## Acceptance criteria
- [ ] `seconds_per_char(...)` returns the warm rate when `engine_cps` has the engine, the bootstrap rate
      when `fallback_cps` is supplied (seeded from `DEFAULT_BASELINE_ENGINE_CPS`), and the manifest/constant
      default otherwise — verified at the boundary.
- [ ] The reader does NOT attempt to read `predicted_audio_length`/`char_count` from a `Job` object (those
      fields do not exist on `Job`).
- [ ] The reader does not mutate `engine_cps` or `state.json`.
- [ ] No engine-ID branching in core code; any per-engine default comes from the manifest via the behavior
      helper.
- [ ] Revert-check N/A (new reader, no pre-existing behavior to break) — instead the unit test pins all
      three branches.
- [ ] `pytest tests/db/ tests/orchestration/` and `ruff check` green.

## Out of scope
- Calling this from `enrich` / crossfading calculated vs observed ETA — 003b.
- Changing the live cps recording path — leave the existing recorder untouched.
