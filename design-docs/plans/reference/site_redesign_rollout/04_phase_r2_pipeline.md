# Phase R2 — Book Pipeline Routes

*Read `00_execution_contract.md` first. Reference mock: `frontend/src/demo/stages/siteMockup/panes/book.tsx`
(ManuscriptPane, CastingPane), `panes/publish.tsx` (PublishPane), and `siteMockupStage.tsx` (BookPane
assembler + TopBar book identity line). Depends on R1 shell (NavRail + TopBar in
`frontend/src/app/layout/`, created by `03_phase_r1_shell.md`).*

## Phase goal

`/book/:id/{manuscript,casting,studio,review,publish}` becomes the book experience. `/project/:id`
(+ `?tab=` params) and `/chapter/:id` redirect into it. At phase end the old ProjectDetail page is
retired (redirect-only); ALL its capabilities live in the new stages. The Studio and Review stages
mount the EXISTING editor/placeholder for now — their redesigns are R3/R4.

## Key existing internals (re-home, don't rewrite)

- `frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx` — project/chapters/characters/audiobooks
  fetch (`loadData`), `useProjectActions` handlers, assembly-mode selection state, voice resolution
  (`buildVoiceOptions`, `getDefaultVoiceProfileName`, `resolveVoiceEngineStatus`), runtime/predicted math.
- `frontend/src/pages/ProjectDetail/components/`: `ChapterList` (drag-reorder via dragListener,
  `InlineEdit` rename, `StatusOrb`-triggered `ActionMenu`, inline `<audio>` row player — the audio
  stays until R4), `AssemblyPanel`, `AssemblyProgress`, `ProjectHeader`, `ProjectModals`
  (`AddChapterModal`, `EditProjectModal`, `CoverImageModal`).
- `frontend/src/components/CharactersTab.tsx` (roster + `ColorSwatchPicker` + `VoiceProfileSelect`),
  `frontend/src/components/ProjectBackupsPanel.tsx`.
- `frontend/src/pages/ChapterEditor/` — `EditTab`, `ResyncPreviewModal`, and the resync flow in
  `ChapterEditorPage.tsx` (`handleRequestResyncPreview` → `api.previewSourceTextResync` →
  `ResyncPreviewModal` → `handleConfirmResync`).
- Routing: `frontend/src/app/App.tsx` (Routes block, lines ~254-360), `ProjectViewRoute.tsx` shell wiring.

## Chapter lifecycle pill — the binding mapping

The mock shows Draft/Ready/Cast/Rendered. There is NO lifecycle field on `Chapter`; derive it:

