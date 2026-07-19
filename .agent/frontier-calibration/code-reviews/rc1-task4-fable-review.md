# Code review — RC-1 Task 4 (`align_segments` wired into `sync_chapter_segments`)

**Branch:** `implement/rc1-task4-wire-sync` (`7ccd0f3a`), on top of Task 1 (`1c4851b4`)
**Diff reviewed:** `git diff 1c4851b4..7ccd0f3a -- app/db/segments.py` (the actual Task 4 diff — see
note below on why this is narrower than a `main`-relative diff)
**Method:** read the diff, then verified every claim below by *executing* the real functions
(`align_segments`, `build_chunk_groups`, `sync_chapter_segments`, `get_chapter_segments`) against
constructed inputs via `./venv/bin/python`, not hand-tracing — per the coordinator's ask and my
own prior suggestion.

## Verdict

**Needs changes before merge — not because the core mechanism is wrong, but because (a) the
commit shipped with zero new tests despite Task 4's own task file requiring RC-1-specific
regression tests written first (a real TDD/R1 policy violation, not a nitpick), and (b) I
independently confirmed the coordinator's chunk-group finding and found it's slightly different
— and more consequential for test validity — than described.** The wiring logic itself, once I
executed it against the real flagship use case (a mid-sentence character split + an unrelated
edit elsewhere), works correctly end-to-end. The mechanism is sound; the verification discipline
around it is not yet where the plan's own tasks required it to be.

## Note on scope: what's actually in this diff

Diffing this branch against `main` pulls in ~575 unrelated files (code-map infra, agent profiles,
prior unrelated merges) because `main` is far behind this branch's actual base. I re-scoped to
`git diff 1c4851b4..7ccd0f3a` (Task 1's commit → Task 4's commit) to isolate Task 4's real change:
**107 insertions / 48 deletions, entirely inside `sync_chapter_segments`.** The `get_chapter_segments`
rewrite (chunk-group canonical-audio check, `os.scandir` existence check, the `SEGMENT_AUDIO_RE`
regex change) that the coordinator's finding concerns is **pre-existing code, unrelated to Task 4**
— I confirmed via `git log -S "segment_to_canonical" -- app/db/segments.py` that this logic dates
to commit `bb2bb025` ("Studio2/phase 11 (#114)"), long before RC-1 work started. This matters for
finding 1 below: it's a downstream interaction with ambient code, not something Task 4 introduced
or needs to fix at its own layer.

## 1. Verifying the coordinator's chunk-group finding — confirmed, but sharper than described

I reproduced the exact committed-test scenario (`tests/db/test_chapters_sync.py:94-133`,
`"Repeat. Middle. Repeat."` → reordered to `"Repeat. Repeat. Middle."`) with **real code
execution**, first via the actual `align_segments`/`build_chunk_groups` functions on constructed
row dicts, then via a full end-to-end pytest probe using the real `sync_chapter_segments` +
`get_chapter_segments` against a real SQLite DB (script deleted after running; output captured
below).

**Confirmed:** `get_chapter_segments`'s chunk-group canonical check does reset the "Middle" row's
audio to `unprocessed` on read, for a reason entirely separate from `align_segments`'s write-time
preservation. Mechanism, traced in `app/domain/chunk_groups.py:47-90`: `build_chunk_groups` merges
**contiguous rows sharing the same `character_id`/`profile_name`/`engine`** into one group, and
`group_wav_path`/the diff's `segment_to_canonical` map (`app/db/segments.py`, post-diff) treat only
the **first member's** id as the group's canonical filename. A non-leader member's own,
individually-named audio file (e.g. `middle.wav`) will never equal that canonical name, so it's
invalidated on the next read.

**Where I sharpened it:** the coordinator's framing — "if its position shift causes it to merge
into a different character/profile group" — implies the *reorder* is what triggers the merge. My
execution shows this isn't quite right for this specific test. All three rows in
`"Repeat. Middle. Repeat."` have `character_id=None` (the test never assigns a character) — so
they form **one contiguous group regardless of order**, since grouping only cares about
character/profile adjacency, not position. I verified this by running `get_chapter_segments`
**before any resync at all**, immediately after the three `update_segment(..., audio_status="done")`
calls:

```
PRE-RESYNC (no reorder at all) state:
  ...first...   Repeat.  done   <first_id>.wav
  ...middle...  Middle.  unprocessed None
  ...last...    Repeat.  unprocessed None
```

"Middle" and "last" are *already* invalidated on the very first read, with zero resync, zero
reorder, zero involvement from `align_segments` or Task 4's diff at all. The mechanism is real; the
specific causal story ("position shift causes the merge") isn't — it's same-character/profile
*adjacency* that causes it, and in this particular committed test, that adjacency was present from
the moment the segments were created.

