# Site Redesign Rollout — Execution Contract (READ FIRST, EVERY SESSION)

*This folder is the complete, self-contained plan for converting the live Studio frontend to the
approved redesign. It is written for ANY executing agent, including small models (Haiku,
Gemini Flash). If you are an agent picking this up cold: read this file fully, then
`01_overview_and_phases.md`, then ONLY the phase file you are executing. Do not read the whole
repo to "get context" — each task names every file it needs.*

## The one-sentence mission

Make the real app at `frontend/src/` match the approved mockup at
`frontend/src/demo/stages/siteMockup/` (the "reference mock"), phase by phase, without ever
breaking the test suite or losing a capability listed in `02_capability_inventory.md`.

## Source-of-truth order (when things disagree)

1. `plans/site_experience_north_star.md` §12 decision log (owner decisions, rounds 1–5) — WHAT.
2. The reference mock modules (`frontend/src/demo/stages/siteMockup/*`) — LAYOUT/LOOK.
   The mock is layout truth, not code truth: do NOT copy mock code into the app. Rebuild with
   real components, real data, design tokens, and tests. Mock inline styles become token-based
   CSS (see Styling rules).
3. `02_capability_inventory.md` — the checklist of every existing capability that must survive.
4. The existing app code — HOW things work today (reuse internals; you are re-homing, not
   rewriting features).

## Hard rules (violating any of these = stop and revert the task)

- **R-A. One task per commit.** Execute tasks in order within a phase. Commit message:
  `redesign(<phase>): <task-id> <short title>`. Never bundle tasks.
- **R-B. Suite green per task.** Before commit: `npm -C frontend run test -- --run` and
  `npm -C frontend run lint` and `npm -C frontend run build` must pass. If a task says it
  touches backend: also `./venv/bin/python -m pytest -q`. A task that cannot reach green gets
  REVERTED (git checkout) and a note appended to `99_progress_log.md` — do not leave red and
  move on, and do not "fix" unrelated tests to force green.
- **R-C. Capabilities never vanish.** If your change removes a control/feature from a screen,
  the SAME task must re-home it where its task spec says. If the spec doesn't say where it
  goes, STOP — log a question in `99_progress_log.md` and skip to the next independent task.
- **R-D. Tests move with code.** Existing tests for a moved component get updated imports, not
  deletion. New UI gets at least a render + key-interaction test (see repo testing standards
  in `docs/specs/testing-standards.md` — R1–R4 apply).
- **R-E. Tokens only.** No hardcoded colors/sizes where a token exists (`frontend/src/theme/
  tokens.css`). Every new surface must work in light AND dark (`[data-theme="dark"]`) — verify
  by toggling `data-theme` in the test or eyeballing both in the dev server if running
  interactively.
- **R-F. No backend changes** unless the task explicitly lists backend files. The redesign is
  a frontend re-home; APIs already exist.
- **R-G. Old routes keep working** until the phase that explicitly retires them. Use redirects,
  not deletions, when a route moves (`/project/:id` → book pipeline, etc.).
- **R-H. Do not touch** `frontend/src/demo/` (the mock — reference only), `docs/demo/`
  (built output), or anything under `plugins/`/`app/` except where a task says so.
- **R-I. Progress log.** After every task (done, reverted, or skipped): append one line to
  `99_progress_log.md`: `<date> <task-id> <done|reverted|skipped+why> <commit-sha>`.

## Styling rules for new components

- Component files live where the task says (pattern: `frontend/src/app/layout/` for shell,
  `frontend/src/pages/<Page>/components/` for page-owned pieces, `frontend/src/components/`
  for cross-page).
- CSS: prefer the existing pattern of the area you're touching (most pages use
  `frontend/src/theme/components.css` classes + some inline style with tokens). New shell
  components (rail, top bar, player bar) get their own class blocks in `components.css`
  using tokens; keep inline styles to dynamic values only.
- Reuse shared primitives before writing new ones: `PredictiveProgressBar`, `StatusOrb`
  (NEVER replace with a plain dot — owner directive), `ActionMenu`, `InlineEdit`,
  `ConfirmModal`, `GlassInput`, `ColorSwatchPicker`, `SearchableSelect`, `VoiceProfileSelect`.

## Verification commands (memorize)

```bash
npm -C frontend run test -- --run     # vitest, must pass
npm -C frontend run lint              # eslint, no NEW warnings
npm -C frontend run build             # tsc + vite, must pass
./venv/bin/python -m pytest -q        # only when a task touches app/ or plugins/
```

## Review cadence (owner decision)

Tasks within a phase run unattended (overnight OK). At each PHASE boundary the work pauses
for a review pass before the next phase starts: the orchestrating/reviewing agent (or the
owner) walks the phase's acceptance checklist at the bottom of the phase file. Phases are
ordered so the app is shippable at every boundary.

## Where you are / what's next

Check `99_progress_log.md` (create it on first run). The first unfinished task in the lowest
unfinished phase is your task. If a phase's acceptance checklist is unconfirmed, run it before
starting the next phase.
