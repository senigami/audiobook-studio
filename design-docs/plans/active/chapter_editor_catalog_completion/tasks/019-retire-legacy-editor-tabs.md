# Task 019 — Retire legacy Script/Source-Text tab pair + per-span dropdown

Status: pending

Risk: quality-sensitive (deleting a still-live route)

## Goal

Delete the legacy `ChapterEditor`/`EditorTabs` Script/Source-Text tab pair (`frontend/src/pages/ChapterEditor/components/EditorTabs.tsx`, `ChapterEditorPage.tsx`) and the `editingChapterId` branch of `ProjectDetailPage.tsx` that renders it, plus remove `ScriptView.tsx`'s per-span inline `<select>` dropdown — but only once each deletion is confirmed safe by a **live click-through**, not a code read alone.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §3 ("Killed / merged") and §7's intro, the new Director's Console (Cast/Booth/Revise/Write, at `/book/:bookId/chapter/:chapterId`) supersedes the legacy tab pair and its per-span dropdown entirely. Leaving them in place after this plan is otherwise "catalog complete" means two competing chapter-editing surfaces ship in the bundle — one of them possibly fully undiscoverable via any current navigation entry point, still handling assignment writes through a second code path that bypasses task 001's mutation-batching collector, and a standing candidate for accidental reachability regressions in future routing changes. `01-map.md`'s R-D flags this explicitly as "genuinely uncertain" and requires a live click-through, not just a code read, before deleting anything — this task exists to resolve that uncertainty first, then act on the answer.

## Exact reachability question to answer

Is there any current navigation entry point in the **live, running app** that lands a user on `/project/:projectId/details` with a chapter actively open for editing (i.e. with the legacy `EditorTabs` Script/Source-Text pair visible), or is that branch orphaned?

## Current shape (verified by code read — NOT yet by live click-through; step 1 below must confirm or refute this)

- `EditorTabs.tsx` (`frontend/src/pages/ChapterEditor/components/EditorTabs.tsx:3,24-36`) is a literal `'script'|'edit'` tab pair (`Script` / `Source Text` buttons) — still fully wired, not dead code by any static measure on its own.
- It's rendered inside `ChapterEditor` (`ChapterEditorPage.tsx`), which `ProjectView` renders whenever `editingChapterId` is truthy (`frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx:352-367`, gate at line 68).
- `ProjectView` is mounted at the registered route `/project/:projectId/details` (`frontend/src/app/App.tsx:295-318`) — a live, still-registered route, distinct from the new `/book/:bookId/chapter/:chapterId` → `BookLayout` → Director's Console route (`App.tsx:280-291`).
- **The route itself is reachable.** `ProjectLibraryPage.tsx` wires project cards' `onOpenDetails={handleOpenProjectDetails}` (`ProjectLibraryPage.tsx:243,253`), and `handleOpenProjectDetails` (`frontend/src/hooks/useProjectLibrary.ts:191-193`) calls `navigate(\`/project/${projectId}/details\`)` directly — a real, clickable "view project details" affordance in the library, not leftover dead code.
- **But `editingChapterId` looks structurally unreachable on that specific route**, from four facts that all have to hold at once for the legacy tab pair to actually render:
  1. `routeChapterId` comes from `useParams()` (`ProjectDetailPage.tsx:66`) against the route pattern `/project/:projectId/details`, which has **no `:chapterId` segment** — so `routeChapterId` is always `undefined` here.
  2. `editingChapterId` falls back to `shellState?.navigation.activeChapterId` (`ProjectDetailPage.tsx:68`). `shellState` is built by `createStudioShellState({ pathname: location.pathname, ... })` inside the `ProjectViewRoute` component defined in `App.tsx` (~line 232), recomputed via `useMemo` keyed on `location.pathname` — always derived from the *current* URL, never carried over from a prior route.
  3. `deriveNavigationState` (`frontend/src/app/layout/StudioShell.tsx:35-88`) only sets `activeChapterId` when `parts[0] === 'chapter'` (lines 74-78) — i.e. only on the `/chapter/:chapterId` pattern. On `/project/:projectId/details`, `parts[0] === 'project'` (line 56), so `activeChapterId` is structurally `undefined` on this route, always.
  4. The one click path inside `ProjectView`'s own `ChapterList` that opens a chapter — `onEditChapter={id => navigate(\`/chapter/${id}\`)}` (`ProjectDetailPage.tsx:488`) — navigates to `/chapter/:chapterId`, which is `ChapterRedirectRoute` (`App.tsx:89-121,319-326`): it **immediately redirects** to `/book/:projectId/chapter/:chapterId` (the new Director's Console), never rendering `ProjectView` with a chapter open. Even the in-page "edit chapter" action bounces the user to the new surface, not into the legacy tab pair.
