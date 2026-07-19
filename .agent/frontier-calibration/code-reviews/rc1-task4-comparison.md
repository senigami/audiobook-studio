# RC-1 Task 4 — code-review comparison (Phase 4, testing the risk-instantiation gate)

Second Phase 4 test case. This round, both twins were given Fable's proposed workaround
explicitly: for any risk a plan/predecessor review names as its top concern, construct one input
combining all named dimensions and **execute it via Bash**, not hand-trace.

## Verdicts

- **Fable: needs changes before merge.** Executed every claim (per its own suggestion from Task 1).
  Confirmed the chunk-group interaction I'd found, but sharpened it materially: not caused by
  position shift, caused by same-character adjacency present from the first read — which means the
  pre-existing committed duplicate test is **confounded**, not just "also affected." Found the
  commit shipped with **zero tests** (a real R1 violation), the task file never updated, and I5's
  required decision never recorded.
- **Constance: approve**, with the gate producing one real finding — an emergent fragment-run vs.
  whole-row-duplicate ordering asymmetry, caught only because she executed the combined case rather
  than reasoning about each dimension separately. Independently confirmed the chunk-group
  interaction via her own DB-backed execution.
- **Petra: approve**, gate used deliberately as a *disconfirmation* tool (nearly flagged the dropped
  duplicate row as a bug, executed it, found it was correct I2 conservatism instead) — and separately
  found a real, new issue by tracing the call sites: `get_resync_preview` is still unwired and
  reports false destructive-save warnings, contradicting `segment_alignment.py`'s own present-tense
  docstring claim that it's already the shared function for both callers.

## Did the workaround close the gap from Task 1?

**Partially, and the honest picture is nuanced — this round the gap moved rather than vanished.**

- **The specific failure mode from Task 1 (twins stop at "under-tested," never construct the
  input) did not recur.** All three reviewers this round executed real code against constructed
  inputs. Constance's and Petra's own words confirm the gate changed their behavior, not just their
  confidence: Constance got a finding she says she wouldn't have from hand-tracing; Petra used
  execution to *avoid* a false positive she was tempted toward.
- **But Fable still found something the twins didn't: the chunk-group finding's real trigger.**
  Both twins independently confirmed the mechanism exists and produces the stated outcome — but
  neither one ran the *specific disambiguating experiment* (call `get_chapter_segments` **before any
  resync at all**) that reveals it's same-character adjacency, not position shift, and therefore
  that the pre-existing committed test is confounded. This is a materially more consequential finding
  than "confirmed, it's real" — it changes what the test suite can actually be trusted to prove.
- **The zero-tests gap was a process failure, not a reasoning failure**, and neither twin caught it
  either — likely because neither was asked to check `git diff --stat -- tests/`, and their review
  prompts asked them to verify correctness, not process compliance. Worth adding "check the commit
  actually contains the tests its own task file requires" as a standing step, not just for named
  risks.

## Updated durable takeaway

The risk-instantiation gate (construct + execute) is real and worth keeping — it visibly changed
what both twins found this round. But it's not sufficient on its own for two reasons this round
surfaced:

1. **Confirming a finding is real is not the same as finding its most consequential form.** Both
   twins confirmed the chunk-group mechanism; only Fable ran the specific control experiment
   (before-any-resync) that revealed the test-confound implication. The gate says "execute the
   adversarial input" — it doesn't by itself prompt "now vary the input to find the simplest
   triggering condition," which is what surfaced the sharper finding.
2. **Process-compliance checks (tests committed, task file updated, decisions recorded) need to be
   explicit review steps, not assumed to follow from a correctness review.** Add "verify the commit
   satisfies its own task file's acceptance criteria, mechanically (git diff --stat, grep for
   checkbox state)" as a standing item in the twins' code-review instructions going forward.

## Fixes applied (verified, not just accepted)

- 3 new committed tests, revert-checked against pre-Task-4 code (2 of 3 correctly fail on old code).
- Task 4's status/checkboxes updated; I5 explicitly deferred with reasoning recorded.
- New Invariant I8 in `01-map.md` recording the chunk-group interaction and the test-confound,
  with an explicit instruction that future regression tests must use distinct-character scenarios.
- `segment_alignment.py`'s docstring corrected from a present-tense overclaim to accurate status.

496 tests pass (db/ + domain/), ruff clean.

## Running tally across both Phase 4 rounds

- **Round 1 (Task 1):** Fable caught a real bug both twins missed entirely.
- **Round 2 (Task 4, with the gate):** all three found real things; Fable found the sharpest/most
  consequential version of a shared finding; the twins closed the "confirm but don't execute" gap
  from round 1 but didn't yet close the "vary the experiment to find the simplest trigger" gap.

Two-round signal: Fable-when-available + twins-always remains the right policy. The twins are
improving with the added instruction; they are not yet at parity with Fable on this class of
"disambiguate the mechanism, don't just confirm the symptom" finding.
