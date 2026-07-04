# LF-4 — MetadataEditorModal.tsx split (code-map queue entry)

Task: `design-docs/plans/active/simplification/04_large_file_splits.md` LF-4.

Pure refactor, zero behavior change. `MetadataEditorModal` public name, props
(`MetadataEditorModalProps`), and export unchanged.

## Files changed

- `frontend/src/pages/Voices/components/MetadataEditorModal.tsx` — modified (717 → 298
  lines). Kept the modal component itself (local draft state, save/patch handler, JSX
  layout for header/body/footer). Removed the taxonomy data, `getSection`, `chip`,
  `OneSelect`, `ManySelect`, `TagsInput`, `IconUpload` — all now imported from the new
  `metadata/` folder.
- `frontend/src/pages/Voices/components/metadata/taxonomy.ts` — added. `TaxonomySection`
  type, the `taxonomy` vocabulary object, and `getSection()` — moved verbatim.
- `frontend/src/pages/Voices/components/metadata/chip.tsx` — added. The `chip()` render
  helper — moved verbatim.
- `frontend/src/pages/Voices/components/metadata/OneSelect.tsx` — added. `OneSelect`
  component — moved verbatim (dropped the now-unused top-level `React` import; JSX
  runtime doesn't require it and TS flagged it unused).
- `frontend/src/pages/Voices/components/metadata/ManySelect.tsx` — added. `ManySelect`
  component — moved verbatim (same unused-`React`-import cleanup as OneSelect).
- `frontend/src/pages/Voices/components/metadata/TagsInput.tsx` — added. `TagsInput`
  component — moved verbatim.
- `frontend/src/pages/Voices/components/metadata/IconUpload.tsx` — added. `IconUpload`
  component — moved verbatim.

No changes to `frontend/tests/unit/pages/Voices/components/MetadataEditor.test.tsx` —
it only imports the public `MetadataEditorModal` via dynamic `import()`, not the
internal widgets.

## Verification

- `npx eslint` on the modal file + all 6 new `metadata/` files — 0 errors, 0 new
  warnings.
- `npx tsc -b --noEmit` (frontend) — clean after removing the two unused `React`
  imports flagged by TS6133.
- `npm -C frontend run test -- --run --maxWorkers=1
  tests/unit/pages/Voices/components/MetadataEditor.test.tsx` — 9 tests, all passing.

## Flow impact

None — same markup renders from the same component tree; only file boundaries changed.
