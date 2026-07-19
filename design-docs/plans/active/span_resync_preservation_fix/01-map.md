# Implementation map

## Big picture

Replace `sync_chapter_segments`'s positional whole-sentence-equality preservation rule with a
**content-anchored, preserve-in-place** reconciliation: recognize that a run of existing fragment
rows *is* a given fresh sentence by comparing (normalized) concatenated content, not by comparing a
single row's text to a whole sentence at a matching index. When recognized, **keep the existing rows
untouched** (id, character_id, speaker, audio) — do not recreate them. Extract this recognition logic
into one shared function used by both the real sync and the preview, so they can never drift.

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
| **P6 — `_build_base_revision_id`** | Hashes segment ids for optimistic concurrency. Preserving rows in place (not re-deriving new ids) is what keeps this hash stable across an unrelated save — this is *why* preserve-in-place is the correct mechanism, not a side effect to manage. | `app/domain/chapters/helpers.py:116-136` |

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
  right, with only the middle fragment assigned). P1's fragment-run matching must handle a run of
  **up to 3** contiguous rows mapping to one fresh sentence, not just 2.
- **P3's preview must stay a pure read** — it must call P1 and report, never call P2's write path.

## Invariants — must hold across every task

- **I1 (this plan's core correctness bar):** an edit to text that does NOT touch a sentence with
  manual sub-sentence splits must leave every row for that sentence's splits byte-identical —
  same id, same `character_id`, same `audio_status`/`audio_file_path`/`audio_generated_at`.
  "Preserve" means untouched, not "recreated with the same content."
- **I2 (protects `tests/db/test_chapters_sync.py:94`):** when two or more fresh sentences are
  textually identical (duplicates) and reordered, alignment must NOT cross-match — position remains
  authoritative among content-equal candidates. Verified: the existing test creates 3 segments
  ("Repeat.", "Middle.", "Repeat.") with distinct audio per row, reorders to
  ("Repeat.", "Repeat.", "Middle."), and asserts the **first** row's audio survives while the other
  two go `unprocessed` — i.e., first-occurrence-by-position wins, not content alone. `align_segments`
  must reproduce this exact outcome.
  See `tests/db/test_chapters_sync.py:99-133` for the full setup/assertions.
- **I3 (the falsifier, resolved — read before implementing Task 1):** raw `concat(existing[j..k].text_content)`
  does **not** always equal the fresh sentence, because `split_sentences` (`app/utils/text/textops_splitting.py:133`,
  default `preserve_gap=False`) strips leading/trailing whitespace off each whole sentence, while
  `_split_segment_at_offset` does raw substring slicing (`operations.py:512-513`, no stripping) on
  text that is *already* a once-stripped sentence. **Correct comparison:**
  `strip(concat(existing[j..k].text_content)) == strip(fresh_sentence)`. Compare after concatenation
  and stripping the outer edges only — never compare un-stripped raw slices directly.
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

## Risks & open questions

- **R1 (risk):** `align_segments`'s fragment-run matching (up to 3 contiguous rows → 1 sentence)
  combined with duplicate-sentence disambiguation (I2) is the trickiest correctness surface in this
  plan. Task 7's test suite must cover the intersection: a duplicated sentence that *also* has a
  manual split in one of its two occurrences.
- **Open question (owner/engineer decision, not blocking the plan):** does Invariant I5's 9-column
  loss get fixed in this same change (cheap: it's the same INSERT statement Task 4 already touches)
  or filed as a separate, smaller task? Recommendation: fix inline in Task 4 since the INSERT is
  already being touched — see Task 4's acceptance criteria for the inline option.
- **Resolved, not open:** whether schema-free (Task 1) or stored columns (Task 2) is the right
  mechanism — Task 1 first, Task 2 only as a fallback if Task 1's tests reveal `align_segments`
  cannot reliably recognize fragment runs from content alone (e.g., two adjacent sentences that are
  themselves textually identical, defeating even position+content — extremely rare, but Task 1's
  test suite must probe it before declaring Task 2 unnecessary).
