# Implementation map

## Big picture

Replace `sync_chapter_segments`'s positional whole-sentence-equality preservation rule with a
**content-anchored, preserve-in-place** reconciliation: recognize that a run of existing fragment
rows *is* a given fresh sentence by comparing (normalized) concatenated content, not by comparing a
single row's text to a whole sentence at a matching index. When recognized, **keep the existing rows'
id, character_id, speaker, and audio untouched** — do not recreate them (`segment_order` MAY still be
rewritten if an earlier edit shifted positions; see Invariant I1a). Extract this recognition logic
into one shared function, using **one concrete algorithm** — monotonic, order-preserving matching
(a `difflib.SequenceMatcher`-style approach: matches must be non-decreasing in both the existing-row
sequence and the fresh-sentence sequence) — used by both the real sync and the preview, so they can
never drift.

**Fragment-run length is unbounded, not capped at 3.** A single `_apply_range_assignment` call
produces at most 3 fragments, but assignments accumulate across separate edits with no re-merge in
between — a heavily-edited sentence can carry 4+ fragment rows. Match by extending a candidate run
while its stripped concatenation remains a proper prefix of the fresh sentence; there is no upper
bound on run length (finding N1, round 2).

```
 manuscript text_content
        │
        ▼
 split_into_sentences()  ──────────────► fresh sentence list (whole sentences, stripped)
        │
        ▼
 ┌──────────────────────────────────────────────┐
 │  NEW: align_segments(existing_rows, fresh)    │  ← Task 3 (shared function)
 │  for each fresh sentence, in order:           │
 │    1. try exact single-row match (today's     │
 │       rule) — cheapest, most common case      │
 │    2. try fragment-run match: is there a       │
 │       contiguous run of existing rows whose    │
 │       stripped concatenation == this sentence? │
 │       (Task 1 — schema-free, no migration)     │
 │    3. else: no match → this sentence's rows    │
 │       are new/invalidated                      │
 │  position is the tiebreaker when >1 candidate  │
 │  run matches (duplicate sentences) — NEVER     │
 │  cross-match reordered duplicates (Invariant I2)│
 └──────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
 sync_chapter_segments            get_resync_preview
 (Task 4: consumes the            (Task 5: consumes the
  alignment, PRESERVES             same alignment, computes
  matched runs in place,           lost_assignments_count
  only inserts/deletes for         from the SAME function —
  genuinely new/changed            no more duplicated logic)
  sentences — Task 6 fixes
  the index-cascade case)
```

## Parts

| Part | Responsibility | File |
|---|---|---|
| **P1 — `align_segments`** (new) | Pure function: given existing rows (ordered) + fresh sentence list, return a mapping of which existing rows to preserve (and as what run) vs. discard vs. create new. No DB writes. | New, e.g. `app/db/segment_alignment.py` |
| **P2 — `sync_chapter_segments`** | Orchestrates: calls P1, then for preserved runs does nothing (rows already correct), for discarded runs deletes + cleans audio, for new sentences inserts. | `app/db/segments.py:492-599` |
| **P3 — `get_resync_preview`** | Calls P1, computes `lost_assignments_count` from what P1 would discard — no DB writes, preview only. | `app/domain/chapters/operations.py:270-316` |
| **P4 — `_split_segment_at_offset`** | Creates the two (or via two calls, up to three) fragment rows. **Unchanged in this plan** — the fix is in recognition (P1), not creation. | `app/domain/chapters/operations.py:501-539` |
| **P5 — chapter save path** | `update_chapter` calls `sync_chapter_segments` inside its transaction; needs to surface P2's loss count on its return. | `app/db/chapters.py:197-234` |
| **P6 — `_build_base_revision_id`** | Hashes segment **id, order, and text** (`helpers.py:129`) for optimistic concurrency — not id alone. Preserving rows' id/content in place (not re-deriving) is what keeps this hash stable across an unrelated save; a preserved row's `segment_order` MAY legitimately change if an earlier edit shifted positions (Invariant I1a) — that's expected hash movement, not churn to avoid. What must never happen is a *new id* for content that didn't change. | `app/domain/chapters/helpers.py:116-136` |

