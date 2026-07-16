# Cross-Session File Claims

Use this file when you notice another active session's claim overlapping your work, or before
touching a file that might be contested — the owner regularly runs multiple concurrent Claude Code
sessions editing different areas of this repo in the same shared working tree. This is distinct from
[`codex_antigravity_collaboration.md`](codex_antigravity_collaboration.md), which covers a sequential
worker→reviewer handoff between different agent tools, not simultaneous sessions.

## What this is

`.agent/active-work/<session_id>.json` files are **advisory claims, not locks**. Each active session
has one, tracking which files it has touched and (best-effort) a one-line summary of its task. No
session can be blocked by another's claim — a hard lock risks a crashed/force-quit session jamming
every other session indefinitely, which is worse than the coordination problem it would solve.

The mechanism is mostly automatic:
- **`SessionStart`** hook writes your own claim file and reports any other active (non-stale) claims
  as context, before you take a single action.
- **`PreToolUse`** hook (on `Edit`/`Write`/`MultiEdit`) records the file into your claim and warns
  you — via additional context, not a blocked tool call — if another active session already claimed
  that exact path.
- **`PostToolUse`** hook on the `Skill` tool deletes your claim file the moment you invoke
  `session-memory` — the owner's chosen "I'm done here" signal, since a checkpoint/handoff save means
  this area of work is wrapping up. If the session keeps going after that and touches more files, the
  next `Edit`/`Write` simply recreates a fresh (empty-summary) claim — harmless.
- **`Stop`** hook deletes your claim file on clean exit (belt-and-suspenders alongside the
  `session-memory` trigger above). A claim untouched for 6+ hours is treated as stale and pruned
  automatically (crash/force-quit recovery) — don't trust a claim that old even if you see it.

## What you should do

- **When you see an overlap warning**: don't silently proceed or silently back off. Tell the user
  what the other session claims to be doing (its summary, if set) and ask whether it's safe to
  continue — the same move that should have happened before the `git stash` incident this convention
  exists to prevent (see `[[parallel-lanes-tasks-md-single-writer]]`-style memory for the narrower
  precedent on `TASKS.md`).
- **Set your own summary early**, once you know what you're doing this session, so other sessions'
  `SessionStart` warnings are actually informative instead of "(no summary set)":
  ```
  .agent/scripts/session-claims.sh summary "$CLAUDE_SESSION_ID" "one-line description of your task"
  ```
  (If you don't know your own session_id, skip this — it's best-effort, not required.)
- **Never run a shared-working-tree-destructive git operation** (`git stash`, `git reset --hard`,
  `git checkout -- <path>`, force operations) without first checking whether any other active
  session's claim overlaps the files it would touch. `git stash` in particular discards ALL
  uncommitted changes repo-wide, including another session's in-progress work on completely
  unrelated files — it is not scoped to your own edits just because you pass `--` pathspecs for a
  clean stash-pop later; the collision already happened at push time.
- **For a revert-check (R1 in `verification.md`) on a file another session might be touching**,
  prefer an in-place, targeted disable (comment out the new code path, run the test, restore) over
  `git stash` — it can't touch anything you didn't explicitly edit.
- Treat the claims directory as informational, not authoritative — a session that crashed without
  running its `Stop` hook leaves a claim behind until the 6-hour staleness window passes. If a claim
  looks obviously stale in context (nothing changed for hours, or the user confirms that session is
  gone), you may disregard it, but say so rather than silently deleting another session's claim file.

## What NOT to do

- Don't treat an overlap warning as a hard stop — it's a prompt to ask, not an error to work around.
- Don't write directly into another session's claim file.
- Don't expand this into real locking (flock, PID-based mutexes) — the point is advisory awareness
  cheaply, not correctness guarantees a single shared git working tree can't provide anyway.
- Don't rely on this for anything git can already tell you — `git status`/`git diff` are still the
  ground truth for what's actually changed on disk; claims are for *intent* (what a session says it's
  working on), not a substitute for checking real file state before a risky operation.
