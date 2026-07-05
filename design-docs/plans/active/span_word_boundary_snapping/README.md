# Plan: Word-boundary snapping for sub-sentence speaker assignment

**Location:** in-repo, `design-docs/plans/active/span_word_boundary_snapping/` (matching this
repo's existing convention).

## What this is — read this first, it corrects two stale docs

`design-docs/plans/proposals/sub_sentence_speaker_assignment.md` and
`design-docs/plans/TASKS.md` (item 012) both describe sub-sentence speaker assignment as an
unbuilt "design draft." **That's stale.** Direct code inspection (2026-07-04) confirmed the
feature is already ~90% built and working:

- `chapter_segments` already **is** the span table — rows are the ownership unit, no separate
  table exists or is needed.
- `app/domain/chapters/operations.py:385` (`_apply_range_assignment`) already surgically splits
  a segment at character offsets and assigns the resulting piece(s) to a speaker — lossless,
  exactly as the design doc specifies.
- Book-mode drag-select in `frontend/src/pages/ChapterEditor/components/ScriptView.tsx:387`
  already calls this end-to-end, persisting immediately via
  `PUT /chapters/{id}/script-view/assignments`.
- Chunk/render-group packing already operates generically on segment rows, so it already forces
  a render-group boundary on any speaker change — needs no changes.

**What's actually missing** (verified by reading the code, not assumed): word-boundary snapping.
Both the frontend selection handler and the backend split function use raw character offsets —
today you can drag-select mid-word and it will split there, violating the design doc's own
"Snapping & hygiene" requirement ("Selection boundaries snap to word boundaries — never split
inside a word"). This plan closes that one real gap, plus fixes the two stale docs.

**Owner decision already made (2026-07-04):** Script mode (click-only, no drag-select) stays as
is for now — Book-mode-only range assignment is acceptable. Not in scope for this plan.

**Also explicitly out of scope, by design-doc note:** undo for an accidental assignment (pairs
with the not-yet-built doc-10 U1 undo-toast work — no undo mechanism exists anywhere in the
chapter editor yet, this plan doesn't add one just for spans).

## Read first

1. `design-docs/plans/proposals/sub_sentence_speaker_assignment.md` — the original design doc
   (being corrected by task 003 in this plan)
2. `01-map.md` in this folder — the parts, connections, and the exact snapping algorithm spec

## Status protocol

Same as every plan in this repo: each task file starts with a `Status:` line and `- [ ]`
checkboxes; whoever executes a task ticks its boxes and updates its status in the same change.
Archive to `design-docs/plans/active/archive/span_word_boundary_snapping/` when all tasks are
complete.

## Execute

Run `/plan-run` pointed at this folder, or execute tasks 001-002 manually (task 003 is already
done — see its file).
