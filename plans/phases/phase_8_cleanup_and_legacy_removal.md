# Phase 8: Shell Cutover And Product Hardening

## Objective

Finish the visible Studio 2.0 shell and the highest-value product seams before opening the system outward. Phase 8 starts with the queue moving into the right-side companion drawer so users can manage work without losing page context.

## Deliverables
- [x] queue drawer cutover as the primary queue surface
- [x] queue tab opens the right-side drawer without navigating away from the current page
- [x] `/queue` remains as a compatibility/deep-link entry that resolves into the queue drawer behavior
- [x] queue-related actions open or focus the drawer instead of redirecting the user to a dedicated queue page
- [x] `GlobalQueue` is adapted for drawer density, scrolling, and constrained-width controls
- [x] project snapshot and export-manifest foundation is implemented in the project domain
- [x] dated project backup/export bundle foundation is implemented with clear artifact-included vs regenerate-on-import reporting
- [x] plugin setup, dependency, and recovery diagnostics are clearer in the schema-driven engine settings surface
- [x] fake, stale, or misleading legacy repair/backfill paths are retired, deprecated, or replaced with explicit behavior
- [x] phase docs and product docs are synchronized with the post-Phase-7 settings and shell reality
- [x] **Storage Normalization**: project and voice asset storage moved to versioned nested layouts (v2)
- [x] **Project Manifest Enrichment**: `project.json` now includes version, title, author, and series metadata (backfilled for v2)
- [x] **Asset Cleanup**: legacy flat audio/text residues are removed after successful v2 chapter migration
- [x] **One-time Backfill**: v2 voice roots normalized with `default_variant` and metadata reconciled to prevent stale status
- [x] **Voice Portability (Issue #39)**: Whole-voice bundle export/import (metadata, model assets, and optional source WAVs)

## Deliverables Checklist

- [x] Queue drawer shell behavior implemented
- [x] Queue tab opens the drawer while preserving the current route
- [x] Queue compatibility route/deep link behavior implemented
- [x] Queue action flows updated to focus the drawer
- [x] Drawer-optimized queue layout and controls implemented
- [x] Project snapshot creation implemented through the project domain
- [x] Project export manifest implemented through the project domain
- [x] First backup/export bundle mode implemented
- [x] Plugin setup and diagnostics UX hardened without engine-specific UI branches
- [x] Legacy backfill/repair placeholders audited and explicitly handled
- [x] Phase and product docs updated to match shipped behavior
- [x] Project storage normalized around per-chapter asset folders (v2)
- [x] Voice storage normalized around nested voice/variant roots (v2)
- [x] Cleanup sweep for legacy chapter audio/text residues implemented
- [x] **Voice Portability**: Export/import bundles for v2 voices (Issue #39)

## Verified Storage Normalization (v2)

The project and voice storage migration was implemented as a versioned cutover (v1 to v2) and verified against both targeted regression tests and live workspace data.

### Project & Chapter Migration
- [x] Define the `v1` and `v2` project manifest/version contract.
- [x] Add the root `project.json` manifest with schema/version metadata (enriched with DB metadata).
- [x] Migrate `v1` chapter assets into the `v2` folder structure (`chapters/{id}/`).
- [x] Add compatibility reads for existing flat chapter audio paths.
- [x] Move chapter write paths to per-chapter folders.
- [x] Update cleanup/trash behavior to group assets under chapter folders.
- [x] Implement residue cleanup (removal of legacy `audio/` and `text/` folders) after successful migration.

### Voice Migration
- [x] Add nested voice/variant folder read support (v2) without breaking legacy flat folders (v1).
- [x] Introduce `voice.json` for voice-root portable metadata.
- [x] Keep `profile.json` as the variant-level metadata boundary.
- [x] Add migration helpers for legacy flat variant-encoded folders.
- [x] Handle root-to-Default migration (e.g., `voices/Test` -> `voices/Test/Default`).
- [x] Update rename, move, and assignment flows for the nested structure.

## Progress Notes

- Queue moved into the right-side companion drawer and remains route-compatible.
- Project snapshots, export manifests, dated backup bundles, downloadable archives, and stored backup history are implemented.
- Project tabs now expose Chapters, Assemblies, Backups, and Characters in the live shell.
- Project management ergonomics finalized: Chapters tab now owns the primary assembly creation flow, the action bar is responsive at narrow widths, and Assemblies/Backups support inline description editing.
- Backup archival corrected: Archives now strictly include WAV-only assets when audio inclusion is enabled, verified by zip-content regression tests.
- **Storage Normalization Complete**: Chapter and voice storage have been successfully migrated to v2 nested structures.
- **Cleanup Verified**: Legacy chapter residues (`audio/`, `text/`) are automatically removed after migration, confirmed on live data.
- **Voice Relocation Verified**: Root-level voices and flat variant folders are correctly moved to nested roots with `voice.json` manifests.
- Plugin diagnostics and recovery UX have been hardened, and legacy placeholders (like "Safe Mode") have been replaced with clearer terminology ("Stability Mode").
- Structural legacy paths (backfill/repair) have been audited and confirmed as isolated system utilities.
- Character assignment "None / Default" tool has been restored with a "No-Op" policy.
- **Voice Portability (Issue #39)**: Whole-voice export/import implemented. Zip bundles include `voice.json`, `bundle.json`, variant profiles, model latents, and preview assets. Source WAV inclusion is optional via export toggle. Import handles duplicates via safe suffixing (e.g., "Voice 2").
- All Phase 8 cleanup and diagnostic audit items are complete.

## Scope

- preserve the generic plugin and engine model
- keep settings schema-driven and plugin-owned
- do not reintroduce `SettingsTray`
- treat the queue as a global companion surface, not a destination-first page
- prioritize concrete user-visible product improvements over cleanup for its own sake
- only remove legacy paths after the replacement behavior is proven
- project portability work should start with clear metadata and manifest contracts before full restore UX

## Tests

- shell/navigation tests for queue drawer open/close behavior
- compatibility tests for `/queue` deep links and refresh behavior
- targeted queue component tests in drawer-width conditions
- enqueue and queue-focus interaction tests from project and chapter surfaces
- project snapshot and export manifest tests
- backup/export bundle validation tests
- plugin diagnostics and engine-card behavior tests
- frontend build
- targeted backend regression suite

## Verification Checklist

- [x] Queue drawer navigation tests pass
- [x] Queue compatibility/deep-link tests pass
- [x] Queue component tests pass in the drawer layout
- [x] Project snapshot tests pass
- [x] Project export manifest tests pass
- [x] Backup/export bundle validation passes
- [x] Plugin diagnostics tests pass
- [x] Frontend build passes
- [x] Targeted backend regression passes

## Exit Gate

- the queue is a stable right-side companion surface that does not pull users away from their current work
- Studio has a real project snapshot/export foundation for portability and backup work
- plugin setup and recovery UX are clear without breaking the generic schema-driven model
- stale legacy placeholders no longer misrepresent product behavior
