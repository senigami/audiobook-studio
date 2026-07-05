# Plan: Close the Hugging Face voice-upload gap

**Location:** in-repo, `design-docs/plans/active/huggingface_voice_upload/` (per this repo's
existing convention — all other Studio 2.0 plans live under `design-docs/plans/active/`).

## What this is

Studio already has a working (but intentionally partial) "export voice → upload to Hugging
Face" feature. This plan closes the gap between that scaffold and the full product spec so a
published voice actually renders correctly on its Hub page (icon, playable sample, tags) and
survives round-tripping with no manual repacking step.

Produced via `/plan-architect`, following a deep-research pass (`deep-research` skill) on the
`huggingface_hub` upload API and a direct codebase inspection that found the real, current gaps
(not hypothetical ones).

## Read first

1. `design-docs/plans/active/v2_huggingface_voice_interface.md` — product-level spec (§6 upload/export flow)
2. `design-docs/plans/reference/v2_huggingface_voice_repo_spec.md` — the exact on-Hub bundle shape (`voice.json`, `README.md`, `icon.png`, `samples/`, `assets/<engine_id>/`)
3. `design-docs/plans/reference/v2_huggingface_upload_implementation.md` — `huggingface_hub` API research (this plan implements its action items)
4. `01-map.md` in this folder — the parts, connections, and invariants for this specific change

## Status protocol (binding for anyone executing this plan)

- Every task file in `tasks/` starts with a `Status: pending | in-progress | complete — <date>`
  line and its steps/acceptance criteria as `- [ ]` checkboxes.
- **Whoever executes a task updates its status line and ticks its checkboxes in the same change
  as the work.** A checklist that doesn't match reality poisons every later session that reads
  this plan — don't defer the update.
- When every task is complete, move this whole folder to
  `design-docs/plans/active/archive/huggingface_voice_upload/` (matching this repo's archive
  convention) and update the cross-links in the three docs above plus `TASKS.md` to point at the
  new path.

## How to pick up a task

Read `01-map.md` first (the connections between tasks matter more than any single task in
isolation), then open the specific `tasks/NNN-*.md` file. Each task file is self-contained: exact
files/line ranges, the target contract, verification commands. Don't start a task whose
`Depends on` isn't yet `complete`.

## Execute

Run `/plan-run` pointed at this folder, or execute tasks manually in dependency order (see
`02-roadmap.md`).
