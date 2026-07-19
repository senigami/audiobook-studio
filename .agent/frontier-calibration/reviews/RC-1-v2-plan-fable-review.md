# Adversarial review — corrected plan (span_resync_preservation_fix/, v2)

**Reviewing against:** my own `.agent/frontier-calibration/references/RC-1.md` and my prior
`.agent/frontier-calibration/reviews/RC-1-plan-fable-review.md`.
**Plan reviewed:** `design-docs/plans/active/span_resync_preservation_fix/` — README.md,
00-overview.md, 01-map.md, 02-roadmap.md, tasks/000-007.
**Review only — no code or plan edits made.**

## Verdict

**Build-ready, with two small conditions to hold the executor to, not the plan author.** This
is a materially different and stronger plan than the one I reviewed first — it changed the
actual mechanism (preserve-in-place, not re-derive), correctly generalized the anchor model to
1-3 row fragment runs, and it independently discovered and now guards a real, previously
uncaught defect (the whitespace-strip falsifier, I3) via a verification scout before writing
any task. I spot-checked its two most load-bearing factual claims against the actual code
(the committed duplicate-sentence test, and `split_sentences`' strip behavior) and both check
out. My remaining concerns are about execution discipline (an "owner decision" left dangling
in one task, and one place the roadmap's parallelism claim is looser than it looks), not about
the design being wrong.

## 1. Does it correctly adopt "preserve in place" (not re-derive) as the core mechanism?

Yes, and it goes further than just adopting it — it makes *why* explicit and load-bearing
rather than incidental. `01-map.md` Part P6 and the Connections section
(lines 55, 63-66) tie preserve-in-place directly to `_build_base_revision_id`
(`app/domain/chapters/helpers.py:116-136`): recreating a row mints a new id, which churns the
revision hash and risks spurious `RevisionMismatch` conflicts even when nothing meaningfully
changed. Task 4 (`tasks/004-wire-sync-chapter-segments.md:21-27`) restates this as the reason
"preserve" means *no delete, no insert, no update* for a matched row — not "recreate with
identical content," which is exactly the distinction my first review's Q4 was pushing at. Task
4's acceptance criteria go one step further than I asked for: it requires a test asserting
*same row id* (not just same content) survives (line 51-52), and a separate test asserting the
revision-id hash itself doesn't change across a preserve-only save (line 56-57). That's a
correctness property my own review didn't think to name explicitly, and it's the right one —
good sign this was actually redesigned, not just patched to satisfy my wording.

## 2. Does the alignment/anchor model (01-map.md P1, Task 1) handle the chained/multi-split case I flagged?

Yes. My original finding was that `_apply_range_assignment`'s same-span-id branch
(`operations.py:410-426`) calls `_split_segment_at_offset` twice, and the second call splits
the *already-split left fragment*, not the original sentence — so a single-offset,
single-parent-hash anchor (as the first draft's design implied) has no row whose anchor equals
the full re-split sentence. This plan sidesteps the problem entirely rather than patching
around it: `01-map.md` Connections (line 67-70) states the requirement directly — "P1's
fragment-run matching must handle a run of up to 3 contiguous rows mapping to one fresh
sentence, not just 2" — and Task 1 operationalizes it as `strip(concat(run[j].text_content for
j in run)) == strip(fresh_sentences[i])` for a **contiguous run of 1-3 rows**
(`tasks/001-align-segments-core.md:46-50`), with an explicit test case for the 3-fragment
scenario (line 63-64) and Task 7's end-to-end test 4 (`tasks/007-full-regression-suite.md:25-27`)
repeating it at the system level.

This works because concatenation-based recognition doesn't need any single row to "be" the
parent — it only needs the *set of sibling rows* to reconstruct the sentence when concatenated,
regardless of how many split calls produced them or what intermediate text each call operated
on. That's a strictly better mechanism than the anchor-hash idea I was critiquing, not a
patched version of it — it dissolves my objection rather than working around it. I don't see a
case beyond 3 fragments in the current codebase (`_apply_range_assignment`'s only two branches
produce at most 3 rows per sentence), so the "1-3" bound is correctly scoped to what
`_split_segment_at_offset`'s actual call sites can produce, not an arbitrary cap.

One thing worth flagging, not a blocker: Task 1's "up to 3" is a fact about *today's* only
caller of `_split_segment_at_offset`. If a future caller ever splits a sentence more than
twice (e.g., a 4-way assignment), this ceiling would need to move with it. The plan doesn't
state the bound as derived-from-caller-behavior anywhere explicit — worth a one-line comment
in Task 1's implementation noting the "3" is not a fundamental constant, so a future reader
doesn't hardcode it as gospel.

## 3. Does it correctly account for audio preservation now?

Yes — and correctly locates the mechanism as a *consequence* of preserve-in-place rather than
a separate patch, which is a stronger fix than what I asked for in my first review (I asked for
"an explicit acceptance criterion," expecting a bolt-on `preserved_ids` check). Task 4's
acceptance criteria (line 54-55) requires the test itself to assert
`audio_status`/`audio_file_path` unchanged for preserved fragment rows, and because
preserve-in-place means literally no write touches the row, there's no code path left that
could reach the `cleanup_chapter_audio_files`/`removed_rows` deletion logic
(`segments.py:581-592` in the pre-fix code) for a preserved row — it's structurally excluded,
not conditionally excluded. This is better than my original ask because it can't regress via a
missed `preserved_ids.add()` call somewhere; there's no such set to forget to update.

## 4. Anything from my original review still unaddressed, or any NEW issue this version introduces?

### Carried over and now addressed
- Chained/multi-split gap → fixed (§2 above).
- Audio preservation ambiguity → fixed (§3 above).
- Tests deferred to a terminal slice, against this repo's binding TDD/R1 policy → fixed: every
  task (0, 1, 4, 5, 6, 7) now states "write the test first... confirm red... then implement,"
  and the roadmap's ordering rationale (`02-roadmap.md:5`) states this explicitly as the
  ordering principle, not just a per-task habit.
- Slices 4/5 (old plan) risked two independently-designed algorithms drifting → fixed by
  construction: Task 3 exists solely to make `align_segments` the *only* place matching logic
  can live, and both `01-map.md` (line 59-62) and Task 3's docstring requirement
  (`tasks/003-finalize-shared-export.md:20-22`) state this as a standing rule for future
  changes, not just this change.
- Duplicate-sentence hash-collision case → resolved via the pivot away from hashing entirely.
  Position-tiebreak-among-content-matches (Invariant I2) is now backed by a real,
  already-committed test (`tests/db/test_chapters_sync.py:94`, I checked it directly — its
  three-segment "Repeat./Middle./Repeat." reorder scenario and first-occurrence-wins assertion
  match the plan's description exactly, lines 118-133). Good: the plan is being held to an
  existing regression test, not just a described requirement.
- `compact_script_view` anchor staleness → resolved by elimination, not by an explicit fix:
  since Task 1 went schema-free (no stored anchor columns in the primary path), there is no
  anchor metadata for a merge to leave dangling. `01-map.md` Invariant I6 states this
  correctly ("moot if schema-free holds"). This is a legitimate way to close the gap — removing
  the hazard is at least as good as guarding it — but it is *conditional* on Task 2 never
  triggering. If Task 2 (additive columns) does trigger, I6 reactivates and nothing in Task 2's
  steps mentions `compact_script_view` at all. Worth flagging: **if Task 2 executes, add an
  explicit step to clear/handle the new column(s) on merge** — the plan currently only notes
  the risk conceptually (I6) without giving Task 2 an acceptance criterion for it.

### New findings in this version

1. **I5 (the 9-column data-loss bug) is scoped as an "owner decision," but Task 4 defaults to
   fixing it inline without a clear stop-and-ask gate.** `00-overview.md` (line 32, success
   criterion 7) frames this correctly as "a decision required... not necessarily executed in
   this change." But Task 4's step 5 (`tasks/004-wire-sync-chapter-segments.md:36-41`) says "the
   owner/engineer executing this task decides... note that decision in this task's completion
   notes" — i.e., the decision point is buried inside an implementation task rather than
   surfaced before work starts. For a plan whose own README emphasizes "act, then report" isn't
   quite the operating model here (this is a design decision with schema/behavior
   implications, not a style call) — I'd want this decision made explicit *before* Task 4 is
   picked up, not discovered mid-task by whichever executor gets there. Low severity (the
   fallback if undecided is "defer, note it," which is safe) but worth tightening: promote this
   to an explicit go/no-go the plan owner answers once, rather than a per-executor judgment call
   embedded in a task file.

2. **Task 5's "can run parallel with Task 4" claim (`tasks/005-wire-resync-preview.md:2`,
   `02-roadmap.md:47`) is true for the code, but the plan doesn't flag the shared-checkout risk
   this user's own memory record calls out** (`parallel-batches-use-git-worktree-per-lane` /
   `parallel-implementers-shared-checkout-race` — both tasks touch files that Task 6 then reads
   from, and Task 4 and Task 5 both import from the same new `align_segments` module Task 3 just
   finalized). Two agents editing different files that both just came into existence from the
   same dependency is exactly the shape of "looks independent, shares fresh unstable ground"
   that has caused real problems in this repo before. This isn't a defect in the plan's
   *design* — it's a gap in the roadmap's execution guidance. Worth a one-line addition: if
   Tasks 4 and 5 are executed by different agents/sessions concurrently, use isolated
   worktrees, not a shared checkout, per this repo's own prior incident.

3. **Minor, not a blocker: Task 1's test list doesn't explicitly test the interaction the map's
   own Risk R1 names as "the trickiest correctness surface"** — duplicate sentence disambiguation
   *combined with* a fragment-run split in one of the duplicate occurrences. `01-map.md` R1
   (line 121-124) correctly names this as the hardest case and assigns it to Task 7's test
   suite (test 2, `tasks/007-full-regression-suite.md:20-22`). That's a reasonable place to put
   an integration-level test, but Task 1 (`align_segments`'s own unit test suite,
   `tasks/001-align-segments-core.md:60-71`) tests fragment-runs and duplicates as *separate*
   cases, never their intersection at the unit level. If the intersection breaks, Task 7 will
   catch it, but only after Tasks 1, 3, 4, 5 all appear "done" — a unit-level test of the
   intersection in Task 1 would localize a failure to the actual function under test instead of
   surfacing it three tasks later during full-system regression. Recommend adding it to Task
   1's list, not just Task 7's.

## Confidence

High. I independently re-verified the two claims the whole plan leans on hardest — the exact
semantics of the committed duplicate-sentence test (`tests/db/test_chapters_sync.py:94-133`, I
read it directly and it matches the plan's description word-for-word) and the whitespace-strip
falsifier's premise (I read `app/utils/text/textops_splitting.py`'s `preserve_gap=False` branch
directly — it does `raw_sentence.strip(" \t\r")`, confirming whole sentences are stripped while
`_split_segment_at_offset` does raw, unstripped substring slicing — so I3's stated fix,
strip-after-concat, is correctly diagnosed). Both held up. My remaining findings (I5's decision
gate, the worktree note, the missing unit-level intersection test) are process-hygiene
observations on an otherwise sound and now substantially stronger plan, not corrections to its
design.
