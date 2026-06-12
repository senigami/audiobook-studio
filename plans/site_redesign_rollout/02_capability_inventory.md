# 02 — Capability Inventory (the survival checklist)

*Read `00_execution_contract.md` first. Every line below is a user-facing capability that exists in
the live app TODAY. R6 audits this file: any unchecked line at the end of R6 means a lost feature.
Check a line ONLY when the capability works in its destination home. Format:*

`- [ ] <capability> (<current home, file path>) → <phase> <new home>`

*Destinations reference the phase map in `01_overview_and_phases.md`. "Stays" = same page survives
inside the new shell (R1) and gets mock-parity polish in R6.*

---

## 1. App shell & chrome (`frontend/src/app/App.tsx`, `frontend/src/components/layout/Layout.tsx`)

- [ ] Top-nav Library/Queue/Voices/Settings buttons with active-state highlight (Layout.tsx `navItems`) → R1 NavRail grouped nav (`frontend/src/app/layout/NavRail.tsx`); old header removed last task of R1
- [ ] Queue nav button = drawer TOGGLE (not navigation) with live count badge (Layout.tsx item `isToggle`, App.tsx `isQueueDrawerOpen`) → R1 TopBar Queue drawer button w/ badge
- [ ] `/queue` route auto-opens the drawer then bounces back to previous path (App.tsx lines 188–196) → R1 kept as redirect behavior (R-G); Activity page is the real destination
- [ ] Queue drawer (right-side `Drawer` with compact `GlobalQueue`) reachable from anywhere (App.tsx 418–431, `pages/Voices/components/VoiceUtils.tsx` Drawer) → R1 retained verbatim (owner decision #9)
- [ ] BrandLogo click → home (Layout.tsx, `components/layout/BrandLogo.tsx`) → R1 rail header / TopBar breadcrumb root
- [ ] Burger button + mobile nav drawer + backdrop at ≤768px (Layout.tsx `.burger`, `.header-nav--open`, `.mobile-nav-backdrop`, `theme/utilities.css` 289–345) → R1 mobile rail drawer (same nav data, rail hidden ≤768px)
- [ ] `data-shell-hydration` status attribute on layout root (Layout.tsx, fed by `app/layout/StudioShell.tsx`) → R1 preserved on new shell root (tests depend on it)
- [ ] Connection / reconnecting / hydration state surfaced via shellState (App.tsx `createStudioShellState`) → R1 TopBar connection dot
- [ ] Startup overlay: blocking spinner + startup message/detail from `system_info` with 180ms copy delay (App.tsx 367–414) → R1 unchanged (sits above new shell)
- [ ] Global toast w/ optional action button + aria-live region (App.tsx 446–505) → R1 unchanged
- [ ] Global ConfirmModal plumbing (App.tsx `confirmConfig`) → R1 unchanged
- [ ] Route-level lazy loading + `RouteFallback` spinner (App.tsx) → R1 unchanged for new routes too
- [ ] Catch-all `*` → `/` redirect (App.tsx) → R1 unchanged
- [ ] WebSocket transport + queue sync + job completion → targeted refresh choreography (App.tsx `useStudioSocketTransport`, `useQueueSync`, `useJobs`, comment block lines 87–94) → R1 untouched (shell-only change; do not re-wire)
- [ ] Theme System/Light/Dark with no-flash bootstrap (`utils/theme.ts` `loadThemePref`/`saveThemePref`) → R1 rail bottom theme toggle (light/dark quick toggle) + R5 Settings General keeps the 3-way select

## 2. Project Library (`frontend/src/pages/ProjectLibrary/`)

- [ ] Project grid view with ProjectCard (cover, name, dates, delete via ActionMenu) (`ProjectLibraryPage.tsx`, `pages/ProjectDetail/components/ProjectCard.tsx`) → Stays at `/` (R1 shell, R6 mock-parity vs `panes/library.tsx`)
- [ ] Project list/table view (Project/Series/Created/Updated/Actions columns, Open + Delete actions) (`components/ProjectListView.tsx`) → Stays (R6 parity)
- [ ] Grid/List view-mode toggle + sort select (Recently Updated / Newest / Title A-Z / Z-A) (`components/LibraryControls.tsx`) → Stays (R6 parity)
- [ ] New Project modal: title* / author / series fields + manuscript file upload + cover (`ProjectLibraryPage.tsx` create modal, both empty-state and toolbar entry points) → Stays (R6 parity)
- [ ] Empty state ("No projects yet" + create CTA) (`ProjectLibraryPage.tsx` 75–90) → Stays
- [ ] Delete project w/ ConfirmModal (`ProjectLibraryPage.tsx` 178/502) → Stays
- [ ] Wiki help link (opens GitHub wiki) (`ProjectLibraryPage.tsx` 235) → Stays
- [ ] Select project → navigate `/project/:id` (App.tsx route) → R2 navigates to `/book/:id/manuscript` (redirect from `/project/:id` per R-G)

## 3. Project Detail shell + Chapters tab (`frontend/src/pages/ProjectDetail/`)

- [ ] Project subnav tabs Chapters / Assemblies / Backups / Characters (`ProjectDetailPage.tsx` 401–404, `components/ProjectSubnav.tsx`, `app/navigation/project-subnav.ts`) → R2 Book pipeline stage routes: Chapters→Manuscript, Assemblies+Backups→Publish, Characters→Casting
- [ ] Project breadcrumbs incl. chapter picker dropdown (`components/ProjectBreadcrumbs.tsx`) → R1 TopBar breadcrumb slot (chapter picker → R3 rail chapter list)
- [ ] Project header: cover thumb (click → full-size cover lightbox), title, author/series, runtime + predicted runtime, created date, Edit-metadata button (`components/ProjectHeader.tsx`, cover modal in `components/ProjectModals.tsx` 125) → R1 TopBar book identity line (click→Publish, owner decision #3) + R2 Publish "Book info"
- [ ] Edit Project Details modal: name* / series / author / cover-art dropzone (drag+drop and file picker, remove) (`components/ProjectModals.tsx` EditProjectModal) → R2 Publish "Book info"
- [ ] Add New Chapter modal: title* + upload .txt OR paste text (`components/ProjectModals.tsx` AddChapterModal) → R2 Manuscript import/add chapter
- [ ] Default-engine-unavailable warning banner (`ProjectDetailPage.tsx` 369) → R2 Manuscript (book-level warning strip)
- [ ] Assemble Project mode: enter selection mode, select done chapters, Select All, Cancel / Confirm Assembly (`ProjectDetailPage.tsx` 446–460, `ChapterList.tsx` select-all + per-row select) → R2 Publish assembly flow
- [ ] Queue Remaining (queue all unprocessed chapters), disabled when all engines disabled w/ tooltip (`ProjectDetailPage.tsx` 463–469) → R2 Manuscript chapter-table toolbar
- [ ] Project-level Speaker (default voice) selector (`ProjectDetailPage.tsx` 473) → R2 Casting pinned-Narrator row (owner decision #5)
- [ ] Sort chapters A-Z button (`ProjectDetailPage.tsx` 484–489) → R2 Manuscript chapter table
- [ ] Add Chapter button (`ProjectDetailPage.tsx` 493–498) → R2 Manuscript
- [ ] Chapter list rows: StatusOrb status + render progress, drag-reorder, click→editor (`components/ChapterList.tsx`) → R2 Manuscript chapter table (StatusOrb mandatory, R-E sidebar rule) + R3 rail chapter list
- [ ] Per-chapter inline audio player when rendered (`ChapterList.tsx` 265) → R4 global PlayerBar (chapter scope)
- [ ] Per-chapter Queue/Re-queue button (with engines-disabled / processing tooltips) (`ChapterList.tsx` 299–302) → R2 Manuscript row action
- [ ] Per-chapter open-editor button (`ChapterList.tsx` 307) → R2 Manuscript row → R3 Studio
- [ ] Chapter ActionMenu: queue/re-queue, Export Video Sample (w/ generating state), Download Audio, Reset Audio, Delete Chapter (`ChapterList.tsx` 180–189, 309–316) → R2 Manuscript row ⋯ menu + R3 rail chapter ⋯ menu (mock rail.tsx 287)
- [ ] Rename chapter (inline) (`ChapterList.tsx` `onRenameChapter`) → R2 Manuscript table InlineEdit
- [ ] Assembly progress banner + success message (`components/AssemblyProgress.tsx`) → R2 Publish
- [ ] Project-not-found state (`ProjectDetailPage.tsx` 262) → R2 book routes
- [ ] Per-page ConfirmModal for destructive chapter/project ops (`ProjectDetailPage.tsx` 529) → R2 (reuse `ConfirmModal`)
- [ ] `/chapter/:chapterId` deep-link route resolving project from chapter (App.tsx 287–317) → R2 redirect → `/book/:id/studio?ch=…` (R-G)

## 4. Assemblies tab (`pages/ProjectDetail/components/AssemblyPanel.tsx`)

- [ ] Assemblies table: name, created, stats; per-row Play, Download, Delete; empty state + Assemble CTA → R2 Publish assemblies section
- [ ] Assembly description metadata edit (`onUpdateMetadata`) → R2 Publish
- [ ] Assembly playback (audio element) → R4 PlayerBar (book scope)

## 5. Backups tab (`components/ProjectBackupsPanel.tsx`)

- [ ] Save backup w/ comment + include-audio toggle → R2 Publish backups section
- [ ] Backups list w/ download + delete (delete confirm) → R2 Publish
- [ ] Restore from backup (api restore path) → R2 Publish

## 6. Characters tab (`components/CharactersTab.tsx`)

- [ ] Add character (name + voice select form) → R2 Casting roster
- [ ] Character list w/ voice assignment (VoiceProfileSelect) and color swatch → R2 Casting roster (voice pills per owner decision #12)
- [ ] Delete character w/ confirm ("sentences revert to default speaker") → R2 Casting
- [ ] Empty-state guidance copy → R2 Casting

## 7. Chapter Editor (`frontend/src/pages/ChapterEditor/`)

- [ ] Script / Edit tab switch (`components/EditorTabs.tsx`) → R3 Studio: book view PRIMARY, script view secondary (owner decision #6); Edit = Manuscript editor (R2)
- [ ] Book view / Script view toggle inside ScriptView (`components/ScriptView.tsx` 578–590) → R3 Studio view pills
- [ ] Safe Text toggle (`ScriptView.tsx` 596–600) → R3 Studio (kept, dev-leaning)
- [ ] Segment Numbers toggle (`ScriptView.tsx` 607–609) → R3 Studio (kept)
- [ ] Per-segment Play Audio button (`ScriptView.tsx` 170) → R4 PlayerBar-driven segment playback
- [ ] Segment voice assignment / painting via character selection (`ScriptView.tsx` + `hooks/chapter/useChapterAssignments.ts`) → R3 Studio cast-palette painting
- [ ] Character sidebar: per-character expansion, line counts, chapter default voice select (`components/CharacterSidebar.tsx`) → R3 Studio right-hand Cast palette
- [ ] Chapter header: inline title rename, Save & Previous / Save & Next chapter buttons (`components/ChapterHeader.tsx` 241–272) → R3 Studio header + rail chapter list navigation
- [ ] Export Audio menu: Export WAV / Export MP3 w/ busy state (`ChapterHeader.tsx` 290–318) → R3 Studio header (also rail chapter ⋯)
- [ ] Commit Source Text changes + resync segments button (`ChapterHeader.tsx` 448) → R2 Manuscript editor commit/resync (R3 keeps resync entry from Studio)
- [ ] Resync preview modal (segment diff before commit) (`components/ResyncPreviewModal.tsx`) → R2 Manuscript / R3 Studio commit flow
- [ ] Copy debug state button (dev mode only) (`ChapterHeader.tsx` 468) → R3 Studio header, dev-mode gated
- [ ] Source-text edit unlock for Cast/Rendered chapters (best-effort-assignment warning) (`EditorTabs.tsx` `onRequestEditSourceText`, ChapterEditorPage `sourceTextMode`) → R2 Manuscript Edit-text unlock (owner decision #4)
- [ ] Edit tab stats strip: Chars / Words / Sentences / Segments (`components/EditTab.tsx` 103–106) → R2 Manuscript editor footer
- [ ] Playback controls bar: prev/next segment, skim back/fwd, play/pause/stop, seek slider, keyboard space pause (`components/PlaybackControls.tsx`, ChapterEditorPage 384–454) → R4 global PlayerBar (replaces VCR)
- [ ] Queue notice banner when chapter is queued/processing (`components/QueueNotice.tsx`) → R3 Studio
- [ ] Live render progress in editor (segment handoff, PredictiveProgressBar, transition ring instrumentation) (`ChapterEditorPage.tsx`, `hooks/useSegmentHandoffQueue.ts`, `scriptViewProgress.ts`) → R3 Studio analysis/progress strip — PRESERVE instrumentation (`recordExternalHandoffEvent`)
- [ ] Script view fallback when no segment data (`components/ScriptViewFallback.tsx`) → R3 Studio
- [ ] Export-failed toast path (`ChapterEditorPage.tsx` 512) → R3 Studio

## 8. Queue / GlobalQueue (`frontend/src/components/queue/`)

- [ ] Pause All Jobs / Resume Processing (`GlobalQueue.tsx` 250) → R1 Activity page header + retained drawer
- [ ] Clear Completed / Clear All Jobs ActionMenu (`GlobalQueue.tsx` 254–255) → R1 Activity
- [ ] Active job cards w/ PredictiveProgressBar, ETA, engine chip, segment counts (`QueueItem.tsx`) → R1 Activity "Now" section + drawer
- [ ] Cancel Job button (`QueueItem.tsx` 511) → R1 Activity + drawer
- [ ] Copy Debug Info button (dev mode) (`QueueItem.tsx` 501, `utils/queueItemDebugPayload.ts`) → R1 Activity + drawer, dev-gated
- [ ] Drag-to-reorder pending jobs (`ReorderableQueueItem.tsx` 79) → R1 Activity "Queued" section + drawer
- [ ] Completed / Failed history list w/ count (`GlobalQueue.tsx` 345) → R1 Activity History (mock adds All/Renders/Samples/API filter chips — build in R1)
- [ ] Queue stats incl. per-engine calibration (calibrated_cps, confidence, uncalibrated flag) (`QueueStats.tsx`) → R1 Activity Stats column ("Engine calibration" card per `panes/activity.tsx`)
- [ ] Empty-queue state (`GlobalQueue.tsx` 267) → R1 Activity + drawer
- [ ] Compact drawer rendering mode (`GlobalQueue` `compact` prop) → R1 retained drawer
- [ ] Paused-queue banner state (`initialData.paused` → GlobalQueue) → R1 Activity + drawer
- [ ] Standalone `/queue` full page (`pages/Queue/QueueRoute.tsx`) → R1 superseded by `/activity`; `/queue` keeps drawer-bounce behavior

## 9. Voices (`frontend/src/pages/Voices/`)

- [ ] Voice toolbar: New Voice, Import Voice (bundle file), Export Voice, Recording Guide (compact icon mode at small widths) (`components/VoicesTabHeader.tsx` 68–231) → R5 Voices catalog header
- [ ] Voice filter pills: class / gender / age taxonomies (`VoicesPage.tsx` 18–37) → R5 Voices catalog filters (category-tinted pills, owner decision #12; must not hardcode v1 field set)
- [ ] Voice cards (NarratorCard): status badges (NO SAMPLES / BUILDING / DISABLED / BUILD TO TEST / NOT READY / READY), default-voice marker, untagged-metadata warning chip (`components/NarratorCard.tsx` 88–236) → R5 Voices catalog cards
- [ ] Voice card ActionMenu: Set as Default, Edit Metadata, Rename Voice, Export Voice Bundle, Delete Voice (all variants, confirm) (`NarratorCard.tsx` 265–289) → R5 Voices catalog cards
- [ ] Build voice (latents) + Test voice playback (`NarratorCard.tsx`, `hooks/useVoicesTabActions.ts`, test progress via `testProgress`) → R5 Voice Lab
- [ ] Metadata editor modal: class/gender/age/accent/tone taxonomies + free tags w/ validation rules (`components/MetadataEditorModal.tsx`) → R5 Voice Lab metadata
- [ ] Rename Voice modal / Add Variant modal (`components/VoiceModals.tsx` 171, 260) → R5 Voice Lab
- [ ] Variant editor (per-engine variant settings, delete variant) (`components/VariantEditor.tsx`, `hooks/useVariantActions.ts`) → R5 Voice Lab
- [ ] Sample manager: list/add/delete samples, manual add, preview (`components/SampleManager.tsx`) → R5 Voice Lab
- [ ] Script editor for test/preview text (`components/ScriptEditor.tsx`) → R5 Voice Lab
- [ ] Voice preview panel (sample/preview playback) (`components/VoicePreviewPanel.tsx`) → R5 Voice Lab → R4 PlayerBar (voice scope)
- [ ] Recording Guide modal (`components/RecordingGuide.tsx`, `components/VoicesModals.tsx` 149) → R5 Voices
- [ ] Voice create modal (new voice flow) (`components/VoicesModals.tsx`) → R5 Voices

## 10. Settings (`frontend/src/pages/Settings/`)

- [ ] Settings tab routing General / TTS Engines / API / About / Developer(dev-only) w/ invalid-path normalization (`SettingsRoute.tsx`, `settingsRouteConfig.ts`) → R1 Engines+API tabs become thin stubs pointing at `/engines` & `/integrations`; R5 thins to General/About/Developer
- [ ] Theme select System/Light/Dark (`components/GeneralSettingsPanel.tsx` 86–111) → Stays Settings General
- [ ] Developer Mode toggle (`GeneralSettingsPanel.tsx` 123–135, `utils/devMode.ts`) → Stays Settings General (gates rail Developer group in R1)
- [ ] Stability Mode toggle (safe_mode) (`GeneralSettingsPanel.tsx` 148–158) → Stays Settings General
- [ ] Default Engine select (`GeneralSettingsPanel.tsx` 160–189) → Stays Settings General
- [ ] Default Voice select w/ disabled-option reasons (`GeneralSettingsPanel.tsx` 190–222) → Stays Settings General
- [ ] Engines: Install TTS Plugin (file upload + PluginTrustModal flow) (`components/EnginesPanel.tsx` 83–137, `components/overlays/PluginTrustModal.tsx`) → R1 `/engines` page (component MOVED, not duplicated)
- [ ] Engines: Refresh Plugins (`EnginesPanel.tsx` 69–79) → R1 `/engines`
- [ ] Engines: View/Close Diagnostics — fetched logs + live TTS log lines, autoscroll (`EnginesPanel.tsx` 167–316, `hooks/useLiveTtsLogLines.ts`) → R1 `/engines`
- [ ] EngineCard: enable/disable, verify/run-test, per-engine settings via JsonSchemaForm, metadata panel, install state, unverified engines keep settings form visible (`components/EngineCard.tsx`, `JsonSchemaForm.tsx`, `EngineMetadataPanel.tsx`, `engineScenarioMerge.ts`) → R1 `/engines`
- [ ] EngineDevPanel: View Logs / View Raw JSON toggle (dev) (`components/EngineDevPanel.tsx` 101) → R1 `/engines`, dev-gated
- [ ] API panel: integration guide (orchestration vs direct synthesis), security note, endpoint reference, Swagger docs link (`components/ApiSettingsPanel.tsx`) → R1 `/integrations` page (MOVED)
- [ ] About: Studio Version + Engine Plugins status cards (`components/AboutSettingsPanel.tsx` 64–78) → Stays Settings About
- [ ] About: Production Tally (duration/words/chars, since-date, Reset button) (`AboutSettingsPanel.tsx` 79–127) → Stays in About AND copied to R1 Activity Stats (mock shows it both places; Reset only in About)
- [ ] About: Runtime Diagnostics rows (frontend client, backend runtime, orchestrator, runtime services w/ Restart action) (`AboutSettingsPanel.tsx` 129–163, `SettingsComponents.tsx` RuntimeServiceRow) → Stays Settings About
- [ ] Developer panel link cards: Progress Bar Test (/progress-test), Event Stream (/event-stream), Design Spec Sheet (external), TTS API Swagger (external) (`components/DeveloperSettingsPanel.tsx`) → Stays Settings Developer; same links mirrored in R1 rail Developer group

## 11. Dev-only routes & tools

- [ ] `/progress-test` predictive progress bar harness (`pages/DevProgressBar/DevProgressBarPage.tsx` + 4 panels) → R1 kept; reachable from rail Developer group (dev mode)
- [ ] `/event-stream` live WebSocket event viewer (`pages/LiveOutput/LiveOutputPage.tsx`, `components/LiveOutputTable.tsx`) → R1 kept; rail Developer group
- [ ] Dev-mode gating of debug copy buttons (queue + chapter header) (`utils/devMode.ts` consumers) → R1/R3 preserved at new homes

## 12. Cross-cutting primitives (must survive untouched — contract Styling rules)

- [ ] StatusOrb everywhere chapter status appears — never plain dots (`components/ui/StatusOrb.tsx`) → all phases (owner decision #10)
- [ ] PredictiveProgressBar + ETA confidence (`components/progress/PredictiveProgressBar/`) → all phases
- [ ] ActionMenu, InlineEdit, ConfirmModal, GlassInput, ColorSwatchPicker, SearchableSelect, VoiceProfileSelect, GhostButton, Drawer → reused, never reimplemented
