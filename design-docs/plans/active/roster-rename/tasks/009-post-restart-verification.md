# Task 009 — Post-restart dispatch verification (owner-attended)

Status: pending
Risk: none — this is a verification-only task, but it CANNOT be completed inside the same session
that ran Tasks 001-008.
Depends on: Tasks 001-008 all complete

## Why this is a separate, un-skippable task

A frontmatter `name:` rename does not take effect for dispatch until the harness restarts — agent
identity resolves once, at session start. This exact caveat is already documented once in this
repo's OD-0024 (the repo-scoped-token retrofit) and applies identically here: renaming
`marius-engineer.md`'s frontmatter to `abfc-hermione` mid-session will not make a dispatch of
"Hermione" resolve correctly until a fresh session starts.

**Do not fold this into the "done" claim for Tasks 001-008.** Report it as an explicit open item
for the next session, the way OD-0024's own retrofit did.

## Steps (run in a NEW session, after restart)

1. Restart the Claude Code session in this repo.
2. Dispatch each renamed seat once (or at minimum the orchestrator and one or two specialists —
   not necessarily all 9 in one sitting) and confirm the new token resolves — check the actual
   agent-type list the harness surfaces (it should show `abfc-albus`, `abfc-hermione`, etc., not
   the old tokens) rather than inferring success from one seat's successful dispatch.
3. For the orchestrator specifically: confirm the session-start hook still correctly identifies
   `albus-orchestrator.md` as the file to load for inline speaking (per `[INV-1]`, the filename
   still contains "orchestrator" so this should work, but verify rather than assume).
4. Confirm each renamed seat's `MEMORY.md` loads under its NEW token and shows the OLD content
   (i.e. `abfc-albus`'s memory shows what used to be `abfc-ada`'s memory) — this is the actual
   proof that Task 005's move preserved history rather than losing it.

## Acceptance criteria

- [ ] A fresh session restart has occurred.
- [ ] At least the orchestrator and both moved-memory seats (Albus, McGonagall) were dispatched
      once post-restart and resolved under their new tokens.
- [ ] Each dispatched seat's memory content matches what it held before the rename (not empty, not
      reset).
- [ ] This verification was NOT inferred from a sibling seat's success — checked directly per the
      seat, per this repo's own standing lesson about that exact failure mode.

## Map links

`01-map.md` §"Risks & open questions", `[INV-3]`.

## Out of scope

Nothing new — this is pure verification of Tasks 001-008's work.
