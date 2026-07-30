# RC-1 Task 1 (`align_segments`) — Tamsin adversarial code review

**Reviewer:** Tamsin (empirical / bottom-up lens)
**Date:** 2026-07-19
**Branch:** `implement/rc1-align-segments` · commit `3d973152`
**Files:** `app/db/segment_alignment.py`, `tests/db/test_segment_alignment.py`
**Reference invariants:** `design-docs/plans/active/span_resync_preservation_fix/01-map.md` (I1–I7, R1)

## Verdict

**Approve with required follow-ups.** The algorithm is correct on every input the plan
names, and the duplicate-uniqueness gate is applied to *both* the single-row and the
fragment-run search branches (the specific completeness claim I was asked to verify holds).
Tests all pass and prove real behavior, not tautologies — with two exceptions below. But the
suite has a coverage hole exactly where the plan's own R1 says the risk concentrates
(duplicate × fragment-run intersection), one test (T6) does not exercise the invariant it
names, and the implementation quietly diverges from the "monotonic SequenceMatcher" algorithm
the map specifies (the divergence is *safe*, but it is undocumented and should be recorded so a
future maintainer doesn't restore the map's stated design and think they're preserving intent).

Nothing here blocks landing Task 1 as a pure function. Everything here must be closed before
P2/P3 consume it, because the untested intersection is where audio gets cross-assigned.

## Ground truth loaded

- Map core loaded via SessionStart. `lookup.sh app/db/segment_alignment.py` → `null`: the file
  is new in this branch's single commit and not yet in a shard. Trace is therefore from the
  source directly, not the cached map — disclosed, not papered over.
- Grep confirms **no importer** of `align_segments` / `segment_alignment` anywhere in `app/`.
  Live blast radius = 0 today; this is P1 landing ahead of P2 (`segments.py:492`) and P3
  (`operations.py:270`). My review is scoped to the function's intrinsic correctness against
  I1–I7, since that is what P2/P3 will inherit unchanged.
- `pytest tests/db/test_segment_alignment.py -q` → 7 passed.

## Findings

### F1 — Implementation is greedy first-fit, NOT the "monotonic / SequenceMatcher" algorithm the map specifies (design divergence; currently safe)

`01-map.md` §Big picture and §Parts commit to "**one concrete algorithm** — monotonic,
order-preserving matching (a `difflib.SequenceMatcher`-style approach: matches must be
non-decreasing in both the existing-row sequence and the fresh-sentence sequence)". The code
(`segment_alignment.py:98` single-row, `:135` fragment-run) does **greedy first-unused-fit**
scanning `range(n_existing)` from 0, with no non-decreasing constraint across matches. Pass-2
match order follows ascending *fresh* index and takes the first available existing row.

Why it is nonetheless correct today: the search branches run **only** for
`not is_duplicate_sensitive` content (`:97`, `:105`). For single-row search, non-dup-sensitive
means `existing_counts[sent] <= 1` — at most one existing row can ever equal `sent`, so
"first-fit" and "monotonic" pick the same row. Monotonicity is moot. This is exactly what
lets the unique-`"Middle."` reorder in T5 preserve correctly, and it is *better* than a strict
SequenceMatcher (which would refuse the reordered unique match). So the divergence is a
correctness-neutral-to-positive simplification.

**Required:** record this. The map still tells the next maintainer the algorithm is monotonic
order-preserving; the code isn't. Either update the plan/spec note to say "greedy first-fit,
safe because search is gated to unique content," or a future "let's make it match the design"
refactor will reintroduce SequenceMatcher and *break* the unique-reorder preservation T5 proves.
This is the bedrock-vs-wall split: the design claims monotonic, the call sites do greedy — I'm
flagging it rather than deferring to the design's self-description.

### F2 — Fragment-run search's ambiguity is gated on *whole-sentence* uniqueness, not *run* uniqueness (incomplete gate; low real-world risk)

`is_duplicate_sensitive` (`:94`) counts occurrences of the **whole fresh sentence** among
`fresh_norm` and among **whole existing-row texts** (`existing_counts` is a `Counter` of
`existing_texts`, i.e. per-row strings). For a fragment run, the sentence never equals any
single existing row's text, so `existing_counts.get(sent, 0)` is essentially always 0. The gate
therefore protects fragment-run matching only against *duplicate whole sentences in the fresh
list* (`fresh_counts[sent] > 1`) — it does **not** protect against a unique fresh sentence whose
fragment run is itself ambiguous because the same fragment pattern appears twice in the existing
rows.

Constructed input that exercises the gap:
```
existing = [row("a","Go "), row("b","home."), row("c","Go "), row("d","home.")]
fresh    = ["Go home."]                       # unique as a whole sentence
```
`fresh_counts["Go home."] == 1`, `existing_counts["Go home."] == 0` → not dup-sensitive →
`_find_fragment_run` returns the **first** run `[a,b]` (`:145`), preserving a/b's audio and
leaving c/d unmatched → deleted. The choice of *which* run survives is position-arbitrary.

Assessment: this is not a cross-*sentence* correctness violation (the surviving content is
identical to the deleted content, so no wrong audio is attached to wrong text), and the input
requires two identical adjacent fragment runs with only one surviving fresh sentence — rare in
practice. I2 as written targets reordered *duplicate sentences*, which `fresh_counts` does catch.
So I rate this **not a blocker**, but it is the honest answer to "is the gating complete?": it is
complete for the invariant as stated (duplicate *sentences*), and *incomplete* for duplicate
*fragment runs*, which the plan never explicitly required but R1's "duplicated sentence that also
has a manual split" scenario lives adjacent to. Worth a defensive test (see F5).

### F3 — Pass-1 / Pass-2 interaction: a stray unique single-row match can consume a row a later fragment run needs (order-dependent, low real-world risk)

Pass 2 iterates `unresolved` in ascending fresh order and consumes existing rows greedily. An
earlier fresh sentence resolved by single-row search can claim a row that a later fresh
sentence's fragment run required, fragmenting the run:
```
existing = [row("l","The "), row("m","quick "), row("r","fox.")]
fresh    = ["quick ", "The quick fox."]
```
i=0 `"quick "` (unique) single-row-matches `m` → `used[m]=True`. i=1 `"The quick fox."` fragment
run now can't span `l,m,r` (m used) → `_find_fragment_run` breaks at the used row (`:140-141`) →
sentence reported new, l/r deleted. The "correct" preservation (l,m,r → sentence) is lost.

Assessment: requires a bare fragment (`"quick "`) to appear as a *standalone whole fresh
sentence*, which `split_into_sentences` does not normally emit. **Not a blocker**, but it is a
genuine algorithmic fragility: the greedy pass has no backtracking and no "prefer to keep a row
available for a run" heuristic. If P2's real inputs ever produce it, the symptom is silent audio
loss, not an error. Flagging so it's a known edge, not a surprise.

### F4 — T6 (`test_whitespace_falsifier_strip_after_concat`) does NOT exercise the invariant it claims (weak test)

The test docstring asserts it proves I3's "strip **after** concatenation, never compare raw
un-stripped slices." It does not. The fixture is `existing = ["Hello ", "world."]`,
`fresh = ["  Hello world.  "]`. The only whitespace that matters is the fresh sentence's outer
padding, which `_norm` strips at `:75` **before** `_find_fragment_run` is ever called. Inside
`_find_fragment_run`, the final `acc = "Hello " + "world." = "Hello world."` has **no** leading
or trailing whitespace, so `acc.strip()` at `:143` is a no-op and `acc == sentence` would pass
identically. A regression that deleted the `.strip()` on `acc` (comparing raw concatenation)
would still make this test green. The test proves `_norm` on the fresh side, not strip-after-
concat on the accumulator side.

A fixture that actually falsifies raw-slice comparison needs outer whitespace *on the
fragments*, e.g. `existing = [" Hello", " world. "]`, `fresh = ["Hello world."]`: raw
`acc == " Hello world. "` ≠ sentence, only `acc.strip()` matches. That is the test I3 asked for
("Task 1's test fixture must exercise the actual `preserve_gap=True` code path"). **Required:**
strengthen T6 (or add a sibling) so the `acc.strip()` at `:143` is load-bearing.

Note the prefix-prune at `:146` (`sentence.startswith(stripped_acc)`) does correctly use
`stripped_acc`, and I could not construct a false-negative prune: `strip()` only touches the
accumulator's edges, the leading edge is fixed after the first non-space char, and a
trailing-space strip is re-satisfied when the next fragment appends. So the strip logic is
*sound*; it's just not *tested*.

### F5 — Missing coverage of the plan's own #1-risk surface (R1: duplicate × fragment-run intersection)

`01-map.md` R1 states plainly: "Task 1's own unit tests must cover the unbounded case too" and
the intersection "a duplicated sentence that *also* has a manual split in one of its two
occurrences, AND a 4+-fragment run." The suite has T4 (4+ run) and T5 (reordered duplicate whole
rows) but **nothing at their intersection** — which R1 calls "the trickiest correctness surface
in this plan." Concretely missing:

1. A fresh list with a duplicate sentence where one occurrence exists as a fragment run:
   `existing = ["Repeat.", "Rep", "eat."]`, `fresh = ["Repeat.", "Repeat."]` — must confirm the
   dup gate (`:94`) prevents the fragment run `["Rep","eat."]` from matching the second
   `"Repeat."` (it does, by code trace: `fresh_counts["Repeat."]==2` → skip both branches → run
   deleted). **No test asserts this**, so the "fragment-run search is *also* gated" claim in the
   docstring (`:66-68`) is proven only by my reading, not by CI.
2. The F2 ambiguous-double-run input, to pin the currently-arbitrary "first run wins" behavior.
3. Empty-input degeneracies: `align_segments([], [])`, `align_segments(existing, [])` (everything
   unmatched → deleted), `align_segments([], fresh)` (everything new). None covered.
4. A row with `text_content=None` (both `_norm` at `:72` and `.get(...) or ""` at `:142` handle
   it, but no test locks the contract).

**Required:** add at least (1) and (3); (1) is the direct R1 deliverable and the one that would
catch a future weakening of the gate.

## What I verified as CORRECT (not just passing)

- **T5 is a strong, non-tautological test** and is the crux I2 case: it proves *both* halves —
  duplicate `"Repeat."` never cross-matches (position-only via pass 1), *and* unique `"Middle."`
  is recognized and preserved across its position move via single-row search. Traced by hand,
  the assertions match the algorithm's actual output. This is the test that encodes the round-2
  correction to `test_chapters_sync.py`'s intent.
