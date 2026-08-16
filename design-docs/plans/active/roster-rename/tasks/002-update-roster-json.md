# Task 002 — Update `.claude/agents/roster.json`

Status: complete — 2026-08-15
Risk: multi-file — this file restates every seat's name AND several cross-reference mentions
inside `do_not_dispatch_for` arrays.
Depends on: Task 001 (needs the final profile filenames/spawn_keys)

## Goal

Update every seat entry in `.claude/agents/roster.json` to the new names, spawn_keys, profile
paths, and (for two seats) slug/title, without changing anything else about the schema (owns,
dispatch_when, effort, model — all untouched).

## Exact edits, by JSON path (file has 219 lines, read it fully first — full content already
pulled once during planning, don't re-derive from memory, re-read live before editing)

- **`orchestrator` object** (lines ~5-19 as last read):
  - `"role_name": "Ada"` → `"role_name": "Albus"`
  - `"spawn_key": "abfc-ada"` → `"spawn_key": "abfc-albus"`
  - `"pronouns": "she/her"` → `"pronouns": "he/him"` (Dumbledore is he/him in canon — don't leave
    the old pronoun, see `01-map.md` [INV-4])
  - `"profile_agent_entry": ".claude/agents/ada-orchestrator.md"` → `".claude/agents/albus-orchestrator.md"`

- **`seats[0]` (Marius/engineer)**:
  - `"name": "Marius"` → `"name": "Hermione"`
  - `"slug": "engineer"` → `"slug": "artificer"`
  - `"spawn_key": "abfc-marius"` → `"spawn_key": "abfc-hermione"`
  - `"profile": ".claude/agents/marius-engineer.md"` → `".claude/agents/hermione-artificer.md"`
  - `"title": "Engineer — owns the outcome, not the task list"` → `"Artificer — owns the outcome,
    not the task list"`
  - `"do_not_dispatch_for"` array mentions `"design or UI judgment (designer)"` — unaffected
    (designer slug doesn't change), leave.

- **`seats[1]` (Junia/designer)** — name/spawn_key/profile only, no slug/title change:
  - `"name": "Junia"` → `"Dean"`, `"spawn_key": "abfc-junia"` → `"abfc-dean"`,
    `"profile": ".../junia-designer.md"` → `".../dean-designer.md"`
  - `"do_not_dispatch_for"` mentions `"end-user guide and wiki content (user-docs-writer)"` —
    slug reference, unaffected, leave.

- **`seats[2]` (Amina/runtime-verifier)**:
  - `"name": "Amina"` → `"Moody"`, `"spawn_key": "abfc-amina"` → `"abfc-moody"`,
    `"profile": ".../amina-runtime-verifier.md"` → `".../moody-runtime-verifier.md"`
  - `"do_not_dispatch_for"` mentions `"implementing fixes (engineer)"` — this is a SLUG reference
    (lowercase "engineer") which is itself changing to "artificer" per the rename — update to
    `"implementing fixes (artificer)"`. Also mentions `"documentation and paperwork claims
    (archivist)"` — same treatment, update to `"(registrar)"`.

- **`seats[3]` (Astrid/archivist → Percy/registrar)**:
  - `"name": "Astrid"` → `"Percy"`, `"slug": "archivist"` → `"registrar"`,
    `"spawn_key": "abfc-astrid"` → `"abfc-percy"`,
    `"profile": ".../astrid-archivist.md"` → `".../percy-registrar.md"`
  - `"title": "Archivist — the one who decides what stays"` → `"Registrar — the one who decides
    what stays"`
  - `"do_not_dispatch_for"` mentions `"the feature work itself (engineer)"` → `"(artificer)"`.

- **`seats[4]` (Cecilia/user-docs-writer)**:
  - `"name": "Cecilia"` → `"Newt"`, `"spawn_key": "abfc-cecilia"` → `"abfc-newt"`,
    `"profile": ".../cecilia-user-docs-writer.md"` → `".../newt-user-docs-writer.md"`
  - `"do_not_dispatch_for"` mentions `"in-app copy and microcopy (designer)"` (slug, unaffected)
    and `"deciding what is safe to retire from design-docs (archivist)"` → `"(registrar)"`.

- **`seats[5]` (Esther/reasoning-elder)**:
  - `"name": "Esther"` → `"Fred"`, `"spawn_key": "abfc-esther"` → `"abfc-fred"`,
    `"profile": ".../esther-reasoning-elder.md"` → `".../fred-reasoning-elder.md"`
  - `"sibling": "abfc-tamsin"` → `"abfc-george"`
  - `"do_not_dispatch_for"` mentions `"implementing the decision (engineer)"` → `"(artificer)"`,
    and `"critiquing one diff (abfc-reviewer)"` → `"(abfc-mcgonagall)"`.

- **`seats[6]` (Tamsin/reasoning-younger)**: same pattern as seats[5], mirrored —
  - `"name": "Tamsin"` → `"George"`, `"spawn_key": "abfc-tamsin"` → `"abfc-george"`,
    `"profile": ".../tamsin-reasoning-younger.md"` → `".../george-reasoning-younger.md"`
  - `"sibling": "abfc-esther"` → `"abfc-fred"`
  - Same two `do_not_dispatch_for` fixes as seats[5]: `(engineer)` → `(artificer)`,
    `(abfc-reviewer)` → `(abfc-mcgonagall)`.

- **`generic_executors` block**: `"abfc-reviewer": "adversarial review of a change, applies the
  fixes it confirms"` — key changes to `"abfc-mcgonagall"`. **Flag to the owner rather than
  deciding unilaterally**: should McGonagall, now personally named, be promoted to a full
  `seats[]` entry (with `owns`/`dispatch_when`/`escalates_when` like the other 8) instead of
  staying in `generic_executors`? This plan does NOT decide that — it only renames the key in
  place. Note this as an open item in your task completion report.

## Verification

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory
python3 -c "import json; json.load(open('.claude/agents/roster.json'))"   # must not error
grep -n "Ada\|Marius\|Junia\|Amina\|Astrid\|Cecilia\|Esther\|Tamsin\|abfc-ada\|abfc-marius\|abfc-junia\|abfc-amina\|abfc-astrid\|abfc-cecilia\|abfc-esther\|abfc-tamsin\|abfc-reviewer\b\|(engineer)\|(archivist)" .claude/agents/roster.json
# expect ZERO output
```

## Acceptance criteria

- [ ] File is still valid JSON after edits.
- [ ] Every `name`/`spawn_key`/`profile` field matches Task 001's actual renamed filenames exactly.
- [ ] Every `(engineer)`/`(archivist)` slug mention inside `do_not_dispatch_for` arrays is updated
      to `(artificer)`/`(registrar)`.
- [ ] `abfc-reviewer` fully replaced with `abfc-mcgonagall` everywhere it appears, including the
      `generic_executors` key.
- [ ] Orchestrator's `pronouns` field says `he/him`.
- [ ] The generic_executors-vs-seats[] question for McGonagall is reported to the owner, not
      silently resolved either way.

## Map links

`01-map.md` §"The parts" (item 2), §"Connections" (every arrow into `roster.json`), `[INV-2]`,
`[INV-4]`.

## Out of scope

Restructuring `roster.json`'s schema (e.g. promoting reviewer into `seats[]`) — flag, don't decide.
`roster.html` and profile files — separate tasks.
