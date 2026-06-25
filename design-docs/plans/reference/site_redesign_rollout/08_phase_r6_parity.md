# Phase R6 — Parity & polish (closing audit)

*Read `00_execution_contract.md` and `01_overview_and_phases.md` first. All hard rules apply.
This phase runs ONLY after R1–R5 acceptance checklists are confirmed. It is an audit-and-fix
phase: every task compares the real app against the reference mock
(`frontend/src/demo/stages/siteMockup/`) or against an inventory, fixes deltas, and records
intentional deviations. Run the mock side by side: `npm -C frontend run dev:demo` (first card)
next to `npm -C frontend run dev`.*

Audit-task method (applies to R6-T1…T5): for each screen,
1. Open mock pane and the real route side by side, same theme.
2. Write the delta list (layout, spacing, chips, copy, missing/extra elements) into
   `99_progress_log.md` under a `## R6 parity — <area>` heading BEFORE fixing anything.
3. Fix layout/token deltas only (no behavior changes; behavior gaps become Found-bugs entries).
4. Mark each delta `fixed` or `intentional: <reason>` in the same log section.
5. One commit per task as usual (`redesign(r6): R6-Tn <title>`).

---

### R6-T1 — Parity audit: shell (rail, top bar, queue drawer, player bar)

**Goal** The persistent chrome matches the mock in both themes and both rail states.

**Read first**
- Mock: `frontend/src/demo/stages/siteMockup/` shell modules (grep `Rail`/`TopBar` in the
  mockup dir) and `panes/` shared chrome
- Real: `frontend/src/app/layout/` (R1 components: NavRail, TopBar, queue drawer host,
  PlayerBar from R4)
- Owner decisions 1–3, 8–9 in `01_overview_and_phases.md`

**Create/Modify** Real shell component files + `frontend/src/theme/components.css` only.

**Steps**
1. Compare: rail grouping (CREATE/MONITOR/PLATFORM/MANAGE), collapse chevron + theme toggle
   bottom row (expanded) / stacked (collapsed), hover-overlay expand, contextual book block
   (cover → stage links → chapter list with StatusOrb + render bar + ⋯).
2. Compare top bar: breadcrumb, book identity line → Publish link, connection dot, queue
   drawer button. Compare player bar: full-width dock, scope chip, hidden-when-empty.
3. Log deltas, fix token/layout ones, record intentional deviations.

**Capabilities re-homed** None (visual parity only).
**Tests** Update any snapshot/DOM assertions broken by spacing/class fixes; add none unless a
fix introduces logic.
**Verify** Suite green; eyeball expanded + collapsed rail, light + dark.
**Out of scope** Behavior changes; new shell features.

---

### R6-T2 — Parity audit: Library + Activity

**Goal** `/` (library) and `/activity` match `panes/library.tsx` and `panes/activity.tsx`.

**Read first** Mock `panes/library.tsx`, `panes/activity.tsx`; real Library page (grep
`LibraryPage`/`Dashboard` under `frontend/src/pages/`), `frontend/src/pages/Activity/`.

**Create/Modify** The two real pages + page-owned components + `components.css`.

**Steps**
1. Library: card grid, cover treatment, status/progress chips (StatusOrb preserved — owner
   decision 10), new-book affordance, sort/filter row.
2. Activity: now/history/stats layout per mock; confirm R5-T14 deliverables still match.
3. Log deltas → fix → record intentional.

**Capabilities re-homed** None. **Tests** Update affected DOM assertions.
**Verify** Suite green; both themes eyeballed. **Out of scope** Queue semantics.

---

### R6-T3 — Parity audit: book pipeline stages (Manuscript, Casting, Studio, Review, Publish)

**Goal** Each `/book/:id/*` stage matches its mock pane.

**Read first** Mock `panes/book.tsx`, `panes/studio.tsx`, `panes/publish.tsx` (and casting/
review sections within); real pages delivered by R2–R4 (grep route components for
`manuscript|casting|studio|review|publish` under `frontend/src/pages/`).

