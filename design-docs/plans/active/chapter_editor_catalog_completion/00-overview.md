# Overview — Chapter Editor Catalog Completion

## The task

Build the remaining Director's Console catalog items specified in `design-docs/workflows/chapter-editor-modes.md` but explicitly deferred by the 2026-07-10 activation pass: Cast mode's brush sizes/variation toggle/Match Voice/Stage Direction+Performance Cue/mutation-batching; Booth's annotation gutter/playback speed/margin pins; Revise's two-way segment split; cross-cutting render-on-mode-exit + On Air indicator; the A11y keyboard model; and retiring the legacy Script/Source-Text tab pair.

## Why now

All design decisions for this system were resolved 2026-06-26 (`chapter-editor-modes.md` §13); the scaffold and base functionality shipped 2026-07-10. What remains is pure execution against an already-agreed design — exactly the kind of work that benefits from being decomposed into a mapped, ordered plan rather than worked ad hoc off a flat TASKS.md bullet list.

## Scope

**In scope:** every unchecked catalog item in `TASKS.md`'s "Chapter editor art-program" section as of 2026-07-10: Cast mode additions (5 items), Booth mode additions (3 items), Revise mode's two-way split, render-on-mode-exit + On Air indicator, killing the legacy Script/Source-Text tab pair + per-span dropdown, and the A11y keyboard model.

**Out of scope:** the "Future / post-v2" items in the same TASKS.md section (Casting Call AI-detection tool slot, Script Supervisor tool slot, persistent flags with notes, external plugin tool slots, dyslexia reading layer, mobile collapse) — these are explicitly not-yet-scheduled per the doc itself, not part of this catalog-completion pass.

## Success criteria

Every item in scope is either built and live-verified, or — where research revealed it's larger/riskier than TASKS.md's flat bullet implied (Stage Direction/Performance Cue, the A11y keyboard model, render-on-mode-exit) — broken into its own sequenced sub-tasks with a clear map linkage, so no single task silently swallows a multi-week scope. No existing capability (the base paint-assignment UI, Booth's karaoke highlight, Revise's inline edit, Write mode) regresses.

## Key sequencing finding (read before touching any task)

**Mutation-batching is not an isolated Cast-mode nicety — it's a prerequisite.** Research confirmed zero batching infrastructure exists anywhere in this codebase (not in the new `CastTool`, not in its predecessor `StudioStage`): every assignment today is one immediate, individually-awaited API call (`useChapterAssignments.ts`'s `handleScriptAssign`/`handleScriptAssignRange`). The brush-size and Match Voice additions both call this same assignment path directly — building them first and rewiring them once batching lands is wasted work. See `01-map.md`'s Connections section for the exact ordering this implies.

## Non-goals worth naming explicitly

- Not fixing the pre-existing, out-of-scope `CastPalette.tsx` HTML-nesting bug (`CharacterRow`'s `<button>` containing `ColorSwatchPicker`'s own `<button>`) flagged but not fixed by the 2026-07-10 activation pass — flag it again if touched incidentally, don't silently fix it as a drive-by in an unrelated task.
- Not deciding whether `dyslexia reading layer` or `mobile collapse` should be pulled forward from post-v2 — those stay where `TASKS.md` put them.
