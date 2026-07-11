# Task 020 — Stage Direction / Performance Cue creation UI (S/P shortcuts + CastPalette entries)

Status: pending

Risk: multi-file

## Goal — closes a decomposition gap found in independent sign-off review

Wire the actual user-facing creation path for Stage Direction and Performance Cue: the `S`/`P`
keyboard shortcuts, and "Stage Direction"/"Performance Cue" as clickable system entries in
`CastPalette.tsx` (alongside the existing "Narrator" entry), so a user can actually paint one onto
a segment. **Without this task, the entire Stage Direction/Performance Cue workload (005-008) ships
with no way for any user to create the first one** — the schema (005) can store it, the render
pipeline (006) can skip/consume it, the gutter (007) can display it, and the Cue Editor (008) can
re-edit an existing cue's SSML values, but nothing in tasks 005-008 lets a user actually mark a
segment as a Stage Direction or attach a fresh Performance Cue to it in the first place.

## Why this task exists (and why it wasn't caught earlier)

Task 005's own "Out of scope" section explicitly names this exact gap: *"Wiring the `S`/`P`
keyboard shortcuts in `CastTool`, and adding 'Stage Direction'/'Performance Cue' as clickable
system entries in `CastPalette.tsx`... is not one of the four tasks in this workload and should be
tracked separately if not already covered by another task in this plan."* It wasn't — task 017
(Cast keyboard navigation) only covers the `C`+digit brush-load shortcut and Shift+Arrow range
selection, not `S`/`P`; tasks 002-004 (brush size, Match Voice, variation) don't touch this either.
This task is that missing "separately tracked" piece.

## Exact files

- `frontend/src/pages/Book/studio/CastPalette.tsx` — the existing "Narrator (default)" pinned
  system entry (lines ~507-542 per task 005's citation) is the pattern to imitate for two new
  pinned/system entries: "Stage Direction" and "Performance Cue."
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` — where the
  active "brush" (currently a `selectedCharacterId`/`selectedProfileName` pair, per prior tasks in
  this plan) is tracked and where a keyboard listener for `S`/`P` should live, consistent with
  wherever task 017 adds its `C`+digit listener (read that task once it exists/lands, to add this
  in the same place rather than a second keydown listener).
- `frontend/src/types/index.ts` — the `STAGE_DIRECTION_CHARACTER_ID` sentinel constant task 005
  exports; this task is its first real consumer.

## Current shape (verified against task 005, which this task depends on)

Task 005 defines and exports `STAGE_DIRECTION_CHARACTER_ID = "_stage_direction"` but explicitly
does not wire anything to *use* it when painting. `CastPalette.tsx`'s existing Narrator entry
(cited by task 005 at lines ~507-542) is a pinned, non-deletable, always-first row with its own
selection/brush-load behavior — the closest existing pattern for a new pinned system entry that
isn't a real character.

## Target shape

1. **Two new pinned CastPalette entries**, above or alongside the existing Narrator row:
   "Stage Direction" (loads a brush that, when painting a span, calls the assignment path with
   `character_id: STAGE_DIRECTION_CHARACTER_ID, render: false, engine_directives: null`) and
   "Performance Cue" (loads a brush that, when painting a span, opens task 008's Cue Editor popover
   immediately — a Performance Cue is never painted "blank," it always carries at least one SSML
   value or a description, per the design doc's Cue Editor being the actual creation surface).
2. **`S` and `P` keyboard shortcuts** load these two brushes respectively, following the exact
   pattern task 017 establishes for `C`+digit (read task 017's actual implementation once it
   exists before building this, so there's one keydown-handling convention in Cast mode, not two).
3. **Painting with the Stage Direction brush** goes through the existing assignment write path
   (task 001's mutation-batching collector, once it exists) exactly like a normal character
   assignment — `render: false` is just another field on the same `enqueueAssign`/`enqueueRangeAssign`
   call shape task 001 defines, not a new write path.
4. **Painting with the Performance Cue brush** is different in kind: it doesn't assign a "speaker"
   at all (a Performance Cue attaches to whatever character is already assigned, or to Narrator by
   default, per the design doc's "companion annotation, not a replacement speaker" rule) — clicking
   a span with this brush active should open task 008's Cue Editor directly, and the Cue Editor's
   own save action is what actually writes `engine_directives` (via `PUT /segments/{id}` or the
   bulk-assignment path, whichever task 008 specifies) — this task only needs to trigger that
   popover open, not duplicate task 008's save logic.

## Steps

1. Confirm task 005 has landed (or at minimum its target shape is stable) before starting — this
   task's brush-load logic writes exactly the fields task 005 defines.
2. Confirm task 008 (Cue Editor) exists or is stable enough to know its popover's trigger contract
   (e.g. does it expose an `openCueEditor(spanId)` function/prop this task can call?) — if task 008
   hasn't landed yet, coordinate scope: this task can still build the Stage Direction half
   independently, and stub the Performance Cue brush's click handler with a clear TODO pointing at
   task 008's eventual trigger contract, rather than blocking entirely.
3. Add the two pinned CastPalette entries, following the Narrator row's existing pattern exactly
   (pinned position, non-deletable, selection/highlight behavior).
4. Add the `S`/`P` keyboard shortcuts, reusing whatever keydown-listener location task 017 already
   established for `C`+digit.
5. Wire Stage Direction painting through the existing assignment write path with the three fields
   above.
6. Wire Performance Cue painting to open task 008's Cue Editor popover on the clicked/dragged span.
7. Live-verify: press `S`, click a sentence, confirm it visually renders as Stage Direction (Geist
   Mono, muted, gutter glyph per task 007) and does NOT get queued for audio synthesis on next
   render (task 006). Press `P`, click a sentence, confirm the Cue Editor opens and a saved cue
   shows the ⚡ gutter glyph.

## Acceptance criteria

- [ ] "Stage Direction" and "Performance Cue" appear as pinned CastPalette entries, matching the
      Narrator row's existing visual/interaction pattern.
- [ ] `S` and `P` keyboard shortcuts load the respective brush, consistent with task 017's shortcut
      convention (one keydown-handling mechanism in Cast mode, not two).
- [ ] Painting a span with the Stage Direction brush writes `character_id: "_stage_direction"`,
      `render: false` through the existing (task 001) assignment path — verified live, segment
      does not render as audio on next chapter render (task 006).
- [ ] Painting/clicking with the Performance Cue brush opens task 008's Cue Editor on the target
      span; saving a cue there is reflected as the ⚡ glyph (task 007) on that segment.
- [ ] `npm -C frontend run test -- --run`, lint, build clean. Light/dark verified.

## Map links

Part E (creation-UI half, closing R-A's gap) in `01-map.md`. Depends on Parts A (mutation-batching),
and the schema/render-pipeline/gutter/cue-editor parts (tasks 005-008).

## Dependencies

Hard: task 005 (schema/sentinel constant). Soft: task 001 (mutation-batching, for the write path),
task 007 (gutter, for visual confirmation), task 008 (Cue Editor, for the Performance Cue trigger —
can stub if not yet landed, per Steps). Should land after task 017 (keyboard shortcuts) establishes
the Cast-mode keydown convention this task reuses, though not a hard blocker if 017 is behind
schedule — in that case, add a standalone keydown listener now and note it should be merged into
017's mechanism once that lands.

## Out of scope

Redesigning the Cue Editor itself (task 008's job) or the render-pipeline skip logic (task 006's
job) — this task only wires the creation entry points (palette + keyboard) that trigger those
already-planned pieces.
