# Memory Queue for Worktrees

Use this file whenever a session running inside a `.claude/worktrees/<name>/` worktree decides
something is worth saving to Claude Code's persistent auto-memory system (a `user`, `feedback`,
`project`, or `reference` memory, per that system's own criteria). This is the worktree analogue of
[`docs/code-map/queue/`](/Users/stevendunn/GitHub-Steven/audiobook-factory/docs/code-map/queue) — same
shape, same reason for existing: a cheap, append-only, git-tracked buffer that survives something a
direct write would not.

## What this is

Claude Code's auto-memory store lives at `~/.claude/projects/<dash-encoded-cwd>/memory/` — keyed to
the *exact working-directory path* of the session, not to the repo or the branch. A worktree has its
own path (`.claude/worktrees/<name>/`), so a session working there gets its own separate, empty
memory namespace. A memory saved directly from inside a worktree lands in that namespace — not in
this project's real memory store — and becomes unreachable the moment the worktree is removed
(`ExitWorktree` with `action: "remove"`, or a plain `git worktree remove`), since nothing will ever
`cd` back into that exact path again.

`.agent/memory-queue/` fixes this the same way the code-map queue fixes the "map goes stale"
problem: instead of writing directly to a save location that won't survive, the session appends one
small file to a directory that's tracked in git and travels with the worktree's own commits. When
that branch's PR merges into `studio-2.0`, the queue entry arrives there too, and can be reconciled
into real memory at any point after that — on the reviewer's/owner's own schedule, not the
worktree's.

## What you should do

- **Detect the situation first.** Check whether the session's cwd is inside `.claude/worktrees/`
  (or compare `git rev-parse --git-common-dir` against `--git-dir` — they differ inside a
  worktree). If you're in the main checkout, this file does not apply — write memory directly, as
  normal.
- **Inside a worktree, write a queue entry instead of a direct memory file.** Append one new file to
  `.agent/memory-queue/`, named `<UTC-timestamp>-<slug>.md` (e.g.
  `2026-07-20T140500Z-worktree-lint-config-gotcha.md`) so parallel worktrees never collide and
  entries sort chronologically. Never edit or delete another entry — append-only, same discipline as
  the code-map queue.
- **Write the entry as a real memory file would be written** — identical frontmatter shape to a
  memory file (`name`, `description`, `metadata.type` — one of `user`/`feedback`/`project`/
  `reference`), plus the same body structure the memory system already asks for (lead with the
  rule/fact, then **Why:** and **How to apply:** for `feedback`/`project` types). The whole point is
  that reconciliation should be closer to "copy this file into the real memory directory" than "figure
  out what the author meant."
- **Add one extra frontmatter field the real memory schema doesn't have:** `queued_from: <branch
  name>` — so whoever reconciles later knows which worktree/branch produced it, in case that context
  matters for judging relevance.
- Apply the exact same judgment about what's worth saving that the live auto-memory system already
  uses (see the "auto memory" section of the system prompt) — this is a deferred write, not a
  lower bar. Don't queue something you wouldn't have saved directly from the main checkout.
- **This repo is public.** A queue entry is a normal tracked file — it gets committed, pushed, and
  reviewed in a PR diff like anything else, and once merged its history is permanent even after
  reconciliation deletes the file itself. `user`/`feedback` entries describe the owner's own
  preferences and working style; write them in terms of the technical/workflow pattern (what to do
  differently and why), never with personal specifics that wouldn't belong in a public commit. If
  something feels too personal to write down here, don't queue it — surface it to the owner directly
  instead and let them decide.

## Reconciliation (done from the main `studio-2.0` checkout, on request)

1. List every file in `.agent/memory-queue/` (there will only be entries here from branches that have
   actually merged — that's expected, not a bug: a memory tied to work that never landed didn't
   happen from `studio-2.0`'s perspective either).
2. For each entry, apply the normal memory-saving rules: is this a duplicate of something already in
   `~/.claude/projects/.../memory/MEMORY.md`? Does it belong in a repo file instead (CLAUDE.md,
   `.agent/rules/`, `.agent/notes.md`) rather than the cross-session memory store? If it's genuinely
   new and durable, write it as a real memory file (drop the `queued_from` field — that was
   provenance for reconciliation, not part of the permanent record) and add its `MEMORY.md` index
   line.
3. Delete every consumed entry from `.agent/memory-queue/` and commit that as its own small change
   (e.g. `chore: reconcile memory queue`) — the queue is a buffer, not an archive; git history on the
   memory files themselves is the archive.
4. If two queued entries turn out to say the same thing from two different worktrees, merge them into
   one memory rather than keeping both — the reconciliation pass is exactly the point where that
   dedup is cheap.

## What NOT to do

- Don't rely on the harness's own per-cwd auto-memory save while inside a worktree — that's the exact
  failure mode this file exists to prevent.
- Don't treat `.agent/memory-queue/` as a substitute for the real memory store, and don't read it as
  if it were already-applied memory — an unreconciled queue entry is a candidate, not yet a fact
  future sessions can rely on.
- Don't queue something that belongs in a committed repo file instead (a spec change, a rule update,
  an architecture note) — the queue is specifically for the cross-session memory system, not a
  general-purpose "things I noticed" dumping ground.
