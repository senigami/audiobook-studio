# RC-1 plan review — Constance (structural / top-down panelist)

**Role:** repo-grounded structural panelist, dispatched for Frontier-Calibration Phase 3 plan review.
**Plan under review:** `design-docs/plans/active/span_resync_preservation_fix/00-plan.md`
**Root-cause reference:** `.agent/frontier-calibration/references/RC-1.md`
**Ensemble note:** This is my independent pass, framed top-down from the code-map's flows/invariants
and the actual call sites. It is *not* converged with Petra — treat it as one panelist input a judge
reconciles, not a verdict.

## Map ritual (ground truth loaded)

Code-map core loaded (synced_commit `ebf484b`). Shards routed via `lookup.sh` for the three named
files. Symbol trace / blast radius verified against live source, not memory:

- **`sync_chapter_segments`** (`app/db/segments.py:492-599`) — callers: `create_chapter`
  (`app/db/chapters.py:54`), `update_chapter` (`app/db/chapters.py:224`), explicit resync route
  (`app/api/routers/chapters.py:259`), and ~40 test call sites. Three production entry points share
  the rebuild — BR is real and wide.
- **`_split_segment_at_offset`** (`app/domain/chapters/operations.py:501-539`) — sole production
  caller `_apply_range_assignment` (`operations.py:420,423,433,441`), re-exported via
  `facade.py:35`.
- **`get_resync_preview`** (`operations.py:270-316`) — caller `chapters_production.py:38`,
  re-exported via `facade.py:31`.
- **`update_chapter`** (`app/db/chapters.py:197-234`) — confirms sync fires unconditionally on every
  text save (`:221-224`), inside the caller's transaction.
- Schema/migration mechanism: `chapter_segments` table + additive `add_column_if_missing(...)` calls
  in `app/db/core.py:243-340` (invoked from the boot migration path, not import-time).

The RC-1 mechanism reproduces exactly against source. I concur with it at high confidence.

## Verdict

**Sound in direction, not yet safe to build as sliced.** Content-anchored reconciliation is the
right structural target and fits the codebase's grain (additive columns, shared function). But the
plan under-specifies the one genuinely hard part — *sequence alignment under duplicate/near-duplicate
sentences and multi-fragment splits* — and its "record the split offset" anchor is, per the trace,
insufficient to re-derive fragments correctly. Two task slices (4/5) overlap and mis-sequence, one
slice's "pure refactor" premise is false, and there is a **committed regression test the plan will
break without acknowledging it.** Recommend a revised plan before execution. Confidence: **high** on
the gaps below (all verified in source); **medium** on the exact remedy for the alignment design,
which is where I'd want Petra's empirical pass and possibly Fable.

## The four open questions, answered

**Q1 — Content-hash sufficient, or need fuzzy/near-match for trivial (e.g. whitespace) edits?**
Hash, but hash on *normalized* text (strip + collapse internal whitespace, and match RC-1's
`.strip()` comparison semantics) so trivial whitespace deltas don't defeat the anchor. Do **not**
add a similarity/threshold "fuzzy" match. A near-match that silently re-attaches a manual speaker
assignment onto a sentence whose wording actually changed is a *worse* failure than the current one —
it's silent-wrong instead of silent-loss, and there's no signal to the user. Exact-on-normalized +
explicit invalidation-with-count is the defensible line. The fragile part of this design is not the
hash; it's the offset re-derivation (Q2) — don't spend the risk budget on fuzzy matching.

