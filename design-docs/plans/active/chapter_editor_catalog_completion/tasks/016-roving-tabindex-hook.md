# Task 016 — Shared roving-tabindex composite-widget hook

Status: pending

Risk: quality-sensitive (a bug here affects three rendering surfaces at once — Cast's `ScriptView.tsx`, Booth's segment list, Revise's segment list — since 017 and 018 both build on top of this hook rather than reimplementing it)

## Goal

Build ONE reusable hook (`useRovingTabindex.ts` or equivalent) implementing the standard WAI-ARIA APG "roving tabindex" composite-widget pattern: a single `tabIndex={0}` on the container (or on whichever item currently holds the "active" slot, per the pattern's own convention), `tabIndex={-1}` on every other item, Arrow-key navigation moving the active item and updating both the DOM focus and the `tabIndex` values in lockstep, and Home/End jumping to the first/last item. This is a standalone, dependency-free hook — no dependency on 017 or 018, and no dependency on any specific surface's markup.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §10 ("Accessibility — a requirement, not a lens"), the manuscript/list surfaces need ONE tab-stop for the whole composite widget with Arrow-key navigation inside it — not one tab-stop per item. Per `01-map.md`'s **INV-4** ("Roving tabindex, never per-item tab-stops... replace, don't add alongside") and **R-B** ("removing the per-item `tabIndex={0}` pattern from two already-shipped modes is itself a real, testable regression risk — budget for full re-verification"), this hook is the single piece of shared infrastructure three surfaces will depend on. A bug fixed once here is fixed on all three surfaces; a bug shipped here regresses all three. This is why 016 is scoped as its own build-and-unit-test-in-isolation task before either consuming task (017, 018) starts wiring it into real markup — see `02-roadmap.md`'s Workload 7 and the map's Connections section ("L touches three rendering surfaces... build the shared hook first").

## Current shape (verified)

No roving-tabindex infrastructure exists anywhere in the frontend today. The two surfaces that DO have some keyboard support use the anti-pattern this hook must replace, not extend:

- **`frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx:271-279`** — each segment `<div>` gets `role="button" tabIndex={0}` plus an `onKeyDown` handling Enter/Space to call `seekToSegment(seg.id)`. This is a per-item tab-stop (N tab-stops for N segments) — exactly the pattern INV-4 requires replacing.
- **`frontend/src/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/index.tsx:296-299`** — same shape: `role="button" tabIndex={isReadOnly ? -1 : 0}` with `onKeyDown={handleTextareaKeyDown}` per segment.
- **`frontend/src/pages/Book/studio/CastPalette.tsx:81-83` (tier header) and `:219-222` (per-swatch row)** — already uses `role="button" tabIndex={0} onKeyDown` for Enter/Space activation, but these are a small, fixed number of independent controls (tier headers, character swatches), not a many-item composite list — this existing pattern is NOT itself a target for replacement (it's not "N tab-stops for N segments" territory), and is a useful reference for the Enter/Space-activation idiom this hook should also support per-item.
- **`frontend/src/pages/ChapterEditor/components/ScriptView.tsx`** — zero keyboard support on the prose surface today (no `tabIndex`, `onKeyDown`, or `role` on the per-span `<span>` at lines 143-216). Not this task's concern to wire up (that's 017), but worth knowing this hook's contract must also work for a surface with NO existing keyboard affordance at all, not just surfaces migrating off an existing one.
- **`frontend/src/pages/ChapterEditor/components/DirectorsConsole/index.tsx`** — the outer tool-switcher rail already uses a correct, small-scale pattern (`role="tablist"` of real `<button role="tab">` elements, `handleToolClick`) — native buttons, not a roving-tabindex list, and out of scope for this hook (too few items to need a composite pattern; a11y here is standard tab-order).

## Target shape

A hook with an interface roughly like:

```ts
interface UseRovingTabindexOptions {
  itemCount: number;
  orientation?: 'vertical' | 'horizontal' | 'both'; // ScriptView is prose-flow (mixed), Booth/Revise are vertical lists
  onActivate?: (index: number) => void;   // Enter/Space
  initialIndex?: number;
  loop?: boolean; // whether Home/End-adjacent Arrow wraps
}

interface UseRovingTabindexResult {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  getItemProps: (index: number) => {
    tabIndex: 0 | -1;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onFocus: () => void; // keeps activeIndex in sync if focus moves via mouse/programmatically
    ref: (el: HTMLElement | null) => void;
  };
  containerProps: {
    role?: string; // caller supplies the correct composite role (listbox/grid/application) per surface
  };
}
```

Exact shape is the implementer's call — the contract that matters is: (1) exactly one element in the set has `tabIndex={0}` at any time, all others have `tabIndex={-1}`; (2) ArrowUp/ArrowDown (and Left/Right if `orientation` includes horizontal) move the active item and call `.focus()` on the new item's DOM node, not just update state; (3) Home/End jump to first/last; (4) Enter/Space call `onActivate` for the active item, matching the existing Enter/Space idiom already used in CastPalette/Booth/Revise so 018's migration doesn't change activation semantics, only focus-management internals; (5) the hook must tolerate items whose DOM refs aren't yet mounted (list re-renders) without throwing.

**Known wrinkle to flag, not solve, in this task:** ScriptView's spans (017's target) are not plain content — each span already contains its own naturally-focusable children (a `<select>` via `VoiceProfileSelect` and two `<button>` elements, `ScriptView.tsx:170-213`). A generic roving-tabindex "listbox" pattern assumes item = a leaf; here item = a container with its own focusable descendants. Design the hook so `getItemProps`/`containerProps` don't hard-code a specific ARIA role (leave role selection to the consumer) — 017 will need to decide (per WAI-ARIA APG's "grid" composite pattern, which explicitly supports focusable widgets inside cells) whether ScriptView's role should be `grid`/`row`/`gridcell` rather than `listbox`/`option`, while Booth/Revise (plain-content items, no nested interactive children) can use the simpler `listbox`/`option` shape. Document this as an explicit note in the hook's file-level comment so 017's implementer isn't surprised.

