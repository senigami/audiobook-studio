# Task 003 — Correct the two stale docs

Status: complete — 2026-07-04 (done inline by the orchestrating session, same as this plan's
creation)

## Goal

`design-docs/plans/proposals/sub_sentence_speaker_assignment.md` and `TASKS.md` item 012 both
described sub-sentence speaker assignment as an unbuilt design draft. Direct code inspection
confirmed it's ~90% built already. Correct both docs so they reflect reality: what's shipped,
what's genuinely missing, and a pointer to this plan.

## Files

- `design-docs/plans/proposals/sub_sentence_speaker_assignment.md`
- `design-docs/plans/TASKS.md` (item 012, line ~501)

## Steps

- [x] Add a status correction to `sub_sentence_speaker_assignment.md`'s header noting the feature
      is implemented, with a short "what's shipped vs. what's gap" summary and a link to this
      plan folder.
- [x] Update `TASKS.md`'s item 012 sub-sentence-assignment line: change from `[ ]` (not started)
      to reflect built-with-one-gap status, linking this plan folder.
- [x] Cross-link this plan folder from both docs (bidirectional).

## Acceptance criteria

- [x] Both docs accurately describe current implementation state (verified against the actual
      code in `app/domain/chapters/operations.py` and
      `frontend/src/pages/ChapterEditor/components/ScriptView.tsx`, not assumed).
- [x] `grep -rn "span_word_boundary_snapping" design-docs/plans/TASKS.md design-docs/plans/proposals/sub_sentence_speaker_assignment.md` shows at least one hit in each.

## Dependencies

None.

## Map links

N/A — bookkeeping task.

## Out of scope

Do not rewrite the whole design doc — correct its status/summary, keep the original Problem/
Goal/Design-direction/Data-model sections intact since they're still accurate descriptions of the
(already-built) design.
