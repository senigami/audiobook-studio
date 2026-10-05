# Task 018 — Migrate Booth and Revise off per-item tabIndex to roving-tabindex

Status: pending

Risk: multi-file, quality-sensitive (replaces existing, shipped, working keyboard behavior in two already-live modes — a real, testable regression risk per `01-map.md`'s **R-B**, not a pure addition; budget for full re-verification of both surfaces' keyboard interaction, not just wiring in the new hook)

## Goal

Replace `BoothTool/index.tsx`'s and `ReviseTool/index.tsx`'s existing per-item `tabIndex={0}`/`onKeyDown` pattern (one tab-stop per segment — the "N tab-stops for N items" anti-pattern) with 016's roving-tabindex hook instead: ONE tab-stop for each surface's segment list, Arrow keys navigating within it. This is a **replacement** of shipped behavior, not an addition — per **INV-4** ("replace, don't add alongside"), the old per-item pattern must not remain in place after this task, on either surface.

## Why this matters

Per `01-map.md`'s **R-B**: "The A11y keyboard model (L) replaces existing behavior in Booth/Revise, not just adds to Cast. Removing the per-item `tabIndex={0}` pattern from two already-shipped modes is itself a real, testable regression risk — budget for full re-verification of Booth/Revise keyboard interaction, not just Cast's new composite widget." Both surfaces have working, tested keyboard support today (Enter/Space activates a segment) — this task must preserve that exact activation semantic while changing the underlying focus-management model, and must not silently break Booth's karaoke-highlight/click-to-seek or Revise's inline-edit-on-click behavior, both of which are explicitly protected by **INV-5** ("No capability regression... Booth's karaoke highlight + regenerate-segment, Revise's inline edit... must all continue working exactly as today").

## Depends on

**016** (`useRovingTabindex` hook) — must be built and unit-tested first (`02-roadmap.md` Workload 7: `016 ──► 017, 018`).

**Focus-restoration ownership note:** task **017** owns building the console-shell-level (`DirectorsConsole/index.tsx`) mode-switch focus-restoration logic (documented in `017-cast-keyboard-navigation.md`'s "Focus-restoration ownership" section). This task (018) does NOT build a second, competing focus-restoration mechanism — when a mode switch lands the user in Booth or Revise, this task's job is only to make sure the roving-tabindex container it just migrated to is a valid, sane landing target for 017's restoration logic (i.e., expose whatever single tab-stop 017's shell-level code needs to find and focus). If 017 hasn't landed yet when this task starts, coordinate directly rather than inventing a parallel mechanism — read 017's file for its exact chosen approach before writing any focus-restoration code here.

## Current shape (verified)

- **`BoothTool/index.tsx:266-289`** — each segment `<div>` (one per rendered segment in the chapter) has `role="button" tabIndex={0} onClick={() => seekToSegment(seg.id)} onKeyDown={...Enter/Space calls seekToSegment...}`, plus `aria-current={isActive ? 'true' : undefined}` and an `onAnimationEnd` handler that clears a pulse-highlight class. This is the per-item tab-stop pattern to replace. **Adjacent existing infrastructure to preserve exactly:** an `AnnotationsPanel` side-drawer (rendered conditionally via `showAnnotations`, lines ~294-301) that takes `activeSegmentId`/`onSeekToSegment`/`groupNumberBySegmentId` — this task must not change `seekToSegment`'s call contract, since the annotations panel and the karaoke-highlight/pulse-highlight machinery both key off it. There is ALSO already an `aria-live="polite"` `sr-only` region at lines 304-307 (`<div className="sr-only" role="status" aria-live="polite">{announcement}</div>`) driven by a local `announcement` state — described inline as "segment-boundary changes only." Preserve this region and its existing announcement triggers; adding roving-tabindex navigation must not silently repurpose or duplicate it (a navigation-move announcement, if added, should not fire per-arrow-key any more than the existing one fires per-segment-progress-tick — match the existing "boundary only" discipline).
- **`ReviseTool/index.tsx:296-299`** — each segment gets `onKeyDown={handleSegmentKeyDown}`, `role="button"`, `tabIndex={isReadOnly ? -1 : 0}`. Note the existing `isReadOnly` conditional — this is a real nuance to preserve: read-only segments are already excluded from the tab chain today (`tabIndex={-1}` when read-only). The roving-tabindex migration must preserve this exclusion (a read-only segment should not become the roving-tabindex "active" stop, or if it can receive focus for Arrow-navigation purposes, Enter/Space must still not trigger inline-edit on it — check `handleSegmentKeyDown`'s and the surrounding component's exact read-only gating logic before changing anything). There is also a comment at `ReviseTool/index.tsx:189` noting "A `role=\"button\"` div does not synthesize clicks from Enter/Space the [...]" — read the surrounding context fully; it documents a real browser quirk this migration must not reintroduce or silently rely on differently.
- **Both surfaces' segments are plain content containers** (text/highlight state, no nested focusable children) — unlike Cast's spans (017's target, which contain a `<select>` and two `<button>`s per item), Booth and Revise's segments are the simpler "flat list of equal-weight items" shape 016's hook should handle most directly (see 016's task file: the `listbox`/`option`-style variant, not the `grid` variant ScriptView needs).

## Target shape

