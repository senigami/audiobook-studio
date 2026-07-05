# Task 002 — Backend: enforce word-boundary snapping in `_apply_range_assignment`

Status: pending

## Goal

`_apply_range_assignment` currently passes whatever `start_offset`/`end_offset` it receives
straight to `_split_segment_at_offset`, which does a raw `text[:offset]`/`text[offset:]` split —
no word-boundary enforcement. This is the **authoritative** enforcement point (per
`../01-map.md` INV-SNAP-1): even if the frontend (task 001) always snaps correctly, this function
must snap independently, since it's reachable by any caller of
`PUT /chapters/{id}/script-view/assignments`, not just the Book-mode UI.

## Files

- `app/domain/chapters/operations.py` — `_apply_range_assignment` (line 385)
- New test file: `tests/domain/test_chapter_range_assignment.py` (no existing test file covers
  `_apply_range_assignment`/`save_script_assignments` at all today — this is a genuine, pre-
  existing test gap in the codebase, not something this task needs to fully close; add only the
  tests needed to cover this task's own change, see Steps below. A full backfill of range-
  assignment test coverage is flagged as a separate follow-up, not in scope here.)

## Current code (line 385-411, the start of `_apply_range_assignment`)

```python
def _apply_range_assignment(conn, chapter_id: str, range_req: Mapping[str, Any]):
    """Surgically split segments and apply assignment to a character range."""
    cursor = conn.cursor()

    start_span_id = range_req["start_span_id"]
    start_offset = range_req["start_offset"]
    end_span_id = range_req["end_span_id"]
    end_offset = range_req["end_offset"]
    character_id = helpers._clean_optional_text(range_req.get("character_id"))
    speaker_profile_name = helpers._clean_optional_text(range_req.get("speaker_profile_name"))

    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
    initial_ids = [row[0] for row in cursor.fetchall()]

    try:
        start_idx = initial_ids.index(start_span_id)
        end_idx = initial_ids.index(end_span_id)
    except ValueError:
        return

    if start_idx > end_idx:
        return

    assign_ids = []

    if start_span_id == end_span_id:
        cursor.execute("SELECT text_content FROM chapter_segments WHERE id = ?", (start_span_id,))
        row = cursor.fetchone()
        if not row: return
        text = row["text_content"] or ""

        left_id = start_span_id
        if 0 < end_offset < len(text):
            _split_segment_at_offset(conn, chapter_id, left_id, end_offset)

        if 0 < start_offset < len(text):
            _, mid_id = _split_segment_at_offset(conn, chapter_id, left_id, start_offset)
            assign_ids = [mid_id]
        else:
            assign_ids = [left_id]
    else:
        # ... (cross-segment branch, not shown here — same pattern, see the file directly)
```

## Target: add a snapping helper, call it right after reading each span's text, before any split

Add a module-level function near `_split_segment_at_offset` (same file):

```python
def _snap_offset_to_word_boundary(text: str, offset: int, boundary: str) -> int:
    """Snap a character offset outward to the nearest word boundary.

    ``boundary`` is ``"start"`` or ``"end"``. Mirrors the identical algorithm in
    ``frontend/src/pages/ChapterEditor/components/ScriptView.tsx``
    (``snapOffsetToWordBoundary``) — keep both in sync if either changes.
    A ``start`` offset landing mid-word snaps backward to the word's start; an
    ``end`` offset landing mid-word snaps forward to the word's end (including
    any trailing punctuation with no space, since punctuation attaches to the
    preceding word per the design doc's snapping rule). Offsets already at 0,
    at ``len(text)``, or sitting on a whitespace boundary are returned unchanged.
    """
    if offset <= 0 or offset >= len(text):
        return offset
    if text[offset - 1].isspace() or text[offset].isspace():
        return offset
    start = offset
    while start > 0 and not text[start - 1].isspace():
        start -= 1
    end = offset
    while end < len(text) and not text[end].isspace():
        end += 1
    return start if boundary == "start" else end
```

Then in `_apply_range_assignment`, snap **immediately after reading each relevant span's
`text_content`**, before it's used in any `0 < offset < len(text)` check or passed to
`_split_segment_at_offset`. Concretely, in the `start_span_id == end_span_id` branch:

```python
        text = row["text_content"] or ""
        start_offset = _snap_offset_to_word_boundary(text, start_offset, "start")
        end_offset = _snap_offset_to_word_boundary(text, end_offset, "end")

        left_id = start_span_id
        if 0 < end_offset < len(text):
            _split_segment_at_offset(conn, chapter_id, left_id, end_offset)
        ...
```

And in the cross-segment (`else`) branch, snap `end_offset` against `end_text` right after it's
read, and snap `start_offset` against `start_text` right after it's read — same pattern, applied
at each of the two read sites in that branch. Read the full current function body in the file
before editing (only an excerpt is pasted above) so you snap at both read sites in that branch,
not just one.

## Steps

- [ ] Add `_snap_offset_to_word_boundary` exactly as specified.
- [ ] Call it at every point in `_apply_range_assignment` where a raw `start_offset`/`end_offset`
      is about to be compared against a span's `len(text)` or passed to
      `_split_segment_at_offset` — both branches (single-span and cross-segment).
- [ ] Create `tests/domain/test_chapter_range_assignment.py` with, at minimum:
      - A range assignment with a mid-word `start_offset` results in the split (and thus the
        assigned span's text) starting at the word's beginning, not mid-word. Assert on the
        actual `text_content` of the resulting segment(s) after calling
        `save_script_assignments`, not on the offset value alone — the acceptance bar is
        correct final text, not just that the helper function returns the right number.
      - Same for a mid-word `end_offset`.
      - An offset already on a whitespace boundary is unaffected (produces the identical split
        as before this change — use this as the R1 baseline case).
      - Losslessness: concatenating the resulting segments' `text_content` in `segment_order`
        reproduces the original sentence text exactly (per INV-SNAP-3).
      - Trailing-punctuation case: `"...\"I can't believe you did that,\" said Marcus...\""` (or
        a simpler fixture) — an end offset landing between a word and its trailing comma snaps to
        include the comma.

## R1 revert-check

`git stash push -- app/domain/chapters/operations.py`, run the new tests (expect failure — the
mid-word split lands where it shouldn't), `git stash pop`, confirm green.

## Acceptance criteria

- [ ] `_snap_offset_to_word_boundary` implemented exactly per the algorithm spec in
      `../00-overview.md` (must match task 001's frontend version character-for-character in
      behavior, not just intent).
- [ ] Both branches of `_apply_range_assignment` snap before use.
- [ ] `./venv/bin/python -m pytest tests/domain/test_chapter_range_assignment.py -q` — new tests
      green.
- [ ] `./venv/bin/python -m pytest tests/api/test_api_chapters_script_view.py -q` — still green
      (confirm no regression to existing script-view behavior).
- [ ] Full `./venv/bin/python -m pytest -q` green.
- [ ] `ruff check app/domain/chapters/operations.py` clean.

## Dependencies

None (independent of task 001).

## Map links

`01-map.md` — Parts: `_apply_range_assignment()`, `_split_segment_at_offset()`. Invariants:
INV-SNAP-1 (this task IS that invariant), INV-SNAP-2, INV-SNAP-3.

## Out of scope

- Do not modify `_split_segment_at_offset` itself — it stays a pure raw-offset splitter; snapping
  happens in its caller so the offsets it receives are already correct.
- Do not attempt a full test-coverage backfill for `_apply_range_assignment`/
  `save_script_assignments` beyond what this task's own change needs — flagged separately as a
  follow-up, not this task's job.
