# Audio player completion (004 / W5)

> **Status (2026-07-18): all 9 tasks complete, green gate passed, adversarial review complete (3 real findings fixed, 3 notes flagged for the owner — see `status.json`).** The only remaining step is the owner visual/functional sign-off in `02-roadmap.md`'s three checklists; do not archive this folder until that's recorded.

This plan closes out [`design-docs/plans/master_fix_plan/tasks/004-audio-player-completion.md`](../../master_fix_plan/tasks/004-audio-player-completion.md) in full. It superseded the remaining unshipped tasks (008–012) of the now-removed `audio_player_waveform_scrubber/` plan (see `wiki/Changelog.md` for that history).

## Workloads

- **A — W2 finish** (tasks 001–002): wire the already-built tape components into the live `PlayerBar`.
- **B — RST-8** (tasks 003–005): fix real segment/block-navigation bugs on the one live playback path.
- **C — W3** (tasks 006–009): backend peaks sidecar, computed lazily on first request.

See `02-roadmap.md` for the dependency graph and the three owner sign-off checklists.

## Owner sign-off gates (cannot be self-certified)

- End of Workload A: tape UX matches the approved mock feel (open/close, zoom, minimap, motion toggle, reduced-motion).
- End of Workload B: segment navigation + block-position label correct in the running app.
- End of Workload C: a real long chapter (>10 min) renders the tape from the sidecar, confirmed via network tab (no full-WAV browser decode).

## Archive convention

When every task is `complete` and all owner sign-offs are recorded, move this whole folder to `design-docs/plans/archive/audio_player_completion_004/` and update `design-docs/plans/TASKS.md`'s 004 entry, `design-docs/specs/audio-player.md`'s citation of this path (§1 implementation-status), and the `audio_player_waveform_scrubber/README.md` pointer to say "completed via `audio_player_completion_004/`, archived."
