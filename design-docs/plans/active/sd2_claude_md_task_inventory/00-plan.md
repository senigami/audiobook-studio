# Plan — correct CLAUDE.md's orchestration task-module inventory

**Status:** DRAFT — awaiting twin + Fable plan review. No code changes made producing this plan.
**Feeds from:** `.agent/frontier-calibration/references/SD-2.md` (Fable spec-drift reference,
2026-07-19).

## Problem

CLAUDE.md:131 lists task modules as `synthesis, api_synthesis, assembly, bake, export,
sample_build, sample_test`. Reality: `bake.py`/`export.py` were deleted 2026-07-16 (`f0abe35e`) as
unwired dead code — their capabilities ship as `is_bake` on `SynthesisTask` and via
`AssemblyTask(is_audiobook=True)` + route-level `export_chapter_audio()`, never as dispatched task
classes. `segment_synthesis.py` (added Phase 12.5) is real and undocumented. Separately,
`REMAINING_TASKS.md:53` tracks a `mixed.py` → `composite.py` rename for a file that never existed in
git history — a phantom tracker item doc 06 §3.6 already resolved on 2026-06-10 but never closed out.

## Fix

1. **CLAUDE.md:131** — replace the module list with the verified-current inventory:
   `synthesis`, `segment_synthesis`, `api_synthesis`, `assembly`, `sample_build`, `sample_test`
   (plus `base.py`). Add one clause noting bake is a `SynthesisTask` flag
   (`is_bake`, not a dispatched task) and export splits between `AssemblyTask(is_audiobook=True)`
   (M4B) and the synchronous `export_chapter_audio()` route (chapter MP3) — so a reader isn't left
   wondering where bake/export capability actually lives.
2. **`REMAINING_TASKS.md:53`** — close the `mixed.py` → `composite.py` item as resolved/N/A,
   citing doc 06 §3.6's 2026-06-10 finding (no `mixed.py` ever existed; likely a misnamed reference
   to the mixed-engine plugin or mixed-generation identifiers, not a module). Move to
   `COMPLETED_WORK.md` or delete per this repo's own tracker convention — check which the repo does
   for resolved-as-N/A items before choosing.

## Open item requiring a human call (not blocking the doc fix)

Whether the original `mixed.py` line item was a misnamed pointer to the mixed-engine plugin (doc
06's hypothesis) or a planned-but-never-built module — not recoverable from the repo. Doc 06 already
flags this as needing human judgment; this plan doesn't re-litigate it, just closes the stale
tracker entry per doc 06's existing finding.

## Task

1. Apply CLAUDE.md:131's correction exactly as above.
2. Close `REMAINING_TASKS.md:53` per doc 06 §3.6, in whatever form this repo uses for
   resolved-as-N/A tracker items.
3. Sanity check: `grep -n "bake\|export\|mixed.py" CLAUDE.md REMAINING_TASKS.md` after the edit —
   confirm no other stale reference to the deleted task classes or the phantom module remains.
4. No test needed — documentation-only fix, no behavior change.

## Out of scope

Deciding the `mixed.py` origin mystery (see Open item above) — this plan only closes the stale
*tracker entry*, per doc 06's already-recorded resolution, not the unresolved historical question.
Any decision about whether `segment_synthesis` deserves its own CLAUDE.md subsection beyond the
inventory list (out of scope — this plan only fixes the inventory line).
