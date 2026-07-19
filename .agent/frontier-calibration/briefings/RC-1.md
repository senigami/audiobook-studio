# Calibration briefing — RC-1: sub-sentence spans collapse after edit-and-save

**Activity:** root-cause analysis · **Gradeable:** objective

## The task

A user assigns a second speaker to *part* of a sentence (a sub-sentence span), then later
edits that chapter's manuscript text and saves. After the save, all of their manual
sub-sentence speaker assignments in that chapter have reverted to single, narrator-owned
sentences, and the associated segment audio is invalidated.

Find the **root cause**. Name the exact code path and the specific condition that discards
the assignments — down to the function and the line, and the precise reason a manually-split
span cannot survive the save.

## Read (reason from these, not from memory of the repo)

- `app/db/segments.py` — `sync_chapter_segments` (look closely around lines ~507, ~523, ~534–535, ~555–566)
- `app/domain/chapters/operations.py` — `_split_segment_at_offset` (~487), `get_resync_preview` (~270, ~299)
- `app/db/chapters.py` — `update_chapter` (~224), `create_chapter` (~54)
- `frontend/src/hooks/chapter/useChapterPersistence.ts` (~24)
- The code-map (`.agent/code-map/`) symbol trace / blast-radius on the functions above.

## Produce

- The exact discarding path: which trigger fires on a text save, what it rebuilds, and the
  specific check that a sub-sentence span fails.
- The precise condition (`path:line`) that makes a manually-split span structurally unable to
  survive, stated concretely.
- Whether this fires only on an explicit "resync" action or also on the ordinary
  edit-and-save flow — and the evidence for which.

## Discipline

- Reason from the code and the trace, not from an assumed cause. Trace the path end to end.
- State your conclusion with specifics: the function, the line, the failing condition.
- State your confidence and exactly what evidence would change it.
- If any part can't be determined from the code available here, say so rather than guess.
