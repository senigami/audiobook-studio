# Task 002 — Brush size selector (Word / Sentence / Paragraph)

Status: pending

Risk: multi-file (touches `CastTool/index.tsx` + `ScriptView.tsx` selection/hover logic, plus `CastPalette.tsx`)

## Goal

Add a discoverable, always-visible 3-way brush-size control (**Word · Sentence · Paragraph**) to the Cast palette. Sentence stays the default and is today's existing click-a-span behavior unchanged. Paragraph formalizes an already-existing *incidental* whole-paragraph click into an intentional, hover-previewed control. Word is new: click-a-word assignment built on the existing backend sub-sentence-split primitive.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §5 ("Brush size (DECIDED)") and §13 decision #1: *"the assignment unit is a sizable control in the Cast palette — Word · Sentence · Paragraph. Never a raw segment... Default is Sentence."* This is a named, owner-resolved decision, not a proposal. `CastTool/index.tsx`'s own doc comment (lines 29–31) explicitly lists "brush-size selection" among the items deliberately deferred by the prior activation pass.

## Exact files

- **MODIFY** `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` — add `brushSize` state; pass to `CastPalette` and `ScriptView`.
- **MODIFY** `frontend/src/pages/Book/studio/CastPalette.tsx` — add the 3-button brush-size selector UI.
- **MODIFY** `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` — accept a `brushSize` prop; branch span-click (lines 149–156) and paragraph-click (lines 588–596) behavior on it; add word-boundary lookup for Word mode; add hover-preview for Paragraph/Word modes.
- **MODIFY** `frontend/src/hooks/chapter/useChapterAssignments.ts` — no signature change needed; both handlers already accept arbitrary `spanIds`/`ScriptRangeAssignment` inputs (see Current shape) — this task only changes *what* `ScriptView.tsx` passes into `onAssign`/`onAssignRange`, routed through task 001's `MutationCollector` (already wired by task 001; do not re-route again here).
- **REUSE, DO NOT REINVENT** `design-docs/plans/active/archive/span_word_boundary_snapping/00-overview.md` — a sibling plan that specified a word-boundary **snapping** algorithm (snapping a drag-selection's raw endpoints to the nearest word edge). It **shipped 2026-07-17 (PR #143)**: `ScriptView.tsx` now exports `snapOffsetToWordBoundary(text, offset, boundary)` (with an authoritative Python twin `_snap_offset_to_word_boundary` in `app/domain/chapters/operations.py`). Reuse the exported `snapOffsetToWordBoundary` for word-boundary math here (INV-1: don't invent a second algorithm for the same "find word edges" job) — see Steps below for exactly how.

## Current shape (verified)

