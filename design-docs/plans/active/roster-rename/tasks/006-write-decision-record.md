# Task 006 — Write the new OD decision record

Status: complete — 2026-08-15 (created 0027-roster-renamed-to-harry-potter-characters.md; flagged a real cross-branch numbering collision with PR #184's own unrelated OD-0027; renumbered same-day, pre-push, to 0028-roster-renamed-to-harry-potter-characters.md once `gh pr view 184` confirmed that branch's OD-0027 hadn't merged — cheap to fix now, not worth deferring to merge time)
Risk: none (additive only — this task creates one new file, edits zero existing ones)
Depends on: Tasks 001-005 (the rename should be real before it's documented as decided)

## Goal

Add ONE new file to `.claude/decisions/` documenting the full rename, following this repo's
existing OD format exactly (see `.claude/decisions/0026-delegation-is-the-default-not-the-fallback.md`
or any recent OD for the template: `# OD-NNNN: <title>`, `Status:`, `Scope:`, `Context:`,
`Decision:`, `Consequences:`, `Disconfirming evidence:`).

**Next free number as of this plan's writing is `0027`** (highest existing is `0026`) — but
CONFIRM this at execution time with `ls .claude/decisions/*.md | sort | tail -3`, since another OD
may have landed between planning and execution. Do not hardcode 0027 if the check shows otherwise.

## Content requirements

The `Decision:` field must state, in one quoted sentence per convention, the full old→new mapping
(reuse the table from `00-overview.md`) and both role-title changes (archivist→Registrar,
engineer→Artificer). The `Context:` field should note this was decided via a brainstorm session
with the owner (character-to-role fit, ranked candidates, cross-checked against each seat's actual
job description) — don't over-explain, one or two sentences, pointing at the session artifact if
findable rather than reproducing the whole reasoning trail.

The `Scope:` field lists every file this rename touched: all 9 `.claude/agents/*.md` profiles (old
and new filenames), `.claude/agents/roster.json`, `.claude/agents/roster.html`, `CLAUDE.md`'s
orchestrator section, the two moved memory directories, and
`~/.claude/orchestration-primer/name-registry.md`.

Explicitly state in `Consequences:` (this is the important part, don't skip it): **this OD does
NOT retroactively edit any prior OD that mentions the old names** (e.g. OD-0003, OD-0004, OD-0007,
OD-0024 all mention "Ada" or other old names in their historical text) — those stay as accurate
dated history. Anyone reading an old OD after this point should understand "Ada" there refers to
the same persistent role now named Albus, without this OD needing to touch that file. This is the
owner's own explicit instruction, not an inferred convention — say so.

## Steps

1. Confirm the next free OD number (see above).
2. Write the new file following the exact section template of a recent OD in this repo.
3. Run `.claude/decisions/tools/build-index.sh` to regenerate `INDEX.md` — never hand-edit
   `INDEX.md` directly.
4. Note: the index-build script may emit a pre-existing, unrelated warning about OD-0023 missing a
   "Removed (verbatim):" block — that's not something this task caused or should fix.

## Verification

```bash
cd /Users/stevendunn/GitHub-Steven/audiobook-factory
.claude/decisions/tools/build-index.sh
grep -n "Albus\|Hermione\|Percy\|Dean\|Newt\|Fred\|George\|Moody\|McGonagall" .claude/decisions/INDEX.md
```

## Acceptance criteria

- [ ] New OD file created at the correct next-free number, not overwriting anything.
- [ ] `Decision:` field is a single quoted sentence stating the full mapping.
- [ ] `Consequences:` explicitly states that prior ODs are untouched and why.
- [ ] `INDEX.md` regenerated via the script, not hand-edited.
- [ ] No existing `.claude/decisions/00NN-*.md` file's content was modified by this task.

## Map links

`01-map.md` §"The parts" (item 6), `[INV-6]`.

## Out of scope

Editing any existing OD file. Fixing the pre-existing OD-0023 index-build warning.
