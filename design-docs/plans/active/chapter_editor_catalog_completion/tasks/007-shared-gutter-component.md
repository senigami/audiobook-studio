# Task 007 — Shared annotation gutter component (Cast + Booth)

Status: pending

Risk: multi-file (new shared component consumed by two different modes with two different data sources — the contract must be generic enough for both from day one, or Booth's task 009 will fork it into a second implementation)

## Goal

Build one new component, `AnnotationGutter`, that renders small stacked glyphs in a narrow left-edge margin (~12–16px) alongside prose text — ⊘ for Stage Direction, ⚡ for Performance Cue (this task's consumers), with the contract designed so Booth mode's own glyphs (🏴 session flag pin, a variation-deviation tick — task 009, out of scope here) can feed the same component later without a second implementation. Wire it into Cast mode's `ScriptView.tsx` in both of its existing render modes ("book" and "script").

## Why this matters

Per `01-map.md`'s Connections section: "F (gutter component) is shared infrastructure for E (Cast's Stage/Cue glyphs) and G (Booth's annotation glyphs)... Build F once as a standalone component before either E or G's glyph-rendering pieces, so Cast and Booth don't grow two incompatible gutter implementations. This is the single highest-value de-duplication opportunity in this plan." INV-3 makes this a hard requirement: "Cast's and Booth's annotation/cue glyphs render through the same shared component — a second, incompatible gutter implementation in either mode is a map violation." No gutter/glyph component exists anywhere in the app today for any mode — Booth's existing `AnnotationsPanel.tsx` (`frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/AnnotationsPanel.tsx`) is a flat side-drawer list backed by `frontend/src/store/annotations.ts` (localStorage-only `Annotation[]` keyed by `segmentId`/`chapterId`/`notes`), not a gutter, and is a structurally different data source than Cast's `render`/`engine_directives` segment fields (task 005) — this is exactly why the shared component's prop contract must be data-source-agnostic.

## Exact files

- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/AnnotationGutter/index.tsx` (component).
- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/AnnotationGutter/AnnotationGutter.css` (styles — follow `ScriptView.tsx`'s pattern of a co-located sibling `.css` file, e.g. `frontend/src/pages/ChapterEditor/components/ScriptView.css`).
- Edit: `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` — `renderBook` (lines 526–605, the `book-paragraph-gutter` div at line 598) and `renderScript` (lines 607–640, the `.script-line` grid at lines 625–638).
- Edit: `frontend/src/pages/ChapterEditor/components/ScriptView.css` — `.book-paragraph-gutter` (lines 267–269, currently `display: none`) and `.script-line` (lines 537–545, `grid-template-columns: 140px 1fr`).

## Current shape (verified)

- **`ScriptView.tsx` already has a dead gutter placeholder.** In `renderBook` (the "book" view mode, the default per `CastToolBody`'s `viewMode` state), each paragraph block is:
  ```tsx
  <div key={para.id} className={`book-paragraph ...`} onClick={...}>
    <div className="book-paragraph-gutter" />
    <div className="book-paragraph-text">{nodes}</div>
  </div>
  ```
  (`ScriptView.tsx:584–603`, gutter div at line 598). Its CSS (`ScriptView.css:267–269`) is:
  ```css
  .book-paragraph-gutter { display: none; }
  ```
  with a second, seemingly dead rule at `ScriptView.css:302–304` (`.book-paragraph.is-paintable:hover .book-paragraph-gutter { display: none; }` — a no-op given the base rule already hides it). `.book-paragraph-text { flex: 1; ... }` (`ScriptView.css:306–309`) implies `.book-paragraph` is intended as a flex row (verify its actual computed `display` — it is not set in the visible DDL excerpt, check for a shared/base class before assuming) with the gutter as the first flex child, currently switched off. **This is the exact, already-scaffolded integration seam for this task** — no new DOM wrapper is needed in `renderBook`, only un-hiding and populating this existing div.
  - This div is one-per-**paragraph**, not one-per-segment/span. A paragraph (`ScriptParagraph { id, span_ids }`, `frontend/src/types/index.ts:116-119`) can contain multiple spans/segments. The gutter must therefore be able to show glyphs for **every** span in `para.span_ids` that has one, stacked vertically per the design doc ("Multiple glyphs on one line stack vertically in the gutter" — §13 line 349) — treat "line" here as "paragraph row" since that is this view mode's actual visual unit.
- **`renderScript`** (the "script" view mode) renders one `<div className="script-line">` per **span** (not per paragraph), as a CSS grid: `grid-template-columns: 140px 1fr` (`ScriptView.css:537-545`) with two existing children, `.script-line-speaker` (631–633) and `.script-line-content` (634–636). There is **no** existing gutter div in this mode — one must be added as a new grid column.
- **Data available per span (after task 005):** `ScriptSpan.render: boolean` and `ScriptSpan.engine_directives: EngineDirectives | null` (`frontend/src/types/index.ts`, added by task 005). `ScriptSpan.character_id === '_stage_direction'` (the sentinel from task 005) plus `render === false` identifies Stage Direction; `render === false` plus `engine_directives != null` identifies Performance Cue (see task 005's Target shape for why these two signals are distinct and both needed).
- **Booth's data source is genuinely different** (confirmed, not to be touched by this task): `useAnnotations(chapterId)` from `frontend/src/store/annotations.ts` returns `Annotation[]` (`{segmentId, chapterId, notes, updatedAt}`), entirely separate from `ScriptSpan`. Task 009 (out of scope here) will need to map that shape into whatever generic entry shape this component defines.

## Target shape

**`AnnotationGutter` component contract** (data-source-agnostic per INV-3 — this is the part to get right once):
```tsx
export interface GutterGlyph {
  segmentId: string;
  glyph: string;           // literal glyph character, e.g. '⊘', '⚡', '🏴'
  tooltip?: string;        // accessible label / title text
  onClick?: () => void;    // optional — task 008 wires this for '⚡' to open the Cue Editor
}

export interface AnnotationGutterProps {
  glyphs: GutterGlyph[];   // all glyphs for ONE row (one paragraph in "book" mode, one span-line in "script" mode) — component stacks them vertically
}

export const AnnotationGutter: React.FC<AnnotationGutterProps> = ({ glyphs }) => { ... };
```
Rendering: a narrow (~12–16px) vertical flex column; each glyph a small `<button>` (if `onClick` provided) or `<span>` (if not) with `title={tooltip}` for accessibility and a `data-testid` per glyph (e.g. `data-testid="gutter-glyph-{glyph}-{segmentId}"`) for testability. Empty `glyphs` array renders an empty (zero-visual-weight) column, not `null` — so the column width stays reserved and text doesn't reflow when a glyph appears/disappears on the same row (avoids layout jitter as segments get painted/unpainted).

**A small local helper (co-located with `AnnotationGutter` or in `ScriptView.tsx`, whichever avoids duplicate logic) computes Cast's glyphs from spans:**
```ts
function castGlyphsForSpan(span: ScriptSpan, onOpenCueEditor?: (spanId: string) => void): GutterGlyph[] {
  if (span.engine_directives) {
    return [{ segmentId: span.id, glyph: '⚡', tooltip: 'Performance Cue', onClick: () => onOpenCueEditor?.(span.id) }];
  }
  if (span.render === false) {
    return [{ segmentId: span.id, glyph: '⊘', tooltip: 'Stage Direction' }];
  }
  return [];
}
```
(`onOpenCueEditor` stays `undefined`/unused until task 008 exists — this task builds the glyph and the optional click affordance on the component's contract, task 008 supplies the handler and the popover it opens. The design doc's own gutter description calls the gutter "no interaction required... not a clickable panel" [§13 line 349] as its baseline description of the passive glyph *signal* layer; task 008's explicit dependency on this task "renders via the gutter's glyph click-to-open interaction" carves out the ⚡ glyph specifically as the one interactive exception, wired in task 008 — this task only needs to expose the optional `onClick` on `GutterGlyph`, not decide the click behavior itself.)

**`renderBook` integration (`ScriptView.tsx:584-603`):** replace `<div className="book-paragraph-gutter" />` with:
```tsx
<div className="book-paragraph-gutter">
  <AnnotationGutter glyphs={para.span_ids.flatMap(id => {
    const span = spanMap.get(id);
    return span ? castGlyphsForSpan(span) : [];
  })} />
</div>
```
**CSS:** change `.book-paragraph-gutter { display: none; }` to an actual narrow flex column (verify `.book-paragraph`'s computed `display` first — `.book-paragraph-text`'s `flex: 1` at `ScriptView.css:306-309` implies the parent is already flex; if it turns out not to be, add `display: flex` to `.book-paragraph` as part of this change). Delete the now-redundant `.book-paragraph.is-paintable:hover .book-paragraph-gutter { display: none; }` rule at `ScriptView.css:302-304` (it was a no-op paired with the old always-hidden rule; decide whether hover should hide/dim the gutter as new deliberate behavior, or simply remove the stale rule — do not leave a dead `display: none` override fighting the new visible styling).

**`renderScript` integration (`ScriptView.tsx:625-638`):** add a new grid column before `.script-line-speaker`:
```tsx
<div
  className={`script-line ...`}
  style={...}
>
  <div className="script-line-gutter">
    <AnnotationGutter glyphs={castGlyphsForSpan(span)} />
  </div>
  <div className="script-line-speaker">...</div>
  <div className="script-line-content">...</div>
</div>
```
**CSS:** change `.script-line { grid-template-columns: 140px 1fr; }` (`ScriptView.css:537-545`) to a three-column grid, e.g. `grid-template-columns: 16px 140px 1fr;`, and add a new `.script-line-gutter` rule (narrow, vertically centered/top-aligned to match the existing `.script-line-speaker`'s `padding-top: 2px`).

**Stage Direction / Performance Cue visual treatment** (also this task's responsibility, since it's the same "how do these spans look inline" concern as the gutter and shares the `render`/`character_id` signal): per design doc §5 line 153, Stage Direction text renders in Geist Mono, slightly smaller, muted gray, no character tint. Add a CSS class (e.g. `.script-span.is-stage-direction`) applied in `renderSpan` (`ScriptView.tsx`, the shared per-span renderer used by both `renderBook` and `renderScript`) when `span.render === false`, and wire the font/color rule into `ScriptView.css`. Performance Cue spans get the same muted/mono treatment (§5 line 165: "Displays in the same Geist Mono / muted visual style inline in the document") — reuse the same CSS class for both; the glyph in the gutter is what distinguishes them, not the inline text styling.

## Steps

1. Build `AnnotationGutter/index.tsx` with the `GutterGlyph[]`/`AnnotationGutterProps` contract above — no Cast- or Booth-specific logic inside the component itself, just glyph rendering.
2. Add `AnnotationGutter.css` (or extend `ScriptView.css` if this repo's convention favors one shared stylesheet per page over per-component ones — check whether other `DirectorsConsole/*Tool/` components use their own `.css` files or import from a shared one before deciding).
3. Add the `castGlyphsForSpan` helper (co-located sensibly — check whether `ScriptView.tsx` already has a "derive visual state from span" helpers section to extend, e.g. near `batchRenderClassName`/`batchHasRenderState`, before adding a new one elsewhere).
4. Wire into `renderBook`'s `book-paragraph-gutter` div and un-hide/restyle the CSS (verify `.book-paragraph`'s display mode; add `display: flex` if needed; remove the now-dead hover override).
5. Add the new gutter column to `renderScript`'s `.script-line` grid + CSS.
6. Add the Stage Direction/Performance Cue inline text styling (`.script-span.is-stage-direction` or equivalent) applied via `span.render === false` in the shared `renderSpan`.
7. Add a data-testid-driven test (`frontend/tests/unit/...`, mirroring wherever `ScriptView.tsx`'s existing tests live) asserting: a span with `render: false, engine_directives: null` shows exactly a `⊘` glyph; a span with `engine_directives: {...}` shows exactly a `⚡` glyph; a normal span shows no glyph; multiple glyph-bearing spans in one paragraph (book mode) stack correctly.
8. Run `npm -C frontend run lint` and `npm -C frontend run test -- --run` (targeted to the changed test files per this repo's memory on vitest memory pressure — do not run the full suite unthrottled).

## Acceptance criteria

- [ ] `AnnotationGutter` component exists with the generic `GutterGlyph[]`/`AnnotationGutterProps` contract (no Cast-specific or Booth-specific types baked into the component itself).
- [ ] Cast mode's "book" view (`renderBook`) shows a ⊘ glyph for every Stage Direction span and a ⚡ glyph for every Performance Cue span, in the previously-dead `book-paragraph-gutter` column, multiple glyphs in one paragraph stacking vertically.
- [ ] Cast mode's "script" view (`renderScript`) shows the same glyphs in a new gutter column alongside `.script-line-speaker`.
- [ ] A normal (non-annotated) span/paragraph shows an empty gutter column with no layout shift when toggled.
- [ ] Stage Direction and Performance Cue spans render in the Geist Mono / muted-gray inline style (no character color tint) per the design doc, in both view modes.
- [ ] `GutterGlyph.onClick` is exposed on the contract and unused (undefined) in this task's own wiring — verified by the component not requiring `onClick` and rendering a non-interactive `<span>` when it's absent.
- [ ] No change to `frontend/src/store/annotations.ts` or `BoothTool/AnnotationsPanel.tsx` (Booth integration is task 009's job, this task only builds the reusable component + wires Cast).
- [ ] `npm -C frontend run lint` and the targeted vitest run are both clean.

## Map links

Part F (component half) in `01-map.md`. Invariant INV-3 (one gutter, not two — this task IS the "build once" step INV-3 requires). Connections section: "F (gutter component) is shared infrastructure for E... and G... Build F once... before either E or G's glyph-rendering pieces."

## Dependencies

Task 005 (needs `ScriptSpan.render`/`ScriptSpan.engine_directives` to exist on the type and be populated by the script-view API response).

## Out of scope

- Booth mode's own glyph wiring (🏴 pin, variation-deviation tick) — task 009, reuses this component, not built here.
- The Cue Editor popover itself and wiring `GutterGlyph.onClick` to open it — task 008.
- Any change to `render`/`engine_directives` values (painting Stage Direction/Performance Cue via `S`/`P` keyboard shortcuts or CastPalette system entries) — not part of this task or this workload's four tasks; this task only *displays* whatever values already exist on a span.
- Booth's margin-pin session-flag feature (`G-pins`, task 011) and the variation-deviation tick glyph mentioned in the design doc's glyph reference table (§13 line 349) — both are future consumers of this component, not built here.
