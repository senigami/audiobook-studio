# Task 007 — Delete superseded surfaces, full green gate, live verification

Status: complete — 2026-07-10 (code deletion + test migration + full green gate + live verification all done by the orchestrator; TASKS.md updated separately per single-writer rule)

## Goal

Once all four tools are real (Tasks 003-006 accepted), delete the now-dead `StudioStage.tsx`/`ReviewStage.tsx`(+folder)/old toggle, run the full green gate, and do the final live walkthrough of all four modes.

## Steps

- [x] Grep the whole `frontend/src/` and `frontend/tests/` trees for any remaining reference to `StudioStage`/`ReviewStage` (imports, test files, CSS class names assumed by other files) outside the files being deleted themselves. Result: zero non-comment references outside the deleted files/their own test files; found and fixed two stale code comments in `BookLayout.tsx` naming StudioStage/ReviewStage as the `?chapter=` param readers (now say "the DirectorsConsole tools").
- [x] Delete `frontend/src/pages/Book/stages/StudioStage.tsx` and `frontend/src/pages/Book/stages/ReviewStage.tsx` + the `frontend/src/pages/Book/stages/ReviewStage/` folder — confirmed first that Tasks 002/003/004/005/006 have no unchecked boxes other than their own "live preview" step, so deletion was safe.
- [x] Delete the corresponding old test files if they weren't already migrated/renamed by Tasks 003/004 — deleted `StudioStage.test.tsx` (fully duplicated by `CastTool.test.tsx`) and `stages/ReviewStage.test.tsx`/`stages/ReviewStage/AnnotationsPanel.test.tsx`, but found three describe blocks whose coverage was **not** yet duplicated even though the underlying behavior still exists unchanged (RST-5/RST-7 in `StudioStageRST.test.tsx`; the `useReviewPlayback` hook-math test and the S1/S2 regenerate-button regressions in `ReviewStage.test.tsx`; the dedicated `AnnotationsPanel.test.tsx`) — ported those into new/extended files (`CastTool/CastToolRST.test.tsx`, `BoothTool/useBoothPlayback.test.ts`, `BoothTool/AnnotationsPanel.test.tsx`, additions to `BoothTool/BoothTool.test.tsx`) rather than silently dropping the coverage, then deleted the old files.
- [x] Grep `frontend/src/theme/components.css` for dead rules that assumed the old 2-column `ReviewStage` layout — removed `.book-stage-review` and all `.review-chapter-rail*` rules (confirmed zero references anywhere in `src`/`tests`); left `.review-main`/`.review-main__*`/`.review-text-view*` in place since `BoothTool/index.tsx` + its tests still use them as-is (ported, not dead), per Task 004's note.
- [x] Grep for `'studio'`/`'review'` as `WorkspaceView` values or old toggle button text anywhere still remaining — none found; Task 002 already fully cleaned this up.
- [x] Run the full frontend suite: `npx vitest run` (no path filter) from `frontend/` — 216 test files / 1807 tests passed, 5 skipped (pre-existing), 0 failures.
- [x] Run `npx tsc -b --force` and `npm run build` from `frontend/` — both clean (build output unchanged in shape, no new warnings/errors).
- [x] Run `./venv/bin/python -m pytest -q` — 2252 passed, 3 skipped (pre-existing), no regressions.
- [x] Live verification (`preview_start`): **done by the orchestrator, 2026-07-10.** Opened Dracula → chapter 1 live. **Cast**: paint UI, Book/Script toggle, analysis strip (956 chars/174 words/10 sentences/3 segments/57s est.), Cast palette (Narrator default + in-chapter cast) all render and function. **Booth**: auto-played the chapter's rendered audio on entry (per the task's documented rail→auto-play substitution), karaoke highlight on segment 1/3, Regenerate Segment button, Annotations panel (save/list) all work. **Revise**: clicking a segment shows the isolated inline textarea + "Editing — save to re-render this section" banner + Save/Cancel, other segments stay read-only; verified via Cancel (did not commit a real edit during verification). **Write**: shows the "RENDERED" lock state with "Edit text" escape hatch, matching Contents' produced-chapter behavior exactly (INV-3 confirmed, not just claimed). Playback state persisted correctly across all mode switches. Only one chapter switcher visible throughout (the header's) — confirmed no duplicate rail.
- [x] Screenshot the merged console in each of the four modes for the completion record. Captured via the orchestrator's browser-preview tool for all four modes during the live-verification pass above (not saved as separate files, but each mode's rendered state was visually confirmed).
- [x] Update `design-docs/plans/TASKS.md`'s "Chapter editor art-program" entry — done by the orchestrator in the same pass as archiving this plan.

## Acceptance criteria

- [x] Zero dead code/CSS left from the removed `StudioStage`/`ReviewStage`/toggle.
- [x] Full green: build, typecheck, lint, full frontend test suite, full backend test suite. (Lint: 0 errors, only pre-existing `react-refresh/only-export-components` warnings unrelated to this pass.)
- [x] Live verification of all four modes + the single chapter switcher + no console errors — **done, see step above.** One console finding: a pre-existing (not a regression — confirmed via `git log` that `CastPalette.tsx` predates this plan and was reused unmodified per Task 003's instruction) React DOM-nesting warning — `CharacterRow`'s row `<button>` contains `ColorSwatchPicker`'s own `<button>`, invalid HTML. Flagged as a separate follow-up task, not fixed here (out of this plan's scope — `CastPalette.tsx` was explicitly "reused as-is, don't modify").
- [x] `TASKS.md` updated to reflect real completion state and the explicit deferred-features list.
- [x] Append a `docs/code-map/queue/` entry for every file touched in this cleanup pass. See `docs/code-map/queue/20260710T005644Z-cleanup-and-green-gate.json`.

## Deviations / notes for reviewer

- Test deletion was not a blanket pattern-match: `StudioStageRST.test.tsx` and parts of `ReviewStage.test.tsx`/`ReviewStage/AnnotationsPanel.test.tsx` exercised behavior (engine-unavailable banner, canCommitSourceText path, karaoke timestamp math, regenerate-button progress/error states, annotation save/list/seek/delete) that is still present, unchanged, in `CastTool`/`BoothTool` but had not yet been re-covered by `CastTool.test.tsx`/`BoothTool.test.tsx`. Rather than drop that regression coverage, it was ported into the new location (new `CastToolRST.test.tsx`, new `useBoothPlayback.test.ts`, new `AnnotationsPanel.test.tsx` under `BoothTool/`, and two new cases appended to `BoothTool.test.tsx`) before deleting the old files. All ported tests pass against the current code.
- Live verification, its screenshots, and the `TASKS.md` update were left undone per explicit instruction for this pass (no browser/preview tool available here; `TASKS.md` is single-writer/orchestrator-only) — flagged above rather than marked done.

## Dependencies

Tasks 001-006 (everything must exist and be individually verified before final cleanup).

## Map links

- Closes the loop on `00-overview.md`'s full success-criteria list.
- Risk: `quality-sensitive` (final gate — this is where a subtle interaction between two tools' ports could surface, e.g. does Revise mode's re-render trigger interact correctly with Booth mode's segment-status display if the user switches tools mid-render).

## Out of scope

- Any new feature beyond what 001-006 already built.
- Building any of the "Deliberately deferred" catalog items — this task documents them as tracked follow-on work, it does not build them.
