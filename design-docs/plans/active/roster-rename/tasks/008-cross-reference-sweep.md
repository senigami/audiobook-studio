# Task 008 — Cross-reference reconciliation sweep (run LAST)

Status: complete — 2026-08-16 (3 rounds: 9 + 6 + 6 findings, all fixed and re-verified; round 3's own ~250-hit full-repo sweep is the final clean state)
Risk: multi-file — this task's entire purpose IS the cross-file consistency check. Do not run
before Tasks 001-007 are all complete.
Depends on: Tasks 001-007

## Goal

Catch anything the per-file tasks missed. This is the gate for the whole plan — per `README.md`,
the rename is not "done" until this task's grep sweep is clean.

## Steps

Run every grep below from the repo root. Each is expected to return **zero output**. Any hit means
Task 001-007 missed something — go fix it in the relevant file, then re-run this whole task from
the top (don't just patch the one hit and call it done; a missed pattern often repeats).

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory

# Old personal names, whole-word, across everything this plan touched
grep -rnwE "Ada|Marius|Junia|Amina|Astrid|Cecilia|Esther|Tamsin" \
  .claude/agents/ CLAUDE.md 2>/dev/null

# Old spawn keys, anywhere
grep -rn "abfc-ada\|abfc-marius\|abfc-junia\|abfc-amina\|abfc-astrid\|abfc-cecilia\|abfc-esther\|abfc-tamsin\|abfc-reviewer\b" \
  .claude/agents/ CLAUDE.md .claude/decisions/INDEX.md 2>/dev/null

# Old role-slug parenthetical mentions that should have become artificer/registrar
grep -rn "(engineer)\|(archivist)" .claude/agents/roster.json .claude/agents/*.md 2>/dev/null

# Confirm no old filenames survive
ls .claude/agents/ada-orchestrator.md .claude/agents/marius-engineer.md \
   .claude/agents/junia-designer.md .claude/agents/amina-runtime-verifier.md \
   .claude/agents/astrid-archivist.md .claude/agents/cecilia-user-docs-writer.md \
   .claude/agents/esther-reasoning-elder.md .claude/agents/tamsin-reasoning-younger.md \
   .claude/agents/reviewer.md 2>&1
# every one of these should say "No such file or directory"

# Confirm old memory directories are gone
ls .claude/agent-memory-local/abfc-ada .claude/agent-memory-local/abfc-reviewer 2>&1
# both should say "No such file or directory"

# Sanity: new filenames DO exist
ls .claude/agents/albus-orchestrator.md .claude/agents/hermione-artificer.md \
   .claude/agents/dean-designer.md .claude/agents/moody-runtime-verifier.md \
   .claude/agents/percy-registrar.md .claude/agents/newt-user-docs-writer.md \
   .claude/agents/fred-reasoning-elder.md .claude/agents/george-reasoning-younger.md \
   .claude/agents/mcgonagall-reviewer.md
```

**One deliberate exception to the "zero old names" rule**: the new `OD-NNNN` file written in Task
006 necessarily NAMES the old tokens in its `Decision:`/`Context:` fields to document what changed
— that's correct and expected, don't treat a hit inside `.claude/decisions/00NN-roster-rename*.md`
itself as a failure. Every OTHER file should be clean.

**Also expected and correct**: any OLDER, pre-existing `OD-NNNN` file (0003, 0004, 0007, 0024, etc.)
that already mentions "Ada" or another old name in ITS OWN historical text — those are explicitly
out of scope per `00-overview.md` and should NOT be touched. If your grep patterns above
accidentally include `.claude/decisions/*.md` (not just `INDEX.md`), narrow them — the sweep is
about CURRENT-STATE files, not the sealed historical log.

## Acceptance criteria

- [ ] All greps above return zero output outside the one documented exception (the new OD's own
      "what changed" text).
- [ ] All 9 old filenames confirmed absent.
- [ ] Both old memory directories confirmed absent.
- [ ] All 9 new filenames confirmed present.
- [ ] If any hit was found and fixed, the full sweep was re-run afterward, not just the one line.

## Map links

`01-map.md` §"Connections" (this task exists specifically because those connections cross file
boundaries) and `[INV-5]`.

## Out of scope

Editing sealed historical OD entries — a hit there is expected, not a bug.
