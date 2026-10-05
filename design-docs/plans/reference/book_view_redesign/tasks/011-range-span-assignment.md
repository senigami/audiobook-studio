# 011 — Range/span assignment (replace sentence "paint")

- **Status:** done
- **Workload:** Mock: cast, characters & assignment
- **Severity / type:** major · ux
- **Effort:** L
- **Blocked by:** 010
- **Blocks:** nothing

## Goal
Replace the mock's sentence-level "paint" assignment with **range/span selection**: the author selects an arbitrary run of words — which may cross sentence boundaries or be only part of a sentence — and assigns a **character + variation** to exactly that range. Narrator remains the book-wide default; an assigned span overrides within it.

## Why this matters
The IA proposal (§9 answer **A7**) sets the target assignment model as range-based selection so an author can, for example, voice a quoted phrase in the character's voice while the narrator names the character around it — at finer-than-sentence grain. The current mock has two coarser mechanisms (arm a swatch + click a whole sentence; or a selection context menu that splits one chunk). This task moves the mock toward the spec's range model and is the final piece of the cast/assignment workload.

## Context an executor needs
- Read for intent (do not duplicate): `design-docs/plans/book_view_ia_proposal.md` §9 **A7** (range/span selection is the future model; current is "paint"; Narrator is book-wide default, span overrides within). Roadmap: `design-docs/plans/book_view_redesign/01-roadmap.md` Workload 4.
- **This is a MOCK task.** Pure front-end demo interaction — no backend, no `base_revision_id`, no API calls. Acceptance is build + observable behavior.
- Current mechanisms in `frontend/src/demo/stages/siteMockup/panes/studio.tsx` (note both; this task supersedes the paint one):
  - **Paint:** `armedSwatch` state + cast row arm; clicking a sentence span (`handleSentenceClick` via `sentenceId`, or the `armedSwatch` branch in `renderChunkElement`'s `handleClick`) reassigns its speaker. The "painting: … — click sentences to assign" floating chip (~line 1028) advertises it.
  - **Selection split:** `handleMouseUp` (~line 568) already reads `window.getSelection()`, walks up to the nearest `[data-chunk-id]` element, captures `startOffset`/`endOffset`/`selectedText`, and opens `#selection-context-menu`; `handleAssignSpeakerToSelection` (~line 607) splits the chunk into before/selected/after sub-chunks and tints the selected one. **This selection→split→tint path is the foundation to build the range model on.**
  - Prose is a flat `chunks: Chunk[]` array rendered by paragraph; `renderChunkElement` tints by `SPEAKER_TOKEN[speaker]`.
- ⚠️ **Coordination:** `studio.tsx` is rendered by `frontend/src/demo/stages/siteMockup/siteMockupStage.tsx`. **Another worker is concurrently editing the mock.** Keep this task inside `studio.tsx`; it should **not** need to edit `siteMockupStage.tsx`. If a stage edit becomes unavoidable, keep it minimal/additive and re-read the file immediately before editing.

## Target shape / contract
- Selecting an arbitrary run of words and confirming an assignment (character + variation, reusing task 010's `Character ▾ · Variation ▾` control in the selection popover) tints **exactly the selected range** in the character's color — the selection may start/end mid-sentence and may span across a sentence boundary within the same chunk/paragraph.
- Mechanism: extend the existing `handleMouseUp` + `handleAssignSpeakerToSelection` split path so the assignment carries **both** the chosen character and variation, and so the selected range becomes its own tinted sub-chunk. Retire the "arm a swatch, click a whole sentence" interaction (or fold it into selecting the sentence's words) so the primary gesture is range selection.
- Narrator is the implicit default for unselected/unassigned text; assigning a span only overrides within the selected range. No persistence/backend.

## Steps
1. Read §9 A7.
2. In `studio.tsx`, make the selection popover (the `#selection-context-menu`) offer the `Character ▾ · Variation ▾` control from task 010 instead of (or in addition to) the three static speaker buttons, so a range assignment records character + variation.
3. Extend `handleAssignSpeakerToSelection` so the split-out "selected" sub-chunk stores the chosen `speaker` and variation and renders tinted via `SPEAKER_TOKEN`. Ensure a selection that is only part of a sentence, or that crosses a sentence boundary inside one chunk, tints exactly the selected characters (the existing before/selected/after split already supports partial selection — verify cross-sentence selection within a chunk works and tints the whole selected run).
4. Remove or de-emphasize the sentence-paint path: drop the "painting: … click sentences" armed-swatch click-to-assign on whole sentences as the primary gesture, leaving range selection as the main interaction. Keep the cast panel's row selection available for choosing *who* before assigning if useful, but assignment commits on a range.
5. Update the in-prose hint chips (e.g. "select text in any line to assign a sub-sentence speaker") to describe range selection across sentence boundaries.
6. Keep colors token-driven; no raw hex. Keep it a mock interaction — no network, no revision ids.
7. Run `npm -C frontend run build` and `npm -C frontend run lint`; fix errors.

## Acceptance criteria
- `npm -C frontend run build` passes.
- Selecting an arbitrary run of words in the prose (partial sentence, or spanning across a sentence boundary within a chunk/paragraph) and confirming an assignment tints **exactly that range** in the chosen character's color.
- The assignment captures a character **and** a variation (via the task-010 control surfaced in the selection popover).
- Unselected text stays in its default (Narrator/existing) appearance; only the selected range changes.
- The old "click a whole sentence to paint" is no longer the primary assignment gesture (removed or subsumed by range selection).

## Out of scope
- Backend persistence, `base_revision_id`/concurrency (real-app bug B2), or any API.
- The variation data and dropdown internals (owned by task 010) and the cast tiers (task 009).
- Real segment-splitting math or synthesis re-render.
