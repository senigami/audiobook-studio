# OD-0018: Worktrees are not the default workflow, and a worktree is removed when its PR merges
Status: accepted        Date: 2026-07-29
Scope: `CLAUDE.md` (Orchestrator identity & mandate); `.agent/rules/memory-queue.md`; agent dispatch decisions

Context: On 2026-07-29 a cleanup found 34 registered worktrees holding 6.25 GB, 28 of them abandoned
`.claude/worktrees/agent-*` directories from parallel batches run on 2026-07-09 and 2026-07-11 — eight
still carrying uncommitted work three weeks after their task ended, because nothing ever removed a
worktree once its branch merged. The owner also stated the working preference directly: worktrees make a
session less efficient and split the agent rules and in-flight files away from the main checkout, where
he needs them; he has moved away from them and will not normally use them again.

Decision: "**Do not use a worktree by default.** Work in the main checkout unless isolation is the
specific thing the task needs — concurrent lanes writing the same files, or a reconciliation across many
branches. When a worktree *is* created, removing it is part of the work it was created for: the moment
its PR merges or its task is abandoned, run `git worktree remove` in the same step that closes the task,
and never leave a worktree holding uncommitted work. Before removing any worktree, commit whatever is
uncommitted onto its own branch first — removing a worktree does not delete its branch, so the commits
survive, but uncommitted files do not."

Consequences: Replaces the prior default, which came from `.agent/rules/memory-queue.md` and the
parallel-batch guidance treating a worktree-per-lane as the standard for large fan-outs — that guidance
still holds *for the isolation case*, it is simply no longer the default. Forbids the pattern that caused
this incident: creating a worktree, landing the PR, and moving on without removing the directory. Blocks
two reflexes — reaching for isolation because a batch is large rather than because the lanes collide, and
treating a worktree's disk footprint as somebody else's cleanup. Note the safety asymmetry that makes the
removal step cheap: branches and commits are recoverable, uncommitted working-tree files are not, so the
commit-first rule is the load-bearing half.

Disconfirming evidence: The rule is followed — work happens in the main checkout and worktrees are removed
at merge — and concurrent sessions or parallel lanes then start clobbering each other's uncommitted files
in the shared checkout, producing lost work that per-lane isolation would have prevented. That would mean
the isolation exception is drawn too narrowly and the default should move back. Also disconfirming: the
commit-first-then-remove step itself proves to lose work (for example by committing a half-finished state
that is then treated as intentional), which would mean the removal should archive the directory rather
than commit and delete. Note what does **not** count: worktrees accumulating again because nobody ran the
removal step is evidence about people, not about the rule.
