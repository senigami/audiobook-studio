# Code review — RC-1 Task 1 implementation (`align_segments`)

**Branch:** `implement/rc1-align-segments` (`3d973152`)
**Files:** `app/db/segment_alignment.py`, `tests/db/test_segment_alignment.py`
**Scope:** Task 1 only (align_segments core) — not yet wired into `sync_chapter_segments` /
`get_resync_preview`.
**Reviewing against:** my own RC-1 root-cause reference and both prior plan reviews
(`.agent/frontier-calibration/reviews/RC-1-plan-fable-review.md`,
`RC-1-v2-plan-fable-review.md`), plus a fresh line-by-line trace of this implementation.

## Verdict

**Needs changes — do not wire into `sync_chapter_segments`/`get_resync_preview` until fixed.**
The implementation correctly solves everything my two plan reviews checked for (the 2/3-way
fragment-run reconstruction, the unbounded-run case, schema-free I6/I7 compliance, the
pre-existing committed duplicate test's exact semantics). But it contains a real, unguarded
algorithmic bug in the "content-uniqueness gating" refinement the coordinator specifically
asked me to check — and that bug lands exactly on Risk R1, the intersection the plan itself
named as "the trickiest correctness surface," which none of the 7 shipped tests exercise. I
traced it by hand against the actual code (not the tests) and confirmed it destroys manual
sub-sentence assignments on a supported, common scenario, including on a literal no-op resave
with zero edits.

## What I checked

- Read `app/db/segment_alignment.py` in full (149 lines) and hand-traced the algorithm against
  8 scenarios: the 7 in the test file plus one I constructed (duplicate sentence + split, see
  below).
- Cross-checked `_build_base_revision_id` (`app/domain/chapters/helpers.py:116-136`) to verify
  what it actually hashes, since Task 4 (already plan-reviewed) claims preserve-in-place is
  what keeps this hash stable.
- Verified the pre-existing committed test's semantics
  (`tests/db/test_chapters_sync.py:94-133`, read directly in my v2 plan review) against this
  module's reproduction of it.

## 1. The content-uniqueness refinement — is it correct and sufficient?

**Not sufficient — it's a real regression, not just an unproven edge case.** The refinement
(`segment_alignment.py:94`, `is_duplicate_sensitive = fresh_counts[sent] > 1 or
existing_counts.get(sent, 0) > 1`) is applied as a single blanket gate that disables **both**
the single-row content search (line 97) **and** the fragment-run search (line 105) for any
fresh sentence whose full text is duplicated anywhere in the fresh list or the existing rows.
This is stricter than what the twice-reviewed plan actually specified. `01-map.md`'s Invariant
I2 (which I read and cited approvingly in both prior reviews) says: *"prefer the match closest
to the same original position"* — a **proximity tiebreaker among candidates**, not a rule that
disqualifies duplicate-content sentences from search entirely. The implementation replaced
"tiebreak by position" with "refuse to search," which is a meaningfully different and more
destructive algorithm than what was approved.

**Concrete failing case** (hand-traced against the actual code, not run — construct it as a
regression test before merging):

```python
existing = [
    _row("frag1", "Re"),       # split fragment, assigned a character
    _row("frag2", "peat."),    # split fragment, assigned a character
    _row("whole2", "Repeat."), # second, untouched occurrence of the same sentence
]
fresh = ["Repeat.", "Repeat."]  # the manuscript, UNCHANGED — a pure resave, no edits at all
```

Trace: Pass 1 (`segment_alignment.py:83-88`) compares `existing_texts[0]="Re"` to
`fresh[0]="Repeat."` (no match) and `existing_texts[1]="peat."` to `fresh[1]="Repeat."` (no
match) — both unresolved (a fragment row's text can never equal a whole sentence at the same
index, exactly the original RC-1 defect this whole plan exists to fix). Pass 2
(`segment_alignment.py:92-116`): for both `i=0` and `i=1`, `sent="Repeat."`,
`fresh_counts["Repeat."] == 2` → `is_duplicate_sensitive = True` → **both the single-row search
and the fragment-run search are skipped unconditionally** (the `if not is_duplicate_sensitive`
guards on both line 97 and line 105). Result: `new_sentence_indices == [0, 1]`,
`unmatched_existing_ids == {"frag1", "frag2", "whole2"}` — **every row is destroyed**,
including the fragment run that is trivially, unambiguously reconstructible
(`"Re" + "peat." == "Repeat."`), on a save that changed nothing at all.

This is worse than "not proven correct" — it is a deterministic, always-reachable data-loss
bug for any chapter containing a manually split sentence whose exact text also appears
elsewhere verbatim (a very ordinary case: repeated dialogue like "I love you." or "No." split
for emphasis in one of its occurrences). It fires on every single save of such a chapter, not
just an edit-and-save — strictly worse than the original RC-1 bug for this specific
combination, since the original bug at least sometimes preserved assignments via accidental
index alignment.

**Why the current 7 tests don't catch it:** `test_reordered_duplicates_do_not_cross_match...`
(line 80) tests duplicates with **no split** involved (all three rows are whole-sentence,
unfragmented). `test_two_fragment_split_preserved...` (line 29) and
`test_three_fragment_split_preserved` (line 49) test fragment runs with **no duplicate**
content involved. **No test combines the two.** This is precisely the gap I flagged in my v2
plan review ("Task 1's test list doesn't explicitly test the intersection... duplicate
disambiguation combined with a fragment-run split... a unit-level test... would localize a
failure to the actual function under test instead of surfacing it three tasks later") — and
having now read the actual implementation, that missing test would have caught a real, already
-committed bug, not a hypothetical one.

**Fix direction** (not prescribing the exact code, since this is a review not an implementation
task): the gate needs to move from "is this sentence's content duplicate-sensitive → skip
search" to "is this *specific candidate match* ambiguous given position → prefer the
nearest/first-available one, per I2's actual wording." A workable shape: when `sent` is
duplicate-sensitive, don't skip the fragment-run search — instead, among all candidate runs
(single-row or multi-row) whose content matches, select the one whose starting position is
closest to `i`'s expected original position (mirroring what pass 1 already does for the
simple, single-row, unmoved case), and only fall through to "new/discarded" if no candidate
exists at all or multiple equally-close candidates remain genuinely ambiguous. The existing
`test_reordered_duplicates_do_not_cross_match` case must still pass under this fix (it does
today, but only because it happens to have no fragment runs; the fix needs to preserve that
outcome deliberately, not by accident of the blanket gate).

## 2. Correctness against invariants I1-I7

- **I1** (unrelated edit must leave split rows byte-identical): holds for the plain case
  (`test_two_fragment_split_preserved_when_unrelated_sentence_edited`, traced correctly), but
  **fails** for the duplicate-content intersection above — a "genuinely unrelated" resave (not
  even an edit) still destroys the split. This is a direct I1 violation, not just an unhandled
  edge case.
- **I2** (must not cross-match reordered duplicates, per the committed test): holds — I
  hand-traced `test_reordered_duplicates_do_not_cross_match_but_unique_sentence_is_preserved`
  against the algorithm and it reproduces the committed test's exact outcome (position wins for
  "Repeat.", content-search recovers "Middle." at its new position). Correct.
