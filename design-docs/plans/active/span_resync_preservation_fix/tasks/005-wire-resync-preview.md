Status: pending
Depends on: Task 3 (can run parallel with Task 4 — both depend only on Task 3)

# Task 5 — wire `align_segments` into `get_resync_preview`

**Map links:** Part P3 (`01-map.md`). Risk: `multi-file`.

## Goal

`get_resync_preview` (`app/domain/chapters/operations.py:270-316`) currently duplicates the same
index+equality check (at `operations.py:298-299`) that `sync_chapter_segments` uses — the exact
drift risk this plan exists to close. Replace its logic with a call to the same `align_segments`
used by Task 4, so the preview always exactly predicts what a real save will do.

## Exact location

`app/domain/chapters/operations.py`, function `get_resync_preview`, lines ~270-316.

## Steps

1. Replace the duplicated comparison logic with a call to `align_segments` (same import as Task 4).
2. Compute `lost_assignments_count` from the alignment result's `DISCARD_AND_CREATE` entries that had
   a non-null `character_id` — same counting logic Task 4 uses, ideally factored into one small
   helper both can call (avoid a second duplication).
3. Confirm this function makes NO DB writes — it must remain a pure preview.
4. Test: run the preview against a scenario with sub-sentence splits + an unrelated edit — assert
   `lost_assignments_count == 0` (previously it would have reported all splits as lost).
5. Test: run the preview against a scenario where a split sentence IS edited — assert the count
   correctly reflects that real loss.
6. **Parity test (important):** for a handful of scenarios, assert the preview's prediction and an
   actual `sync_chapter_segments` call on the same input produce the same preserved/discarded set —
   this is the direct test that the drift risk is closed.

## Acceptance criteria

- [ ] `get_resync_preview` calls `align_segments`, no longer has its own comparison logic.
- [ ] Remains a pure read — no DB writes, verified by test (e.g., assert row count/content
      unchanged after calling preview).
- [ ] Parity test: preview's prediction matches an actual sync's outcome on ≥3 scenarios (happy
      path, split-preserved, split-invalidated).
- [ ] `lost_assignments_count` computed via shared logic with Task 4, not re-implemented.

## Out of scope

Surfacing this count on the actual save API response (Task 6) — this task only fixes the preview
endpoint itself.
