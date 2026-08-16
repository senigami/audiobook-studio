# Task 003 — Update `.claude/agents/roster.html`

Status: complete — 2026-08-15
Risk: multi-file (name consistency with 001/002) + genuine writing task (etymology prose), not
pure mechanical substitution.
Depends on: Task 001 (final profile paths), Task 002 (final roster.json values to mirror)

## Goal

Update every name, role-tag, seat-key, and profile-path mention in this 452-line HTML file, AND
rewrite each renamed character's etymology sentence (the "Named for ___, who ___" line) to
actually fit the new HP character — this is real content, not find-and-replace.

## Exact locations (line numbers from the version read during planning — re-read live before
editing, the file may have shifted slightly)

- **Line 356-360 (lead card, orchestrator)**:
  - `<h2>Ada</h2>` → `<h2>Albus</h2>`
  - Line 358's full sentence: `"Named for Ada Lovelace, who wrote out what a machine would
    actually do, operation by operation, rather than what was claimed for it."` — REWRITE this
    (don't just swap the name) to something that actually fits Albus/Dumbledore and, ideally,
    still nods at the seat's real trait (hands-off delegation, trusts specialists, steps in only
    when it matters — see this repo's own brainstorm doc for the reasoning already worked out on
    why Dumbledore fits the orchestrator specifically). Do not leave a sentence that still
    describes Ada Lovelace's actual historical achievement attached to a different name.
  - `<span class="seat-key mono">abfc-ada</span>` → `abfc-albus`
  - Line 360: `` `.claude/agents/ada-orchestrator.md` `` → `` `.claude/agents/albus-orchestrator.md` ``

- **Line 367-373 (card 1, engineer→artificer)**:
  - `<p class="role-tag">Engineer</p>` → `<p class="role-tag">Artificer</p>`
  - `<h3>Marius</h3>` → `<h3>Hermione</h3>`
  - `<span class="seat-key mono">abfc-marius</span>` → `abfc-hermione`
  - The `desc` paragraph (line 371) doesn't name-check itself, but re-read it after the swap to
    confirm it still reads naturally with "Hermione" as the subject.

- **Line 375-381 (card 2, designer)**:
  - `<h3>Junia</h3>` → `<h3>Dean</h3>`, `abfc-junia` → `abfc-dean`. Role-tag "Designer" unchanged.

- **Line 383-389 (card 3, runtime-verifier)**:
  - `<h3>Amina</h3>` → `<h3>Moody</h3>`, `abfc-amina` → `abfc-moody`.
  - Line 387's desc names "Amina" directly mid-sentence: `'A "done" claim isn't done until Amina
    has seen it work...'` → `'...until Moody has seen it work...'`.

- **Line 391-397 (card 4, archivist→registrar)**:
  - `<p class="role-tag">Archivist</p>` → `<p class="role-tag">Registrar</p>`
  - `<h3>Astrid</h3>` → `<h3>Percy</h3>`, `abfc-astrid` → `abfc-percy`.

- **Line 399-405 (card 5, user-docs-writer)**:
  - `<h3>Cecilia</h3>` → `<h3>Newt</h3>`, `abfc-cecilia` → `abfc-newt`. Role-tag unchanged.

- **Line 407-425 (reasoning pair card)**:
  - Line 411: `<h3>Esther</h3>` → `<h3>Fred</h3>`, line 414 `abfc-esther` → `abfc-fred`.
  - Line 418: `<h3>Tamsin</h3>` → `<h3>George</h3>`, line 421 `abfc-tamsin` → `abfc-george`.

- **Reviewer**: currently NOT present anywhere in `roster.html` (it's only listed in `roster.json`'s
  `generic_executors`, not in this HTML cast page at all). Do not add a card for McGonagall unless
  the owner separately decides reviewer should appear on this page — that's a scope decision, not
  a rename, flag it in your report rather than deciding it here.

- **Colophon paragraph (~line 430)**: mentions "orchestrator-named going forward, self-chosen for
  the seats hired before that convention" — this is describing the NAMING METHOD (historical,
  general prose), not naming any specific seat. Leave as-is; it's not part of this rename's scope.
  Also check the `"last cast 2026-07-20"` date stamp — update to today's date since the cast is
  changing, following whatever this file's own convention for that stamp is.

## Verification

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory
grep -n "Ada\b\|Marius\|Junia\|Amina\|Astrid\|Cecilia\|Esther\|Tamsin\|abfc-ada\|abfc-marius\|abfc-junia\|abfc-amina\|abfc-astrid\|abfc-cecilia\|abfc-esther\|abfc-tamsin" .claude/agents/roster.html
# expect ZERO output
grep -n "Ada Lovelace" .claude/agents/roster.html   # expect ZERO — the old etymology must be gone, not just the name swapped
```

## Acceptance criteria

- [ ] Every old name, spawn-key span, and profile-path mention replaced.
- [ ] Every role-tag matches the new title (Artificer, Registrar) where those two changed.
- [ ] The lead-card etymology sentence is genuinely rewritten for Albus, not a name-swapped
      leftover about Ada Lovelace.
- [ ] Reviewer/McGonagall's absence from this page is flagged to the owner as an open question,
      not silently decided.
- [ ] The "last cast" date stamp is updated.

## Map links

`01-map.md` §"The parts" (item 3), §"Connections", `[INV-2]`.

## Out of scope

Adding a new card for reviewer/McGonagall — flag, don't build. The colophon's description of the
naming METHOD itself — not part of this rename.