## Steps

1. Create the hook file (e.g. `frontend/src/hooks/useRovingTabindex.ts` — check existing hook conventions in `frontend/src/hooks/` for placement and naming before choosing the final path).
2. Implement per the WAI-ARIA APG roving-tabindex reference pattern (well-established, not something to invent from scratch — implement the standard shape, don't design a new one).
3. Support both a simple "flat list" mode (Booth/Revise's shape: N equal-weight items in a vertical list) and leave room for 017's grid-like variant (don't build the grid variant here — just don't paint the API into a corner that makes it impossible later).
4. Write unit tests exercising: initial tab-stop placement, Arrow-key movement (up/down at minimum), Home/End, wraparound behavior (or lack thereof) at list boundaries, Enter/Space activation, and focus staying in sync when `setActiveIndex` is called programmatically (e.g. by a parent responding to a mouse click elsewhere in the list).
5. No wiring into ScriptView/Booth/Revise in this task — that's 017 and 018.

## Acceptance criteria

- [ ] Hook implemented, standalone, no imports from `ScriptView.tsx`, `BoothTool/`, or `ReviseTool/`.
- [ ] Exactly one tab-stop (`tabIndex={0}`) in the managed set at any time; verified by a unit test asserting the full `tabIndex` array shape after various key sequences.
- [ ] Arrow-key navigation moves both the reported `activeIndex` and calls `.focus()` on the corresponding DOM node (test via `ref` callbacks and jsdom focus tracking).
- [ ] Home/End supported.
- [ ] Enter/Space calls `onActivate` for the currently active item only.
- [ ] Unit tests cover boundary behavior (pressing Down at the last item, Up at the first item) with an explicit, documented choice on whether it wraps or clamps.
- [ ] `npm -C frontend run test -- --run` and `npm -C frontend run lint` clean.

## Map links

Part L in `01-map.md` ("Roving-tabindex composite hook"). Invariant INV-4. Risk R-B (referenced, not directly incurred by this task — 016 is pure addition, no existing behavior touched; R-B lands on 018).

## Dependencies

None — this is the Workload 7 prerequisite; tasks 017 and 018 both depend on this, not the other way around (`02-roadmap.md`'s Workload 7).

## Out of scope

Do not wire this hook into `ScriptView.tsx` (017), `BoothTool/index.tsx`, or `ReviseTool/index.tsx` (018) in this task. Do not build the `C`+`1-9` brush-load shortcut, Shift+Arrow range selection, aria-live announcements, or mode-switch focus restoration — those belong to 017/018 per the ownership split noted in their task files.
