# Plan 07 — Frontend Theming (Light/Dark) & Responsive Completion
Phase 12 final polish. Execute steps in order; each is a self-contained unit that passes `npm run build` before moving on.

---

## 0. Verified current state

Run these checks before starting to confirm baseline:

- [ ] `grep -n "prefers-color-scheme\|data-theme\|\.dark" frontend/src/theme/tokens.css` — confirmed returns **nothing** (light-only `:root` block only).
- [ ] `grep -n ":root" frontend/src/theme/tokens.css` — confirmed single `:root {` block.
- [ ] Hardcoded colors confirmed present (do not re-verify; they are catalogued in Step 1 below).

---

## Step 1 — Token audit: replace all hardcoded colors with semantic tokens

### 1.1 Known hardcoded values to fix (verified locations)

| Value | File | Line(s) | Replacement token |
|---|---|---|---|
| `rgba(248, 249, 252, 0.78)` | `frontend/src/app/App.tsx` | ~318 | `var(--glass)` or new `--glass-surface-light` |
| `color: 'white'` (inline) | `frontend/src/app/App.tsx` | ~401, ~424 | `var(--text-on-accent)` |
| `rgba(255,255,255,0.1)` border | `frontend/src/app/App.tsx` | ~412 | `var(--glass-border)` |
| `#059669` (success bg) | `frontend/src/theme/components.css` | ~31 | `var(--success-strong)` |
| `#047857` (success hover) | `frontend/src/theme/components.css` | ~37 | `var(--success-strong-hover)` |
| `rgba(255, 255, 255, 0.05)` | `frontend/src/theme/components.css` | ~298 | `var(--glass-subtle)` |
| `#15803d` (healthy green) | `frontend/src/pages/Settings/components/SettingsComponents.tsx` | ~159 | `var(--success-text)` |
| `#b45309` (warning text) | `frontend/src/pages/Settings/components/SettingsComponents.tsx` | ~159 | `var(--warning-text-strong)` |
| `#b45309` (warning text) | `frontend/src/pages/Settings/components/JsonSchemaForm.tsx` | ~188 | `var(--warning-text-strong)` |
| `#b45309` (warning text) | `frontend/src/pages/Settings/components/EngineCard.tsx` | ~344 | `var(--warning-text-strong)` |

**Note on `--accent-tint`:** This token is used in multiple components (`QueueItem.tsx`, `QueueStats.tsx`, `ApiSettingsPanel.tsx`, `ChapterHeader.tsx`, `QueueNotice.tsx`) but is **not defined** in `tokens.css`. It must be added in this step.

### 1.2 New tokens to add to `frontend/src/theme/tokens.css` `:root` block

- [ ] Add all missing tokens under the existing `:root` block:
  ```css
  /* Missing tokens — add after existing definitions */
  --accent-tint: rgba(99, 102, 241, 0.12);       /* soft accent background */
  --success-strong: #059669;                      /* filled success button/badge bg */
  --success-strong-hover: #047857;               /* hover state for success-strong */
  --success-text: #15803d;                       /* success status text */
  --warning-text-strong: #b45309;               /* warning/caution inline text */
  --text-on-accent: #ffffff;                    /* text on colored accent surfaces */
  --glass-surface-light: rgba(248, 249, 252, 0.78); /* panel glass in light mode */
  --glass-subtle: rgba(255, 255, 255, 0.05);    /* very subtle glass tint */
  ```
- [ ] Replace every hardcoded value listed in 1.1 with the corresponding token.
- [ ] Run a broad grep to catch any remaining hex/rgb not in tokens.css:
  ```
  grep -rn "#[0-9a-fA-F]\{6\}\|rgba\|rgb(" frontend/src --include="*.tsx" --include="*.ts" --include="*.css" | grep -v "tokens.css\|ColorSwatchPicker\|node_modules"
  ```
  Fix any newly discovered hardcoded values by adding a token and replacing inline.

- **Acceptance:** The grep above returns zero results (except `ColorSwatchPicker.tsx` which legitimately holds a color palette array).

---

## Step 2 — Dark theme implementation

### 2.1 Strategy

Semantic-token strategy: only the token values change in dark mode; no component files are edited for theming. The `[data-theme="dark"]` attribute on `<html>` overrides token values; components automatically inherit the correct colors.

