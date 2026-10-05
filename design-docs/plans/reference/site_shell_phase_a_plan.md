# Phase A — Site Shell Implementation Plan (left rail · Activity page · player bar)

*Companion to [site_experience_north_star.md](site_experience_north_star.md) §11 Phase A. Status: **APPROVED 2026-06-11** (Q1 rail + Q6 collapse-when-empty confirmed). Execute as its OWN PR after #124 merges — do not start on the phase-12.3 branch. Written 2026-06-11 so any agent can execute it cold. Pure re-homing: no new features, no backend changes except one settings read. Each step passes `npm -C frontend run build` + full vitest before the next.*

## Scope fence

IN: navigation shell (left rail), Activity page (real `/queue` route), global player bar v1 (unify the two existing players). OUT (explicitly): Book pipeline stages (Phase B), Voices/Engines/Integrations surfaces (Phase C), any visual redesign beyond what the rail itself requires. Components keep their internals; we move their mount points.

## Pre-reads for the executing agent

- `frontend/src/app/App.tsx` — routes, queue-drawer interception effect (~line 162), startup overlay, toast.
- `frontend/src/components/layout/Layout.tsx` — current top bar + burger drawer (added 2026-06-11, doc 07 §3.1) — the burger/drawer pattern carries over to the rail's mobile mode.
- `frontend/src/app/layout/StudioShell.tsx` + `app/navigation/model.ts` — shell state, breadcrumbs, hydration props.
- `frontend/src/app/layout/layering.ts` — z-index constants (use them; doc 10 U10).
- `frontend/src/components/queue/GlobalQueue.tsx`, `QueueStats` — reused by the Activity page.
- `frontend/src/pages/ChapterEditor/components/PlaybackControls.tsx` (VCR segment player) and the inline chapter player in `ChapterHeader.tsx` — both become consumers of the player bar.
- Settings → About Production Tally (`pages/Settings/` About panel) — moves to Activity.
- `frontend/src/utils/theme.ts` + `utils/devMode.ts` — the localStorage-pref pattern; rail collapse state uses the same.

## Step 1 — NavRail component (no behavior change yet)

1.1 Create `frontend/src/app/layout/NavRail.tsx`:
- Props: `items: NavGroup[]` where `NavGroup = { label: string; items: { to: string; label: string; icon: LucideIcon; badge?: number; kind?: 'route'|'drawer' }[] }`.
- Groups per north star: CREATE (Library `/`, Voices `/voices`), MONITOR (Activity `/activity`, badge = live queue count), PLATFORM (Engines `/settings/engines` for now — real route in Phase C), MANAGE (Settings `/settings`). Developer group appended when `useDevMode()` is on (links from the Developer settings panel).
- Collapsed mode (icons only, 56px) ↔ expanded (~200px); chevron toggle at rail bottom; persist in localStorage `studio-rail-collapsed` via a `utils/railState.ts` mirroring `devMode.ts` (subscribable so Layout reflows). **Owner amendment 2026-06-12:** while collapsed, hover/focus expands the rail as a temporary overlay (absolute-positioned over content, no layout reflow); re-collapses on mouse-leave/blur. Mocked interactively in styleguide U15.
- Active state: NavLink route matching; drawer-kind items get `aria-pressed` + distinct open style (doc 10 U5 — drawer-open ≠ route-active).
- ≤768px: rail hides entirely; the existing burger drawer (doc 07) renders the same `NavGroup[]` content — single source of nav truth, two presentations.
- Styling: tokens only; respects `[data-theme]`.

1.2 Tests `frontend/tests/unit/app/NavRail.test.tsx`: renders groups/items; collapse toggle persists; badge renders; drawer-kind item calls its onClick not navigation; dev group hidden without dev mode.

## Step 2 — Swap Layout to the rail

2.1 `Layout.tsx`: replace the top-bar nav items with `<NavRail/>` on the left; the top strip shrinks to: app wordmark (→ `/`), breadcrumb slot (from shell state), right-side status cluster (connection orb, queue drawer toggle button — the drawer keeps a header affordance for at-a-glance use). Grid: `rail | main` columns; main owns scroll.
2.2 The queue NAV item becomes Activity (route). The HEADER queue button keeps the drawer.
2.3 Delete the `/queue`-intercept effect in App.tsx (the route becomes real in Step 3) — check `useQueueSync`/`useJobs` don't depend on the redirect side effects.
2.4 Update `Layout.test.tsx` (burger tests keep passing — drawer now renders NavRail content) and any test asserting top-bar link presence.
2.5 Visual check (preview tools): 1440/1024/768 light+dark screenshots; no horizontal scroll; editor still fits (rail collapsed auto at ≤1100px — media-query default, user pref wins after first toggle).

## Step 3 — Activity page (`/activity`, and `/queue` → redirect to it)

