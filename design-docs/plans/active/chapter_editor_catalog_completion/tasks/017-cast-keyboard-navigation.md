# Task 017 — Cast mode (ScriptView) keyboard navigation, brush-load shortcut, range selection

Status: pending

Risk: multi-file (touches the shared `ScriptView.tsx` — also rendered by the legacy `ChapterEditor`/`EditorTabs` path pending task 019's retirement — plus `CastPalette.tsx` for the brush-load shortcut, plus wherever mode-switch focus-restoration is owned)

## Goal

Wire 016's roving-tabindex hook into `ScriptView.tsx`'s span rendering so Cast's prose surface gets ONE tab-stop for the whole manuscript with Arrow-key navigation inside it (replacing the current bare `<span onClick>` with zero keyboard support). Add `Shift+Arrow` keyboard-driven range selection as the keyboard equivalent of today's mouse drag-select. Add a `C`+`1-9` shortcut to "load a brush" (select a character by number), extending `CastPalette.tsx`'s already-keyboard-capable swatches. Add `aria-live` announcements for brush-load and mode-switch context. Own the console-shell-level (not per-mode) focus-restoration logic for mode switches (see "Focus-restoration ownership" below).

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §10, this is the largest single gap: `ScriptView.tsx` (730 lines, Cast mode's prose renderer) has **zero** keyboard support today — confirmed by grep, no `tabIndex`/`onKeyDown`/`onKeyUp`/`role="application"`/`aria-live` anywhere in the file. The clickable span at `ScriptView.tsx:143-156` is a bare `<span onClick={...}>` — mouse-only. Range/drag-select is native-browser-selection-only (`handleSelection`, `ScriptView.tsx:395-421`, wired via `onMouseUp={handleSelection}` at `ScriptView.tsx:646`) — no keyboard-driven equivalent exists, and since spans aren't focusable today, Shift+Arrow has nothing to operate on. This is a real accessibility gap on the app's primary editing surface, not a nice-to-have.

## Depends on

**016** (`useRovingTabindex` hook) — must be built and unit-tested first (`02-roadmap.md` Workload 7: `016 ──► 017, 018`).

## Current shape (verified)

- **`ScriptView.tsx:143-216`** — the per-span `<span>` wraps the assignable text plus a `span-controls` block containing a `VoiceProfileSelect` (`<select>`, line ~171) and two `<button>` elements (Play, Generate/Rebuild — lines 181-213). These ARE natively focusable/tab-reachable today via normal browser tab order (they're real `<select>`/`<button>` elements) — this task must not break that existing reachability while making the outer span itself keyboard-navigable as a roving-tabindex item. This is the "grid with focusable cell content" wrinkle 016 flagged, not the simpler flat-listbox shape Booth/Revise need (018).
- **`onClick` at `ScriptView.tsx:149-156`** — clicking a span calls `onAssign?.([span.id])` only when `activeCharacterId` is set (a brush is "loaded") and the click isn't part of a text selection. This is the single-span assignment path the keyboard equivalent (Enter/Space on the active span) should call too.
- **`handleSelection` (`ScriptView.tsx:395-421`)** — reads `window.getSelection()` on mouse-up, resolves `start_span_id`/`start_offset`/`end_span_id`/`end_offset` from the DOM range, and stores it as `pendingSelection` (a `ScriptRangeAssignment`), which later feeds a confirmation popover that calls `onAssignRange?.(...)` (`ScriptView.tsx:695-716`). Shift+Arrow's job is to build the same `ScriptRangeAssignment` shape without needing a mouse-driven `window.getSelection()` — i.e. track an anchor span/offset and a focus span/offset as Shift+Arrow moves the roving-tabindex cursor, then feed the SAME `pendingSelection`/popover/`onAssignRange` path the mouse path already uses. Do not build a second, parallel range-assignment mechanism.
- **`CastPalette.tsx:219-231`** — each character swatch row already has `role="button" tabIndex={0} onClick={activateRow} onKeyDown={...Enter/Space...}` — this is the "load a brush" action (selecting a character makes it the active brush/`activeCharacterId`). The base keyboard affordance already exists per-swatch; what's missing is a *global* shortcut (`C` then a digit `1-9`, or held-`C`+digit — implementer's call on exact chord, document whichever is chosen) that programmatically triggers the Nth swatch's `activateRow` without requiring the user to already have tab-focus inside the palette. This is a new global keydown listener mapping `C`+digit to the corresponding swatch's activation — not new swatch-level a11y work (that already exists).
- **`DirectorsConsole/index.tsx:44-51`** (`handleToolClick`) — mode switches call `setActiveToolId(toolId)` with **no focus-management of any kind** — confirmed by reading the full 133-line file. There is no `onModeEnter`/`onModeExit` runtime wiring (matches `01-map.md` Part J / R-C: those type fields in `types.ts` are declared but never called). Today, switching from Cast to Booth (e.g.) unmounts Cast's tree entirely (`ActiveToolBody` swap at line 117); whatever had DOM focus is gone, and focus silently resets to `document.body` (default browser behavior on an unmounted focused element). This is the gap the design doc's "focus-restoration logic when switching modes" requirement targets.
- **Existing aria-live pattern to match** — `BoothTool/index.tsx:304-307` already has a `<div className="sr-only" role="status" aria-live="polite">{announcement}</div>` wired to a local `announcement` state string, used today for "segment-boundary changes only" per its inline comment. This is the in-repo pattern to imitate for Cast's new brush-load/mode-context announcements — don't invent a second aria-live idiom; match this shape (`sr-only` class, `role="status"`, `aria-live="polite"`, a single local announcement-text state updated only at meaningful boundaries, never per-keystroke).

## Focus-restoration ownership (cross-cutting with 018 — read both task files)

The design doc requires focus not to reset to `document.body` on a mode switch (e.g. Cast → Booth). This logic lives at the `DirectorsConsole/index.tsx` shell level, not inside any one mode's component — **this task (017) owns building it**, since it is sequenced before 018 in the roadmap (Workload 7: 016 → 017 → 018) and needs to exist before 018 can verify it doesn't regress Booth/Revise's own focus behavior on the receiving end of a switch. Concretely: `DirectorsConsole`'s `handleToolClick`/`setActiveToolId` (`index.tsx:44-51`) should remember the last-focused element's role/position within the outgoing mode (or, simpler and more robust given each mode unmounts on switch: remember which mode was active and re-focus the incoming mode's own roving-tabindex container's single tab-stop, rather than trying to preserve an exact sub-item across an unmount/remount). Document the exact approach chosen here in this file's "Steps" once implemented, since 018 depends on this contract existing and must not build a second, competing implementation.

## Target shape

1. Wire `useRovingTabindex` (016) into `ScriptView.tsx`'s span list: one tab-stop for the whole prose container (or per-paragraph — implementer's call, informed by whichever grouping already exists in the render, e.g. the `para.span_ids` grouping visible at `ScriptView.tsx:594`), Arrow keys move the active span, Enter/Space on the active span calls the existing `onAssign?.([span.id])` path when a brush is loaded. Preserve the nested `<select>`/button focusability inside each span (per 016's "grid" note) — do not make those unreachable by keyboard.
2. Add Shift+Arrow range building: track an anchor point when Shift is first held during Arrow navigation, extend/shrink the range as Arrow continues, and on Shift-release (or Enter) construct the same `ScriptRangeAssignment` shape `handleSelection` already produces, feeding it into the existing `pendingSelection` → popover → `onAssignRange` path. Do not bypass the popover confirmation step the mouse path already goes through, unless the design doc explicitly says keyboard should skip it (recheck §10 before deciding either way, and document the choice here).
3. Add a global (console-shell or Cast-mode-scoped — implementer's call, but document which) keydown listener for `C` then a digit `1-9` that resolves to the Nth character swatch in `CastPalette.tsx` and calls its existing `activateRow` (do not duplicate swatch activation logic — call the existing function/handler).
4. Add an `aria-live="polite"` `sr-only` region (matching `BoothTool/index.tsx:304-307`'s exact pattern) announcing: brush loaded ("Brush set to {character name}"), and mode-switch context (announced from wherever focus-restoration logic lives, per the ownership note above).
5. Build the mode-switch focus-restoration logic described above, at the `DirectorsConsole` shell level.

## Steps

1. Read `016`'s finished hook contract and `ScriptView.tsx` in full (all 730 lines) before starting — this file already had partial keyboard-adjacent structure (native button/select children) that must not regress.
2. Wire the hook into the span-rendering loop; write/run a unit test confirming exactly one span has `tabIndex={0}` after mount and Arrow keys move it.
3. Wire Enter/Space to the existing `onAssign` call path; verify no double-assignment when a mouse click also happens (shouldn't interact, but check).
4. Implement Shift+Arrow range tracking feeding `pendingSelection`/`onAssignRange`; write a test simulating Shift+ArrowRight sequences and asserting the same range shape `handleSelection` would have produced for an equivalent mouse selection.
5. Implement the `C`+digit global listener; write a test dispatching the key sequence and asserting the corresponding character becomes `activeCharacterId`.
6. Add the aria-live region and announcement triggers; write a test asserting it does NOT fire on every Arrow-key move (only on brush-load and mode-switch boundaries) — matching the "milestone-only" discipline already established elsewhere in this repo for aria-live (see `design-docs/plans/active/parallel-segment-rendering/tasks/009-monitor-milestone-a11y.md` for the sibling pattern: announce boundaries, never per-item).
7. Implement mode-switch focus-restoration in `DirectorsConsole/index.tsx`; write a test switching tools and asserting focus lands somewhere inside the new tool's tree, never on `document.body`.
8. Live-verify: tab into the manuscript, arrow through spans, Shift+Arrow to select a range and confirm the popover appears with the right range, load a brush via `C`+digit and confirm the palette highlights the right character, switch modes via keyboard and confirm focus doesn't vanish.

## Acceptance criteria

- [ ] `ScriptView.tsx`'s span list has exactly one tab-stop; Arrow keys navigate it; nested `<select>`/button children remain individually reachable by keyboard.
- [ ] Enter/Space on the active span performs single-span assignment via the existing `onAssign` path when a brush is loaded (no new assignment code path).
- [ ] Shift+Arrow builds a range and feeds it through the SAME `pendingSelection`/popover/`onAssignRange` path the mouse drag-select already uses — no second range-assignment mechanism.
- [ ] `C`+`1-9` loads the Nth character swatch as the active brush via `CastPalette.tsx`'s existing `activateRow`, not a duplicated activation path.
- [ ] `aria-live="polite"` region present, matching `BoothTool/index.tsx:304-307`'s `sr-only`/`role="status"` shape; fires only on brush-load and mode-switch, never per-keystroke (verified by a test).
- [ ] Mode-switch focus-restoration implemented at the `DirectorsConsole` shell level and documented in this file once built; keyboard focus never lands on `document.body` after a Cast↔Booth (or any) mode switch.
- [ ] No regression to the existing mouse-driven assignment, drag-select, or swatch-click paths (INV-5) — verified live.
- [ ] `./venv/bin/python -m pytest -q` (if any backend surface is touched — expected: none) and `npm -C frontend run test -- --run`, lint, build all clean.

## Map links

Part L in `01-map.md` ("Roving-tabindex composite hook... applied to `ScriptView.tsx`"). Invariant INV-4, INV-5 (no capability regression). Design doc: `design-docs/workflows/chapter-editor-modes.md` §10.

## Dependencies

**016** (shared hook) must be complete first.

## Out of scope

Do not touch `BoothTool/index.tsx` or `ReviseTool/index.tsx`'s existing per-item `tabIndex={0}` pattern — that migration is 018's job, not this task's, even though this task builds the shell-level focus-restoration logic 018 will rely on. Do not remove `ScriptView.tsx`'s per-span `<select>` dropdown — that's task 019's job, gated on confirming the legacy path is dead. Do not build a second aria-live idiom distinct from `BoothTool`'s existing one.
