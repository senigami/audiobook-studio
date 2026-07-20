# RC-1 Task 1 code review — `align_segments` (structural / top-down pass)

Reviewer: Esther (elder, structural half of the reasoning pair)
Branch: `implement/rc1-align-segments`
Files: `app/db/segment_alignment.py`, `tests/db/test_segment_alignment.py`
Anchor: `design-docs/plans/active/span_resync_preservation_fix/01-map.md` (I1–I7, R0–R1)
Map ritual: run. Symbol trace confirms the function is **not yet imported** by any production
path (see F5). `_norm`/`_find_fragment_run` are module-local; no cross-cutting callers to trace.

## Verdict

**Algorithm: SOUND — approve the core mechanism.** I tried to construct a wrong-preservation
(cross-match) against I1/I2/I3 and could not. The uniqueness gating is genuinely complete: **both**
the single-row search (line 97) and the fragment-run search (line 105) are guarded by
`not is_duplicate_sensitive`, so duplicate-sensitive content only ever matches by strict position
(pass 1). The prompt's specific question — is the fragment-run gate present and correct — is
answered YES in code.

**Tests: INCOMPLETE — do not treat this as proven.** The 7 tests that pass do not cover the two
surfaces the plan itself flagged as the trickiest (R1, I3's explicit fixture requirement), and one
test's premise is factually wrong about the code it claims to falsify. This is where the change
falls short, and it is fixable without touching the algorithm.

Confidence: high on algorithm correctness, high on the test-gap findings (F1/F2 are verified
against the real splitter, not asserted).

## Why the algorithm is correct (the argument the plan is owed)

The plan (map §Big picture) specified a *monotonic, SequenceMatcher-style* algorithm. The
implementation is **not** that — it is greedy content-hash matching + uniqueness gating. This is a
deviation from the plan, but a **sound** one, and I'd keep it:

- The only case where match order/monotonicity can change the *outcome* is when two content-equal
  candidates compete — i.e. duplicate content. Duplicates are excluded from all search (position-only).
- Therefore every code path that searches operates on content that is **unique in `fresh`**
  (`fresh_counts[sent] == 1`). A unique fresh sentence has at most one legitimate target, so greedy
  "first unused match" cannot pick the *wrong* row. No cross-match is reachable.
- For fragment runs, `existing_counts` counts whole-row text, which is ~always 0 for a fragmented
  sentence, so the run gate effectively rests on `fresh_counts` alone — and that is sufficient, per
  the same argument: unique fresh sentence ⇒ single legitimate consumer ⇒ picking the first
  matching run is at worst a deterministic loss of a redundant run, never a cross-match.

I verified `_find_fragment_run`'s prefix-break (`sentence.startswith(stripped_acc)`, line 146)
cannot skip a valid run: for any partial run whose full stripped concat equals the sentence, the
intermediate `stripped_acc` is always a prefix of the sentence (interior whitespace that `strip`
drops from the partial is non-trailing in the full string, so it survives in `sentence`). Safe.

## Findings

### F1 — Test 6 does not exercise the real `preserve_gap=True` path (violates I3's explicit fixture rule). HIGH
I3 states verbatim: *"Task 1's test fixture must exercise the actual `preserve_gap=True` code path,
not a stripped/default-mode assumption."* `test_whitespace_falsifier_strip_after_concat` instead
hand-builds `fresh = ["  Hello world.  "]` — a literal with **symmetric** leading+trailing spaces.
That is not what the splitter produces. I ran it:

- `split_into_sentences('Hello world. Edited second sentence.')` → `['Hello world. ', 'Edited second sentence.']`
- `split_into_sentences('  Leading and trailing.  Second one.  ')` → `['  Leading and trailing.  ', 'Second one.  ']`

Real `preserve_gap=True` output carries **trailing** whitespace on every sentence and **leading**
whitespace only on the first (interior sentences have their leading gap consumed by the prior
sentence's trailing gap). The test's symmetric literal exercises neither shape faithfully. Fix: build
`fresh` by calling `split_into_sentences(...)` on real text, and assert preservation for an *interior*
sentence (trailing-only ws) as well as the first (leading+trailing).

### F2 — The plan's (and the test's) stated reason the strip is safe is factually wrong; the real protection is load-bearing and undocumented-as-such. HIGH (latent fragility)
I3 and Test 6's docstring both claim `split_sentences` *"still strips at least ' \t\r' off each
whole sentence's edges even under `preserve_gap=True`."* It does **not** — `textops_splitting.py:127-128`
is a raw slice `text[start:gap_end]` with no strip (stripping lives only in the `preserve_gap=False`
branch, line 133). The code works anyway **only because** `_norm()` (line 21) and
`_find_fragment_run` apply their own `.strip()` to both sides. That strip is load-bearing, and the
codebase currently documents a false reason for why it can be relied upon. Risk: a future
"simplification" that trusts the plan's comment and removes `_norm`'s strip would silently break
matching (every fresh sentence would carry a trailing space and fail single-row equality). Fix:
correct the I3 note and the test comment to say *align_segments normalizes both sides; the splitter
does not strip under preserve_gap* — and add an assertion that would fail if `_norm`'s strip were
removed.

### F3 — No test for the duplicate-sentence + manual-split intersection (R1's named trickiest surface). MEDIUM
R1 explicitly requires covering *"a duplicated sentence that also has a manual split in one of its
two occurrences."* None of the 7 tests do. I traced the behavior by hand: e.g.
`existing=["Hello ","world.","Hello world."]`, `fresh=["Hello world.","Hello world."]` → both fresh
occurrences are duplicate-sensitive (`fresh_counts==2`), so search is skipped entirely, pass-1
position match also fails (the split shifted positions), and **all three existing rows are
discarded**. That is safe (no cross-match, consistent with I2's letter) but it is a total
preservation loss for that sentence. Whether "safe over-delete" is the intended contract is a real
decision — it should be pinned by an explicit test asserting the accepted outcome, not left implicit.

### F4 — The fragment-run duplicate gate (line 105) is correct but has zero test coverage. MEDIUM
Test 5 proves only the **single-row** duplicate gate (the "Repeat." rows match by position only).
No test drives a *duplicated* sentence whose occurrence is *fragmented*, which is the only thing that
exercises line 105's `not is_duplicate_sensitive` on the fragment branch. The prompt asks whether
that gate is "correct and complete" — it is in code, but the suite would still pass if line 105's
guard were deleted (F3's scenario would then attempt a run match). Add a test that pins it (this is
the same fixture as F3).

### F5 — Function is not yet wired into either caller; the RC-1 fix is not realized on this branch. LOW (scope note)
Symbol trace: nothing in `app/` imports `segment_alignment` or `align_segments`.
`sync_chapter_segments` (P2) and `get_resync_preview` (P3) still contain their own logic
(`operations.py:293-306` still computes `lost_assignments_count` independently). This is expected —
this is Task 1 (pure function + unit tests) — but it means the branch as-is changes **no production
behavior**, and the plan's central anti-drift guarantee ("P1 is the single source both P2 and P3
call") is not in force until Tasks 4/5 land. Worth stating plainly so nobody reads a green suite here
as "RC-1 fixed."

### F6 — No degenerate-input coverage. LOW
Empty `existing`, empty `fresh`, fresh longer than existing (new tail), and whitespace-only
fragment rows are all untested. I traced them: all behave correctly (empty→empty; extra fresh→new;
a whitespace-only trailing fragment is left out of the matched run and then deleted as unmatched —
benign but could orphan that row's audio in the rare case it carried any). Cheap to add; add at
least the two empty cases and the new-tail case.

## What I did NOT find (checked, clean)

- No cross-match / wrong-preservation reachable under I1/I2/I3 (argument above).
- `_find_fragment_run` prefix-break does not skip valid runs (proof above).
- Unbounded run length is genuinely uncapped (Test 4 real; loop has no bound). Matches plan N1.
- `_norm(None)` and `.get("text_content")` defensiveness are consistent; `["id"]` direct-index is
  fine for DB-sourced rows.
- I1a (segment_order not preserved) is correctly out of this function's concern — it returns
  id-level preservation only; order is the caller's job. Consistent with the plan.

## Recommendation

Approve the algorithm. Block "Task 1 done" on F1 (it is a stated I3 deliverable, not optional) and
add F3/F4 coverage (R1 named them). F2 is a one-line comment/doc correction plus a guard-test and
should ride along since it protects the load-bearing strip. F5/F6 are notes, not blockers.
