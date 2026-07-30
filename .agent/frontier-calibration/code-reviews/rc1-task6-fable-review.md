# Code review — RC-1 Task 6 (`lost_assignments_count` on the save response) + the `is_destructive` fix

**Branch:** `implement/rc1-task5-wire-preview`
**Commits reviewed:** `954cfabc` ("fix: close is_destructive false-positive") and `25d8056a`
("feat: surface lost_assignments_count on the save response (RC-1 Task 6)"), both on top of
Task 5 (`8d5b7e45`).
**Diffs:** `git diff 8d5b7e45..954cfabc` (the is_destructive fix) and
`git diff 954cfabc..25d8056a` (Task 6 itself), plus `git diff a3986be9..25d8056a --stat` for the
combined Task 4→6 picture.
**Method:** mechanical process checks, per the coordinator's specific ask, all verified by
execution (grep + running the real test suites + a self-run revert-check), not by reading alone.

## Verdict

**Approve the backend change itself — it is correct, safe, and I confirmed zero callers break.
But Task 6 is not actually complete relative to its own task file, and should not be reported as
done without that being said explicitly.** Two of Task 6's own explicit acceptance criteria are
unmet: no tests were added in Task 6's own commit (despite the task file requiring exactly two),
and the frontend was never touched at all (despite the task file listing frontend consumption as
both a step and an acceptance criterion) — so the feature's actual purpose, "so the UI can warn
the user," is not yet reachable by any user. The `is_destructive` fix, reviewed separately, is
clean, correct, and I independently reproduced its revert-check myself.

## 1. Does the `is_destructive` fix actually close what I found? — Yes, confirmed by execution

The diff (`git diff 8d5b7e45..954cfabc -- app/domain/chapters/operations.py`) is exactly what I
recommended in my Task 5 review:

```python
-        "is_destructive": lost_assignments_count > 0 or (total_new < total_old and total_old > 0)
+        "is_destructive": lost_assignments_count > 0
```

I did not just read this and trust it — I reproduced the fix's revert-check myself, independently
of the commit message's claim. Using a safe file-copy/restore (not `git stash`, after an earlier
mishap this round where a mistyped stash command popped an unrelated stash from a different
branch — self-corrected via `git reset --merge` with no work lost, see my Task 5 review for the
detail), I checked out `operations.py` at `8d5b7e45` (pre-fix), ran the new regression test, and
confirmed:

```
assert preview["is_destructive"] is False
E       assert True is False
1 failed in 0.42s
```

— exactly reproducing the bug (my own Task 5 scenario 3: a 3-fragment split + an unrelated edit,
`lost_assignments_count: 0` but `is_destructive: True`). Restoring the current code and re-running
gives 4/4 passed. This is a real, working revert-check, not a claimed one, and the new test
(`test_preview_is_not_destructive_for_a_split_that_shrinks_row_count_with_zero_loss`) constructs
the exact scenario shape I found (4 existing rows: 3 fragments + 1 whole → 2 fresh sentences,
zero actual loss) via direct SQL row manipulation rather than `_apply_range_assignment` — a valid,
if more manual, equivalent fixture. The docstring update to `segment_alignment.py` (removing the
stale "only sync_chapter_segments is wired" warning Tamsin had flagged) is also accurate as of this
commit — I confirmed both Task 4 and Task 5's wiring are in fact live in the current code.

## 2. Mechanical process checks on Task 6 itself

### Does any caller break on the new dict return? — No, confirmed by exhaustive grep + full-suite execution

I ran `grep -rn "update_chapter(" --include="*.py" app/ tests/` and
`grep -rn "sync_chapter_segments(" --include="*.py" app/ tests/` across the entire live tree
(explicitly excluding the many stale `.claude/worktrees/*` snapshot copies that would otherwise
pollute the match set) and read every hit:

- **`sync_chapter_segments`** has exactly one return statement in the current code
  (`app/db/segments.py`, the final `return {"success": True, "lost_assignments_count": ...}`) —
  no code path still returns a bare bool, so `update_chapter`'s new
  `sync_result.get("lost_assignments_count", 0)` (`app/db/chapters.py:226`) can never hit an
  `AttributeError` from an unexpected shape. Every test call site (~50 of them, across
  `tests/db/`, `tests/api/`, `tests/orchestration/`, `tests/domain/`) calls it as a bare statement
  and discards the return — none assert on it, so none can break regardless of shape.
- **`update_chapter`**'s new dict-vs-bool return is conditional on `is_text_update`
  (`app/db/chapters.py:205`, `"text_content" in updates`) — only a caller passing `text_content`
  gets the new dict shape; everyone else still gets the old plain `bool`. I checked the one
  production call site outside the router that calls `update_chapter`
  (`app/api/routers/projects_backups.py:514`) and confirmed it only passes `audio_status`,
  `audio_file_path`, `audio_generated_at` — never `text_content` — so it's structurally
  unaffected, not just "probably fine." The only call site anywhere that passes `text_content`
  (`tests/db/test_chapters_sync.py:38`) is a bare discarded-return statement.
