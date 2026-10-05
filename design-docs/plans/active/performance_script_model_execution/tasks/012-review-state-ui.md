# Task 012 — Review-state UI (AI-suggested vs. human-confirmed)

Status: pending

Risk: multi-file (shares `ScriptView.tsx` real estate with sub-sentence assignment and the sibling
`chapter_editor_catalog_completion` plan's Cast mode work; must extend the sibling plan's shared
gutter component rather than inventing a second visual system for "AI suggested, needs review")

## Goal

Build the frontend surface that makes `INV-3` ("AI suggestions are never silently auto-applied")
actually enforceable by a human: a visual distinction for segments/characters carrying
`ai_suggested=true` / `needs_review=true` (AI-suggested, pending confirmation), a
confirm/reject/edit action per suggestion, and a distinct "settled" visual treatment for
`locked=true` records so a reviewer can tell at a glance which suggestions still need attention and
which are done and should not be re-suggested by a later reconciliation pass.

## Why this matters

Per `01-map.md`'s big-picture flow, this task (Part E) is the step between the AI extraction
pipeline (Parts C, Workload 4) and canonical rendering (Part B): *"Review-state UI (Part E) — human
confirms/edits AI suggestions."* Without it, `needs_review`/`ai_suggested`/`locked` are just inert
columns — `INV-3` is a database convention, not an actual safeguard, until a human has somewhere to
act on them. `02-roadmap.md`'s Workload 6 note is explicit that this task has value independent of
the AI pipeline being greenlit: *"If the owner declines the AI pipeline, Workload 6 (review UI)
still has value for manually-entered performance data ... and should be re-scoped to that, not
dropped entirely."*

`01-map.md`'s Connections section calls out the coordination point this task must respect: *"E ↔
chapter_editor_catalog_completion's Cue Editor (that plan's task 008): both write to segment-level
performance/annotation data ... this is the single most important cross-plan coordination point in
this entire multi-plan effort."* That sibling plan's task 007 (`AnnotationGutter`) already built —
or, if sequenced first per this task's Dependencies, will already have built — exactly the kind of
"small glyph in a left-edge gutter, click to open a popover" pattern this task needs for
AI-suggested/needs-review segments. Building a second, parallel gutter/glyph system for review state
would be exactly the kind of avoidable duplication `01-map.md`'s R-A calls out for the
Stage-Direction/Performance-Cue schema overlap — the same reasoning applies here to the *UI*, not
just the schema. **This task should reuse `AnnotationGutter`, not reinvent it, unless a concrete
technical reason blocks it** (see Target shape — none was found during this task's drafting).

## Exact files

- Edit: `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` — extend whatever
  glyph-computation helper the sibling plan's task 007 added (`castGlyphsForSpan` or equivalent,
  documented in that task's file as living near `ScriptView.tsx`'s "derive visual state from span"
  helpers, e.g. next to `batchRenderClassName`/`batchHasRenderState`) with a second helper for
  review-state glyphs, and merge its output into the same `glyphs` array passed to
  `<AnnotationGutter>` in both `renderBook` and `renderScript`.
- New: `frontend/src/pages/ChapterEditor/components/DirectorsConsole/AnnotationGutter/ReviewPopover.tsx`
  — the confirm/reject/edit popover, co-located with `AnnotationGutter` and `CueEditor.tsx` since
  it's the same "gutter glyph click → small popover" pattern (follow `CueEditor.tsx`'s conventions:
  `useFocusTrap`, `getBoundingClientRect()`-based anchoring, Escape-to-cancel — do not write new
  modal-accessibility logic).
- Edit: `frontend/src/types/index.ts` — `ScriptSpan` gains the review fields once task 001/009 ship
  them over the wire (`needs_review`, `ai_suggested`, `locked`, `review_reasons`,
  `speaker_confidence`, `speaker_basis`, `speaker_evidence`, `performance_data`) — confirm exact
  field names against 001's actual migration and 009's actual API response before typing this; do
  not guess ahead of the real contract.
- Edit: `frontend/src/api/index.ts` — new client functions for whatever confirm/reject/edit
  endpoints task 009 exposes (names TBD — see Dependencies).
