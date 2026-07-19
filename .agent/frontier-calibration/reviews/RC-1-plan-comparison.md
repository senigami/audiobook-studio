# RC-1 plan review — Fable vs. twins comparison

Three independent, blind reviews of `span_resync_preservation_fix/00-plan.md`: Fable, Constance
(structural), Petra (empirical). All three verdict: **sound direction, not build-ready.**

## Convergence (all three caught this — strong signal)

- **The anchor model under-counts real splits.** `_apply_range_assignment` can cut one sentence into
  up to 3 fragments via 2 split calls; the plan's "one offset per row" can't represent that. All
  three independently traced this to the same code (`operations.py:410-426` / `:420,423,433,441`).
- **Audio is not preserved for reconciled fragments** — the plan's "re-derive fragments" mechanism
  would re-null already-rendered audio on every save, reproducing half the original bug.
- **Test sequencing violates the repo's own R1** (tests must fail first, not land in a terminal slice).

## Twins caught, Fable did not

- **Constance — the design contradicts a committed test.** `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` (`tests/db/test_chapters_sync.py:94`) asserts positional semantics the plan's "content-match first" would break. This is the sharpest single catch across all three reviews — a concrete build-breaking conflict, not a design opinion.
- **Constance — a second, unrelated bug in the same function.** `sync_chapter_segments` silently drops 6+ columns (`speaker_confidence`, `basis`, `evidence`, `locked`, `ai_suggested`, `sanitized_text`) on every save, independent of RC-1.
- **Petra — the plan's mechanism is wrong, not just underspecified.** Re-deriving fragments (vs. preserving the existing rows in place) mints new row ids every save, which churns `_build_base_revision_id`'s optimistic-concurrency hash → spurious `RevisionMismatch` conflicts. Petra's fix (preserve in place) is simpler than the plan and removes this + the audio issue for free.
- **Petra — a genuinely different, simpler Q3 answer.** Schema-free reconciliation (concatenate existing fragment rows, compare to the fresh sentence) may avoid the migration entirely — with an explicit falsifier naming exactly what would force the schema back in.
- **Petra — the cascade fix is independently shippable now**, with no anchor metadata, de-risking the larger change (a sequencing insight, not caught by Fable or Constance).
- **Petra — `compact_script_view` (the merge/inverse operation) invalidates stored anchors** — unmentioned by the plan or the other two reviewers.

## Fable caught, twins did not (partially)

- Fable named the chained-split gap as "root-anchor/cumulative-offset" needed — directionally same
  as Constance/Petra's G1, arrived at independently, no unique addition beyond the twins' more
  specific tracings (parent-relative offsets, 3-fragment case).
- No finding unique to Fable survived once the twins' passes are read — on this plan, **the twins matched Fable's catch and each added findings Fable didn't surface.**

## Gap → mechanism

The gap here isn't "twins missed something Fable caught" — on this plan, they didn't. The gap is the
opposite direction, and it's a real finding about the calibration itself:

- **Mechanism 1 — cross-reviewer synthesis is where the value concentrates.** No single reviewer (including Fable) found everything; the *union* of Constance + Petra + Fable is what makes this plan buildable. Durable takeaway: plan reviews on this class of problem should default to 3-way (twins + Fable when available, twins alone otherwise) rather than either alone — Fable's presence didn't make the twins redundant, and the twins' presence caught things Fable's single pass didn't.
- **Mechanism 2 — a "does this contradict an existing test" check should be a standing part of the map-ritual.** Constance's sharpest catch came from actually running the test suite context, not just the map. Consider adding "grep for existing tests exercising the functions in scope" to the reasoning-analyst's mandatory pre-reasoning ritual.

## Verdict on the plan

**Not build-ready as written.** Before build: adopt Petra's "preserve in place" mechanism (resolves
G2/audio/revision-churn together), reconcile with the existing duplicate-sentence test (Constance),
try the schema-free approach first per Petra's falsifier, resequence tests to lead (S1), and consider
shipping the whole-sentence cascade fix (Petra's S2) as an independent first PR.

## Calibration verdict

**First plan review: the twins performed at or above Fable's level.** Per the adaptive-sequencing
rule, this does not by itself require a second scenario — but the "3-way synthesis beats any single
reviewer" finding is worth carrying forward regardless of whether we run scenario 2.