### 2.2 Define dark token overrides in `frontend/src/theme/tokens.css`

- [ ] Append a `[data-theme="dark"]` block after the `:root` block. Minimum overrides (expand as needed after visual testing):

  > **Verified token names (2026-06-10):** `tokens.css` defines surfaces as `--bg`, `--surface`, `--surface-alt`, `--surface-light`, `--background` (alias of `--bg`) — there are **no** `--bg-primary/--bg-secondary/--bg-tertiary` tokens, so do NOT invent them here (overrides on nonexistent tokens silently no-op). Text tokens `--text-primary`, `--text-secondary`, `--text-muted`, `--text` (alias) DO exist, as do `--glass`, `--glass-border`, `--glass-hover`, `--accent`, `--accent-hover`, `--border`, `--shadow-{sm,md,lg,xl}`. Override only tokens that actually exist.

  ```css
  [data-theme="dark"] {
    /* Surfaces — use the REAL token names from :root */
    --bg:           #0f1117;
    --background:    #0f1117;
    --surface:      #1a1d27;
    --surface-alt:  #22263a;
    --surface-light: #1a1d27;

    /* Text */
    --text-primary:  #e8eaf0;
    --text-secondary: #9ca3af;
    --text-muted:    #6b7280;

    /* Glass — invert to dark tints */
    --glass:              rgba(15, 17, 23, 0.85);
    --glass-border:       rgba(255, 255, 255, 0.08);
    --glass-hover:        rgba(255, 255, 255, 0.06);
    --glass-surface-light: rgba(15, 17, 23, 0.78);
    --glass-subtle:       rgba(0, 0, 0, 0.15);

    /* Accent tint — darker base */
    --accent-tint: rgba(99, 102, 241, 0.18);

    /* Success / warning — slightly brighter for dark bg contrast */
    --success-strong:       #10b981;
    --success-strong-hover: #059669;
    --success-text:         #34d399;
    --warning-text-strong:  #f59e0b;
  }
  ```

- **Note:** `--accent`, `--accent-hover`, `--accent-active`, `--border`, `--shadow-*` tokens may also need dark overrides. Add them as visual testing reveals gaps. Confirm each name against `:root` in `tokens.css` before adding (e.g. `grep -n "^\s*--" src/theme/tokens.css`) so you never override a token that does not exist.

### 2.3 Theme switch — persistence and initialization

- [ ] Create `frontend/src/utils/theme.ts`:
  ```ts
  const STORAGE_KEY = 'studio-theme';

  export type Theme = 'light' | 'dark' | 'system';

  export function getEffectiveTheme(pref: Theme): 'light' | 'dark' {
    if (pref === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return pref;
  }

  export function applyTheme(pref: Theme): void {
    const effective = getEffectiveTheme(pref);
    document.documentElement.setAttribute('data-theme', effective);
  }

  export function loadThemePref(): Theme {
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
  }

  export function saveThemePref(pref: Theme): void {
    localStorage.setItem(STORAGE_KEY, pref);
    applyTheme(pref);
  }
  ```

- [ ] In `frontend/src/main.tsx` (or wherever the app bootstraps), add before `ReactDOM.createRoot`:
  ```ts
  import { applyTheme, loadThemePref } from '@/utils/theme';
  applyTheme(loadThemePref());
  ```
  This prevents flash-of-wrong-theme on load.

- [ ] Add a `matchMedia` listener in the same bootstrap location so `system` preference reacts to OS changes:
  ```ts
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const pref = loadThemePref();
    if (pref === 'system') applyTheme('system');
  });
  ```

### 2.4 Theme selector in Settings

- [ ] Location: `plans/v2_settings_architecture.md` already reserves a spot in the General tab. Find the General settings component (likely `frontend/src/pages/Settings/components/GeneralSettingsPanel.tsx` or similar).
- [ ] Add a `<select>` or segmented control for Theme: `System / Light / Dark`.
  ```tsx
  import { saveThemePref, loadThemePref, Theme } from '@/utils/theme';

  // In component:
  const [theme, setTheme] = useState<Theme>(loadThemePref);
  const handleThemeChange = (val: Theme) => {
    setTheme(val);
    saveThemePref(val);
  };
  ```
- [ ] Use the existing `<GlassInput>` or `<select className="form-input">` pattern for the control.

