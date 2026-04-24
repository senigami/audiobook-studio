# Phase 8: Shell Cutover And Product Hardening

## Objective

Finish the visible Studio 2.0 shell and the highest-value product seams before opening the system outward. Phase 8 starts with the queue moving into the right-side companion drawer so users can manage work without losing page context.

## Deliverables

- queue drawer cutover as the primary queue surface
- queue tab opens the right-side drawer without navigating away from the current page
- `/queue` remains as a compatibility/deep-link entry that resolves into the queue drawer behavior
- queue-related actions open or focus the drawer instead of redirecting the user to a dedicated queue page
- `GlobalQueue` is adapted for drawer density, scrolling, and constrained-width controls
- project snapshot and export-manifest foundation is implemented in the project domain
- dated project backup/export bundle foundation is implemented with clear artifact-included vs regenerate-on-import reporting
- plugin setup, dependency, and recovery diagnostics are clearer in the schema-driven engine settings surface
- fake, stale, or misleading legacy repair/backfill paths are retired, deprecated, or replaced with explicit behavior
- phase docs and product docs are synchronized with the post-Phase-7 settings and shell reality

## Deliverables Checklist

- [x] Queue drawer shell behavior implemented
- [x] Queue tab opens the drawer while preserving the current route
- [x] Queue compatibility route/deep link behavior implemented
- [x] Queue action flows updated to focus the drawer
- [x] Drawer-optimized queue layout and controls implemented
- [x] Project snapshot creation implemented through the project domain
- [x] Project export manifest implemented through the project domain
- [x] First backup/export bundle mode implemented
- [ ] Plugin setup and diagnostics UX hardened without engine-specific UI branches
- [ ] Legacy backfill/repair placeholders audited and explicitly handled
- [ ] Phase and product docs updated to match shipped behavior

## Deferred Follow-Up: Storage Normalization

The current backup implementation is acceptable as an interim project safety feature: text metadata and chapter-level WAV masters are portable, while segment-level audio remains in the existing project audio layout.

Before restore/import becomes a first-class workflow, the project file layout should be normalized around per-chapter asset folders:

```text
project/
  backups/
  m4b/
  trash/
  cover/
  chapters/
    {chapter_id}/
      chapter.txt
      chapter.wav
      chapter.m4a
      chapter.json
      segments/
        {segment_id}.wav
```

This should be planned as a storage migration slice, not a backup-only cleanup. It needs compatibility reads for existing flat audio paths, generation/write-path updates, cleanup/trash handling, backup packaging updates, and regression coverage for existing projects.

### Storage Migration Checklist

- [ ] Add compatibility reads for existing flat chapter audio paths while the new chapter folder layout is introduced.
- [ ] Move chapter write paths to per-chapter folders with room for text, chapter masters, segment WAVs, and future chapter metadata.
- [ ] Update cleanup/trash behavior so chapter assets remain safely grouped under the chapter folder.
- [ ] Update backup packaging so the new chapter structure is preserved cleanly.
- [ ] Add regression tests for mixed old/new chapter layouts during migration.

Issue #38 should be folded into the same structural portability track for voice storage. Voice assets should move away from flat variant-encoded folders like `Dracula - Angry` toward explicit voice roots with variant subfolders:

```text
voices/
  {voice_name_or_id}/
    voice.json
    Default/
      profile.json
      latent.pth
      sample.mp3
      samples/
    {variant_name_or_id}/
      profile.json
      latent.pth
      sample.mp3
      samples/
```

This voice migration should preserve the generic plugin/engine model: `voice.json` owns voice-level portable metadata, `profile.json` owns variant-level metadata, and the database remains useful for indexing, assignments, and fast lookup. It should include nested-layout read support, flat-folder compatibility, migration helpers, rename/import/export updates, and assignment regression tests.

### Voice Migration Checklist

- [ ] Add nested voice/variant folder read support without breaking existing flat folders.
- [ ] Introduce `voice.json` for voice-level portable metadata.
- [ ] Keep `profile.json` as the variant-level metadata boundary.
- [ ] Add migration helpers for existing flat variant-encoded folders.
- [ ] Update rename, move, import, and export flows for the nested voice structure.
- [ ] Add regression tests for default resolution and assignment behavior across both layouts.

## Progress Notes

- Queue moved into the right-side companion drawer and remains route-compatible.
- Project snapshots, export manifests, dated backup bundles, downloadable archives, and stored backup history are implemented.
- Project tabs now expose Chapters, Assemblies, Backups, and Characters in the live shell.
- Project management ergonomics finalized: Chapters tab now owns the primary assembly creation flow, the action bar is responsive at narrow widths, and Assemblies/Backups support inline description editing.
- Backup archival corrected: Archives now strictly include WAV-only assets when audio inclusion is enabled, verified by zip-content regression tests.
- Chapter-folder and voice-folder storage normalization have been captured as follow-up candidates; current backups intentionally preserve chapter-level WAV masters only until segment storage is migrated.
- Remaining Phase 8 work is now the plugin diagnostics/recovery pass and the stale-legacy cleanup pass.

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

- [ ] Queue drawer navigation tests pass
- [ ] Queue compatibility/deep-link tests pass
- [ ] Queue component tests pass in the drawer layout
- [ ] Project snapshot tests pass
- [ ] Project export manifest tests pass
- [ ] Backup/export bundle validation passes
- [ ] Plugin diagnostics tests pass
- [ ] Frontend build passes
- [ ] Targeted backend regression passes

## Exit Gate

- the queue is a stable right-side companion surface that does not pull users away from their current work
- Studio has a real project snapshot/export foundation for portability and backup work
- plugin setup and recovery UX are clear without breaking the generic schema-driven model
- stale legacy placeholders no longer misrepresent product behavior