**Create/Modify** Stage page components + `components.css`.

**Steps**
1. One sub-pass per stage, in route order; same delta-log → fix → record loop.
2. Studio extras to verify: view pills (book primary / script secondary), cast palette right
   rail, analysis strip, safe-text + section-number toggles, room left for sub-sentence
   assignment (owner decision 6).
3. Review: section-anchored annotations (§N, never timestamps), re-render-section as primary
   gesture. Publish: book info editing lives here (decision 4).

**Capabilities re-homed** None. **Tests** Update affected assertions.
**Verify** Suite green; walk one real book through all five stages in dev server.
**Out of scope** New stage features; backend.

---

### R6-T4 — Parity audit: Voices + Voice Lab

**Goal** `/voices` and `/voices/:id` match `panes/voices.tsx` (catalog + VoiceLab) post-R5.

**Read first** Mock `panes/voices.tsx`; real `frontend/src/pages/Voices/`,
`frontend/src/pages/VoiceLab/`; R5 acceptance checklist results in `99_progress_log.md`.

**Create/Modify** Voices/VoiceLab components + `components.css`.

**Steps**
1. Catalog: card proportions, pill tint/order/overflow, ★ default + ⚠ untagged badges, tab
   pills, toolbar, filter chips.
2. Voice Lab: header block, stepper geometry, section framing (samples list, dashed drop row,
   variants rows, test strip, export row), planned chips (Publish to HF).
3. Log → fix → record intentional (e.g. R5-T11-style deviations).

**Capabilities re-homed** None. **Tests** Update affected assertions.
**Verify** Suite green; both themes. **Out of scope** HF Discover, taxonomy v2.

---

### R6-T5 — Parity audit: platform pages (Engines, Integrations, Settings)

**Goal** `/engines`, `/integrations`, `/settings/*` match `panes/platform.tsx` and
`panes/settings.tsx`.

**Read first** Mock `panes/platform.tsx`, `panes/settings.tsx`; real
`frontend/src/pages/Engines/`, `frontend/src/pages/Integrations/`,
`frontend/src/pages/Settings/`.

**Create/Modify** Those pages + `components.css`.

**Steps**
1. Engines: diagnostics box rows, card header chip cluster, expanded section order, store
   placeholder, trust modal styling.
2. Integrations: guide cards, security note tinting, endpoint row method colors, mono blocks,
   config rows.
3. Settings: thin tab pills, General row list + PLATFORM hint, About card trio + diagnostics
   rows, Developer link list; confirm `/settings/engines` and `/settings/api` redirects.
4. Log → fix → record intentional.

**Capabilities re-homed** None. **Tests** Update affected assertions.
**Verify** Suite green; both themes. **Out of scope** Plugin store, LAN exposure.

---

### R6-T6 — Capability inventory audit

**Goal** Every line of `02_capability_inventory.md` is checked off or fixed — no capability
silently lost across R1–R5.

**Read first** `design-docs/plans/site_redesign_rollout/02_capability_inventory.md` (the whole file);
`99_progress_log.md` (skipped/reverted tasks may hide losses).

**Create/Modify** `02_capability_inventory.md` (check boxes + per-line note of the new home
route/component); real app files only where a missing capability must be restored.

**Steps**
1. Walk the inventory top to bottom in the running app; for each item record
   `[x] <where it lives now>` or `MISSING`.
2. For each MISSING item: restore it where the relevant phase file said it belongs (smallest
   possible change, with a test). If no phase file ever assigned it a home, STOP per R-C and
   log a question in `99_progress_log.md` instead of inventing one.
3. Commit inventory updates and restorations separately if restorations are non-trivial
   (one commit per restoration, normal task rules).

**Capabilities re-homed** Any stragglers found.
**Tests** A render/interaction test per restored capability (R1 revert-check applies if a
restoration fixes a regression).
**Verify** Suite green; inventory has zero unchecked, un-annotated lines.
**Out of scope** New capabilities.

---

