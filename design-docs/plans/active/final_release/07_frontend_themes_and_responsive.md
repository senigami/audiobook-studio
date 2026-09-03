# Plan 07 — Frontend Theming (Light/Dark) & Responsive Completion

Phase 12 final polish.

## Shipped

- **Step 1 — Token audit.** 33 new semantic tokens added to `:root` in `tokens.css`
  (`--accent-tint`, `--success-strong[-hover]`, `--warning-text-strong`, `--text-on-accent`,
  `--glass-surface-light`, `--glass-subtle`, etc.); ~200 hardcoded color replacements across 30+
  files. Accepted exceptions: `CharactersTab.tsx`/`CharacterSidebar.tsx` color-picker default
  constants, `utilities.css` shimmer-animation gradient, `SettingsRoute.tsx` decorative header
  gradient, `ProjectCard.tsx`/`ProjectLibraryPage.tsx` photographic compositing filters.
- **Step 2 — Dark theme.** `[data-theme="dark"]` block with 68 token overrides (surfaces, text,
  glass, borders, shadows, semantic colors); `frontend/src/utils/theme.ts`
  (`Theme`/`getEffectiveTheme`/`applyTheme`/`loadThemePref`/`saveThemePref`) bootstrapped in
  `main.tsx` before `createRoot` with a `matchMedia` change listener for `system` preference;
  System/Light/Dark selector added to `GeneralSettingsPanel.tsx`; `DemoApp.tsx` migrated to the
  shared theme util.
- **Step 3 — Responsive gaps closed.** Mobile nav drawer wired up in `Layout.tsx` (burger toggle,
  slide-in `.header-nav--open`, backdrop-close); ChapterEditor multi-column collapse at
  `@media (max-width: 1100px)` (stacks columns, sidebar full-width capped 40vh — 390px tablet-min
  constraint documented in `master_agnostic_tasks.md`); `LiveOutputTable` and Voices small-screen
  overflow handling.

Full token lists, exact line numbers, and file-by-file completion notes are in git history for
this file (see `git log -p` on this path) rather than reproduced here.

## Still open

### Step 4 — Verification

> **Tooling reality check (verified 2026-06-10):** Playwright IS configured
> (`frontend/playwright.config.ts`, `testDir: './tests/e2e'`, `baseURL: 'http://localhost:4173'`).
> Run via `npx playwright test` (NOT `npm test`, which runs Vitest). `@axe-core/playwright` is
> **not yet installed**.

- [ ] Add/extend a Playwright visual test at `frontend/tests/e2e/visual/theme_responsive.spec.ts`
      covering 1440/1024/768/390px × light/dark (8 snapshots); run with `--update-snapshots` to
      establish baselines.
- [ ] Install `@axe-core/playwright` (not `axe-playwright`) and add a `color-contrast`-only scan
      for light and dark themes.

### Step 6 — Final acceptance gate

- [ ] `npm run build` — zero errors, zero TypeScript errors.
- [ ] All 8 Playwright viewport snapshots pass.
- [ ] Zero axe `color-contrast` violations in light mode.
- [ ] Zero axe `color-contrast` violations in dark mode.
- [ ] `grep -rn "rgba(248, 249, 252\|rgba(255,255,255,.8\|#059669\|#047857\|#b45309\|#15803d" frontend/src --include="*.tsx" --include="*.css"` returns zero results (excluding `tokens.css` and `ColorSwatchPicker.tsx`).
- [ ] Toggling `data-theme` on `<html>` in DevTools produces visible inversion with no component
      edits needed.