| Pill | Rule (first match wins, top-down) |
|---|---|
| **Rendered** | `chap.audio_status === 'done'` OR (`chap.has_wav \|\| chap.has_mp3 \|\| chap.has_m4a`) |
| **Cast** | chapter has ≥1 segment with a non-null `character_id` (use `chap.total_segments_count > 0` + project `characters` referenced by chapter assignments; if per-chapter assignment counts aren't in the list payload, treat `done_segments_count > 0 \|\| audio_status === 'processing'` as Cast) |
| **Ready** | `chap.char_count > 0` (text present, analyzed segments exist: `total_segments_count > 0`) |
| **Draft** | everything else (empty or unanalyzed text) |

Implement once in `frontend/src/pages/Book/lib/chapterLifecycle.ts` with a unit test; every pill
renders from this function. If the data needed for Cast is genuinely not in the chapter list payload,
log it in `99_progress_log.md` and ship the 3-state version (Draft/Ready/Rendered) — do NOT add a
backend field (R-F).

---

### R2-T1 — Book route skeleton + stage tab navigation
- **Goal**: `/book/:bookId/:stage` routes render a `BookLayout` with stage tabs (Manuscript / Casting /
  Studio / Review / Publish) that ARE routes; `/book/:bookId` redirects to `studio` or the last-visited
  stage (localStorage `studio.book.<id>.lastStage`).
- **Read first**: `frontend/src/app/App.tsx`, `frontend/src/pages/ProjectDetail/ProjectViewRoute.tsx`,
  mock `siteMockupStage.tsx` BookPane (tabs row), `00_execution_contract.md` styling rules.
- **Create/Modify**:
  - Create `frontend/src/pages/Book/BookLayout.tsx` (stage tabs from `useParams`, `NavLink`-style tabs,
    `<Outlet/>` or children-by-stage), `frontend/src/pages/Book/index.ts`,
    `frontend/src/pages/Book/lib/stages.ts` (`BOOK_STAGES = ['manuscript','casting','studio','review','publish'] as const`, label map, `getLastStage`/`setLastStage` localStorage helpers).
  - Modify `frontend/src/app/App.tsx`: add `<Route path="/book/:bookId" ...>` + `<Route path="/book/:bookId/:stage" ...>`; invalid stage → redirect to `/book/:bookId`.
- **Steps**:
  1. Add `stages.ts` with types + localStorage helpers (guard `window` for tests).
  2. Build `BookLayout` rendering the tab row (token classes in `theme/components.css`, pattern of
     existing `ProjectSubnav`) and a stage-content slot; for this task every stage renders a
     placeholder `<div data-testid="stage-<name>">`.
  3. Wire routes in `App.tsx` inside the existing `ProjectViewRoute` wrapper so shell state
     (connection, hydration) keeps working; `/book/:id` index route reads `getLastStage(id)` and
     `<Navigate replace>`s to it (default `studio`).
  4. On stage tab click, navigate + `setLastStage`.
- **Capabilities re-homed**: none yet (skeleton).
- **Tests**: new `frontend/tests/unit/pages/Book/BookLayout.test.tsx` — renders 5 tabs, active tab
  follows route param, `/book/x` redirects to studio, last-stage persistence (mock localStorage).
- **Verify**: `npm -C frontend run test -- --run && npm -C frontend run lint && npm -C frontend run build`
- **Out of scope**: stage content, redirects from old routes, rail/topbar context.

### R2-T2 — Book data provider (shared hydration for all stages)
- **Goal**: One `useBookData(bookId)` hook + `BookDataContext` so every stage shares the project /
  chapters / characters / audiobooks fetch and the action handlers — chapter list data comes from
  this existing hydration, NOT new endpoints.
- **Read first**: `ProjectDetailPage.tsx` lines 64-260 (`loadData`, `useProjectActions` wiring,
  voice resolution, runtime/predicted math), `frontend/src/hooks/useProjectActions.ts`.
- **Create/Modify**: Create `frontend/src/pages/Book/useBookData.ts` + `BookDataContext.tsx`.
  Modify `BookLayout.tsx` to wrap stages in the provider.
- **Steps**:
  1. Extract the fetch block (`api.fetchProject/fetchChapters/fetchCharacters/fetchProjectAudiobooks`)
     and refresh-on-`refreshTrigger` behavior from `ProjectDetailPage` into `useBookData` —
     copy the logic, leave `ProjectDetailPage` untouched (it dies at R2-T12).
  2. Expose: `{ project, chapters, characters, audiobooks, loading, reload, actions }` where
     `actions = useProjectActions(bookId, reload, navigate, onOpenQueue)`.
  3. Include the derived values stages need: `effectiveProjectVoice`, `projectVoiceStatus`,
     `mergedVoices`, `totalRuntime`, `totalPredicted` (move the math verbatim; reuse
     `buildVoiceOptions`/`resolveVoiceEngineStatus`).
  4. Plumb `jobs`, `segmentProgress`, `speakerProfiles`, `speakers`, `engines`, `settings`,
     `refreshTrigger`, `segmentUpdate`, `chapterUpdate` from `App.tsx` into `BookLayout` props
     (same props `ProjectView` receives today).
- **Capabilities re-homed**: project hydration, project default voice resolution.
- **Tests**: `useBookData.test.tsx` — mocks `@/api`, asserts parallel fetch, reload on trigger,
  voice fallback chain (project → settings default → engine default).
- **Verify**: standard frontend trio.
- **Out of scope**: any UI.

### R2-T3 — TopBar book identity line
- **Goal**: When the route matches `/book/:id/*`, the R1 TopBar shows: cover chip · title · author ·
  series · runtime · predicted-runtime chip. Clicking the identity line navigates to
  `/book/:id/publish`. Title is plain text here (editing lives in Publish — owner decision 3/4).
- **Read first**: R1 TopBar component (`frontend/src/app/layout/` — name per R1 phase file), mock
  `siteMockupStage.tsx` TopBar (lines 234-300), `ProjectHeader.tsx` (cover img path + metadata fields:
  `project.name`, `author`, `series`, `cover_image_path`), `useBookData` from R2-T2.
- **Create/Modify**: Create `frontend/src/app/layout/BookIdentityLine.tsx`; modify the R1 TopBar to
  mount it when `useMatch('/book/:bookId/*')` hits; small context or store so `useBookData`'s
  project/runtime values reach the TopBar (export a lightweight `bookIdentityStore` set by
  `BookLayout` on data load, cleared on unmount).
- **Steps**:
  1. Add the store (simple module-level subscribe/set, or reuse the R1 shell-state pattern).
  2. `BookLayout` publishes `{ id, title, author, series, coverUrl, runtimeSeconds, predictedSeconds }`.
  3. `BookIdentityLine` renders chips (reuse `formatLength`-style helper — move it to
     `frontend/src/utils/format.ts` if not already shared), `onClick={() => navigate(\`/book/${id}/publish\`)}`,
     `title="Edit book info in Publish"`.
  4. Tokens only; verify dark theme.
- **Capabilities re-homed**: ProjectHeader's runtime/predicted display + cover thumbnail (header strip
  itself is retired — owner decision 3 says no book header strip on stage pages).