### R6-T7 — Responsive pass (≤768px rail→drawer; tablet-width editor)

**Goal** The shell and key pages are usable at 768px and the editor at its existing 390px
minimum.

**Read first** R1 shell components; the breakpoint handling already present (grep
`768`/`matchMedia`/`@media` in `frontend/src/theme/` and `frontend/src/app/`); ChapterEditor's
existing 390px minimum (grep `390` under `frontend/src/pages/`).

**Create/Modify** Shell components, `components.css` media queries; possibly page grid rules
(voices grid, engines cards, activity columns).

**Steps**
1. ≤768px: rail becomes an overlay drawer (hamburger in top bar opens it; backdrop click +
   Escape close it; focus moves into the drawer on open — coordinate with T9's a11y work).
2. Verify per page at 768px: library grid reflows, voices grid → 2-up/1-up, Voice Lab sections
   stack, engines cards full-width, activity stats column drops below, settings nav stacks
   above content (existing `settings-route-grid` class).
3. Studio/ChapterEditor: confirm the existing 390px-minimum behavior still holds inside the new
   shell (no double-scroll, player bar doesn't overlap content — add bottom padding equal to
   player bar height when visible).
4. Use browser devtools or Playwright viewport to check; fix CSS only.

**Capabilities re-homed** None.
**Tests** Vitest with mocked `matchMedia` for drawer open/close state; if Playwright e2e config
exists (`frontend/tests/e2e/`), add a 768px viewport smoke spec for rail-drawer.
**Verify** Suite green; manual sweep at 1280/768/420 widths.
**Out of scope** Full mobile design; touch gestures.

---

### R6-T8 — Dark/light theme pass on every new surface

**Goal** No hardcoded colors or unreadable contrast on any surface introduced in R1–R5, in both
themes.

**Read first** `frontend/src/theme/tokens.css`; contract rule R-E.

**Create/Modify** `components.css`, `tokens.css`, and offending component files.

**Steps**
1. `grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(' frontend/src/app frontend/src/pages frontend/src/components --include='*.tsx' --include='*.css'`
   excluding `frontend/src/demo/`; for each hit added/touched by R1–R5, replace with a token
   (add the token to `tokens.css` with light+dark values if none fits). Pre-existing legacy
   hits outside redesign surfaces: log under Found bugs, don't detour.
2. Toggle `data-theme="dark"` and walk every route: rail, top bar, drawer, player bar, library,
   all five book stages, voices, voice lab, engines (expanded card + trust modal), integrations,
   settings tabs, activity, all new modals. Fix tinted-chip contrast (pill tokens from R5-T1
   especially) in dark.
3. Confirm the no-flash theme bootstrap still works (owner decision 11) — reload in dark.

**Capabilities re-homed** None.
**Tests** Extend one render test per major new surface with a `data-theme="dark"` smoke
variant where cheap; rely on the grep result being clean as the main gate (record the final
grep output summary in `99_progress_log.md`).
**Verify** Suite green; both-theme walk complete.
**Out of scope** New themes; demo mock styling.

---

### R6-T9 — Accessibility pass (focus traps, focus-visible, aria)

**Goal** New surfaces meet the app's existing a11y patterns: trapped modals, keyboard-reachable
chrome, labeled landmarks.

**Read first** `frontend/src/hooks/useFocusTrap.ts` and its existing consumers
(`ConfirmModal`, `MetadataEditorModal`, `ResyncPreviewModal`); existing `aria-` usage in
`SettingsRoute.tsx` (`aria-labelledby` pattern); check for an axe script
(`grep -rn "axe" frontend/package.json frontend/tests .github/workflows/`).

**Create/Modify** New modals from R1–R5 (queue drawer, rail drawer, plugin trust modal host if
not already trapped, Voice Lab modals, export modal hosts), NavRail/TopBar/PlayerBar
components, `components.css` (`:focus-visible` rules).

**Steps**
1. Every modal/drawer introduced or re-hosted in R1–R5 uses `useFocusTrap`, closes on Escape,
   and returns focus to its trigger. Verify each; wire the hook where missing.
2. Rail: nav landmarks (`<nav aria-label>`), current route `aria-current="page"`, visible
   `:focus-visible` ring on rail items, theme toggle and chevron labeled buttons.
3. Player bar: `aria-label` on transport buttons, scope chip as a labeled button; queue drawer
   button labeled with open/closed state (`aria-expanded`).
4. Pills/+N overflow (R5-T1): the `+N` chip is a real `<button>` with `aria-expanded`.
5. If an axe script exists in package.json or CI, run it and fix new-surface violations; if
   none exists, do NOT add new CI — log "no axe script present" in the progress log.

**Capabilities re-homed** None.
**Tests** Per fixed modal: focus-trap test (tab cycles inside, Escape closes — fake timers,
no sleeps per R4); rail `aria-current` assertion in the shell test.
**Verify** Suite green; keyboard-only walk: open queue drawer, open a Voice Lab modal, navigate
rail.
**Out of scope** Full WCAG audit; screen-reader copy rewrite.

---

### R6-T10 — Dead-code retirement

**Goal** Delete the superseded pre-redesign UI with the suite green: old Layout top-nav
remnants, retired ProjectDetail shells, the expanding NarratorCard body path, unused
routes/components/tests.

**Read first** R-C/R-G (retirement is allowed only now, the phase that explicitly retires);
R5-T3/T6/T8 notes confirming NarratorCard's expanded body has no unique capability;
`02_capability_inventory.md` final state (T6 must be DONE before this task).

**Create/Modify (delete)**
1. Build the candidate list mechanically: `npx knip` if configured, else
   `npm -C frontend run build` + grep imports for: old `Layout`/top-nav components, old
   `ProjectDetail`/project-shell pages, `/project/:id` and `/chapter/:id` page components
   (keep the REDIRECTS), `NarratorCard.tsx` (if T6/T8 fully re-homed it — otherwise keep and
   log), any `Voices` expanded-card-only helpers, the old Settings engines/api panel re-export
   shims, orphaned CSS blocks in `components.css`.
2. For each candidate: confirm zero imports outside tests (`grep -rn "<Name>" frontend/src
   --include='*.ts*'`), then delete the component AND its dedicated tests together (tests for
   deleted code are deleted, not skipped — this is the R-D exception for retirement).
3. Keep redirects for moved routes (R-G stays in force permanently for `/project/:id`,
   `/chapter/:id`, `/settings/engines`, `/settings/api`).
4. Delete in small commits grouped by area (shell / project / voices / settings) so any
   revert is cheap.

**Capabilities re-homed** None — anything still unique gets kept and logged, never deleted.
**Tests** Suite green after every deletion commit; build green (tsc catches dangling imports).
**Verify** `npm -C frontend run build` bundle has no references to deleted modules; route walk
still works.
**Out of scope** `app/`/`plugins/` cleanup; `frontend/src/demo/` (never touch).

---

### R6-T11 — Found-bugs triage into master task list

**Goal** Process the "Found bugs" section of `99_progress_log.md` into actionable entries in
`design-docs/plans/master_agnostic_tasks.md`.

**Read first** `99_progress_log.md` (Found bugs + open questions); `design-docs/plans/master_agnostic_tasks.md`
(existing format — match it).

**Create/Modify** `design-docs/plans/master_agnostic_tasks.md`; `99_progress_log.md` (mark each bug
`triaged → <task ref>` or `fixed in R6-Tn` or `not reproducible`).

**Steps**
1. For each logged bug: try to reproduce on the R6-head build. Not reproducible → mark and
   close. Reproducible UI-parity bug already fixed by T1–T5 → mark fixed with the commit.
2. Remaining real bugs become entries in `master_agnostic_tasks.md` with: repro steps, file
   pointers, severity, and whether they predate the redesign (per the known-broken caveat in
   `01_overview_and_phases.md`).
3. Open questions logged under R-C stops get an explicit owner-decision-needed flag.
4. Do NOT fix backend (`app/`/`plugins/`) bugs here — task entries only.

**Capabilities re-homed** None. **Tests** None (planning task).
**Verify** Every Found-bugs line carries a disposition; lint/test untouched (docs-only commit).
**Out of scope** Implementing the triaged fixes.

---

### R6-T12 — Wiki & docs refresh

**Goal** Update the wiki pages the redesign invalidates, list the screenshots needing recapture,
and add a Changelog entry (per CLAUDE.md: wiki + dated Changelog entry when shipped behavior
changes).

**Read first** `wiki/` pages: `Home.md`, `Getting-Started.md`, `Library-and-Projects.md`,
`Voices-and-Voice-Profiles.md`, `Settings.md`, `Queue-and-Jobs.md`, `Concepts.md`,
`Recording-Guide.md`, `Troubleshooting-and-FAQ.md`, `Live-Demos.md`, `wiki/images/` (inventory
of current screenshots), `wiki/Changelog.md`.

**Create/Modify** The wiki pages above + `wiki/Changelog.md`.

**Steps**
1. Per page, rewrite navigation-dependent copy: top-nav references → rail groups; project/
   chapter pages → book pipeline stages; Settings Engines/API tabs → `/engines` and
   `/integrations`; Voices expanding cards → catalog + Voice Lab; queue tab → Activity page +
   queue drawer. Pages to touch at minimum: `Getting-Started.md`, `Library-and-Projects.md`,
   `Voices-and-Voice-Profiles.md`, `Settings.md`, `Queue-and-Jobs.md`, `Home.md`; check
   `Concepts.md`, `Recording-Guide.md` (guide modal location), `Troubleshooting-and-FAQ.md`,
   `Live-Demos.md` for stale references.
2. Build a screenshot recapture list: every image in `wiki/images/` referenced by the touched
   pages, mapped to the new route to capture. Append the list to the Changelog entry (capture
   itself may be done by the owner; broken/now-wrong embeds get removed or flagged inline).
3. Add a dated `wiki/Changelog.md` entry summarizing the redesign (rail shell, book pipeline,
   player bar, voices catalog + lab, platform pages, activity).

**Capabilities re-homed** None. **Tests** None (docs-only).
**Verify** No wiki page references a retired route/tab by name; Changelog entry dated.
**Out of scope** Capturing new screenshots; `design-docs/specs/` (no behavior contracts changed by a
UI re-home — if a spec IS found stale, log it, don't silently edit).

---

## Acceptance checklist (release gate for the redesign)

- [ ] All five parity logs (`R6 parity — shell/library+activity/pipeline/voices/platform`) exist
      in `99_progress_log.md` with every delta marked fixed or intentional.
- [ ] `02_capability_inventory.md` fully checked, each line annotated with its new home; zero
      unresolved MISSING lines.
- [ ] 768px: rail drawer opens/closes by mouse, keyboard, and Escape; all pages usable; editor
      holds its 390px minimum; player bar never overlaps content.
- [ ] Hardcoded-color grep over `frontend/src/{app,pages,components}` is clean for redesign
      surfaces; full route walk done in light AND dark with no contrast breaks; no-flash dark
      reload confirmed.
- [ ] All new/re-hosted modals trap focus and close on Escape; rail has aria-current +
      focus-visible; player bar and queue drawer controls labeled; axe script (if present) clean
      on new surfaces.
- [ ] Dead code deleted: no imports of retired Layout/ProjectDetail/NarratorCard-expanded paths;
      redirects for `/project/:id`, `/chapter/:id`, `/settings/engines`, `/settings/api` still
      work; bundle builds clean.
- [ ] Found-bugs list fully dispositioned; real bugs live in `design-docs/plans/master_agnostic_tasks.md`.
- [ ] Wiki pages updated, screenshot recapture list written, dated Changelog entry added.
- [ ] `npm -C frontend run test -- --run`, `lint`, `build` green on the phase head; e2e specs
      (if run) green.
