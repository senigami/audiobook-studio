# Sub-sentence span preservation fix — implementation plan

**Status:** DRAFT — awaiting plan review. Not yet approved for build. No code changes made as
part of producing this plan.

**Feeds from:** a root-cause reference (RC-1, 2026-07-18). See
`design-docs/plans/proposals/span_resync_preservation.md` for prior design notes on this same gap
if present.

## Problem (from RC-1)

`sync_chapter_segments` (`app/db/segments.py:492-599`) rebuilds a chapter's segment rows from a
fresh whole-sentence split of the saved manuscript text and preserves an existing row only if:

```python
existing[i].text_content.strip() == sentences[i].strip()   # segments.py:523
```

— same index, exact whole-sentence text. A manually-split sub-sentence row (created by
`_split_segment_at_offset`, `app/domain/chapters/operations.py:501`) holds a *fragment* of a
sentence, which can never equal the whole sentence the splitter re-emits. Every such row — and
every row after it, because the extra row shifts all later indices — is dropped: recreated with
`character_id=None` (segments.py:526/534-535), old rows deleted (:555), audio files removed
(:581-592). This fires on **every ordinary text save** via `update_chapter`
(`app/db/chapters.py:224`), not only on an explicit resync.

**Impact:** real, silent data loss in the flagship sub-sentence-casting feature — the common
edit-and-save flow, not an edge case.

## Goal

Preserve manual sub-sentence speaker assignments across an unrelated text edit elsewhere in the
chapter, and preserve them (or correctly re-flag as invalidated with a clear reason) when the edit
actually touches the split sentence itself.

## Design direction

Replace positional whole-sentence equality with **content-anchored reconciliation**:

1. **Give split rows a durable anchor**, not just position. When `_split_segment_at_offset`
   creates the two fragment rows, record on each: the parent sentence's original full text (or a
   stable hash of it) and the character offset of the split point within that sentence. This is
   the minimal metadata `sync_chapter_segments` needs to recognize "these two rows are a manual
   split of sentence X" independent of row order.
2. **Reconciliation rule, in order of preference:**
   - If a fresh-split sentence's full text matches a *parent anchor* on file (by hash), and that
     anchor has child fragment rows, re-derive the fragments at the recorded offset instead of
     discarding them — i.e., re-run the split against the (unchanged) sentence rather than
     comparing to a whole-sentence string.
   - If the sentence's text changed (parent anchor doesn't match), the split is genuinely stale —
     fall back to today's discard behavior, but only for *that* sentence's fragments, not every row
     after it.
   - Whole-sentence rows keep the existing equality-at-index check, but reconciliation should key
     off content match first and use position only as a tiebreaker — so an edit earlier in the
     chapter no longer misaligns every later row's index.
3. **`get_resync_preview` must share the same reconciliation logic**, not duplicate it (today it
   re-implements the same index+equality check at `operations.py:298-299`; the two paths already
   drift-risk each other). Extract the reconciliation into one function both the real sync and the
   preview call, so the preview accurately predicts what a real save will do.
4. **Surface loss when it's real.** When a sentence *did* change and its manual splits are
   genuinely stale, that's correct to invalidate — but the chapter save flow should not silently do
   this with zero warning on the ordinary save path the way it does today. At minimum, surface the
   same `lost_assignments_count` the preview already computes, on the actual save response, so the
   UI can warn.

## Scope boundaries for this plan

- **In scope:** the reconciliation logic in `sync_chapter_segments`, the anchor metadata added at
  split time (`_split_segment_at_offset`), sharing logic with `get_resync_preview`, a DB migration
  for the new anchor columns/fields, and surfacing the loss count on save.
- **Out of scope:** any change to how splits are created in the UI, the audio pipeline itself
  (only its invalidation trigger), or a broader segment-model redesign.
- **Blast radius note:** this touches the same rebuild function three entry points share
  (`create_chapter`, `update_chapter`, explicit resync) — see BR-2 in the scenario menu for a fuller
  blast-radius treatment if review flags it as needed.

## Task slices (each independently landable + testable)

1. **Schema: add anchor fields to segment rows.** Migration adding `split_parent_hash` (or
   equivalent) + `split_offset` to the segments table/model, nullable, backward-compatible with
   existing rows (which have neither and behave exactly as today).
2. **Write anchors at split time.** `_split_segment_at_offset` records the parent sentence's hash
   and the split offset on both resulting fragment rows.
3. **Extract shared reconciliation function.** Pull the index+equality logic out of both
   `sync_chapter_segments` (segments.py:523) and `get_resync_preview`
   (operations.py:298-299) into one function; both callers use it. No behavior change yet — this
   slice is a pure refactor, tested against current behavior (R1 revert-check: write the test
   first, confirm it passes identically before and after the extraction).
4. **Implement anchor-aware reconciliation.** The shared function gains the anchor-match path:
   unchanged parent sentence + existing anchored fragments → re-derive fragments instead of
   discarding. Changed parent sentence → today's discard behavior, scoped to that sentence's rows
   only (not a full-chapter index cascade).
5. **Fix index-cascade for whole-sentence rows.** Ensure an edit to one sentence doesn't misalign
   the positional check for every row after it — content-match first, position as tiebreaker only.
6. **Surface `lost_assignments_count` on the save response**, and a minimal frontend warning if
   non-zero (scope: reuse the preview's existing warning-modal copy/pattern if one exists).
7. **Tests (per testing-standards.md):** a revert-checked regression test reproducing the exact
   RC-1 bug (assign sub-sentence speaker → edit unrelated text elsewhere → save → assert the
   assignment survives); a test for the genuinely-stale case (edit the split sentence itself →
   assert correct invalidation + surfaced count); a test for the index-cascade fix (multiple splits
   + an edit before them → assert only the actually-affected rows change).

## Open questions for reviewers

- Is content-hash-based anchoring sufficient, or does it need fuzzier matching (e.g., a near-match
  threshold) for the case where the parent sentence changed only trivially (e.g., whitespace)?
- Does re-deriving fragments at a recorded offset correctly handle the case where the *sentence
  splitter itself* would have chosen a different sentence boundary after unrelated edits change
  sentence count/order?
- Is a DB migration the right mechanism, or should the anchor live in a side table to keep
  `chapter_segments` schema stable per the versioned-contract directive?
- Any interaction with `audio_status`/`audio_file_path` invalidation this plan hasn't accounted for?