- **Tests**: render test — identity line appears on `/book/x/manuscript`, absent on `/voices`,
  click navigates to publish (use `MemoryRouter`).
- **Verify**: standard trio.
- **Out of scope**: editable title (Publish, R2-T9), rail block.

### R2-T4 — Rail contextual book block (stage links + chapter list)
- **Goal**: Inside `/book/:id/*` the R1 NavRail shows the contextual block: cover+title → 5 stage
  links (synced to route) → full chapter list (visible when Studio is the active stage) with
  `StatusOrb`, a slim render-progress bar, and a `⋯` `ActionMenu` per chapter.
- **Read first**: R1 NavRail, mock `siteMockup/rail.tsx`, `ChapterList.tsx` (StatusOrb/ActionMenu
  usage lines 161-320 — copy the orb props: `chap`, `activeJob`, `queuePending`, `doneSegments`,
  `totalSegments`), owner decision 2 + 10 (StatusOrb never replaced with plain dots).
- **Create/Modify**: Create `frontend/src/app/layout/RailBookBlock.tsx`; modify NavRail to render it
  when in a book; extend the `bookIdentityStore` (R2-T3) with `chapters` + per-chapter active job info,
  or read `BookDataContext` via the same store (rail is outside the route tree).
- **Steps**:
  1. Stage links: `NavLink`s to `/book/:id/<stage>`, active state from route.
  2. Chapter rows (when active stage === studio): number, truncated title, `StatusOrb`, slim
     `PredictiveProgressBar` (height ~3px) when the chapter has an active render job; click →
     `/book/:id/studio?chapter=<chapterId>` (the Studio stage consumes this param — R2-T6 placeholder,
     real in R3).
  3. `⋯` ActionMenu items: Queue, Reset audio, Delete — call the SAME `useBookData().actions`
     handlers (confirmations included) by routing callbacks through the store.
  4. Collapsed-rail behavior: block hidden when rail is icon-only (matches R1 hover-overlay rules).
- **Capabilities re-homed**: chapter quick-nav (old breadcrumb chapter dropdown in
  `ProjectBreadcrumbs.tsx`).
- **Tests**: RailBookBlock render test — stage link active sync, chapter rows show StatusOrb
  (assert component, not a dot), menu actions invoke callbacks.
- **Verify**: standard trio + eyeball light/dark if dev server available.
- **Out of scope**: Studio stage content; rail drawer responsiveness (R6).

### R2-T5 — Manuscript stage: chapter table
- **Goal**: Manuscript stage left column = chapter table (`#`, Title, Words, Stage pill) with
  drag-reorder, inline rename, StatusOrb menu, row selection driving the preview panel (R2-T7);
  "+ New chapter" button; compact import row.
- **Read first**: mock `panes/book.tsx` ManuscriptPane (table + import row), `ChapterList.tsx`
  (drag-reorder with framer `Reorder`/dragListener, `InlineEdit`, ActionMenu wiring),
  `chapterLifecycle.ts` mapping above.
- **Create/Modify**: Create `frontend/src/pages/Book/stages/ManuscriptStage.tsx`,
  `frontend/src/pages/Book/components/ChapterTable.tsx`,
  `frontend/src/pages/Book/lib/chapterLifecycle.ts`. Modify `BookLayout` to mount ManuscriptStage.