**Higher-value implication the coordinator's message didn't state:** this means
`test_sync_chapter_segments_does_not_cross_match_reordered_duplicates` is **confounded** for its
"Middle" and second-"Repeat." assertions. The test's audio-status/audio-path assertions for those
two rows would pass identically whether or not `align_segments`/`sync_chapter_segments` correctly
preserves them — the chunk-group read-time check produces the same "unprocessed" outcome
regardless. A regression that broke `align_segments`'s preservation of "Middle" entirely (e.g.
minted it a new id, dropped its `character_id`) would be invisible to this test for that row. The
test's `audio_file_path == first_file.name` assertion for **"first"** (index 0) is *not* confounded
— "first" remains the group's canonical leader and its audio genuinely survives via real
preservation — so the test still has partial value, just not the value its docstring/name imply
for the duplicate rows specifically.

**I also verified the actually-important case — the flagship RC-1 scenario — is unaffected by
this confound**, via a full end-to-end DB run: a real mid-sentence split (`_apply_range_assignment`
assigning "quick " to a distinct character within "The quick fox.") followed by an unrelated edit
to a second sentence, then a real `sync_chapter_segments` call and `get_chapter_segments` read:

```
Before unrelated edit:
  ...l...  'The '    done  <l>.wav
  ...m...  'quick '  done  <m>.wav   (character_id = charX)
  ...r...  'fox. '   done  <r>.wav

After unrelated edit + resync:
  ...l...  'The '                done  <l>.wav       char=None
  ...m...  'quick '              done  <m>.wav       char=charX
  ...r...  'fox. '                done  <r>.wav       char=None
  ...new... 'Edited second sentence.'  unprocessed   None      char=None
```

All three fragments survive with their original ids, `character_id`, and audio untouched — because
each fragment has a *distinct* character/profile from its neighbors, so `build_chunk_groups` never
merges them into someone else's group; each is its own canonical leader. **Task 4's fix genuinely
delivers on the RC-1 bug for the real target use case.** The chunk-group confound only bites the
narrower case of same-character adjacent rows (like the pre-existing duplicate test), not the
split-with-distinct-speaker scenario RC-1 was actually about.

## 2. Does this change anything about whether Task 4's wiring is correct?

No — I agree with the coordinator's own assessment. `align_segments`/`sync_chapter_segments`'s job
is to decide *which DB rows to keep and what to write*; it correctly does that (verified above).
`get_chapter_segments`'s chunk-group canonical check is a genuinely separate, pre-existing
mechanism operating one layer downstream, on read, based on grouping semantics that have nothing to
do with the RC-1 sync bug. Task 4 is correct at its own layer. But two things follow from this that
aren't just "downstream, not my problem":

- **The plan's success criteria never anticipated this interaction**, and it should be recorded
  somewhere durable (a plan doc addendum, or a new invariant) before Task 5/6/7 proceed, so a
  future contributor doesn't rediscover "why does Middle still show unprocessed" as a fresh bug.
  The commit message does this responsibly (flags it explicitly, doesn't silently patch around
  it) — that's the right call for a mid-stream discovery, but it needs to land in
  `01-map.md`/`00-overview.md` as a recorded invariant, not just a commit message, or it'll be lost
  the moment this branch merges and its commit history stops being anyone's first read.
- **Task 7's planned regression suite must use distinct-character scenarios**, not same-character
  duplicates, when asserting audio survival — otherwise Task 7's tests will inherit the same
  confound I found in the pre-existing test and could pass even if a future regression broke real
  preservation logic for narrator-duplicate cases specifically.

## 3. Other findings from reviewing the diff itself

- **No new tests in this commit — a real gap against Task 4's own acceptance criteria, not a
  style nitpick.** I checked: `git diff 1c4851b4..7ccd0f3a --stat -- tests/` returns nothing. Zero
  test files changed. Task 4's task file
  (`design-docs/plans/active/span_resync_preservation_fix/tasks/004-wire-sync-chapter-segments.md`)
  lists as acceptance criteria: an RC-1 regression test "written first... confirmed red then
  green," a test asserting audio survives for preserved fragment rows, and a test asserting
  `_build_base_revision_id`'s hash stays stable across a preserve-only save. **None of these were
  added.** The commit message's "493 existing tests... pass unchanged" only demonstrates no
  regression on pre-existing tests — it is not evidence the new behavior is correct, and I had to
  write my own throwaway probe scripts (not committed) to get that evidence myself. This is a
  direct violation of this repo's binding TDD policy (`design-docs/specs/testing-standards.md` R1)
  and the plan's own explicit instructions. Before merge, this commit (or a follow-up in the same
  PR) needs the actual committed tests Task 4 specified — I've now proven by hand-execution that
  the mechanism works, but "I ran a throwaway script during review" is not a substitute for a
  committed, revert-checked regression test.
