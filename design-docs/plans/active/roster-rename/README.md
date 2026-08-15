# Plan: Roster rename — Harry Potter naming theme

Fun, no-behavior-change identity rename of every persistent agent seat in this repo, decided via a
brainstorm session (`.agent/reports/` or wherever the session document was saved — check with the
owner if it's not findable; the full matrix and reasoning live there, this plan only implements it).

## What this is

Nine seats get a new character name; two seats also get a new job-title word (the character
picked didn't fit the old title). Nothing about *what* any seat does, its model tier, its effort,
or its escalation rules changes — this is identity only.

| Seat (unchanged) | Old title | New title | Old name | New name |
|---|---|---|---|---|
| Orchestrator | Orchestrator | Orchestrator | Ada | Albus |
| Reviewer | Reviewer | Reviewer | (unnamed, generic) | McGonagall |
| Docs-writer | User-docs writer | User-docs writer | Cecilia | Newt |
| Reasoning-elder | Reasoning-elder | Reasoning-elder | Esther | Fred |
| Reasoning-younger | Reasoning-younger | Reasoning-younger | Tamsin | George |
| Runtime-verifier | Runtime-verifier | Runtime-verifier | Amina | Moody |
| Designer | Designer | Designer | Junia | Dean |
| Archivist | **Archivist** | **Registrar** | Astrid | Percy |
| Engineer | **Engineer** | **Artificer** | Marius | Hermione |

## Scope

**In scope**: every file that describes *current* state — `.claude/agents/*.md` profiles (frontmatter
+ prose, including cross-references between seats), `.claude/agents/roster.json`,
`.claude/agents/roster.html`, `CLAUDE.md`'s orchestrator mandate section, memory-store directory
moves, one new `OD-NNNN` decision record, and (external) this repo's row(s) in
`~/.claude/orchestration-primer/name-registry.md`.

**Out of scope, explicitly**: git commit history, past/sealed `OD-NNNN` decision entries (they
record what was true when written — a dated history, not a living doc), and anything on GitHub
(PRs, issues, comments). The owner confirmed this split directly: internal current-state
documentation gets updated to the new names as if they'd always been this way; the historical
decision log and git/GitHub history stay untouched.

## Real risk in this rename (read before executing any task)

**Seat profiles cross-reference each other by name.** Junia's file mentions Marius. Astrid's file
mentions Marius and Amina. Cecilia's mentions Junia and Astrid. Esther and Tamsin each mention
their sibling plus Marius, Amina, and the reviewer drop-in. `roster.json`'s `do_not_dispatch_for`
fields reference other seats parenthetically. Renaming one seat's *own* file correctly is not
enough — every OTHER file that names that seat also has to update. Task 008 exists specifically to
catch what the per-file tasks miss; do not skip it or consider the rename done before it runs.

## Status protocol

Each task file starts with `Status: pending | in-progress | complete — <date>` and its steps are
`- [ ]` checkboxes. Whoever executes a task updates its status line and ticks its boxes in the same
change as the work — a stale checklist here poisons the next session that reads it.

## Archive convention

Once every task is complete, move this whole folder to
`design-docs/plans/active/roster-rename/` → `design-docs/plans/_archive_retired/roster-rename/`...
actually this repo retired `_archive/` on 2026-07-17 (see CLAUDE.md's plans-folder-consolidation
note) — **delete this folder outright once done**, and put the one-line summary in
`wiki/Changelog.md` instead. Don't leave it lying around "for the record"; the OD entry and the
Changelog line are the record.

## Order to execute in

1. Task 001 — rename & update all 9 agent profile files (mechanical + cross-reference aware)
2. Task 002 — update `roster.json`
3. Task 003 — update `roster.html` (includes real etymology-prose rewriting, not pure find-replace)
4. Task 004 — update `CLAUDE.md`'s orchestrator mandate section
5. Task 005 — move the two populated memory-store directories
6. Task 006 — write the new `OD-NNNN` decision record
7. Task 007 — update the external name registry
8. Task 008 — cross-reference reconciliation sweep (run LAST, after 001-007, catches what any
   single-file task missed)
9. Task 009 — post-restart dispatch verification (owner-attended; cannot be self-certified in this
   session, see OD-0024's own precedent for why)