- Net: static analysis suggests `editingChapterId` can never be truthy while `ProjectView` is mounted via its registered route — which would make the `EditorTabs`/Script-Source-Text tab pair dead in practice even though the route hosting it is live. **This is a hypothesis, not a conclusion.** It rests on there being no other write site for `editingChapterId`/`shellState`, no stale-closure or first-mount race, and no deep-link/query-param path this research missed. Per R-D, treat it as a strong starting hypothesis for the live check, not as sufficient on its own.
- The per-span inline `<select>` dropdown in `ScriptView.tsx:170-179` (`onChange={... onAssignToCharacter ...}`, inside every span's `.span-controls` micro-toolbar) is **shared code**: both the legacy `ChapterEditor` (via `ScriptView.tsx`) and the new `CastTool` (`CastTool/index.tsx:327-370`, which reuses the same `ScriptView.tsx`) render it. Its removal is a separate, later decision from deleting the legacy route branch.

## Target shape

1. Legacy route branch's reachability confirmed live (one way or the other) — not just via code read.
2. If unreachable: `EditorTabs.tsx`, `ChapterEditorPage.tsx` deleted; the `editingChapterId` branch (and whatever supporting code becomes dead alongside it) removed from `ProjectDetailPage.tsx`; `ProjectView` on `/project/:projectId/details` renders only the non-editor (chapters-list) view it already falls through to today.
3. `ScriptView.tsx`'s per-span dropdown removed *only* after confirming `CastTool` doesn't rely on it as an assignment mechanism (it should not — `CastTool`'s primary interaction is click/drag-to-assign via the palette/brush, per the already-shipped base paint-assignment UI referenced in INV-5).
4. If reachability is confirmed live instead: nothing is deleted in this task; the plan owner gets a written report of the exact entry point found.

## Steps

1. **Live reachability check — do this first; do not proceed past it until it's conclusive.** Run the app and, starting from a clean load of `/` (library), click through every path that could plausibly reach `/project/:projectId/details` with a chapter open:
   - Open a project from the library via its "view details" affordance (wired to `handleOpenProjectDetails`) and confirm what actually renders — expect the chapters-list view, not the legacy editor, per the code read above.
   - From that page, click a chapter row / its edit action and confirm it lands on `/book/:projectId/chapter/:chapterId` (new Director's Console), not back on `/project/:projectId/details` with tabs visible.
   - Try direct URL entry of `/project/<real-id>/details` in the address bar (a user could bookmark or type this) and confirm nothing resurrects `editingChapterId`.
   - Grep once more, informed by whatever the live app reveals, for any `navigate('/project/` or `<Link to="/project/` pattern this research might have missed anywhere in `frontend/src` — click through any hit found.
   - Check for a `?chapter=<id>`-style query param or other deep-link mechanism read by `ProjectView`/`ProjectDetailPage.tsx` (none found in this research's code read — confirm the absence live, don't just trust the earlier grep).
2. **If confirmed unreachable:** delete `frontend/src/pages/ChapterEditor/components/EditorTabs.tsx` and `frontend/src/pages/ChapterEditor/ChapterEditorPage.tsx`; remove the `editingChapterId`-gated branch in `ProjectDetailPage.tsx` along with whatever becomes dead alongside it (`activeChapter`, `activeIdx`, `matchingChapterJobs`, the now-unused `ChapterEditor` import, etc.). Confirm the non-editor chapters-list view on `/project/:projectId/details` still renders correctly afterward — live, not just by reading the diff (INV-5, no capability regression).
3. **Then, and only then**, determine whether `CastTool` depends on `ScriptView.tsx`'s per-span dropdown (`ScriptView.tsx:170-179`) for any of its own assignment paths — read `CastTool/index.tsx`'s `ScriptView` usage and its `onAssignToCharacter` wiring; check for an edge case (e.g. keyboard-only assignment, or an assignment type the brush/palette doesn't cover) the dropdown might be the only route for. If confirmed redundant for `CastTool`, remove the dropdown from `ScriptView.tsx`. If `CastTool` still depends on it for some case, leave it in place and report that dependency — it needs its own replacement first, not silent removal alongside this task.
4. **If reachability is confirmed live** (some entry point does reach the legacy tab pair): stop, delete nothing, and report the exact entry point (file, line, click sequence) to the plan owner. This contradicts `01-map.md`'s Part M / Connections assumption and needs an explicit decision — fix the entry point vs. keep the legacy surface — not a silent skip of this task.
5. If deletions happen, run the full frontend test suite and a manual smoke pass of the Director's Console (Cast/Booth/Revise/Write) to confirm no regression from touching the shared `ScriptView.tsx`.

## Acceptance criteria

- [ ] A live click-through (not just a code read) produced a definitive answer to the reachability question, and that evidence (what was clicked, what rendered) is recorded in the PR/commit description.
- [ ] If unreachable: `EditorTabs.tsx` and `ChapterEditorPage.tsx` are deleted; `ProjectDetailPage.tsx`'s `editingChapterId` branch and its now-dead supporting code are removed; `npm -C frontend run build` is clean.
- [ ] If unreachable: `/project/:projectId/details` still renders its non-editor (chapters list) view correctly after the deletion — verified live (INV-5).
- [ ] The per-span dropdown in `ScriptView.tsx` is removed only after confirming `CastTool` doesn't need it as its own assignment mechanism; if removed, `CastTool`'s assignment flows (brush/palette click-to-assign, Match Voice, etc. — whatever of tasks 002/003 has landed by then) are live-verified to still work.
- [ ] If reachability is confirmed live instead: no code is deleted; a written report (entry point, file/line, click sequence) is delivered to the plan owner in place of a code change.
- [ ] `npm -C frontend run lint` and `npm -C frontend run test -- --run` both clean.
- [ ] A changelog-queue entry is appended to `.agent/code-map/queue/` reflecting whatever actually happened (deletion, or "confirmed live, nothing deleted").

## Map links

Part M in `01-map.md`. Risk R-D ("Legacy retirement's reachability is genuinely uncertain"). Workload 8 / M8 in `02-roadmap.md`.

## Dependencies

Soft dependency on 002 (word-level brush-size selector) settling its selection UX before the `ScriptView.tsx` dropdown is removed, per `02-roadmap.md`'s note on task 019 ("soft dependency on 002 — word-brush needs the dropdown's replacement UX settled first"). No hard dependency otherwise — the reachability check and the `EditorTabs`/`ChapterEditorPage`/`ProjectDetailPage` deletion can proceed independently of 002; only the dropdown removal should wait on it.

## Out of scope

- Whether `shellState.navigation.activeChapterId` itself (the underlying navigation field — `frontend/src/app/navigation/model.ts:27`, computed in `StudioShell.tsx`) should be removed from the shell-state model. That's a separate concern from removing the frontend components that consume it in this one dead branch. If this task confirms the field has no other live consumer, flag it as a follow-up rather than removing it here.
- Restructuring or renaming the `/chapter/:chapterId` redirect-only route or the `/project/:projectId/details` route itself — this task only removes the legacy editor branch and (conditionally) the dropdown, not the surrounding routing architecture.
- Any of the other Cast/Booth/Revise catalog items (tasks 002-018) — this task only touches legacy retirement.
