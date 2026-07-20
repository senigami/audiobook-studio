# RC-1 v2 plan review — Tamsin (empirical / bottom-up panelist)

**Plan folder:** `design-docs/plans/active/span_resync_preservation_fix/`
(`README.md`, `00-overview.md`, `01-map.md`, `02-roadmap.md`, `tasks/000-007`)
**Lens:** reasoned up from the actual code paths and the frozen test's exact assertions, not from the
plan's self-description. Independent, complete review — nothing deferred to Esther.

## Ground truth re-loaded

- Re-read the target functions and the two load-bearing external facts the plan leans on:
  `split_sentences` (`app/utils/text/textops_splitting.py:91`, default `preserve_gap=False`) and its
  DB-layer caller `split_into_sentences` (`app/db/nlp.py:8-11`, which passes **`preserve_gap=True`**).
- Read the frozen test the plan pins as criterion #4:
  `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`
  (`tests/db/test_chapters_sync.py:94-133`) — full setup and all nine assertions.
- Re-read `_split_segment_at_offset` (`operations.py:501-539`) and `_apply_range_assignment`
  (`operations.py:385-465`) to confirm the 3-way split path.

## Verdict

**Materially improved — adopts every finding from my first review correctly — but NOT yet build-ready.
One BLOCKER and two MEDIUM issues remain.** The core direction (preserve-in-place, schema-free
fragment-run recognition, tests-lead sequencing) is sound and correctly reasoned. The blocker is a
self-contradiction *inside the plan* between Task 0's stated behavior and the test it pins as
immutable. Confidence: **high** on the blocker and the I3 path error (both traced directly from code
and the test's exact assertions); the falsifier for the blocker is stated below and I could not
construct a counterexample.

## What the rebuild got right (my prior findings, all addressed)

| Prior finding | Now addressed by |
|---|---|
| G2 — re-derive was wrong; preserve rows in place | I1, P6, Task 4 — explicit, and correctly framed as *the mechanism* (id stability → P6 revision hash), not a footnote |
| G1 — anchor under-counted 3-way splits | Task 1 "1-3 row fragment runs"; P4 note that `_apply_range_assignment` calls split twice |
| G3 — fragment audio must survive | I1 includes `audio_status`/`audio_file_path`/`audio_generated_at` in "untouched" |
| G4 — normalize before compare | Folded into I3 (strip-after-concat), consistent with existing `.strip()` semantics |
| G5 — duplicate-sentence disambiguation | I2, promoted to a hard invariant pinned to the real test |
| S1 — tests mis-sequenced | Roadmap: tests lead each workload; explicit R1 red-first steps in every task |
| S2 — cascade fix is independent | Task 0, first, its own PR |
| Return-shape / 3 callers / two txn modes | I4, Task 6 |
| `compact_script_view` interaction | I6 (moot under schema-free) |

This is a faithful, high-quality incorporation. The remaining problems are new, surfaced only by
pushing on the concrete test and the concrete splitter.

## BLOCKER — Task 0's target behavior contradicts the I2 test it must not modify

Task 0 (`tasks/000-index-cascade-fix.md:24-29`) specifies: *"check whether `existing[i]`'s content
appears at a **different** index in the fresh `sentences` list — if so, that row's assignment should
be **preserved and re-indexed**."* Then step 4 (and overview criterion #4) require
`test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` to **pass unmodified**.

These cannot both hold. Trace the frozen test with Task 0's own rule:

- The test resyncs `[Repeat(first,done), Middle(middle,done), Repeat(last,done)]` →
  fresh `[Repeat, Repeat, Middle]`.
- **`Middle` is unique content** (not a duplicate). It exists at old index 1 and fresh index 2.
- Task 0's rule ("content appears at a different index → preserve and re-index") therefore
  **preserves `Middle` onto fresh[2]**, keeping `middle_file`/`done`.
- But the test asserts (`test_chapters_sync.py:131-133`) `refreshed[2]` Middle is
  `audio_status == "unprocessed"`, `audio_file_path is None`.

So Task 0, implemented as written, **flips that assertion** and fails step 4. I checked whether any
reasonable order-preserving alignment escapes this — `difflib.SequenceMatcher`-style monotonic
matching, two-pointer-with-lookahead, and longest-contiguous-block all preserve `Middle` across its
one-position move (that is the *correct* behavior — Middle merely moved, it should keep its render).
The only algorithm that reproduces the test's exact "only `existing[i]==fresh[i]` at the identical
index survives" outcome is **strict positional index equality** — i.e. today's code, which is exactly
what Task 0 exists to replace. Conversely, that strict-index algorithm fails Task 0's *own* new insert
test (front-insert `X` into `[A,B,C]` → the rule must preserve `A,B,C` across a +1 shift, which strict
index equality cannot do).

**The contradiction is structural: preserving unique content across a position shift (Task 0's whole
purpose) necessarily preserves `Middle` here.** The resolution — which the plan must state — is:

1. The I2 test's **duplicate-safety intent survives every reasonable algorithm**: under difflib and
   two-pointer-lookahead, `refreshed[0]` still keeps `first_file` and `refreshed[1]` (the second
   `Repeat`) still goes `unprocessed` — the `last` row's audio does **not** leak to fresh[1]. That is
   the assertion set worth protecting, and it is what criterion #4's *stated* intent ("reordered
   duplicates must NOT cross-match") actually refers to.
2. The `Middle` assertions (`:131-133`) are **incidental current behavior, not intent** — they encode
   today's index-strict data loss. When Task 0 lands they must be **updated** to expect `Middle`
   preserved. That is an improvement, not a regression.

As written, the plan tells an implementer both "preserve content across shifts" and "this test must
not change." They will either under-implement Task 0 (keeping the test literally green but failing
Task 0's insert test) or implement it and believe they broke a protected invariant. Fix: rewrite
criterion #4 and Task 0 step 4 to protect the *duplicate-non-cross-match* assertions specifically, and
explicitly authorize updating the `Middle` assertions.

**Falsifier:** if an order-preserving alignment exists that preserves `[A,B,C]` under a front-insert
yet reproduces all nine of the frozen test's assertions (including `Middle → unprocessed`), the
contradiction dissolves. I could not construct one; every content-aware aligner I traced preserves
`Middle`, and the only one that doesn't (strict index) fails Task 0's insert goal.

## MEDIUM 1 — Invariant I3's rationale misidentifies the live code path

I3 (`01-map.md:87-93`) says fragments must be strip-compared because `split_sentences` "(default
`preserve_gap=False`) strips leading/trailing whitespace off each whole sentence." **The DB path does
not use that default.** `split_into_sentences` (`nlp.py:11`) calls `split_sentences(text,
preserve_gap=True)`, and `preserve_gap=True` *includes* each sentence's trailing whitespace/newlines
(`textops_splitting.py:127-130`, `sentence = text[start:gap_end]`). So fresh sentences arrive **with**
trailing gap, not stripped — the opposite of I3's premise.

