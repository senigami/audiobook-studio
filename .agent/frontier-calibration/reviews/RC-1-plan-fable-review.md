# Adversarial review — span_resync_preservation_fix/00-plan.md

**Reviewing against:** `.agent/frontier-calibration/references/RC-1.md` (my own root-cause finding)
**Plan:** `design-docs/plans/active/span_resync_preservation_fix/00-plan.md`
**Review only — no code or plan edits made.**

## Verdict

**Sound-with-changes.** The core idea — replace positional whole-sentence equality with
content-anchored reconciliation — correctly targets the actual failing condition
(`segments.py:523`) and is the right shape of fix. But the design as written has one
structural gap that will misfire on a supported feature (three-way sentence splits), one
silent half-fix risk (audio not explicitly preserved for re-derived fragments), and a
sequencing choice (tests as a terminal slice) that conflicts with this repo's binding TDD
directive. None of these invalidate the direction; all are fixable before slice 1 starts.

## 1. Is the content-anchored reconciliation design sound, or does it miss a case?

Sound for the single-split case (one sentence → exactly two fragment rows). It correctly
fixes the core RC-1 defect: content-hash matching survives both a full row-count shift
(unrelated edits elsewhere) and a same-position resave of unchanged text, which is exactly
the mechanism I traced (`segments.py:523`'s `existing[i]` requires index alignment that a
split row inflates for every downstream row).

**It misses the chained/multi-split case.** `_apply_range_assignment`
(`app/domain/chapters/operations.py:385`, same-span-id branch, lines 410-426) supports
assigning a speaker to a sub-span that is neither the start nor the end of a sentence — a
three-way split (narrator / character / narrator within one sentence). Look at the actual
call sequence:

```python
if 0 < end_offset < len(text):
    _split_segment_at_offset(conn, chapter_id, left_id, end_offset)   # split #1: splits the WHOLE sentence

if 0 < start_offset < len(text):
    _, mid_id = _split_segment_at_offset(conn, chapter_id, left_id, start_offset)  # split #2: splits the LEFT FRAGMENT from split #1, not the original sentence
    assign_ids = [mid_id]
```