- Edit (secondary, best-effort — see Target shape §5): `frontend/src/pages/Book/studio/CastPalette.tsx`
  (664 lines as of this writing; the character roster/palette Cast mode already renders) — add a
  small review badge per character carrying `needs_review`/`ai_suggested`, reusing `ReviewPopover`'s
  confirm/reject/edit content rather than building a third UI for the same three actions.

## Current shape (verified 2026-07-10)

- **Neither this plan's nor the sibling plan's dependencies exist in the codebase yet.**
  `grep -n "AnnotationGutter\|castGlyphsForSpan\|GutterGlyph" frontend/src/pages/ChapterEditor/components/ScriptView.tsx`
  returns nothing, and
  `frontend/src/pages/ChapterEditor/components/DirectorsConsole/AnnotationGutter/` does not exist.
  Everything in this task's Target shape that references `AnnotationGutter`/`GutterGlyph`/
  `castGlyphsForSpan` is written against the *sibling plan's task 007 file*
  (`chapter_editor_catalog_completion/tasks/007-shared-gutter-component.md`), not against live code —
  verify the actual shipped contract matches before wiring, in case it drifted during 007's
  implementation.
- `chapter_segments`'s live DDL (`app/db/core.py:219-246`, verified 2026-07-10) has none of the
  review columns yet: `id, chapter_id, segment_order, text_content, sanitized_text, character_id,
  speaker_profile_name, audio_file_path, audio_status, audio_generated_at`. Task 001 (this plan,
  Workload 1) adds `performance_data`, `speaker_confidence`, `speaker_basis`, `speaker_evidence`,
  `needs_review`, `review_reasons`, `locked`, `ai_suggested` (per `01-map.md` Part A) as flat,
  additive, nullable columns — **not** nested under a `review: {...}` sub-object the way the
  proposal doc's example JSON envelope shows (that nesting is the AI pipeline's structured-output
  shape in transit, not the DB column shape). This task cannot be implemented until 001 ships those
  columns and 009 exposes them (plus confirm/reject/edit mutations) over HTTP.