The **conclusion** (strip after concat, both sides) is still correct and is consistent with the
existing `.strip()`-on-both-sides checks at `segments.py:523` and `operations.py:299`, so no code
harm. But the stated reason is inverted, and it matters for Task 1: the I3/falsifier test case
(`tasks/001:68-69`, "leading/trailing whitespace... re-synced") must be built against the **actual**
`preserve_gap=True` output (fresh sentences carrying trailing gaps), not against stripped
`preserve_gap=False` output. An implementer trusting I3's wording will construct a fixture that
doesn't exercise the real path. Fix the rationale to: "fresh sentences carry a trailing gap
(`preserve_gap=True`); stored fragments are raw slices of a prior gap-bearing sentence; strip both
outer edges so trailing-gap variance across an edit doesn't defeat the match."

## MEDIUM 2 — the alignment algorithm itself is never specified

Both Task 0 ("content appears at a different index") and Task 1 ("position as tiebreaker when >1
candidate") describe *heuristics*, not an algorithm. The I2 test proves the heuristic wording is
under-determined: "preserve content found at a different index" with only a duplicate tiebreaker does
**not** tell the implementer how to avoid cross-matching in the general reorder case, nor how to keep
matches monotonic. The plan needs to name a concrete, order-preserving alignment (e.g. a
`difflib.SequenceMatcher`-style longest monotonic matching over the content sequences, or an explicit
two-pointer walk with bounded lookahead) and specify that matches must be **monotonically increasing
in both the existing and fresh sequences**. Without that, Task 1's "duplicate + split intersection"
(R1) and the Task 0/I2 interaction are left to implementer improvisation on the plan's single trickiest
surface. Recommend: specify the algorithm in Task 1 and have Task 0 use the *same* function (see Minor
below), so there is exactly one alignment behavior to reason about and test.

## MINOR

- **Task 0 ships a throwaway aligner.** Task 0 rewrites the `segments.py:507-539` loop with a
  content-aware fallback; Task 4 then replaces that same loop with `align_segments` consumption. The
  plan justifies Task 0's independence (de-risk, standalone value) — reasonable — but Task 0's ad-hoc
  matching logic is transitional and Task 4 must fully supersede it (not leave two alignment paths).
  Cleaner alternative worth weighing: implement Task 0 *via* `align_segments`, accepting a dependency
  on Task 1 and losing strict independence. The plan chose independence; if it keeps that choice,
  state in Task 4 that it removes Task 0's interim logic, and keep both governed by one algorithm spec
  (Medium 2).
- **I5 (9-column loss) is now less harmful than the plan implies — a point in preserve-in-place's
  favor.** With rows preserved across moves, the column drop only hits genuinely new/changed
  sentences (where most of those columns legitimately reset), not every row on every save as today.
  Worth noting in the I5 decision: preserve-in-place already shrinks this bug's blast radius
  substantially, which lowers the urgency of fixing the new-row INSERT inline.
- **Line ref nit:** I3 cites `textops_splitting.py:133`; the `split_sentences` def is at `:91` and the
  `preserve_gap` branch at `:127-131`. Minor, but correct it so the reader lands on the right code.

## Nothing from my first review left unaddressed

All eight prior findings (G1-G5, S1-S2, blast-radius items) are incorporated. The remaining issues are
new, and all three surface only when the abstract rule ("content-match first, position as tiebreaker")
is executed against the concrete frozen test and the concrete `preserve_gap=True` splitter.

## Escalation

None required. This is a plan review within analysis scope. The one owner-facing decision the plan
already correctly isolates (I5: fix the 9-column loss inline vs. file separately) is staged for the
owner, not decided here — that is the right handling.
