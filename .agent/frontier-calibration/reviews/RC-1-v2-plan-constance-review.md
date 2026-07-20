# RC-1 v2 plan review — Esther (structural / top-down panelist)

**Plan under review:** `design-docs/plans/active/span_resync_preservation_fix/` (README + 00-overview
+ 01-map + 02-roadmap + tasks/000-007). Supersedes `00-plan.md`.
**Prior review:** `.agent/frontier-calibration/reviews/RC-1-plan-constance-review.md` (G1-G5).
**Ensemble note:** Independent structural pass, not converged with Tamsin. One panelist input.

## Map ritual (re-run on current code, `ebf484b`)

Verified the three load-bearing claims this redesign rests on, against live source — not the plan's
say-so:

- **I3 (whitespace) is correct, and sharper than stated.** `split_sentences`
  (`app/utils/text/textops_splitting.py:127-160`, `preserve_gap=False`) strips **`" \t\r"` only** off
  interior sentences (`:134`), but the trailing remainder path uses a full `.strip()` (`:151`, which
  also strips `\n`). `_split_segment_at_offset` slices raw (`operations.py:512-513`). So the plan's
  "strip outer edges only" is directionally right but under-pinned — see N3.
- **Revision-id hash confirmed** (`helpers.py:116-137`): it digests per-segment `id`,
  **`segment_order`**, `text_content`, `character_id`, `speaker_profile_name`. This both confirms the
  preserve-in-place rationale (P6) *and* exposes N2 below (order is hashed, so "untouched" and
  "re-indexed" are not the same thing).
- **Fragment accumulation confirmed reachable** — `_apply_range_assignment` (`operations.py:385-465`)
  splits whatever rows currently exist and never merges; `compact_script_view` (the only merge) is a
  separate explicit op, not auto-run on assignment. This is the basis of N1, the one correctness
  must-fix.

## Verdict

