# Overview

## The task

Add word-boundary snapping to the already-working sub-sentence span-assignment feature (drag-
select a text range in Book mode → assign a speaker → backend surgically splits segments at the
selection's character offsets). Today the split can land mid-word; the design doc requires it
never does.

## Success criteria (what "done" means)

1. In Book mode, dragging a selection that starts or ends mid-word results in a span split at
   the **nearest enclosing word boundary**, not the raw drag position — the assigned range never
   cuts a word in half.
2. The same guarantee holds even if a future caller (not the Book-mode UI) posts raw mid-word
   offsets directly to `PUT /chapters/{id}/script-view/assignments` — the backend enforces
   snapping too, not just the frontend (defense in depth; don't rely on a well-behaved client).
3. Trailing punctuation attached to a word with no space (e.g. `Marcus,`) stays with that word —
   the snapping algorithm treats a maximal run of non-whitespace characters as one unit.
4. `design-docs/plans/proposals/sub_sentence_speaker_assignment.md` and
   `design-docs/plans/TASKS.md` are corrected to reflect that the feature is built, not a design
   draft, with an accurate remaining-gaps list.
5. Full `pytest -q`, frontend `vitest`, and `ruff`/`eslint` stay green; every behavior change has
   an R1 revert-checked test.

## Scope

**In scope:**
- `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` (`handleSelection`, line ~387) —
  snap the captured offsets before they reach `pendingSelection`/`onAssignRange`.
- `app/domain/chapters/operations.py` (`_apply_range_assignment`, line 385, and/or
  `_split_segment_at_offset`, line 439) — snap offsets before splitting, as the authoritative
  enforcement point.
- The two stale docs listed above.

**Out of scope (non-goals):**
- Script-mode range-select UI — owner decided Book-mode-only is fine for now (see `README.md`).
- Undo for span assignment — pairs with the separate, not-yet-built doc-10 U1 undo-toast work;
  no undo mechanism exists in the chapter editor at all today, adding one is a bigger, separate
  effort.
- Character auto-detection / auto-attribution producing spans automatically — separate future
  work per the design doc's Open Question 3; this plan only touches the manual assignment path.
- Changing `compact_script_view`'s manual-trigger behavior (the adjacent-span merge-back) — it
  already exists as a distinct on-demand action (`POST` endpoint in
  `app/api/routers/chapters_production.py`); the design doc's "MAY be merged" wording is
  satisfied by it being optional/manual, not a gap.
- Any change to chunk/render-group packing (`app/domain/chunk_groups.py`) — it already operates
  correctly on segments regardless of granularity; verified, not touched.

## The snapping algorithm (exact spec — implement identically in both languages)

Given `text` (the containing span's full text content) and a raw character `offset`, and whether
this is a `start` or `end` boundary of the selection:

```
function snap(text, offset, boundary):  # boundary: "start" | "end"
    if offset <= 0 or offset >= len(text):
        return offset   # already at the span's own edge — nothing to snap
    before = text[offset - 1]
    after = text[offset]
    if is_whitespace(before) or is_whitespace(after):
        return offset   # already sitting between two non-whitespace runs — valid boundary
    # offset lands inside a run of non-whitespace characters (a "word", including any
    # trailing punctuation with no space before it) — snap outward to that run's edge
    start = offset
    while start > 0 and not is_whitespace(text[start - 1]):
        start -= 1
    end = offset
    while end < len(text) and not is_whitespace(text[end]):
        end += 1
    return start if boundary == "start" else end
```

`is_whitespace` = the standard whitespace character class (space, tab, newline — Python's
`str.isspace()` / JS's `/\s/`). This snaps a `start` offset **backward** (so the selection
includes the whole word it starts inside) and an `end` offset **forward** (so the selection
includes the whole word it ends inside) — the selection only ever grows to whole-word
boundaries, never shrinks and drops part of what the user dragged over.

## Open questions

None remaining — the one open product question (Script-mode scope) was resolved by the owner
before this plan was written (see `README.md`).
