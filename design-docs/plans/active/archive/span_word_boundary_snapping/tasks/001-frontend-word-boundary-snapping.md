# Task 001 — Frontend: snap drag-selection offsets to word boundaries

Status: complete

## Goal

`handleSelection()` in the Book-mode script view captures raw DOM selection offsets with no
snapping. Add snapping per the algorithm in `../00-overview.md` so the popover/preview and the
range sent to the backend already reflect whole-word boundaries.

## Files

- `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` — `handleSelection()` (line ~387)
- `frontend/tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx` — add tests here (this
  file already exists and covers this component)

## Current code (line 387-410, `handleSelection`)

```tsx
  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || viewMode !== 'book') {
      setPendingSelection(null);
      setPopoverPos(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startSpanId = getSpanIdFromNode(range.startContainer);
    const endSpanId = getSpanIdFromNode(range.endContainer);

    if (!startSpanId || !endSpanId) {
      setPendingSelection(null);
      setPopoverPos(null);
      return;
    }

    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    setPendingSelection({
      start_span_id: startSpanId,
      start_offset: startOffset,
      end_span_id: endSpanId,
      end_offset: endOffset,
    });
    // ... popover positioning unchanged below
```

## Target code

Add a module-level (outside the component, near the top of the file or in a small local helper
section) pure function implementing the exact algorithm from `../00-overview.md`:

```tsx
function snapOffsetToWordBoundary(text: string, offset: number, boundary: 'start' | 'end'): number {
  if (offset <= 0 || offset >= text.length) return offset;
  const isWhitespace = (c: string) => /\s/.test(c);
  if (isWhitespace(text[offset - 1]) || isWhitespace(text[offset])) return offset;
  let start = offset;
  while (start > 0 && !isWhitespace(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && !isWhitespace(text[end])) end++;
  return boundary === 'start' ? start : end;
}
```

Then in `handleSelection()`, snap each offset using the **text content of the span it belongs
to** (not the raw DOM text node content, which could differ if a span ever renders as multiple
nested nodes — see the caveat below):

```tsx
    const range = selection.getRangeAt(0);
    const startSpanId = getSpanIdFromNode(range.startContainer);
    const endSpanId = getSpanIdFromNode(range.endContainer);

    if (!startSpanId || !endSpanId) {
      setPendingSelection(null);
      setPopoverPos(null);
      return;
    }

    const startSpan = spans.find((s) => s.id === startSpanId);
    const endSpan = spans.find((s) => s.id === endSpanId);
    const startText = startSpan?.text ?? '';
    const endText = endSpan?.text ?? '';

    const startOffset = snapOffsetToWordBoundary(startText, range.startOffset, 'start');
    const endOffset = snapOffsetToWordBoundary(endText, range.endOffset, 'end');

    setPendingSelection({
      start_span_id: startSpanId,
      start_offset: startOffset,
      end_span_id: endSpanId,
      end_offset: endOffset,
    });
```

Check the exact prop/variable name the component uses for its list of span data (search this
file for how `span.id`/`span.text` are already accessed elsewhere in the same component — the
component clearly has access to the span list since it renders them; use whatever that existing
variable is named, don't introduce a new prop).

## Caveat: rendering spans (not the common editing case) may have nested DOM nodes

When a span `isRendering` (per line ~127-129 of this file), its text is drawn via
`SegmentProgressText` (a per-character "lit" component), which likely creates multiple child text
nodes rather than one. `range.startContainer` in that case might not be the span's own text node,
so `range.startOffset` wouldn't be a simple offset into the full span text. **This is a
pre-existing condition, not introduced by this task** — assigning a speaker to a
currently-rendering span is an unusual interaction (you'd typically assign before triggering
synthesis). Don't attempt to fix this edge case in this task; just don't make it worse. If
`getSpanIdFromNode` already normalizes this correctly (check before assuming it doesn't), no
extra handling is needed. If in doubt, add a one-line comment noting the assumption at the
snapping call site.

## Steps

- [x] Add `snapOffsetToWordBoundary` as specified.
- [x] Update `handleSelection()` to snap both offsets using each endpoint's own span text, per
      the target code above.
- [x] Add tests to `ScriptView.test.tsx`:
      - A drag selection starting/ending mid-word snaps outward to the whole word (use the
        existing test setup pattern in this file — check how selection/range is currently
        simulated, if at all; if `window.getSelection()` isn't mockable in the existing test
        setup, test `snapOffsetToWordBoundary` as an exported/importable pure function directly
        instead of through the full DOM selection flow — simpler and equally valid).
      - Offset already at a whitespace boundary is left unchanged.
      - Offset at 0 or at the span's full text length is left unchanged.
      - Trailing punctuation with no space (e.g. `"Marcus,"`) is treated as part of the word for
        snapping purposes (an offset landing between `s` and `,` in `"Marcus,"` snaps to include
        the comma when snapping as an `end` boundary, i.e. to index 7, the position right after
        the comma — verify against the exact algorithm, don't guess the expected index).

## R1 revert-check

`git stash push -- frontend/src/pages/ChapterEditor/components/ScriptView.tsx`, run the new
tests (expect failure — `snapOffsetToWordBoundary` doesn't exist yet, or offsets aren't snapped),
`git stash pop`, confirm green.

## Acceptance criteria

- [x] `snapOffsetToWordBoundary` implemented exactly per the algorithm spec in `../00-overview.md`.
- [x] `handleSelection()` snaps both `start_offset` and `end_offset` before calling
      `setPendingSelection`.
- [x] `npm -C frontend run test -- --run ScriptView` — new tests pass, no existing tests broken.
- [x] `npm -C frontend run lint` clean on the touched file (0 errors; one pre-existing-style
      `react-refresh/only-export-components` warning from exporting the helper here per this task).

## Dependencies

None (independent of task 002).

## Map links

`01-map.md` — Parts: `handleSelection()`. Invariants: INV-SNAP-1, INV-SNAP-2, INV-SNAP-3.

## Out of scope

- Do not touch `getSpanIdFromNode` or the popover positioning logic.
- Do not add Script-mode range-select (owner decided against it, see plan `README.md`).
- Do not attempt to fix the `SegmentProgressText` nested-node edge case noted above.
