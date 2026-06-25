# 018 — Render without a global default: correct per-level fallback chain

- **Status:** done (corrected 2026-06-17)
- **Workload:** Real-app bug fixes
- **Severity / type:** major · logic (fusion-panel triage, 2026-06-17)
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
The queue gate uses the correct resolution chain and blocks only when a content
segment is unassigned AND there is no default at any level. It must NOT fall
back to an arbitrary/first-available voice.

## Owner-specified rule (binding)
A content segment's voice resolves as:
**segment own → chapter default → book/project default → global default → (only then) ERROR**

The render must work whenever every segment can resolve a voice. The gate
therefore blocks **ONLY when some content segment is unassigned AND there is no
default at ANY level** (chapter / book / global / explicit). A blank global
default must NOT block when segments are assigned or a chapter/book default
exists. No arbitrary fallback is permitted.

## What was wrong (prior implementation)
`_first_available_profile()` was appended to the `active_profile` chain at all
three render sites. It picked a voice arbitrarily (first alphabetical speaker,
or a speaker named "Narrator") when no default was configured, masking the
actual error and silently using the wrong voice for uncast chapters. It also
caused the gate to NOT block when it should (some unassigned + no default at any
level) because the arbitrary fallback would satisfy the not-None check.

## What was done
`app/api/routers/generation.py`:

- Deleted `_first_available_profile()` entirely (no remaining uses).
- At all three render sites (`api_add_to_queue`, `api_bake_chapter`,
  `api_generate_segments`): replaced the old chain ending in
  `_first_available_profile()` with the correct two-step logic:
  1. `effective_default` = explicit pick → chapter default → project/book default
     → global default (blank = None).
  2. `seg_profiles` = `_resolved_segment_profiles(chapter_id, ...)` (existing helper,
     unchanged — already returns each content segment's own or character voice or None).
  3. `has_unassigned` = `any(not p for p in seg_profiles)`.
  4. Gate: if `has_unassigned and not effective_default` → 400 "No voice available…"
  5. `active_profile` = `effective_default or next((p for p in seg_profiles if p), None)`
     (used only when a default exists; never borrows an arbitrary voice).
- For `api_bake_chapter`: the chapter and project rows are now read after the DB
  chapter lookup (so `project_id` is available), before the engine resolution.

Tests in `tests/api/test_api_queue.py`:
- `test_add_to_queue_blocks_when_no_default_and_no_segments_assigned`: replaces
  the old "speaker exists but no default → proceeds" test; now asserts that a
  registered speaker with no default and no segment assignments → 400 (correct rule).
- `test_add_to_queue_all_segments_assigned_no_default_proceeds` (T1): all segments
  assigned, global blank → proceeds (was blocking; core regression fix).
- `test_add_to_queue_some_unassigned_with_chapter_default_proceeds` (T2): some
  unassigned + chapter default, global blank → proceeds.
- `test_add_to_queue_some_unassigned_with_project_default_proceeds` (T3): some
  unassigned + project/book default, no chapter default, global blank → proceeds.
- `test_add_to_queue_some_unassigned_no_default_anywhere_blocks` (T4): some
  unassigned + no default anywhere → 400 (the only error case).

R1 revert-check confirmed: T4 and the `no_default_and_no_segments_assigned` test
both failed on the pre-fix code (the old `_first_available_profile()` fallback
incorrectly allowed them through or blocked the wrong case).

## Edge cases decided
- **Zero segments (empty chapter):** `seg_profiles = []`, `has_unassigned = False` →
  gate passes and `active_profile = effective_default or None`. If
  `effective_default` is also None, `active_profile` is None, but
  `_validate_generation_engines` tolerates a None profile (it only iterates assigned
  profiles). An empty chapter with no default renders as a no-op, which is safe.
- **All segments assigned, no default:** `has_unassigned = False` → gate passes;
  `active_profile = None` (no default); each segment's own voice drives rendering.
