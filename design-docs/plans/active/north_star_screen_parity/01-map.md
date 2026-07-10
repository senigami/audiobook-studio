# Implementation Map — North Star Screen Parity

## Big picture

Five screen-areas were compared against the North Star demo. Two (Home/Welcome, Library) had
never been formally verified before — genuine new research. Three (Book-level tabs, Chapter
Workspace, Engines/Voices/Activity/Settings) had a prior validation pass
(`reference/site_redesign_rollout/99_progress_log.md`, dated 2026-06-14) that this plan's research
found is partially stale — the chapter workspace was rebuilt since (Director's Console,
2026-07-10) and the Engines page grew a tab. The shape of the fix is almost entirely **re-homing
and reconciling existing pieces**, not building new UI from scratch — every gap below traces to a
component or data source that already exists somewhere in the live app.

## Source-of-truth resolution (read this before any task)

Two demo files both look like "the chapter workspace mock" and they disagree:

- **`frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx`** — the 4-mode
  (Cast/Booth/Revise/Write) design. This is what was actually ported into the live
  `DirectorsConsole/` (2026-07-10). **This is the current reference for chapter-workspace mode
  structure.**
- **`frontend/src/demo/stages/siteMockup/panes/studio.tsx`** — an older, single-merged-view mock
  (no mode tabs; edit-text and voice-assignment coexist in one view) belonging to a plan
  (`_archive/chapter_workspace_merge_superseded/`) that was superseded *before being dispatched* by
  the Director's Console work. **This file is stale for mode structure** — but it's where the
  bookmark UI, the lexicon-panel toggle, and the per-chapter-status chapter-switcher dropdown were
  originally designed (tagged "task 012"/"task 013" in its own comments), and those three features
  *did* get ported into the live app — just independently, via `ChapterWorkspaceHeader.tsx` and
  `BookLayout.tsx`, before Director's Console activation ever touched the area. Treat `studio.tsx`
  as **historically informative, not currently authoritative** for anything except those three
  already-ported features.

Net effect: **bookmarks are not a gap.** They exist live (`ChapterWorkspaceHeader.tsx:55-105,
316-328`), just at the workspace-header level rather than inside a specific mode, which is
structurally correct — `directorsConsole.tsx` (the real reference) doesn't model bookmarks as a
mode-level concern either. The owner's observation of "an edit text area with no bookmarks" is most
likely the Write mode's full-page textarea (`WriteTool`) reducing the header's visual prominence,
not a missing feature — task `011` has a designer agent verify this live in-browser rather than
resolve it from code alone.

## Parts

| Part | Live file(s) | Demo reference | Status |
|---|---|---|---|
| Welcome/splash | `pages/Welcome/WelcomePage.tsx` | `panes/splash.tsx` | Minor gap: CTA placement/type (task 002) |
| Library (home) | `pages/ProjectLibrary/ProjectLibraryPage.tsx` + `components/{LibraryControls,ProjectListView}.tsx`, `pages/ProjectDetail/components/ProjectCard.tsx` | `panes/library.tsx` | Largest gap area (tasks 003–007) |
| Book-level tabs | `pages/Book/BookLayout.tsx`, `pages/Book/lib/stages.ts`, `pages/Book/stages/*.tsx` | `panes/book.tsx` (`BookPane`/`ContentsPane`/`CastingPane`/`BackupsPane`), `panes/publish.tsx` | Structural divergence: Backups + Contents (tasks 009, 010) |
| Chapter Workspace | `pages/ChapterEditor/components/DirectorsConsole/*`, `pages/Book/components/ChapterWorkspaceHeader.tsx` | `panes/directorsConsole.tsx` (current), `panes/studio.tsx` (historical, ported features only) | Bookmarks/Lexicon/Contents-dropdown all present; one small gap (status orb, task 008) |
| Engines/Voices/Activity/Settings | `pages/Engines/`, `pages/Voices/`, `pages/VoiceLab/`, `pages/Activity/`, `pages/Settings/` | `panes/{platform,voices,voiceEditor,activity,settings}.tsx` | Clean except Engines' new Module Settings tab (demo-stale, task 012) |
| `TASKS.md` | `design-docs/plans/TASKS.md` | n/a | Phantom entry, lines 75–82 (task 001) |
| Owner validation checklist | `reference/site_redesign_rollout/99_progress_log.md:323-386` | n/a | Terminology stale post-IA-changes (task 013) |

## Connections — shared components/data every task must not break

- **`ActionMenu`** (`frontend/src/components/*/ActionMenu.tsx` — exact path TBD by executor, grep
  it) — used by `ProjectCard.tsx` today with only `onDelete` (falls back to a legacy single-item
  mode). Task 003 must pass a proper `items` array (Open + Delete) rather than inventing a new menu
  component — this is the same primitive the redesign contract (`00_execution_contract.md`)
  requires reusing.
