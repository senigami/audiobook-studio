# Task 004 — Update `CLAUDE.md`'s orchestrator mandate section

Status: complete — 2026-08-15
Risk: multi-file (must match Tasks 001-002's final name) but low complexity — CLAUDE.md itself has
no cross-seat references beyond naming Ada; confirmed via grep during planning that "archivist"
and "engineer" do not appear anywhere in CLAUDE.md as seat-label prose (only as generic English
words, e.g. "owner-engineer for normal end-to-end work" describing the concept, which is
`marius-engineer.md`'s OWN description text quoted in an agent-type listing elsewhere, not
CLAUDE.md itself — don't touch generic English usage).
Depends on: none (independent of other tasks)

## Exact lines to change (confirmed live via grep, CLAUDE.md as of this plan's writing —
re-grep before editing in case the file moved since)

- **Line 20**: `"The orchestrating session in this repo is a persistent role: **Ada**, she/her.
  The name belongs to the role..."` → replace `**Ada**, she/her` with `**Albus**, he/him`. Leave
  the rest of the sentence's meaning intact (it's explaining that the NAME belongs to the role,
  not the model — that statement itself doesn't need rewriting, just the name/pronoun inside it).

- **Line 32**: `"**Director mandate:** Ada owns the agent roster..."` → `"...Albus owns the agent
  roster..."`

- **Line 34**: `"...Every seat on this roster — Ada and every specialist — is the owner's
  partner..."` → `"...Albus and every specialist..."`

- **Line 40**: `"(Ada additionally carries 'co-CEO product-direction input,' granted 2026-07-18,
  for where the product goes overall...)"` → `"(Albus additionally carries...)"`. Note the date
  2026-07-18 is a historical grant date — leave it, only the name changes.

- **Line 43**: `"...the do-then-report / ask-first lists below set *what* Ada specifically may do
  without asking..."` → `"...what* Albus specifically...`"

- **Line 45**: `"**Definition of done for Ada's own output.**..."` → `"**Definition of done for
  Albus's own output.**"`

- **Line 65**: `"...Once Ada has reviewed/approved a resulting change, move the item to
  **Review**..."` → `"...Once Albus has reviewed/approved..."`

## Verification

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory
grep -n "\bAda\b" CLAUDE.md
# expect ZERO output
grep -n "Albus" CLAUDE.md | wc -l
# expect 7 (matching the 7 lines above)
```

## Acceptance criteria

- [x] Grep for `\bAda\b` in CLAUDE.md returns nothing.
- [x] All 7 identified lines now read "Albus"/"he/him" and are grammatically coherent (read each
      full sentence after editing, don't just swap the token).
- [x] Confirmed via grep that CLAUDE.md contains no seat-label prose mentions of
      "archivist"/"engineer" needing a corresponding update (per the note above) — if the grep
      surfaces any such mention that was missed during planning, fix it and note the discrepancy.

## Map links

`01-map.md` §"The parts" (item 4).

## Out of scope

Everything else in CLAUDE.md — this task touches only the 7 lines above (or whatever the live
re-grep confirms).
