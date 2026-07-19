# Second scenario round — the menu's remaining 6 candidates

Fable references captured for all 6 (RC-2, AR-2, BR-2, AD-1, PL-1, SD-2). Plans built for 4 of them
(SD-2, AD-1, AR-2, PL-1); RC-2 needs no plan (its fix already shipped — pure calibration answer-key
value); BR-2's findings were folded directly into the already-built RC-1 fix plan (BR-2 IS the blast
radius of that exact fix, not a separate piece of work).

**Twin/Fable 3-way review not yet run on this round** — time-boxed to maximize Fable reference
coverage first, per the "irreplaceable resource" principle. These 4 new plans are DRAFT, same status
as the first round's plans before their reviews landed.

## Real issues surfaced, ranked by product value

1. **AD-1 F3 — genuinely new bug, undocumented until this pass.** UTF-16 code-unit vs. Python
   code-point offset mismatch: any manuscript span with an emoji/astral character before a
   selection silently shifts every later word-boundary snap by one position. Real for modern
   fiction. Plan: `ad1_snap_parity_fixes/00-plan.md`.
2. **BR-2 — found a real gap in the already-built RC-1 plan** before any code was written: the
   9-column INSERT interaction is "the single most likely silent-regression point" if preserve is
   ever implemented as delete+reinsert rather than true skip, and `preserved_ids` could leak into
   audio-file cleanup. Both folded into `span_resync_preservation_fix/01-map.md` and Task 4.
3. **AR-2 — a complete, buildable design** for the plugin-dependency-conflict gap already known and
   backlogged (FUTURE_WORK) but never designed: three-tier heuristic (manifest → real pip resolver
   → heavy-package list), uncertainty always resolves to isolate. Plan: `ar2_isolated_plugin_venv/`.
4. **SD-2 — a real, cheap doc-drift fix**: CLAUDE.md's task-module inventory is stale (bake/export
   were deleted as dead code, not renamed), plus a phantom tracker item (`mixed.py`) that never
   existed. Plan: `sd2_claude_md_task_inventory/`.
5. **PL-1 — a real, ranked product opportunity** (ACX loudness QA) turned into a complete,
   slice-ordered, testable plan, reusing the existing sidecar-cache pattern rather than inventing a
   new one. Plan: `pl1_acx_loudness_qa/`.
6. **RC-2 — confirms the already-shipped fix was correct** (3-cause progress-bar jitter diagnosis
   matches the shipped design doc); pure calibration value, no action needed.

## What's next

Same pattern as round 1: run the twin + Fable 3-way plan review on whichever of these 4 plans is
highest-value to get right before build (AD-1 and AR-2 are the strongest candidates — a real
undiscovered bug and a real backlogged design, respectively). Time/token budget permitting.