- **Steps**:
  1. Implement + unit-test `deriveChapterLifecycle(chap)` per the mapping table (top of this file).
  2. `ChapterTable`: rebuild the table per mock layout but reuse ChapterList's mechanics — copy the
     drag-reorder block (calls `actions.handleReorderChapters`), `InlineEdit` for title (calls
     `api.updateChapter` + `reload`), `StatusOrb`+`ActionMenu` (Queue / Reset audio / Delete /
     Export sample — same handlers/confirm flows as `ProjectDetailPage` lines 505-517).
  3. Row click selects chapter (state in ManuscriptStage; default = first chapter).
  4. Sort A-Z button (re-home from ProjectDetail action bar: `handleReorderChapters` with
     localeCompare numeric sort).
  5. Word column: `chap.word_count` (fallback `—`).
- **Capabilities re-homed**: chapter reorder, rename, sort, queue/reset/delete/export-sample menu.
- **Tests**: ChapterTable test (rows render, lifecycle pills per mapping, rename commits, menu fires
  handlers); `chapterLifecycle.test.ts` covering each pill rule.
- **Verify**: standard trio.
- **Out of scope**: preview/editor panel (T7), add-chapter modal (T6).

### R2-T6 — Manuscript stage: add chapter + import
- **Goal**: "+ New chapter" opens the Add Chapter modal (title, paste textarea, file upload row
  `.txt/.docx/.epub`); compact import row under the table does file-only import. Reuse the existing
  modal logic.
- **Read first**: `ProjectModals.tsx` `AddChapterModal` (props: `isOpen/onClose/onSubmit(title, text, file)/submitting`), mock `panes/book.tsx` AddChapterModal, `useProjectActions.handleCreateChapter`.
- **Create/Modify**: Modify `ManuscriptStage.tsx`; reuse `AddChapterModal` as-is (move it to
  `frontend/src/pages/Book/components/AddChapterModal.tsx` with updated imports if ProjectDetail is
  its only other consumer — update its tests' import paths, don't delete).
- **Steps**:
  1. Wire button → modal → `actions.handleCreateChapter(title, text, file, chapters.length)` → close + reload.
  2. Import row: hidden `<input type="file">`, on choose calls the same handler with filename-derived title.
  3. Keep `submitting` disable states.
- **Capabilities re-homed**: Add Chapter (button + modal) from ProjectDetail action bar.
- **Tests**: update/extend AddChapterModal test for new path; ManuscriptStage test asserting submit
  path calls handler.
- **Verify**: standard trio.
- **Out of scope**: EPUB multi-chapter splitting (only what the existing API call already does).

### R2-T7 — Manuscript stage: read-only preview + Draft editing + Edit-unlock gate
- **Goal**: Right panel shows selected chapter text. Draft/Ready chapters: directly editable textarea
  with autosave chip. Cast/Rendered chapters: read-only + "Edit text" button → best-effort-assignment
  warning banner → unlock → edits go through the EXISTING resync flow (`previewSourceTextResync` +
  `ResyncPreviewModal`) on commit.
- **Read first**: mock `panes/book.tsx` EditorPanel (warning copy, amber strip, footer), 
  `ChapterEditorPage.tsx` lines 480-501 (`handleRequestResyncPreview`/`handleConfirmResync`),
  `ResyncPreviewModal.tsx`, `EditTab.tsx` (textarea + autosave pattern), `useChapterEditor` save path
  (`hooks/useChapterEditor.ts` `handleSave`).
- **Create/Modify**: Create `frontend/src/pages/Book/components/ChapterTextPanel.tsx` and
  `frontend/src/pages/Book/lib/useChapterText.ts` (fetch `api.fetchChapter(chapterId)` text, local
  draft state, debounced autosave for Draft/Ready via `api.updateChapter`, commit-with-resync for
  produced chapters via `api.previewSourceTextResync` + save). Modify `ManuscriptStage.tsx`.
