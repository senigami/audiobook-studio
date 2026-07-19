# Code review — RC-1 Task 5 (`align_segments` wired into `get_resync_preview`)

**Branch:** `implement/rc1-task5-wire-preview` (`8d5b7e45`), on top of Task 4 (`a3986be9`)
**Diff reviewed:** `git diff a3986be9..8d5b7e45` (scoped to the actual commit range, not `main`)
**Method:** mechanical process checks (test presence, revert-check, parity, remaining-caller
sweep) plus a normal code review — all verified by **executing** the real functions
(`align_segments`, `get_resync_preview`, `sync_chapter_segments`, `get_chapter_segments`)
against constructed scenarios via `./venv/bin/python`, per the coordinator's ask.

## Verdict

**Approve, with one real bug to fix before/shortly after merge — not in what this task
changed, but in an adjacent line inside the same function that Task 5 had the opportunity to
notice and didn't.** Process compliance is markedly better than Task 4 (real tests, present
and revert-checked; I independently reproduced both the green and the red state). The parity
claim holds under every scenario I constructed, including the duplicate+split intersection and
a 3-way split. But I found a genuine, execution-confirmed, user-facing bug in `is_destructive`
— untouched by this diff, but sitting three lines below the code Task 5 did change, using the
same variables — that produces a contradictory warning-icon-plus-success-message UI state for
any chapter that uses the (now-working) sub-sentence-split feature at all.

## Mechanical process checks (per the coordinator's specific ask)

### 1. Are there committed tests? — Yes, confirmed by execution

`git diff a3986be9..8d5b7e45 --stat -- tests/` → `tests/domain/test_chapter_resync_preview.py | 76 +++++++++++++++++++++++++++++`,
one new file, 76 insertions, 3 tests (`test_preview_does_not_report_destructive_for_a_reorder_the_real_sync_actually_preserves`,
`test_preview_reports_genuine_loss_when_a_split_sentence_is_actually_edited`,
`test_preview_is_a_pure_read_no_db_writes`). This is a real improvement over Task 4, whose
`git diff --stat -- tests/` I ran the same way last round and got nothing.

### 2. Does it revert-check cleanly? — Yes, confirmed by execution (with a self-correction worth noting)

I initially tried `git stash push -- app/domain/chapters/operations.py -m "..."` to isolate the
revert — the `-m` flag placement after `--` is invalid syntax, the push silently failed, and my
follow-up `git stash pop` popped an unrelated **pre-existing stash from a completely different
branch** (`studio2/phase-12.7-final-polish`), producing a merge conflict in
`frontend/src/pages/ChapterEditor/components/DirectorsConsole/index.tsx` — a file this task
never touched. I caught this immediately via `git status`, ran `git reset --merge` to abort the
conflicted pop and restore a clean tree, and confirmed via `git stash list` that all pre-existing
stashes (several, from unrelated branches — this is a shared checkout) were left completely
untouched. No work was lost. I then redid the revert-check safely via file copy/restore instead
of `git stash`:

```
cp app/domain/chapters/operations.py /tmp/operations_task5.py
git show a3986be9:app/domain/chapters/operations.py > app/domain/chapters/operations.py
./venv/bin/python -m pytest tests/domain/test_chapter_resync_preview.py -q --no-cov
# 1 failed, 2 passed
cp /tmp/operations_task5.py app/domain/chapters/operations.py
```

Result: `test_preview_does_not_report_destructive_for_a_reorder_the_real_sync_actually_preserves`
fails on pre-Task-5 code with `assert 1 == 0` (predicted 1 lost assignment where the real sync
preserves 0) — an exact match to the commit message's specific claim ("predicted 1 lost
assignment where the real sync preserves 0"). The other two tests pass on old code too, which is
correct — they don't depend on the fix (one tests a genuinely-destructive case the old logic
also got right by coincidence of not having fragment-run matching to worry about; the other
tests pure-read behavior, unaffected by which alignment logic is used). Confirmed: this is a
real, working R1 revert-check, not a claimed one.

**Flagging for the record, not as a criticism of this task:** the shared checkout currently has
a live, uncommitted Task 6 prep in progress (`app/db/segments.py`, `app/db/chapters.py`,
`app/api/routers/chapters.py` all show local modifications; several untracked scratch files
matching a parity-testing pattern similar to my own), and I hit a live pytest lock held by
another active process (PID 51171, `pytest tests/domain tests/db`) mid-review — I waited for it
to finish rather than removing the lock file, per this repo's shared-checkout safety practice. I
did not touch any of that in-progress work.