- **The two router call sites that *do* trigger the new shape**
  (`app/api/routers/chapters.py`'s `api_update_chapter_details` and `api_sync_segments`) both
  correctly use `isinstance(result, dict)` before calling `.get(...)` — defensively correct for
  `update_chapter`'s genuinely conditional shape, and harmlessly redundant (but not wrong) for
  `sync_chapter_segments`'s now-unconditional dict shape.
- **Full-suite execution, not just reading:** I ran `tests/db tests/api tests/domain tests/orchestration`
  together (1639 passed, 1 skipped, 0 failed) and separately the scoped `tests/db tests/domain tests/api`
  set the commit message itself claims (**1081 passed, 1 skipped** — matches exactly). `ruff
  check` on all five touched files: clean, also matching the claim. The coordinator's own
  "all 3 discard the value today" claim checks out under my independent grep.

### Task file status — not updated, a repeated pattern

`git diff a3986be9..25d8056a --stat -- design-docs/plans/active/span_resync_preservation_fix/`
is empty — no status line, no checkboxes ticked for either Task 5's or Task 6's task file, despite
the plan folder's own stated convention. I flagged this for Tasks 4 and 5 individually; it is now
a **three-for-three pattern** across every task in this plan so far, worth surfacing as a
process habit to fix at the plan level, not a one-off oversight per task.

## 3. A real completeness gap Task 6 does not disclose in its own commit message

Checking Task 6's own task file
(`design-docs/plans/active/span_resync_preservation_fix/tasks/006-surface-loss-count.md`)
against what was actually delivered, two of its four explicit acceptance criteria are unmet:

- **"Test confirms a genuine-loss save surfaces a non-zero count; a clean save surfaces 0" —
  not done.** `git diff 954cfabc..25d8056a --stat -- tests/` is completely empty — Task 6's own
  commit adds zero tests. Every existing `lost_assignments_count` assertion in the test suite
  (`tests/domain/test_chapter_resync_preview.py:33,59,131`) is on `get_resync_preview`'s dict —
  Task 5's territory — not on the actual new plumbing Task 6 added (`sync_chapter_segments`'s new
  return shape, `update_chapter`'s threading, or either API route's JSON response). There is
  currently no committed test proving an ordinary save that destroys a real assignment actually
  surfaces a non-zero count in the live API response, nor one proving a clean save surfaces 0 —
  the exact two tests the task file explicitly lists as steps 5 and 6 and repeats as an
  acceptance-criteria bullet. This is the same class of gap I flagged for Task 4 (which also
  shipped with zero new tests) — less severe here because the added logic is a simple `sum(...)`
  over already-tested data, and the broader 1081/1639-test sweeps I ran provide real non-regression
  confidence, but "no regression" is not the same claim as "the new behavior is verified," and the
  task's own acceptance criteria specifically asked for the latter.
- **"Frontend shows a warning when the count is non-zero" — not done at all.** `git diff a3986be9..25d8056a --stat -- frontend/`
  is completely empty across **all three** of Tasks 4, 5, and 6 combined — no frontend file was
  touched anywhere in this stretch of work. I checked
  `frontend/src/hooks/chapter/useChapterPersistence.ts` directly (the exact file Task 6's own task
  file names as the integration point) and confirmed it contains no reference to
  `lost_assignments_count` at all — `handleSave` (line 16) doesn't read that field from the save
  response. **This means the actual point of Task 6 — "so the UI can warn the user when a save
  destroyed real assignments" (the task file's own stated Goal) — is not yet reachable by any
  real user.** The backend now correctly computes and returns the count on both routes (verified
  above), but nothing downstream consumes it. This isn't a defect in what was built — what was
  built is correct — but Task 6 as currently landed only delivers half of its own stated scope,
  and the commit message ("feat: surface lost_assignments_count on the save response (RC-1 Task
  6)") doesn't flag this as a partial landing; a reader would reasonably conclude Task 6 is done.

## Confidence

High on all of the above — every claim (no caller breaks, the is_destructive fix's revert-check,
the exact test-count/ruff claims, the missing tests, the missing frontend work) was verified by
actually running the commands and reading the actual diffs/files, not by trusting the commit
messages. The one thing I did not check: whether `frontend/src/pages/ChapterEditor/components/ResyncPreviewModal.tsx`
(the existing warning-UI pattern Task 6's task file suggests reusing) is trivially reusable for
this ordinary-save case or would need real adaptation — I confirmed it isn't wired in at all, but
didn't scope how much work wiring it in would actually be.

## What would change my verdict

Nothing here blocks the backend change itself from being correct and safe to keep as-is. To call
Task 6 genuinely complete against its own task file: add the two missing tests (API-level,
asserting the actual JSON response's `lost_assignments_count` for both a genuine-loss save and a
clean save — not just the dict-level preview tests that already exist), and either land the
frontend consumption (even a minimal inline message, which the task file explicitly says is
acceptable in lieu of a full modal) or explicitly re-scope Task 6 to backend-only and file the
frontend half as its own follow-up task rather than letting it look finished when it isn't.
