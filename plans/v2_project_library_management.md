# Proposal: Project, Library, And Asset Management (Studio 2.0)

This plan defines how I want the product’s content model to work. The distinction between project-owned data, library-owned data, and immutable shared artifacts is essential to portability and correctness.

## 1. Objectives

- Make project data portable and self-contained enough to move or back up safely.
- Keep reusable voice assets in a clean library model.
- Reuse immutable artifacts safely across projects where possible.
- Surface asset health and dependency impact clearly in the UI.

## 2. What I Want To Create

### 2.1 Voice Library

- Canonical voice profiles
- Engine-specific voice assets
- Sample ingestion and validation flow
- Compatibility metadata for engine support and asset readiness

### 2.2 Project Domain

- Stable project root with explicit metadata
- Project defaults such as narrator, output preset, pronunciation profile, and preferred engine behavior
- Chapter drafts, block state, snapshots, exports, and import history

### 2.3 Shared Artifact Cache

- Immutable artifact store keyed by artifact hash
- Safe reuse only when the requested revision matches exactly
- Project-local references to immutable artifacts, not mutable shared files

## 3. Project Creation Flow

I want project creation to be a guided flow, not one big modal dump:

1. Project metadata
2. Source text import
3. Default narrator and output preset
4. Review and create

## 4. Library Safety Rules

- Editing a voice profile must show which projects depend on it.
- Future renders may use the new settings; old renders remain tied to the snapshot used when they were created.
- If a library change makes some projects stale, the UI must say so explicitly.

## 5. Portability Rules

- Projects must not depend on hidden absolute paths.
- A project export or backup must contain enough metadata to restore chapter, block, and render relationships.
- Shared cached artifacts may be omitted from a lightweight export only if the system can clearly report which outputs will need regeneration on import.

## 6. Asset Health UX

Project and library screens should surface:

- missing cover art
- missing narrator
- invalid or missing voice assets
- stale renders
- failed blocks or exports
- ready-to-export state

## 7. Risks And Planned Solutions

- **Risk: Cross-project reuse creates hidden coupling**
  Solution: reuse immutable artifacts only; never share mutable project output paths.
- **Risk: Voice library edits create invisible behavior drift**
  Solution: snapshot render-time voice asset and engine metadata into artifact manifests and project references.
- **Risk: Portability becomes partial and confusing**
  Solution: define export modes clearly, including whether cached artifacts are embedded or expected to be rebuilt.

## 8. What Good Looks Like

- A user can tell which projects need attention the moment they open the library.
- A project can be moved or backed up without mysterious missing state.
- Voice edits are powerful but safe, because their effect on past and future renders is explicit.

## 9. Implementation References

- `plans/implementation/domain_data_model.md`
- `plans/v2_folder_structure.md`
- `plans/v2_voice_system_interface.md`
