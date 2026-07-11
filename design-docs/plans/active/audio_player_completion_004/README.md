# Audio player completion (004 / W5)

> **Status (2026-07-10): all 9 tasks complete, green gate passed, adversarial review complete (3 real findings fixed, 3 notes flagged for the owner — see `status.json`).** The only remaining step is the owner visual/functional sign-off below; do not archive this folder until that's recorded.

This plan closes out [`design-docs/plans/master_fix_plan/tasks/004-audio-player-completion.md`](../../master_fix_plan/tasks/004-audio-player-completion.md) in full. It **supersedes** the remaining unshipped tasks in [`design-docs/plans/active/audio_player_waveform_scrubber/`](../audio_player_waveform_scrubber/) — specifically tasks 008–012 there. That folder's tasks 001–007 (mock prototype, spec 1.6.0, `fitsLegibly`, `WaveformTape`/`WaveformTapeZoom`/`WaveformTapeMinimap`) are already shipped and are load-bearing context for this plan (see `01-map.md`); leave that folder in place as history, but do not execute its 008–012 task files — they are stale drafts this plan replaces with corrected, verified specs.

**Why this plan exists rather than just fixing 008–012 in place:** a fusion-reasoning pass (2 mechanical audits + 2 Fable-tier design passes + a Simplicity Gate) found the original 008/009 drafts contained a redundant double-decode, a TypeScript narrowing bug, a self-failing acceptance test, and mis-scoped feature creep ("Play book"); found the original RST-8 design would still be buggy for audio-group blocks; and found the original W3 backend design's chokepoint **does not fire at all** for the app's default engines. All three findings are folded into the corrected task files here.

## Where this lives

In-repo, matching this project's existing convention (all plans live under `design-docs/plans/active/`).

## Workloads

- **A — W2 finish** (tasks 001–002): wire the already-built tape components into the live `PlayerBar`.
- **B — RST-8** (tasks 003–005): fix real segment/block-navigation bugs on the one live playback path.
- **C — W3** (tasks 006–009): backend peaks sidecar, computed lazily on first request.

See `02-roadmap.md` for the dependency graph — A and B are independent and can run in parallel; C's backend half (006–007) is independent of both; C's frontend half (008) is blocked on task 001 landing `TAPE_DURATION_CAP_SEC`.

## Status protocol

Every task file starts with a `Status: pending | in-progress | complete — <date>` line and its steps/acceptance criteria are `- [ ]` checkboxes. **Whoever executes a task updates its status line and ticks its checkboxes in the same change as the work.** A checklist that doesn't match reality poisons every later session (including the completion audit) that reads it.

## Owner sign-off gates (cannot be self-certified)

- End of Workload A: tape UX matches the approved mock feel (open/close, zoom, minimap, motion toggle, reduced-motion).
- End of Workload B: segment navigation + block-position label correct in the running app.
- End of Workload C: a real long chapter (>10 min) renders the tape from the sidecar, confirmed via network tab (no full-WAV browser decode).

These are listed explicitly in `02-roadmap.md` and must not be ticked by an executing agent.

## Archive convention

When every task in this plan is `complete` and all owner sign-offs are recorded, move this whole folder to `design-docs/plans/archive/audio_player_completion_004/` and update `design-docs/plans/TASKS.md`'s 004 entry + the `audio_player_waveform_scrubber/README.md` pointer to say "completed via `audio_player_completion_004/`, archived."
