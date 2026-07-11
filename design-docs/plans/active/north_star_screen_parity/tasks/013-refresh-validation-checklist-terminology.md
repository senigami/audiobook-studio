# Task 013 — Refresh terminology in the R1-18 owner-validation checklist

Status: pending

Risk: none

## Goal

Update the stale terminology in `reference/site_redesign_rollout/99_progress_log.md`'s
"OWNER VALIDATION" checklists (lines 323-386, items 1-18 — the ones `TASKS.md` line 478 still
references as an outstanding owner gate) so the wording matches the current IA instead of the
pre-Director's-Console names.

## Why this matters

Items 4-9 in that checklist reference "Studio: book view is primary... the Cast palette paints
voices... Casting: 'Narrator (default)' is the pinned FIRST row" and "5 stage tabs" —
terminology from before the Director's Console activation and the Contents/Cast/Lexicon tab
rename. If the owner ever sits down to actually walk through this outstanding validation gate (per
`TASKS.md`'s Stage 1 entry), stale labels will make it hard to tell what to actually click on,
compounding the same confusion this whole plan exists to resolve.

## Exact file

- `design-docs/plans/reference/site_redesign_rollout/99_progress_log.md` (lines 323-386
  specifically — do not touch the rest of the file, which is a historical log of completed phase
  work and should stay as-written)

## Steps

1. Read lines 323-386 fully, fresh (line numbers may have shifted).
2. For each item that references retired terminology, update the wording to the current equivalent,
   without changing what the item is actually asking the owner to verify:
   - "Studio" (as a stage tab) → "Cast" (book-level tab) or the relevant Director's Console mode,
     depending on what the item is actually describing (check whether it means the OLD `StudioStage`
     paint-assignment behavior — which now lives in `CastTool` inside the Chapter Workspace — or the
     book-level `Cast`/Casting-roster tab; they're different things now and the update must
     disambiguate, not just find-and-replace the word).
   - "Casting" (as a stage tab) → "Cast" (book-level tab, per the current `stages.ts` tab list).
   - "Review" (as a stage tab) → the Director's Console's "Booth" mode.
   - "5 stage tabs" → the current 6-tab list (Book/Contents/Cast/Lexicon/Publish/Backups) — but
     note this count itself may change again once tasks 009/010 in this plan resolve; if executed
     after those land, reflect whatever the final tab list is at that point.
   - "Manuscript" (as a stage tab) → "Contents" (book-level tab).
3. Do not change the meaning or intent of any item — only the terminology used to describe where to
   look. If an item's underlying behavior itself no longer exists or has moved in a way that changes
   what should be verified (not just renamed), flag that specific item rather than guessing at a
   rewrite — add a note rather than inventing new verification language.

## Acceptance criteria

- [ ] All retired terminology in lines 323-386 (Studio/Casting/Review/Manuscript-as-tab-names, "5
      stage tabs") updated to current equivalents.
- [ ] No item's actual verification intent changed — this is a terminology refresh, not a rewrite of
      what's being asked.
- [ ] Any item whose underlying behavior has structurally changed (not just renamed) since
      2026-06-14 is flagged with a note rather than silently reworded.
- [ ] Rest of the file (the historical phase log, lines 1-322) untouched.

## Map links

Part: "Owner validation checklist" in `01-map.md`.

## Dependencies

Best done after tasks 008/009/010 land, so the terminology refresh reflects the truly final state
rather than needing a second pass — but not a hard blocker; can be done now with a note that a
final terminology pass may be needed again once 009/010 resolve.

## Out of scope

Do not attempt to actually perform the owner-validation walkthrough itself in this task — that
remains the owner's job, per `TASKS.md`'s existing Stage 1 gate. This task only makes the checklist
legible when they get to it.
