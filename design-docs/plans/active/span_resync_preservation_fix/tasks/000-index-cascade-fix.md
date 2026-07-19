Status: pending

# Task 0 — fix whole-sentence index-cascade misalignment

**Map links:** Part P2 (`01-map.md`); independent of Workloads B/C. Risk: `quality-sensitive`
(data-loss bug in production data path) + `multi-file` (touches sync + its tests).

## Goal

Today, editing/inserting text anywhere in a chapter shifts the row index of every later sentence.
`sync_chapter_segments`'s preservation check (`app/db/segments.py:523`) compares
`existing[i]` to `sentences[i]` — pure position, no content check. If a sentence is inserted or
removed anywhere before row *i*, every row from that point on fails the check even though its
*content* is unchanged, and its manual assignment is destroyed. This bug requires **no manual
sub-sentence splits at all** — it's independent of the RC-1 anchor problem and can be fixed now.

## Exact location

`app/db/segments.py`, function `sync_chapter_segments`, lines ~507-539 (the loop that builds
`sentences` and compares to `existing`).

## Target behavior

Before comparing purely by position, first check if `existing[i].text_content.strip() ==
sentences[i].strip()` (today's check, keep it — cheapest path). If that fails, check whether
`existing[i]`'s content appears at a **different** index in the fresh `sentences` list (a simple
content search, not fuzzy matching) — if so, that row's assignment should be preserved and
re-indexed, not discarded. Only fall through to "no match, discard" if the content genuinely isn't
present in the fresh sentence list at all.

**Use one monotonic, order-preserving matching algorithm** (a `difflib.SequenceMatcher`-style
approach: matches must be non-decreasing in both the existing-row sequence and the fresh-sentence
sequence) — not an ad hoc "search for the content somewhere" — so this task's aligner is a strict
subset of what Task 4's `align_segments` will do, and Task 4 can supersede it cleanly (see "Superseded
by" below).

**IMPORTANT — this task REQUIRES updating an existing test's assertions, not just avoiding breaking
it.** `tests/db/test_chapters_sync.py:94`
(`test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`) creates 3 segments
("Repeat.", "Middle.", "Repeat.") with distinct audio, reorders the text to
("Repeat.", "Repeat.", "Middle."), and its CURRENT assertions say `Middle`'s audio goes
`unprocessed` after the reorder. **That assertion encodes the exact bug this task fixes** — "Middle."
has only one occurrence (it's not a duplicate), so once this task's content-aware fallback ships, it
MUST be recognized and preserved at its new position, not discarded. Read the test's full
setup/assertions (`tests/db/test_chapters_sync.py:99-133`) before writing code. This task's
correctness bar for that test:
- The **"Repeat." duplicate-disambiguation assertions stay exactly as they are today** — reordered
  identical content must never cross-match to the wrong row's audio (this is the behavior the test
  name protects, and it survives this fix).
- The **"Middle." assertion must be updated** to assert its audio/assignment IS preserved at its new
  position (not `unprocessed`) — this is part of this task's deliverable, not a side effect to avoid.
If your implementation makes both of these true simultaneously, you've implemented the fix correctly.
If you find yourself trying to keep the old "Middle → unprocessed" assertion passing, stop — that
assertion is the bug, not a spec to protect.

## Steps

1. **Write the failing test first (R1).** In `tests/db/test_chapters_sync.py`, add a test: create a
   chapter with 3+ sentences, assign speakers/audio to sentence 2 and 3, then save with an
   **inserted** sentence before sentence 1 (no reordering, no duplicates — pure insertion). Assert
   sentence 2 and 3's original assignments/audio survive at their new indices. Confirm this test
   FAILS on current code (stash nothing needed — it's new code, just run it and confirm red).
2. **Update `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`'s assertions**
   per "Target behavior" above — the "Middle." assertion changes from `unprocessed` to preserved;
   the "Repeat." duplicate assertions do not change. Confirm the updated test FAILS on current
   (pre-fix) code for the Middle assertion specifically — that's your proof this test was
   previously asserting the bug.
3. Implement the content-aware fallback in `sync_chapter_segments` per "Target behavior" above.
4. Run both tests from steps 1-2 — confirm green.
5. Run the full `tests/db/` suite to catch any other regression.

## Superseded by

This task's aligner is a minimal version of Task 4's `align_segments` (same algorithm class:
monotonic, order-preserving matching). When Workload C lands, Task 4 supersedes this task's inline
logic entirely — don't maintain two aligners long-term. Note this explicitly in Task 4's PR.

## Acceptance criteria

- [ ] New regression test (pure insertion, no duplicates) added, confirmed red on pre-fix code,
      green after.
- [ ] `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` updated: "Middle." now
      asserted preserved (not `unprocessed`) at its new position; "Repeat." duplicate assertions
      unchanged; confirm the updated Middle assertion is red on pre-fix code, green after.
- [ ] Full `tests/db/` suite green.
- [ ] No change to `get_resync_preview` in this task (separate workload).

## Out of scope

Sub-sentence fragment preservation (Workloads B/C — this task only fixes whole-sentence position
drift). Do not attempt to solve the fragment-anchor problem here.