### 3. Parity claim — verified by execution across 4 scenarios, holds in all of them

I constructed and ran (`tests/domain/test_fable_rc1_task5_parity_probe.py`, written for this
review and deleted after use — not committed) four scenarios comparing
`get_resync_preview`'s prediction against `sync_chapter_segments`'s actual outcome:

1. **Unrelated edit elsewhere, no assignment near it** — `lost_assignments_count: 0`, matches.
2. **The assigned sentence itself is edited** — `lost_assignments_count: 1`,
   `affected_character_names: ['Villain2']`, `is_destructive: True` — matches (genuine loss,
   correctly surfaced).
3. **A real 3-way split (`_apply_range_assignment`'s two-call pattern) + an unrelated edit to a
   different sentence** — `lost_assignments_count: 0`; actual sync run afterward confirms exactly
   one row (the middle fragment) retains its `character_id`, matching the preview's prediction
   that nothing was lost. **Parity holds — but see the `is_destructive` bug below, found via this
   exact scenario.**
4. **The Task-1 duplicate+split intersection I flagged in my prior review** (a manually-split
   sentence whose text is *also* duplicated elsewhere, no-op resave) — whatever the real sync
   actually does to this case (a known, separately-tracked Task 1 bug, not this task's concern),
   the preview's prediction matched the real outcome exactly in my run. Parity holds even for the
   already-known-buggy underlying case, which is the correct scope for Task 5: it is not this
   task's job to fix Task 1's duplicate-gate bug, only to make sure the preview doesn't lie about
   whatever the real sync does. It didn't.

**`preserved_assignments_count`'s fresh-sentence-granularity counting is correctly implemented**
for the fragment-run case — I verified scenario 3's `preserved_assignments_count: 1` reflects
one fresh sentence (the 3-fragment "The quick fox.") counted once, not three times, matching the
diff's stated intent ("a preserved run of N fragment rows for one sentence counts once").

### 4. Remaining callers of the old position-only logic — none found in live code

`grep -rn` for the old `existing[i].get("text_content")... .strip() == sent.strip()` /
`preserved_indices` pattern across the repo turns up matches **only inside `.claude/worktrees/*`**
— stale, disconnected snapshot directories from unrelated past agent sessions, not part of the
live source tree. Excluding those, there are zero remaining callers of the pre-Task-5 logic.
I also checked the other hits from a broader `lost_assignments_count`/`resync_preview` grep:
`app/domain/chapters/facade.py` and `app/api/routers/chapters_production.py` only import/call
`get_resync_preview` (no duplicated logic); `app/api/routers/chapters_models.py` only declares
the response schema field; `app/db/chapters.py`'s references are part of the in-progress,
uncommitted Task 6 work threading `sync_chapter_segments`'s new return shape through
`update_chapter` — unrelated to Task 5, not a duplicate implementation. On the frontend,
`ResyncPreviewModal.tsx` and `useStudioChapter.ts` only consume the API response fields — no
reimplemented matching/loss logic exists client-side. **Task 5 has fully closed the drift it set
out to close; no orphaned copy of the old algorithm remains anywhere live.**

## 5. A real bug, found via execution, adjacent to but not introduced by this diff

Scenario 3 above surfaced something beyond a parity check: `is_destructive: True` was returned
even though `lost_assignments_count: 0` — a real, live inconsistency. The cause is
`operations.py`'s return statement, three lines below everything Task 5 touched:

```python
"is_destructive": lost_assignments_count > 0 or (total_new < total_old and total_old > 0)
```

`total_old`/`total_new` are the raw DB-row-count and fresh-sentence-count respectively
(`operations.py`, `total_old = len(existing)`, `total_new = len(new_sentences)`). Before manual
sub-sentence splits existed as a working feature, `total_old` (row count) and sentence count
were roughly interchangeable, so "fewer rows after than before" was a reasonable
proxy for "something got merged away, might be destructive." **Now that Tasks 1/4 made
multi-row fragment runs a normal, correct, working state, `total_old` routinely exceeds
`total_new` for any chapter using the split feature at all** — a single 3-way split
inflates the row count by 2 relative to sentence count, permanently. I confirmed this via
execution: scenario 3's chapter had 4 existing rows (3 fragments + 1 whole sentence) and 2 fresh
sentences after the edit — `total_new(2) < total_old(4)` fires `is_destructive=True`
unconditionally, regardless of the fact that `lost_assignments_count` (the actually-accurate,
now-fixed metric) correctly reports `0`.

**This is user-visible, not just a data-shape nitpick.** I checked
`frontend/src/pages/ChapterEditor/components/ResyncPreviewModal.tsx:65-67`:

```tsx
<div className={`resync-modal-icon ${data?.is_destructive ? 'resync-modal-icon--warning' : 'resync-modal-icon--success'}`}>
  {data?.is_destructive ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
```

while the text block below it (`:116`) is correctly gated on `lost_assignments_count > 0`. The
result, confirmed by my scenario 3 run: **a chapter with any manual sub-sentence split will show
a warning-triangle icon at the top of the resync modal while the text directly below it reads
"All current speaker assignments will be preserved!"** — a directly self-contradicting UI state,
for the exact flagship use case this whole plan exists to support.

**Not a defect Task 5 introduced** — `git log -S "total_new < total_old" -- app/domain/chapters/operations.py`
shows this line dates to `bb2bb025` ("Studio2/phase 11 (#114)"), the same pre-RC-1 commit that
introduced the chunk-group canonical check I reviewed for Task 4. But it is a defect Task 5 had
every opportunity to catch: it's inside the exact function this task modified, computed from the
exact two variables (`total_old`, `total_new`) this task's diff sits directly beside, and it
directly undermines this task's own stated goal ("closes the drift... false destructive/loss
warnings"). The drift between preview and sync is closed for `lost_assignments_count`; a
different, adjacent false-positive channel (`is_destructive`'s row-count heuristic) remains open
and is now *more* frequently wrong than before, precisely because the split feature it's blind to
is now working correctly. Recommend: fix `is_destructive` to key off `lost_assignments_count`
alone (drop the row-count-comparison clause entirely — it no longer means what it used to now
that multi-row fragment runs are a normal, permanent state) as a fast-follow, ideally before this
lands in front of real users, since the confusing UI state is trivially reachable by anyone using
the split feature at all.

## Other findings

- **Task file not updated**, same process gap as Task 4:
  `git diff a3986be9..8d5b7e45 -- design-docs/plans/active/span_resync_preservation_fix/tasks/005-wire-resync-preview.md`
  is empty — no status line change, no checkboxes ticked, despite the plan folder's own stated
  convention. Minor, but now a repeated pattern across two consecutive tasks worth calling out
  explicitly so it doesn't become the norm.
- **Test count claim verified exactly:** I ran `./venv/bin/python -m pytest tests/domain tests/db -q --no-cov`
  myself — **499 passed**, matching the commit message's claim precisely. `ruff check` on the
  changed files: clean, also matching the claim.
- **The diff itself is clean and correctly scoped** — no DB writes introduced (verified by the
  committed `test_preview_is_a_pure_read_no_db_writes`, which I also independently confirmed
  passes), and the `existing_by_id`/`alignment.preserved`/`alignment.unmatched_existing_ids`
  usage correctly mirrors Task 4's own data shapes rather than reinventing a parallel one — this
  is exactly what "share the alignment, don't duplicate" was supposed to produce.

## Confidence

High on everything in this review — every claim (test presence, revert-check outcome, parity
across 4 scenarios, absence of remaining old-logic callers, the `is_destructive` bug and its UI
consequence) was verified by actually running the real code, not by reading and inferring. The
one thing I did not verify by execution: whether `is_destructive`'s current behavior has already
been silently relied upon anywhere else (e.g., a different UI surface gating on it beyond the
one modal I checked) — a quick repo-wide grep for `is_destructive` would close that gap before
the fast-follow fix lands.

## What would change my verdict

Nothing here blocks merging Task 5 itself — its own scope (closing the preview/sync drift) is
correctly and verifiably done. I'd upgrade "approve, with a bug to fix" to a clean approve once
`is_destructive` is corrected (either in a fast-follow or, if preferred, folded into this same
PR before merge, since the fix is small and the bug is real and user-facing).
