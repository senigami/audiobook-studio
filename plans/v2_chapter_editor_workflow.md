# Proposal: Chapter Editor Workflow (Studio 2.0)

The Chapter Editor is the product. The 2.0 architecture has to serve this experience, not the other way around.

## 1. Objectives

- Make targeted editing and targeted rerender the default workflow.
- Let users understand the state of every block at a glance.
- Support multi-speaker productions without making the editor feel like a queue dashboard.
- Preserve fast local editing while keeping server truth trustworthy.

## 2. Source Of Truth Model

### Chapter Draft

- Canonical persisted chapter content and metadata
- Versioned by draft revision

### Production Block

- Stable block identity
- Ordered position within the chapter
- Text and normalized text
- Character assignment
- Voice assignment
- Revision hash
- Last valid artifact reference
- Status and error metadata

The editor works against production blocks, but the author still needs a coherent chapter draft view. We should support both through a single underlying block model.

## 2.1 Render Batches

To preserve current product behavior, the editor plan needs an explicit batching concept.

- Users edit **production blocks**
- The renderer may synthesize **render batches** composed of adjacent compatible blocks

Batch derivation should preserve current ideas such as:

- same resolved voice assignment
- same engine
- compatible character grouping
- max character-size constraints

This lets us keep targeted editing while preserving efficient and natural grouped rendering.

## 3. What I Want To Create

### 3.1 Two-Pane Production Layout

- Left pane: editable script view
- Right pane: selected block details, latest preview, render actions, diagnostics

### 3.2 Sticky Action Rail

- `Render selected`
- `Render changed`
- `Play latest`
- `Preview chapter`
- `Export chapter`

### 3.3 Inline Block Status Model

Each block should clearly communicate one of:

- `draft`
- `edited`
- `queued`
- `waiting`
- `rendering`
- `rendered`
- `stale`
- `failed`
- `needs_review`

## 4. Voice Assignment Workflow

- The project defines defaults such as narrator and output behavior.
- The editor supports block-level overrides and character-level mappings.
- Character detection is suggestion-first with confidence labeling.
- Users can apply a voice swap to one block, one character, or all unresolved narrator blocks.

## 5. Editing And Save Procedure

1. Local editor state updates immediately.
2. Block revisions and dirty markers update locally.
3. Autosave is debounced and explicitly surfaced with save-state messaging.
4. Server acknowledgements update canonical draft revision without clobbering active local edits.
5. Any render artifact for a changed block becomes stale automatically.

## 6. Render Procedure

### Render Selected

- Queue only selected blocks that are `edited`, `stale`, `failed`, or `needs_review`.

### Render Changed

- Queue every block whose current revision is not satisfied by a valid artifact.
- Derive render batches from the changed/stale blocks where batching rules allow, rather than forcing every block to synthesize as a totally isolated unit.

### Retry Failed

- Requeue failed blocks only after validation passes again.

## 7. Preview And Revision History

- Keep the latest valid artifact easy to play.
- Support comparison between the latest valid artifact and one earlier retained artifact.
- Retain bounded block-level revision history instead of unlimited audio copies.

## 8. Failure Recovery UX

- Failed blocks must expose inline `Retry`, `Edit text`, and `Swap voice`.
- Waiting blocks must explain what they are waiting on.
- Recovered-after-restart state must be visible but not scary.
- The user should never need to jump to a separate queue screen just to recover one line.

## 8.1 Preview And Voice-Test Workflow

The current product has a useful concept of voice test and preview behavior tied to profile-level settings. Studio 2.0 should preserve that intent.

- Users should be able to preview a voice or block quickly without committing to a full chapter render.
- Voice preview/test flows may use profile-level preview settings and reference samples.
- Preview should remain fast and isolated from large queue operations when possible.

## 9. Risks And Planned Solutions

- **Risk: Block identity breaks whenever segmentation changes**
  Solution: preserve stable keys across harmless edits and only regenerate block identity when boundaries truly change.
- **Risk: Autosave races with live queue updates**
  Solution: separate local draft revision from persisted revision and merge carefully.
- **Risk: The editor becomes too dense**
  Solution: keep advanced controls collapsed and surface the common path first.

## 10. UX Quality Bar

- The editor must feel trustworthy after refresh and reconnect.
- The user must be able to tell what changed and what needs rerender without hunting.
- Multi-select and bulk actions must make larger productions faster, not more confusing.

## 11. Implementation References

- `plans/implementation/domain_data_model.md`
- `plans/v2_project_library_management.md`
- `plans/v2_progress_tracking.md`
- `plans/implementation/frontend_state_impl.md`
