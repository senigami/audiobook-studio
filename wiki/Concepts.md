# Concepts

Understanding how Audiobook Studio organizes data is key to a smooth workflow.

## Hierarchy

- **Library**: The collection of all your projects, shown at **CREATE > Library** in the left rail.
- **Project / Book**: Represents a single audiobook or collection. Contains metadata (Author, Series, Cover).
- **Chapter**: A logical division of a project. Contains the text and its generated audio.
- **Segment**: A single sentence or paragraph within a chapter. This is the smallest text unit stored in the database.
- **Chunk Group**: The displayed Performance/Production unit. One chunk can contain several adjacent stored segments when they belong together.
- **Character**: A persona assigned to segments. Chapters are narrated by a "Narrator" by default, but you can assign specific "Characters" to dialogue.

## Book Pipeline

Projects open into a routed set of book tabs at `/book/:id/<tab>`:

| Tab | Purpose |
|-----|---------|
| **Book** | The project's front door: edit its identity (title, author, series, description, cover) and pick up playback via Continue Listening |
| **Contents** | The chapter board: add, import, reorder, and open chapters |
| **Cast** | Assign narrator (pinned) and character voices |
| **Lexicon** | Per-book pronunciation overrides |
| **Publish** | Assemblies and final export |
| **Backups** | Dated ZIP snapshots of the project |

Opening a chapter from Contents enters the **Chapter Workspace** at `/book/:id/chapter/:chapterId`. The old separate **Studio** and **Review** stages have been merged into this one workspace, switched between via the Director's Console's four tools (Cast, Booth, Revise, Write) instead of a top-level tab.

## Left Rail Navigation

The persistent left rail groups destinations into four sections:

| Group | Destinations |
|-------|-------------|
| **CREATE** | Library, Voices |
| **MONITOR** | Activity |
| **PLATFORM** | Engines, Integrations |
| **MANAGE** | Settings |

The rail collapses to icon-only mode. Inside a book, it shows a contextual block with stage links and the chapter list.

## AI Voice Lab

- **Voice**: A higher-level identity (e.g., "Dracula"). This is what you assign to Characters in your projects.
- **Variant**: A specific stylistic or emotional performance of a Voice (e.g., "Main - Calm", "Main - Shouting").
- **Sample**: High-quality `.wav` reference audio used to clone a Voice.
- **Engine**: The synthesis path attached to a profile, currently `XTTS (Local)` or `Voxtral (Cloud)`.

The Voices catalog (`/voices`) shows cards for all voices. Clicking a card opens the **Voice Lab** (`/voices/:id`), a full-page editor for that voice.

## Generation Workflow

1. **Analysis**: The system scans your text for long sentences (over 500 characters) and automatically splits them to ensure high-quality TTS.
2. **Casting**: Narrator and character voices are assigned in the Casting stage.
3. **Queuing**: When you click "Generate" in the Studio stage, displayed chunk groups are added to a background queue.
4. **Synthesis**: XTTS, Voxtral, or a mixed chunk-aware path processes each queued chunk based on its assigned voice profiles.
5. **Baking**: After all chunks in a chapter are generated, they are stitched into a master WAV and simultaneously encoded into a high-quality **M4A chapter cache**.
6. **Assembly**: Finally, the system performs **Lossless Concatenation** of the M4A chapter files into a standard `.m4b` container. Because the encodes are cached, rebuilding the audiobook is nearly instantaneous.

## Player Bar

A full-width bottom dock provides global audio playback. It is hidden when no audio is loaded and appears when you play chapter or segment audio from any stage. The scope chip lets you cycle between chapter and section playback scope.

---

[[Home]] | [[Library and Projects]] | [[Voices and Voice Profiles]]
