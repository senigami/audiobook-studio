# Constance — code review: RC-1 Task 4 (wire `align_segments` into `sync_chapter_segments`)

- **Branch/commit:** `implement/rc1-task4-wire-sync` @ `7ccd0f3a`
- **File in scope:** `app/db/segments.py` (`sync_chapter_segments`, +107/-48)
- **Ensemble status:** LONE PASS — dispatched solo, no Petra pass, no neutral judge. This output is
  **un-ensembled**; it did not get the reliability that convergence buys. Flagging per the twin
  contract.
- **Map ritual:** code-map core loaded; `app/db/segments.py` shard pulled; `app/db/segment_alignment.py`
  is unmapped (`null` from lookup — new file, map is at synced_commit `ebf484be`, pre-dating it).
  Structural reasoning below is anchored in the plan's recorded invariants (I1–I7, R0–R1) plus direct
  reads of the four functions in the flow.

## Verdict

**APPROVE the diff as a correct implementation of Task 4's core mechanism**, with two minor
plan-vs-diff gaps to record (not blockers) and one confirmed, correctly-characterized cross-module
interaction the owner already flagged. The diff does exactly what it claims: preserved rows get **no
DB write** (verified), the discard/insert/shared-audio-invalidation passes are intact, and all 5
`test_chapters_sync.py` tests pass on this checkout.

## Ground truth loaded

- `sync_chapter_segments` (`app/db/segments.py:492-658`): calls `align_segments`, lays out
  `final_rows` in fresh order, runs shared-audio invalidation (step 4), then the minimal write set
  (step 5) where a preserved row with unchanged order+audio hits `continue` (line 619-620) — a true
  skip, not a re-INSERT.
- `align_segments` (`app/db/segment_alignment.py:44-143`): pass-1 position-anchored, pass-2
  unique-content search + fragment-run search with the `len(run) > 1` duplicate-sensitive exemption
  (line 124).
- `get_chapter_segments` (`app/db/segments.py:117-253`): the READ path, incl. the chunk-group
  canonical-audio check (lines 189-220) that is the subject of the owner's finding.
- `build_chunk_groups` (`app/domain/chunk_groups.py:47-94`): merges adjacent segments by
  `character_id` + `profile_name` + `engine` under the text-chunk limit; leader = first member.

## MANDATORY RISK-INSTANTIATION GATE — executed, not hand-traced

### Gate 1 — combined adversarial input to `align_segments` (I1a + duplicate×fragment-run + discard)

Single input exercising all three named risk dimensions at once: a plain duplicate (`Repeat.`×2), a
4-row fragment run concatenating to a **duplicate-sensitive** sentence (`Hello world today.` — which
ALSO exists as a whole row `E7`), a position-shifting unique row (`Middle.`, tests I1a), and a
genuinely-removed row (`Gone.`, tests cleanup). Executed against the real function.

**Actual output:**
```
PRESERVED: fresh 0 -> [E6] 'Middle.'            (moved from order 6 -> 0: I1a exercised)
           fresh 1 -> [E1,E2,E3,E4] 'Hello world today.'   (4-row run preserved despite dup-sensitive)
NEW:       [2,3,4,5] ['Repeat.','Repeat.','Hello world today.','Brand new.']
UNMATCHED: [E0, E5, E7, E8]
```

**Expected vs actual:** matched. Confirmations and one genuinely non-obvious emergent finding:

1. **I1a holds** — `Middle.` preserved across a position move; sync will rewrite only its
   `segment_order`. Correct.
2. **Duplicate×fragment-run intersection (R1) works as designed** — the 4-row run is preserved even
   though `Hello world today.` is duplicate-sensitive (the `len(run) > 1` exemption, line 124). This
   is the exact case the 2026-07-19 docstring correction targets.
