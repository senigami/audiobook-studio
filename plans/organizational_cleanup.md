# Organizational Cleanup Plan

In addition to the engine-agnostic conversion, several areas of the codebase require organizational cleanup to improve maintainability and remove legacy technical debt.

## 1. Database Consolidation
- **Goal**: Establish a single source of truth for the database and remove legacy artifacts.
- **Actions**:
    - [DELETE] `database.sqlite` (legacy).
    - [DELETE] `app.db` (legacy).
    - [RETAIN] `audiobook_studio.db` as the primary production database.
    - [ENFORCE] Ensure `DB_PATH` in `app/db/core.py` is always used for connection acquisition.

## 2. Text Operations Unified Package
- **Goal**: Merge fragmented text processing logic.
- **Actions**:
    - [NEW] `app/text/`. Create a package to house all text logic.
    - [MOVE] `app/textops.py` and `app/utils/text_processing.py` into `app/text/`.
    - [CONSOLIDATE] Merge `textops_cleaning.py`, `textops_helpers.py`, `textops_splitting.py` into focused modules within `app/text/`.
    - [RENAME] Standardize naming: `sanitize_text`, `split_chapters`, `get_stats`.

## 3. Speaker Profile Decomposition
- **Goal**: Break down the massive `app/db/speakers.py` (23KB+).
- **Actions**:
    - [NEW] `app/db/speakers/`.
    - `profiles.py`: CRUD for speaker profile records.
    - `assets.py`: Logic for managing voice samples and latents.
    - `settings.py`: Logic for per-profile engine settings and overrides.

## 4. API Router Reorganization
- **Goal**: Group 23+ endpoints into sub-packages for better navigation.
- **Actions**:
    - [NEW] `app/api/routers/projects/`:
        - `projects.py`, `assembly.py`, `backups.py`, `helpers.py`, `chapters.py`, `assets.py`, `models.py`, `production.py`.
    - [NEW] `app/api/routers/voices/`:
        - `voices.py`, `actions.py`, `bundles.py`, `characters.py`, `helpers.py`, `management.py`, `narrators.py`.
    - [NEW] `app/api/routers/queue/`:
        - `jobs.py`, `queue.py`, `generation.py`.
    - [NEW] `app/api/routers/system/`:
        - `system.py`, `analysis.py`, `engines.py`, `settings.py`, `migration.py`.

## 5. Storage Abstraction Layer Specification
- **Goal**: Centralize path resolution to remove `config.py` pathing sprawl.
- **Methods**:
    - `get_project_path(project_id: str) -> Path`
    - `get_chapter_asset(project_id: str, chapter_id: str, asset_type: str, filename: str = None) -> Path`
    - `resolve_output_path(job: Job) -> Path`: Handles the "project-local vs global-legacy" resolution logic.
    - `migrate_to_nested(project_id: str)`: Utility to move files from legacy flat layout to version 2 nested layout.

## 6. Job Infrastructure & Registry Specification
- **Goal**: Dynamic dispatch for plugin-provided handlers.
- **Registration Pattern**:
    - Plugins register handlers during server startup: `registry.register_handler(kind="synthesis", engine="xtts", handler=handle_xtts_job)`.
    - `worker.py` dispatch logic: `handler = registry.get_handler(job.kind, job.engine)`.
- **Composite Handoff**: `composite.py` (formerly `mixed.py`) will use `engine.get_adapter()` to fetch sanitizers and progress parsers for each segment's target engine.

---

# Implementation Plan Notes: What to Expect

Each phase of the migration is designed to be non-destructive and verifiable. Here is what you can expect during implementation:

### Phase 1: Directory & Folder Cleanup
- **Approach**: Move operations first, then deletions.
- **Notes**: We will use `git mv` where possible to preserve history. Deletions of `xtts_audio` and `uploads` will only happen after verifying that no active project is referencing files in those locations.

### Phase 2: Storage Abstraction Layer
- **Approach**: Shadow-testing.
- **Notes**: We will implement the `StorageManager` alongside the existing `config.py` constants. We will update callers one by one, verifying that `StorageManager.get_path()` returns the same string as the legacy constant before switching over.

### Phase 3: Configuration & Models
- **Approach**: "Stringify" then "Classify".
- **Notes**: Changing `Engine` from a `Literal` to `str` will be the first step to prevent type-checker errors. Then we will introduce `JobKind` to properly categorize orchestrators vs. synthesisers.

### Phase 4: Plugin Implementation Relocation
- **Approach**: Adapter encapsulation.
- **Notes**: We will move handlers into `plugins/` and expose them via a standardized `PluginAdapter` class. This ensures that the core app only interacts with the `VoiceBridge` interface.

### Phase 5: Core Orchestration Generalization
- **Approach**: Registry-based dispatch.
- **Notes**: The `worker.py` loop will be updated to a "Look-up and Run" pattern. This is the most sensitive part of the migration and will be heavily tested with the 80+ existing unit tests.

### Phase 6: Documentation & Final Audit
- **Approach**: Developer-centric.
- **Notes**: The final documentation will focus on making it easy for a new developer to add a "Third Engine" by simply dropping a folder into `plugins/` and following the manifest schema.
