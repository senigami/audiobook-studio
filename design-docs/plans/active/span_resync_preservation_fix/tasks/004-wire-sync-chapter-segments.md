Status: pending
Depends on: Task 3

# Task 4 — wire `align_segments` into `sync_chapter_segments`

**Map links:** Parts P2, P6 (`01-map.md`). Risk: `quality-sensitive` (production data path) +
`multi-file`.

## Goal

Replace the positional whole-sentence-equality check (`app/db/segments.py:523` and surrounding
logic ~507-569) with a call to `align_segments`, and — this is the core mechanism, not a detail —
**preserve matched rows in place**: do not delete-and-reinsert rows that `align_segments` says to
preserve. Only delete rows that are genuinely unmatched, and only insert rows for genuinely new
sentences.

## Exact location

`app/db/segments.py`, function `sync_chapter_segments`, lines ~492-599.

## Why "preserve in place" and not "recreate with same content" (read before implementing)

Recreating a row (even with identical content) mints a new row id. `_build_base_revision_id`
(`app/domain/chapters/helpers.py:116-136`) hashes segment id, order, AND text for optimistic
concurrency — new ids on every save would churn that hash and risk spurious `RevisionMismatch`
conflicts for the user, even though nothing meaningfully changed. Preserving the row means: its id,
`character_id`, `speaker_profile_name`, and audio fields are never touched (no delete, no insert, no
content update) for any row `align_segments` says to keep. **`segment_order` is the one exception**
(Invariant I1a) — if an earlier edit shifted this row's position, its `segment_order` IS updated to
match, and that's a legitimate, expected contribution to the revision hash (a real position change
from a real edit), distinct from the id-churn this task exists to prevent.

## Steps

1. Confirm Task 0 (index-cascade fix) has landed first — this task builds on it, and this task's
   `align_segments` call SUPERSEDES Task 0's inline aligner entirely (same algorithm class,
   generalized to fragment-runs). Remove or delegate Task 0's standalone matching logic to
   `align_segments` as part of this task, so there is exactly one aligner in the codebase after
   this lands.
2. Replace the sentence-comparison loop with: call `align_segments(existing_rows, fresh_sentences)`.
3. For each `PRESERVE` result: skip entirely (no DB write for that row).
4. For each `DISCARD_AND_CREATE` result: today's existing behavior (delete old row if present,
   insert new row, invalidate audio via `cleanup_chapter_audio_files`). **Critical — BR-2's
   blast-radius analysis of this exact design found a new risk not caught by RC-1's own plan
   reviews:** the set of ids passed to `cleanup_chapter_audio_files` for deletion must be built
   ONLY from rows in the `DISCARD_AND_CREATE` set — never from a raw "all rows not in the fresh
   list" computation that could accidentally include a `PRESERVE`d row's old id if any bookkeeping
   step re-derives the discard set incorrectly. Add an explicit test: a chapter with both a
   preserved fragment run and a genuinely-discarded row in the same save — assert the preserved
   run's audio file is NOT touched by the cleanup pass.
5. **Inline fix for Invariant I5 (owner-recommended, see `01-map.md` Open Questions):** since this
   task already touches the INSERT statement (`segments.py:566-569`), extend it to write all 18
   columns (or explicitly default the extra 9 sensibly) instead of only 9 — this fixes the
   silent-data-loss bug for newly-inserted rows at zero extra cost, since preserved rows already
   keep their full data by not being touched at all. If the owner/engineer executing this task
   decides to file it separately instead, note that decision in this task's completion notes.
6. Track and return `lost_assignments_count` (rows that went `DISCARD_AND_CREATE` and had a non-null
   `character_id` before) — Task 6 wires this to the API response.
7. Write the RC-1 regression test FIRST (R1): assign a sub-sentence speaker, save with an unrelated
   edit elsewhere, assert the assignment AND its audio survive with the SAME row id. Confirm red on
   pre-fix code, green after.

## Acceptance criteria

- [ ] `sync_chapter_segments` calls `align_segments`, no longer does raw index+equality comparison.
- [ ] Preserved rows are provably untouched (same id, verified in test via id equality, not just
      content equality).
- [ ] RC-1 regression test written first, confirmed red then green.
- [ ] Audio survives for preserved fragment rows (test asserts `audio_status`/`audio_file_path`
      unchanged).
- [ ] `_build_base_revision_id`'s hash is stable across a preserve-only save (add a test asserting
      the revision id doesn't change when nothing meaningful changed).
- [ ] Works correctly under both transaction postures (Invariant I4) — conn-owned (`update_chapter`)
      and self-committing (explicit resync route).
- [ ] I5 decision recorded (fixed inline or explicitly deferred with a filed follow-up).

## Out of scope

`get_resync_preview` (Task 5). Surfacing the loss count on the API response (Task 6).
