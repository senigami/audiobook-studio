# Proposal: Preserve sub-sentence spans across source-text resync

Status: **scoping note — not yet planned/built** — 2026-07-17. Produced as a scope-only
deliverable alongside `design-docs/plans/active/archive/span_word_boundary_snapping/`
(word-boundary snapping, now complete). This documents a real, previously-untracked data-loss gap
so it has a home; it proposes **no fix**. Pick it up as its own plan folder when prioritized.

## The gap

Manually-created sub-sentence spans and their speaker assignments are **discarded on any
source-text resync** — including the common "edit chapter text and save" flow, not just the
explicit resync button. The loss is warned (the resync-preview modal reports
`lost_assignments_count`), but unavoidable once the user proceeds.

## Why it happens (evidence)

The rebuild is always `sync_chapter_segments()` in `app/db/segments.py:492`. It rebuilds
`chapter_segments` from a fresh sentence split and preserves an existing row's assignment
**only when that row's full text equals the freshly-split sentence at the same positional
index**:

- `sentences = split_into_sentences(text_content)` — `app/db/segments.py:507` (one row per sentence).
- Preservation test is index-positional + full-sentence equality:
  `if i < len(existing) and (existing[i]...text_content).strip() == sent.strip()` —
  `app/db/segments.py:523`; only then are `character_id` / `speaker_profile_name` carried over
  (`:534-535`).
- The table is then truncated and re-inserted wholesale: `DELETE FROM chapter_segments WHERE
  chapter_id = ?` (`:555`) then `executemany INSERT` of the sentence rows (`:566`).

A `split_<uuid>` span (created in `_split_segment_at_offset`,
`app/domain/chapters/operations.py:487`) holds only a **fragment** of a sentence, so its
`text_content` can never equal any full sentence from `split_into_sentences`. The equality check
at `:523` therefore always fails for split rows → they are deleted and replaced by a single
whole-sentence row with `character_id=None, speaker_profile_name=None`. The pieces of a split
sentence collapse back into one narrator-owned span.

`get_resync_preview()` (`app/domain/chapters/operations.py:270`) uses the identical
positional/equality logic (`:299`), so it correctly *reports* the loss — the warning UX is
consistent; nothing re-anchors the spans.

Additional fragility even for whole sentences: preservation is purely by index, so inserting or
deleting an earlier sentence shifts all indices and drops assignments from that point on.
Sub-sentence spans are simply the guaranteed-loss case.

## Resync entry points

- **Primary / common — chapter text edit + save:** `app/db/chapters.py:224` (`update_chapter`,
  `if updated and is_text_update`). Frontend trigger:
  `frontend/src/hooks/chapter/useChapterPersistence.ts:24` (fires whenever saved text differs
  from `chapter.text_content`).
- **Chapter creation:** `app/db/chapters.py:54` (`create_chapter`) — same sentence-granular build.
- **Explicit resync endpoint:** `POST /chapters/{chapter_id}/sync-segments` →
  `app/api/routers/chapters.py:259` (`api_sync_segments`).
- **Non-destructive preview (no writes):** `get_resync_preview()`
  (`app/domain/chapters/operations.py:270`), via `POST /chapters/{chapter_id}/source-text/preview`
  (`app/api/routers/chapters_production.py:35-38`).

## What a future fix has to work with

Per-segment identifying info available today: `id` (`split_<uuid>` prefix distinguishes manual
span pieces from time-ns sentence ids), `text_content` (the fragment text), `segment_order`
(currently the only anchor used), `character_id`, `speaker_profile_name`, and render state
(`audio_status`/`audio_file_path`/`audio_generated_at`). **Absent:** no persisted
character-offset columns and no parent-sentence back-reference — selection offsets exist only
transiently in the assignment request (`start_offset`/`end_offset` in `_apply_range_assignment`,
`operations.py:390-392`) and are not stored. So there is no durable structural anchor beyond
text + order today.

## Blast radius

Common trigger (any manuscript edit + save). All `split_<uuid>` spans in the affected chapter
lose their assignment and merge back to sentence granularity; associated segment audio is
invalidated. Mitigated only by the pre-resync warning modal — data-loss-with-warning, not
silent.

## Related maintenance risk: no executable twin-parity check for the snapping algorithm

Word-boundary snapping (shipped 2026-07-17, PR #143) lives as **two hand-mirrored
implementations** of one algorithm: `_snap_offset_to_word_boundary` in
`app/domain/chapters/operations.py` (Python, authoritative) and `snapOffsetToWordBoundary` in
`frontend/src/pages/ChapterEditor/components/ScriptView.tsx` (TypeScript, UX preview). They are
kept in lockstep only by cross-referencing comments and *parallel* per-language tests — there is
**no shared fixture / contract test that asserts both produce the same output for the same
input**. A future edit to one side could silently diverge from the other and no test would fail.
(A known, accepted divergence already exists at exotic whitespace codepoints — JS `/\s/` vs
Python `str.isspace()`; it is safe only because the backend snaps last and authoritatively.)

Flagged by the Fable adversarial review at sign-off (2026-07-17) as the change's most fragile
forward-looking assumption. **Recommended follow-up if this algorithm is ever touched again:**
add a shared golden-fixture parity test — a small table of `(text, offset, boundary) -> expected`
cases checked by *both* the pytest suite and the vitest suite (or generated once and asserted in
each), so the two twins cannot drift undetected. Low effort, not urgent; do it opportunistically
the next time either helper changes.

## Related offset-fidelity gap: `showSafeText` rendering path

A second, smaller offset-fidelity concern belongs with this work (same "the offset a span is
assigned at must faithfully map to the stored text" theme). In
`frontend/src/pages/ChapterEditor/components/ScriptView.tsx`, `handleSelection` reads
`range.startOffset`/`endOffset`, which index the **rendered** DOM text node. When the
`showSafeText` toggle is on, the rendered node shows `sanitized_text`, while both the frontend
snap and the backend split operate on the raw `text`/`text_content`. If `sanitized_text` differs
in length from the raw text, a selection made in safe-text mode can map to a slightly wrong raw
offset.

This is **not a regression introduced by word-boundary snapping** — raw DOM offsets were already
posted against `text_content` before snapping existed, and the backend re-snaps whatever it
receives to a valid word boundary, so no mid-word split can result. The frontend snap covers the
normal (non-safe-text) rendering path. Fully handling the safe-text path means mapping a
sanitized-text offset back to the raw-text offset before snapping/splitting. Bundle it with the
resync re-anchoring work above, since both are about anchoring an assignment to the correct
position in the canonical text.

## Suggested follow-up (when prioritized)

Create `design-docs/plans/active/span_resync_preservation/`. Goal: make span assignments survive
an unchanged-or-minimally-changed resync — e.g. re-anchor assignments to the new source via
text/offset matching rather than whole-sentence positional equality, and give spans a durable
structural anchor (persisted parent-sentence reference and/or character offsets). Keep
`get_resync_preview` consistent with whatever preservation logic ships, and cover the common
edit-and-save flow, not just the explicit resync button.
