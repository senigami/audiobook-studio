# RC-1 plan review — Tamsin (empirical / bottom-up panelist)

**Plan:** `design-docs/plans/active/span_resync_preservation_fix/00-plan.md`
**Lens:** reasoned up from the actual call sites and the symbol trace, not from the plan's
self-description. Independent, complete review — nothing deferred to Esther.

## Ground truth loaded

- Map ritual run: core `map.json` + `app/db/segments.py` shard loaded; symbol trace on the three
  target functions via grep-confirmed call graph.
- Code read directly: `sync_chapter_segments` (`app/db/segments.py:492-599`),
  `_split_segment_at_offset` (`app/domain/chapters/operations.py:501-539`),
  `_apply_range_assignment` (`operations.py:385-465`), `get_resync_preview`
  (`operations.py:270-316`), `update_chapter` guard (`app/db/chapters.py:210-231`),
  `_build_base_revision_id` (`app/domain/chapters/helpers.py:116-136`),
  `split_into_sentences` (`app/db/nlp.py:8-11`).
- Callers of `sync_chapter_segments`: `chapters.py:54` (create path, conn-owned),
  `chapters.py:224` (update_chapter, conn-owned), `routers/chapters.py:259` (explicit resync,
  **no conn — self-committing**), re-exported in `app/db/__init__.py:5`.

## Verdict