- **The dup gate is applied to both branches.** `is_duplicate_sensitive` is computed once
  (`:94`) and guards single-row (`:97`) and fragment-run (`:105`) alike. The specific
  completeness claim in the task — "both single-row search AND fragment-run search skip
  past-position search for duplicate-sensitive content" — is **true** for duplicate *sentences*
  (the invariant as stated). Its only gap is duplicate *fragment runs* (F2), outside I2's letter.
- **Unbounded run (T4) genuinely uncapped** — `_find_fragment_run` has no length bound; prefix
  extension at `:139-147` is the termination, matching the plan's "no upper bound."
- **Pass 1 is safe** — position+content equality together (`:84`) cannot cross-match, as the
  docstring claims; `used[i]` is always False at that point (harmless redundant guard).
- **Prefix-prune is sound** (see F4 note) — no false-negative input found.

## Confidence & falsifier

**Confidence: high** on the two verdict-bearing claims (algorithm correct on all plan-named
inputs; dup gate complete against I2-as-stated). **Medium** on "no other input breaks it" — F2
and F3 are the two fragility classes I found by construction; I did not exhaustively prove
absence of a third. What would change my call: a fragment-run input from *real*
`split_into_sentences` output (not hand-built rows) that produces the F3 ordering, or a P2
integration that counts preserved *runs vs rows* differently than this function models
(R0 item 6 — the `preserved_assignments_count` unit ambiguity — is a P3/P5 decision this pure
function correctly leaves open).

## Not escalating

This is within-ceiling: a pure function with a bounded input space, zero live blast radius, and
a clear plan to check against. No owner's-call category is triggered. The required follow-ups
(F4, F5) are test additions, not design reversals.
