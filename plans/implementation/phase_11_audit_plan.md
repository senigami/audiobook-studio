# Phase 11 Cleanup Audit & Execution Plan

## 1. Audit Results: Legacy Runtime Residue

The following locations contain active runtime logic that either uses legacy paths or is improperly named as "compatibility" while serving as the primary v2 implementation.

### A. Legacy Path Fallbacks (High Priority)
- **`app/jobs/reconcile.py`**: `_output_exists` and `cleanup_and_reconcile` look in `get_project_audio_dir(project_id)`, which resolves to `projects/{project_id}/audio`. This is a legacy "flat" project layout. It should use `config.resolve_chapter_asset_path` to find files in the v2 nested layout: `projects/{project_id}/chapters/{chapter_id}/`.
- **`app/api/utils.py`**: `exists` function uses the same legacy project-level audio/text directory logic.
- **`app/api/routers/generation.py`**: Still writes temporary text files to the project-level `text/` directory and checks the project-level `audio/` directory for existing segments.

### B. Improper Naming (Masking Technical Debt)
- **`app/domain/chapters/compatibility*`**: These modules (`compatibility.py`, `compatibility_assets.py`, `compatibility_blocks.py`, `compatibility_helpers.py`, `compatibility_ops.py`) are the **active implementation** of the production blocks and script view APIs. They are NOT shims for old data; they are the v2 runtime. Their naming as "compatibility" masks them as legacy debt when they are actually core logic.
- **`app/engines/behavior.py`**: `get_behavior` is a "backward compatibility shim" that is used throughout the runtime.

### C. Legacy Voice Support
- **`app/db/speakers.py`**: Contains extensive fallback logic for "flat" voice directories (voices where the folder name IS the profile name). Studio 2.0 uses a nested `VoiceRoot/Variant` structure.

---

## 2. Execution Plan

### Step 1: Fix Pathing in Reconciliation & Utilities
- Refactor `app/jobs/reconcile.py` to use `config.resolve_chapter_asset_path` for all chapter-scoped existence checks.
- Refactor `app/api/utils.py` similarly.
- Update `app/api/routers/generation.py` to use the nested chapter directory for temporary assets.

### Step 2: Relocate/Rename Chapters Domain Logic
- Move `app/domain/chapters/compatibility*` logic into properly named modules:
    - `compatibility_ops.py` -> `production_service.py` (or integrated into `service.py`)
    - `compatibility_blocks.py` -> `blocks.py`
    - `compatibility_assets.py` -> `assets.py`
    - `compatibility_helpers.py` -> `helpers.py`
- Update all imports in `app/api/routers/` to point to the new locations.

### Step 3: Strict Isolation of Voice Fallbacks
- Move the "flat" voice directory discovery and migration logic from `app/db/speakers.py` into `app/db/migration.py`.
- Ensure `app/db/speakers.py` only operates on the v2 `VoiceRoot/Variant` structure in the runtime.

---

## 3. Verification Plan
- **Tests**: Run `pytest tests/test_jobs_reconcile.py` and `pytest tests/test_api_chapters.py` (if they exist).
- **Manual**: Verify that "Export Audio" and "Production View" still work in the UI (simulated by checking the API responses).

## 4. Remaining Risks
- The `app/domain/chapters/compatibility*` logic seems deeply coupled to the current frontend's expectations for "Production Blocks". Any change in payload structure would be a regression. I will focus on renaming and relocating rather than changing the logic itself, unless it explicitly handles old-format data.