- `characters` carries the same review-flag set per `01-map.md` Part A ("plus the same review-flag
  set" as `chapter_segments`), so a character can independently be `needs_review`/`ai_suggested`/
  `locked` — this is a second, smaller UI surface (see Target shape §5), not covered by the
  segment-level gutter since characters aren't rendered inline in `ScriptView.tsx`.
- The proposal spec's human-review trigger rules (`proposals/performance_script_model/
  02-character-profiles-and-extraction-spec.md` §8) are the source for what `review_reasons` will
  actually contain: a segment is flagged when "speaker confidence is below 0.85, multiple speakers
  are possible, speaker is unknown, performance direction is unusually strong, a vocalization or SFX
  is inferred, or source attribution is ambiguous"; a character is flagged when "age is inferred,
  accent is inferred, major voice guidance is inferred, multiple aliases may refer to the same
  person, or character identity may duplicate another character." The popover's reason display (see
  Target shape §3) should render these strings as-is (they're already human-readable), not attempt
  to re-derive or re-word them.
- The sibling plan's task 007 already reserves exactly the extension point this task needs:
  `GutterGlyph { segmentId: string; glyph: string; tooltip?: string; onClick?: () => void }` — a
  literal glyph *character* (not an icon component) plus an optional click handler that opens a
  popover, which is precisely how task 008 (Cue Editor) wires the `⚡` glyph. That precedent is the
  basis for reusing the same component here rather than building a parallel one (see Target shape
  §1 for why no contract change is needed).

## Target shape

1. **Reuse `AnnotationGutter` unmodified — no contract change needed.** `GutterGlyph`'s `glyph`
   field is a literal character, and the existing `⊘`/`⚡`/(Booth's future `🏴`) glyphs are already
   distinguished by shape, not color. Two new literal glyphs are enough to add a review-state
   signal without touching `AnnotationGutter`'s or `GutterGlyph`'s contract:
   - **Pending review** (`needs_review === true && locked !== true`, which in practice means
     `ai_suggested === true` too, since `needs_review` is only ever set by the AI pipeline per
     `02-character-profiles-and-extraction-spec.md` §8): glyph `❔`, `tooltip: 'AI-suggested — needs
     review'`, `onClick` opens `ReviewPopover` anchored to the glyph (same pattern as `⚡` → Cue
     Editor).
   - **Settled** (`locked === true`): glyph `✓`, `tooltip: 'AI-suggested — confirmed'`. Whether this
     glyph carries an `onClick` at all is an open question (see §4) — if 009's API doesn't expose an
     "unlock" action, render it as a plain non-interactive `<span>` (the sibling contract already
     supports this: `AnnotationGutter` renders a `<span>` when `onClick` is absent).
   - **No glyph** when a segment has never been touched by the AI pipeline
     (`ai_suggested !== true && needs_review !== true && locked !== true`) — this is the common case
     for every segment before Workload 4 (the AI pipeline) runs, and for any segment whose only
     `render`/`engine_directives` state comes from the sibling plan's manually-authored Cue Editor,
     which is an entirely separate provenance from this plan's `ai_suggested`.
   - **If a segment somehow qualifies for more than one glyph** (e.g. it's also a Performance Cue
     span with `engine_directives != null`), `AnnotationGutter` already stacks multiple glyphs
     vertically per row (per task 007's contract) — no special-casing needed here, just include
     both glyphs in the same `glyphs` array for that row.
   - **Only extend `GutterGlyph` with an additive `className`/`variant` field if color-coding beyond
     glyph shape turns out to be a real design requirement** (e.g. amber for pending vs. muted green
     for settled) discovered during implementation — and if the sibling plan's task 007 has already
     landed with other consumers (Booth's pin, task 009 there) by that point, treat that as a shared
     contract change requiring coordination with whoever owns that plan's execution, not a
     unilateral edit.

2. **Merge review glyphs into the same per-row `glyphs` array `castGlyphsForSpan` (or its
   successor) produces.** Add a small parallel helper, e.g.:
   ```ts
   function reviewGlyphForSpan(span: ScriptSpan, onOpenReview?: (spanId: string) => void): GutterGlyph[] {
     if (span.locked) {
       return [{ segmentId: span.id, glyph: '✓', tooltip: 'AI-suggested — confirmed' }];
     }
     if (span.needs_review) {
       return [{ segmentId: span.id, glyph: '❔', tooltip: 'AI-suggested — needs review', onClick: () => onOpenReview?.(span.id) }];
     }
     return [];
   }
   ```
   and combine it with the sibling plan's Stage Direction/Cue helper at both `renderBook`'s
   `book-paragraph-gutter` and `renderScript`'s `.script-line-gutter` call sites (both integration
   points task 007 documents exactly), e.g.
   `glyphs={[...castGlyphsForSpan(span), ...reviewGlyphForSpan(span, onOpenReview)]}`.
   Field names above (`span.locked`, `span.needs_review`) are placeholders pending 001/009's actual
   shipped naming — confirm before implementing.

3. **`ReviewPopover.tsx`** — the confirm/reject/edit popover, structurally mirroring `CueEditor.tsx`:
   - Props: `segmentId: string` (or `characterId` for the §5 reuse case), the AI-suggested data to
     display (speaker attribution + confidence + evidence quote via `speaker_basis`/
     `speaker_evidence`; performance summary via `performance_data`, if present), `review_reasons`
     (rendered verbatim, per Current shape's note on the spec's already-human-readable reason
     strings), `anchorRef`, and three callbacks: `onConfirm`, `onReject`, `onEdit`.
   - Displays the suggestion read-only by default, with three actions: **Confirm** (accept as-is),
     **Reject** (discard the suggestion), **Edit** (reveal editable fields for the suggested
     speaker/performance values, pre-populated with the AI's values, with its own Save/Cancel).
   - Reuse `useFocusTrap` for focus containment + Escape-to-close, matching `CueEditor.tsx`/
     `ConfirmModal.tsx`.
   - **Do not invent the confirm/reject/edit mutation semantics here** — call whatever endpoints
     task 009 (`009-review-queue-backend-api.md`, drafted in parallel — confirm its actual filename
     once it lands in `tasks/`) exposes. This task's job is the UI and the call sites, not deciding
     what "reject" does to the underlying `performance_data`/`character_id` (e.g. whether reject
     reverts the segment to a default narrator attribution and clears `performance_data`, or simply
     marks `needs_review=false` and leaves the AI's data in place but unconfirmed) — that's a
     backend-contract decision 009 owns. Read 009's task file before writing the API client calls in
     `frontend/src/api/index.ts`; do not guess a fourth shape.

4. **Open question to resolve during implementation, not guessed here:** should a `locked=true`
   segment/character ever be unlockable by a human (e.g., to let a later chapter's reconciliation
   pass reconsider it after new context arrives)? This task recommends yes in principle — clicking
   the `✓` glyph could open a lightweight read-only detail view with an "Unlock for re-review"
   affordance — but only build this if task 009 actually exposes an unlock endpoint. If it doesn't,
   render `✓` as fully non-interactive per §1. Do not add a frontend-only "unlock" that silently
   flips `locked` back to `false` without a corresponding backend contract — that would let the UI
   drift out of sync with whatever the reconciliation pass (task 008/C-4) actually checks.

5. **Character-level review (secondary, smaller surface, best-effort scope).** Characters carry the
   same review-flag set (Current shape, above) but aren't rendered inline in `ScriptView.tsx` — the
   natural home is wherever Cast mode's character roster already renders, most plausibly
   `frontend/src/pages/Book/studio/CastPalette.tsx` (verify at implementation time; this file is
   cited as the most likely candidate found during this task's drafting, not confirmed as the final
   location). Add a small badge per character carrying `needs_review`/`ai_suggested`/`locked`,
   opening the same `ReviewPopover` component (parameterized for a character's `source_profile`/
   `voice_guidance` fields instead of a segment's `performance_data`) rather than a third
   confirm/reject/edit implementation. **This sub-scope is explicitly lower priority than the
   segment-level gutter work in §1-4** — if it turns out to be a materially bigger lift than
   expected (e.g. `CastPalette.tsx` isn't actually a good fit, or character review needs its own
   dedicated panel), it is acceptable to descope it to a follow-up task rather than block this task's
   completion on it; note that decision explicitly in the PR/status update rather than silently
   dropping it.

## Steps

1. Confirm task 001's actual column names/types for the review-flag set (`chapter_segments` and
   `characters`) and task 009's actual API response shape + confirm/reject/edit endpoint
   names/payloads — do not proceed past this point on placeholder names.
2. Confirm the sibling plan's task 007 (`AnnotationGutter`) has landed with the contract documented
   in Current shape; if it hasn't landed yet, this task is blocked (see Dependencies) — do not build
   a parallel gutter to unblock yourself.
3. Add `reviewGlyphForSpan` (or equivalent) near `ScriptView.tsx`'s existing glyph-helper location
   and merge its output with the Stage Direction/Cue glyph helper at both `renderBook` and
   `renderScript`'s gutter call sites.
4. Build `ReviewPopover.tsx` per Target shape §3, wired to task 009's real confirm/reject/edit
   endpoints via new functions in `frontend/src/api/index.ts`.
5. Wire the `❔` glyph's `onClick` to open `ReviewPopover`; decide and implement the `✓` glyph's
   interactivity per §4's resolution.
6. Add tests (mirroring the sibling plan's task 007 testing approach: `data-testid`-driven,
   asserting exact glyph-per-state mapping) covering: `needs_review=true, locked=false` → `❔` only;
   `locked=true` → `✓` only; neither flag set → no review glyph; a segment that is simultaneously a
   Performance Cue (`engine_directives != null`) and `needs_review=true` → both `⚡` and `❔` stack in
   the same gutter row.
7. Best-effort: add the character-level badge per Target shape §5, or explicitly note it as
   descoped in this task's status update.
8. Run `npm -C frontend run lint` and `npm -C frontend run test -- --run` (targeted to changed
   files, per this repo's memory on vitest memory pressure).

## Acceptance criteria

- [ ] Segments with `needs_review=true, locked=false` show a `❔` glyph in `ScriptView.tsx`'s gutter
      (both "book" and "script" view modes), clicking it opens `ReviewPopover` with Confirm/Reject/
      Edit actions wired to task 009's real endpoints.
- [ ] Segments with `locked=true` show a `✓` glyph, visually and functionally distinct from the
      pending-review state (per §4's resolved interactivity decision).
- [ ] Segments untouched by the AI pipeline show no review glyph, and any existing Stage
      Direction/Performance Cue glyphs (sibling plan's task 007/005) are unaffected by this task's
      changes.
- [ ] A segment that is both a Performance Cue and pending-review shows both glyphs stacked in one
      gutter row, verified by a test.
- [ ] `ReviewPopover`'s Confirm/Reject/Edit actions call task 009's actual endpoints (not a
      placeholder/invented shape) and reflect the resulting state (glyph updates after the action
      resolves).
- [ ] No changes to `AnnotationGutter`'s or `GutterGlyph`'s contract, unless a documented,
      coordinated reason required one (§1's escape hatch) — if that path was taken, it's called out
      explicitly in the PR description.
- [ ] `npm -C frontend run lint` and the targeted vitest run are both clean.
- [ ] Character-level review badge (§5) either shipped or explicitly noted as descoped with a
      reason.

## Map links

Part E in `01-map.md`. Invariant INV-3 (no auto-apply — this task is the human-confirmation surface
that makes INV-3 real). Connections section: "E ↔ chapter_editor_catalog_completion's Cue Editor
(that plan's task 008) ... this is the single most important cross-plan coordination point in this
entire multi-plan effort" (this task extends that same coordination to the review-state glyph, via
the shared `AnnotationGutter` component the sibling plan's task 007 builds).

## Dependencies

- **Task 009** (this plan, Workload 4: "Review-queue backend API — surface AI suggestions for
  confirmation," drafted in parallel by another agent as of this writing — confirm its actual
  filename in `tasks/` once it lands, e.g. `009-review-queue-backend-api.md`). This task cannot ship
  without 009's real endpoint contracts for confirm/reject/edit and the exact review-flag field
  names/shapes 009 exposes over HTTP.
- **Task 001** (this plan, Workload 1: additive schema migration) — the underlying columns this
  task's UI reflects.
- **Sibling plan's task 007** (`chapter_editor_catalog_completion/tasks/007-shared-gutter-component.md`,
  "Shared annotation gutter component") — **should land first.** This task is written to extend
  `AnnotationGutter`/`GutterGlyph`, not build a parallel gutter. If, for scheduling reasons, this
  task must execute before 007 lands, treat building `AnnotationGutter` itself as an unplanned
  prerequisite of this task rather than duplicating it under a different name — check with whoever
  owns the sibling plan's execution before doing so, since the sibling plan is the one that made the
  "build once" case for it (`01-map.md`'s Connections/INV-3 there).
- **Sibling plan's task 008** (`008-cue-editor-ui.md`, Cue Editor) is not a hard dependency, but is
  the closest existing precedent for `ReviewPopover.tsx`'s structure (anchoring, focus trap,
  save-call conventions) — read it before building `ReviewPopover.tsx` even though this task doesn't
  depend on its code directly.

## Out of scope

- Deciding what "reject" does to the underlying data (revert to default attribution vs. mark
  reviewed-and-discarded) — that mutation semantic is task 009's backend contract to define; this
  task only calls it.
- The AI extraction pipeline itself (tasks 005-008, Workload 4) and the reconciliation pass's
  actual enforcement of `locked` (not re-suggesting over locked records) — this task only renders
  the state, it doesn't enforce the invariant server-side.
- Building `AnnotationGutter` from scratch — that's the sibling plan's task 007; this task consumes
  it (see Dependencies for what to do if sequencing forces the issue).
- A full character-review dashboard/page — §5's character-level scope is a small badge + reused
  popover on the existing Cast roster, not a new standalone surface.
- Any change to the plugin-manifest/SSML-capability work (Part F/D, Workloads 3/5) — unrelated to
  review state.
