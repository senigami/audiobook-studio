# 03 — Phase R1: Shell (NavRail + TopBar + Activity + Engines/Integrations routes)

*Read `00_execution_contract.md` and `01_overview_and_phases.md` first. Reference mock for layout:
`frontend/src/demo/stages/siteMockup/rail.tsx` (rail), `frontend/src/demo/stages/siteMockupStage.tsx`
lines 234–310 (TopBar) — layout truth only, do NOT copy mock code (R-A…R-I apply to every task).
All paths below are relative to repo root. One task = one commit
(`redesign(R1): R1-T<N> <title>`); suite green per task (R-B). Old pages keep rendering unchanged
inside the new shell until R2. The OLD top nav is removed only in R1-T12, the last task.*

Phase-wide constants (use these exact names everywhere):

- localStorage key for rail collapse: `studio-rail-collapsed` (value `'true'` when collapsed,
  key absent otherwise — mirrors `studio-dev-mode` in `frontend/src/utils/devMode.ts`).
- CSS classes (new blocks in `frontend/src/theme/components.css`, tokens only per R-E):
  `nav-rail`, `nav-rail--collapsed`, `nav-rail__group-label`, `nav-rail__item`,
  `nav-rail__item--active`, `nav-rail__badge`, `nav-rail__bottom`, `nav-rail__overlay`,
  `top-bar`, `top-bar__breadcrumb`, `top-bar__identity-slot`, `top-bar__connection-dot`,
  `top-bar__queue-btn`, `shell-grid`.
- Rail widths: expanded 190px, collapsed 56px (CSS vars `--rail-width: 190px`,
  `--rail-width-collapsed: 56px` added to `frontend/src/theme/tokens.css`).
- Nav icons: lucide-react (`Library`, `Mic`, `Zap`, `Puzzle`, `Plug`, `Settings`,
  `FlaskConical`, `BarChart2`, `Radio`) — the mock's emoji are placeholders, not layout truth.

---

### R1-T1 — Rail state utility (`railState.ts`)

- **Goal**: A localStorage-backed collapse-state store with a React hook, identical in shape to `devMode.ts`.
- **Read first**: `frontend/src/utils/devMode.ts`, `frontend/tests/unit/pages/Settings/components/GeneralSettingsPanelDevMode.test.tsx` (test pattern).
- **Create/Modify**: Create `frontend/src/utils/railState.ts`; create `frontend/tests/unit/utils/railState.test.ts`.
- **Steps**:
  1. Copy the structure of `devMode.ts`: module-level `Set` of listeners, `_notify()`.
  2. Export `STORAGE_KEY = 'studio-rail-collapsed'`, `isRailCollapsed(): boolean`, `setRailCollapsed(collapsed: boolean): void` (set `'true'` / `removeItem`), `subscribeRailState(listener)`, and hook `useRailCollapsed(): boolean` via `useSyncExternalStore` (server snapshot `false`).
  3. Wrap all localStorage access in try/catch like devMode.ts.
- **Capabilities re-homed**: none (new persistence).
- **Tests**: `railState.test.ts` — asserts default false, set→true persists to localStorage under the exact key, listener fires on change, hook reflects updates (renderHook + act).
- **Verify**: `npm -C frontend run test -- --run`, `npm -C frontend run lint`, `npm -C frontend run build`.
- **Out of scope**: No component code, no Layout changes.

### R1-T2 — Nav data model (`navData.ts`)