**Design direction is SOUND; plan is NOT build-ready as written.** Content-anchored reconciliation
is the correct diagnosis and the correct fix shape — the RC-1 bug reproduces exactly as claimed from
the code (confirmed below). But the *mechanism* the plan picks ("re-derive fragments at a recorded
offset") is the wrong lever and introduces two new regressions; the anchor model under-counts real
splits; and the test slice violates the repo's own R1/TDD ordering. Fix G2, G3, G1 and the sequencing
before build. Confidence: **high** on the bug and on G2/G3/S1 (direct from code); **medium** on the
schema-free alternative (depends on whitespace handling I did not exhaustively trace).

## The bug is real — and worse than the plan states

At `segments.py:521-539` sync rebuilds every row from `split_into_sentences(text_content)` (whole
sentences) and preserves `existing[i]` only if `existing[i].text.strip() == sentences[i].strip()`
(`:523`). A split fragment ("Hello") never equals its parent whole sentence ("Hello world."), so
index `i` fails; the extra fragment row shifts every later index, so all later comparisons fail too
(`:555` deletes all, re-inserts whole sentences). **The plan says rows are "recreated with
character_id=None" — understated.** The sub-sentence *structure itself* is destroyed: the chapter
reverts to whole-sentence segmentation and the fragment rows cease to exist. The anchor approach does
address this, but reviewers should know the loss is structural, not just an assignment nulling.

## Answers to the 4 open questions

**Q1 (fuzzy vs exact hash):** Use **normalized-exact**, not fuzzy. Hash the `.strip()`-normalized
sentence so it matches the comparison semantics already in force at `:523` and `operations.py:299`.
That alone handles the whitespace-only edit case Q1 worries about. Reject fuzzy/near-match: it risks
re-attaching a stale speaker assignment to genuinely changed content, which is the exact silent-loss
failure this plan exists to prevent, inverted.

**Q2 (splitter chooses a different boundary after unrelated edits):** Acceptable, and the design is
self-protecting *if you preserve rather than re-derive* (see G2). Hash-match gates everything: if the
splitter emits a different sentence S, the hash won't match, and you fall to the discard path. Worst
case is an unnecessary discard, never a wrong reconstruction. No silent corruption.

**Q3 (migration vs side table vs neither):** A migration is **not clearly necessary at all.**
Because `existing` rows are already in hand during sync, reconciliation can be **schema-free**:
concatenate consecutive existing fragment rows and compare to the fresh sentence — if
`concat(existing[j..k]) == sentence`, those rows *are* that sentence's fragments; preserve them in
place. This sidesteps the versioned-contract concern entirely. `chapter_segments` is not an external
versioned contract, so if you do add columns, nullable additive columns need no contract-version bump
and a side table only buys join complexity. **Recommendation: try schema-free first; columns as
fallback; side table not warranted.** (Falsifier below.)

**Q4 (audio_status/audio_file_path interaction):** Yes — real, and the plan does not account for it.
`_split_segment_at_offset` unconditionally sets `audio_status='unprocessed'`, nulls
`audio_file_path`/`audio_generated_at` (`:519`, `:535`). So the plan's "re-run the split" mechanism
would **destroy already-rendered fragment audio on every save** even when nothing changed. Preserved
fragments must carry `audio_status`/`audio_file_path`/`audio_generated_at` forward unchanged.

## Gaps the trace surfaces

- **G1 — anchor model under-counts splits (correctness).** `_apply_range_assignment` splits a single
  sentence into up to **three** fragments via **two** `_split_segment_at_offset` calls
  (`operations.py:420,423` same-span; `433,441` cross-span). Slice 2's "record the split offset
  (singular) on both resulting fragment rows" cannot represent a 3-fragment split. The model must
  handle N cut-points per parent sentence. Note offsets happen to stay parent-relative in the
  same-sentence case (left-first nesting: `left = text[:end_offset]`, then split left at
  `start_offset < end_offset`), but the plan never states this invariant and it is load-bearing.

- **G2 — wrong mechanism: re-derive vs preserve (correctness + concurrency).** The plan repeatedly
  says "re-derive/re-run the split against the sentence." That mints **new** `split_<uuid>` ids
  (`operations.py:515`) and nulls audio every save. Two regressions follow: (a) audio loss (G3/Q4);
  (b) `_build_base_revision_id` (`helpers.py:127-134`) hashes segment `id`s — new ids every save
  churn the optimistic-concurrency token, risking spurious `RevisionMismatch` conflicts. **Correct
  lever: PRESERVE the existing fragment rows in place** (keep id, character_id, speaker, audio) when
  the parent sentence is unchanged. You already hold those rows in `existing`; recognition is the only
  problem, and reconstruction is unnecessary. This is simpler than the plan and removes G3 and the
  churn for free.

- **G3 — fragment audio not preserved.** Covered under Q4. Any preserved fragment with unchanged text
  must retain its rendered audio; today's split path always invalidates.

- **G4 — hash normalization.** Covered under Q1: hash the stripped sentence, or whitespace edits
  spuriously discard.

- **G5 — duplicate identical sentences.** Two identical split sentences in one chapter produce
  identical hashes; the anchor path needs a position tiebreaker just as the whole-sentence path does
  (slice 5). The plan mentions position-as-tiebreaker only for whole-sentence rows.

## Task-slice sequencing issues

- **S1 — tests are mis-sequenced (violates the repo's own R1).** Slice 7 bundles all tests last, yet
  `testing-standards.md` R1 and the plan itself (slice 3) require the failing test **first**, red on
  pre-fix code. The RC-1 regression test must exist and be confirmed red **before** slices 4/5, not
  after. Reorder: regression test up front; each behavior slice lands with its revert-checked test.

- **S2 — slice 5 is an independent, pre-existing bug and can/should land on its own.** The
  whole-sentence index cascade is not a splits problem: insert or delete a sentence *earlier* in a
  chapter with no splits at all and every later assignment is lost today (row count shifts, `:523`
  index comparison misaligns). It needs no anchor metadata and can ship first as a standalone
  revert-checked fix, de-risking the larger change.

## Blast radius the plan under-surfaces

- **Return-shape change (slice 6).** `sync_chapter_segments` currently returns `True` (`:599`).
  Surfacing `lost_assignments_count` changes its contract and touches the `app/db/__init__.py:5`
  re-export. All three callers ignore the return today (`chapters.py:54,224`; `routers/chapters.py:259`
  via `run_sync`), so risk is low — but the two transaction modes differ (conn-owned vs the
  self-committing resync route) and the plan should state the signature change explicitly.
- **`compact_script_view` (`operations.py:319`)** merges adjacent compatible segments — the inverse
  operation. Merged fragments leave any stored anchors stale. The plan doesn't mention merge; flag it
  (another reason to prefer schema-free recognition over stored anchors).
- **`_build_base_revision_id`** (`helpers.py:116`) safely excludes the proposed new columns (it hashes
  id/order/text/character/profile only) — but is broken by G2's new-id churn, not by the columns.
- **`facade.py`** re-exports both `get_resync_preview` and `_split_segment_at_offset` (`:31`, `:35`);
  the slice-3 extraction must keep those exports intact.

## Falsifier

The schema-free (concatenation) recommendation for Q3 fails **if** `split_sentences(...,
preserve_gap=True)` normalizes inter-fragment whitespace such that `concat(existing fragments)`
≠ the fresh sentence even when the sentence is unchanged. I did not exhaustively trace
`app/utils/text/textops.py:split_sentences`. If that inequality holds, stored anchor columns become
necessary and Q3's answer flips to "additive nullable columns." One targeted test on `split_sentences`
gap handling settles it before build.

## Escalation

None triggered. This is a plan review within analysis scope — no merge/release/contract-version
decision is being made here. Slice 1's migration touches the "versioned contracts" owner directive;
reviewing it is my job, but if the team chooses stored columns over schema-free, the owner should
confirm the additive migration is acceptable (it does not bump an external contract, so this is a
courtesy confirmation, not a gate).
