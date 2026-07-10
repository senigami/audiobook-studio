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
  book-level tabs. **Corrected in adversarial review:** after task 009's correction (a pure content
  relocation between `BackupsStage.tsx`/`PublishStage.tsx`, not a tab add/remove), it likely doesn't
  touch `stages.ts` or `BookLayout.tsx`'s tab-content switch at all — both tabs continue to exist,
  only their inner content changes. Task 010 similarly only changes `ContentsStage.tsx`'s internals,
  not the tab list. Net: 009 and 010 touch adjacent but fully distinct files (`BackupsStage.tsx`/
  `PublishStage.tsx` vs. `ContentsStage.tsx`) with no shared-file edit expected in either — lower
  coordination risk than previously stated here.

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

**Caught in adversarial review — this note previously only covered CSS reintroduction, which
understates the risk.** The exact line numbers and JSX anchors these tasks were written against
(e.g. task 002's `WelcomePage.tsx:102-123`, `:162-170`) were captured mid-conversion by the styling
lane. By execution time the styling lane may have finished and **restructured the JSX itself** —
not just swapped `style={{}}` for `className` — e.g. decomposed a block into a sub-component,
reordered props, changed what's a single element vs. several. **Before applying any line-number- or
JSX-shape-based instruction in tasks 002/003/004: re-read the current, actual state of the target
file fresh — do not trust this plan's line numbers or described JSX structure as still accurate.**
Treat every anchor in those tasks as "this is what it looked like at research time," not "this is
guaranteed current" — the task's *goal* (what should end up true) is durable; the exact *path* to
get there (which lines, which JSX shape) may not be.

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

- **R1** — Tasks 009 and 010's decisions are recorded (see `00-overview.md`); task 010's Step 2b
  still has an internal precondition check (Write-mode capability parity) that gates its removal
  step regardless.
- **R2** — Tasks 005/006 (Library status + Continue section) carry real risk of scope explosion if
  the underlying data isn't cheaply derivable; each task's first step is a research spike with an
  explicit stop condition (see INV-4) that now also requires a `TASKS.md` line item if it stops,
  not just a note in this folder — an escalation recorded only here can rot the same way the
  original doc drift did.
- **R3** — The "bookmarks discoverability" question (see Source-of-truth resolution above) cannot
  be settled by reading code — task 011 requires an actual browser screenshot comparison. Don't
  skip it by assuming the code-level finding ("bookmarks exist") fully closes the owner's
  complaint; it only shows the feature exists, not that it's visible enough.
- **R4** — Concurrent styling lane file overlap (see Coupling risk above) — includes JSX
  restructuring risk, not just CSS reintroduction; re-verify current file state before applying any
  line-number-based instruction in tasks 002/003/004.
- **R5 (adversarial-review finding, CRITICAL)** — Task 009's relocation of `ProjectBackupsPanel`
  must explicitly verify `projectId` scoping resolves identically in its new location before/after
  the move. This repo has already shipped exactly this bug class once (a prior fix this session:
  silent cross-project data leak via an implicitly-scoped component). Treat as a blocking check, not
  an assumption — see task 009 Step 2b.3.
- **R6 (adversarial-review finding, CRITICAL)** — Task 010's "cross-book" bookmark panel language was
  corrected to "cross-chapter" (book-wide, not multi-book) after review — a literal multi-book
  panel embedded in a single-book tab would be structurally wrong and could leak bookmark data
  across projects. The owner's sign-off was given on the ambiguous wording; task 010's Step 3 now
  requires re-confirming actual scope against the demo before any implementation.
