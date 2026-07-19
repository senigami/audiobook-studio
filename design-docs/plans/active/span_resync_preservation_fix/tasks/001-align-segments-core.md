Status: pending
Depends on: none (new pure function + its own tests)

# Task 1 — `align_segments`: schema-free fragment-run recognition

**Map links:** Part P1 (`01-map.md`). Risk: `quality-sensitive` (this is the core correctness
mechanism the whole plan depends on).

## Goal

A new, pure (no DB access), unit-testable function that decides, given a chapter's existing segment
rows and a fresh sentence list, which existing rows to **preserve in place** (because they're a
fragment-run or whole-sentence match for a fresh sentence), which to discard, and where new rows are
needed. This function does NOT touch the database — Tasks 4/5 wire it in.

## Exact location

New file: `app/db/segment_alignment.py` (or alongside `segments.py` if the codebase convention
prefers — check for a `app/db/` module-per-concern pattern before deciding; either is acceptable,
name it `align_segments`).

## Signature

```python
def align_segments(existing_rows: list[dict], fresh_sentences: list[str]) -> AlignmentResult:
    """
    existing_rows: ordered list of dicts with at least 'id', 'text_content', 'segment_order'.
    fresh_sentences: ordered list of whole-sentence strings from split_into_sentences().

    Returns an AlignmentResult (define as a dataclass or TypedDict) describing, per fresh sentence
    index, either:
      - PRESERVE: a contiguous run of existing row ids (1-3 rows) whose stripped concatenation
        equals this sentence — these rows are untouched.
      - DISCARD_AND_CREATE: no matching run found — this sentence gets a fresh row (today's
        existing behavior for genuinely new/changed sentences).
    Also returns the set of existing row ids that were NOT matched to any fresh sentence (these are
    deleted, same as today).
    """
```

## Algorithm (per Invariants I2, I3 in `01-map.md` — read them before implementing)

For each fresh sentence, in order, try in this sequence:
1. **Exact single-row match**: `existing[i].text_content.strip() == fresh_sentences[i].strip()`
   (today's rule — cheapest, keep it as the fast path).
2. **Fragment-run match**: does a contiguous run of 1-3 existing rows starting near this position
   have `strip(concat(run[j].text_content for j in run)) == strip(fresh_sentences[i])`? (This is
   Invariant I3's resolved falsifier — strip AFTER concatenation, never compare raw slices.)
3. **No match** → this sentence is new/changed; its rows (if content used to occupy this slot) are
   discarded.

**Duplicate-content disambiguation (Invariant I2 — do not skip):** when a fresh sentence's content
matches more than one candidate existing row/run, prefer the match closest to the *same original
position* — replicate `tests/db/test_chapters_sync.py:94`'s exact semantics: reordered identical
content does NOT cross-match; the earliest-position existing row wins for the earliest-position
fresh occurrence.

## Steps

1. Write `align_segments`'s test suite FIRST (R1), covering at minimum:
   - Whole-sentence exact match (today's happy path) — still works.
   - A 2-fragment sub-sentence split, unrelated sentence edited elsewhere → fragments preserved.
   - A 3-fragment split (left/middle/right from `_apply_range_assignment`'s two-call pattern) →
     all 3 preserved as one run.
   - The exact scenario from `tests/db/test_chapters_sync.py:94` (reordered duplicates) — assert
     `align_segments` alone (not the full sync) produces the non-cross-matching result.
   - A sentence with leading/trailing whitespace in the original manuscript, split into fragments,
     re-synced with the same manuscript — assert the strip-then-compare (I3) logic matches
     correctly (this is the falsifier case — must pass).
   - The sentence a split touches is genuinely edited → correctly reports DISCARD_AND_CREATE for
     just that sentence, not the whole chapter.
2. Confirm all new tests fail against a stub/unimplemented `align_segments` (red).
3. Implement `align_segments`.
4. Confirm all tests green.

## Acceptance criteria

- [ ] `align_segments` is a pure function — no DB calls, no side effects, fully unit-testable.
- [ ] All 6 test cases in Steps above pass, each confirmed red-then-green (R1).
- [ ] Handles 1-3 row fragment runs (not just 2).
- [ ] Implements the strip-after-concat rule (Invariant I3), not raw concatenation.
- [ ] Reproduces `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`'s exact
      outcome when fed that test's exact scenario.

## If this task's tests reveal schema-free is insufficient

If a real test case emerges where content-only matching cannot disambiguate (e.g., two adjacent
*fragments* that are themselves textually identical, not just two whole sentences), **stop and flag
it** — do not silently add columns. That triggers Task 2 (conditional). Do not implement Task 2
speculatively; only after Task 1's own tests prove it's needed.

## Out of scope

Wiring into `sync_chapter_segments` or `get_resync_preview` (Tasks 3-5). This task produces and
tests the function in isolation only.
