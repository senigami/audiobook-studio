# RC-1 v2 plan review — Fable vs. twins comparison (round 2)

Same three reviewers (resumed with full v1 context), reviewing the corrected plan built via
`plan-architect`. This round is the more informative calibration data point — it's blind in the
sense that none of the three coordinated with each other, even though each already knew their own
v1 findings.

## Verdicts

- **Fable: build-ready**, two minor process flags, no design blockers.
- **Esther: substantially build-ready, one correctness MUST-FIX** (N1: fragment runs aren't
  bounded at 3 — assignments accumulate across separate edits with no re-merge, so 4+ fragment runs
  are real and the plan's cap would silently resurrect RC-1 on heavily-edited sentences). Also N2
  (internal contradiction: "preserve = touch nothing" vs. Task 0's own re-indexing of
  `segment_order`, which is hashed into the revision id).
- **Tamsin: NOT build-ready — one BLOCKER.** Task 0's stated behavior (preserve content found at a
  different index) necessarily preserves the "Middle" sentence across its one-position move in the
  existing frozen test — but that test's current assertion is `Middle → unprocessed`. Tamsin traced
  three candidate algorithms (difflib, two-pointer lookahead, contiguous-block) and all three
  produce the *correct* behavior (preserve Middle) while *failing* the test's literal assertion,
  because the test's current pass/fail encodes the very data-loss bug this plan exists to remove.
  The plan told Task 0 not to modify that test — an unresolvable trap as written.

## The calibration result: twins outperformed Fable on this pass

**Fable's single pass missed a real blocker and a real correctness bug that both twins caught.**
This is the clearest signal yet in favor of the twins/`fusion-reasoning` design: Fable read the plan
holistically and judged the mechanism sound (correctly — the mechanism *is* sound); the twins each
pushed the plan's abstract rules against a concrete, frozen artifact (the existing test, the real
splitter output) and found where the abstraction breaks. That's exactly the "repo-grounded,
trace-first" edge the reasoning-analyst design was built for.

Esther and Tamsin also converged independently on the same underlying issue from different
angles: Esther's N2 (preserve vs. re-index is contradictory) and Tamsin's blocker (the frozen
test encodes the pre-fix bug) are two facets of one deeper problem — **the plan never stated that
fixing the bug means some existing test *assertions* (not the test's *intent*) must change.**
Neither Fable nor the plan's author (me) saw this; both twins did, independently.

## What must change before this plan is build-ready

1. **State explicitly (00-overview.md / Task 0) that the frozen test's *intent* — reordered
   duplicates must not cross-match — survives the fix, but its current concrete assertions for the
   unique "Middle" sentence encode the bug being fixed and must be updated** (Middle should end up
   preserved, not `unprocessed`, once Task 0 lands). This is Tamsin's blocker, and it's a plan-text
   fix, not a design change.
2. **Remove the 1-3 fragment-run cap; make matching unbounded/prefix-driven** (Esther's N1) —
   extend a candidate run while its stripped concatenation remains a proper prefix of the fresh
   sentence, with no upper bound. Add a 4+-fragment test.
3. **Reconcile "preserve in place" with position re-indexing** (Esther's N2) — preserve means
   id/character/speaker/audio stay fixed; `segment_order` may still be rewritten when an earlier
   edit shifts positions, and the revision-id rationale (P6) must name id+order+text, not just id.
4. **Correct Invariant I3's cited code path** (Tamsin's finding) — the DB path uses
   `preserve_gap=True`, not the default `False`; the strip-after-concat conclusion is still right,
   but Task 1's test fixture must model the true `preserve_gap=True` output.
5. **Name one concrete alignment algorithm** (Tamsin) — not just "content-match, position
   tiebreaker." A monotonic, order-preserving matching algorithm (e.g., a `SequenceMatcher`-style
   approach used identically by both Task 0 and Task 4/align_segments) removes the ambiguity that
   produced the blocker in the first place, and lets Task 0 be superseded cleanly by `align_segments`
   rather than shipping a throwaway aligner.

## Verdict on the plan

**Still not build-ready — but close, and every fix above is a plan-text/spec correction, not a
redesign.** The core mechanism (preserve-in-place, schema-free-first, shared alignment function)
survived two independent adversarial rounds intact. What's left is precision: an unbounded run
length, one explicit reconciliation note, one corrected code citation, and one named algorithm.

## Calibration verdict (both rounds)

- **Round 1:** twins matched Fable.
- **Round 2:** twins caught a blocker and a correctness bug Fable's pass did not.

Combined, this is meaningful evidence the twins are not just "as good as" a single Fable pass on
plan review — the *combination* of trace-first, repo-grounded scrutiny (both twins) plus holistic
judgment (Fable) is where the value concentrates, consistent with round 1's finding. Per the
adaptive-sequencing rule, this is strong enough signal that a second scenario is optional rather than
required — the mechanism (twins + Fable, compared) is validated on real, hard, non-synthetic
material twice now.
