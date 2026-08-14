# Session Closeout

Run this at the end of every substantive session (part of the orchestrator mandate in CLAUDE.md —
a standing duty, not an on-request favor). Skip it only for pure Q&A sessions that changed nothing.
It has two halves plus a respawn prompt; the whole thing usually costs a few minutes and pays for
itself the moment the next session starts.

## (a) Backward-looking — fix what today invalidated

Sweep the documents that describe *current state* and update the ones today's work made false:

- `design-docs/plans/REMAINING_TASKS.md` — the open-work status source; mark what actually shipped
  today (move the line to `design-docs/plans/COMPLETED_WORK.md`).
- The active plan folder(s) under `design-docs/plans/active/` that today's work touched.
- `.agent/lessons/INDEX.md` if a lesson was learned (see the lessons discipline).
- `CLAUDE.md` / `.agent/rules/` only if today changed something they assert — these are
  constitution files, not logs; don't accrete history into them.
- The code-map queue: confirm every mapped-source change from today has its
  `.agent/code-map/queue/` entry (the Stop hook backstops this, but check).
- `.agent/memory-queue/` if working in a worktree (see `memory-queue.md`); persistent memory
  (`~/.claude/projects/.../memory/`) directly if in the main checkout.

Stale state docs are not passive clutter — future sessions act on them as premises. A "blocked on
X" line that stopped being true today will still be steering decisions next week.

## (a2) The dream pass — absorb what the seats captured

Run `lessons-loop`'s five-step dream pass (absorb, compress, distill, organize, retire) over the seat
stores under `.claude/agent-memory-local/`, including the orchestrator's own. Nothing else triggers it:
capture is a per-seat discipline (`_shared/crew-doctrine.md`) and the pass that turns candidates into
durable memory only ever runs from here.

- Absorb each seat's `working-memory.md` into typed memory files, then clear it. A swept file and an
  unused one look identical, so note in the seat's `MEMORY.md` that the pass ran and when.
- Anything that would change how work is done in an unrelated repo is doctrine, not a seat memory:
  promote it to `~/.claude/lessons/doctrine/` in abstract form rather than filing it here.
- Record which trigger a memory won or lost against in that seat's `edges.json`.
- A store still empty after a session with real corrections in it means capture is not running.
  Say so rather than assuming the seat had nothing to record.

## (b) Forward-looking — make the plans execute-ready from tonight's vantage point

Re-read the active plan as if you were the NEXT session, acting on these documents alone, with no
memory of today. The test is one question: **"would a fresh session acting on these docs alone do
the right next thing?"** If the answer requires anything that exists only in today's chat
transcript, it isn't written down yet.

- Update sequencing/priorities/dependencies that today's decisions changed; leave the rest alone
  (no rewrite churn).
- Superseded plans get a dated annotation, never a silent rewrite. Once a plan is fully done,
  delete its folder outright (narrative goes to `wiki/Changelog.md`) rather than moving it to an
  archive — this repo no longer keeps a `_archive/` going forward (retired 2026-07-17).

## The respawn prompt

Refresh `.memory/HANDOFF.md` (the session-memory skill's home — gitignored, main-checkout-local)
so it works as a true respawn prompt, not a diary entry:

1. **Who the next session is** — the persistent role identity from CLAUDE.md's mandate block.
2. **What to read, in what order** — the 2–4 documents that reconstruct context fastest.
3. **Current-state bullets** — what is true right now (not a narrative of how it got true).
4. **The FIRST action** — concrete enough to start on immediately.

Anti-pattern check: "continue where we left off" is not a respawn prompt. The next session must be
able to act from the prompt alone.
