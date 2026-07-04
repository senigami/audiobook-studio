# PL-2 — Shared segment-marker output handler + group_needs_render (code-map queue entry)

Task: `design-docs/plans/active/simplification/06_plugin_consolidation.md` PL-2.

Pure refactor, zero behavior change (one deliberate correctness upgrade, noted
below). Two new SDK surfaces:

- `app.studio_plugin_sdk.plugin_utils.make_segment_output_handler(...)` — a
  factory returning an `on_output` closure that parses `[SEGMENT_SAVED]` /
  `[START_SEGMENT]` / `[PROGRESS]` markers with the I17 cancel-guard baked in.
- `StudioPluginContext.group_needs_render(group, pdir, *, force_rerender=False)`
  — the single shared "does this group need (re)rendering" check.

## Why / chokepoint audit performed first

Four `on_output` closures (xtts `bake.py`/`segments.py`, voxtral
`bake.py`/`segments.py`) duplicated the same three-marker parse + I17 guard,
differing (it seemed) only in progress formula. Before writing the shared
factory, every marker branch of all four originals was enumerated against
`docs/checklists/code-review.md`'s "Suppressing or Gating a Shared
Chokepoint" section, because a factory unifying 4 callers is exactly the
shape that check exists for. Two *real* behavioral differences beyond the
progress formula were found and preserved via explicit parameters (never
inferred from engine_id):

1. xtts's two closures mutate job-object attributes
   (`j.completed_render_groups` / `j.active_render_group_index`) in addition
   to calling `update_job`; voxtral's two closures never touch those
   attributes. -> `on_group_completed` / `on_group_started` hooks (no-ops by
   default, matching voxtral's original).
2. voxtral `segments.py`'s `[SEGMENT_SAVED]` branch never called `update_job`
   at all (only wrote segment rows + incremented the counter) — every other
   original does. -> `emit_on_save` (default True; voxtral segments.py's call
   site passes `False`).

The I17 cancel-guard itself (`"[SEGMENT_SAVED]" in line and not
cancel_check()`) is reproduced byte-for-byte and is NOT a factory parameter.

`_group_needs_render` was defined 3x (xtts `bake.py`, voxtral `bake.py`,
mixed `handler.py`). Two of the three (xtts, voxtral) used a bare
`path.exists()` check; mixed's used validated-artifact metadata
(`_is_valid_segment_artifact`: exists, non-empty, and — when parseable as a
WAV — a sane header duration, per INV-3/W-PAR 005). Per
`.agent/rules/modular_architecture.md` ("raw file existence is insufficient
for completion, reuse, or recovery"), the shared method standardizes on
mixed's stricter, already-shipped logic — a deliberate upgrade of xtts's and
voxtral's checks, not new behavior invented for this task. `force_rerender`
defaults to `False` so mixed's original call site (which never passed it)
keeps its exact prior behavior.

## Files changed

- `app/studio_plugin_sdk/plugin_utils.py` — added
  `make_segment_output_handler(...)`.
- `app/studio_plugin_sdk/context.py` — added `MAX_SEGMENT_DURATION_SECONDS`,
  `_validated_wav_duration_seconds`, `_is_valid_segment_artifact` (moved from
  `plugins/tts_mixed/handler.py`) and `StudioPluginContext.group_needs_render`.
- `plugins/tts_xtts/plugin/studio/bake.py` — `_group_needs_render` local
  removed (delegates to `ctx.group_needs_render`); `bake_on_output` replaced
  by `make_segment_output_handler(...)` with a weighted `progress_formula`
  wrapping `_group_job_progress`/`_group_display_updates` (unchanged math)
  and `on_group_completed`/`on_group_started` hooks mutating `j.*`.
- `plugins/tts_xtts/plugin/studio/segments.py` — same change (`gen_on_output`).
- `plugins/tts_voxtral/plugin/studio/bake.py` — `_group_needs_render` local
  removed (delegates to `ctx.group_needs_render`); `bake_on_output` replaced
  by the factory with a linear `progress_formula` (unchanged math, `limit=0.9`
  equivalent). No `on_group_completed`/`on_group_started` hooks (matches
  voxtral's original, which never mutated `j.*`).
- `plugins/tts_voxtral/plugin/studio/segments.py` — `seg_on_output` replaced
  by the factory with a linear `progress_formula` (`limit=1.0` equivalent)
  and `emit_on_save=False` to preserve the original's SEGMENT_SAVED-skips-
  update_job asymmetry.
- `plugins/tts_mixed/handler.py` — `MAX_SEGMENT_DURATION_SECONDS`,
  `_is_valid_segment_artifact`, `_validated_wav_duration_seconds` re-exported
  from `app.studio_plugin_sdk.context` under their original names (imported
  directly by `tests/orchestration/test_correctness_invariants.py`);
  `_group_needs_render` is now a thin wrapper delegating to
  `ctx.group_needs_render` (its `_chunk_output_path` mkdir side effect on
  `segments/` is preserved explicitly since the shared SDK method doesn't
  create directories).
- `plugins/tts_xtts/tests/test_force_rerender.py`,
  `plugins/tts_voxtral/tests/test_voxtral_segments_bake.py` — three tests
  that mocked `ctx` as a bare `MagicMock()` now wire `ctx.group_needs_render`
  to a real `StudioPluginContext` instance's method (a bare MagicMock always
  returns truthy regardless of args, which can't distinguish
  force_rerender=True/False once the check moved behind `ctx`).
- `tests/engines/test_studio_plugin_sdk.py` — added
  `TestMakeSegmentOutputHandlerFactory` (14 tests: marker forwarding, I17
  guard, `emit_on_save`, hooks, extra-kwargs merging, counter mutation) and
  `TestGroupNeedsRender` (8 tests: missing/zero-byte/valid/mismatched
  artifact, force_rerender default/override, multi-segment group).

## Verification

- `./venv/bin/python -m pytest tests/engines/test_studio_plugin_sdk.py plugins/tts_xtts/tests plugins/tts_voxtral/tests plugins/tts_mixed/tests tests/orchestration/test_correctness_invariants.py -q` → 356 passed, 2 skipped.
- R1 revert-check (isolated `git worktree`, not the shared checkout): reverting
  `context.py` alone → `TestGroupNeedsRender` fails with `AttributeError`
  (method doesn't exist) and `test_correctness_invariants.py` fails with
  `AttributeError: module 'plugins.tts_mixed' has no attribute 'handler'`
  (broken re-export import) — both fail for the right reason. Reverting
  `plugin_utils.py` alone → `ImportError: cannot import name
  'make_segment_output_handler'`.
- `./venv/bin/python -m ruff check .` (touched files) → all checks passed.
- Full `./venv/bin/python -m pytest -q` deferred to end of session due to a
  concurrent lane holding the shared conftest pytest lock in this worktree
  set (real TTS server subprocess observed running); see final session
  report for the completed full-suite result.

## Flow impact

None to plugin behavior. `plugin-contract.md` was checked — it does not
document the internal `on_output` closure shape or `_group_needs_render`, so
no spec/contract_version bump is needed (same conclusion as PL-1). The I17
invariant test-path table entries in `design-docs/specs/queue-jobs.md`
(§I17) point at `standard_handler.py`'s closure, which this task did not
touch, and remain accurate.