- **Goal**: One typed source of truth for rail groups/items consumed by rail, mobile drawer, and tests.
- **Read first**: `frontend/src/demo/stages/siteMockup/rail.tsx` (RAIL_GROUPS), `frontend/src/components/layout/Layout.tsx` (current navItems), `frontend/src/utils/devMode.ts`.
- **Create/Modify**: Create `frontend/src/app/layout/navData.ts`; create `frontend/tests/unit/app/layout/navData.test.ts`.
- **Steps**:
  1. Define `NavItem = { id: string; label: string; path: string; icon: LucideIcon; badge?: 'queue' }` and `NavGroup = { group: string; items: NavItem[] }`.
  2. Export `buildNavGroups(devMode: boolean): NavGroup[]` returning: CREATE → Library `/`, Voices `/voices`; MONITOR → Activity `/activity` (badge: `'queue'`); PLATFORM → Engines `/engines`, Integrations `/integrations`; MANAGE → Settings `/settings`; plus DEVELOPER group (Progress test `/progress-test`, Event stream `/event-stream`) only when `devMode` is true.
  3. Export `getActiveNavId(pathname: string): string` mapping: `/` and `/project/*`, `/chapter/*`, future `/book/*` → `library`; `/voices*` → `voices`; `/activity*` and `/queue*` → `activity`; `/engines*` → `engines`; `/integrations*` → `integrations`; `/settings*` → `settings`; `/progress-test`, `/event-stream` → their dev ids; fallback `library`.
- **Capabilities re-homed**: none (model only).
- **Tests**: `navData.test.ts` — group order, dev group present only with devMode, `getActiveNavId` table-driven cases including `/project/abc` and `/queue`.
- **Verify**: standard three frontend commands.
- **Out of scope**: No rendering, no Layout edits.

### R1-T3 — NavRail component

- **Goal**: The grouped left rail per mock rail.tsx: group labels, active item highlight, queue-count badge on Activity, collapse to 56px icon-only, hover-overlay expand, bottom row (theme toggle + chevron), persisted via railState.
- **Read first**: `frontend/src/demo/stages/siteMockup/rail.tsx` (lines 12–35 groups, 320–416 bottom row), `frontend/src/app/layout/navData.ts`, `frontend/src/utils/railState.ts`, `frontend/src/utils/theme.ts` (`saveThemePref`), `frontend/src/theme/components.css` (existing class style).
- **Create/Modify**: Create `frontend/src/app/layout/NavRail.tsx`; add `nav-rail*` class blocks to `frontend/src/theme/components.css`; add `--rail-width`/`--rail-width-collapsed` to `frontend/src/theme/tokens.css`; create `frontend/tests/unit/app/layout/NavRail.test.tsx`.
- **Steps**:
  1. Props: `{ queueCount?: number }`. Internals: `useRailCollapsed()` + `setRailCollapsed`, `useDevMode()`, `useLocation`/`useNavigate`, `buildNavGroups`/`getActiveNavId`.
  2. Render `<nav className={collapsed ? 'nav-rail nav-rail--collapsed' : 'nav-rail'} aria-label="Primary">`. Width from the CSS vars; `transition: width 0.18s ease`. Group labels (`nav-rail__group-label`, uppercase, `var(--text-muted)`) hidden when collapsed.
  3. Items are `<button>`s: icon + label (label hidden when collapsed, `title={label}` set when collapsed); active item gets `nav-rail__item--active` (left 3px `var(--accent)` border + `var(--accent-glow)` tint background, `aria-current="page"`). Activity item renders `nav-rail__badge` with `queueCount` when > 0 (absolute top-right of icon when collapsed, inline when expanded — mock rail.tsx 116–132).
  4. Hover-overlay expand: when collapsed, `onMouseEnter` on the rail sets local `hoverExpanded=true` rendering the expanded rail as an absolutely-positioned overlay (`nav-rail__overlay`, `position:absolute; left:0; top:0; bottom:0; width:var(--rail-width); z-index` from `frontend/src/app/layout/layering.ts` — add `RAIL_OVERLAY` between existing layers, below HEADER). `onMouseLeave` clears it. Persisted collapsed state unchanged by hover.
  5. Bottom row per mock: expanded = one horizontal row, theme button left (icon + "Dark mode"/"Light mode" label) and chevron `‹` right; collapsed = stacked theme icon above chevron `›`. Theme toggle flips `document.documentElement.dataset.theme` and calls `saveThemePref(next)` exactly like mock rail.tsx 52–57. Chevron `aria-label="Collapse rail"`/`"Expand rail"` calls `setRailCollapsed(!collapsed)`.