3.1 `frontend/src/pages/Activity/ActivityPage.tsx`, route `/activity`:
- Header: `QueueStats` + Pause/Resume All (same handlers GlobalQueue uses — lift the shared actions into `frontend/src/hooks/useQueueActions.ts` consumed by both drawer and page; do NOT fork logic).
- Tabs (query param, like ProjectSubnav): **Active** (the `GlobalQueue` list component mounted full-width — pass a `variant="page"` prop only if spacing demands it), **History** (completed/failed jobs from the existing queue snapshot — reuse `QueueItem` rows, no new fetch endpoints), **Stats** (Production Tally card MOVED from Settings→About — component extraction `components/stats/ProductionTally.tsx`, About keeps a link "Moved to Activity"; per-engine calibration summary cards reusing the data EngineCard's calibration block reads).
- Empty states per tab.
3.2 `/queue` route: `<Navigate to="/activity" replace/>` (kills the dead route, preserves old links).
3.3 Tests: page renders three tabs; tab switch via query param; tally renders moved component; `/queue` redirects.

## Step 4 — Player bar v1 (the U16 seam, minimal honest version)

*Goal: ONE audio element/owner; the two existing players become controllers of it. No waveform yet (that's Phase D). Owner decision 2026-06-12: when the waveform lands, it is a user-toggleable strip (persisted pref) that expands the bar's height; library is **wavesurfer.js**; mocked in styleguide U16. Design the bar v1 so the height-expansion slot exists (CSS only, no dependency now).*

4.1 `frontend/src/store/playerBus.ts`: tiny module-state store (devMode.ts pattern + useSyncExternalStore hook `usePlayer()`): `{ scope: 'segment'|'chapter'|'preview', title, audioUrl, playing, positionSec, durationSec, queue?: {prev,next} callbacks }` + actions `load(source)`, `play/pause/stop/seek`, `clear()`. One `<audio>` element lives in the bar component; everything else dispatches.
4.2 `frontend/src/app/layout/PlayerBar.tsx`: fixed bottom bar (height ~64px, `layering.ts` constant below modal): scope chip ("Segment 14 · Chapter 3" / "Chapter 3 — full render"), prev/next (rendered only when callbacks present), play/pause, seek slider, time, close (clear). Hidden entirely when nothing loaded (north-star Q6 lean). Mounted once in Layout; main content gets bottom padding when visible.
4.3 Migrate consumers:
- `PlaybackControls.tsx` (VCR): becomes a thin adapter — its segment-list navigation feeds `playerBus.load({scope:'segment', queue:{prev,next}})`; the bottom-of-editor mount is REMOVED (the global bar replaces it). Keep the file exporting the segment-sequencing logic (it's the valuable part).
- ChapterHeader inline chapter player: "Play chapter" button → `playerBus.load({scope:'chapter'})`; inline `<audio>` removed.
- Voice preview play buttons (NarratorCard/SampleManager) MAY adopt `scope:'preview'` if trivial; otherwise explicitly deferred (note in report) — don't let this step sprawl.
4.4 Tests: playerBus state machine (load/play/pause/seek/clear, single-owner — loading a new source stops the old); PlayerBar renders scope chip + hides when empty; PlaybackControls adapter drives bus (existing PlaybackControls tests updated, not deleted — the sequencing assertions still hold against the adapter).
4.5 Manual verify (preview tools + a real render if available): segment audition keeps playing while navigating to Library; chapter scope swap works.

## Step 5 — Sweep & gate

- Grep for links/strings referencing removed surfaces (`/queue` direct links, "open queue page").
- `npm -C frontend run lint && npm -C frontend run test -- --run && npm -C frontend run build && npm -C frontend run build:demo`.
- Update `wiki/` pages showing old nav screenshots (note for the wiki-refresh task; don't re-shoot screenshots mid-phase).
- Spec/docs: none of this touches backend contracts. Add `design-docs/specs/` entry ONLY if the player bus becomes a contract other features must obey (write `progress-presentation.md` cross-link note if PlayerBar consumes live progress later).
- Checkpoint commits: one per step (1–4), message prefix `shell:`.

## Risks & rollback

- Rail vs editor width at 1024–1280px: auto-collapse default mitigates; if the editor still fights, ship rail with `position: fixed` overlay-on-hover expansion at that band (note as fallback, don't pre-build).
- PlaybackControls is wired into segment selection state in the editor — the adapter must preserve the selected-segment sync both directions (play from script view ↔ bar next/prev moves selection). If two-way sync turns hairy, v1 keeps one-way (script → bar) and logs the gap.
- Each step is independently revertable; no step changes data or backend behavior.

## Acceptance (Phase A done)

- No top-bar nav; grouped rail with collapse, correct active/drawer states, mobile drawer parity.
- `/activity` is a real page (Active/History/Stats), `/queue` redirects, tally lives there.
- Exactly one `<audio>` owner; segment + chapter playback both route through the bottom bar; audio survives route navigation.
- Full suite green; build + demo build green; light/dark × 1440/1024/768 screenshots attached to the PR.