- **The task file itself wasn't updated.** `git diff 1c4851b4..7ccd0f3a -- design-docs/plans/.../tasks/004-*.md`
  is empty — no checkboxes ticked, no status line changed from `pending`. This violates the plan
  folder's own stated convention (`README.md`: "Whoever executes a task updates its status line and
  ticks its checkboxes in the same change as the work — a stale checklist poisons every later
  session that reads it"). Minor on its own, but combined with the missing tests, it means nothing
  in the repo's durable record currently reflects that Task 4 happened, what was verified, or what
  wasn't.
- **Invariant I5 (the 9-column INSERT data-loss bug) — not fixed, and no decision recorded.** The
  new `INSERT INTO chapter_segments` (diff, "for r in final_rows: if not r['preserved']...") still
  writes exactly the same 9 columns as before
  (`id, chapter_id, segment_order, text_content, character_id, speaker_profile_name, audio_status,
  audio_file_path, audio_generated_at`) — `sanitized_text`, `performance_data`,
  `speaker_confidence`, `speaker_basis`, `speaker_evidence`, `review_reasons`, `needs_review`,
  `locked`, `ai_suggested` are still silently dropped for genuinely-new rows. Task 4's own
  acceptance criteria required *either* fixing this inline (since the INSERT was already being
  touched) *or* explicitly recording a decision to defer it. Neither happened — the task file
  wasn't updated and the commit message doesn't mention I5 at all. This is a missed, explicitly-
  required decision point, not a new defect Task 4 introduced (preserved rows never went through
  this INSERT anyway, so they're unaffected — that part of I5 is correctly, if silently, resolved
  as a side effect of preserve-in-place; only the *newly-inserted-row* half of I5 remains open and
  undecided).
- **`segment_order` updates confirm and materialize the tension I flagged in my Task 1 review.**
  The diff's step 5 (`order_changed = r["segment_order"] != r["orig_segment_order"]`) issues a real
  `UPDATE ... SET segment_order = ...` for any preserved row whose position shifted — which is the
  correct, necessary behavior (Task 1's own `PreservedRun` docstring already flagged this as
  "Invariant I1a"), but it directly contradicts the literal wording of Task 4's own task file:
  *"preserve matched rows in place... no delete, no insert, no update — for any row `align_segments`
  says to keep."* The shipped code is right; the task file's language is now provably wrong and
  should be corrected (e.g., "no update to content/character/audio fields; `segment_order` alone
  may update for repositioned runs") so a future reader doesn't treat "no update" as a literal
  invariant to re-enforce.
- **Correctness of the differential-write logic itself, verified by execution, not just reading:**
  I ran the actual `sync_chapter_segments`/`get_chapter_segments` pair (via the probes above) and
  separately the full `tests/db/test_chapters_sync.py` + `tests/db/test_segment_alignment.py`
  suites (`./venv/bin/python -m pytest ... -q`) — **14 passed, 0 failed.** The per-row audio
  fields for a multi-row fragment run are correctly taken from each row's *own* stored values
  (`app/db/segments.py`, step 3 of the diff: `row = existing_by_id[rid]`, not the run leader's), so
  fragments don't accidentally inherit a sibling's audio state — I checked this specifically since
  it would have been an easy mistake for a naive "preserve the run" implementation to make.
- **Shared-audio invalidation pass (step 4) correctly generalizes the pre-existing behavior:**
  `removed_audio_paths` is built from the *actually-unmatched* rows (via `alignment.unmatched_existing_ids`),
  and any preserved row sharing a file with one of those gets force-invalidated — matches the
  original code's intent and is covered by the pre-existing
  `test_sync_chapter_segments_invalidates_preserved_rows_that_shared_audio_with_a_changed_segment`
  test, which I confirmed still passes.
- **No bug found in the differential DELETE/INSERT/UPDATE partitioning itself** — `unmatched_ids`
  drives the DELETE set, non-preserved fresh sentences drive the INSERT set, and preserved rows
  either get no write (truly untouched) or an UPDATE scoped to `segment_order`/audio fields only.
  This is a clean, correct decomposition of the "preserve in place" mechanism as designed.

## Confidence

High. Every substantive claim in this review — the chunk-group mechanism, its non-dependence on
reorder for the same-character case, the test confound, and the flagship scenario's correctness —
was verified by actually executing the real functions (`align_segments`, `build_chunk_groups`,
`sync_chapter_segments`, `get_chapter_segments`) against constructed and real-DB inputs, not by
reading and reasoning about the code. The only claims I did not independently execute are the
transaction-posture requirement (Invariant I4 — conn-owned vs. self-committing callers); I read the
code path for both but didn't construct a test hitting the self-committing explicit-resync route
specifically, since that route isn't touched by this diff and Task 4's own task file also doesn't
show a committed test for it.

## What would change my verdict

Committed tests matching Task 4's own acceptance criteria (RC-1 regression with distinct
characters, revision-id stability across a preserve-only save, and — given what I found — an
explicit test proving the "Middle"-style same-character-duplicate case is *not* silently masking a
broken preservation path), the task file's status/checkboxes updated, and either an inline I5 fix
or an explicit recorded deferral. The underlying mechanism itself does not need to change.
