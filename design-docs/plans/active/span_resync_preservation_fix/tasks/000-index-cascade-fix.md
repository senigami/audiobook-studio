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

**Constraint — must not break `tests/db/test_chapters_sync.py:94`
(`test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`):** when the same content
appears at multiple fresh indices (duplicates), do not just find "the content somewhere" — preserve
first-occurrence-by-original-position semantics. If unsure how to reconcile, read that test's exact
setup/assertions before writing code (3 segments, text "Repeat. Middle. Repeat." reordered to
"Repeat. Repeat. Middle." — first row's audio must survive, the other two must NOT).

## Steps

1. **Write the failing test first (R1).** In `tests/db/test_chapters_sync.py`, add a test: create a
   chapter with 3+ sentences, assign speakers/audio to sentence 2 and 3, then save with an
   **inserted** sentence before sentence 1 (no reordering, no duplicates — pure insertion). Assert
   sentence 2 and 3's original assignments/audio survive at their new indices. Confirm this test
   FAILS on current code (stash nothing needed — it's new code, just run it and confirm red).
2. Implement the content-aware fallback in `sync_chapter_segments` per "Target behavior" above.
3. Run the new test — confirm green.
4. Run the full existing test file (`pytest tests/db/test_chapters_sync.py -v`) — confirm
   `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` still passes unmodified.
5. Run the full `tests/db/` suite to catch any other regression.

## Acceptance criteria

- [ ] New regression test added, confirmed red on pre-fix code, green after.
- [ ] `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` still passes, unmodified.
- [ ] Full `tests/db/` suite green.
- [ ] No change to `get_resync_preview` in this task (separate workload).

## Out of scope

Sub-sentence fragment preservation (Workloads B/C — this task only fixes whole-sentence position
drift). Do not attempt to solve the fragment-anchor problem here.