- **Acceptance (Step 2):**
  - `npm run build` clean.
  - Toggle `data-theme="dark"` on `<html>` in DevTools — all panels invert without component edits.
  - `localStorage.setItem('studio-theme','dark')` + refresh keeps dark mode.
  - `localStorage.removeItem('studio-theme')` + refresh follows OS setting.

---

## Step 3 — Responsive: close the gaps

### 3.1 Mobile nav drawer (`.burger` orphan)

**Verified:** `frontend/src/theme/utilities.css` lines 297–308 define `.burger` and `.burger span` CSS. No JavaScript toggle exists in `frontend/src/components/layout/Layout.tsx`.

- [ ] Add mobile nav state to `frontend/src/components/layout/Layout.tsx`:
  ```tsx
  const [navOpen, setNavOpen] = useState(false);
  ```
- [ ] Render a `<button className="burger" aria-label="Open navigation" onClick={() => setNavOpen(o => !o)}>` inside the top bar (visible only at ≤768px via existing CSS).
- [ ] Apply `navOpen` as a class on the sidebar: `<nav className={navOpen ? 'sidebar sidebar--open' : 'sidebar'}>`.
- [ ] Add to `frontend/src/theme/utilities.css` (inside the existing `@media (max-width: 768px)` block):
  ```css
  .sidebar {
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    position: fixed;
    z-index: var(--z-drawer, 400);
    height: 100dvh;
  }
  .sidebar--open {
    transform: translateX(0);
  }
  ```
- [ ] Add an overlay backdrop that closes the drawer on tap:
  ```tsx
  {navOpen && <div className="mobile-nav-backdrop" onClick={() => setNavOpen(false)} />}
  ```
  With CSS (inside the 768px media query):
  ```css
  .mobile-nav-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 399;
  }
  ```
- **Acceptance:** At 768px viewport width, sidebar is hidden by default; `.burger` button is visible; tap opens sidebar; tap outside closes it.

### 3.2 ChapterEditor multi-column collapse

**Verified:** `frontend/src/theme/components.css` has a breakpoint at `@media (max-width: 1450px)`.

- [ ] Locate ChapterEditor layout styles (likely `frontend/src/pages/ChapterEditor/ChapterEditor.tsx` or a sibling `.css` / `module.css`).
- [ ] Ensure the editor columns (e.g. chapter list + editor + preview) stack vertically below 1100px:
  ```css
  @media (max-width: 1100px) {
    .chapter-editor-layout {
      flex-direction: column;
    }
    .chapter-editor-sidebar {
      width: 100%;
      max-height: 40vh;
      overflow-y: auto;
    }
  }
  ```
- [ ] **Owner-flaggable decision:** ChapterEditor may be tablet-min (768px minimum usable); document this as a known constraint if full collapse is too complex.
- **Acceptance:** ChapterEditor does not produce a horizontal scrollbar at 1024px or 768px viewport width.

### 3.3 LiveOutputTable and VoicesPage small-screen treatment

- [ ] `frontend/src/components/LiveOutputTable.tsx` — add `overflow-x: auto` wrapper for the table at ≤768px:
  ```css
  @media (max-width: 768px) {
    .live-output-table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }
  ```
- [ ] `frontend/src/pages/Voices/` — identify any multi-column panel layouts; ensure they stack below 768px using `flex-direction: column` or `grid` single-column.
- **Acceptance:** No fixed-width overflow at 768px for these two components.

### 3.4 Target state (document; owner confirms)

| Viewport | Expected experience |
|---|---|
| 1440px | Full layout, all panels visible |
| 1024px | Sidebar collapses or narrows; ChapterEditor stacks |
| 768px | Mobile nav drawer; single-column layouts; all primary flows usable |
| 390px | Library, Queue, Settings fully functional; ChapterEditor tablet-min (acceptable) |

- [ ] Document the 390px ChapterEditor exception in `plans/master_agnostic_tasks.md`.

---

## Step 4 — Verification

> **Tooling reality check (verified 2026-06-10):** Playwright IS configured — `frontend/playwright.config.ts` exists with `testDir: './tests/e2e'`, `baseURL: 'http://localhost:4173'` (the `vite preview` port), and a `webServer` block (gated by `PLAYWRIGHT_NO_WEB_SERVER`). Existing specs live at `frontend/tests/e2e/*.spec.ts`. `@playwright/test` is a devDependency. However: there is **no `playwright` npm script** (only `"test": "vitest"`), so run Playwright via `npx playwright test` (NOT `npm test`, which runs Vitest). `@axe-core/playwright` is **not yet installed**. The visual subdir below sits under the configured `testDir`, so no config change is needed; just ensure `baseURL` is `/` relative.