- **Steps**:
  1. `isProduced = lifecycle === 'Cast' || lifecycle === 'Rendered'` (from `chapterLifecycle.ts`).
  2. Draft/Ready: textarea, 1.5s debounce autosave (mirror ChapterEditorPage's debounce), green
     "editing — autosaved ✓" chip.
  3. Produced: read-only paragraphs; "Edit text" → warning banner with mock copy ("Editing
     re-analyzes this chapter. Voice assignments are matched best-effort — some may be lost."),
     Edit anyway / Cancel; unlocked state shows amber strip.
  4. Unlocked edits do NOT autosave; a "Commit changes" button calls
     `api.previewSourceTextResync(chapterId, text)` and opens `ResyncPreviewModal`
     (import from ChapterEditor — shared component, do not fork); confirm saves via
     `api.updateChapter`-equivalent path used by `handleConfirmResync` and reloads.
  5. Word-count footer from live text.
- **Capabilities re-homed**: source-text editing + resync preview (also remains in ChapterEditor
  until R3 — both entry points allowed).
- **Tests**: ChapterTextPanel test — draft editable, produced locked, unlock flow shows banner,
  commit calls preview API and renders modal (mock `@/api`; fake timers for debounce — no sleeps, R4
  of testing standards).
- **Verify**: standard trio.
- **Out of scope**: focus mode (T8), ScriptView mounting.

### R2-T8 — Manuscript stage: Focus mode
- **Goal**: Focus toggle in the preview/editor header switches to a distraction-free centered column
  (max-width ~640px), hides the chapter table, and signals the rail to collapse (owner decision 4 +
  mock "rail auto-collapses in focus mode").
- **Read first**: mock `panes/book.tsx` focus-mode branch; R1 rail collapse API (manual chevron state).
- **Create/Modify**: Modify `ManuscriptStage.tsx`, `ChapterTextPanel.tsx`; small addition to the R1
  rail store (an `autoCollapse` request flag that doesn't clobber the user's manual preference —
  restore prior state on exit).
- **Steps**:
  1. `focusMode` state in ManuscriptStage; header pill toggle ("Focus ✎" / "Exit focus").
  2. Focus render: only the editor panel, centered; same editability rules as T7.
  3. Enter: save current rail collapsed state, set collapsed; Exit: restore.
- **Capabilities re-homed**: none (new presentation).
- **Tests**: toggle test — table hidden in focus, rail store flag set/restored.
- **Verify**: standard trio.
- **Out of scope**: keyboard shortcuts.

### R2-T9 — Casting stage: re-home CharactersTab with pinned Narrator row
- **Goal**: Casting stage = character roster table (color swatch, name, line count, voice select)
  with a PINNED first row "Narrator (default)" that IS the project default voice select re-presented
  (owner decision 5: "fallback for any unassigned line").
- **Read first**: `frontend/src/components/CharactersTab.tsx` (add-character form with
  `ColorSwatchPicker` + `VoiceProfileSelect`, per-character color/voice update handlers),
  `ProjectDetailPage.tsx` `handleProjectVoiceChange` (lines 203-216), mock `panes/book.tsx` CastingPane.
- **Create/Modify**: Create `frontend/src/pages/Book/stages/CastingStage.tsx`. Modify
  `CharactersTab.tsx` only as needed to accept an optional `pinnedNarratorSlot`/layout props — prefer
  composing: CastingStage renders the pinned row itself above `CharactersTab`'s roster. Update
  CharactersTab tests' expectations if its DOM shifts.
- **Steps**:
  1. Mount `CharactersTab` (props: `projectId`, `speakers`, `speakerProfiles`, `engines`) inside
     CastingStage from `useBookData`.
  2. Pinned row: 🎙 "Narrator (default)" + `VoiceProfileSelect` bound to
     `useBookData().effectiveProjectVoice`, onChange = the re-homed `handleProjectVoiceChange`
     (optimistic update + `api.updateProject({ speaker_profile_name })` + rollback on error — move
     this handler into `useBookData.actions`). Chip: "fallback for any unassigned line".
  3. Surface the project-voice-engine-unavailable warning (re-home the banner from
     `ProjectDetailPage` lines 353-373) above the table.
  4. Line counts: per-character counts if present on `Character`; else `—` (do not add backend).
- **Capabilities re-homed**: Characters tab (roster, add/edit character, colors, per-character voice),
  project default Speaker select (old ProjectDetail action bar), engine-unavailable warning.
- **Tests**: CastingStage test — pinned row renders first, changing its select calls
  `api.updateProject`, roster renders below; move/extend existing CharactersTab tests (imports
  updated, not deleted — R-D).
- **Verify**: standard trio.
- **Out of scope**: AI cast suggestions (mock right panel "Suggest cast" = planned chip, do not build),
  voice preview playback (R4 playerBus).

### R2-T10 — Publish stage: book info editor + export actions
- **Goal**: Publish stage right column "Book info" card = `EditProjectModal`'s fields rendered INLINE
  (title, author, narrator, series — whatever fields the modal edits today), cover thumbnail +
  "Change cover" (reuse `CoverImageModal`), read-only chips (runtime, predicted, created). Export
  row with the existing download actions.
- **Read first**: `ProjectModals.tsx` `EditProjectModal` (exact field set + `onSubmit` payload),
  `CoverImageModal`, mock `panes/publish.tsx` book-info card, `useProjectActions.handleUpdateProject`,
  `AssemblyPanel.tsx` (download/export affordances for audiobooks).
- **Create/Modify**: Create `frontend/src/pages/Book/stages/PublishStage.tsx`,
  `frontend/src/pages/Book/components/BookInfoCard.tsx`.
- **Steps**:
  1. BookInfoCard: each metadata row uses `InlineEdit` (existing primitive) → on commit call
     `actions.handleUpdateProject({ [field]: value })` → reload. Field list mirrors
     EditProjectModal exactly — open that file and enumerate; do not invent fields.
  2. Cover row: thumbnail (same URL logic as `ProjectHeader`), "Change cover" opens `CoverImageModal`.
  3. Info chips: runtime (`totalRuntime`), predicted (`totalPredicted`, hidden when null), created date.
  4. Export section: download links for assembled audiobooks come from `AssemblyPanel` data
     (per-audiobook download already exists there — T11 mounts the panel; this task only adds the
     section header + chapter-audio bulk hint if trivially available, else defer to AssemblyPanel).
- **Capabilities re-homed**: Edit Project metadata (modal → inline), cover view/change.
  `EditProjectModal` itself is retired at T12 — keep it working until then.
- **Tests**: BookInfoCard test — fields render from project, InlineEdit commit calls update handler.
- **Verify**: standard trio.
- **Out of scope**: EPUB3/loudness/lexicon (planned chips only), assembly (T11).

### R2-T11 — Publish stage: assemblies + backups re-home
- **Goal**: Publish stage hosts `AssemblyPanel` (existing audiobook list + delete + metadata edit +
  start-assembly), the assembly-mode chapter SELECTION (checkbox list, only Rendered enabled,
  select-all, Confirm Assembly (N)) — re-homed from ProjectDetail's `isAssemblyMode` — plus the
  `AssemblyProgress` strip and `ProjectBackupsPanel`.
- **Read first**: `ProjectDetailPage.tsx` assembly-mode state (lines 78-79, 416-447, 505-509),
  `AssemblyPanel.tsx` (props incl. `onStartAssembly`), `AssemblyProgress.tsx` (active/finished
  assembly job props via `pickLatestJob(j => j.engine === 'audiobook' ...)`),
  `ProjectBackupsPanel.tsx` (props: save/delete/update-metadata handlers + `submitting`),
  mock `panes/publish.tsx` selection mode.
- **Create/Modify**: Modify `PublishStage.tsx`; create
  `frontend/src/pages/Book/components/AssemblyChapterPicker.tsx`.
- **Steps**:
  1. Mount `AssemblyProgress` at top of the stage (move the `pickLatestJob` audiobook-job selection
     into `useBookData` or compute in PublishStage from `jobs`).
  2. Mount `AssemblyPanel` with existing handlers (`handleDeleteAudiobook`,
     `handleUpdateAudiobookMetadata`, format helpers — move `formatLength/formatFileSize/
     formatRelativeTime` to `frontend/src/utils/format.ts`, update old imports).
  3. `onStartAssembly` now switches PublishStage into selection mode IN PLACE (no navigation):
     `AssemblyChapterPicker` lists chapters from `useBookData`, checkboxes enabled only when
     `deriveChapterLifecycle(c) === 'Rendered'` (equivalently `audio_status === 'done'`), preselect
     all rendered, select-all toggle, Cancel / `Confirm Assembly (N)` →
     `actions.handleAssembleProject(ids)`.
  4. Mount `ProjectBackupsPanel` below (existing component unchanged; description input + Save is
     already inside it — verify, else pass through the existing `onSaveBackup`).
- **Capabilities re-homed**: Assemblies tab, assembly mode (was a ChapterList overlay), assembly
  progress strip, Backups tab.
- **Tests**: AssemblyChapterPicker test (only rendered selectable, confirm passes selected ids);
  PublishStage smoke test mounting all three panels with mocked data.
- **Verify**: standard trio.
- **Out of scope**: changing assembly API behavior; queue drawer.

### R2-T12 — Redirects + Studio/Review placeholders + retire ProjectDetail
- **Goal**: `/project/:id` → `/book/:id/manuscript` (`?tab=characters`→casting, `?tab=assemblies`→publish,
  `?tab=backups`→publish); `/chapter/:id` → `/book/:projectId/studio?chapter=:id`. Studio stage mounts
  the EXISTING `ChapterEditor` (interim, until R3) reading `?chapter=` (default first chapter); Review
  stage renders a "coming in R4" placeholder. `ProjectDetailPage` route is removed; the old page and
  now-orphaned components are deleted ONLY if nothing else imports them (run the import check), else
  left unrouted with a `@deprecated` header comment for R6 cleanup.
- **Read first**: `App.tsx` routes, `ChapterEditorPage.tsx` props (chapterId, projectId,
  speakerProfiles, speakers, engines, job, chapterJobs, selectedVoice, onNext/onPrev,
  segmentUpdate/chapterUpdate), R-G in the contract.
- **Create/Modify**: Modify `App.tsx` (redirect elements; `/chapter/:id` needs the chapter→project
  resolution already present at lines 119-153 — keep that effect, redirect once `project_id` is
  known, spinner meanwhile). Create `frontend/src/pages/Book/stages/StudioStage.tsx` (interim
  wrapper) and `ReviewStage.tsx` (placeholder). Delete/deroute `ProjectDetailPage.tsx`,
  `ProjectViewRoute` usage for old paths, `ProjectSubnav`, `ProjectBreadcrumbs`, `ProjectHeader`,
  `EditProjectModal` (verify BookInfoCard replaced every field first).
- **Steps**:
  1. StudioStage interim: derive job/chapterJobs the same way `ProjectDetailPage` did (move the
     job-filtering block, lines 286-305, into `frontend/src/pages/Book/lib/chapterJobs.ts` with a
     unit test) and mount `ChapterEditor`; onPrev/onNext update `?chapter=`.
  2. Add redirect routes; keep them as `<Navigate replace>` components that preserve unknown params.
  3. Move/repoint every test that imported `ProjectDetailPage` or its components to the new homes
     (R-D: update imports, do not delete coverage). Grep: `grep -rn "ProjectDetail" frontend/`.
  4. Confirm capability sweep vs `02_capability_inventory.md` project-page section; log gaps.
- **Capabilities re-homed**: chapter editing entry (`/chapter/:id` deep links), all tab deep links.
- **Tests**: redirect tests (old URL → new URL incl. tab params); StudioStage interim smoke test;
  `chapterJobs.test.ts`.
- **Verify**: standard trio; then manually click through every old bookmark shape if dev server runs.
- **Out of scope**: Studio redesign (R3), Review content (R4), inline `<audio>` removal (R4).

---

## Acceptance checklist (phase boundary — walk manually)

- [x] `/book/<id>` redirects to last-visited stage (studio on first visit); all 5 stage tabs are URLs.
- [x] `/project/<id>`, `/project/<id>?tab=characters|assemblies|backups`, `/chapter/<id>` all redirect correctly.
- [x] TopBar shows cover · title · author · series · runtime · predicted inside a book; clicking goes to Publish; absent outside books.
- [x] Rail shows stage links (synced) + chapter list with StatusOrb + render bar + ⋯ menu when Studio active.
- [x] Manuscript: reorder, rename, sort, add (modal + import row), StatusOrb menu actions, lifecycle pills match the mapping.
- [x] Manuscript preview: Draft edits autosave; Rendered chapter requires Edit-unlock warning; commit shows ResyncPreviewModal; Focus mode collapses rail and restores it.
- [ ] Casting: pinned Narrator row changes the project default voice (API/devtools verification still pending); roster add/edit/color/voice all work.
- [ ] Publish: inline book info edits persist; cover change works; assembly selection → confirm → progress strip; backups save/delete work, restore is still not implemented; audiobook downloads work.
- [ ] No old ProjectDetail route renders; suite green is already verified; light + dark themes still need a full pass on every new surface.
- [x] `99_progress_log.md` has one line per task.