3. **Emergent finding the gate produced that I would NOT have gotten by abstract reasoning:** when a
   duplicate-sensitive sentence appears as BOTH a fragment run AND a whole row (`E7`), the **fragment
   run wins preservation and the whole-row duplicate `E7` is discarded** (unmatched), *regardless of
   which fresh position is closer to E7's original index*. `fresh_index 1` claimed the run; `fresh_index
   4` (positionally nearer E7) got nothing and E7's audio is dropped. This is **within spec** — it is a
   preservation *miss*, never a cross-match to the wrong audio, so I2's safety bar is not violated (E7
   at existing-index 7 would not have matched fresh-index 4 under pass-1 positional either, so it is
   also not a regression vs. the old positional rule). Worth recording as a known completeness edge,
   not a defect.
4. **The two `Repeat.` duplicates both go to NEW (audio lost) on this reorder.** Because `Middle.`
   moved to the front, neither `Repeat.` stays at its original index, so pass-1 fails and — being
   single-row duplicate-sensitive content — they are ineligible for search recovery (I2). Discard is
   the *safe* choice here; you cannot disambiguate reordered identical rows. Consistent with I2 and
   with the existing `test_..._does_not_cross_match_reordered_duplicates` (which only preserves the
   duplicate that stays at its original index).

**Did the gate earn its keep?** Yes for finding #3 — the run-beats-whole-row asymmetry is a real
emergent property of the two-tier eligibility rule that a hand-trace at the "does the run get
preserved?" altitude would have declared "fine" and moved on. It is in-spec, but it is the kind of
thing that, if it were wrong, only executing the combined input would expose.

### Gate 2 — the owner's chunk-group READ-time re-invalidation finding (DB-backed, executed)

Constructed a 3-segment chapter: A and C same character (`charX`), B a different character (`charY`),
initial order A,B,C so each is a solo chunk group rendered to its **own** `id.wav` (all `done`). Then
reordered the text to `Aaa. Ccc. Bbb.` so A and C become adjacent (both `charX` → they merge into one
chunk group led by A). Ran the real `sync_chapter_segments` then the real `get_chapter_segments`.

**Actual output:**
```
BASELINE (read):     A done, B done, C done
RAW DB AFTER SYNC:   A done C.wav-preserved  ->  C: id kept, status='done', path=C.wav  (SYNC PRESERVED IT)
AFTER get_chapter_segments (read): A done,  C -> ('unprocessed', None),  B done
```

**Confirmed — the owner's finding is exactly right.** Sync preserves C in place (same id, still
`done`, still pointing at its own `C.wav`). Then on the very next READ, `get_chapter_segments`'
chunk-group canonical check computes C's canonical as the **group leader A's** `A.wav`; C's stored
path is `C.wav ≠ A.wav`, so C is re-invalidated to `unprocessed` (and this write-back is persisted,
lines 222-237). A survives (its path == canonical), B survives (solo).

**This is NOT a bug in the Task 4 diff.** The re-invalidation lives in `get_chapter_segments`
(unchanged by this commit) and is, moreover, **semantically correct**: once A and C merge into one
render unit, C's old solo-rendered `C.wav` no longer represents the correct output; the merged group
must re-render to `A.wav`. Invalidating C forces that. The owner's characterization — "the ROW is
preserved, but its RENDERED AUDIO can still be correctly re-invalidated by this independent,
pre-existing mechanism" — is precisely accurate. The old test's `Middle → unprocessed` assertion
survives for a subtler reason than the pre-fix bug, as the commit message states.

**One adjacent latent inconsistency I'd flag for the next round (out of Task 4 scope, do not fix
here):** after the merge, A stays `done` pointing at a *solo-rendered* `A.wav`, while C is
`unprocessed`. The merged `[A,C]` group actually needs a single *combined* render to `A.wav`. Whether
the render/completion gate correctly re-renders the whole group when only a non-leader member is
`unprocessed` — rather than treating the leader's stale solo file as valid — is a real question that
lives in the orchestrator/render-gating path, not in this diff. Record it; don't let Task 4 absorb it.

## Blast-radius assessment (from the flow, not asserted)

- **Callers of `sync_chapter_segments`** (per plan I4, three postures): `create_chapter`
  (conn-owned), `update_chapter` (conn-owned), explicit resync route (self-committing). The diff's
  `_sync_with_conn` inner-function split (line 510) handles both postures — conn passed through
  untouched, self-committing branch commits at line 638. Correct.
- **Downstream reader** `get_chapter_segments` → `build_chunk_groups`: the interaction verified in
  Gate 2. No new coupling introduced by the diff; the coupling pre-exists.
- **File cleanup** (lines 640-656): `removed_ids` is derived as `existing − preserved_ids`, while the
  in-transaction DELETE uses `alignment.unmatched_existing_ids`. These are **two independent
  derivations of the same discard set.** They are provably equal today (in `align_segments`,
  `used[j]` is set true for exactly the preserved-run rows, so `unmatched = not used = existing −
  preserved_ids`). This is the exact fragility R0.3 warned about — currently correct, but a future
  change that adds a third row category (preserved-but-not-via-a-run) would silently split them and
  could delete a live row's audio file. Low current risk; note it so it does not rot.

## Plan-vs-diff gaps (minor, record — not blockers)

1. **I5 (9-column INSERT) NOT fixed inline.** The INSERT (lines 599-608) still writes 9 of 18
   columns; `sanitized_text`, `performance_data`, `speaker_confidence`, `speaker_basis`,
   `speaker_evidence`, `review_reasons` → NULL and `needs_review`/`locked`/`ai_suggested` → default
   for genuinely new/changed (DISCARD_AND_CREATE) rows. Task 4 step 5 + the acceptance criterion "I5
   decision recorded (fixed inline or explicitly deferred with a filed follow-up)" is therefore
   **unmet and undocumented** in the commit. Practical impact is low (preserved rows are auto-fixed by
   being skipped; recreated rows have genuinely new text that arguably *should* re-derive these), but
   the decision should be recorded per the task's own checklist.
2. **`lost_assignments_count` not returned.** `sync_chapter_segments` still returns `True` (line
   658); Task 4 step 6 asks it to track/return the count. This is plausibly deferred to Task 6 (which
   owns the API wiring) and is absent from Task 4's *checkbox* acceptance list, so I read it as
   by-design deferral — but confirm that Task 6 will add the return value, since nothing in this diff
   lays the groundwork.

## The call

- **Diff correctness (Task 4 core mechanism):** APPROVE. Preserve-in-place is real (skip, not
  re-insert), invariants I1/I1a/I2/I3/I4 hold under execution, shared-audio invalidation intact,
  suite green. **Confidence: high** (both named-risk gates executed against real code).
- **Owner's chunk-group finding:** CONFIRMED independently by execution, and correctly characterized
  as a pre-existing, semantically-correct READ-time mechanism outside the diff. **Confidence: high.**
- **Falsifier** (what would change the APPROVE): if the render/completion gate treats the merged
  group's leader as `done` and never re-renders the combined unit (the adjacent inconsistency above),
  then the Gate-2 interaction escalates from "correct invalidation" to "user-visible audio that never
  regenerates" — that would be a real defect, but in the orchestrator, not this diff. Recommend the
  next round instantiate a full render pass over a post-merge chapter to close that.

## Escalation

No owner's-call trigger met. The two plan-vs-diff gaps (I5 documentation, loss-count deferral) are
recordable decisions, not irreversible calls. The adjacent render-gating question should be handed to
`runtime-verifier` (Plumb) for an actual end-to-end render, not decided from analysis.