- **Capabilities re-homed**: top-nav Library/Voices/Settings buttons (inventory §1 line 1 — rail side; old header stays until R1-T12); theme quick toggle (§1 last line — rail side).
- **Tests**: `NavRail.test.tsx` — renders all group labels and items; devMode localStorage flag adds Developer group; click Voices navigates (MemoryRouter); chevron click flips `studio-rail-collapsed` in localStorage and adds `nav-rail--collapsed`; badge shows for `queueCount=3` and hides for 0; theme button flips `data-theme` (assert both directions, satisfies R-E dark check).
- **Verify**: standard three frontend commands.
- **Out of scope**: Not mounted anywhere yet; no Layout/App changes; no contextual book block (that is R2/R3).

### R1-T4 — TopBar component

- **Goal**: Slim top bar: breadcrumb slot, reserved book-identity slot, connection dot, Queue drawer button with badge.
- **Read first**: `frontend/src/demo/stages/siteMockupStage.tsx` lines 234–310, `frontend/src/components/layout/Layout.tsx` (queue button behavior), `frontend/src/app/navigation/model.ts` + `frontend/src/app/layout/StudioShell.tsx` (hydration/connection state shape), `frontend/src/components/layout/BrandLogo.tsx`.
- **Create/Modify**: Create `frontend/src/app/layout/TopBar.tsx`; add `top-bar*` classes to `frontend/src/theme/components.css`; create `frontend/tests/unit/app/layout/TopBar.test.tsx`.
- **Steps**:
  1. Props: `{ breadcrumb?: React.ReactNode; identitySlot?: React.ReactNode; shellState?: Pick<StudioShellState,'navigation'|'hydration'>; queueCount?: number; isQueueOpen?: boolean; onToggleQueue?: () => void }`.
  2. Layout: `header.top-bar` flex row, height `var(--header-height, 56px)`, `background: var(--glass)`, bottom border `var(--border)`. Left: `BrandLogo` (scale 0.7, click → navigate `/`) then `top-bar__breadcrumb` rendering the `breadcrumb` node (default: derive a plain-text crumb from `shellState.navigation.routeKind` — reuse `frontend/src/app/navigation/breadcrumbs.ts` helpers if exported, otherwise pathname-based labels matching navData).
  3. Center: empty `top-bar__identity-slot` div with `data-testid="topbar-identity-slot"` — R2 fills it with the book identity line. Leave a code comment pointing at `04_phase_r2_pipeline.md`.
  4. Right: `top-bar__connection-dot` — 8px circle, `var(--success)` when `shellState.hydration.status === 'live'`/connected, `var(--warning)` when reconnecting, `var(--text-muted)` otherwise; `title` text states the status; include `role="status"` + visually-hidden text. Then `top-bar__queue-btn`: ⚡ Queue button calling `onToggleQueue`, badge with `queueCount` when > 0, `aria-pressed={isQueueOpen}`.
- **Capabilities re-homed**: Queue drawer toggle button + badge (§1); connection/hydration display (§1); BrandLogo home click (§1) — header side removed in R1-T12.
- **Tests**: `TopBar.test.tsx` — renders breadcrumb text; queue button fires `onToggleQueue` and shows badge=2; connection dot reflects connected vs reconnecting; identity slot testid exists and is empty.
- **Verify**: standard three frontend commands.
- **Out of scope**: Not mounted; no book identity content; no breadcrumb redesign beyond plain mapping.

### R1-T5 — Layout converts to rail|main grid (old header retained)

