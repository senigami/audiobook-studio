# Discovery Report: Storage Normalization (Chapters & Voices)

## 1. Executive Summary
This report outlines the technical path for transitioning the Audiobook Studio storage layout from a flat, prefix-based model to a structured, versioned nested hierarchy. This normalization is required to scale asset management, improve backup granularity, and simplify multi-variant voice handling.

**Status:** Research Complete. Implementation deferred to subsequent phase.
**Migration Strategy:** Detect `v1` layouts, migrate them to `v2`, and then operate on the versioned layout going forward instead of maintaining parallel structures indefinitely.

---

## 2. Target Layouts

### Chapter Assets
| Asset Type | Current (Flat) | Target (Nested) |
| :--- | :--- | :--- |
| **Merged Audio** | `projects/{pid}/audio/{cid}.wav` | `projects/{pid}/chapters/{cid}/chapter.wav` |
| **Segment Audio** | `projects/{pid}/audio/chunk_{sid}.wav` | `projects/{pid}/chapters/{cid}/segments/{sid}.wav` |
| **Source Text** | `projects/{pid}/text/{cid}.txt` | `projects/{pid}/chapters/{cid}/chapter.txt` |
| **Metadata** | `N/A` (In SQLite) | `projects/{pid}/chapters/{cid}/chapter.json` (Future) |

### Project Root Metadata
| Asset Type | Current (Flat) | Target (Versioned) |
| :--- | :--- | :--- |
| **Project Manifest** | `N/A` | `projects/{pid}/project.json` |
| **Schema Version** | `N/A` | `project.json.schema_version` |

### Voice Assets
| Asset Type | Current (Flat) | Target (Nested) |
| :--- | :--- | :--- |
| **Voice Profile** | `voices/{voice} - {variant}/profile.json` | `voices/{voice}/{variant}/profile.json` |
| **Latents** | `voices/{voice} - {variant}/latent.pth` | `voices/{voice}/{variant}/latent.pth` |
| **Samples** | `voices/{voice} - {variant}/*.wav` | `voices/{voice}/{variant}/*.wav` |
| **Root Metadata** | `N/A` | `voices/{voice}/voice.json` |

---

## 3. Impacted Code Paths (Audit Results)

### Backend: Core Infrastructure
*   **`app/config.py`**:
    *   `get_project_audio_dir(project_id)`: Currently returns `PROJECTS_DIR / project_id / "audio"`. Needs to be superseded by chapter-specific helpers.
    *   `get_project_text_dir(project_id)`: Currently returns `PROJECTS_DIR / project_id / "text"`.
*   **`app/db/chapters.py`**:
    *   `add_chapter()`: Hardcodes "audio" and "text" subfolder assumptions.
    *   `cleanup_chapter_audio_files()`: Uses `chapter_id` as a glob prefix to delete files in the flat audio directory.
*   **`app/jobs/handlers/xtts.py`**:
    *   Worker constructs paths like `pdir / f"chunk_{sid}.wav"` where `pdir` is the flat audio folder.

### Backend: Voice Registry
*   **`app/jobs/speaker.py`**:
    *   `_resolve_existing_profile_name()`: Relies on `startswith(prefix_source + " - ")` for variant matching.
    *   `get_voice_profile_dir()`: Assumes a single-level directory structure under `VOICES_DIR`.

### Frontend: Asset Resolution
*   **`frontend/src/components/project/ChapterList.tsx`**:
    *   Download links hardcode `/projects/${projectId}/audio/${path}`.
*   **`frontend/src/hooks/useChapterPlayback.ts`**:
    *   Playback URL logic hardcodes `/audio/` and tries various suffix fallbacks.

---

## 4. Implementation Roadmap (Phased)

### Phase 1: Version Detection And Manifest
*   **Objective:** Detect `v1` versus `v2` projects and store version metadata in the project root.
*   **Backend**: Add a small project manifest helper in `config.py` or a storage utility that can read/write `projects/{pid}/project.json`.
*   **Migration Gate**: If a `v1` project is detected, migrate it to `v2` before continuing normal operations.
*   **Scope**: Keep the detection and manifest logic narrow so the rest of the codebase can rely on a single active layout.

### Phase 2: Active Migration (Chapters)
*   **Objective:** Move chapter files to the new structure.
*   **Tooling**: Implement a CLI command or startup migration task that traverses `projects/` and migrates files based on DB state.
*   **Write-Path**: Update `xtts.py` and `chapters.py` to write to the new nested directories.

### Phase 3: Voice Normalization
*   **Objective:** Transition to nested voice folders.
*   **Logic**: Update `speaker.py` to support `voices/{voice}/{variant}`.
*   **Compatibility**: Maintain support for the " - " separator as a fallback during the transition.

---

## 5. Risk Assessment & Guardrails

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Broken Audio Links** | High (UI Unusable) | Implement server-side symlink support or path-rewriting middleware in FastAPI. |
| **Orphaned Files** | Medium (Disk Bloat) | The migration script must verify DB presence before deleting/moving files. |
| **Test Regression** | High | Mocked file system fixtures in `test_chapter_features.py` must be updated to use the `config` resolution helpers rather than hardcoded Paths. |

---

## 6. Verification Checklist (Future implementation)
- [ ] Project manifest version is detected and persisted correctly.
- [ ] `v1` projects migrate to `v2` before normal chapter reads/writes proceed.
- [ ] Chapter audio plays correctly for both migrated and fresh chapters.
- [ ] Voice variants are correctly listed in the "Voice Profile" selector.
- [ ] Deleting a chapter correctly removes the entire `chapters/{cid}/` folder.
- [ ] Exporting a chapter ZIP/M4A works without path errors.
