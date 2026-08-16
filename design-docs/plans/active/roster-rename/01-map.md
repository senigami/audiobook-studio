# Implementation map

## Big picture

Nine independent-looking file edits that are NOT independent, because every profile file
cross-references at least one other seat by name, and two central files (`roster.json`,
`roster.html`) restate every seat's name in one place. The failure mode this map exists to prevent:
an executor renames Marius→Hermione perfectly inside `marius-engineer.md`, but Astrid's file still
says "the feature work itself (engineer)" — wait, that one's a slug reference not a name, fine —
but Junia's file still says "paired with Marius (`abfc-marius`)" and nobody catches it because no
single task's diff touches `junia-designer.md` when the target of that task was Marius's own file.

## The parts

1. **9 agent profile files** (`.claude/agents/*.md`) — each seat's own identity: frontmatter
   `name:`, and prose that both describes itself AND references other seats.
2. **`roster.json`** — the routing table. Restates every seat's `name`, `spawn_key`, `profile`
   path, and (for archivist/engineer) `slug`/`title`. Also restates cross-references inside
   `do_not_dispatch_for` arrays (e.g. `"critiquing one diff (abfc-reviewer)"` inside BOTH Esther's
   and Tamsin's entries — this token is changing to `abfc-mcgonagall`).
3. **`roster.html`** — the human-facing cast page. Restates every name in `<h2>`/`<h3>` tags and
   `seat-key mono` spans, PLUS free-text etymology prose per seat (e.g. "Named for Ada Lovelace,
   who wrote out what a machine would actually do...") that needs genuine rewriting, not
   substitution — Ada Lovelace's etymology doesn't carry over to Albus/Dumbledore mechanically.
4. **`CLAUDE.md`** — the orchestrator mandate section, ~10 lines naming "Ada" directly (confirmed
   via grep, see Task 004 for exact line numbers/content).
5. **Memory-store directories** (`.claude/agent-memory-local/<spawn_key>/`) — only two have real
   accumulated content right now: `abfc-ada` (orchestrator's own memory, several files) and
   `abfc-reviewer` (a couple of files). The other 7 seats have never been dispatched yet, so they
   have no store to move — nothing to do for them here, a fresh store auto-creates under the new
   token whenever each is first dispatched.
6. **`.claude/decisions/`** — append-only. This rename ADDS one new file; it does not edit any
   existing one. `.claude/decisions/tools/build-index.sh` regenerates `INDEX.md` from whatever
   files exist — run it after adding the new OD, don't hand-edit `INDEX.md`.
7. **`~/.claude/orchestration-primer/name-registry.md`** — external, machine-wide. This repo
   (`audiobook-factory`) currently has NO rows registered there at all (confirmed by grep — the
   session-start hook's warning about unregistered names was accurate and is still true). This
   task adds fresh rows under the NEW names; there's no old row to update/remove.

## Connections (the part no single file-edit sees alone)

```
ada-orchestrator.md ──name──> roster.json[orchestrator] ──name──> roster.html[lead-card]
                                                          ──name──> CLAUDE.md (mandate prose)
                          ──spawn_key──> agent-memory-local/abfc-ada/ (MOVE, has content)
                          ──spawn_key──> name-registry.md (NEW row, none existed)

marius-engineer.md ──name+slug──> roster.json[seats[0]] ──name──> roster.html[card 1]
        │                                                ──slug/title──> "Engineer"→"Artificer" everywhere
        └──cross-ref (as "Marius")──> junia-designer.md, astrid-archivist.md
        └──cross-ref (as "abfc-marius")──> amina-runtime-verifier.md (do_not_dispatch_for),
             esther-reasoning-elder.md, tamsin-reasoning-younger.md (both do_not_dispatch_for),
             roster.json (astrid's and esther/tamsin's do_not_dispatch_for arrays)

astrid-archivist.md ──name+slug──> roster.json[seats[3]] ──name──> roster.html[card 4]
        │                                                ──slug/title──> "Archivist"→"Registrar" everywhere
        └──cross-ref (as "Astrid")──> cecilia-user-docs-writer.md
        └──cross-ref (as slug "archivist")──> amina-runtime-verifier.md, cecilia's do_not_dispatch_for,
             roster.json (amina's, cecilia's do_not_dispatch_for)

amina-runtime-verifier.md ──name──> roster.json[seats[2]] ──name──> roster.html[card 3]
        └──cross-ref (as "Amina"/"abfc-amina")──> astrid-archivist.md (own text says "runtime-verifier"
             generically, low risk), esther/tamsin's do_not_dispatch_for, roster.json (astrid's,
             esther/tamsin's do_not_dispatch_for)

junia-designer.md ──name──> roster.json[seats[1]] ──name──> roster.html[card 2]
        └──cross-ref (as "Junia")──> cecilia-user-docs-writer.md

cecilia-user-docs-writer.md ──name──> roster.json[seats[4]] ──name──> roster.html[card 5]
        (referenced BY astrid, junia above; does not itself reference other seats by personal name)

esther-reasoning-elder.md <──sibling──> tamsin-reasoning-younger.md (each names the other + shares
        `_shared/reasoning-pair-contract.md`) ──name──> roster.json[seats[5],[6]] ──name──>
        roster.html[pair-card] ──cross-ref (as "abfc-reviewer")──> BOTH reference the reviewer
        drop-in by its OLD spawn_key, which is changing to abfc-mcgonagall

reviewer.md (currently unnamed/generic) ──spawn_key──> roster.json[generic_executors] (NOTE: listed
        under generic_executors, not the main seats[] array — check this exists correctly after
        the rename, don't assume it moves to seats[]) ──spawn_key──> agent-memory-local/abfc-reviewer/
        (MOVE, has content) ──cross-ref (as "abfc-reviewer")──> esther's and tamsin's
        do_not_dispatch_for, amina's description prose ("Distinct from the `abfc-reviewer` drop-in")
```

## Invariants — must hold across every task

- **[INV-1] Filename keeps the role word, per OD-0024.** The session-start hook globs
  `.claude/agents/` for "orchestrator" to find which seat speaks inline ungated. `albus-orchestrator.md`
  still contains "orchestrator" — verify this substring survives in every renamed file, especially
  the two also changing role words (`hermione-artificer.md` no longer contains "engineer";
  `percy-registrar.md` no longer contains "archivist" — confirm nothing else greps for those old
  role words expecting to find the file by name, see Task 008).
- **[INV-2] Spawn key format is `abfc-<personal-name>`, lowercase.** `abfc-albus`, not `abfc-Albus`
  or `abfc-dumbledore`. The character's FIRST name is the convention already in use (marius, junia,
  amina, astrid, cecilia, esther, tamsin) — stay consistent, use `albus` not `dumbledore`,
  `mcgonagall` (her surname, since McGonagall canonically has no commonly-used first name in the
  text — this is the one deliberate exception to "first name," note it explicitly in the OD entry).
- **[INV-3] Memory stores are MOVED, never recreated.** A fresh `memory: local` auto-creates an
  empty store the moment a renamed seat is first dispatched under its new token. If the OLD
  store (`abfc-ada`, `abfc-reviewer`) isn't explicitly moved first, the accumulated memory is
  orphaned under a token nothing references anymore — this exact failure mode is already
  documented once in this repo's OD-0024. Don't repeat it.
- **[INV-4] Pronouns follow the character, not the old seat.** Ada was `she/her`. Albus
  (Dumbledore) is `he/him` in canon. Any other seat whose profile states a pronoun must be checked
  against its new character, not left on the old value by oversight.
- **[INV-5] A rename touches the FILE that names a seat, not just the file that IS that seat.**
  This is the whole point of this map — see Task 008.
- **[INV-6] Sealed OD entries are never edited.** Only ADD `.claude/decisions/0027-*.md` (or next
  free number — check `.claude/decisions/INDEX.md` for the actual next number at execution time,
  don't hardcode 0027 if another OD landed first).

## Risks & open questions

- **Risk (multi-file)**: every task touching a profile file, `roster.json`, or `roster.html` is
  tagged `multi-file` — see per-task `Risk:` lines. The acceptance criterion is a cross-file grep,
  not "this file looks right."
- **Risk (quality-sensitive)**: none. This is cosmetic identity, not behavior — no task here is
  `quality-sensitive` or needs mandatory adversarial review beyond the normal cross-reference check.
- **Open question, not blocking**: is `reviewer` seat's entry actually inside `roster.json`'s
  `generic_executors` block (as currently observed) or should naming it (McGonagall) also promote
  it into the main `seats[]` array like the other 8? The other 8 seats all have full `seats[]`
  entries (owns/dispatch_when/escalates_when); `reviewer` currently has none of that, just a
  one-line note. Task 002 should flag this to the owner rather than silently restructuring
  `roster.json`'s schema — renaming ≠ redesigning the routing table.
- **Open question, not blocking**: `.claude/decisions/tools/build-index.sh` may warn about OD-0023
  the same way it already did before this rename ("mentions a removal with no 'Removed (verbatim):'
  block") — that's pre-existing and unrelated, don't try to fix it as part of this plan.
