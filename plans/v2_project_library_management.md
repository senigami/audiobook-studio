# Proposal: Project & Library Management (Studio 2.0)

## 1. Objective
Separate the management of "Static Assets" (the Voice Library) from "Dynamic Productions" (Projects), creating self-governed modules that allow the application to scale to hundreds of voices and large-scale book projects.

## 2. The Voice Library Module
A self-contained system for managing reusable speaker profiles.
- **Identity Service**: Unique IDs for voices that remain consistent even if labels change.
- **Sample Management**: Automated lifecycle for reference samples (upload -> sanitize -> latent extract -> test).
- **Engine-Agnostic Storage**: Stores only parameters and reference files; the actual generation is delegated to the `VoiceBridge`.
- **Compatibility Metadata**: Each voice should record which engines and asset types it supports so the UI can prevent invalid selections early.

## 3. The Project Management Module
Responsible for the end-to-end lifecycle of an audiobook production.
- **Isolation**: Each project has a strictly defined data root. 
- **Workspace State**: Stores current chapter progress, text versions, and audio chunks within the project context, not the global state.
- **Multi-Speaker Assignments**: A dedicated "Cast" map for each project that correlates characters in the text to Voice Library IDs.
- **Project Defaults**: Narrator, output preset, pronunciation rules, and fallback engine choices should live at the project level so chapter editing stays lightweight.

## 4. Shared Asset Registry
A middle layer to handle assets that might be shared between projects or between a project and the library.
- **De-duplication**: Identifies if a specific segment has already been rendered for a different project with the same voice/parameters.
- **Backfill Handling**: Logic for re-generating missing MP3s or migrating legacy data formats.
- **Refinement**: Shared assets should behave like a content-addressed cache, not like mutable cross-project files. Projects should own references to immutable render artifacts.

## 5. Metadata & Versioning
- **Project Snapshots**: The ability to "save a version" of the text and audio state.
- **Narrator/Author Metadata**: Integrated management for ID3 tags and M4B headers.

## 5.1 UX Refinements

- **Quick Resume**: The project library should prioritize `recently active`, `needs attention`, and `ready to export` views over a flat grid alone.
- **Creation Flow**: New project creation should be a small guided workflow: metadata, source text import, narrator/default voice, then review.
- **Library Safety**: When editing a shared voice profile, the UI should clearly show which projects use it and whether changes affect future renders only or require refresh.
- **Asset Health**: Surface missing cover art, missing narrator, unresolved failed renders, and stale outputs as actionable project badges.

## 5.2 Potential Problems And Better Implementations

- **Problem: Cross-project dedupe can accidentally couple projects together**
  Better implementation: Reuse immutable artifacts by hash and let projects reference them, rather than sharing mutable output paths.
- **Problem: Voice library edits can create unexpected production drift**
  Better implementation: Snapshot voice assignment metadata into the project at render time and require explicit refresh when the source library entry changes.
- **Problem: Project portability breaks if hidden globals remain**
  Better implementation: Define exactly which assets are embedded, referenced by cache key, or recreated on import/export, and document that contract in the plan.

## 6. Planned Benefits
- **Portability**: Projects can be easily zipped/moved because they don't depend on global absolute paths.
- **Stability**: Changes to a voice profile in the library won't "break" an existing project unless the user explicitly chooses to refresh the project's cast.
- **Scale**: Better database indexing and directory structure for handling multi-volume audiobook series.
