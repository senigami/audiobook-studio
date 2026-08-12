# OD-0022: Board-driven work intake adopted on the existing GitHub Project

Status: accepted        Date: 2026-08-11
Scope: `CLAUDE.md` (orchestrator mandate); GitHub Project #1 ("Audiobook Studio", `senigami/audiobook-studio`)

Context: skill-arsenal's `awaken-orchestrator` skill offers a board-driven work-intake pattern (2j in
its `UPGRADING.md`): the agent files anything it notices as an issue into Backlog unprompted, the owner
alone promotes Backlog → Ready, the agent pulls only from Ready. The gate — promotion is the owner's
alone — is the entire value; without it an agent's backlog is a list it both writes and reads. This repo
already had a working GitHub Project (#1, 156 items, Status = Epics/Todo/In Progress/Done) before this
was proposed, so the question was integration, not adoption from scratch. The owner chose to extend the
existing board rather than stand up a second one.

Decision: Added two Status options to Project #1's existing single-select field, preserving every
existing option's id (so none of the 156 existing items' assignments moved): **Backlog** (agent files
here, unprompted, no triage implied) and **Ready** (owner-promoted only; the only column an agent may
pull its next unprompted task from). Existing Todo/In Progress/Done keep their current meaning for
already-triaged work; Backlog/Ready sit ahead of Todo in the lifecycle. Work mode is **serial** — one
Ready item pulled at a time, consistent with OD-0018's no-worktree-by-default stance.

Consequences: Ada (and any dispatched seat) may file a Backlog item on this project for anything noticed
in passing — a bug, a doc gap, a confirmed TODO — without asking, per the standing "never hand up a bare
problem" rule; each such item still carries a proposed fix per that rule, in the issue body. Ada must
never move an item from Backlog to Ready herself, and must never pull unprompted work from anywhere but
Ready. This is additive to existing dispatch discipline, not a replacement for it — cheap, reversible,
in-remit work is still done and reported without going through the board at all; the board is for work
that would otherwise only exist as a mentioned-in-passing finding.

Disconfirming evidence: If Ready items sit unpulled because the serial assumption doesn't match how work
actually gets picked up, or if Backlog fills with items nobody ever triages, that's a sign the columns
added no real workflow and should be reconsidered — revisit by asking the owner, not by quietly reverting.
