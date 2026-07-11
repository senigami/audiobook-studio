> **Superseded (tasks 008–012 only):** the remaining unshipped tasks in this folder (008–012) are
> replaced by corrected, verified specs in
> [`../audio_player_completion_004/`](../audio_player_completion_004/README.md) — a fusion-reasoning
> pass found real bugs in each (a redundant double-decode + TS narrowing bug in 008/009, a design that
> would still fail on audio-group blocks, and a backend chokepoint that doesn't fire for this app's
> default engines in 011). Do not execute 008–012 as written; tasks 001–007 here are already shipped
> and remain load-bearing context. See the new plan folder for the current, execution-ready versions.

# Audio Player — Scrubbing Waveform & Tape (implementation plan)

This folder turns [`design-docs/plans/audio_player_scrubbing_waveform_proposal.md`](../../reference/audio_player_scrubbing_waveform_proposal.md) into an ordered, verifiable, hand-offable plan. The proposal is the **design source of truth**; the binding contract is [`design-docs/specs/audio-player.md`](../../../specs/audio-player.md) (currently 1.5.0), which Workload 1 rewrites.

## What this builds

A duration-adaptive scrub track + an expandable zoomed **tape** view for the global PlayerBar:

- **Fit, not scope, decides** waveform-vs-bar (a short chapter gets a waveform; a long segment falls to a bar). Scope-blind everywhere.
- The far-right `AudioLines` toggle, when the inline track is a bar, **opens an expanded tape** that grows the bar upward: paged window + moving playhead, **click-to-jump + drag-to-scrub**, a **minimap** (whole-clip map with a draggable window rectangle), and **bounded zoom presets** (cover-slider style).
- **Browser-first**: the whole UX is built against browser-decoded peaks with a **duration safety cap**; a server-computed **peaks sidecar** is folded in later as a transparent source-swap to lift the cap toward the full hour.

Annotation/edit-marking is **post-V2** and excluded.

## Mock-first

Per owner direction, we **prototype the tape in the North-Star mock** (`frontend/src/demo/stages/siteMockup/`) first to nail the visual and feel, then port the approved design to the real app. Workload 0 is the mock; it gates everything else with an explicit owner sign-off.

## How to read this folder

| File | Purpose |
|------|---------|
| `00-audit-report.md` | Verified current-state map (live + mock + backend), reconciliation with `audio-player.md`, findings/risks, locked decisions. |
| `01-roadmap.md` | Ordered workloads W0–W3, dependency graph, per-workload sign-off check, and the one-paragraph spec behind each task. |
| `tasks/NNN-*.md` | Self-contained tasks. Each stands alone: goal, why, exact files (`path:line`), target shape, ordered steps, acceptance criteria, dependencies, out-of-scope. |

## Status tracking

Each task file has a `status:` field (`todo` / `in-progress` / `done`). A workload is complete when all its tasks are `done` **and** its roadmap sign-off check passes. Workload 0 additionally requires recorded **owner sign-off on feel** before Workload 1 starts.

## Execution

This plan is execution-ready for the `planrunner` skill: orchestrator decomposes per task file, delegates implementation to `implementer` agents, verifies each diff, then runs the acceptance check. Workloads 0–2 are pure frontend (no backend); Workload 3 is the only backend work.