- **`Project` type** (`frontend/src/types/index.ts:65-77`) — has no `status`, `progress`, `eta`, or
  `notes` fields. Tasks 005 and 006 must determine whether these are *derivable* from existing
  chapter/render data (queried per-project) before proposing any addition to this type — adding
  fields here is a `contract_changed: true` change touching every consumer of `Project`, and is the
  one place in this plan a task could accidentally balloon into a schema change. Flagged
  `quality-sensitive` in the roadmap.
- **`StatusOrb`** — the existing chapter-status component, already used in `ChapterTable.tsx`. Task
  008 reuses this component for the chapter-switcher dropdown; **never build a second status
  indicator** (an explicit standing owner directive recorded in `site_redesign_rollout/00_execution
  _contract.md` line 65).
- **`ChapterWorkspaceHeader.tsx`** — owns bookmarks (`useBookmarks`/`addBookmark`/`removeBookmark`
  from `store/bookmarks.ts`), the `ChapterDropdown` (task 008 touches this), and prev/next/jump
  navigation. Mounted once in `BookLayout.tsx:227-231`, above `DirectorsConsole`. Task 008 is the
  only task in this plan that touches this file.
- **`LexiconPanel`** — shared between the book-level `Lexicon` tab (`LexiconStage.tsx`) and the
  Chapter Workspace's dockable panel (`BookLayout.tsx:283-286`). Already correctly deduplicated;
  no task in this plan should introduce a second implementation.
- **`BookLayout.tsx`'s tab list** (`pages/Book/lib/stages.ts`) — the single source of the six live
  book-level tabs. Tasks 009/010 both edit structure reachable from this file; if both are executed
  in the same session, re-read `stages.ts` fresh before the second task starts (they touch adjacent
  but distinct tabs — Backups vs Contents — so no logical conflict, but both may edit
  `BookLayout.tsx`'s tab-content switch).

## Coupling risk — the concurrent styling-separation lane

A separate session is running `design-docs/plans/active/simplification/styling_separation_execution/`
(inline-style → CSS-class conversion) concurrently. It has already touched or may still touch:
`ProjectLibraryPage.tsx`, `CastPalette.tsx` (Book/studio), `VoiceModals.tsx`, `ScriptEditor.tsx`,
`SampleManager.tsx`, `VoicesTabHeader.tsx`, `WelcomePage.tsx`, `GlobalQueue.tsx`,
`OfficialRegistryPanel.tsx`, `LiveOutputPage.tsx`, `ResyncPreviewModal.tsx`. **Tasks 002 and
003–007 in this plan touch `WelcomePage.tsx` and `ProjectLibraryPage.tsx`/`ProjectCard.tsx` —
direct file overlap with that lane.** Before executing those tasks: `git pull`/check working tree
for the styling lane's latest state on those files, and layer structural changes on top of its
class-based conversion rather than reintroducing inline styles it just removed. This is a
sequencing risk, not a blocking one — the two efforts are orthogonal (structure vs. token/CSS) but
land in the same files.

## Invariants

- **INV-1 (capabilities never vanish)** — per `00_execution_contract.md` R-C. Any task that removes
  a control/section must re-home it in the same task, or the task stops and escalates.
- **INV-2 (tokens only)** — new/changed markup must use `frontend/src/theme/tokens.css` custom
  properties, never hardcoded colors/sizes, and must work in both light and dark
  (`[data-theme="dark"]`).
- **INV-3 (StatusOrb is the only status indicator)** — never introduce a second visual status
  language (plain dots, custom badges) where StatusOrb already exists as the pattern.
- **INV-4 (no silent schema changes)** — any task that would require adding a field to `Project` (or
  any other persisted type) to complete must stop and record the decision in `00-overview.md`
  "Decisions needed" rather than adding it unilaterally.
- **INV-5 (demo is layout truth, not code truth)** — never copy JSX/inline styles from
  `frontend/src/demo/` into live components; rebuild with the live app's real components, data,
  and tokens per `00_execution_contract.md`.

## Risks & open questions

- **R1** — Tasks 009 and 010 are both gated on an owner decision (see `00-overview.md`). Until
  answered, only the DECISION-recording step of those task files should execute — not the
  implementation steps.
- **R2** — Tasks 005/006 (Library status + Continue section) carry real risk of scope explosion if
  the underlying data isn't cheaply derivable; each task's first step is a research spike with an
  explicit stop condition (see INV-4).
- **R3** — The "bookmarks discoverability" question (see Source-of-truth resolution above) cannot
  be settled by reading code — task 011 requires an actual browser screenshot comparison. Don't
  skip it by assuming the code-level finding ("bookmarks exist") fully closes the owner's
  complaint; it only shows the feature exists, not that it's visible enough.
- **R4** — Concurrent styling lane file overlap (see Coupling risk above).
