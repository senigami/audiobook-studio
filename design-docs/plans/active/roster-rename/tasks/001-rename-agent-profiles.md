# Task 001 — Rename & update all 9 agent profile files

Status: pending
Risk: multi-file — each file's own rename is easy; the cross-references to OTHER seats inside each
file are the actual risk. Read every file fully before editing, don't pattern-match on the
first-person name alone.

## Goal

Rename each of the 9 files below (via `git mv` — this is a tracked repo, preserve history) and
update every occurrence of the old name/token to the new one, INCLUDING mentions of the seat
inside files that aren't its own.

## Exact files and the mapping (from `00-overview.md`)

| Old file | New file | Old name → New name | Old spawn_key → New spawn_key |
|---|---|---|---|
| `.claude/agents/ada-orchestrator.md` | `.claude/agents/albus-orchestrator.md` | Ada → Albus | `abfc-ada` → `abfc-albus` |
| `.claude/agents/reviewer.md` | `.claude/agents/mcgonagall-reviewer.md` | (none) → McGonagall | `abfc-reviewer` → `abfc-mcgonagall` |
| `.claude/agents/cecilia-user-docs-writer.md` | `.claude/agents/newt-user-docs-writer.md` | Cecilia → Newt | `abfc-cecilia` → `abfc-newt` |
| `.claude/agents/esther-reasoning-elder.md` | `.claude/agents/fred-reasoning-elder.md` | Esther → Fred | `abfc-esther` → `abfc-fred` |
| `.claude/agents/tamsin-reasoning-younger.md` | `.claude/agents/george-reasoning-younger.md` | Tamsin → George | `abfc-tamsin` → `abfc-george` |
| `.claude/agents/amina-runtime-verifier.md` | `.claude/agents/moody-runtime-verifier.md` | Amina → Moody (Mad-Eye Moody) | `abfc-amina` → `abfc-moody` |
| `.claude/agents/junia-designer.md` | `.claude/agents/dean-designer.md` | Junia → Dean (Dean Thomas) | `abfc-junia` → `abfc-dean` |
| `.claude/agents/astrid-archivist.md` | `.claude/agents/percy-registrar.md` | Astrid → Percy; role: Archivist → **Registrar** | `abfc-astrid` → `abfc-percy` |
| `.claude/agents/marius-engineer.md` | `.claude/agents/hermione-artificer.md` | Marius → Hermione; role: Engineer → **Artificer** | `abfc-marius` → `abfc-hermione` |

## Steps

For each file:

1. `git mv <old> <new>`.
2. Update the `name:` frontmatter line to the new spawn_key.
3. Update `description:` — replace the old personal name and every `` `abfc-<old>` `` occurrence
   with the new ones. For the two role-renamed files (Astrid/Percy, Marius/Hermione), also replace
   the word "Archivist"/"archivist" or "Engineer"/"engineer" where it's naming the SEAT's own role
   (not where it's a plain English word describing something unrelated — read the sentence).
4. `astrid-archivist.md` / `percy-registrar.md` specifically: its description ends "...Answers to
   the internal role name Astrid." → "...Answers to the internal role name Percy." Also check the
   body for any comment lines referencing "archivist" as the role.
5. `marius-engineer.md` / `hermione-artificer.md` specifically: same pattern, "Answers to the
   internal role name Marius" → "...Hermione."
6. **Cross-reference pass, same file, don't skip**: each file below ALSO names other seats. Update
   those mentions too, in the SAME edit to that file (not a separate task):
   - `amina-runtime-verifier.md` (→ `moody-runtime-verifier.md`) mentions: `abfc-marius`,
     `abfc-junia` (as "this repo's implementation/design owners"), `` `abfc-reviewer` `` drop-in
     mention, and the word "archivist" (lowercase, referring to Astrid's role — becomes
     "Registrar"/Percy). Update all four.
   - `junia-designer.md` (→ `dean-designer.md`) mentions: `abfc-marius` ("paired with Marius"),
     `abfc-implementer` (unaffected, leave), "user-docs-writer" (generic slug mention, leave as
     slug unless you judge it reads better naming Newt — optional, not required).
   - `cecilia-user-docs-writer.md` (→ `newt-user-docs-writer.md`) mentions: "Junia (`abfc-junia`)"
     and "Astrid (`abfc-astrid`)" — both become Dean/`abfc-dean` and Percy/`abfc-percy`.
   - `esther-reasoning-elder.md` (→ `fred-reasoning-elder.md`) mentions: sibling `abfc-tamsin`
     (→ `abfc-george`), `abfc-marius` (→ `abfc-hermione`), `abfc-amina` (→ `abfc-moody`),
     `` `abfc-reviewer` `` (→ `abfc-mcgonagall`).
   - `tamsin-reasoning-younger.md` (→ `george-reasoning-younger.md`) mentions: sibling `abfc-esther`
     (→ `abfc-fred`), `abfc-marius` (→ `abfc-hermione`), `abfc-amina` (→ `abfc-moody`),
     `` `abfc-reviewer` `` (→ `abfc-mcgonagall`).
   - `reviewer.md` (→ `mcgonagall-reviewer.md`) mentions `` `abfc-implementer` `` only — unaffected,
     leave. Its description currently has no personal name at all (generic drop-in) — this is
     where you ADD "McGonagall" as its identity for the first time, following the exact phrasing
     pattern the other 8 files use ("...Answers to the internal role name McGonagall.").
   - `ada-orchestrator.md` (→ `albus-orchestrator.md`): check its full body (not just the
     one-liner shown in this plan) for any cross-references to other seats — none were found in
     research, but verify, don't assume.
   - `astrid-archivist.md` / `marius-engineer.md`: verify no OTHER file references these two by
     their OLD role-slug in a way that would break (e.g. a `dispatch_when`/`do_not_dispatch_for`
     line reading "(archivist)" or "(engineer)" as a lowercase slug reference — these slug-style
     parenthetical mentions inside `roster.json` are handled in Task 002, not here, but if any
     appear inside another PROFILE file's prose, fix them here).
7. Update `[INV-4]`: check `ada-orchestrator.md`/`albus-orchestrator.md` for any pronoun statement
   ("she/her") in its own prose (not just `roster.json`, which is Task 002) — Dumbledore/Albus is
   `he/him` in canon.

## Verification

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory
git status --porcelain .claude/agents/ | grep '^R'   # expect 9 renames, all R (not delete+add)
grep -rn "abfc-ada\|abfc-marius\|abfc-junia\|abfc-amina\|abfc-astrid\|abfc-cecilia\|abfc-esther\|abfc-tamsin\|abfc-reviewer\b" .claude/agents/*.md
# expect ZERO output — any hit means a cross-reference was missed
```

## Acceptance criteria

- [ ] All 9 `git mv` renames registered as `R` in git status (not delete+add).
- [ ] Each file's own frontmatter `name:` is the new spawn_key.
- [ ] Each file's own description names the new character.
- [ ] The grep for every old spawn_key across `.claude/agents/*.md` returns zero hits.
- [ ] Albus/Dumbledore's profile uses he/him if it states a pronoun at all.

## Map links

See `01-map.md` §"The parts" (item 1) and §"Connections" (the per-file cross-reference list) and
`[INV-1]`, `[INV-2]`, `[INV-4]`, `[INV-5]`.

## Out of scope

`roster.json`, `roster.html`, `CLAUDE.md` — separate tasks. Don't touch them here even though they
also name these seats; task 008 catches anything left inconsistent across all of them together.