- **I3** (strip-after-concat, never compare raw un-stripped slices): the algorithm
  (`_find_fragment_run`, lines 129-148) correctly accumulates raw fragment text and only strips
  the outer edges of the accumulated string before comparing to the (already-normalized) fresh
  sentence — matches the invariant's letter. See the test-quality caveat below, though: the
  shipped test for this doesn't actually exercise fragment-side whitespace.
- **I4** (transaction postures): not applicable — this is a pure function, no DB access, as
  documented. N/A for Task 1, correctly deferred to Task 4/5.
- **I5** (9-column data loss on rebuild): not applicable — this module doesn't touch the DB.
  Correctly out of scope for Task 1.
- **I6** (compact_script_view / anchor staleness): moot, and correctly so — no anchor metadata
  is introduced; the module is genuinely schema-free (confirmed: no new columns, no stored
  identity, matches the "resolved, not open" call in `01-map.md`).
- **I7** (versioned-contract directive): N/A, correctly — no schema touched.

## 3. Do the 7 tests actually prove what they claim?

Six of seven hold up to a hand-trace and prove exactly what their docstrings say. One does not
fully deliver on its name:

- **`test_whitespace_falsifier_strip_after_concat` (line 110) overclaims its coverage.** Its
  docstring says it verifies "concatenating existing fragments and stripping the OUTER edges...
  must match the fresh sentence," framed as testing I3's falsifier. But the fixture
  (`existing = [_row("l", "Hello "), _row("r", "world.")]`, `fresh = ["  Hello world.  "]`)
  puts the whitespace artifact only on the **fresh** side, which is stripped by `_norm` at
  `segment_alignment.py:75` (module-level normalization) **before it ever reaches the
  fragment-run comparison logic** at all. The fragments themselves ("Hello " + "world.")
  concatenate to an already-clean "Hello world." with no internal artifact to strip. This test
  therefore exercises `_norm`'s handling of a whole fresh sentence — already implicitly proven
  by the first happy-path test — not the fragment-concatenation-then-strip logic the docstring
  claims to falsify. A genuine falsifier would put the whitespace artifact on the **existing**
  fragment side instead (e.g., a last fragment that itself carries a trailing gap character
  from `preserve_gap=True`'s gap-inclusive sentence splitting, per the module's own docstring
  at line 48), to actually prove `_find_fragment_run`'s `acc.strip()` step
  (`segment_alignment.py:143`) is load-bearing rather than redundant. Not a blocker — the
  underlying strip-after-concat code is very likely correct regardless — but the test doesn't
  prove what it says it proves, and should be strengthened or retitled.

- The remaining six (`test_whole_sentence_exact_match_unchanged`,
  `test_two_fragment_split_preserved_when_unrelated_sentence_edited`,
  `test_three_fragment_split_preserved`, `test_unbounded_fragment_run_four_plus`,
  `test_reordered_duplicates_do_not_cross_match_but_unique_sentence_is_preserved`,
  `test_genuinely_edited_sentence_reports_discard_for_that_sentence_only`) each hold up to a
  manual trace of the actual algorithm, not just to reading the assertions — I re-derived each
  expected result independently from the code and they match.