- **Sentence (today's default, needs no change):** `ScriptView.tsx:149–156` — `ScriptSpanItem`'s `onClick` calls `onAssign?.([span.id])` when `activeCharacterId` is set. This is already correct Sentence-brush behavior.
- **Paragraph (exists only as an accidental side effect):** `ScriptView.tsx:588–596` — clicking the paragraph container (`renderBook`'s per-paragraph `<div>`, only reachable when the click lands *outside* any span's own DOM node, because a span's `onClick` calls `e.stopPropagation()` at line 153 whenever `activeCharacterId` is set) calls `onAssign?.(para.span_ids)` — the whole paragraph's span ids. This is a side effect of click-target bubbling, not an intentional "Paragraph brush" control: there's no hover-preview, no discoverability, and clicking directly on a span never reaches it.
- **Sub-sentence range assign (today's only word/phrase-capable path):** `ScriptView.tsx:395–431` (`handleSelection`) — native browser drag-to-select produces a `ScriptRangeAssignment` (`{start_span_id, start_offset, end_span_id, end_offset}`) shown in a popover; clicking "Assign" calls `onAssignRange`. This is driven entirely by the DOM `Selection`/`Range` API, not a custom click gesture — it requires the user to manually drag-select text.
- **Backend already supports sub-span character-offset splitting** — no backend work needed for this task:
  - `app/domain/chapters/operations.py:385` `_apply_range_assignment` — when `start_span_id === end_span_id` (the single-span case Word-brush needs), it calls `_split_segment_at_offset` up to twice (once at `end_offset`, once at `start_offset`) to carve out the exact substring, then assigns the resulting middle segment.
  - `app/domain/chapters/operations.py:464` `_split_segment_at_offset(conn, chapter_id, segment_id, offset)` — inserts a new row, reorders subsequent segments, invalidates audio on both halves. Already battle-tested via the existing drag-select path.
- **`ScriptSpan` already carries what's needed client-side:** `frontend/src/types/index.ts:102–114` — `text`, `char_count`. No new fields required.
- **`getSpanIdFromNode`** (`ScriptView.tsx:384–393`) is the existing pattern for walking up from a DOM node to its owning span id — reuse this exact walk for word-click hit-testing, don't write a second DOM-walking helper.
- **`CastPalette.tsx`** has no brush-size UI today. Its header block is at lines 500–504 (`cast-palette__header`); the narrator/clear-assignment control sits directly below at lines 507–564.

## Target shape

1. **State ownership** (`CastTool/index.tsx`, `CastToolBody`): add `const [brushSize, setBrushSize] = useState<'word' | 'sentence' | 'paragraph'>('sentence');` alongside the existing `viewMode`/`showSafeText`/`showNumbers` state (near line 48–51). Pass `brushSize`/`setBrushSize` to `<CastPalette>` (near line 376) and `brushSize` to `<ScriptView>` (near line 327) as new props.
2. **`CastPalette.tsx` UI**: add a 3-button segmented control (`Word` / `Sentence` / `Paragraph`) in the header region (near lines 500–504), styled consistent with the existing `cast-palette__variant-btn` pattern (lines 318–351) — active button gets the accent border/background, others muted. Always visible (not gated behind character selection), per the design doc's "sizable control in the Cast palette" framing (this is a global brush property, unlike variation which is per-character).
3. **`ScriptView.tsx`**:
   - Add `brushSize?: 'word' | 'sentence' | 'paragraph'` to `ScriptViewProps` (default `'sentence'` if the prop is ever omitted, to keep `ScriptView` safe for other, non-Cast callers).
   - **Sentence mode**: no change to lines 149–156.
   - **Paragraph mode**: when `brushSize === 'paragraph'` and `activeCharacterId` is set, the *span's own* `onClick` (lines 149–156) must also call the whole-paragraph assign, not just the span-level one — today it never reaches the paragraph handler because of the `e.stopPropagation()` at line 153. Thread the owning paragraph's `span_ids` down into `ScriptSpanItem` as a new prop (e.g. `paragraphSpanIds`) and branch: `onAssign?.(brushSize === 'paragraph' ? paragraphSpanIds : [span.id])`. Add a hover-preview: track a `hoveredParagraphId` local state (`useState<string | null>`), set on the paragraph's `onMouseEnter`/cleared on `onMouseLeave` (mirroring the existing paragraph `onClick` at lines 588–596), and apply a CSS class (e.g. `is-paragraph-brush-hover`) to every span in that paragraph when `brushSize === 'paragraph'` — new rule in `ScriptView.css` (imported at line 25).
   - **Word mode**: when `brushSize === 'word'` and `activeCharacterId` is set, a span click must NOT assign the whole span — it must locate the clicked word's `[start, end)` character offsets within `span.text` and call `onAssignRange({ start_span_id: span.id, start_offset, end_span_id: span.id, end_offset, character_id: activeCharacterId })` instead of `onAssign`. To find the click's raw character offset, use `document.caretRangeFromPoint(e.clientX, e.clientY)` (or the standard `document.caretPositionFromPoint`, feature-detect both — same category of Range API `handleSelection` already uses at lines 395–431) to get a `{node, offset}` pair, then walk to the span's own text node the same way `getSpanIdFromNode` does. Once you have a raw offset into `span.text`, expand outward to the enclosing non-whitespace run:
     ```ts
     function wordBoundsAtOffset(text: string, offset: number): { start: number; end: number } {
       const isWhitespace = (c: string) => /\s/.test(c);
       let start = offset;
       while (start > 0 && !isWhitespace(text[start - 1])) start--;
       let end = offset;
       while (end < text.length && !isWhitespace(text[end])) end++;
       return { start, end };
     }
     ```
     This is the same non-whitespace-run-expansion logic documented in `span_word_boundary_snapping/00-overview.md`'s `snap()` algorithm (its two inner `while` loops) — **before writing this, grep the current `ScriptView.tsx` for `snapOffsetToWordBoundary`; if that sibling plan's task 001 has landed since this research, import and reuse its exported function instead of duplicating this block** (INV-1 — one word-boundary algorithm, not two). If it hasn't landed, write the local helper above; do not block this task on the other plan.
     Add hover-preview for Word mode analogously: on `mousemove` over a span (throttled, or on `mouseenter` per-word if you segment the rendered text into word spans — simplest correct option is a `mousemove` handler computing the hovered word's bounds and applying a CSS underline/highlight to that character range via a `<mark>`-style inline wrapper, or skip the live per-character preview and only highlight on hover at the whole-span level with a "word brush active" cursor style if fine-grained hover proves too invasive for this pass — note this simplification explicitly in your PR if taken).
4. **Routing through the collector**: `onAssign`/`onAssignRange` callbacks passed into `<ScriptView>` from `CastTool/index.tsx` (lines 344–361) already call `handleScriptAssign`/`handleScriptAssignRange` — those, per task 001, already route through `MutationCollector`. Nothing changes at that layer for this task; Word/Paragraph brush just changes *what arguments* reach those same existing callbacks.

## Steps (ordered, concrete)

1. Confirm task 001 has landed (or design this task's `onAssign`/`onAssignRange` calls to the exact same signatures they use today regardless — no new call shape is needed from `ScriptView.tsx`'s side either way, so this task has no hard blocking dependency on 001's *internals*, only on not conflicting with it; see Dependencies).
2. Add `brushSize` state to `CastTool/index.tsx` and thread it to `CastPalette`/`ScriptView`.
3. Build the 3-button control in `CastPalette.tsx`.
4. In `ScriptView.tsx`: add the `brushSize` prop, thread `paragraphSpanIds` into `ScriptSpanItem`, implement the Paragraph-mode branch in the span `onClick`.
5. Implement Word-mode hit-testing (`wordBoundsAtOffset` or the reused snapping utility) and route to `onAssignRange`.
6. Add hover-preview CSS/state for Paragraph and Word modes.
7. Write/extend tests in `frontend/tests/unit/pages/ChapterEditor/components/ScriptView.test.tsx` (existing file, per the sibling `span_word_boundary_snapping` plan's own task file, which confirms this test file already exists and covers this component):
   - Sentence mode: unchanged behavior (regression check).
   - Paragraph mode: clicking any span within a paragraph while `brushSize === 'paragraph'` calls `onAssign` with the full paragraph's span ids, not just the clicked span's id.
   - Word mode: clicking a simulated word position calls `onAssignRange` with offsets bounding only that word (mock/stub `document.caretRangeFromPoint` since jsdom doesn't implement it — check the existing test setup for any existing Range/Selection mocking pattern before adding a new one).
8. `npm -C frontend run test -- --run ScriptView`, `npm -C frontend run lint`.
9. Append a `docs/code-map/queue/` changelog entry.

## Acceptance criteria

- [ ] A 3-button Word/Sentence/Paragraph control is visible in the Cast palette at all times (not gated behind character selection), defaulting to Sentence.
- [ ] Sentence-mode click behavior is unchanged (existing tests for span click still pass unmodified).
- [ ] Paragraph-mode click on ANY span within a paragraph (not just blank space) assigns the whole paragraph, with a hover-preview highlighting the paragraph before click.
- [ ] Word-mode click on a span assigns only the clicked word's character range via `onAssignRange`, verified by a test asserting the exact offsets.
- [ ] No second word-boundary algorithm exists if `span_word_boundary_snapping`'s utility has landed — verified by checking for `snapOffsetToWordBoundary` before implementing a local one.
- [ ] `npm -C frontend run test -- --run` and `npm -C frontend run lint` clean.
- [ ] `docs/code-map/queue/` entry added.

## Map links

Part B in `01-map.md`. Invariant INV-1 (no second data model / no second word-boundary algorithm). Depends on Part A (task 001) per the roadmap's dependency graph — design against the stable `onAssign`/`onAssignRange` interface either way (see Dependencies).

## Dependencies

Depends on task 001 (mutation-batching collector) per the roadmap, primarily so both land with one generation of "how does an assignment get saved" rather than needing rewiring later. This task's own code changes (`ScriptView.tsx`, `CastPalette.tsx`, `CastTool/index.tsx`'s new `brushSize` state) do not themselves call `api.saveScriptAssignments` directly — they call the same `onAssign`/`onAssignRange` props that task 001 already routes through the collector — so if 001 is not yet merged when this task starts, it will still work correctly against the pre-001 immediate-call path and pick up batching automatically once 001 lands, with no changes needed here.

## Out of scope

- Do not build a drag-to-paint gesture across multiple spans (that's separate future work referenced in the design doc's "Drag across spans to assign a run" line — no such UI exists anywhere in this codebase today; do not add it as a drive-by).
- Do not implement `span_word_boundary_snapping`'s drag-selection-endpoint snapping feature — that is a different, sibling plan with its own tasks; only reuse its algorithm/utility if it already exists, don't build it here.
- Do not touch the per-span `<VoiceProfileSelect>` dropdown (`ScriptView.tsx:170–179`) — that's Part M's (legacy retirement) concern, task 019.