**Substantially build-ready — a genuine improvement over both the first draft and my own suggested
remedy.** The pivot from "re-derive fragments at a recorded offset" to **preserve-in-place
fragment-run recognition** is the right move: it dissolves G1 entirely (no offset reconstruction, so
the chained-3-way-split problem simply doesn't arise), and it preserves audio and revision-id
stability for free (Tamsin's finding) instead of managing them as side effects. G1-G5 are addressed.
But the trace surfaces **one correctness must-fix (N1)** and **one spec inconsistency that must be
clarified before Task 4 (N2)**; N3/N4 are refinements. With N1 and N2 resolved, I'd call this
build-ready. Confidence: **high** on N1/N2 (verified in source); the rest of the plan I'd pass.

## G1-G5 disposition

| Prior finding | Resolved? | How |
|---|---|---|
| **G1** anchor can't reconstruct chained/3-way splits | **Yes — dissolved** | Preserve-in-place recognizes a *run* by content; never reconstructs offsets. P4 explicitly unchanged. But see **N1** — the run-length model is still wrong. |
| **G2** collides with committed duplicate test | **Yes** | Invariant I2 quotes the test's exact assertions (`test_chapters_sync.py:99-133`), makes position authoritative among content-equal candidates, and Task 1/7 both re-assert it unmodified. |
| **G3** slices 4/5 overlap & mis-order | **Yes** | Index-cascade split into standalone Task 0 (ships first); alignment extracted (Task 3) before both consumers (4/5); dependency graph explicit. |
| **G4** "pure refactor" premise false | **Yes** | Task 3 is now an export/checkpoint of a *pure function* both consumers adopt; the shared unit is the alignment mapping, exactly the reframing I asked for. |
| **G5** 9-column silent loss | **Yes — with the count corrected to 9** | I5 documents it, a scout confirmed 9 (not my "8+"), preserve-in-place auto-fixes it for preserved rows, and Task 4 step 5 offers the inline fix for new rows with an explicit owner decision. Correctly kept as a recorded decision, not silently folded. |

## New findings on the v2 design

**N1 — MUST FIX (correctness): the "1-3 rows per run" cap re-introduces the bug for
heavily-edited sentences.** The plan bounds fragment runs at 3 (P1 signature docstring; 01-map P4
connection; Task 1 algorithm + acceptance criterion "Handles 1-3 row fragment runs"). That bound is
derived from a *single* `_apply_range_assignment` call (which can cut one sentence at most twice →
left/middle/right). But assignments **accumulate**: a user can assign one sub-range of a sentence to
Character A (3 fragments), then later assign a different sub-range of the *same original sentence* to
Character B — `_apply_range_assignment` splits the already-split rows further, yielding 4, 5, or more
fragment rows for one manuscript sentence, with no merge in between (verified: no re-merge on assign;
`compact_script_view` is separate and explicit). On the next save, `align_segments` capped at 3 would
fail to recognize a 4+-row run and discard it — silently resurrecting the exact RC-1 data loss for
the most heavily-edited (highest-value) sentences. **Remedy:** the run must be **unbounded and
prefix-driven** — greedily extend the run while `strip(concat(run))` is a proper prefix of the fresh
sentence, stop on equality (match) or divergence/overshoot (no match). Delete the "1-3" cap from the
signature, the P4 connection, and Task 1's algorithm/acceptance. Task 1's and Task 7's suites must add
a **4+-fragment sentence** case (two sequential sub-range assignments to one sentence).

**N2 — MUST CLARIFY before Task 4: "preserve in place = touch nothing at all" is internally
contradictory with the required re-indexing.** Task 4 step 3 and the P6 note say a preserved row gets
"no delete, no insert, no update — for any row `align_segments` says to keep." But `segment_order` is
part of a row's correctness *and* is hashed into the revision id (verified `helpers.py:129`). When an
earlier edit inserts/removes a sentence, a preserved run's rows sit at a **new ordinal position** and
their `segment_order` MUST be updated, or `ORDER BY segment_order` returns rows out of order. Task 0
already embraces this ("preserved and re-indexed"). So "preserve" must mean **preserve identity and
assignment (`id`, `character_id`, `speaker_profile_name`, `audio_*`), while `segment_order` may be
rewritten.** The revision id changing in that case is *correct* (order genuinely changed) — but the
plan currently frames any hash change as a failure ("A task that preserves content but creates new ids
has NOT fixed the bug" is right; "touch nothing at all" is wrong). Reconcile Task 4's absolute
no-update language with Task 0's re-indexing, and refine P6 to say the hash is stable *only when id,
order, and text are all unchanged* — an unrelated same-count edit leaves order unchanged (stable
hash); an insertion legitimately shifts it.

**N3 — REFINE I3: pin the exact strip class, and handle `\n`.** The comparison must match the
splitter's *actual* normalization, which is not uniform: interior sentences are stripped of `" \t\r"`
(not `\n`); the trailing remainder is full-`.strip()` (includes `\n`). `update_chapter` also
normalizes `\r\n`→`\n` first (`chapters.py:208`), and `_split_segment_at_offset` slices raw, so a
fragment's stored `text_content` can carry a leading/trailing `\n` the interior-sentence path would
*not* have stripped. If `align_segments` uses a bare Python `.strip()` (which eats `\n`) it may
over-normalize relative to the interior-sentence rule and produce a false match/mismatch at
paragraph boundaries. Task 1's whitespace test (good that it exists) should specifically include a
**paragraph-break / trailing-newline** fragment, and I3 should state the exact strip set to use
(recommend: normalize both sides with the same explicit rule, and cover the last-sentence remainder
case separately since it strips `\n`).

**N4 — MINOR: P6's rationale is slightly incomplete.** It says preserving *ids* is what keeps the
hash stable. Ids plus `segment_order` plus text — all three are hashed. Not load-bearing for the
design, but worth correcting so a future reader doesn't assume order is free to change without hash
impact. Folds into N2's clarification.

## Things the plan gets right that are worth naming

- Task 0 as a standalone, independently-shippable, revert-checked fix is exactly the de-risking move
  (and it's the whole-sentence half of the bug, valuable on its own).
- I4 (two transaction postures) is correctly identified as a constraint on the Task 6 return-shape
  change — that was a real trap (self-committing resync route vs. conn-owned callers).
- Keeping Task 2 (stored columns) strictly conditional on Task 1's tests failing is the right
  risk-ordering; schema-free first is cheaper and sidesteps I6 merge-staleness.
- The parity test in Task 5 (preview prediction == actual sync outcome) directly closes the drift
  risk at the test level, not just the code level. Good.

## Escalation posture

N1 is a concrete correctness bug in the spec, not a judgment call — it should just be fixed, no
escalation. N2 is a spec-consistency fix. Neither clears my ceiling. The one place I'd still want
Tamsin's empirical pass converged before build is R1 (the fragment-run × duplicate-disambiguation
intersection) *as widened by N1* to unbounded runs — greedy prefix-matching across duplicated
adjacent content is where a locally-correct greedy choice can be globally wrong, and an empirical
probe of the real input space is worth more there than more top-down reasoning from me. If she and I
diverge on whether greedy-contiguous matching is sufficient (vs. a proper DP alignment), that split
should go up rather than be averaged.