**Q2 — Does re-deriving fragments at a recorded offset survive the splitter choosing different
sentence boundaries after unrelated edits?**
Only if you stop thinking positionally. Re-derivation must **not** happen at an index — it must
happen against a *located* parent sentence: search the fresh sentence list for a sentence whose
normalized text equals the stored parent-anchor hash; if found (regardless of its new index),
re-split *that* sentence at the recorded offsets; if the parent sentence no longer appears intact
(count/order/wording changed such that it's gone), invalidate that sentence's fragments only. Framed
this way, Q2 collapses into the alignment design and is handled — but the plan's slice 4 wording
("re-derive fragments at the recorded offset") reads as positional and would misfire the moment
sentence count changes, which is exactly the RC-1 scenario. Make "locate parent by content, then
re-split" explicit.

**Q3 — DB migration vs side table (versioned-contract directive)?**
Migration, additive nullable columns, via the existing `add_column_if_missing` in
`app/db/core.py`. The versioned-contract directive governs *external/interchange* contracts (plugin
manifest, SDK, event envelope, voice bundle, casting card) — not the internal SQLite schema, which
already carries 8+ additively-migrated columns on this very table (`speaker_confidence`,
`speaker_basis`, `locked`, `ai_suggested`, …). A side table buys schema "stability" that isn't a
contract obligation here and costs a join on the hot rebuild path. Columns are consistent with
precedent. (Slice 1 should name the existing mechanism rather than "a DB migration" generically, so
the executor doesn't invent a parallel path or, worse, run it at import time in violation of
`modular_architecture.md`.)

**Q4 — Interaction with `audio_status`/`audio_file_path` invalidation?**
Yes, and the plan under-addresses it. Two points the trace surfaces:
- `_split_segment_at_offset` *already* invalidates audio on both fragments at split time
  (`operations.py:519,534-535` → `audio_status='unprocessed'`, `audio_file_path=NULL`). So a
  freshly-split span has no audio to preserve *at creation*. The audio loss RC-1 observed is
  predominantly the **cascade** wiping *other, whole-sentence* rows' audio (`segments.py:541-552`
  clears audio for rows sharing a file with a removed row; `:581-592` deletes removed rows' files).
  Fix the cascade and most of the audio loss disappears on its own — worth stating so the plan
  doesn't over-engineer audio handling on the fragment path.
- On the happy re-derivation path, if a fragment's text is byte-identical after re-split (parent
  unchanged), its audio *should* carry forward. That requires mapping each re-derived fragment back
  to its prior row to inherit `audio_file_path`/`audio_generated_at`. The plan's anchor
  (parent-hash + single offset) can't do that for a >2-fragment sentence — see Gap 2. So Q4 and the
  anchor-shape gap are the same problem.

## Gaps, risks, and mis-sequencing (structural findings)

**G1 — Anchor shape is insufficient for the actual split topology (correctness).**
The plan (slice 2) records "the parent sentence's hash and the split offset." But `_split_segment_at_offset`'s
`offset` is **relative to the current row's text, not the parent sentence**, and a single sentence
can be split into **three** fragments, not two. Trace `_apply_range_assignment` for the
same-span case (`operations.py:410-426`): it splits at `end_offset` first (row → left/right), then
splits `left` again at `start_offset` — so the second offset is measured against the *already-truncated*
left fragment, and only the *middle* fragment receives the character (`assign_ids=[mid_id]`). Storing
one `(hash, offset)` pair per row therefore cannot reconstruct: (a) multi-cut sentences, (b) offsets
in parent-sentence coordinates, or (c) which fragment carried which speaker. The anchor must record,
per parent sentence, the **ordered cut offsets in parent-sentence coordinates plus the per-fragment
assignment** — effectively the sentence's whole split-plan — not one offset per row. This is the
single most important correction; slice 2 as written will produce anchors that re-derive wrong
fragments.

**G2 — "Content-match first" collides with a committed regression test (breakage the plan doesn't
name).** `tests/db/test_chapters_sync.py:94` —
`test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` — deliberately asserts
*positional* semantics: `"Repeat. Middle. Repeat."` → `"Repeat. Repeat. Middle."` must preserve only
index 0's audio, and must **not** cross-match new index 1's "Repeat." to old index 2's "Repeat."
Slice 5's "content-match first, position as tiebreaker" would do exactly that cross-match and flip
this test red. The duplicate-sentence case ("He said." / "Yes." / "Repeat.") is common, not exotic.
The plan must (a) decide whether that test's expectation is still correct, (b) reconcile the two, and
(c) recognize that alignment is a **sequence-diff problem** (LCS/Myers keyed on normalized content,
position disambiguating equal-content runs), not a "match first occurrence" rule. This is the second
crux and the plan currently hand-waves it.

