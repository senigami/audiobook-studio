# 006 — Build the Contents hub (chapter board + publish readiness)

- **Status:** done
- **Workload:** Mock: book-level nav + Contents hub
- **Severity / type:** major · ux
- **Effort:** L
- **Blocked by:** 005
- **Blocks:** 012

## Goal
Turn the `Contents` tab into the book's command center (proposal §6.3 / §6.6): a chapter board built from `CHAPTERS` + `CHAPTER_RENDER_PCT`, each row carrying the existing `StatusOrb`, plus a "Render all remaining" action, a slim persistent book header (cover · title · runtime · Edit), and a **Publish-readiness** control that stays disabled until every chapter is green and then activates ("Book ready — Publish ▸") and routes to the Publish tab.

## Why this matters
Contents is where the owner lives between chapters: pick what's next, watch progress, and decide the book is done (§6.6). Making it a status hub with a publish launcher closes the loop — **Contents → work a chapter → back to Contents → … → all green → Publish** — all launched from the one screen that shows whole-book state.

## Why reuse `StatusOrb`
`StatusOrb` already encodes status fill (error→red, done→green, rendering/queued→light) and an inner arc = rendered fraction (proposal §9 A15/A16). Building a second orb would drift. **Reuse `StatusOrb` from `shared.tsx`; do not build a new orb.**

## Context an executor needs
- Spec: `design-docs/plans/book_view_ia_proposal.md` §6.3 (IA — Contents = TOC + command center), §6.6 (status orb per chapter, "render all remaining", publish readiness lights up when all green), §11 (slim persistent book header: cover · title · runtime · Edit pencil).
- Roadmap: `design-docs/plans/book_view_redesign/01-roadmap.md` — Workload 2; `005 ──► 006`; `006 ──► 012`.
- Data: `frontend/src/demo/stages/siteMockup/shared.tsx:962` (`CHAPTER_RENDER_PCT = [100,100,80,60,30,0,0]`, indexed by `ch.n - 1`) and `:964-972` (`CHAPTERS` — `{ n, title, words, status }`).
- `StatusOrb` is re-exported from `shared.tsx` (line ~56 import in studio/book panes) and originates at `frontend/src/components/ui/StatusOrb.tsx`. Usage examples already in the mock: `siteMockupStage.tsx:235` (`status="running" progress={job.pct/100}`), `:326` (`status="queued"`), and `panes/book.tsx:633` (`LIFECYCLE_ORB[ch.lifecycle]`). The `LIFECYCLE_ORB` map + lifecycle derivation already live in `panes/book.tsx:42-...` — reuse that mapping rather than re-deriving status.
- The temporary Contents pane wired in 005 (likely `ManuscriptPane`, or a new component) lives in `frontend/src/demo/stages/siteMockup/panes/book.tsx`. Chapter rows + orbs already exist around `panes/book.tsx:625-640`.
- Routing into the workspace from a chapter row: the `onOpenChapter(n)` callback established in 005 (threaded through `BookPane` from `SiteMockup` root state).
- ⚠️ **Coordination:** this task touches `siteMockupStage.tsx` for routing (the Publish-readiness control routes to the `Publish` tab via the existing `setActiveTab`/`handleSwitchToPublish` path; chapter rows call `onOpenChapter`). The concurrent player-bar / minimap worker also edits `siteMockupStage.tsx` (player block ~790-861). **Confirm the `BookPane`/root-state regions are free before editing**, and keep clear of the player block. Most of this task's weight is in `panes/book.tsx`.

## Target shape / contract
- **Contents pane** (new component in `panes/`, or the repurposed manuscript/library pane) is the default `Contents` tab content.
- **Slim book header** at the top: a small cover thumbnail, the book title, total runtime (a static demo value is fine), and an "Edit" pencil affordance (no real editing required). Persistent above the board.
- **Chapter board:** one row per `CHAPTERS` entry, each showing the `StatusOrb` driven by that chapter's lifecycle/`CHAPTER_RENDER_PCT[ch.n-1]` (orb `progress` = pct/100; status from the existing `LIFECYCLE_ORB` mapping). Clicking a row opens that chapter's workspace via `onOpenChapter(n)`.
- **"Render all remaining"** action (a button) near the board — visually kicks every not-green chapter. In the mock it can be a no-op / toast-style affordance; it must be present and enabled when ≥1 chapter is not green.
- **Publish-readiness control:** disabled/dimmed while any chapter is not green; when all chapters are green it activates and reads "Book ready — Publish ▸" and, on click, routes to the `Publish` tab (`onSwitchToPublish` / `setActiveTab('Publish')`). Compute "all green" from the chapter statuses (`CHAPTER_RENDER_PCT` all 100 + non-error). Because the demo data is not all-100, the control will render disabled by default — that is the correct observable state; provide a demo toggle or comment noting how to flip it to all-green if convenient (optional).

## Steps
1. In `frontend/src/demo/stages/siteMockup/panes/book.tsx`: build the Contents pane (either flesh out the placeholder used in 005 or add a `ContentsPane` and export it). Reuse the existing chapter-row + `StatusOrb` + `LIFECYCLE_ORB` code already in this file (~625-640) rather than rewriting it.
2. Add the slim book header (cover thumbnail + title + runtime + Edit pencil) above the board. Use existing layout primitives (`Row`, `Col`, `Card`/`Panel`, `Avatar`) and design tokens — no raw hex.
3. Add the "Render all remaining" button; enable it when at least one chapter is not green.
4. Add the Publish-readiness control. Derive `allGreen` from chapter statuses; disabled style when `!allGreen`, active "Book ready — Publish ▸" when `allGreen`. On click (only when active) call the prop that switches to the `Publish` tab.
5. Wire chapter-row click → `onOpenChapter(n)` (from 005).
6. In `frontend/src/demo/stages/siteMockupStage.tsx` `BookPane`: route the `Contents` tab to the new/finished Contents pane; pass `onOpenChapter` and the publish-switch callback.
7. Run `npm -C frontend run build`.

## Acceptance criteria
- [ ] `npm -C frontend run build` passes.
- [ ] The `Contents` tab shows a slim book header (cover · title · runtime · Edit) above a chapter board.
- [ ] Every chapter row shows a `StatusOrb` (the existing component, not a new one) reflecting that chapter's status/percentage from `CHAPTER_RENDER_PCT`.
- [ ] A "Render all remaining" action is visible and enabled while not all chapters are green.
- [ ] The Publish-readiness control is visibly disabled/dimmed with the demo data (chapters not all green) and does not navigate when clicked; when all chapters are green it reads "Book ready — Publish ▸", is enabled, and clicking it switches to the `Publish` tab.
- [ ] Clicking a chapter row opens that chapter's workspace (the 005 placeholder or 007's workspace).

## Out of scope
- The Chapter Workspace internals (007).
- Making "Render all remaining" actually drive mock render progress.
- Real cover upload / metadata editing behind the Edit pencil.
- Bookmarks / "what's next" jump controls (012).
- Editing the player-bar / minimap block in `siteMockupStage.tsx`.
