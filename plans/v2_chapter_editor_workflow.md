# Proposal: Enhanced Chapter Editor Workflow (Studio 2.0)

## 1. Objective
Transform the Chapter Editor from a simple text field into a rich, script-centric production environment that supports multi-speaker scenes and rapid iteration.

## 2. Segment-First Architecture
Instead of treating a chapter as a large text file, 2.0 treats it as a sequence of `ProductionBlocks`.

### 2.1 The Production Block
- **Properties**: Text content, assigned Voice ID, synthesis parameters, current status (draft/rendered/error), and audio URI.
- **UI Interaction**: Each block can be independently rendered, deleted, or re-recorded.

## 3. Advanced Voice Assignments
- **Character Mapping**: The editor identifies "Characters" (either via manual tags or AI analysis) and allows the user to map a Voice Profile from the Library to that character globally.
- **Narrator Default**: Intelligent fallback to the main narrator for non-dialogue text.
- **Voice Swap**: Change the voice of a single segment or a whole character set with one click, triggering a targeted re-render.

## 4. Iterative Production Cycle
- **Inline Preview**: A "Render Piece" button on every block for instant feedback.
- **Ghosting**: Compare the current audio version with a previous one.
- **Background Sync**: Real-time autosave of text and voice assignments back to the `ProjectManager`.

## 5. Performance View Integration
The Chapter Editor will have a direct link to the `ProgressService`.
- **Real-time Status**: Instead of a global bar only, each block shows its own mini progress-orb when it's being synthesized in the background.
- **Queue Transparency**: Users can see where their specific chapter pieces are in the global synthesis queue.

## 6. Planned Benefits
- **Production Efficiency**: No more rendering a whole 30-minute chapter just to hear a one-sentence change.
- **Creative Control**: Granular control over multi-character dialogue.
- **Error Reduction**: Visual status indicators for every single line of text ensure nothing is missed in the final assembly.