**G3 — Slices 4 and 5 overlap and are mis-ordered.** Slice 4 already says it scopes discard "to that
sentence's rows only (not a full-chapter index cascade)" — that *is* the cascade fix that slice 5
claims to own. You cannot land slice 4 with the cascade still broken, because fragments are what
*cause* the cascade (each split inflates row count and shifts every later index). Either merge 4+5,
or invert: land the alignment/diff engine first (fixing the cascade for whole sentences), then layer
the fragment re-derivation on top. As sliced, slice 4 lands in a half-broken state.

**G4 — Slice 3's "pure refactor, no behavior change" premise is false.** The two implementations are
not the same shape: `sync_chapter_segments` (`segments.py:521-539`) *mutates* and returns a preserved
set; `get_resync_preview` (`operations.py:296-307`) only *counts*. And their queries differ —
`get_resync_preview` selects only `text_content, character_id, speaker_profile_name, character_name`
(`operations.py:278`), so it can't see the new anchor columns without a query change. Extracting "the
index+equality logic" verbatim then rewriting it in slices 4/5 means the refactor is thrown away
immediately. The right shared unit is a **pure alignment function** returning a mapping
`new_sentence_index → (matched old row | None, kind)`; both callers consume the mapping (one to
rebuild, one to count). Define *that* contract in slice 3 and have both callers adopt it, or the
"no-behavior-change" gate is meaningless.

**G5 — Adjacent pre-existing data loss the trace surfaces (flag, don't fold in).** `sync_chapter_segments`
only carries forward 9 columns (`segments.py:529-539,557-569`). It drops `sanitized_text`,
`speaker_confidence`, `speaker_basis`, `speaker_evidence`, `needs_review`, `review_reasons`,
`locked`, `ai_suggested` on **every** save — even for rows it "preserves" (they fall to schema
defaults/NULL on re-insert). So AI-suggested speaker evidence and the `locked` flag are wiped on
ordinary edits today, independent of the RC-1 bug. This is out of RC-1's scope but sits on the exact
line the plan rewrites; the new preservation path should carry *all* segment columns forward, and the
existing whole-sentence path arguably should too. Record as a separate finding — don't silently
expand scope, but the executor of slice 4 will be touching this insert and should not re-freeze the
9-column loss.

**G6 — Existing `split_` id prefix is an unused partial signal (minor).** Right-hand fragments already
get `id = "split_<uuid12>"` (`operations.py:515`); left fragments keep the parent's id. The plan's
new columns are still needed (the left fragment is unmarked, and the prefix carries no parent/offset
data), but the plan should note this prefix exists — either build on it or explicitly note it's
superseded — so a future reader doesn't find two overlapping "is this a split" signals.

**G7 — Transaction/lock discipline for the shared function (correctness-adjacent).** `sync_chapter_segments`
is conn-ownership-aware (`segments.py:497-503,573-578`); `get_resync_preview` opens its own read-only
connection with no `_db_lock` (`operations.py:274`). The extracted alignment function must be pure
(no connection, no commit) and take already-fetched rows, so it's safe under both callers. Slice 3
should state this explicitly.

## What I'd change before build

1. Rewrite slice 2's anchor to store a per-parent-sentence **split-plan** (ordered cut offsets in
   parent coordinates + per-fragment assignment), not one `(hash, offset)` per row. (G1)
2. Reframe slices 3–5 around a single pure **sequence-alignment** function (content-keyed diff,
   position as tiebreaker among equal-content runs), merge the cascade fix into it, and reconcile
   with `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`. (G2, G3, G4)
3. Add the audio-carry-forward rule for byte-identical re-derived fragments, and note the cascade fix
   resolves most RC-1 audio loss on its own. (Q4)
4. Name the `add_column_if_missing`/`core.py` migration mechanism in slice 1; keep it out of import
   time. (Q3)
5. Record G5 (multi-column preservation gap) as an explicit adjacent finding with a decision on
   whether to fix it in the same change.

## Escalation posture

This does not clear my ceiling for escalation on its own — it's a plan-quality review, reversible,
and the remedy is knowable. But the alignment-design crux (G1/G2) is where a confident-but-wrong
structural answer is most likely, so I'd want it converged with Petra's empirical pass before build,
and if she and I diverge on the alignment approach, that split should go up rather than be averaged.