## 4. Other findings (not blockers, but should be resolved before/during wiring)

- **Undocumented new invariant, not in the reviewed plan.** `PreservedRun`'s docstring
  (`segment_alignment.py:26-28`) states "`segment_order` is NOT part of the untouched guarantee
  — see Invariant I1a." No "I1a" exists in the twice-reviewed `01-map.md` (only I1-I7) — this
  is a new invariant the implementer introduced without updating the plan doc. It's the correct
  call (a preserved run whose fresh position differs from its stored `segment_order` genuinely
  needs that field updated), but it directly tensions with Task 4's already-approved acceptance
  language: *"preserve matched rows in place... no delete, no insert, **no update** — for any
  row `align_segments` says to keep"* (`tasks/004-wire-sync-chapter-segments.md:26-27`). An
  `UPDATE ... SET segment_order = ?` for a repositioned preserved row is still an update, just
  not to content/character/audio fields. Whoever executes Task 4 needs to reconcile "no update"
  with "except segment_order," and the plan doc should gain this as an explicit I1a before that
  task is picked up, not be left implicit in this module's docstring alone.

- **The P6 revision-hash-stability rationale is weaker than my v2 review assumed.** I checked
  `_build_base_revision_id` directly this time (`app/domain/chapters/helpers.py:116-136`): its
  hash payload includes `chapter_row.get("text_content")` (the *entire* chapter text) alongside
  each segment's `id`, `segment_order`, `character_id`, and `speaker_profile_name`. That means
  **any** text save already changes this hash regardless of what happens to segments, since
  `text_content` differs. My v2 review praised "preserving row ids is what keeps this hash
  stable across an unrelated save" (citing `01-map.md`'s own framing) without having read this
  function's actual payload; having now read it, the claim only holds for callers that compare
  revision ids *within* a single request scope where `text_content` doesn't change (e.g.
  `compact_script_view`'s own optimistic-concurrency check), not across an arbitrary
  edit-and-save. This doesn't undermine the fix's value — preserving ids is still strictly
  necessary for `compact_script_view` and any other same-request revision check — but the
  plan's stated rationale for *why* preserve-in-place matters is narrower than advertised, and
  combined with the I1a point above (segment_order does change on reposition), Task 4 should
  verify concretely which caller's `RevisionMismatch` check this is actually protecting before
  citing hash-stability as a benefit in its completion notes.

- **Dead condition, harmless:** `segment_alignment.py:84`'s `not used[i]` check inside Pass 1
  can never be false at the point it's evaluated (nothing has set `used[i]` yet for that same
  index before this check runs) — clutter, not a bug, doesn't need fixing before merge.

- **No ambiguity guard inside `_find_fragment_run` itself for multiple equally-valid candidate
  runs.** The function returns the *first* leftmost matching run (`segment_alignment.py:135`,
  `for start in range(n)`), with no detection of a second, different run that could also
  satisfy the same sentence. Given real fragment text this is exceedingly unlikely to matter
  (it would require two different contiguous unused-row groups that both concatenate to the
  exact same sentence text), and I'm not flagging it as a required fix, but it's untested and
  worth a one-line comment acknowledging the assumption.

## Is this safe to merge / wire in as-is?

**No.** Task 1 in isolation (unwired, dead code with its own test suite) is low-risk to merge
as a branch artifact, but it must not be wired into `sync_chapter_segments`/`get_resync_preview`
(Tasks 4/5) until the duplicate-content gate is fixed to use position-proximity tiebreaking
(per the plan's own I2 wording) instead of blanket search disqualification. As written, wiring
this in would introduce a new, deterministic, always-reachable data-loss bug for any chapter
with a manually-split sentence whose text is duplicated elsewhere — worse in that specific case
than the bug this whole plan exists to fix, since it fires on every save rather than only an
edit-and-save.

## Confidence

High on the duplicate×fragment-run bug — it's a direct hand-trace of the actual shipped code
against a concrete, realistic input, not a hypothetical concern, and I verified my trace logic
twice against the algorithm's literal control flow (lines 92-116). High on the six tests that
do hold up (independently re-derived, not just read). Medium on the `segment_order`/revision-
hash discussion — I confirmed what the hash payload contains, but I have not traced every
caller of `_build_base_revision_id` to know exactly which comparison(s) would be affected by a
`segment_order`-only update; that would need a fuller callsite sweep before Task 4 finalizes
its approach.

## What would change my verdict

A revised `align_segments` (or a follow-up commit on this branch) that replaces the blanket
duplicate-sensitivity skip with position-based tiebreaking among content-matched candidates,
plus a new test reproducing the duplicate+split scenario above (both the no-op-resave case and
a reordered variant) passing correctly. At that point, and with the `segment_order`/I1a
question explicitly resolved before Task 4 starts, I'd move to approve.
