# 012 — Named bookmarks, global cross-book list, and jump-to-next-unrendered

- **Status:** not-started
- **Workload:** Mock: authoring aids
- **Severity / type:** medium · ux
- **Effort:** M
- **Blocked by:** 006
- **Blocks:** nothing

## Goal
Add to the mock: **named bookmarks** the author creates and labels (tag a scene), keyed on `(book, chapter, segment)`; a **global cross-book bookmark list** where each entry reads `«Book» · «Chapter» · «label»`; and a **"jump to next unrendered section"** control in the workspace that moves to the next section whose audio isn't done.

## Why this matters
The IA proposal (§6.8) makes bookmarks and the unrendered-gap walk part of the methodical author loop: name and revisit scenes across books from one place, and walk straight to the sections still needing render. This is additive polish on the working Contents hub (task 006) and workspace.

## Context an executor needs
- Read for intent (do not duplicate): `plans/book_view_ia_proposal.md` §6.8. Note the **division of labor**: the *auto "last-edited"* bookmark (one per chapter, moves with edits) is **task 008**, NOT this task. This task is the **named/global collection** plus the unrendered-gap navigation.
- **This is a MOCK task.** In-memory demo state only; acceptance is build + observable behavior.
- Mock files:
  - `frontend/src/demo/stages/siteMockup/panes/studio.tsx` — the workspace; its header cluster (~line 964, the "unsaved chip + Commit + nav + export" row) is where a workspace control like "jump to next unrendered section" can live, and where a "🔖 bookmark this spot" affordance fits. The prose is `chunks: Chunk[]` with `data-chunk-id`; "sections"/segments map to chunk ids.
  - `frontend/src/demo/stages/siteMockup/shared.tsx` — `CHAPTERS` (chapter list with status), `CHAPTER_RENDER_PCT` (per-chapter render %, indexed by `ch.n - 1` — use this to find "not done" sections/chapters), `SemanticChip`, `Row`, `Col`, `Panel`, `Card`, `StatusOrb`. Book titles for the global list live in `shared.tsx` cover maps / `DEMO_BOOK_COVER_SRC` keys (e.g. "The Whispering Vale", "Iron Meridian").
  - Contents hub: built in task 006 (book-level `Contents · Cast · Publish` shell with per-chapter orbs). The global bookmark list is a natural Contents-adjacent surface; a per-chapter mini-list of named bookmarks can also live in the chapter switcher.
- ⚠️ **Coordination:** the panes are mounted by `frontend/src/demo/stages/siteMockup/siteMockupStage.tsx`. **Another worker is concurrently editing the mock.** Prefer adding the bookmarks store + controls inside the existing pane components (`studio.tsx`, and the Contents pane from task 006). If you must touch `siteMockupStage.tsx`, keep the edit minimal/additive and re-read it immediately before editing.

## Target shape / contract
- **Bookmark model (mock):** `{ id, book: string, chapter: number, segment: string /* chunk id */, label: string }`. Keying on `(book, chapter, segment)` (not a scroll offset) is what lets it survive text edits.
- **Create + label:** a "🔖 bookmark" affordance in the workspace that captures the current spot (a chunk id) and lets the author type a label.
- **Global cross-book list:** a panel listing all named bookmarks across books, each rendered as `«Book title» · «Chapter» · «label»` (e.g. `The Whispering Vale · Ch 4 · "warden reveal"`). Seed it with a few entries spanning at least two books so the cross-book nature is visible.
- **Jump to next unrendered section:** a workspace control that advances to the next section/chunk whose audio isn't `done` (derive "not done" from mock render state — `CHAPTER_RENDER_PCT` / a per-chunk rendered flag). Render *failures* are not a special mode — this just walks to the gaps.

## Steps
1. Read §6.8 and confirm the auto last-edited bookmark is out of scope (task 008).
2. Add a small in-memory bookmarks store (module-level array or React state) seeded with named bookmarks across at least two books, each with `book/chapter/segment/label`.
3. Add a "🔖 bookmark" affordance in the workspace header that creates a bookmark for the current spot and accepts a label (a simple inline input or prompt-style mock is fine).
4. Add a **global bookmark list** panel (on/near Contents from task 006, or a slide-over) rendering each entry as `«Book» · «Chapter» · «label»`; clicking an entry is a mock navigation (no real routing required, but should visibly indicate selection/jump).
5. Add a **"Jump to next unrendered section"** control to the workspace that selects/scrolls to the next chunk whose audio is not done, using mock render state to decide "not done".
6. Use design tokens for all styling; reuse `SemanticChip`/`StatusOrb`/`Panel`/`Card`. No raw hex.
7. Run `npm -C frontend run build` and `npm -C frontend run lint`; fix errors.

## Acceptance criteria
- `npm -C frontend run build` passes.
- The author can create a named bookmark from the workspace and give it a label; it appears in a list.
- A global bookmark list shows entries from more than one book, each formatted `«Book» · «Chapter» · «label»`.
- A "jump to next unrendered section" control exists in the workspace and moves the view/selection to a section whose audio is not done (driven by mock render state).

## Out of scope
- The auto "last-edited" bookmark that moves with edits (task 008).
- Real persistence, routing, or backend bookmark storage.
- Render-failure resume modes (explicitly not a special mode per §6.8) and real audio status.
