# Proposal: Enhanced Chapter Editor Workflow (Studio 2.0)

## 1. Objective
Transform the Chapter Editor from a simple text field into a rich, script-centric production environment that supports multi-speaker scenes and rapid iteration.

## 2. Segment-First Architecture
Instead of treating a chapter as a large text file, 2.0 treats it as a sequence of `ProductionBlocks`.

### 2.1 The Production Block
- **Properties**: Stable block ID, revision hash, text content, assigned Voice ID, synthesis parameters, current status (draft/rendered/error/review-required), and audio URI.
- **UI Interaction**: Each block can be independently rendered, deleted, or re-recorded.
- **Identity Rule**: Block IDs should survive harmless text edits where possible so users do not lose comments, history, or queue context after every save.

## 3. Advanced Voice Assignments
- **Character Mapping**: The editor identifies "Characters" (either via manual tags or AI analysis) and allows the user to map a Voice Profile from the Library to that character globally.
- **Narrator Default**: Intelligent fallback to the main narrator for non-dialogue text.
- **Voice Swap**: Change the voice of a single segment or a whole character set with one click, triggering a targeted re-render.
- **Suggestion-First UX**: AI character detection should produce editable suggestions with confidence labels, never silent automatic rewrites.

## 4. Iterative Production Cycle
- **Inline Preview**: A "Render Piece" button on every block for instant feedback.
- **Ghosting**: Compare the current audio version with a previous one.
- **Background Sync**: Debounced autosave for text and voice assignments back to the `ProjectManager`, with local draft protection while edits are in progress.
- **Undo-Friendly Editing**: Users should be able to revert a block to the last rendered version or compare current draft vs rendered revision without leaving the editor.

## 5. Performance View Integration
The Chapter Editor will have a direct link to the `ProgressService`.
- **Real-time Status**: Instead of a global bar only, each block shows its own mini progress-orb when it's being synthesized in the background.
- **Queue Transparency**: Users can see where their specific chapter pieces are in the global synthesis queue.
- **Reason Codes**: Each block should explain whether it is waiting on GPU, voice setup, retry cooldown, or another dependency.

## 6. UX Refinements For Best Flow

- **Primary Screen Model**: Default the editor to a two-pane production layout: editable script on the left, active block details and preview on the right.
- **Sticky Action Rail**: Keep `Render selected`, `Render changed`, `Play latest`, and `Export chapter` visible while scrolling.
- **Progressive Disclosure**: Keep advanced synthesis controls collapsed behind an `Advanced` panel so common editing stays fast.
- **Change Awareness**: Visually distinguish `edited but not rendered`, `queued`, `rendered`, and `out of date` states.
- **Batch-Friendly Selection**: Support multi-select across blocks so users can rerender all changed lines for one character at once.
- **Failure Recovery**: Failed blocks should expose `Retry`, `Edit text`, and `Swap voice` in place rather than forcing the user into a separate queue page.

## 7. Potential Problems And Better Implementations

- **Problem: A segment-first model can become fragile if segmentation changes often**
  Better implementation: Use stable block identity plus revision hashes, and allow the editor to preserve history when text edits do not materially change boundaries.
- **Problem: Full autosave on every keystroke can overload the backend and create race conditions**
  Better implementation: Keep local draft state immediately, debounce server saves, and show save state clearly.
- **Problem: Ghosting every revision may create storage bloat**
  Better implementation: Retain a bounded revision history per block with user-pinned favorites instead of unlimited audio copies.

## 8. Planned Benefits
- **Production Efficiency**: No more rendering a whole 30-minute chapter just to hear a one-sentence change.
- **Creative Control**: Granular control over multi-character dialogue.
- **Error Reduction**: Visual status indicators for every single line of text ensure nothing is missed in the final assembly.
