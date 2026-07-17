# PR 03 — Milestone 3 / 005: Code simplification

**Branch:** `studio2/simplification-005`
**Target:** `studio-2.0`
**Size:** L — behavior-preserving cleanup across FE + backend + plugin SDK.
**Gate:** none, but **do not run concurrently with PR 07 (DC-1b)** — both touch frontend dead-code.
**Position in chain:** first of the Milestone 3 trio (03 → 04 → 05).

> This is large enough that you may want to split it into 2–3 PRs (styling / large-file splits /
> backend+plugin) rather than one mega-PR. That's fine and encouraged — see "Splitting" below.

## Why

The simplification refactor: remove dead code, separate styling, split oversized files, clean the
backend, consolidate plugin duplication — all behavior-preserving. Several sub-parts already landed
(LF-2/3/4/5/7, DC-2, DC-3b); this PR finishes the rest.

## Authoritative source (execute these, don't re-derive)

- `design-docs/plans/active/simplification/00_overview.md` and docs **02–06** in that folder.
- Master placement + folded-in items: `design-docs/plans/master_fix_plan/tasks/005-code-simplification.md`.
- TASKS.md lines ~433–438 for the current per-sub-part status (what's `[x]` vs open).

## Scope (what's actually left — verify each against the tree first, statuses drift)

- **Styling separation** (`simplification/03`): ST-1 `components.css` split, ST-2 shared classes;
  folds `final_release/10` U3 (semantic type scale), U9 (button/input system), U10 (z-index single
  source). **Absorbs QW-6**: delete the dead selectors in `frontend/src/theme/components.css`
  (`.btn-home`, `.btn-menu-destructive`, `.action-menu-item`, `.select-glass`, `.engine-chunk`)
  **as part of the split** — BUT 2 of the 5 (incl. `.btn-home`) are used by the demo styleguide the
  owner keeps: **relocate those into the demo's own CSS, don't delete them.** Re-grep each selector
  before removing.
- **Large-file splits** (`simplification/04`): the remaining live oversized target is
  `ChapterHeader.tsx` (615 lines). ⚠️ **Coordinate with W-PAR** — if W-PAR 006 is threading
  `activeSegmentsMap` through ChapterHeader, 006 goes first, then the split. `useJobs.ts`,
  `useQueueSync.ts`, `scriptViewProgress.ts` were re-measured as already right-sized — struck, skip
  them. ⚠️ **INV-4:** do NOT strip `useStudioChapter` segment-playback exports. LF-1
  (`useStudioChapter.ts`) is blocked on DC-1a and out of scope here.
- **Backend cleanup** (`simplification/05`): `speakers.py` decomposition, `state_jobs.py` seam,
  `plugin_loader.py` seam; folds `organizational_cleanup` overlaps + `final_release/06 §3` legacy
  engine-path deletions. ⚠️ Leave the `plugins/`→`tts_engines/` **rename** to PR 04 — don't start it.
- **Plugin SDK consolidation** (`simplification/06`), incl. **PL-6**: the xtts adapter is the LIVE
  path (INV-5) — document or unify the redundant `to_bridge_request`; **do NOT delete the adapter.**

**Out of scope:** namespace rename (PR 04), restoration (002, done), DC-1b dead-tree deletion
(PR 07), the LF-6 `enrich()` extraction (deferred to a supervised session).

## Guardrails (from `.agent/rules/modular_architecture.md`)

- Behavior-preserving means **behavior-preserving**: no new import-time side effects, no engine-ID
  branching, no `app.api.web`/`app.jobs` imports from new modules. Split along existing boundaries,
  not mechanically by line count.
- Files >600 lines are the trigger to split *when touched*; don't split a file you're not otherwise
  changing just to hit a number.

## Verify

- Full backend: `./venv/bin/python -m pytest -q` + `ruff check .`.
- Frontend: `npm -C frontend run test -- --run` + `lint` + `npx tsc -b` + `build`.
- Because it's behavior-preserving, the suites passing unchanged IS the proof — but **live-verify**
  any UI whose CSS/structure you moved (styling split, ChapterHeader split): load the app, confirm
  no visual/behavioral delta, screenshot.
- Bump specs per the simplification done-checks: `design-system.md` → 1.3.0,
  `code-organization.md` → 1.2.0. Add changelog rows.

## Splitting (recommended)

If you split, suggested PR boundaries (each targets `studio-2.0`, each independently green):
1. Styling separation + QW-6 dead-CSS (with demo-CSS relocation).
2. `ChapterHeader.tsx` split (after confirming W-PAR 006 isn't mid-flight on it).
3. Backend cleanup + plugin SDK consolidation (PL-6).

## Definition of done

- Every open sub-part above either done or explicitly struck with a re-verified reason.
- Suites green, specs bumped, `wiki/Changelog.md` entry, code-map changelog-queue entry.
- PR(s) via `write-pr` → `studio-2.0`.
