# Concepts

Understanding how Audiobook Studio organizes data is key to a smooth workflow.

## 🏗️ Hierarchy

- **Library**: The collection of all your projects.
- **Project**: Represents a single audiobook or collection. Contains metadata (Author, Series, Cover).
- **Chapter**: A logical division of a project. Contains the text and its generated audio.
- **Segment**: A single sentence or paragraph within a chapter. This is the smallest text unit stored in the database.
- **Chunk Group**: The displayed Performance/Production unit. One chunk can contain several adjacent stored segments when they belong together.
- **Character**: A persona assigned to segments. Chapters are narrated by a "Narrator" by default, but you can assign specific "Characters" to dialogue.

## 🎙️ AI Voice Lab

- **Voice**: A higher-level identity (e.g., "Dracula"). This is what you assign to Characters in your projects.
- **Variant**: A specific stylistic or emotional performance of a Voice (e.g., "Main - Calm", "Main - Shouting").
- **Sample**: High-quality `.wav` reference audio used to clone a Voice.
- **Engine**: The synthesis path attached to a profile, currently `XTTS (Local)` or `Voxtral (Cloud)`.

## 🔄 Generation Workflow

1. **Analysis**: The system scans your text for long sentences (over 500 characters) and automatically splits them to ensure high-quality TTS.
2. **Queuing**: When you click "Generate", displayed chunk groups are added to a background queue.
3. **Synthesis**: XTTS, Voxtral, or a mixed chunk-aware path processes each queued chunk based on its assigned voice profiles.
4. **Baking**: After all chunks in a chapter are generated, they are stitched into a master WAV and simultaneously encoded into a high-quality **M4A chapter cache**.
5. **Assembly**: Finally, the system performs **Lossless Concatenation** of the M4A chapter files into a standard `.m4b` container. Because the encodes are cached, rebuilding the audiobook is nearly instantaneous.

---

[[Home]] | [[Library and Projects]] | [[Voices and Voice Profiles]]
