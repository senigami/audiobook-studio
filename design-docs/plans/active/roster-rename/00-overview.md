# Overview

## Task

Rename this repo's nine persistent agent seats to a Harry Potter naming theme, decided in a
brainstorm session with the owner (character-to-role matching, pros/cons, rankings — see the
session's saved artifact/doc for the full reasoning trail; this plan only implements the locked
result). Two seats also get a new job-title word because the chosen character didn't fit the old
one: `archivist` → `Registrar` (Percy Weasley), `engineer` → `Artificer` (Hermione Granger).

## Why

Fun, owner-initiated identity refresh. No behavior, capability, model tier, effort default, or
escalation rule changes for any seat — this is purely who answers to what name.

## Goal / success criteria

Done means:
1. Every one of the 9 seats' `.claude/agents/*.md` profile has the new frontmatter `name:` token
   (`abfc-<new-name>`) and the new personal name throughout its own prose.
2. Every OTHER profile that mentions one of the renamed seats (cross-references) is also updated —
   verified by grep, not by eye (see Task 008).
3. `roster.json` and `roster.html` reflect every new name, both renamed titles, and (for
   `roster.html`) real rewritten etymology prose for each renamed character — not a leftover
   sentence about the old name.
4. `CLAUDE.md`'s orchestrator section names the orchestrator by the new name throughout.
5. The two memory-store directories with real accumulated content (`abfc-ada`, `abfc-reviewer`)
   are MOVED (not recreated) to their new tokens (`abfc-albus`, `abfc-mcgonagall`), preserving
   history.
6. One new `OD-NNNN` entry exists documenting the full old→new mapping and the reasoning, per this
   repo's decision-log convention — it does not edit or delete any existing OD.
7. `~/.claude/orchestration-primer/name-registry.md`'s row(s) for this repo reflect the new names.
8. A grep for every OLD name/token (`Ada`, `Marius`, `Junia`, `Amina`, `Astrid`, `Cecilia`,
   `Esther`, `Tamsin`, `abfc-ada`, `abfc-marius`, `abfc-junia`, `abfc-amina`, `abfc-astrid`,
   `abfc-cecilia`, `abfc-esther`, `abfc-tamsin`, `abfc-reviewer`) across
   `.claude/agents/`, `CLAUDE.md`, and `.claude/decisions/INDEX.md`'s citation lines returns **zero
   hits outside**: (a) existing sealed `OD-NNNN` files under `.claude/decisions/` (explicitly
   out of scope, historical), and (b) the new OD entry's own "what changed" section (which
   necessarily names the old tokens to document the change).
9. Post-restart, a real dispatch of the renamed orchestrator resolves under its new token (Task
   009) — this can't be verified inside the session that made the change, flagged as an open item
   for the next session, not folded into a "done" claim here.

## Explicit non-goals / out of scope

- **Git history and past commits**: not rewritten, not touched.
- **Existing sealed `OD-NNNN` decision entries**: not edited. They recorded what was true when
  written (e.g. "OD-0003, 2026-07-18: Ada..."); changing them would falsify dated history. The new
  rename gets its OWN entry (Task 006), which is how this repo's decision log is designed to work.
- **GitHub** (PRs, issues, comments, past PR descriptions): owner confirmed explicitly, not in
  scope, don't touch.
- **`.claude/agents/implementer.md` and `.claude/agents/runner.md`**: these are generic
  `plan-run` executor drop-ins, not part of the 9-seat named roster that got HP names. Untouched.
- **map-code currency**: a real, separate finding surfaced while researching this plan (the code
  map is 37 commits stale and its git-tracking status is undocumented) — explicitly NOT folded
  into this plan; it's unrelated blast radius and gets its own task if the owner wants it addressed.

## The locked mapping (source of truth for every task below)

| Seat slug | Old title | New title | Old name | Old spawn_key | Old profile file | New name | New spawn_key | New profile file |
|---|---|---|---|---|---|---|---|---|
| orchestrator | Orchestrator | Orchestrator | Ada | `abfc-ada` | `ada-orchestrator.md` | Albus | `abfc-albus` | `albus-orchestrator.md` |
| reviewer | Reviewer | Reviewer | (none, generic) | `abfc-reviewer` | `reviewer.md` | McGonagall | `abfc-mcgonagall` | `mcgonagall-reviewer.md` |
| user-docs-writer | User-docs writer | User-docs writer | Cecilia | `abfc-cecilia` | `cecilia-user-docs-writer.md` | Newt | `abfc-newt` | `newt-user-docs-writer.md` |
| reasoning-elder | Reasoning-elder | Reasoning-elder | Esther | `abfc-esther` | `esther-reasoning-elder.md` | Fred | `abfc-fred` | `fred-reasoning-elder.md` |
| reasoning-younger | Reasoning-younger | Reasoning-younger | Tamsin | `abfc-tamsin` | `tamsin-reasoning-younger.md` | George | `abfc-george` | `george-reasoning-younger.md` |
| runtime-verifier | Runtime-verifier | Runtime-verifier | Amina | `abfc-amina` | `amina-runtime-verifier.md` | Moody | `abfc-moody` | `moody-runtime-verifier.md` |
| designer | Designer | Designer | Junia | `abfc-junia` | `junia-designer.md` | Dean | `abfc-dean` | `dean-designer.md` |
| archivist | **Archivist** | **Registrar** | Astrid | `abfc-astrid` | `astrid-archivist.md` | Percy | `abfc-percy` | `percy-registrar.md` |
| engineer | **Engineer** | **Artificer** | Marius | `abfc-marius` | `marius-engineer.md` | Hermione | `abfc-hermione` | `hermione-artificer.md` |

Pronouns: only Ada/Albus's pronoun line is known to need a look — the roster.json orchestrator
entry currently has no explicit `pronouns` field for Albus's canon gender presentation to check
against (Ada's was `she/her`; Albus/Dumbledore is `he/him` in canon — Task 002 must update this
field, don't leave the old pronoun on the new name by oversight).