1. In `BoothTool/index.tsx`: replace the per-segment `role="button" tabIndex={0} onKeyDown={...}` block with 016's hook — the segment LIST container gets the single tab-stop management, each segment's `getItemProps(index)` supplies its `tabIndex`/`onKeyDown`/`ref`, and `onActivate` calls the existing `seekToSegment(seg.id)` (same call, now driven by the hook's Enter/Space handling instead of a hand-rolled per-item one). Preserve `aria-current`, the pulse-highlight `onAnimationEnd` handler, and the existing `aria-live` region exactly as-is.
2. In `ReviseTool/index.tsx`: same migration, additionally respecting the `isReadOnly` exclusion — read-only segments should not become an Arrow-navigable stop that then allows Enter/Space to open an edit it shouldn't (confirm exact desired behavior: does Arrow-navigation skip read-only segments entirely, or land on them but block Enter/Space? Pick whichever matches current de-facto behavior — read-only segments are simply excluded from the tab chain today, so the least-surprising choice is to exclude them from Arrow-navigation too, i.e. the hook's flat list should be built from only the assignable/editable segment subset, not literally the raw array index. Document the choice made.).
3. Do not add a second `aria-live` region to Booth — reuse/extend the existing one if any navigation-related announcement is warranted at all (recommend: none needed here, since Arrow-navigation-within-a-list is a standard, expected screen-reader-navigable interaction that doesn't need an extra spoken announcement beyond the browser's own focus-change reporting; only add one if manual testing reveals a real gap).
4. Confirm, live, that this migration composes correctly with 017's mode-switch focus-restoration landing a user in Booth/Revise's newly-single tab-stop.

## Steps

1. Read 016's finished hook and both files (`BoothTool/index.tsx` full, `ReviseTool/index.tsx` full, including the line-189 comment's surrounding context) before changing anything.
2. Migrate `BoothTool/index.tsx` first (simpler — no read-only exclusion nuance); write/run a test confirming exactly one tab-stop in the segment list, Arrow keys move it, Enter/Space still calls `seekToSegment`, karaoke/pulse-highlight and the annotations panel still work.
3. Stash the change and re-run Booth's existing keyboard-interaction tests against pre-migration code first if any exist (R1 revert-check discipline per `design-docs/specs/testing-standards.md`) to confirm they'd fail meaningfully if the migration were skipped/reverted — this establishes a real regression baseline before trusting the new tests.
4. Migrate `ReviseTool/index.tsx`, explicitly handling the `isReadOnly` case; write a test confirming read-only segments are excluded from the Arrow-navigable set (or, if a different choice is made, whatever the chosen behavior is) and that inline-edit-on-activate still works identically for editable segments.
5. Full manual re-verification pass on both surfaces per R-B's explicit instruction: tab in, arrow through every segment, confirm Enter/Space activation, confirm karaoke highlight/click-to-seek (Booth) and inline-edit-on-click (Revise) are unaffected by mouse interaction too (not just keyboard) — a focus-management change can have surprising side effects on click handlers if refs/state are shared carelessly.
6. Confirm no second `aria-live` region was introduced in Booth; confirm the existing one's announcement triggers are unchanged.

## Acceptance criteria

- [ ] `BoothTool/index.tsx` and `ReviseTool/index.tsx` each have exactly one tab-stop in their segment list; the old per-item `tabIndex={0}` (`BoothTool/index.tsx:271-272`, `ReviseTool/index.tsx:298-299`) pattern is gone, not left alongside the new one (INV-4).
- [ ] Enter/Space on the active segment performs the exact same action as today (`seekToSegment` in Booth, inline-edit-open in Revise) — verified by tests that would have failed on pre-migration code for the wrong reason if the migration were incomplete (R1 revert-check).
- [ ] Revise's `isReadOnly` exclusion is preserved in some explicit, documented form (excluded from Arrow-navigation, or reachable-but-inert on Enter/Space — pick one, document which).
- [ ] Booth's karaoke highlight, pulse-highlight (`onAnimationEnd`), click-to-seek, and `AnnotationsPanel` wiring (`activeSegmentId`/`onSeekToSegment`/`groupNumberBySegmentId`) all verified unchanged, live.
- [ ] Revise's inline-edit-on-click verified unchanged, live.
- [ ] Booth's existing `aria-live` region (`BoothTool/index.tsx:304-307`) preserved exactly; no second aria-live region introduced.
- [ ] Composes correctly with 017's mode-switch focus-restoration (manual check: switch into Booth/Revise via keyboard from another mode, confirm focus lands on a sane single tab-stop, not `document.body`).
- [ ] `./venv/bin/python -m pytest -q` (expected: no backend surface touched) and `npm -C frontend run test -- --run`, lint, build all clean.

## Map links

Part L in `01-map.md` ("REPLACING Booth/Revise's existing non-scalable per-item `tabIndex={0}` pattern"). Invariants INV-4, INV-5. Risk R-B.

## Dependencies

**016** (shared hook) must be complete first. Coordinates with **017** on focus-restoration ownership (017 owns the shell-level logic; read 017's file for the chosen approach before writing anything here).

## Out of scope

Do not touch `ScriptView.tsx` (that's 017). Do not build a second mode-switch focus-restoration mechanism — 017 owns that at the `DirectorsConsole` shell level. Do not change `seekToSegment`'s signature/contract, the `AnnotationsPanel` props contract, or Revise's inline-edit trigger conditions beyond what's strictly required to move from per-item to roving-tabindex focus management.
