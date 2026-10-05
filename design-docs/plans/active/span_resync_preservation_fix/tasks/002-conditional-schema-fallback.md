Status: pending (CONDITIONAL — do not execute unless Task 1 proves it necessary)
Depends on: Task 1

# Task 2 — additive column fallback (conditional)

**Map links:** Invariants I6, I7 (`01-map.md`). Risk: none if not triggered; `multi-file` if executed.

## Trigger condition

Execute this task **only if** Task 1's test suite surfaces a real case where content-only matching
in `align_segments` cannot disambiguate correctly (e.g., two adjacent fragments with identical
text that schema-free matching cannot tell apart even with position tiebreaking). If Task 1's tests
all pass with the schema-free approach, **skip this task entirely** and mark it `not-needed` in its
status line with a one-line reason.

## If triggered — goal

Add nullable, additive columns to `chapter_segments` recording a stable parent-sentence identity
(e.g., a hash of the original whole sentence) and split offset, so `align_segments` can use stored
identity instead of (or alongside) content comparison.

## Steps (only if triggered)

1. Use `add_column_if_missing` (`app/db/core.py:316-321`) — the repo's existing additive-migration
   helper. Do NOT introduce a new migration mechanism or a side table (Invariant I7 — this is an
   internal table, not a versioned contract; a side table only adds join complexity per review
   feedback).
2. Write the split-time code (`_split_segment_at_offset`) to populate the new column(s).
3. Extend `align_segments` to prefer stored-identity match when present, falling back to content
   match for legacy rows with no stored identity (backward compatible).
4. Test both paths: rows with stored identity, rows without (pre-migration data).

## Acceptance criteria (if triggered)

- [ ] Uses `add_column_if_missing`, not a new mechanism.
- [ ] Backward compatible with existing rows that have no identity column populated.
- [ ] The specific failure case that triggered this task now passes.

## Out of scope

Re-litigating whether schema-free was the right first attempt — Task 1's own test failure is
sufficient justification; don't second-guess it here, just fix the gap it found.
