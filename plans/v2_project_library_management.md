# Proposal: Project & Library Management (Studio 2.0)

## 1. Objective
Separate the management of "Static Assets" (the Voice Library) from "Dynamic Productions" (Projects), creating self-governed modules that allow the application to scale to hundreds of voices and large-scale book projects.

## 2. The Voice Library Module
A self-contained system for managing reusable speaker profiles.
- **Identity Service**: Unique IDs for voices that remain consistent even if labels change.
- **Sample Management**: Automated lifecycle for reference samples (upload -> sanitize -> latent extract -> test).
- **Engine-Agnostic Storage**: Stores only parameters and reference files; the actual generation is delegated to the `VoiceBridge`.

## 3. The Project Management Module
Responsible for the end-to-end lifecycle of an audiobook production.
- **Isolation**: Each project has a strictly defined data root. 
- **Workspace State**: Stores current chapter progress, text versions, and audio chunks within the project context, not the global state.
- **Multi-Speaker Assignments**: A dedicated "Cast" map for each project that correlates characters in the text to Voice Library IDs.

## 4. Shared Asset Registry
A middle layer to handle assets that might be shared between projects or between a project and the library.
- **De-duplication**: Identifies if a specific segment has already been rendered for a different project with the same voice/parameters.
- **Backfill Handling**: Logic for re-generating missing MP3s or migrating legacy data formats.

## 5. Metadata & Versioning
- **Project Snapshots**: The ability to "save a version" of the text and audio state.
- **Narrator/Author Metadata**: Integrated management for ID3 tags and M4B headers.

## 6. Planned Benefits
- **Portability**: Projects can be easily zipped/moved because they don't depend on global absolute paths.
- **Stability**: Changes to a voice profile in the library won't "break" an existing project unless the user explicitly chooses to refresh the project's cast.
- **Scale**: Better database indexing and directory structure for handling multi-volume audiobook series.
