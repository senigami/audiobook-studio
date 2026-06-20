# 005 — Restructure book-level nav to `Contents · Cast · Publish · Backups`

- **Status:** done
- **Workload:** Mock: book-level nav + Contents hub
- **Severity / type:** major · organization
- **Effort:** M
- **Blocked by:** nothing
- **Blocks:** 006, 007

## Goal
Replace the mock's five book tabs (`Manuscript · Casting · Studio · Review · Publish`) with the converged four book-level destinations: **`Contents · Cast · Publish · Backups`**. Wire the shell + routing so that Studio and Review are no longer top tabs — instead, clicking a chapter inside Contents opens a **Chapter Workspace** (a placeholder/route in this task; 007 builds the real workspace). Add a **Backups** surface (a stub is acceptable).

## Why this matters
The five tabs flatten two different scopes (book vs chapter) onto one bar, so the bar lies about what changes when you click it (proposal §1). The converged target (§6.3) is two clean levels: book-level `Contents · Cast · Publish · Backups`, and a single chapter-level Workspace you drill into from Contents. This task lays the structural skeleton every other Track A task hangs on.

## Context an executor needs
- Spec: `plans/book_view_ia_proposal.md` §6.1–§6.3 (converged target IA), §11 (Backups adopted as a book-level surface; "Manuscript" retired; "Casting"→"Cast").
- Roadmap: `plans/book_view_redesign/01-roadmap.md` — Workload 2; `005 ──► 006` and `005 ──► 007`.
- Current tab model: `frontend/src/demo/stages/siteMockup/shared.tsx:974-976` — `BookTab` type + `BOOK_TABS` + `BOOK_STAGE_LINKS` (all currently `['Manuscript','Casting','Studio','Review','Publish']`).
- Current tab routing: `frontend/src/demo/stages/siteMockupStage.tsx:866-929` — `BookPane` renders the tab row from `BOOK_TABS` and switches panes (`ManuscriptPane`/`CastingPane`/`StudioPane`/`ReviewPane`/`PublishPane`). Imports at `siteMockupStage.tsx:63-65`.
- Default tab + chapter state in root: `siteMockupStage.tsx:939-940` — `useState<BookTab>('Studio')` and `useState(4)` for `activeChapter` (already threaded into `Rail` at lines 1208-1209 and 1256-1258 — **preserve that threading**).
- `activeTrack`/`setActiveTrack` are threaded from the root through `BookPane` into `StudioPane`/`ReviewPane` (`siteMockupStage.tsx:871-872, 924-925`). **Preserve this threading** — the workspace placeholder (and 007's real workspace) still needs `activeTrack`.
- ⚠️ **Coordination:** this task edits `siteMockupStage.tsx`, which a concurrent worker is editing for the player-bar / minimap (`MockTapeControls.tsx` and parts of `siteMockupStage.tsx`). The player-bar region is roughly `siteMockupStage.tsx:790-861`; your edits are in `BookPane` (~866-929) and the root state/render (~934-1270). **Before editing `siteMockupStage.tsx`, confirm with that worker that the `BookPane` and root-state regions are free**, and avoid touching the player-bar block.

## Target shape / contract
- `BookTab` = `'Contents' | 'Cast' | 'Publish' | 'Backups'`; `BOOK_TABS` lists them in that order.
- `BookPane` shows exactly those four tabs. There is **no** `Studio` or `Review` tab.
- A new UI state distinguishes "browsing the book (one of the 4 tabs)" from "inside a chapter workspace." When a chapter is opened from Contents, the BookPane content area shows a **Chapter Workspace placeholder** (a simple panel naming the active chapter + a "↩ Contents" back button) instead of the tab content. 007 replaces the placeholder with the real workspace.
- Default landing tab is `Contents` (not `Studio`).
- "Manuscript" content (the chapter list) now belongs under Contents — 006 builds the real Contents board; in 005 the `Contents` tab may temporarily render the existing `ManuscriptPane` so the build stays green, but the tab is **named** `Contents`.
- `Backups` renders a stub pane (e.g. a `Panel` titled "Backups" with placeholder copy — "Versioned snapshots of this book").

## Steps
1. In `frontend/src/demo/stages/siteMockup/shared.tsx`: change `BookTab` to `'Contents' | 'Cast' | 'Publish' | 'Backups'`; set `BOOK_TABS = ['Contents','Cast','Publish','Backups']`. Update or remove `BOOK_STAGE_LINKS` so it no longer references removed tabs (keep it equal to `BOOK_TABS` or delete if unused — grep for `BOOK_STAGE_LINKS` first).
2. In `frontend/src/demo/stages/siteMockup/panes/book.tsx`: add a small `BackupsPane` stub component and export it (a `Panel`/`Card` with placeholder copy). Keep `ManuscriptPane`/`CastingPane` exports (CastingPane is reused under the `Cast` tab; ManuscriptPane is reused temporarily under `Contents`). `ReviewPane` is removed in 007, not here — leave it.
3. In `frontend/src/demo/stages/siteMockupStage.tsx` `BookPane` (~922-926): route the four tabs — `Contents` → `ManuscriptPane` (placeholder until 006), `Cast` → `CastingPane`, `Publish` → `PublishPane`, `Backups` → `BackupsPane`. Remove the `Studio`/`Review` tab branches.
4. Add a chapter-workspace open/close state. Add a prop to `BookPane` (e.g. `openChapter: number | null`, `onOpenChapter(n)`, `onCloseChapter()`), driven from root state in `SiteMockup`. When `openChapter != null`, render a workspace **placeholder** (active chapter title from `CHAPTERS`, "↩ Contents" button calling `onCloseChapter`) in place of the tab content. Pass `activeTrack`/`setActiveTrack` into the placeholder so 007 can use them.
5. In Contents (temporary `ManuscriptPane`), wire chapter rows so clicking a chapter calls `onOpenChapter(n)` (sets `activeChapter` + opens the workspace). If wiring into `ManuscriptPane` is intrusive, a minimal "Open chapter ▸" affordance is acceptable for this task — 006 builds the real board.
6. Update the root default tab from `'Studio'` to `'Contents'` (`siteMockupStage.tsx:939`).
7. Run `npm -C frontend run build` and fix any type errors from the removed tab values (search the whole `siteMockup/` tree for `'Studio'`, `'Review'`, `'Manuscript'`, `'Casting'` string literals used as `BookTab`).

## Acceptance criteria
- [ ] `npm -C frontend run build` passes.
- [ ] Opening a book shows exactly four book tabs in order: `Contents · Cast · Publish · Backups`. No `Studio` or `Review` tab is present.
- [ ] The book opens on `Contents` by default.
- [ ] Clicking a chapter in Contents replaces the tab content with a Chapter Workspace placeholder that names the chapter and offers "↩ Contents" to return; returning shows the Contents tab again.
- [ ] `Cast` shows the casting content; `Backups` shows a stub pane; `Publish` shows the publish content.
- [ ] The rail's chapter list still drives `activeChapter` (existing threading at `siteMockupStage.tsx:1208-1209,1256-1258` unchanged and functional).
- [ ] `activeTrack`/`setActiveTrack` are still passed down to the chapter surface (no regression to player threading).

## Out of scope
- The real Contents board (orbs, "render all remaining", book header, publish-readiness) — that is 006.
- The real Chapter Workspace (merging Studio+Review, follow-scroll) — that is 007; 005 only ships the placeholder + routing.
- Any real Backups functionality beyond a stub.
- Editing the player-bar / minimap block in `siteMockupStage.tsx`.
