# Phase R3 — Studio Stage

*Read `00_execution_contract.md` first. Depends on R2 (Book routes, `useBookData`, rail chapter list,
interim `StudioStage.tsx` wrapping the old `ChapterEditor`). Reference mocks:
`frontend/src/demo/stages/siteMockup/panes/directorsConsole.tsx` (layout truth — three-panel, three views, Director's Console right column, attribution encoding) and `frontend/src/demo/stages/siteMockup/panes/studio.tsx` (analysis strip, render controls). See [ADR-0014](../../../../decisions/ADR-0014-directors-console-layout.md) and [ADR-0015](../../../../decisions/ADR-0015-attribution-color-is-identity.md).*

## Phase goal

The Studio stage becomes the **Director's Console** — the validated North-Star chapter editor:
**three views** (Book primary, Screenplay/Hollywood, Stage/BBC), **three-panel layout** (left nav rail · chapter text · right-hand Director's Console), **analysis strip** in the stage header, **commit/resync** reachable here, chapter nav + export in the stage header, and the render-controls strip at the bottom. This is a RE-HOME of `ChapterEditorPage.tsx` (944 lines) — the page's hooks and orchestration logic survive nearly verbatim; only the chrome moves. Chapter switching uses the R2 rail chapter list (`?chapter=` param) — do NOT rebuild an in-page chapter rail.

The right-hand **Director's Console** (~220px) hosts mode-selector icons at the top and the active mode's contextual panel below (Cast is the primary mode; additional modes are future work). The manuscript reads in the **center** column — never walled between two tool columns. Attribution encoding follows §9.6 of design-system.md: color = character identity only; variation = text label; voice collision = ⚠ flag.

## Key existing internals (binding — reuse, don't rewrite)

- `frontend/src/pages/ChapterEditor/ChapterEditorPage.tsx` — ALL the render-state plumbing:
  `useChapterEditor`, `useSegmentHandoffQueue` + deferred-tick gates (lines 79-258 — timing-sensitive,
  move as a unit), `chapterRender*SegmentIds` memos, `useChapterPlayback`, `useChapterStatus`,
  `handleCopyDebugState`, export handlers, resync handlers.
- `ScriptView.tsx` ALREADY has both modes (`viewMode: 'book' | 'script'` state at line 248, default
  `'book'` already) plus `safeText`-equivalent and `showNumbers` toggles and the paint flow
  (`activeCharacterId` → span click → `onAssign`/`onAssignRange`). Per-span hover controls (voice
  select, play, generate/rebuild) already exist inside spans — keep untouched.
- `ChapterHeader.tsx`: `ChapterTopBar` (title InlineEdit, Save&prev/next, WAV/MP3 export, inline
  `<audio>` players at lines 405/415 — those stay until R4), `ChapterScriptToolbar`
  (Queue/Rebuild/Stop-all, `PredictiveProgressBar`, status pill, debug copy), `useChapterStatus`.
- `CharacterSidebar.tsx`: character list with selection (`selectedCharacterId`/`selectedProfileName`),
  variant sub-selects (expand), color editing, chapter default-voice `VoiceProfileSelect`, per-character counts.
- `EditTab.tsx`: stats strip (chars/words/sentences/segments/predicted) + analysis badges.

---

### R3-T1 — Extract ChapterEditor orchestration into a reusable hook module
- **Goal**: Pure refactor: lift the non-presentational logic of `ChapterEditorPage.tsx` into
  `frontend/src/pages/Book/studio/useStudioChapter.ts` so StudioStage can compose new chrome around
  it. Old `ChapterEditor` keeps working (it consumes the same hook) — green at every step.
- **Read first**: `ChapterEditorPage.tsx` in full; `.agent/rules/frontend-state.md`;
  `Memory` note `progress-debug-workflow.md` warning about handoff timing.
- **Create/Modify**: Create `frontend/src/pages/Book/studio/useStudioChapter.ts`; modify
  `ChapterEditorPage.tsx` to consume it.
- **Steps**:
  1. Move, as ONE unit, the handoff/deferred-tick block (lines 79-258), the
     `chapterRender*` memos, playback wiring, status, export, resync, queue and debug-copy handlers
     into the hook; return a single object grouped as `{ data, renderState, playback, status,
     actions, handoff }`.
  2. Keep `useDeferredWhileHeld` ordering and effect dependencies byte-identical — this code is
     timing-bug-prone (see comments in file). No behavior change.
  3. `ChapterEditorPage` becomes chrome + the hook.
  4. Run the full existing ChapterEditor test suite — zero test edits expected besides imports.
- **Capabilities re-homed**: none (refactor).
- **Tests**: existing suite must pass unchanged; add one hook smoke test (renderHook with mocked api).
- **Verify**: `npm -C frontend run test -- --run && npm -C frontend run lint && npm -C frontend run build`
- **Out of scope**: any visual change.

### R3-T2 — StudioStage shell: three-panel layout with three view modes
- **Goal**: Replace the interim StudioStage with the real Director's Console layout: **three-panel** (rail auto-provided by shell · chapter text center · Director's Console right ~220px), **three view-mode pills** (Book / Screenplay / Stage, Book default), safe-text + `#` toggles preserved, ScriptView filling the center column.
- **Read first**: `directorsConsole.tsx` mock (layout truth — three-panel flex, view mode switcher, right console aside); `ScriptView.tsx` (props at the `<ScriptView` callsite in ChapterEditorPage lines 830-866; internal `viewMode`/`showNumbers` state lines 248-260, toggle buttons lines 575-615); `panes/studio.tsx` analysis strip + pills row; [ADR-0014](../../../../decisions/ADR-0014-directors-console-layout.md).
- **Create/Modify**: Modify `frontend/src/pages/Book/stages/StudioStage.tsx` to consume
  `useStudioChapter(chapterId)`; minor `ScriptView.tsx` change ONLY if the toggle row needs to
  render in the stage header instead of inside ScriptView — prefer lifting `viewMode`/`safeText`/
  `showNumbers` to controlled-with-default props (`viewMode={...} onViewModeChange={...}` optional,
  falling back to internal state so existing tests/consumers don't break).
- **Steps**:
  1. StudioStage reads `?chapter=` (default: first chapter from `useBookData`), passes it to the hook.
  2. Layout: flex-row with three regions — center `<main>` (flex: 1, min-width: 0) for ScriptView + analysis strip, right `<aside>` (~220px, flex-shrink: 0) for the Director's Console. The left rail is provided by the shell — do NOT add a second left column inside StudioStage.
  3. Header row 1: **three** view-mode pills (Book / Screenplay / Stage, Book default) + safe-text + `#` toggles (token classes per mock). Add `'screenplay'` and `'stage'` to the `viewMode` type; ScriptView renders `renderScriptRow` / `renderPlayRow` when those modes are active (patterns from `directorsConsole.tsx` mock).
  4. Mount `ScriptView` with the exact prop set from the old callsite (generate/assign/play callbacks from `useStudioChapter.actions`); keep `ScriptViewFallback` for the no-data case.
  5. Keep the EditTab/source-edit path OUT of this stage body — source editing lives in Manuscript (R2-T7); Studio's commit flow comes in T5.
- **Capabilities re-homed**: three-mode view toggle, safe-text + numbers toggles, per-span hover controls (free — they live inside ScriptView spans).
- **Tests**: StudioStage render test — Book mode default, each pill switch changes the view mode, `?chapter` selects chapter; Screenplay pill renders centered character names (snapshot or text assertion); update any ScriptView test touched by the controlled-prop change.
- **Verify**: standard trio.
- **Out of scope**: Director's Console right column (T3), analysis strip (T4), render controls (T6).

### R3-T3 — Director's Console right column (Cast mode)
- **Goal**: Build the right-hand Director's Console (`~220px`): mode-selector icons at the top (Cast is the only implemented mode for R3; icon row is the hook for future modes), Cast mode panel below — swatch rows (color dot, name, per-character segment counts), click arms a character → ScriptView paint flow assigns on span click (`activeCharacterId`); variant sub-selects kept; chapter default-voice select in palette header; voice-collision ⚠ flag on cast rows and tier-header count badge. Attribution encoding: color = identity only (one per character, never per-voice/variation), variation = text label beneath name, collision = ⚠ flag. See [ADR-0015](../../../../decisions/ADR-0015-attribution-color-is-identity.md).
- **Read first**: `directorsConsole.tsx` mock (`castPalette()`, `CastRow`, `TierHeader`, `variationLabelFor` — these are the layout-truth components); `CharacterSidebar.tsx` (props at ChapterEditorPage lines 884-896: selection state pair, expandedCharacterId, color update, voice change + `availableVoices` + `defaultVoiceLabel`); [ADR-0015](../../../../decisions/ADR-0015-attribution-color-is-identity.md).
- **Create/Modify**: Create `frontend/src/pages/Book/studio/CastPalette.tsx` (new presentation,
  reusing CharacterSidebar's row internals — extract shared pieces into
  `frontend/src/pages/ChapterEditor/components/characterRow.tsx` if both need them; if after this
  phase CharacterSidebar has no consumer, mark `@deprecated` for R6, don't delete yet). Modify
  `StudioStage.tsx`.
- **Steps**:
  1. Palette header: "Cast" label + `VoiceProfileSelect` bound to `localVoice` /
     `handleVoiceChange` from `useStudioChapter` with `defaultVoiceLabel` ("Use Project Default (…)").
  2. Swatch rows: armed state = `selectedCharacterId`; second click disarms (null). Keep
     `selectedProfileName` semantics for profile-level paints exactly as CharacterSidebar does.
  3. Variant sub-select: reuse the expanded-row UI (`expandedCharacterId`) inside the palette.
  4. Floating "painting: <name> — click sentences to assign" chip over the prose when armed (mock).
  5. Per-character counts: reuse whatever count CharacterSidebar displays today (segments per
     character); palette footer hint text per mock.
- **Capabilities re-homed**: character selection/painting, variant selection, per-character color
  edit, chapter default voice select, character counts.
- **Tests**: CastPalette test — arm/disarm, armed id reaches ScriptView prop, voice select fires
  `handleVoiceChange`; migrate relevant CharacterSidebar tests (update imports — R-D).
- **Verify**: standard trio.
- **Out of scope**: sub-sentence assignment (planned chip only — leave layout room), add-character
  form (Casting stage owns the roster).

### R3-T4 — Analysis strip in the Studio header
- **Goal**: Re-home EditTab's stats strip (chars · words · sentences · segments · est. runtime) plus
  long-sentence badges (green "N/N auto-fixed", amber expandable "ACTION REQUIRED" with per-segment
  detail + Edit jump) into a slim strip under the view-pills row.
- **Read first**: `EditTab.tsx` (analysis fields: `char_count`, `word_count`, `sent_count`,
  `predicted_seconds`, plus whatever long-sentence structures it renders — enumerate from the file),
  `useChapterEditor`'s `analysis`/`analyzing` outputs, `hooks/useChapterAnalysis.ts`,
  mock `panes/studio.tsx` analysis strip + expanded action row.
- **Create/Modify**: Create `frontend/src/pages/Book/studio/AnalysisStrip.tsx`; modify `StudioStage.tsx`.
- **Steps**:
  1. Strip renders from `useStudioChapter.data.analysis` (fallback to `chapter.char_count`/
     `word_count` like EditTab does); show spinner state when `analyzing`.
  2. Badges: derive from the analysis payload's long-sentence info; amber badge expands an inline
     row listing unresolvable segments; its "Edit" button deep-links to
     `/book/:id/manuscript?chapter=<id>` (text editing home).
  3. If the current analysis payload has NO unresolvable/long-sentence fields, render only the
     stats + estimated runtime and log the gap in `99_progress_log.md` (do not invent backend data — R-F).
  4. Type the analysis shape while here (`analysis: any` today) in a local interface — non-breaking.
- **Capabilities re-homed**: EditTab stats strip + analysis badges (EditTab itself remains for the
  Manuscript unlock path until R6 parity decides).
- **Tests**: AnalysisStrip test with a fixture analysis object — stats render, amber expand toggles,
  Edit link href correct.
- **Verify**: standard trio.
- **Out of scope**: re-running analysis controls beyond what EditTab exposes.

### R3-T5 — Stage header: commit-changes flow + chapter nav + export menu
- **Goal**: Studio header right cluster = unsaved-edits chip + green "Commit changes" (existing
  resync preview flow), `← Save & prev` / `Save & next →` pair, `Export ▾` menu (WAV/MP3). Re-homes
  `ChapterTopBar` items (minus title edit — title editing stays in Manuscript rename / Publish).
- **Read first**: `ChapterHeader.tsx` `ChapterTopBar` (onPrev/onNext save-then-navigate pattern,
  `handleExportAudio` + `exportingFormat`), `ChapterEditorPage` resync handlers, mock header cluster.
- **Create/Modify**: Create `frontend/src/pages/Book/studio/StudioHeaderActions.tsx`; modify
  `StudioStage.tsx`. Reuse `ResyncPreviewModal` (shared since R2-T7).
- **Steps**:
  1. Prev/next: from `useBookData().chapters` order around the active `?chapter=`; call
     `await handleSave()` then update the search param (mirror ChapterTopBar's async pattern);
     disable at ends.
  2. Export menu: `ActionMenu` with WAV/MP3 → `handleExportAudio(format)` from `useStudioChapter`
     (`downloadBlob` + `formatExportFilename` already handle naming); show busy state via
     `exportingFormat`.
  3. Commit: show "N unsaved text edits" chip when `hasUnsavedChanges`; button calls
     `handleRequestResyncPreview` → `ResyncPreviewModal` → `handleConfirmResync`. (Reachable from
     BOTH Manuscript and Studio per owner direction — the hook is shared, don't fork state.)
  4. Debug-copy button: keep, gated behind the existing dev-mode flag (find the gate used today —
     grep `onCopyDebugState` / dev-mode in `ChapterScriptToolbar`; replicate the same gate).
- **Capabilities re-homed**: Save&prev/next, WAV/MP3 export, source-text commit + resync preview,
  debug state copy.
- **Tests**: StudioHeaderActions test — nav saves then changes param, export calls api with format,
  commit opens modal (mock api; contract-shaped frames not needed — no sockets here).
- **Verify**: standard trio.
- **Out of scope**: title InlineEdit (dropped here deliberately — Manuscript/Publish own naming),
  inline `<audio>` players in ChapterTopBar (die with ChapterTopBar at T7/R4).

### R3-T6 — Render controls strip (bottom of stage)
- **Goal**: Re-home `ChapterScriptToolbar` as the Studio bottom strip: Queue/Rebuild/Complete button
  (existing label logic), red ghost "Stop all", segment `PredictiveProgressBar` + status pill +
  engine chip/ETA, wired to the same handoff-aware progress plumbing.
- **Read first**: `ChapterHeader.tsx` `ChapterScriptToolbar` (full prop list at ChapterEditorPage
  lines 773-827: queueLabel/queueTitle/onQueue with rebuild+large-chapter confirms, onStopAll,
  onSegmentDisplayProgress, onProgressBarDebugSnapshot, status, handoffState), mock render strip.
- **Create/Modify**: Create `frontend/src/pages/Book/studio/RenderControlsStrip.tsx` (thin re-skin
  that RENDERS `ChapterScriptToolbar` internals — prefer moving ChapterScriptToolbar's JSX into the
  new file and leaving a re-export if other tests import it); modify `StudioStage.tsx`.
- **Steps**:
  1. Wire every prop from `useStudioChapter` exactly as the old callsite did — especially
     `onSegmentDisplayProgress={setLiveBarSegmentProgress}` (the text-fill animation depends on it)
     and `handoffState`.
  2. Keep queue confirm dialogs (Rebuild destructive confirm, >50k chars warning) — they live in
     the hook's `onQueue` action after T1.
  3. Layout per mock: buttons left, spacer, engine chip + ETA right; progress bar + status pill
     centered (keep `PredictiveProgressBar` — owner directive, never a plain bar swap).
  4. `QueueNotice` toast stays mounted in StudioStage.
- **Capabilities re-homed**: Queue/Rebuild/Complete, Stop all, live segment progress bar, status
  pill, queue notices.
- **Tests**: migrate ChapterScriptToolbar tests to the new home (imports updated); add strip render
  test asserting StatusOrb/progress elements present during a fake running job (build frames via
  `frontend/src/api/contracts/liveEvents.ts` + `publishStudioSocketMessage` if socket-driven — R3
  testing standard).
- **Verify**: standard trio.
- **Out of scope**: VCR PlaybackControls (R4 playerBus), per-segment generate buttons (already in
  ScriptView spans).

### R3-T7 — Retire the old ChapterEditor chrome
- **Goal**: StudioStage is now feature-complete; delete the old `ChapterEditor` page chrome
  (`ChapterEditorPage` JSX shell, `EditorTabs`, `ChapterTopBar`) and the interim R2 wrapper. The
  hooks, ScriptView, ResyncPreviewModal, PlaybackControls (until R4), QueueNotice all survive under
  their new consumers. `/chapter/:id` redirect (R2-T12) keeps deep links alive.
- **Read first**: `grep -rn "ChapterEditor\|ChapterTopBar\|EditorTabs" frontend/src frontend/tests`.
- **Create/Modify**: Delete `ChapterEditorPage.tsx`'s component (keep the file only if
  `useStudioChapter` still lives elsewhere — it shouldn't), `EditorTabs.tsx`, `ChapterTopBar` portion
  of `ChapterHeader.tsx` (keep `useChapterStatus` + toolbar internals where T6 moved them). Move
  surviving components under `frontend/src/pages/Book/studio/` where natural; update all imports.
- **Steps**:
  1. Repoint every test from old paths (R-D); delete only tests whose subject component was
     genuinely deleted AND whose behavior is covered by a new-home test — record each in
     `99_progress_log.md`.
  2. Note: `ChapterTopBar`'s inline `<audio controls>` elements (ChapterHeader lines ~405/415) are
     deleted with it — confirm the chapter-level play capability still exists somewhere
     (ChapterList row player moved? If the only remaining chapter-audio player was here, KEEP a
     minimal play button in StudioHeaderActions that opens the audio URL, and log that R4 converts
     it to the playerBus). Capability must not vanish (R-C).
  3. Full suite + build; grep for dead imports.
- **Capabilities re-homed**: chapter audio playback entry point (interim, per step 2).
- **Tests**: suite green; no new tests required beyond migrations.
- **Verify**: standard trio + manual: render a chapter end-to-end in the dev server, watch the
  progress bar/handoff animation for jank.
- **Out of scope**: PlaybackControls/VCR removal (R4), CharacterSidebar deletion (R6 if orphaned).

### R3-T8 — Studio polish pass vs mock + rail integration check
- **Goal**: Side-by-side pass against `panes/studio.tsx`: spacing/order of header rows (pills →
  analysis strip → prose+palette → render strip), paint-chip behavior, rendering-span highlight in
  both view modes, rail chapter list switching chapters without state leaks (handoff timers cleaned
  up on chapter switch).
- **Read first**: mock pane; `ScriptView.css`.
- **Create/Modify**: CSS class blocks in `frontend/src/theme/components.css`; small fixes in
  StudioStage children.
- **Steps**:
  1. Toggle `data-theme="dark"` and verify every new strip/palette surface (R-E).
  2. Switch chapters rapidly via the rail; assert no stale progress bar / playing audio carries over
     (effects keyed on chapterId).
  3. Verify per-span hover controls + paint + play still work in book mode after re-home.
  4. Log any pre-existing bugs found (do not fix app/ code — known-broken caveat).
- **Capabilities re-homed**: none.
- **Tests**: add a chapter-switch test on StudioStage (param change remounts hook state; fake timers).
- **Verify**: standard trio.
- **Out of scope**: responsive/a11y (R6).

---

## Acceptance checklist (phase boundary)

- [x] Studio opens in BOOK view by default; Screenplay and Stage views one click away; safe-text + `#` toggles work in all three. Three-panel layout: center text, right Director's Console (~220px), no second left column.
- [x] Painting: arm a cast swatch → click spans assigns; variant sub-select works; disarm works; floating paint chip shows.
- [x] Chapter default-voice select in palette header changes the chapter voice (persisted).
- [x] Analysis strip shows stats + est. runtime; badges expand; Edit jump lands in Manuscript.
- [x] Commit changes → ResyncPreviewModal → confirm re-analyzes, from BOTH Manuscript and Studio.
- [x] Save&prev/next saves then navigates via `?chapter=`; Export WAV and MP3 both download.
- [x] Queue/Rebuild/Stop-all work; PredictiveProgressBar + status pill animate through a full render with the handoff hold intact (no progress-bar regression — compare against a pre-phase recording if in doubt).
- [x] Rail chapter list is the only chapter switcher; no in-page chapter rail exists.
- [x] Debug copy button present only in dev mode. Suite green; dark/light verified.
