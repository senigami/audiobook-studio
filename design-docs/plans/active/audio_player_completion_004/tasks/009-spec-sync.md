Status: complete — 2026-07-10 (owner sign-off pending, see `../02-roadmap.md` Workload C — final task of the plan)

# 009 — Spec sync: data-model.md + audio-player.md

Workload: C · DONE.

Added a "Chapter peaks sidecar" section to `design-docs/specs/data-model.md` (schema, compute-on-request semantics, staleness-by-source-stamp, explicitly no manifest/DB field) — bumped 1.9.0 → 1.10.0 with a changelog row. Updated `audio-player.md` §5.4 and the §1 implementation-status paragraph to describe the actual shipped lazy compute-on-request mechanism (not the rejected orchestrator-hook design) — bumped 1.6.1 → 1.6.2 with a changelog row. Cross-checked both files for consistent field names/semantics.

(Both specs have since moved further — `audio-player.md` is now 1.6.9, `data-model.md` is now 1.12.0 — from later, out-of-plan work; see each spec's own changelog.)

Remaining: this is the last task in the plan — once its owner sign-off item is recorded in `../02-roadmap.md`, the whole plan (pending A/B sign-offs too) is done.

See `status.json` for commit `8cb5d627`.
