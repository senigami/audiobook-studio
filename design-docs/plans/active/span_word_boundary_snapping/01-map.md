# Implementation map

## Big picture

```
User drags a selection in Book mode
        │
        ▼
ScriptView.tsx: handleSelection() (line ~387)
  reads window.getSelection() → range.startOffset / range.endOffset (RAW, no snapping today)
  finds start_span_id / end_span_id via getSpanIdFromNode()
        │  [task 001 inserts snapping HERE, before setPendingSelection()]
        ▼
setPendingSelection({start_span_id, start_offset, end_span_id, end_offset})
        │  user clicks the popover's assign button (line ~695)
        ▼
onAssignRange({...pendingSelection, character_id}) → useChapterAssignments.ts:
  handleScriptAssignRange() (line ~81)
        │  calls api.saveScriptAssignments(chapterId, {range_assignments: [...]})
        ▼
PUT /chapters/{id}/script-view/assignments  (app/api/routers/chapters_production.py)
        │
        ▼
app/domain/chapters/operations.py: save_script_assignments() (line 162)
  loops range_assignments → _apply_range_assignment() (line 385)
        │  [task 002 inserts snapping HERE, before the split calls — this is the
        │   authoritative enforcement point; frontend snapping is UX polish only]
        ▼
_split_segment_at_offset() (line 464) — raw text[:offset] / text[offset:] split,
  creates a new `split_<uuid>` segment row, shifts segment_order for everything after
        │
        ▼
UPDATE chapter_segments SET character_id=..., speaker_profile_name=... WHERE id IN (assign_ids)
        │
        ▼
Refreshed ScriptViewResponse returned → frontend refetches segments (canonical state wins)
```

## Parts

| Part | File:line | Responsibility |
|---|---|---|
| `handleSelection()` | `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:387` | Captures raw DOM selection offsets. **Task 001 adds snapping here.** |
| `getSpanIdFromNode()` | `ScriptView.tsx` (near line 375-385) | Walks up the DOM to find which span a selection endpoint belongs to — already correct, not touched. |
| `_apply_range_assignment()` | `app/domain/chapters/operations.py:385` | Orchestrates the split-and-assign for a range. **Task 002 adds snapping here, before calling `_split_segment_at_offset`.** |
| `_split_segment_at_offset()` | `app/domain/chapters/operations.py:464` | Does the raw character-offset split. Not itself modified — task 002's snapping happens in its caller so the offsets it receives are already word-aligned. |
| `save_script_assignments()` | `app/domain/chapters/operations.py:162` | Top-level entry point; loops `range_assignments`, calls `_apply_range_assignment` per entry. Not modified. |
| `PUT /chapters/{id}/script-view/assignments` | `app/api/routers/chapters_production.py` | Router endpoint. Not modified — the snapping fix is entirely inside `_apply_range_assignment`, transparent to the API contract. |
| `handleScriptAssignRange()` | `frontend/src/hooks/chapter/useChapterAssignments.ts:81` | Frontend API call + optimistic update + refetch. Not modified. |
| `ScriptRangeAssignment` type | `frontend/src/types/index.ts:151` | `{start_span_id, start_offset, end_span_id, end_offset, character_id?, speaker_profile_name?}` — shape unchanged by this plan; only the *values* of `start_offset`/`end_offset` change (snapped instead of raw). |

## Connections / invariants

- **[INV-SNAP-1] Both layers snap identically.** The frontend snap (task 001) is a UX nicety (the
  popover position and any visual preview should reflect the final, snapped range, not the raw
  drag). The backend snap (task 002) is the actual guarantee — it must snap **even if the
  frontend didn't** (e.g. a future non-UI caller, or a frontend bug). Do not skip task 002 on the
  reasoning that "the frontend already snaps."
- **[INV-SNAP-2] Snapping must not change `start_span_id`/`end_span_id`** — only the `_offset`
  values move, and only within the bounds of the text of the span they already refer to. For any
  in-range input (`0 <= offset <= len(text)`), the algorithm in `00-overview.md` never returns a
  value outside `[0, len(text)]`. Note the precise contract: an *out-of-range* input (negative,
  or `> len(text)`, e.g. from a hostile API caller) is passed through unchanged by the
  `offset <= 0 or offset >= len(text)` guard — that's still safe, because
  `_split_segment_at_offset` has its own identical guard and treats such offsets as a no-op split,
  but don't cite this invariant as proof the algorithm *clamps* inputs; it doesn't.
- **[INV-SNAP-3] Losslessness is preserved.** Snapping only changes *where* a split happens
  within a span, not *whether* text is dropped — `_split_segment_at_offset`'s
  `left_text + right_text == original_text` invariant (already true today, verified by reading
  the function) continues to hold no matter what offset it's given, snapped or not. Don't
  introduce any code path that trims/drops characters during snapping itself.
- **[INV-SNAP-4] Existing whole-span (non-range) assignment is untouched.** `assignments` (plain
  `span_ids` list, no offsets) in `save_script_assignments` never goes through
  `_apply_range_assignment` at all — this plan's changes are scoped entirely to the
  `range_assignments` path.

## Risks

- **Off-by-one risk in the snapping algorithm.** The `00-overview.md` spec is written to be
  copy-pasted nearly verbatim into both TS and Python — implement it exactly as specified rather
  than "the general idea," and cover the boundary cases in the acceptance tests (offset at 0,
  offset at `len(text)`, offset already on a whitespace boundary, offset strictly inside a word,
  offset inside trailing punctuation attached to a word).
- **Divergence risk between the two implementations.** Since the same algorithm needs to exist in
  both JS and Python with no shared code (different runtimes), a future edit to one without the
  other is a real risk. Task 002's tests should include a comment pointing back to the frontend
  implementation (and vice versa) so a future reader knows to check both.

## Open questions

None — resolved before this plan was written (see `README.md`).
