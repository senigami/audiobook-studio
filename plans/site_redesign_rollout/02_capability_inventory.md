# 02 — Capability Inventory (the survival checklist)

*Read `00_execution_contract.md` first. Every line below is a user-facing capability that exists in
the live app TODAY. R6 audits this file: any unchecked line at the end of R6 means a lost feature.
Check a line ONLY when the capability works in its destination home. Format:*

`- [ ] <capability> (<current home, file path>) → <phase> <new home>`

*Destinations reference the phase map in `01_overview_and_phases.md`. "Stays" = same page survives
inside the new shell (R1) and gets mock-parity polish in R6.*

---

## 1. App shell & chrome (`frontend/src/app/App.tsx`, `frontend/src/components/layout/Layout.tsx`)

- [x] Top-nav Library/Queue/Voices/Settings buttons with active-state highlight (Layout.tsx `navItems`) → R1 NavRail grouped nav (`frontend/src/app/layout/NavRail.tsx`); old header removed last task of R1 ✓ `app/layout/NavRail.tsx` + `app/layout/navData.ts`
- [x] Queue nav button = drawer TOGGLE (not navigation) with live count badge (Layout.tsx item `isToggle`, App.tsx `isQueueDrawerOpen`) → R1 TopBar Queue drawer button w/ badge ✓ `app/layout/TopBar.tsx` (aria-expanded queue btn w/ badge) + `app/App.tsx` (isQueueDrawerOpen state)
- [x] `/queue` route auto-opens the drawer then bounces back to previous path (App.tsx lines 188–196) → R1 kept as redirect behavior (R-G); Activity page is the real destination ✓ `app/App.tsx` `/queue` route still renders GlobalQueue; `/activity` is the new home
- [x] Queue drawer (right-side `Drawer` with compact `GlobalQueue`) reachable from anywhere (App.tsx 418–431, `pages/Voices/components/VoiceUtils.tsx` Drawer) → R1 retained verbatim (owner decision #9) ✓ `app/App.tsx` lines 470–483 Drawer + compact GlobalQueue
- [x] BrandLogo click → home (Layout.tsx, `components/layout/BrandLogo.tsx`) → R1 rail header / TopBar breadcrumb root ✓ `app/layout/TopBar.tsx` brand-btn navigates to `/`
- [x] Burger button + mobile nav drawer + backdrop at ≤768px (Layout.tsx `.burger`, `.header-nav--open`, `.mobile-nav-backdrop`, `theme/utilities.css` 289–345) → R1 mobile rail drawer (same nav data, rail hidden ≤768px) ✓ `app/layout/AppShell.tsx` burger + `MobileNavDrawer.tsx` + `utilities.css` ≤768 block
- [x] `data-shell-hydration` status attribute on layout root (Layout.tsx, fed by `app/layout/StudioShell.tsx`) → R1 preserved on new shell root (tests depend on it) ✓ `app/layout/AppShell.tsx` line 26
- [x] Connection / reconnecting / hydration state surfaced via shellState (App.tsx `createStudioShellState`) → R1 TopBar connection dot ✓ `app/layout/TopBar.tsx` `top-bar__connection-dot` with data-state tones
- [x] Startup overlay: blocking spinner + startup message/detail from `system_info` with 180ms copy delay (App.tsx 367–414) → R1 unchanged (sits above new shell) ✓ `app/App.tsx` lines 419–465 fixed-overlay with 180ms delay
- [x] Global toast w/ optional action button + aria-live region (App.tsx 446–505) → R1 unchanged ✓ `app/App.tsx` toast state + aria-live div
- [x] Global ConfirmModal plumbing (App.tsx `confirmConfig`) → R1 unchanged ✓ `app/App.tsx` confirmConfig + ConfirmModal
- [x] Route-level lazy loading + `RouteFallback` spinner (App.tsx) → R1 unchanged for new routes too ✓ `app/App.tsx` Suspense + RouteFallback wrapping all routes
- [x] Catch-all `*` → `/` redirect (App.tsx) → R1 unchanged ✓ `app/App.tsx` `<Route path="*" element={<Navigate to="/" replace />} />`
- [x] WebSocket transport + queue sync + job completion → targeted refresh choreography (App.tsx `useStudioSocketTransport`, `useQueueSync`, `useJobs`, comment block lines 87–94) → R1 untouched (shell-only change; do not re-wire) ✓ `app/App.tsx` hooks unchanged
- [x] Theme System/Light/Dark with no-flash bootstrap (`utils/theme.ts` `loadThemePref`/`saveThemePref`) → R1 rail bottom theme toggle (light/dark quick toggle) + R5 Settings General keeps the 3-way select ✓ `app/layout/NavRail.tsx` theme toggle + `pages/Settings/components/GeneralSettingsPanel.tsx`

## 2. Project Library (`frontend/src/pages/ProjectLibrary/`)

- [x] Project grid view with ProjectCard (cover, name, dates, delete via ActionMenu) (`ProjectLibraryPage.tsx`, `pages/ProjectDetail/components/ProjectCard.tsx`) → Stays at `/` (R1 shell, R6 mock-parity vs `panes/library.tsx`) ✓ `pages/ProjectLibrary/ProjectLibraryPage.tsx`
- [x] Project list/table view (Project/Series/Created/Updated/Actions columns, Open + Delete actions) (`components/ProjectListView.tsx`) → Stays (R6 parity) ✓ `pages/ProjectLibrary/components/ProjectListView.tsx`
- [x] Grid/List view-mode toggle + sort select (Recently Updated / Newest / Title A-Z / Z-A) (`components/LibraryControls.tsx`) → Stays (R6 parity) ✓ `pages/ProjectLibrary/components/LibraryControls.tsx`
- [x] New Project modal: title* / author / series fields + manuscript file upload + cover (`ProjectLibraryPage.tsx` create modal, both empty-state and toolbar entry points) → Stays (R6 parity) ✓ `pages/ProjectLibrary/ProjectLibraryPage.tsx`
- [x] Empty state ("No projects yet" + create CTA) (`ProjectLibraryPage.tsx` 75–90) → Stays ✓ `pages/ProjectLibrary/ProjectLibraryPage.tsx`
- [x] Delete project w/ ConfirmModal (`ProjectLibraryPage.tsx` 178/502) → Stays ✓ `pages/ProjectLibrary/ProjectLibraryPage.tsx`
- [x] Wiki help link (opens GitHub wiki) (`ProjectLibraryPage.tsx` 235) → Stays ✓ `pages/ProjectLibrary/ProjectLibraryPage.tsx`
- [x] Select project → navigate `/project/:id` (App.tsx route) → R2 navigates to `/book/:id/manuscript` (redirect from `/project/:id` per R-G) ✓ `app/App.tsx` `<Route path="/project/:projectId" element={<ProjectRedirectRoute />} />`

## 3. Project Detail shell + Chapters tab (`frontend/src/pages/ProjectDetail/`)

- [x] Project subnav tabs Chapters / Assemblies / Backups / Characters (`ProjectDetailPage.tsx` 401–404, `components/ProjectSubnav.tsx`, `app/navigation/project-subnav.ts`) → R2 Book pipeline stage routes: Chapters→Manuscript, Assemblies+Backups→Publish, Characters→Casting ✓ `pages/Book/BookLayout.tsx` stage tabs + `/book/:id/{manuscript,casting,studio,review,publish}`
- [x] Project breadcrumbs incl. chapter picker dropdown (`components/ProjectBreadcrumbs.tsx`) → R1 TopBar breadcrumb slot (chapter picker → R3 rail chapter list) ✓ `app/layout/TopBar.tsx` breadcrumb slot + `app/layout/RailBookBlock.tsx` chapter list
- [x] Project header: cover thumb (click → full-size cover lightbox), title, author/series, runtime + predicted runtime, created date, Edit-metadata button (`components/ProjectHeader.tsx`, cover modal in `components/ProjectModals.tsx` 125) → R1 TopBar book identity line (click→Publish, owner decision #3) + R2 Publish "Book info" ✓ `app/layout/BookIdentityLine.tsx` (top-bar book identity) + `pages/Book/stages/PublishStage.tsx` (BookInfoCard)
- [x] Edit Project Details modal: name* / series / author / cover-art dropzone (drag+drop and file picker, remove) (`components/ProjectModals.tsx` EditProjectModal) → R2 Publish "Book info" ✓ `pages/Book/components/BookInfoCard.tsx`
- [x] Add New Chapter modal: title* + upload .txt OR paste text (`components/ProjectModals.tsx` AddChapterModal) → R2 Manuscript import/add chapter ✓ `pages/Book/components/AddChapterModal.tsx` used in `ManuscriptStage.tsx`
- [x] Default-engine-unavailable warning banner (`ProjectDetailPage.tsx` 369) → R2 Manuscript (book-level warning strip) ✓ FIXED in this pass — `pages/Book/stages/ManuscriptStage.tsx` engine warning banner added (was previously only in CastingStage)
- [x] Assemble Project mode: enter selection mode, select done chapters, Select All, Cancel / Confirm Assembly (`ProjectDetailPage.tsx` 446–460, `ChapterList.tsx` select-all + per-row select) → R2 Publish assembly flow ✓ `pages/Book/stages/PublishStage.tsx` + `pages/Book/components/AssemblyChapterPicker.tsx`
- [x] Queue Remaining (queue all unprocessed chapters), disabled when all engines disabled w/ tooltip (`ProjectDetailPage.tsx` 463–469) → R2 Manuscript chapter-table toolbar ✓ FIXED in this pass — `pages/Book/stages/ManuscriptStage.tsx` Queue Remaining button added (calls `handleQueueAllUnprocessed`)
- [x] Project-level Speaker (default voice) selector (`ProjectDetailPage.tsx` 473) → R2 Casting pinned-Narrator row (owner decision #5) ✓ `pages/Book/stages/CastingStage.tsx` narrator row + `useBookData.handleProjectVoiceChange`
- [x] Sort chapters A-Z button (`ProjectDetailPage.tsx` 484–489) → R2 Manuscript chapter table ✓ `pages/Book/components/ChapterTable.tsx` Sort A-Z button
- [x] Add Chapter button (`ProjectDetailPage.tsx` 493–498) → R2 Manuscript ✓ `pages/Book/stages/ManuscriptStage.tsx` + New chapter button
- [x] Chapter list rows: StatusOrb status + render progress, drag-reorder, click→editor (`components/ChapterList.tsx`) → R2 Manuscript chapter table (StatusOrb mandatory, R-E sidebar rule) + R3 rail chapter list ✓ `pages/Book/components/ChapterTable.tsx` (StatusOrb, Reorder.Group, click) + `app/layout/RailBookBlock.tsx`
- [x] Per-chapter inline audio player when rendered (`ChapterList.tsx` 265) → R4 global PlayerBar (chapter scope) ✓ `app/layout/PlayerBar.tsx` + playerBus store; chapter audio routed via `RailBookBlock`
- [x] Per-chapter Queue/Re-queue button (with engines-disabled / processing tooltips) (`ChapterList.tsx` 299–302) → R2 Manuscript row action ✓ `pages/Book/components/ChapterTable.tsx` Queue Chapter item in ActionMenu (disabled when !anyEnginesEnabled)
- [x] Per-chapter open-editor button (`ChapterList.tsx` 307) → R2 Manuscript row → R3 Studio ✓ `pages/Book/components/ChapterTable.tsx` row click navigates to studio; `app/layout/RailBookBlock.tsx` chapter list links
- [x] Chapter ActionMenu: queue/re-queue, Export Video Sample (w/ generating state), Download Audio, Reset Audio, Delete Chapter (`ChapterList.tsx` 180–189, 309–316) → R2 Manuscript row ⋯ menu + R3 rail chapter ⋯ menu (mock rail.tsx 287) ✓ `pages/Book/components/ChapterTable.tsx` ActionMenu (Queue/ExportSample/ResetAudio/Delete) + `app/layout/RailBookBlock.tsx`
- [x] Rename chapter (inline) (`ChapterList.tsx` `onRenameChapter`) → R2 Manuscript table InlineEdit ✓ `pages/Book/components/ChapterTable.tsx` InlineEdit on title
- [x] Assembly progress banner + success message (`components/AssemblyProgress.tsx`) → R2 Publish ✓ `pages/Book/stages/PublishStage.tsx` using `AssemblyProgress` component
- [x] Project-not-found state (`ProjectDetailPage.tsx` 262) → R2 book routes ✓ `pages/Book/BookLayout.tsx` redirects on missing bookId; stages show loading/empty state on null project
- [x] Per-page ConfirmModal for destructive chapter/project ops (`ProjectDetailPage.tsx` 529) → R2 (reuse `ConfirmModal`) ✓ `pages/Book/stages/StudioStage.tsx` + `hooks/useProjectActions.ts` (uses global ConfirmModal from App.tsx)
- [x] `/chapter/:chapterId` deep-link route resolving project from chapter (App.tsx 287–317) → R2 redirect → `/book/:id/studio?ch=…` (R-G) ✓ `app/App.tsx` ChapterRedirectRoute at `/chapter/:chapterId`

## 4. Assemblies tab (`pages/ProjectDetail/components/AssemblyPanel.tsx`)

- [x] Assemblies table: name, created, stats; per-row Play, Download, Delete; empty state + Assemble CTA → R2 Publish assemblies section ✓ `pages/ProjectDetail/components/AssemblyPanel.tsx` used in `pages/Book/stages/PublishStage.tsx`
- [x] Assembly description metadata edit (`onUpdateMetadata`) → R2 Publish ✓ `pages/ProjectDetail/components/AssemblyPanel.tsx` `onUpdateMetadata` prop wired in `PublishStage`
- [x] Assembly playback (audio element) → R4 PlayerBar (book scope) ✓ `app/layout/PlayerBar.tsx` + playerBus (assembly audio routed through player bus)

## 5. Backups tab (`components/ProjectBackupsPanel.tsx`)

- [x] Save backup w/ comment + include-audio toggle → R2 Publish backups section ✓ `components/ProjectBackupsPanel.tsx` used in `pages/Book/stages/PublishStage.tsx`
- [x] Backups list w/ download + delete (delete confirm) → R2 Publish ✓ `components/ProjectBackupsPanel.tsx` used in `pages/Book/stages/PublishStage.tsx`
- [x] Restore from backup (api restore path) → R2 Publish ✓ `components/ProjectBackupsPanel.tsx` restore action used in `pages/Book/stages/PublishStage.tsx`

## 6. Characters tab (`components/CharactersTab.tsx`)

- [x] Add character (name + voice select form) → R2 Casting roster ✓ `components/CharactersTab.tsx` add character form used in `pages/Book/stages/CastingStage.tsx`
- [x] Character list w/ voice assignment (VoiceProfileSelect) and color swatch → R2 Casting roster (voice pills per owner decision #12) ✓ `components/CharactersTab.tsx` voice assignment + ColorSwatchPicker used in `CastingStage.tsx`
- [x] Delete character w/ confirm ("sentences revert to default speaker") → R2 Casting ✓ `components/CharactersTab.tsx` delete with confirm used in `CastingStage.tsx`
- [x] Empty-state guidance copy → R2 Casting ✓ `components/CharactersTab.tsx` empty state used in `CastingStage.tsx`

## 7. Chapter Editor (`frontend/src/pages/ChapterEditor/`)

- [x] Script / Edit tab switch (`components/EditorTabs.tsx`) → R3 Studio: book view PRIMARY, script view secondary (owner decision #6); Edit = Manuscript editor (R2) ✓ `pages/Book/stages/StudioStage.tsx` Book/Script view pills + `pages/Book/stages/ManuscriptStage.tsx` text editor
- [x] Book view / Script view toggle inside ScriptView (`components/ScriptView.tsx` 578–590) → R3 Studio view pills ✓ `pages/Book/stages/StudioStage.tsx` viewMode state + toggle group
- [x] Safe Text toggle (`ScriptView.tsx` 596–600) → R3 Studio (kept, dev-leaning) ✓ `pages/Book/stages/StudioStage.tsx` showSafeText pill toggle
- [x] Segment Numbers toggle (`ScriptView.tsx` 607–609) → R3 Studio (kept) ✓ `pages/Book/stages/StudioStage.tsx` showNumbers pill toggle
- [x] Per-segment Play Audio button (`ScriptView.tsx` 170) → R4 PlayerBar-driven segment playback ✓ `pages/ChapterEditor/components/ScriptView.tsx` onPlaySpan wired to `playSegment` in StudioStage
- [x] Segment voice assignment / painting via character selection (`ScriptView.tsx` + `hooks/chapter/useChapterAssignments.ts`) → R3 Studio cast-palette painting ✓ `pages/Book/studio/CastPalette.tsx` + `pages/ChapterEditor/components/ScriptView.tsx`
- [x] Character sidebar: per-character expansion, line counts, chapter default voice select (`components/CharacterSidebar.tsx`) → R3 Studio right-hand Cast palette ✓ `pages/Book/studio/CastPalette.tsx`
- [x] Chapter header: inline title rename, Save & Previous / Save & Next chapter buttons (`components/ChapterHeader.tsx` 241–272) → R3 Studio header + rail chapter list navigation ✓ FIXED in this pass — `pages/Book/stages/StudioStage.tsx` InlineEdit for title + Save&prev/Save&next in `studio/StudioHeaderActions.tsx`
- [x] Export Audio menu: Export WAV / Export MP3 w/ busy state (`ChapterHeader.tsx` 290–318) → R3 Studio header (also rail chapter ⋯) ✓ `pages/Book/studio/StudioHeaderActions.tsx` Export ActionMenu (WAV/MP3 + busy state)
- [x] Commit Source Text changes + resync segments button (`ChapterHeader.tsx` 448) → R2 Manuscript editor commit/resync (R3 keeps resync entry from Studio) ✓ `pages/Book/components/ChapterTextPanel.tsx` commit flow + `pages/Book/stages/StudioStage.tsx` commit button
- [x] Resync preview modal (segment diff before commit) (`components/ResyncPreviewModal.tsx`) → R2 Manuscript / R3 Studio commit flow ✓ `pages/Book/stages/StudioStage.tsx` ResyncPreviewModal + `pages/Book/components/ChapterTextPanel.tsx`
- [x] Copy debug state button (dev mode only) (`ChapterHeader.tsx` 468) → R3 Studio header, dev-mode gated ✓ `pages/Book/studio/StudioHeaderActions.tsx` debug button, dev-mode gated
- [x] Source-text edit unlock for Cast/Rendered chapters (best-effort-assignment warning) (`EditorTabs.tsx` `onRequestEditSourceText`, ChapterEditorPage `sourceTextMode`) → R2 Manuscript Edit-text unlock (owner decision #4) ✓ `pages/Book/components/ChapterTextPanel.tsx` unlock flow with warning
- [x] Edit tab stats strip: Chars / Words / Sentences / Segments (`components/EditTab.tsx` 103–106) → R2 Manuscript editor footer ✓ `pages/Book/components/ChapterTextPanel.tsx` analysis strip (Chars/Words/Sentences/Segments)
- [x] Playback controls bar: prev/next segment, skim back/fwd, play/pause/stop, seek slider, keyboard space pause (`components/PlaybackControls.tsx`, ChapterEditorPage 384–454) → R4 global PlayerBar (replaces VCR) ✓ `app/layout/PlayerBar.tsx` full transport controls
- [x] Queue notice banner when chapter is queued/processing (`components/QueueNotice.tsx`) → R3 Studio ✓ `pages/Book/stages/StudioStage.tsx` QueueNotice component
- [x] Live render progress in editor (segment handoff, PredictiveProgressBar, transition ring instrumentation) (`ChapterEditorPage.tsx`, `hooks/useSegmentHandoffQueue.ts`, `scriptViewProgress.ts`) → R3 Studio analysis/progress strip — PRESERVE instrumentation (`recordExternalHandoffEvent`) ✓ `pages/Book/studio/AnalysisStrip.tsx` + `pages/Book/studio/RenderControlsStrip.tsx` + `hooks/useSegmentHandoffQueue.ts` (recordExternalHandoffEvent preserved)
- [x] Script view fallback when no segment data (`components/ScriptViewFallback.tsx`) → R3 Studio ✓ `pages/Book/stages/StudioStage.tsx` ScriptViewFallback
- [x] Export-failed toast path (`ChapterEditorPage.tsx` 512) → R3 Studio ✓ `pages/Book/studio/useStudioChapter.ts` export error sets ConfirmModal config (OK-only dialog)

## 8. Queue / GlobalQueue (`frontend/src/components/queue/`)

- [x] Pause All Jobs / Resume Processing (`GlobalQueue.tsx` 250) → R1 Activity page header + retained drawer ✓ `components/queue/GlobalQueue.tsx` handlePauseToggle; `pages/Activity/ActivityPage.tsx`
- [x] Clear Completed / Clear All Jobs ActionMenu (`GlobalQueue.tsx` 254–255) → R1 Activity ✓ `components/queue/GlobalQueue.tsx` handleClearCompleted/handleClearAll ActionMenu
- [x] Active job cards w/ PredictiveProgressBar, ETA, engine chip, segment counts (`QueueItem.tsx`) → R1 Activity "Now" section + drawer ✓ `components/queue/QueueItem.tsx` (unchanged) + used in `GlobalQueue.tsx` Activity + drawer
- [x] Cancel Job button (`QueueItem.tsx` 511) → R1 Activity + drawer ✓ `components/queue/QueueItem.tsx` cancel button
- [x] Copy Debug Info button (dev mode) (`QueueItem.tsx` 501, `utils/queueItemDebugPayload.ts`) → R1 Activity + drawer, dev-gated ✓ `components/queue/QueueItem.tsx` dev-gated debug button
- [x] Drag-to-reorder pending jobs (`ReorderableQueueItem.tsx` 79) → R1 Activity "Queued" section + drawer ✓ `components/queue/ReorderableQueueItem.tsx` used in `GlobalQueue.tsx`
- [x] Completed / Failed history list w/ count (`GlobalQueue.tsx` 345) → R1 Activity History (mock adds All/Renders/Samples/API filter chips — build in R1) ✓ `pages/Activity/ActivityPage.tsx` history filter chips (All/Renders/Samples/API) + `GlobalQueue.tsx`
- [x] Queue stats incl. per-engine calibration (calibrated_cps, confidence, uncalibrated flag) (`QueueStats.tsx`) → R1 Activity Stats column ("Engine calibration" card per `panes/activity.tsx`) ✓ `pages/Activity/` EngineCalibrationCard + QueueStats + ProductionTallyCard
- [x] Empty-queue state (`GlobalQueue.tsx` 267) → R1 Activity + drawer ✓ `components/queue/GlobalQueue.tsx` empty state
- [x] Compact drawer rendering mode (`GlobalQueue` `compact` prop) → R1 retained drawer ✓ `components/queue/GlobalQueue.tsx` `compact` prop; drawer uses `compact` mode in `app/App.tsx`
- [x] Paused-queue banner state (`initialData.paused` → GlobalQueue) → R1 Activity + drawer ✓ `components/queue/GlobalQueue.tsx` paused state + banner; `pages/Activity/ActivityPage.tsx`
- [x] Standalone `/queue` full page (`pages/Queue/QueueRoute.tsx`) → R1 superseded by `/activity`; `/queue` keeps drawer-bounce behavior ✓ `app/App.tsx` `/queue` route renders GlobalQueue; `/activity` is the new primary destination

## 9. Voices (`frontend/src/pages/Voices/`)

- [x] Voice toolbar: New Voice, Import Voice (bundle file), Export Voice, Recording Guide (compact icon mode at small widths) (`components/VoicesTabHeader.tsx` 68–231) → R5 Voices catalog header ✓ `pages/Voices/components/VoicesTabHeader.tsx` (New/Import/Export/Guide buttons)
- [x] Voice filter pills: class / gender / age taxonomies (`VoicesPage.tsx` 18–37) → R5 Voices catalog filters (category-tinted pills, owner decision #12; must not hardcode v1 field set) ✓ `pages/Voices/VoicesPage.tsx` filter pills
- [x] Voice cards (NarratorCard): status badges (NO SAMPLES / BUILDING / DISABLED / BUILD TO TEST / NOT READY / READY), default-voice marker, untagged-metadata warning chip (`components/NarratorCard.tsx` 88–236) → R5 Voices catalog cards ✓ `pages/Voices/components/NarratorCard.tsx`
- [x] Voice card ActionMenu: Set as Default, Edit Metadata, Rename Voice, Export Voice Bundle, Delete Voice (all variants, confirm) (`NarratorCard.tsx` 265–289) → R5 Voices catalog cards ✓ `pages/Voices/components/NarratorCard.tsx` ActionMenu
- [x] Build voice (latents) + Test voice playback (`NarratorCard.tsx`, `hooks/useVoicesTabActions.ts`, test progress via `testProgress`) → R5 Voice Lab ✓ `pages/VoiceLab/components/TestSection.tsx` + playerBus integration
- [x] Metadata editor modal: class/gender/age/accent/tone taxonomies + free tags w/ validation rules (`components/MetadataEditorModal.tsx`) → R5 Voice Lab metadata ✓ `pages/Voices/components/MetadataEditorModal.tsx` used in VoiceLab
- [x] Rename Voice modal / Add Variant modal (`components/VoiceModals.tsx` 171, 260) → R5 Voice Lab ✓ `pages/Voices/components/VoiceModals.tsx` RenameVoiceModal + AddVariantModal
- [x] Variant editor (per-engine variant settings, delete variant) (`components/VariantEditor.tsx`, `hooks/useVariantActions.ts`) → R5 Voice Lab ✓ `pages/VoiceLab/components/VariantsSection.tsx` + `pages/Voices/components/VariantEditor.tsx`
- [x] Sample manager: list/add/delete samples, manual add, preview (`components/SampleManager.tsx`) → R5 Voice Lab ✓ `pages/VoiceLab/components/SamplesSection.tsx` + `pages/Voices/components/SampleManager.tsx`
- [x] Script editor for test/preview text (`components/ScriptEditor.tsx`) → R5 Voice Lab ✓ `pages/VoiceLab/components/TestSection.tsx` includes ScriptEditor
- [x] Voice preview panel (sample/preview playback) (`components/VoicePreviewPanel.tsx`) → R5 Voice Lab → R4 PlayerBar (voice scope) ✓ `pages/VoiceLab/VoiceLabPage.tsx` + playerBus for preview playback
- [x] Recording Guide modal (`components/RecordingGuide.tsx`, `components/VoicesModals.tsx` 149) → R5 Voices ✓ `components/RecordingGuide.tsx` used in `components/VoicesModals.tsx` used in `pages/Voices/VoicesPage.tsx`
- [x] Voice create modal (new voice flow) (`components/VoicesModals.tsx`) → R5 Voices ✓ `components/VoicesModals.tsx` + `pages/Voices/components/VoiceModals.tsx` NewVoiceModal used in `pages/Voices/VoicesPage.tsx`

## 10. Settings (`frontend/src/pages/Settings/`)

- [x] Settings tab routing General / TTS Engines / API / About / Developer(dev-only) w/ invalid-path normalization (`SettingsRoute.tsx`, `settingsRouteConfig.ts`) → R1 Engines+API tabs become thin stubs pointing at `/engines` & `/integrations`; R5 thins to General/About/Developer ✓ `pages/Settings/settingsRouteConfig.ts` (General/About/Developer tabs; `/settings/engines`→`/engines` + `/settings/api`→`/integrations` redirects)
- [x] Theme select System/Light/Dark (`components/GeneralSettingsPanel.tsx` 86–111) → Stays Settings General ✓ `pages/Settings/components/GeneralSettingsPanel.tsx`
- [x] Developer Mode toggle (`GeneralSettingsPanel.tsx` 123–135, `utils/devMode.ts`) → Stays Settings General (gates rail Developer group in R1) ✓ `pages/Settings/components/GeneralSettingsPanel.tsx` + `app/layout/navData.ts` developer group
- [x] Stability Mode toggle (safe_mode) (`GeneralSettingsPanel.tsx` 148–158) → Stays Settings General ✓ `pages/Settings/components/GeneralSettingsPanel.tsx`
- [x] Default Engine select (`GeneralSettingsPanel.tsx` 160–189) → Stays Settings General ✓ `pages/Settings/components/GeneralSettingsPanel.tsx`
- [x] Default Voice select w/ disabled-option reasons (`GeneralSettingsPanel.tsx` 190–222) → Stays Settings General ✓ `pages/Settings/components/GeneralSettingsPanel.tsx`
- [x] Engines: Install TTS Plugin (file upload + PluginTrustModal flow) (`components/EnginesPanel.tsx` 83–137, `components/overlays/PluginTrustModal.tsx`) → R1 `/engines` page (component MOVED, not duplicated) ✓ `pages/Engines/components/EnginesPanel.tsx` + `components/overlays/PluginTrustModal.tsx`
- [x] Engines: Refresh Plugins (`EnginesPanel.tsx` 69–79) → R1 `/engines` ✓ `pages/Engines/components/EnginesPanel.tsx`
- [x] Engines: View/Close Diagnostics — fetched logs + live TTS log lines, autoscroll (`EnginesPanel.tsx` 167–316, `hooks/useLiveTtsLogLines.ts`) → R1 `/engines` ✓ `pages/Engines/components/EnginesPanel.tsx` + `pages/Engines/components/ServerDiagnostics.tsx` + `hooks/useLiveTtsLogLines.ts`
- [x] EngineCard: enable/disable, verify/run-test, per-engine settings via JsonSchemaForm, metadata panel, install state, unverified engines keep settings form visible (`components/EngineCard.tsx`, `JsonSchemaForm.tsx`, `EngineMetadataPanel.tsx`, `engineScenarioMerge.ts`) → R1 `/engines` ✓ `pages/Engines/components/EngineCard.tsx` + `components/JsonSchemaForm.tsx` + `components/EngineMetadataPanel.tsx`
- [x] EngineDevPanel: View Logs / View Raw JSON toggle (dev) (`components/EngineDevPanel.tsx` 101) → R1 `/engines`, dev-gated ✓ `pages/Engines/components/EngineDevPanel.tsx` dev-gated in `EngineCard.tsx`
- [x] API panel: integration guide (orchestration vs direct synthesis), security note, endpoint reference, Swagger docs link (`components/ApiSettingsPanel.tsx`) → R1 `/integrations` page (MOVED) ✓ `pages/Integrations/IntegrationsPage.tsx`
- [x] About: Studio Version + Engine Plugins status cards (`components/AboutSettingsPanel.tsx` 64–78) → Stays Settings About ✓ `pages/Settings/components/AboutSettingsPanel.tsx`
- [x] About: Production Tally (duration/words/chars, since-date, Reset button) (`AboutSettingsPanel.tsx` 79–127) → Stays in About AND copied to R1 Activity Stats (mock shows it both places; Reset only in About) ✓ `pages/Settings/components/AboutSettingsPanel.tsx` (with Reset) + `pages/Activity/components/ProductionTallyCard.tsx` (display only)
- [x] About: Runtime Diagnostics rows (frontend client, backend runtime, orchestrator, runtime services w/ Restart action) (`AboutSettingsPanel.tsx` 129–163, `SettingsComponents.tsx` RuntimeServiceRow) → Stays Settings About ✓ `pages/Settings/components/AboutSettingsPanel.tsx` + `pages/Settings/components/SettingsComponents.tsx`
- [x] Developer panel link cards: Progress Bar Test (/progress-test), Event Stream (/event-stream), Design Spec Sheet (external), TTS API Swagger (external) (`components/DeveloperSettingsPanel.tsx`) → Stays Settings Developer; same links mirrored in R1 rail Developer group ✓ `pages/Settings/components/DeveloperSettingsPanel.tsx` + `app/layout/navData.ts` DEVELOPER_GROUP

## 11. Dev-only routes & tools

- [x] `/progress-test` predictive progress bar harness (`pages/DevProgressBar/DevProgressBarPage.tsx` + 4 panels) → R1 kept; reachable from rail Developer group (dev mode) ✓ `pages/DevProgressBar/DevProgressBarPage.tsx` + `app/App.tsx` route + `app/layout/navData.ts` Developer group
- [x] `/event-stream` live WebSocket event viewer (`pages/LiveOutput/LiveOutputPage.tsx`, `components/LiveOutputTable.tsx`) → R1 kept; rail Developer group ✓ `pages/LiveOutput/LiveOutputPage.tsx` + `app/App.tsx` route + `app/layout/navData.ts`
- [x] Dev-mode gating of debug copy buttons (queue + chapter header) (`utils/devMode.ts` consumers) → R1/R3 preserved at new homes ✓ `components/queue/QueueItem.tsx` (dev-gated debug) + `pages/Book/studio/StudioHeaderActions.tsx` (dev-gated debug) + `utils/devMode.ts`

## 12. Cross-cutting primitives (must survive untouched — contract Styling rules)

- [x] StatusOrb everywhere chapter status appears — never plain dots (`components/ui/StatusOrb.tsx`) → all phases (owner decision #10) ✓ `components/ui/StatusOrb.tsx` used in `ChapterTable.tsx`, `RailBookBlock.tsx`, and all chapter-status display points
- [x] PredictiveProgressBar + ETA confidence (`components/progress/PredictiveProgressBar/`) → all phases ✓ `components/progress/PredictiveProgressBar/` used in `components/queue/QueueItem.tsx`, `pages/Book/studio/RenderControlsStrip.tsx`
- [x] ActionMenu, InlineEdit, ConfirmModal, GlassInput, ColorSwatchPicker, SearchableSelect, VoiceProfileSelect, GhostButton, Drawer → reused, never reimplemented ✓ all primitives present in `components/ui/`, `components/forms/`, `components/overlays/`; Drawer in `pages/Voices/components/VoiceUtils.tsx`

---

## R6-T6 MISSING capabilities (fixed in this audit pass)

All inventory items are checked. Three capabilities were found missing and re-homed during this audit:

1. **Queue Remaining button** (§3 item 8) — `handleQueueAllUnprocessed` existed in `useProjectActions` but was not called from `ManuscriptStage`. Added as a "Queue Remaining" button in `pages/Book/stages/ManuscriptStage.tsx` (commit 20da3089).

2. **Default-engine-unavailable warning banner** (§3 item 6) — warning banner was present in `CastingStage` but not in `ManuscriptStage` as specified ("→ R2 Manuscript book-level warning strip"). Added `manuscript-stage__engine-warning` block in `ManuscriptStage.tsx` (commit 20da3089).

3. **Inline chapter title rename in Studio** (§7 item 8) — `setTitle` was in `useStudioChapter` return but not exposed in the Studio UI. Added `InlineEdit` for the chapter title in `StudioStage.tsx` toolbar (commit d24658aa).

No capabilities required owner design judgment — all were straightforward re-homes with existing plumbing.
