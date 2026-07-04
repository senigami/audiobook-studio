# Upgrade `_group_is_done` to validated-artifact check (code-map queue entry)

Task: closes the residual drift `design-docs/specs/queue-jobs.md` §3.7 flagged
in v1.11.1 during the PL-2 Fable review (spun off as background-task
`task_df699af0`, done inline instead). Not part of the plugin-consolidation
plan doc's numbered tasks — a direct spec-driven follow-up.

## What changed

- `app/studio_plugin_sdk/context.py` — added `StudioPluginContext.is_valid_segment_artifact(path)`,
  a thin public wrapper around the existing private `_is_valid_segment_artifact`
  module function (the same check `group_needs_render` already used
  internally). Exposed as a method so callers outside this module don't need
  to import the private helper directly.
- `plugins/tts_xtts/plugin/studio/standard_handler.py` — `_group_is_done`'s
  `if chunk_path.exists(): return True` replaced with
  `if ctx.is_valid_segment_artifact(chunk_path): return True`. All other
  logic (force_rerender short-circuit, all-segments-done check, the
  "claims done but missing — heal to unprocessed" warning + DB write)
  unchanged. This is now the last of the four render-path reuse gates to use
  the validated-artifact standard (xtts bake, voxtral bake, and mixed already
  did via PL-2's `group_needs_render`).
- `plugins/tts_xtts/tests/test_force_rerender.py` — new
  `TestGroupIsDoneValidatedArtifact` class: `test_zero_byte_segment_wav_is_not_reused`
  (R1 revert-checked: fails on pre-fix code because a zero-byte file passes
  `exists()`) and `test_valid_nonempty_segment_wav_is_still_reused` (pins the
  non-WAV-parseable-but-non-empty fallback branch so the stricter check
  doesn't regress the ordinary fixture-based reuse tests).
- `design-docs/specs/queue-jobs.md` — bumped to 1.11.2, §3.7 rewritten to
  state all four render paths now use validated-artifact metadata; no known
  residual drift remains.

## Verification

`./venv/bin/python -m pytest plugins/tts_xtts/tests plugins/tts_voxtral/tests plugins/tts_mixed/tests tests/engines/test_studio_plugin_sdk.py -q` → 338 passed, 2 skipped. Full `pytest -q` → 2219 passed, 3 skipped. `ruff check` on touched files → clean.

## Flow impact

None new — this closes an existing documented gap in the same reuse-decision
flow PL-2 already touched; no new cross-module flow.
