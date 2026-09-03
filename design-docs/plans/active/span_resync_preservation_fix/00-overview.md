# Overview — sub-sentence span preservation fix

## The task

`sync_chapter_segments` (`app/db/segments.py:492-599`) rebuilds a chapter's segment rows from a
fresh whole-sentence split of the saved manuscript text on **every** text save (via `update_chapter`,
`app/db/chapters.py:224` — not only an explicit resync). It preserves an existing row only via
same-index, exact whole-sentence text equality (`segments.py:523`). A manually-split sub-sentence
fragment (created by `_split_segment_at_offset`, `app/domain/chapters/operations.py:501`) can never
equal a whole sentence, so every manual sub-sentence speaker assignment in the chapter is silently
destroyed — new rows minted with `character_id=None`, old rows deleted, audio files removed — and
the extra row shifts every later row's index, wiping downstream whole-sentence assignments too.

Full root-cause trace: reference RC-1.

## Goal

Preserve manual sub-sentence speaker assignments (and their rendered audio) across an unrelated text
edit elsewhere in the chapter. When a sentence a manual split touches is *actually* edited, correctly
and visibly invalidate just that sentence's assignments — not silently, not cascading to unrelated
rows.

## Scope

**In scope:**
- The reconciliation logic in `sync_chapter_segments` and its sharing with `get_resync_preview`.
- Preserving existing fragment rows in place (not re-deriving them) when their parent sentence is
  unchanged.
- Fixing the whole-sentence index-cascade bug (an edit anywhere shifting every later row's index).
- Surfacing loss (`lost_assignments_count`) on the actual save response, not just the preview.
- The pre-existing 9-column data loss on every rebuild (see `01-map.md` Invariant I5) — **decision
  required**: fix in this change or file as a separate, smaller task (see Open Questions).

**Out of scope:**
- Any change to how splits are created in the editor UI.
- The audio pipeline itself (only its invalidation *trigger*).
- A broader segment-model redesign.
- `compact_script_view`'s merge behavior itself (only its *interaction* with anchors, if any anchor
  metadata is introduced — see Invariant I6).

## Success criteria (definition of done)

1. **The reproducing case is fixed and revert-checked:** assign a sub-sentence speaker → edit
   unrelated text elsewhere in the chapter → save → the sub-sentence assignment (and its audio, if
   previously rendered) survives. A test reproduces this, is confirmed **red** on pre-fix code
   (R1), and is green after the fix.
2. **The genuinely-stale case still invalidates correctly:** editing the sentence a split touches
   correctly invalidates *that* sentence's assignments, with the loss surfaced (not silent).
3. **The index-cascade case is fixed independently:** editing/inserting a sentence earlier in a
   chapter (no splits involved at all) no longer misaligns every later row's assignment.
4. **The existing committed test still passes unmodified in intent:**
   `test_sync_chapter_segments_does_not_cross_match_reordered_duplicates`
   (`tests/db/test_chapters_sync.py:94`) — reordered duplicate sentences must NOT cross-match; the
   fix must not weaken position-based disambiguation for duplicate content.
5. **`get_resync_preview` and `sync_chapter_segments` use one shared alignment function** — no
   drift between what the preview predicts and what a real save does.
6. **No new columns are added unless the schema-free approach (Task 1) is proven insufficient** —
   see the falsifier resolution in `01-map.md`.
7. **A decision is recorded** (not necessarily executed in this change) on the 9-column data-loss
   bug: fix here or file separately.

## Inputs this plan was built from

- Reference RC-1 — original root-cause analysis
- `design-docs/plans/active/span_resync_preservation_fix/00-plan.md` — superseded first draft
- The RC-1 plan-comparison review — 3-way review synthesis
- Three verification scouts (2026-07-19): the whitespace/strip falsifier, the exact existing-test
  assertions, and the full schema/column-drop accounting — findings folded into `01-map.md`.