## Connections (the part no single task sees alone)

- **P1 is the single source of truth both P2 and P3 call.** If a future change touches matching
  logic in only one of them, the two will drift again — exactly the bug this plan fixes at the
  process level, not just the code level. Any task touching alignment logic must touch `align_segments`,
  never P2 or P3 directly.
- **P2's preservation decision directly determines P6's hash stability.** Preserving row *ids* (not
  minting new ones) is what avoids `RevisionMismatch` churn — this is the mechanism, not a footnote.
  A task that "preserves content but creates new ids" has NOT actually fixed the bug from P6's
  perspective.
- **P4 is untouched, but P1 must model its output exactly.** `_apply_range_assignment`
  (`operations.py:385-465`) can call P4 twice for one sentence (a three-way split: left / middle /
  right, with only the middle fragment assigned) — and separate edits over time can add further
  splits with no re-merge in between. P1's fragment-run matching must handle an **unbounded** run of
  contiguous rows mapping to one fresh sentence (prefix-driven extension, not a fixed count).
- **P3's preview must stay a pure read** — it must call P1 and report, never call P2's write path.

## Invariants — must hold across every task

- **I1 (this plan's core correctness bar):** an edit to text that does NOT touch a sentence with
  manual sub-sentence splits must leave every row for that sentence's splits with the SAME id, same
  `character_id`, same `audio_status`/`audio_file_path`/`audio_generated_at`. "Preserve" means these
  fields are untouched, not "recreated with the same content."
- **I1a (reconciles "preserve" with Task 0's re-indexing — finding N2, round 2):** `segment_order`
  is NOT covered by I1's "untouched" guarantee. When an earlier edit shifts sentence positions, a
  preserved row's `segment_order` is rewritten to match its new position — this is expected and
  required, not a violation of "preserve in place." Preserve = id/character/speaker/audio fixed;
  order tracks position. `_build_base_revision_id` hashes order too (P6), so this row's contribution
  to the revision hash legitimately changes when its position changes — that's correct hash movement
  from a real edit elsewhere, distinct from the churn this plan eliminates (a new id for unchanged
  content).
- **I2 (protects `tests/db/test_chapters_sync.py:94`'s INTENT — its literal assertions must be
  updated, not preserved, when Task 0 lands):** when two or more fresh sentences are textually
  identical (duplicates) and reordered, alignment must NOT cross-match — position remains
  authoritative among content-equal candidates. The existing test creates 3 segments ("Repeat.",
  "Middle.", "Repeat.") with distinct audio per row, reorders to ("Repeat.", "Repeat.", "Middle."),
  and its CURRENT assertions say the first row's audio survives while the other two (including the
  now-relocated, uniquely-identified "Middle.") go `unprocessed`. **That "Middle → unprocessed"
  assertion encodes the pre-fix bug, not the protected behavior** (a review blocker, round 2):
  "Middle." is not a duplicate — it has one occurrence — so once Task 0's content-aware fallback
  ships, it MUST be recognized and preserved across its position move (this is exactly what Task 0
  fixes). What must NOT change is the test's protection of the **duplicate** ("Repeat.") rows:
  reordered identical content must never cross-match to the wrong row's audio. **Required action as
  part of Task 0: update this test's assertions so "Middle." is asserted PRESERVED (not
  unprocessed) at its new position, while the "Repeat." duplicate-disambiguation assertions are kept
  exactly as-is.** See `tests/db/test_chapters_sync.py:99-133` for the full setup/assertions —
  read it before touching Task 0, and treat updating its Middle-row assertions as part of Task 0's
  deliverable, not a side effect to avoid.