### 4.1 Playwright viewport snapshots

- [ ] Add (or extend) a Playwright visual test file at `frontend/tests/e2e/visual/theme_responsive.spec.ts` (under the configured `testDir: './tests/e2e'`):
  ```ts
  const viewports = [
    { name: '1440-light', width: 1440, height: 900, theme: 'light' },
    { name: '1440-dark',  width: 1440, height: 900, theme: 'dark' },
    { name: '1024-light', width: 1024, height: 768, theme: 'light' },
    { name: '1024-dark',  width: 1024, height: 768, theme: 'dark' },
    { name: '768-light',  width: 768,  height: 1024, theme: 'light' },
    { name: '768-dark',   width: 768,  height: 1024, theme: 'dark' },
    { name: '390-light',  width: 390,  height: 844, theme: 'light' },
    { name: '390-dark',   width: 390,  height: 844, theme: 'dark' },
  ];

  for (const vp of viewports) {
    test(`snapshot ${vp.name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: vp.theme === 'dark' ? 'dark' : 'light' });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page).toHaveScreenshot(`${vp.name}.png`, { maxDiffPixelRatio: 0.02 });
    });
  }
  ```
- [ ] From `frontend/`, run `npx playwright test tests/e2e/visual/theme_responsive.spec.ts --update-snapshots` to establish baselines (Playwright's `webServer` config will build+preview automatically unless `PLAYWRIGHT_NO_WEB_SERVER` is set).
- **Acceptance:** Snapshots committed to repo; future runs pass within 2% diff ratio.

### 4.2 Accessibility / contrast check

- [ ] Install the axe integration (confirmed NOT present in `frontend/package.json`): from `frontend/`, `npm install --save-dev @axe-core/playwright`. (Note: the import below uses `@axe-core/playwright`, not the older `axe-playwright` package — keep them consistent.)
- [ ] Add an axe scan to the test (or a separate file):
  ```ts
  import AxeBuilder from '@axe-core/playwright';

  for (const theme of ['light', 'dark']) {
    test(`a11y contrast ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
      await page.goto('/');
      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze();
      expect(results.violations).toHaveLength(0);
    });
  }
  ```
- **Acceptance:** Zero axe `color-contrast` violations in both light and dark themes.

---

## 5. Order of execution summary

| Step | File(s) | Risk | Blocking |
|---|---|---|---|
| 1.2 — add missing tokens | `tokens.css` | Low | Must run before 1.1 replacements |
| 1.1 — replace hardcoded values | `App.tsx`, `components.css`, Settings components | Low | Step 1.2 done |
| 2.2 — dark token overrides | `tokens.css` | Low | Step 1 done |
| 2.3 — theme utility + bootstrap | `utils/theme.ts`, `main.tsx` | Low | — |
| 2.4 — settings UI | General settings panel | Low | Step 2.3 done |
| 3.1 — mobile nav drawer | `Layout.tsx`, `utilities.css` | Medium | — |
| 3.2 — ChapterEditor collapse | ChapterEditor CSS | Medium | Owner decision on 390px |
| 3.3 — table/voices overflow | `LiveOutputTable.tsx`, Voices CSS | Low | — |
| 4.1–4.2 — tests | `tests/e2e/visual/` | Low | Steps 1–3 done |

---

## 6. Final acceptance gate

- [ ] `npm run build` — zero errors, zero TypeScript errors.
- [ ] All 8 Playwright viewport snapshots pass.
- [ ] Zero axe `color-contrast` violations in light mode.
- [ ] Zero axe `color-contrast` violations in dark mode.
- [ ] `grep -rn "rgba(248, 249, 252\|rgba(255,255,255,.8\|#059669\|#047857\|#b45309\|#15803d" frontend/src --include="*.tsx" --include="*.css"` returns zero results (excluding `tokens.css` and `ColorSwatchPicker.tsx`).
- [ ] Toggling `data-theme` on `<html>` in DevTools produces visible inversion with no component edits needed.
