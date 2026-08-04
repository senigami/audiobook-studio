# OD-0020: Merge authority stays with the owner while `studio-2.0` is the staging target
Status: accepted        Date: 2026-07-29
Scope: `CLAUDE.md` (ask-first list); `.claude/agents/roster.json` (`unowned_surfaces.owner_only`)

Context: On 2026-07-18 the owner did grant merge authority in conversation ("I give you authority to
merge when you deem it ready"), and it was used once, on PR #163. That grant was recorded only in an
untracked memory file; `CLAUDE.md` and `roster.json` were never updated and continued to list merging as
ask-first, so the estate held two contradictory answers for eleven days. The 2026-07-29 retrofit surfaced
the contradiction and the owner resolved it by **narrowing the grant**: he authorized merging for one
specific task (landing PRs #174, #176, #177) and stated he retains the authority generally, because
`studio-2.0` is a temporary staging line and he is particular about nothing merging to the wrong branch
or being destructive while that is true.

Decision: "Merging a PR, cutting a release, or posting anywhere outside this repo (issues/PR comments on
someone else's thread, external services)" remains on the ask-first list. Opening a PR, pushing a branch,
and choosing draft-versus-ready stay do-then-report; only the merge itself is withheld. A per-task
authorization covers that task and expires with it: it is never read forward into a standing grant.

Consequences: Narrows the real 2026-07-18 grant rather than denying it happened. Two lessons sit inside
that: a grant recorded only in untracked memory produced a contradiction nothing could detect, which is
the case for writing rulings into tracked files (OD-0002's closeout discipline), and a conversational
grant can be narrowed later without either party having been wrong at the time. Blocks two specific
reflexes: citing a past one-off
authorization as ongoing permission, and merging a correct-looking change to the wrong base while
`studio-2.0` is standing in for `main`. Note the asymmetry this preserves: Ada can still get work all the
way to a reviewed, mergeable PR without asking, so the cost of the restriction is one message at the end,
not a slower pipeline. This is also the reason the change that records this ruling could not be
self-merged.

**This expires by its own terms.** The owner stated he will loosen the mandate once `studio-2.0` merges
into `main`. That event, not a date, is the trigger to revisit — and revisiting means asking him, not
assuming the loosening is automatic.

Disconfirming evidence: Merges are consistently routed to the owner as required, and the ask turns out to
be pure latency — every request is approved unread over a sustained period, with no merge ever redirected,
delayed, or rejected on inspection. That would show the gate is catching nothing the PR review already
caught. Note what does **not** count: an agent merging anyway is evidence about the agent, not the rule;
and a long quiet stretch with no wrong-base incident may be the rule working rather than the rule being
unnecessary.
