Status: pending
Depends on: Tasks 4, 5 (and 6 for the loss-count assertions)

# Task 7 — full regression coverage (R1 revert-checked)

**Map links:** Risk R1 in `01-map.md` ("the trickiest correctness surface — fragment-run matching
× duplicate disambiguation"). Risk: `quality-sensitive`.

## Goal

End-to-end tests proving the originally-reported bug is fixed, plus the intersection cases the
individual task tests don't cover (each prior task tests its own unit; this task tests the whole
wired system together).

## Steps — each written FIRST and confirmed red on pre-Workload-C code, then green (R1)

1. **The exact originally-reported bug, full stack:** via the actual API route (not just the DB
   function directly) — assign a sub-sentence speaker in a chapter, save unrelated text elsewhere,
   reload the chapter, assert the assignment and its audio are intact.
2. **Duplicate sentence + one occurrence has a split:** a chapter with two identical sentences where
   one occurrence has a manual sub-sentence split — reorder the duplicates on save — assert the
   split's occurrence's assignment follows correctly (this is Risk R1's named intersection case).
3. **Genuinely stale split (sentence actually edited):** assert correct invalidation AND that the
   loss count surfaces (Task 6) — this proves the fix doesn't over-preserve.
4. **Three-way split (`_apply_range_assignment`'s two-call pattern):** assign a speaker to a middle
   portion of a sentence (creating left/middle/right fragments), save unrelated text elsewhere,
   assert all three fragments survive with correct assignments.
5. **Whitespace edge case (Invariant I3):** a manuscript sentence with leading/trailing whitespace,
   split, re-saved unchanged — assert preservation still works (this is the falsifier case from
   `01-map.md`).
6. **Full suite regression:** run `tests/db/`, `tests/api/` (chapter-related), and any frontend
   tests touching `useChapterPersistence` — confirm no unrelated regression.

## Acceptance criteria

- [ ] All 5 scenario tests above written first, confirmed red on pre-Workload-C code, green after
      Tasks 4-6 land.
- [ ] Full `tests/db/`, relevant `tests/api/`, and relevant frontend test suites green.
- [ ] `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` still passes,
      unmodified, throughout.

## Out of scope

New features beyond what Tasks 0-6 built — this task is verification only, not new logic. If a
gap is found here, file it as a fix in the relevant earlier task, don't patch around it in the
test suite.
