# LF-2 — EngineCard.tsx split (code-map queue entry)

Task: `design-docs/plans/active/simplification/04_large_file_splits.md` LF-2.

Pure refactor, zero behavior change. `EngineCard` public name/props/exports unchanged.

## Files changed

- `frontend/src/pages/Engines/components/EngineCard.tsx` — modified (792 → 562 lines).
  Removed inline JSX for the collapsed-header calibration chip, the expanded-panel
  calibration/speed section, the settings panel (metadata + JSON schema form), and the
  "Latest Test Sample" playback block. Kept as shell: header row, status/enable toggle,
  privacy/setup banners, action buttons (Run Test / Verify / Install Deps / Uninstall),
  `ConfirmModal`, `EngineDevPanel`, and `PluginTrustModal` wiring. Added a shared
  `handleResetCalibration` helper used by both the header chip and the expanded section
  (previously duplicated inline).
- `frontend/src/pages/Engines/components/EngineCalibrationSection.tsx` — added.
  Exports `EngineCalibrationChip` (collapsed-header calibration chip + reset link) and
  `EngineCalibrationSection` (expanded "Voice generation speed" summary block).
- `frontend/src/pages/Engines/components/EngineSettingsForm.tsx` — added.
  Wraps `EngineMetadataPanel` + `JsonSchemaForm` and the visibility gating
  (`hide_settings_when_not_ready` / `hide_settings_when_unverified` / `hidden`) that used
  to live inline in `EngineCard`.
- `frontend/src/pages/Engines/components/EngineTestSample.tsx` — added.
  "Latest Test Sample" playback block (play/pause via `playerBus`).

## Deviation from plan

The LF-2 plan note also suggested moving `PluginTrustModal` ownership up to `EnginesPanel`
(card fires a callback instead of owning open/close). That change touches `EnginesPanel.tsx`,
which is outside this task's scope (told to touch only the EngineCard file, its own files,
and its own tests). Left `PluginTrustModal`/install-deps modal state owned by `EngineCard`
as before — flagging for a follow-up task if the owner still wants that ownership move.

## Verification

- `npx eslint` on all 4 touched/added files — clean.
- `npx tsc -b --noEmit` (frontend) — clean after fixing `EngineTestSample`'s `testResult`
  prop type to `TtsEngine['last_test']` (was a loosened inline type causing a
  `string | undefined` vs `string` mismatch on `audioUrl`).
- `npm -C frontend run test -- --run --maxWorkers=1 tests/unit/pages/Engines/components/EngineCard.test.tsx tests/unit/pages/Engines/components/EngineCardInstall.test.tsx` — 2 files, 30 tests, all passing.

## Flow impact

None — same component tree renders the same markup; only file boundaries changed.
