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
(`app/domain/chapters/helpers.py:116-136`) hashes segment ids for optimistic concurrency — new ids
on every save would churn that hash and risk spurious `RevisionMismatch` conflicts for the user, even
though nothing meaningfully changed. Preserving the row means: don't touch it at all — no
delete, no insert, no update — for any row `align_segments` says to keep.

## Steps

1. Confirm Task 0 (index-cascade fix) has landed first — this task builds on it.
2. Replace the sentence-comparison loop with: call `align_segments(existing_rows, fresh_sentences)`.
3. For each `PRESERVE` result: skip entirely (no DB write for that row).
4. For each `DISCARD_AND_CREATE` result: today's existing behavior (delete old row if present,
   insert new row, invalidate audio via `cleanup_chapter_audio_files`).
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