- **Goal**: `Layout.tsx` renders NavRail + TopBar in a `shell-grid` (rail column + main column) while keeping the existing top header temporarily so nothing is lost mid-phase.
- **Read first**: `frontend/src/components/layout/Layout.tsx` (whole file), `frontend/src/app/App.tsx` lines 236–365, `frontend/tests/unit/components/layout/Layout.test.tsx`, `frontend/src/app/layout/layering.ts`.
- **Create/Modify**: Modify `frontend/src/components/layout/Layout.tsx`; add `shell-grid` CSS; update `frontend/tests/unit/components/layout/Layout.test.tsx`.
- **Steps**:
  1. Keep the `LayoutProps` interface unchanged (App.tsx passes `queueCount`, `shellState`, `onToggleQueue`, `isQueueOpen`).
  2. New structure: root keeps `data-testid="layout-root"` and `data-shell-hydration` exactly as today. Inside: existing `<header>` (unchanged, still fixed) THEN `div.shell-grid` = `display:grid; grid-template-columns: auto 1fr; min-height: calc(100vh - var(--header-height,72px))` containing `<NavRail queueCount={queueCount} />` and a main column with `<TopBar …all props… />` followed by the existing `<main className="mobile-padding">` content wrapper (children untouched, max-width 1600px preserved).
  3. During this transitional task the page shows old header + new TopBar; that is accepted until R1-T12. Adjust `margin-top` so content is not double-offset (main's `marginTop` stays keyed to the old header only).
  4. Hide NavRail at ≤768px via CSS (`@media (max-width: 768px) { .nav-rail { display: none; } }`) — mobile gets the rail data in R1-T10.
- **Capabilities re-homed**: none removed (R-C: old header still present).
- **Tests**: update `Layout.test.tsx` — still asserts `layout-root` + hydration attribute; new assertions: rail renders with groups, TopBar queue button calls `onToggleQueue`. Keep all existing passing assertions about the old nav (they die in R1-T12).
- **Verify**: standard three frontend commands; if running interactively, eyeball light + dark (`data-theme="dark"`).
- **Out of scope**: Do not touch App.tsx routes; do not remove burger/header; do not restyle pages.

### R1-T6 — `/activity` route: real Activity page (queue full mode + history + stats)

- **Goal**: A real Activity page at `/activity` that reuses `GlobalQueue` full mode (now / queued / history) with `QueueStats`, matching `panes/activity.tsx` layout.
- **Read first**: `frontend/src/demo/stages/siteMockup/panes/activity.tsx`, `frontend/src/components/queue/GlobalQueue.tsx`, `frontend/src/components/queue/QueueStats.tsx`, `frontend/src/pages/Queue/QueueRoute.tsx`, `frontend/src/app/App.tsx` `/queue` route block.
- **Create/Modify**: Create `frontend/src/pages/Activity/ActivityPage.tsx` (+ `frontend/src/pages/Activity/index.ts`); modify `frontend/src/app/App.tsx` (add lazy route `/activity`); create `frontend/tests/unit/pages/Activity/ActivityPage.test.tsx`.
- **Steps**:
  1. `ActivityPage` props mirror what App passes the `/queue` route today: `{ paused, jobs, queue, loading, onRefresh, connected, isReconnecting }` (reuse `QueueRoute`'s shell wrapper pattern or render directly — copy the prop wiring from the existing `/queue` route element in App.tsx).
  2. Two-column layout per mock: left (flex 2) `GlobalQueue` full mode (NOT compact); right (flex 1) "Stats" column rendering `QueueStats`. Columns stack at ≤1000px.
  3. Add the route in App.tsx inside the existing `<Routes>` with the same lazy/Suspense pattern as other pages. Do NOT change the `/queue` drawer-bounce effect (App.tsx 188–196) — `/queue` behavior is untouched.
  4. Rail Activity item (navData `/activity`) now resolves; verify active-state mapping from R1-T2 covers it.
- **Capabilities re-homed**: inventory §8 lines: pause/resume, clear menu, active job cards, cancel, reorder, history list, queue stats, empty state, paused banner — now ALSO available at `/activity` (drawer + `/queue` keep working; nothing removed).
- **Tests**: `ActivityPage.test.tsx` — renders GlobalQueue full mode with a queued job fixture (build frames via `frontend/src/api/contracts/liveEvents.ts` types if sockets are involved — R3 testing rule; otherwise plain props), shows history section and stats column; route test: navigating to `/activity` renders the page (extend `frontend/tests/unit/test/Navigation.test.tsx` or App.test.tsx).
- **Verify**: standard three frontend commands.
- **Out of scope**: Production tally / calibration cards (next task); history filter chips (next task); no backend.

### R1-T7 — Activity stats: production tally + engine calibration + history filters

- **Goal**: Activity right column gains the "Engine calibration" card and "Production" tally card per mock; history gains All/Renders/Samples/API filter chips.
- **Read first**: `frontend/src/demo/stages/siteMockup/panes/activity.tsx` (lines 36–98), `frontend/src/pages/Settings/components/AboutSettingsPanel.tsx` (production tally block 79–127 — COPY pattern, the About card stays), `frontend/src/components/queue/QueueStats.tsx` (calibration fields), `frontend/src/types/index.ts` (calibrated_cps etc.), `frontend/src/utils/queueLabels.ts` (job-type labels for filtering).
- **Create/Modify**: Create `frontend/src/pages/Activity/components/ProductionTallyCard.tsx` and `frontend/src/pages/Activity/components/EngineCalibrationCard.tsx`; modify `frontend/src/pages/Activity/ActivityPage.tsx`; modify `frontend/src/components/queue/GlobalQueue.tsx` ONLY if a `historyFilter` prop is the cleanest hook — otherwise filter in ActivityPage before passing jobs; tests under `frontend/tests/unit/pages/Activity/`.
- **Steps**:
  1. `ProductionTallyCard`: fetches `api.fetchHome()` render_stats like AboutSettingsPanel does, displays duration/words/chars + "Tally since" line. NO Reset button here (Reset stays in Settings About only — single mutation point).
  2. `EngineCalibrationCard`: takes `engines: TtsEngine[]` (already in App's `initialData`), rows = engine display_name, `calibrated_cps` formatted `X.X c/s`, confidence dot colored by `calibration_confidence_percent` thresholds (≥70 `var(--success)`, ≥30 `var(--warning)`, else `var(--text-muted)`); "not calibrated" row state when null.
  3. History filter chips: local state `'All' | 'Renders' | 'Samples' | 'API'`; classify jobs with the existing job-type helpers in `utils/queueLabels.ts`/`utils/jobSelection.ts` (renders = chapter synthesis/assembly; samples = sample_build/sample_test/voice test; API = api_synthesis). Filter the history list only, not active jobs.
  4. Pass `engines` from App.tsx initialData into ActivityPage.
- **Capabilities re-homed**: §10 "Production Tally … copied to R1 Activity Stats"; §8 "per-engine calibration" surfaced as the Activity calibration card; mock-new history filters.
- **Tests**: calibration card renders c/s + confidence per fixture engine and a "not calibrated" state; tally card renders mocked fetchHome stats (mock at the api-client boundary, R2 mock rule); filter chip "Samples" hides render-history rows (fixture jobs of both types).
- **Verify**: standard three frontend commands.
- **Out of scope**: Reset tally action; 7-day sparkline (mock-only garnish — log as R6 nice-to-have); QueueStats internals.

### R1-T8 — `/engines` route: re-home the Settings engines panel

- **Goal**: Engines becomes a standalone page; component files MOVE (not copy) out of Settings; Settings "TTS Engines" tab becomes a thin redirect.
- **Read first**: `frontend/src/pages/Settings/components/EnginesPanel.tsx`, `EngineCard.tsx`, `EngineDevPanel.tsx`, `EngineMetadataPanel.tsx`, `JsonSchemaForm.tsx`, `engineFormatters.ts`, `engineScenarioMerge.ts`, `frontend/src/pages/Settings/SettingsRoute.tsx`, `settingsRouteConfig.ts`, tests `frontend/tests/unit/pages/Settings/components/EngineCard*.test.tsx`, `JsonSchemaForm.test.tsx`, `SettingsRoute.test.tsx`.
- **Create/Modify**: Create `frontend/src/pages/Engines/EnginesPage.tsx` + `frontend/src/pages/Engines/components/` (git-mv the seven engine files there); update all imports; modify `SettingsRoute.tsx` + `settingsRouteConfig.ts`; modify `frontend/src/app/App.tsx` (lazy route `/engines`); move matching tests to `frontend/tests/unit/pages/Engines/components/` with updated imports (R-D: move, never delete).
- **Steps**:
  1. `git mv` the engine component files to `frontend/src/pages/Engines/components/`; fix `@/pages/Settings/components/...` imports repo-wide (grep for each filename). `JsonSchemaForm` stays engine-owned (its only consumers are engine cards) — move it too.
  2. `EnginesPage.tsx` wraps `EnginesPanel` with a page heading ("Engines") and receives the same props App currently passes SettingsRoute for engines (`startupReady`, `onRefresh`, `onShowNotification`).
  3. App.tsx: add `/engines` lazy route passing those props.
  4. `SettingsRoute.tsx` / `settingsRouteConfig.ts`: keep the "TTS Engines" tab entry but its path component now renders `<Navigate to="/engines" replace />` (R-G: `/settings/engines` keeps working). Tab description updated to "Moved to Platform → Engines".
  5. `PluginTrustModal` import path is unchanged (`components/overlays/`) — verify install flow still compiles.
- **Capabilities re-homed**: §10 engines lines: install plugin + trust modal, refresh plugins, diagnostics logs + live lines, EngineCard enable/verify/settings/metadata, EngineDevPanel dev toggle.
- **Tests**: moved engine tests pass from new location; `SettingsRoute.test.tsx` updated: `/settings/engines` redirects to `/engines`; new `frontend/tests/unit/pages/Engines/EnginesPage.test.tsx` render smoke test.
- **Verify**: standard three frontend commands; grep `pages/Settings/components/Engine` returns nothing.
- **Out of scope**: No visual redesign of cards (R6/mock `panes/platform.tsx` parity later); no diagnostics behavior changes.

### R1-T9 — `/integrations` route: re-home the API panel

- **Goal**: The API integration guide becomes `/integrations`; Settings "API" tab redirects.
- **Read first**: `frontend/src/pages/Settings/components/ApiSettingsPanel.tsx`, `frontend/src/pages/Settings/settingsRouteHelpers.ts` (`apiExampleStyle`), `SettingsRoute.tsx`, `settingsRouteConfig.ts`, mock `frontend/src/demo/stages/siteMockup/panes/platform.tsx` (Integrations section, layout reference only).
- **Create/Modify**: Create `frontend/src/pages/Integrations/IntegrationsPage.tsx`; `git mv` `ApiSettingsPanel.tsx` → `frontend/src/pages/Integrations/components/ApiGuidePanel.tsx` (rename component `ApiGuidePanel`); modify `SettingsRoute.tsx`, `settingsRouteConfig.ts`, `frontend/src/app/App.tsx`; update/move any tests importing ApiSettingsPanel.
- **Steps**:
  1. Move + rename the panel; keep `apiExampleStyle` import from settingsRouteHelpers (or move that style constant into the new file if it is the only consumer — grep first).
  2. `IntegrationsPage.tsx` = page heading ("Integrations") + `ApiGuidePanel`. No props needed (panel is static).
  3. App.tsx lazy route `/integrations`.
  4. Settings "API" tab → `<Navigate to="/integrations" replace />`; `/settings/api` keeps resolving (R-G).
- **Capabilities re-homed**: §10 API panel line (guide, security note, endpoint reference, Swagger link).
- **Tests**: new `IntegrationsPage.test.tsx` render test (asserts Swagger link href `/api/v1/tts/docs` and Security Note heading); `SettingsRoute.test.tsx` redirect case for `/settings/api`.
- **Verify**: standard three frontend commands.
- **Out of scope**: API keys/auth UI (does not exist — do not invent); engine pages.

### R1-T10 — Mobile: rail-data burger drawer

- **Goal**: At ≤768px the rail is hidden and the existing burger drawer renders the SAME nav data (groups, badges, dev group) via navData.
- **Read first**: `frontend/src/components/layout/Layout.tsx` (burger + `header-nav--open`), `frontend/src/theme/utilities.css` lines 289–345, `frontend/src/app/layout/navData.ts`, `frontend/src/app/layout/NavRail.tsx`.
- **Create/Modify**: Create `frontend/src/app/layout/MobileNavDrawer.tsx`; modify `Layout.tsx`; CSS additions in `utilities.css`/`components.css`; create `frontend/tests/unit/app/layout/MobileNavDrawer.test.tsx`.
- **Steps**:
  1. `MobileNavDrawer` props `{ open, onClose, queueCount }`; renders `buildNavGroups(useDevMode())` as a full-height left slide-in panel + backdrop (reuse `.mobile-nav-backdrop` class); item click navigates then calls `onClose`. Activity badge identical to rail. Include the theme toggle row at the bottom (same handler as NavRail — extract a tiny shared `useThemeToggle` helper into `frontend/src/utils/theme.ts` rather than duplicating).
  2. Layout.tsx: burger button now toggles `MobileNavDrawer` instead of `header-nav--open`; the old `<nav className="header-nav">` keeps its desktop behavior untouched until R1-T12.
  3. CSS: confirm `.nav-rail { display:none }` ≤768px (from R1-T5); drawer visible only ≤768px is NOT enforced in CSS (component is render-gated by the burger, which CSS already hides >768px).
- **Capabilities re-homed**: §1 burger/mobile drawer line.
- **Tests**: `MobileNavDrawer.test.tsx` — open renders all groups; click item navigates and closes; backdrop click closes; dev group gated by devMode.
- **Verify**: standard three frontend commands; if interactive, dev server at 375px width shows burger → drawer with grouped nav.
- **Out of scope**: Touch gestures, animation polish, removing old `header-nav` CSS (R1-T12).

### R1-T11 — Rail Developer group links + dev-route survival check

- **Goal**: Dev-mode rail group works end-to-end and the Settings Developer panel keeps its cards; `/progress-test` and `/event-stream` render inside the new shell.
- **Read first**: `frontend/src/pages/Settings/components/DeveloperSettingsPanel.tsx`, `frontend/src/app/layout/navData.ts`, `frontend/src/app/App.tsx` routes 357–358.
- **Create/Modify**: Modify `navData.ts` only if links were stubbed; update `frontend/tests/unit/test/Navigation.test.tsx` (or App.test.tsx).
- **Steps**:
  1. Enable dev mode (localStorage `studio-dev-mode=true`) and verify rail shows DEVELOPER group with Progress test + Event stream; both routes render their pages inside the rail|main grid (no full-screen breakout).
  2. External dev links (Design spec sheet, Swagger) stay Settings-Developer-only (rail keeps internal routes only — matches mock rail which has no external links).
  3. Add `getActiveNavId` coverage for both dev paths if missing.
- **Capabilities re-homed**: §11 dev routes reachable from rail; Settings Developer cards unchanged.
- **Tests**: App/Navigation test — with devMode flag set, `/progress-test` and `/event-stream` render and rail marks the dev item active; without the flag the rail has no DEVELOPER group but direct URL navigation still works (routes are NOT dev-gated today — preserve that).
- **Verify**: standard three frontend commands.
- **Out of scope**: DevProgressBar/LiveOutput page internals.

### R1-T12 — Remove the old top nav (LAST task)

- **Goal**: Delete the legacy header nav now that rail + TopBar + mobile drawer cover everything; TopBar becomes the only horizontal chrome.
- **Read first**: `frontend/src/components/layout/Layout.tsx`, `frontend/src/theme/utilities.css` 289–345, `frontend/tests/unit/components/layout/Layout.test.tsx`, the R1 acceptance checklist below (run it mentally first — if any item fails, STOP per R-C and log in `99_progress_log.md`).
- **Create/Modify**: Modify `Layout.tsx` (remove old `<header>` nav items, keep/relocate burger into TopBar left edge ≤768px), `utilities.css` (delete `.header-nav*` blocks; keep `.burger` + `.mobile-nav-backdrop`), `Layout.test.tsx`, and `frontend/src/theme/tokens.css` if `--header-height` changes (TopBar height 56px — update consumers: grep `--header-height`).
- **Steps**:
  1. Remove navItems/`getActiveTab`/hoveredTab from Layout.tsx; the root becomes: TopBar (fixed or sticky, full width) over `shell-grid` (rail + main). Burger button moves into TopBar's left side, CSS-hidden >768px, wired to MobileNavDrawer.
  2. `headerRight` prop: grep usages; if unused, drop it from `LayoutProps`; if used, render into TopBar's right cluster.
  3. Update Layout tests: old-nav assertions replaced by rail/TopBar assertions (imports updated, not deleted — R-D).
  4. Full manual pass of the acceptance checklist; eyeball light AND dark.
- **Capabilities re-homed**: §1 lines 1–2 and 5–6 now exclusively at their R1 homes; nothing else may disappear.
- **Tests**: updated `Layout.test.tsx` green; whole suite green; `npm -C frontend run build` clean.
- **Verify**: all three frontend commands; `grep -rn "header-nav" frontend/src` → empty.
- **Out of scope**: Anything in `pages/` content areas; route changes; `frontend/src/demo/` (R-H).

---

## Acceptance checklist (phase-boundary review — walk in a real browser, light AND dark)

- [x] Rail shows CREATE (Library, Voices) / MONITOR (Activity) / PLATFORM (Engines, Integrations) / MANAGE (Settings) with correct active highlight on every route.
- [x] Activity rail badge shows the live queue count and updates when a job is queued/completes.
- [x] Collapse rail via chevron → icon-only 56px; reload the page → still collapsed (localStorage `studio-rail-collapsed`).
- [x] Hovering the collapsed rail shows the expanded overlay; moving away collapses it; persisted state unchanged.
- [x] Expanded left rail exposes a draggable resize handle on the trailing edge; dragging shifts the main content layout, and the width persists across reload.
- [ ] Rail bottom: expanded = theme button + chevron in one row; collapsed = stacked. Theme button flips light/dark instantly, persists across reload, and Settings → General theme select still needs a browser pass (System included).
- [x] TopBar shows breadcrumb, connection dot (green connected / amber reconnecting), and Queue button with badge; clicking Queue opens the SAME right-side drawer with compact GlobalQueue; clicking again closes it.
- [x] Empty identity slot present in TopBar DOM (`topbar-identity-slot`) for R2.
- [x] `/activity` shows Now (active jobs with PredictiveProgressBar + cancel), Queued (drag-reorder works), History with All/Renders/Samples/API filters, and Stats column with engine calibration + production tally (tally matches Settings → About numbers).
- [x] Pause All / Resume and Clear Completed / Clear All work from both Activity and the drawer.
- [x] `/engines` shows the full engines panel (install plugin incl. trust modal, refresh, diagnostics logs, engine cards with settings forms); `/settings/engines` redirects there.
- [x] `/integrations` shows the API guide with working Swagger link; `/settings/api` redirects there.
- [x] `/queue` URL still opens the drawer and bounces back (legacy behavior intact); `/project/:id`, `/chapter/:id`, `/voices`, `/settings`, `/progress-test`, `/event-stream` all render unchanged inside the new shell.
- [x] Dev mode ON: rail gains DEVELOPER group (Progress test, Event stream); OFF: group gone, direct URLs still work.
- [x] ≤768px: rail hidden; burger in TopBar opens the mobile drawer with the same grouped nav + theme toggle; backdrop closes it.
- [ ] No old top-nav remnants (`header-nav` gone); no hardcoded colors in new CSS (spot-check `nav-rail`/`top-bar` blocks use tokens); StatusOrb untouched anywhere it appeared before.