- **I3 (the falsifier, resolved — read before implementing Task 1):** raw `concat(existing[j..k].text_content)`
  does **not** always equal the fresh sentence, because the DB path calls `split_into_sentences`
  (`app/db/nlp.py:11`) with **`preserve_gap=True`** (not the library default `False` — verify the
  actual call site before assuming default behavior), and `split_sentences`
  (`app/utils/text/textops_splitting.py`) still strips at least `" \t\r"` from each sentence's edges
  even under `preserve_gap=True`, while `_split_segment_at_offset` does raw substring slicing
  (`operations.py:512-513`, no stripping) on text that is already a once-normalized sentence.
  **Correct comparison:** `strip(concat(existing[j..k].text_content)) == strip(fresh_sentence)`.
  Compare after concatenation and stripping the outer edges only — never compare un-stripped raw
  slices directly. **Task 1's test fixture must exercise the actual `preserve_gap=True` code path**,
  not a stripped/default-mode assumption (a review finding, round 2).
- **I4 (transaction modes):** `sync_chapter_segments` is called from three sites with two different
  transaction postures — `create_chapter` (`chapters.py:54`, conn-owned), `update_chapter`
  (`chapters.py:224`, conn-owned), and the explicit resync route (`routers/chapters.py:259`,
  **self-committing**, no passed connection). Any signature change (e.g., returning a loss count)
  must work under both postures.
- **I5 (pre-existing, adjacent bug — decision required, not silently fixed):** `sync_chapter_segments`'s
  INSERT (`segments.py:566-569`) writes only 9 of the table's 18 columns. On every rebuild,
  `sanitized_text`, `performance_data`, `speaker_confidence`, `speaker_basis`, `speaker_evidence`,
  `review_reasons` are silently dropped to NULL, and `needs_review`, `locked`, `ai_suggested` reset
  to 0/false — for **every** row, including ones this plan's "preserve in place" would otherwise
  keep pristine. If Task 4 preserves rows in place (no re-INSERT for preserved runs), this bug is
  *automatically fixed for preserved rows* as a side effect of the mechanism — but rows that are
  genuinely new/changed still lose these columns on insert. See Open Questions for the scope
  decision.
