# Task 004 — Cleanup and full green gate

Status: pending

## Goal

Close out the merge: remove dead CSS, confirm no regressions anywhere in the Book/chapter surface, full green gate, live verification.

## Steps

- [ ] Grep `frontend/src/theme/components.css` for any remaining dead rules from the removed `review-chapter-rail` (Task 002 should have removed the main ones — double check `.review-main__topbar`, `.book-stage-review` and siblings for anything that assumed the rail's presence, e.g. width/flex calculations that no longer apply with one fewer sibling column).
- [ ] Grep the whole `frontend/src/` and `frontend/tests/` trees for any remaining reference to `'studio'`/`'review'` as `WorkspaceView` values, the old toggle button labels ("Studio"/"Review" as button text specifically, not incidental uses of those words elsewhere), or `ReviewStage`'s removed rail classnames.
- [ ] Run the full frontend suite: `npx vitest run` (no path filter) from `frontend/` — confirm no test outside this plan's touched files broke.
- [ ] Run `npx tsc -b --force` and `npm run build` (or `npm run build:demo` is NOT relevant here — this plan doesn't touch the demo) from `frontend/`.
- [ ] Run `./venv/bin/python -m pytest -q` — this plan is frontend-only, but confirm nothing backend broke as a sanity check.
- [ ] Live verification (preview_start the "frontend (Vite dev)" launch config): open a book, click into a chapter, confirm: (a) the three-mode switcher works, (b) only one chapter switcher exists anywhere on screen, (c) Annotations docks/undocks correctly from Follow Along mode, (d) Edit Text mode's lock/warning behavior matches Contents for the same chapter, (e) no console errors on any mode switch.
- [ ] Screenshot the merged workspace in each of the three modes for the completion record.

## Acceptance criteria

- [ ] Zero dead CSS/dead code left from the removed toggle/rail.
- [ ] Full green: build, typecheck, lint, full frontend test suite, full backend test suite.
- [ ] Live verification of all three modes + docked Annotations + Edit Text lock behavior, with no console errors.
- [ ] Append a `docs/code-map/queue/` entry for any files touched in this cleanup pass.

## Dependencies

Tasks 001, 002, 003 (everything must exist before final cleanup/verification).

## Map links

- Closes the loop on `00-overview.md`'s full success-criteria list.
- Risk: `quality-sensitive` (final gate before this plan is called done — this is where a subtle interaction between 002's docking change and 003's new mode would surface, e.g. does opening Annotations while in Edit Text mode make sense/do anything odd).

## Out of scope

- Any new feature beyond what 001-003 already built.
