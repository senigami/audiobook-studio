# LF-3 — PredictiveProgressBar.tsx split (code-map queue entry)

Task: `design-docs/plans/active/simplification/04_large_file_splits.md` LF-3.

Pure refactor, zero behavior change. `PredictiveProgressBar` public name/props/exports
unchanged (including the re-exported `PredictiveProgressDebugSnapshot` type and
`resetPredictiveProgressMemory`).

Note: the file was already living under a `PredictiveProgressBar/` folder with
`predictiveProgressBarHelpers.ts` (pure math, per the plan) and
`predictiveProgressBarDebug.ts`/`useEtaConfidence.ts` already extracted from an earlier
pass. The main component file itself was still 789 lines, so this task continued that
existing split.

## Files changed

- `frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx` —
  modified (789 → 668 lines). Removed the lane-migration types/pure functions
  (`ProgressLane`, `LaneMigration`, `resolveEndAtMs`, `getLaneProgress`,
  `getRenderedStartAtMs`, `getRenderedEndAtMs`, `getRenderedStartProgress`) and the
  label/percent/ETA header row JSX; both are now imported. Kept: props/exports, the
  progress-memory module state, `updateLaneToTarget` (stateful lane-migration logic that
  reads/writes component refs — stays with the component), effects, and both `barOnly`/
  full JSX render paths.
- `frontend/src/components/progress/PredictiveProgressBar/predictiveProgressBarLane.ts` —
  added. Pure lane-math module: `ProgressLane`/`LaneMigration` types plus
  `resolveEndAtMs`, `getLaneProgress`, `getRenderedStartAtMs`, `getRenderedEndAtMs`,
  `getRenderedStartProgress` — moved verbatim (byte-identical bodies) from the main file.
- `frontend/src/components/progress/PredictiveProgressBar/ProgressStatusRow.tsx` — added.
  New `ProgressStatusRow` presentational component: the label/percent/ETA/status-text row
  rendered above the fill track (previously an inline `{(showLabel || showPercent ||
  showEta) && (...)}` block). Markup, styles, and conditions preserved exactly; only
  wrapped in a component boundary with an early `return null` in place of the `&&` guard.

## Verification

- `npx eslint` on all 3 touched/added files — 0 errors (1 pre-existing `react-refresh/
  only-export-components` warning on the main file, unrelated to this change — it also
  exports `resetPredictiveProgressMemory` and the debug-snapshot type re-export).
- `npx tsc -p frontend/tsconfig.json --noEmit` — clean.
- `npm -C frontend run test -- --run --maxWorkers=1` on the 7 PredictiveProgressBar test
  files (`PredictiveProgressBarRendering`, `Confidence`, `NaN`, `Lifecycle`,
  `Transitions`, `Timing`, and `tests/unit/components/progress/PredictiveProgressBar`) —
  92 tests, all passing.

## Flow impact

None — same markup renders from the same component tree; only file boundaries changed.