Split #2 calls `_split_segment_at_offset` on `left_id`, whose `text_content` at that point
is already `text[:end_offset]` — a fragment, not the original sentence. If slice 2 ("Write
anchors at split time") naively hashes `seg['text_content']` of the row being split
(`operations.py:508`, `seg["text_content"]`) at each call, the anchor recorded for the
resulting `mid_id`/right-of-split#2 rows will be the hash of an intermediate fragment, not
the top-level sentence that `sync_chapter_segments` re-derives via `split_into_sentences`
(`segments.py:507`). Reconciliation's rule — "if a fresh-split sentence's full text matches
a parent anchor... re-derive the fragments at the recorded offset" — has no anchor to match
against for these rows, because no single row's anchor equals the whole re-split sentence.
The design narrative in section "Design direction" point 1 talks about recording "the parent
sentence's original full text... and the character offset ... within that sentence" as if
there's always one flat offset from one true parent — that's false the moment a sentence
has two split points. This needs either:
- Propagating a stable "root sentence hash" through chained splits (each split reads the
  existing anchor off the row being split, if present, rather than re-hashing its own
  fragment text, and computes the *cumulative* offset back to the root), or
- Explicitly designing for N offsets per sentence (a small ordered list of split points
  against one root anchor) rather than a single offset field.

This is not an edge case to defer — three-way splits are the natural next action after a
two-way split (assign a third speaker to the remaining fragment), and slice 2 as scoped will
silently produce useless anchors for them without an explicit design decision.

## 2. Answers to the plan's 4 open questions

**Q1 — Is content-hash sufficient, or does it need fuzzy matching for trivial changes
(whitespace)?**
Use exact-match-after-normalization (strip + collapse internal whitespace before hashing),
not fuzzy/edit-distance matching. The existing code already normalizes via `.strip()` at
both duplicated check sites (`segments.py:523`, `operations.py:299`) — matching that
convention keeps the anchor and non-anchor paths consistent. True fuzzy matching is actively
dangerous here: if the sentence text changed even slightly, the recorded character offset
may no longer land on the same semantic word boundary, so a "close enough" match could
silently place a speaker mid-word or on the wrong clause after an edit the user made
specifically to that sentence. Clean invalidation (today's fallback) is the safer wrong
answer than a confident-but-wrong fuzzy re-derivation.

**Q2 — Does re-deriving at a recorded offset survive sentence-splitter reboundarying after
unrelated edits change count/order?**
Yes, provided `split_into_sentences` is a pure function of the sentence's own local text
(no cross-sentence context sensitivity) — content-hash matching is index/order-independent
by construction, so reordering, inserting, or deleting neighboring sentences can't break the
match. But this is a load-bearing assumption the plan never verifies. I could not confirm it
either — my RC-1 reference read only the `app/db/nlp.py` delegate, not
`app/utils/text/textops.split_sentences`'s internals. If the splitter uses any
lookahead/lookbehind across sentence boundaries (e.g., abbreviation disambiguation using the
next sentence's first word), a byte-identical sentence could still get re-boundaried
differently depending on unrelated neighbor edits, silently invalidating the hash match for
reasons that have nothing to do with the anchored sentence itself. **This should become an
explicit slice-4 test** (edit adjacent to an anchored sentence in a way that could plausibly
shift context-sensitive splitting) rather than left as an open question — the plan's slice 7
test list (RC-1 repro, stale-case, index-cascade) does not cover it.

**Q3 — DB migration with nullable columns, or a side table?**
Nullable additive columns on `chapter_segments`, not a side table. The anchor is 1:1 with a
segment row's lifecycle (created with the row via split, potentially cleared on merge) —
that's exactly the shape of `audio_status`/`audio_file_path`, which already live as nullable
columns on the same table. A side table buys isolation/independent versioning that nothing
here needs, at the cost of a join on every reconciliation pass. One thing slice 1 is missing
that the plan doesn't call out: CLAUDE.md's binding "Versioned contracts" directive requires
every schema to declare an explicit version validated at load time — slice 1 should say
explicitly that it bumps whatever version marker `chapter_segments` uses (if any) and updates
the matching spec doc in the same commit, not leave it implicit.

**Q4 — Any audio_status/audio_file_path interaction not accounted for?**
Yes — this is the most important gap in the whole plan (see finding 4 below): the design
never states that anchor-matched, re-derived fragment rows must be added to
`preserved_ids` so they're excluded from the `removed_rows`/`cleanup_chapter_audio_files`
pass (`segments.py:581-592`). Without that, the fix could preserve the *speaker assignment*
while still deleting the *audio file* for a fragment whose text never changed — a half-fix
to the exact bug RC-1 reported ("the associated segment audio is invalidated").

## 3. Gaps, risks, or wrong sequencing in the 7 task slices

- **Tests deferred to a terminal slice (7) conflicts with repo TDD policy.** CLAUDE.md states
  plainly: "TDD is expected... write the failing test first, confirm it fails for the right
  reason, then implement," and `testing-standards.md` R1 requires every bug-fix test be
  revert-checked. Slice 3 correctly folds its test in ("tested against current behavior...
  R1 revert-check"), but slices 4, 5, and 6 don't mention writing their tests concurrently —
  they're all pushed into slice 7. Recommend folding each behavioral slice's test into that
  same slice (as slice 3 already models), with slice 7 narrowed to the cross-cutting
  regression suite (the full RC-1 repro end-to-end), not the first tests for slices 4-6.

- **Slices 4 and 5 split one algorithm into two slices that can drift, ironically the same
  failure mode the plan calls out for `sync_chapter_segments`/`get_resync_preview`.** Slice 4
  (anchor-aware reconciliation for split fragments) and slice 5 (index-cascade fix,
  content-match-first/position-as-tiebreaker for whole-sentence rows) are really one
  reconciliation algorithm with two branches. Landing them as independently-designed slices
  risks exactly the kind of interaction bug the plan is trying to eliminate: e.g., does an
  anchor-matched fragment participate in slice 5's position-tiebreak pass at all, or is it
  fully resolved and skipped? The plan doesn't say. Recommend specifying the unified
  algorithm's control flow (which check runs first, what each branch consumes/produces) as
  part of slice 3's extraction, before slice 4 and 5 are cut as separate landable diffs.

- **No slice for `compact_script_view`'s interaction with anchors.** `compact_script_view`
  (`app/domain/chapters/operations.py:319-382`) merges adjacent same-character segments,
  concatenating `text_content` and deleting one row (`:352-374`). This is squarely in scope
  (it mutates the same `chapter_segments` rows the anchor design touches) but is neither a
  task slice nor called out under "out of scope." If a merged row silently keeps one side's
  stale anchor (pointing to only half of the new merged text), a later save could produce a
  wrong reconciliation decision for that row. At minimum this needs an explicit
  decision — clear anchor fields on merge — stated in scope or explicitly excluded with a
  reason.

- **Duplicate-sentence-text hash collision not addressed.** If the same sentence text (e.g.
  repeated dialogue like "I love you.") appears twice in a chapter and the user manually
  splits both occurrences independently, both anchors share the same content hash. The design
  narrative doesn't say how reconciliation disambiguates which fresh-split sentence position
  a given anchor belongs to when there are multiple hash-identical anchors on file. "Position
  as tiebreaker" is mentioned only for the whole-sentence-row path (design point 2's third
  bullet), not explicitly extended to the anchor-match path — worth stating explicitly that
  anchor matching should also use nearest-position-among-hash-matches as a tiebreaker, not an
  unconditional first-match.

- **Frontend contract update is implicit.** Slice 6 bundles "surface `lost_assignments_count`
  on the save response" with "a minimal frontend warning" in one slice. The response-shape
  change touches `api.updateChapter`'s return type and `useChapterPersistence.ts:24-25`'s
  consumption of `result.chapter` — no slice mentions updating the TypeScript API contract
  types for this new field. Minor, but worth an explicit line so it isn't dropped silently
  during implementation.

## 4. What from my RC-1 analysis does this plan fail to actually address?

- **Audio preservation for re-derived fragments (the single biggest miss).** RC-1's report
  was two-part: assignments revert to narrator, *and* "the associated segment audio is
  invalidated." The plan's design and task slices talk continuously about preserving
  `character_id`/`speaker_profile_name` but never state, anywhere, that a successfully
  anchor-matched fragment row must also retain its `audio_status`/`audio_file_path` and be
  excluded from the `removed_rows` → `cleanup_chapter_audio_files` deletion pass
  (`segments.py:581-592`). As scoped, it's fully possible to implement slice 4 exactly as
  written (character_id preserved via re-derivation) while the surrounding
  delete-and-reinsert machinery in `sync_chapter_segments` (`:555-569`, `:581-592`) still
  treats the "new" re-derived row as not-preserved for audio purposes, since today's
  `preserved_ids` membership is the only thing that protects a row from the cleanup pass.
  This needs to be an explicit acceptance criterion on slice 4, not left implicit.

- **The "resave identical text still destroys splits today" residual case is fixed but never
  named as fixed.** My RC-1 reference flagged, under confidence caveats, that even an
  edit-and-save of *byte-identical* text destroys existing sub-sentence splits today, because
  `sync_chapter_segments` runs unconditionally on any text-update call regardless of whether
  content actually changed for a given sentence. The content-anchored design does fix this
  (hash match succeeds trivially against unchanged text), but the plan never states this as
  a covered case or asks for a test confirming it — worth adding explicitly to slice 7's test
  list rather than leaving it as an implied side effect.

- **The splitter-determinism dependency inherited from RC-1's own "not determinable" section
  is not scheduled for verification anywhere** (see Q2 above) — RC-1 explicitly flagged that
  I hadn't verified `split_sentences`'s internals; the plan's whole hash-matching approach
  now depends on exactly that unverified property, and nothing in the 7 slices verifies it.

## Confidence

High on the chained-split gap and the audio-preservation gap — both are grounded directly in
code already read for RC-1 (`operations.py:410-426`, `segments.py:541-592`) and are concrete,
checkable claims, not speculation. Medium on the duplicate-sentence-hash-collision and
`compact_script_view` points — real gaps in the written plan, but the actual severity depends
on implementation choices not yet made. Low-but-flagged on the splitter-determinism question —
inherited uncertainty from RC-1 that neither analysis has resolved; needs a direct read of
`app/utils/text/textops.split_sentences` before slice 4 lands, not before this review.