- **I6 (merge interaction):** `compact_script_view` (`operations.py:319`, the inverse merge
  operation) is out of scope for behavior changes, but if any task introduces stored anchor
  metadata (only relevant if Task 1's schema-free approach proves insufficient — see Task 2), a
  merge must not leave stale/dangling anchor references. Schema-free (no stored anchors) sidesteps
  this entirely, which is a point in its favor.
- **I7 (versioned-contract directive):** `chapter_segments` is an internal table, not an external
  versioned contract (manifest/SDK/event envelope/voice bundle/casting card). An additive nullable
  column here does not require a contract version bump. If Task 2 is needed, use
  `add_column_if_missing` (`app/db/core.py:316-321`) — the repo's existing, standard mechanism —
  not a new migration system.
- **I8 (discovered during Task 4 verification, 2026-07-19 — a downstream mechanism this fix does
  NOT own or need to fix, but must be understood before trusting an audio-status assertion):**
  `align_segments`/`sync_chapter_segments` preserving a row (id, character_id,
  speaker_profile_name, audio fields at write time) does NOT guarantee that row's audio stays
  `done` on the *next read*. `get_chapter_segments`'s pre-existing chunk-group canonical-audio-file
  check (`app/db/segments.py`, feeding on `app/domain/chunk_groups.py:build_chunk_groups`) merges
  **contiguous rows sharing the same `character_id`/`profile_name`/`engine`** into one group,
  regardless of order, and only the group's first member's audio file is treated as canonical — any
  other member's individually-rendered audio is correctly re-invalidated on read, because a merged
  group must be re-rendered as one WAV. This is NOT a bug and NOT something Task 4 introduced
  (confirmed via `git log -S` to predate RC-1 work entirely, commit `bb2bb025`) — but it means:
  - **The pre-existing `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` test
    is confounded for its "Middle"/second-"Repeat." audio-status assertions.** All three rows in
    that test share `character_id=None`, so they merge into one group *regardless of sync
    correctness* — the same "unprocessed" outcome would appear even if `align_segments` completely
    failed to preserve those rows. Only the test's "first" row assertion is uncounfounded (it's
    the group's genuine leader). A NEW test
    (`test_same_character_duplicate_rows_are_preserved_at_the_db_row_level_despite_chunk_group_confound`,
    `tests/db/test_chapters_sync.py`) checks the raw DB row (id + character_id) directly, bypassing
    `get_chapter_segments`, to prove preservation is real independent of this confound.
  - **The flagship RC-1 scenario (a manual split assigning a DISTINCT character to a fragment) is
    unaffected** — distinct-character fragments are never merged into someone else's group, so
    their audio genuinely survives end-to-end. Verified by
    `test_rc1_fragment_split_survives_unrelated_edit_distinct_characters`.
  - **Any future regression test asserting audio survival must use distinct-character scenarios**,
    not same-character/narrator duplicates, or it will inherit this same confound and could pass
    even if real preservation logic breaks for the narrator-duplicate case specifically.

## Risks & open questions

- **R0 (BR-2's blast-radius pass on this exact design, 2026-07-19 — ranked by breakage likelihood,
  folded in for the build):**
  1. Preview drift (already I2/Task 5) — the mandatory co-change, restated as the #1 risk by an
     independent blast-radius analysis too.
  2. **The 9-column INSERT interaction (I5) is the single most likely silent-regression point** —
     confirmed independently: if "preserve" is ever implemented as delete-all-then-reinsert-with-
     old-id rather than true skip-the-row, ids/audio survive but the other 9 metadata columns are
     still nulled even for "preserved" rows. Task 4 must literally skip the DB write for preserved
     rows, not just preserve their id.
  3. **`preserved_ids` correctness feeding file cleanup** (already added to Task 4, above) — a
     run half-marked preserved would delete audio files that DB rows still reference.
  4. Duplicate-sentence cross-matching (already I2).
  5. Transaction-posture/signature compatibility across all three call sites (already I4).
  6. **New, not previously flagged: `preserved_assignments_count`'s unit is ambiguous** — a
     preserved *run* of N fragment rows corresponds to 1 fresh sentence; deciding whether the
     preview counts rows or sentences is a real spec decision (record it in
     `design-docs/specs/data-model.md` or `text-processing.md`, not silently pick one).
  7. Schema-free migration: confirmed none needed (I7) — old fragment rows are matched
     retroactively by content on the first post-fix save.
  Also confirmed OUT of blast radius (no change needed): `_split_segment_at_offset`/
  `_apply_range_assignment` (untouched), `compact_script_view` (unaffected under schema-free —
  no stored anchors to dangle), the DB schema/API contract shapes, and the chapter-level
  `audio_status='unprocessed'` stamp on save (intentionally kept, not a regression).
- **R1 (risk):** `align_segments`'s fragment-run matching (unbounded contiguous rows → 1 sentence)
  combined with duplicate-sentence disambiguation (I2) is the trickiest correctness surface in this
  plan. Task 7's test suite must cover the intersection: a duplicated sentence that *also* has a
  manual split in one of its two occurrences, AND a 4+-fragment run (Task 1's own unit tests must
  cover the unbounded case too, not just Task 7's system test).
- **Open question (owner/engineer decision, not blocking the plan):** does Invariant I5's 9-column
  loss get fixed in this same change (cheap: it's the same INSERT statement Task 4 already touches)
  or filed as a separate, smaller task? Recommendation: fix inline in Task 4 since the INSERT is
  already being touched — see Task 4's acceptance criteria for the inline option.
- **Resolved, not open:** whether schema-free (Task 1) or stored columns (Task 2) is the right
  mechanism — Task 1 first, Task 2 only as a fallback if Task 1's tests reveal `align_segments`
  cannot reliably recognize fragment runs from content alone (e.g., two adjacent sentences that are
  themselves textually identical, defeating even position+content — extremely rare, but Task 1's
  test suite must probe it before declaring Task 2 unnecessary).
