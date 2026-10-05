# Phase R4 — Player Bar + Review Stage

*Read `00_execution_contract.md` first. Depends on R2 (book routes, Review placeholder); full Review
needs R3 (Studio re-home). Reference mock: `siteMockupStage.tsx` PlayerBar + `panes/book.tsx`
ReviewPane. Owner decisions 7 & 8 bind this phase: annotations attach to SECTIONS (§N), never
timestamps; player bar is a full-window bottom dock, hidden when empty, with a reserved
height-expansion slot for a future waveform (CSS only — no wavesurfer dep).*

## Phase goal

ONE audio owner for the whole app: a `playerBus` store + a single `<audio>` element inside a global
`PlayerBar`. Every current player converts to a bus client: the ChapterEditor VCR
(`PlaybackControls` + `useChapterPlayback`, which today creates `new Audio()` per segment), the
inline `<audio controls>` in `ChapterList` rows (line ~265) and any surviving chapter-header player,
and voice preview/sample playback in Voices (`VariantEditor.tsx` audio elements). Then Review stage
v1: follow-along text + per-section annotations + re-render-section.

## Audio/timing facts (investigated — plans must respect these)

- Segments have individual audio files (`seg.audio_file_path`, `audio_groups[].asset_url`); playback
  sequencing is done client-side in `useChapterPlayback` via `audio.onended` → next segment.
- There is **NO per-segment timestamp/offset data into the assembled chapter WAV** (no
  `start_time`/`offset` fields in `frontend/src/types`). Follow-along therefore highlights by
  **currently-loaded segment scope** when playing segment-sequenced audio (exact, free), and cannot
  highlight sub-positions inside a single chapter-file playback. v1 plays Review audio via the
  segment queue (same as Studio playback) so highlight = current segment. Note this limitation in
  the Review UI copy and in `99_progress_log.md`; per-WAV timing is future backend work.

---

### R4-T1 — playerBus store
- **Goal**: `frontend/src/store/playerBus.ts`: single-owner audio state with a
  `useSyncExternalStore` hook. No `<audio>` here — the element lives in PlayerBar (T2).
- **Read first**: existing store patterns `frontend/src/store/studioSocketBus.ts` /
  `live-jobs.ts` (subscribe/snapshot shape), `useChapterPlayback.ts` (what consumers will need).
- **Create/Modify**: Create `frontend/src/store/playerBus.ts`.
- **Steps**:
  1. State: `{ scope: 'segment' | 'chapter' | 'preview' | null, title: string, subtitle?: string,
     audioUrl: string | null, playing: boolean, position: number, duration: number,
     queue: { hasPrev: boolean, hasNext: boolean }, requestId: number }`.
  2. API: `loadAndPlay({scope, title, audioUrl, onEnded?, onPrev?, onNext?})`, `play()`, `pause()`,
     `stop()` (clears state → bar hides), `seek(seconds)`, `reportTime(position, duration)` (called
     by the PlayerBar element), plus `subscribe`/`getSnapshot` and `usePlayerBus()` built on
     `useSyncExternalStore`.
  3. Callbacks (`onEnded`/`onPrev`/`onNext`) are stored per-load so adapters (segment sequencing)
     own queue semantics; bus only signals.
  4. Loading a new source while playing replaces it (single owner — by construction only one
     audio plays).
- **Capabilities re-homed**: none yet.
- **Tests**: `frontend/tests/unit/store/playerBus.test.ts` — load/play/pause/stop transitions,
  snapshot stability (no re-render storms: `getSnapshot` returns cached object until change),
  callback dispatch on `notifyEnded`.
- **Verify**: `npm -C frontend run test -- --run && npm -C frontend run lint && npm -C frontend run build`
- **Out of scope**: any UI, any consumer conversion.

### R4-T2 — PlayerBar component (global bottom dock)
- **Goal**: Full-window-width bottom dock rendered once in the app shell, BELOW rail + content
  (mock: `<PlayerBar />` last child of the shell column). Owns the ONE `<audio>` element. Hidden
  (zero height / unmounted content) when `audioUrl === null`. Transport (prev/play-pause/next/stop),
  scope chip, seek slider, time `m:ss / m:ss`, title. A `player-bar-expansion` empty slot div with a
  CSS height variable reserved for the future waveform — CSS only, no dep.
- **Read first**: mock `siteMockupStage.tsx` shell composition + PlayerBar (in `rail.tsx`/stage file),
  R1 shell layout component (`frontend/src/app/layout/`), `PlaybackControls.tsx` (transport visuals
  to mirror), `frontend/src/app/layout/layering.ts` (z-index tokens).
- **Create/Modify**: Create `frontend/src/app/layout/PlayerBar.tsx` + class block in
  `frontend/src/theme/components.css`. Modify the R1 shell (or `App.tsx`) to mount it once,
  full-width under the rail+content row; add bottom padding/inset to the content area when the bar
  is visible so it never covers content.
- **Steps**:
  1. `<audio ref>` wired: `loadAndPlay` effect sets `src` + `.play()`; `timeupdate` →
     `playerBus.reportTime`; `ended` → `playerBus.notifyEnded()`; `loadedmetadata` → duration.
  2. Transport buttons call bus API; prev/next enabled from `queue.hasPrev/hasNext` and dispatch
     the stored callbacks.
  3. Scope chip renders `segment | chapter | preview` (cycling/click behavior: just display in v1).
  4. Seek slider (range input) → `bus.seek` → element `.currentTime`.
  5. Hidden state: render nothing visible + remove content inset (CSS class toggle).
- **Capabilities re-homed**: none yet (no consumers).
- **Tests**: PlayerBar test — hidden when empty, appears on `loadAndPlay`, play/pause toggles,
  seek updates element (mock HTMLMediaElement methods; fake timers, no sleeps).
- **Verify**: standard trio + dark/light eyeball.
- **Out of scope**: waveform, keyboard shortcuts, consumer conversion.

### R4-T3 — Convert Studio segment playback: PlaybackControls → playerBus adapter
- **Goal**: `useChapterPlayback`'s segment-sequencing logic (readiness checks, audio-group
  resolution, wav/mp3 fallback URLs, onended → next pending-aware segment, skim) is PRESERVED but
  feeds the bus instead of creating its own `Audio` elements. The in-page `PlaybackControls` VCR is
  removed from StudioStage; the global PlayerBar is the transport. Tests updated, not deleted.
- **Read first**: `hooks/useChapterPlayback.ts` in full (per-segment `new Audio()` at line ~96,
  fallback URL pair, onended chaining, skim), `PlaybackControls.tsx`, StudioStage mounting from R3,
  existing useChapterPlayback tests in `frontend/tests/unit/hooks/`.
- **Create/Modify**: Modify `useChapterPlayback.ts`: replace element creation/ownership with
  `playerBus.loadAndPlay({scope:'segment', ...})` and drive sequencing from the bus `onEnded`
  callback; keep its public return shape (`playSegment`, `stopPlayback`, `togglePause`, `seekTo`,
  `isPlaying`, `currentTime`, `duration`, `playingSegmentId`, ...) so ScriptView span play buttons
  and the keyboard-space handler keep working. Remove `PlaybackControls` from StudioStage; keep the
  component file until T4 confirms no other consumer, then delete with test migration.
- **Steps**:
  1. Map error-fallback (wav→mp3 retry on element error) into the adapter: bus exposes an `onError`
     per-load callback for this.
  2. `playingSegmentId`/`playingSegmentIds` state stays in the hook (bus carries only scope+title).
  3. Title fed to the bus = the old `activePlaybackLabel` ("Speaker: text…", logic in
     ChapterEditorPage/useStudioChapter).
  4. Prev/next callbacks = the existing playback-block navigation (blocks from `audio_groups` —
     move `playbackBlockStartIds` logic into the hook or `useStudioChapter`).
  5. Space/Escape keyboard handling stays in StudioStage, now calling bus-backed hook fns.
  6. Update useChapterPlayback tests: same behavioral assertions, audio boundary now mocked at the
     playerBus/PlayerBar seam (R2 of testing standards: mock outside the unit).
- **Capabilities re-homed**: VCR transport (play/pause/stop/prev/next/seek/skim*), playing-segment
  highlight, space-bar play. (*If skim hold-to-scrub can't be expressed through the bus cleanly,
  keep skim as direct `seek` stepping on an interval via bus — same UX.)
- **Tests**: updated hook tests + a StudioStage integration test: clicking a span play loads the bus
  and PlayerBar appears.
- **Verify**: standard trio + manual: play through a segment boundary, confirm auto-advance.
- **Out of scope**: Review stage, chapter-scope playback.

### R4-T4 — Convert inline chapter + voice-preview players to the bus
- **Goal**: Kill the remaining ad-hoc `<audio>` elements: (a) Manuscript/rail chapter rows' inline
  `<audio controls>` (re-homed from `ChapterList.tsx` line ~265 — wherever R2-T5 put it) becomes a
  play button that calls `playerBus.loadAndPlay({scope:'chapter', audioUrl: <chapter asset url>,
  title: 'Ch N · Title'})`; (b) any interim chapter play button from R3-T7; (c) Voices page
  preview/sample playback (`pages/Voices/components/VariantEditor.tsx` audio elements + any
  preview-play in VoicesPage/VoicesModals) → `scope:'preview'` with the voice name as title.
- **Read first**: `frontend/src/pages/Book/components/ChapterTable.tsx` (R2 home of the row player),
  `VariantEditor.tsx` lines 50-160, `grep -rn "<audio\|new Audio(" frontend/src` (the conversion is
  done when only PlayerBar matches).
- **Create/Modify**: Modify ChapterTable (play button + playing indicator from
  `usePlayerBus()`), VariantEditor + Voices preview callsites.
- **Steps**:
  1. Chapter URL: reuse the exact `src` the old `<audio>` used (chapter asset endpoint).
  2. Play button shows pause state when bus is playing this URL; click toggles.
  3. VariantEditor: if it relies on element-level events for record/trim flows, convert ONLY the
     playback path; recording stays as-is (recording is capture, not playback — out of player scope).
  4. Final grep: no `new Audio(` and no `<audio` outside `PlayerBar.tsx` and recording components.
  5. Delete `PlaybackControls.tsx` if orphaned; migrate its tests' assertions to PlayerBar tests.
- **Capabilities re-homed**: chapter row playback, voice preview/sample playback.
- **Tests**: ChapterTable play test (bus receives chapter scope), Voices preview test updated.
- **Verify**: standard trio + manual: play a chapter from Manuscript, then a voice preview — second
  load replaces the first (single owner).
- **Out of scope**: scope-chip cycling behavior, waveform.

### R4-T5 — Review stage scaffold: transport row + follow-along text panel
- **Goal**: Replace the R2 Review placeholder. Layout per mock ReviewPane: transport summary row
  (uses the global PlayerBar for actual transport — the in-stage row shows chapter chip, §current/§total,
  and a Play-chapter button), main column = follow-along text, right column reserved for
  annotations (T6). Text = the chapter's sections (§N) from ScriptView's data source; the
  currently-playing SECTION is highlighted via playerBus + the playing-segment id; past sections
  dimmed; click a section plays it (segment scope).
- **Read first**: mock `panes/book.tsx` ReviewPane; `useChapterEditor`/`useChapterLoader` scriptView
  data shape (`scriptViewData.spans`, `render_batches`, `audio_groups`); R3 `useStudioChapter`;
  the timing-limitation note at the top of this file; `useRenderGroups` (`firstSpanGroupNumber` —
  the §N numbering source used by ScriptView's `#` toggle).
- **Create/Modify**: Create `frontend/src/pages/Book/stages/ReviewStage.tsx` +
  `frontend/src/pages/Book/review/FollowAlongPanel.tsx` + `frontend/src/pages/Book/review/useReviewPlayback.ts`
  (thin wrapper over the same segment-sequencing playback used in Studio — share the hook, scope
  stays `'segment'`; chapter chip in the row, not a separate audio path).
- **Steps**:
  1. Stage reads `?chapter=` like Studio (rail chapter list switches it).
  2. Section model: one row per render group/span using the SAME §N numbering as ScriptView's
     number toggle (`firstSpanGroupNumber`); store `sectionNumber → span ids`.
  3. Highlight: current = section containing `playingSegmentId`; past = sections before it; future
     dimmed-none. Auto-scroll current into view (`scrollIntoView({block:'nearest'})`).
  4. Limitation copy (small italic, per mock style): "highlight follows the playing section" —
     and because there is no per-WAV timing data, do NOT attempt intra-section progress.
  5. "Play from here": clicking a section calls `playSegment(firstSpanId, fullQueue)`.
  6. Transport summary row: chapter chip, `§cur / §total`, Play/Resume button driving the bus.
- **Capabilities re-homed**: none removed; new surface.
- **Tests**: FollowAlongPanel test — section list from a scriptViewData fixture, highlight follows a
  fake bus playing-segment, click plays.
- **Verify**: standard trio.
- **Out of scope**: annotations (T6), re-render wiring (T7), waveform, sentence-level seek inside a
  section.

### R4-T6 — Per-section annotations (localStorage v1)
- **Goal**: Right column = annotations list (§N chip + note + actions) + "Add note on §N (playing)"
  affordance. Stored in localStorage keyed by chapter+section — v1 explicitly local-only (owner
  decision 7: notes attach to sections, never timestamps, so re-renders don't shift them).
- **Read first**: mock ReviewPane annotations column; T5 section model.
- **Create/Modify**: Create `frontend/src/pages/Book/review/annotations.ts` (store:
  `localStorage['studio.review.notes.<chapterId>'] = { [sectionNumber]: Array<{id, text, createdAt}> }`,
  with subscribe hook) and `AnnotationsPanel.tsx`; modify `ReviewStage.tsx`.
- **Steps**:
  1. Store module: load/save with JSON guards (corrupt value → empty, never throw), `addNote`,
     `deleteNote`, `editNote`, `useAnnotations(chapterId)`.
  2. Panel: list sorted by section number; each card = §N chip, note text, delete; clicking the §N
     chip scrolls/plays that section (reuse T5 play-from-here).
  3. "Add note on §N (playing)" enabled when something is playing; otherwise a section picker
     (small number input) fallback. Inline textarea + save.
  4. Header hint per mock: "notes attach to sections — re-renders don't shift them". Add a one-line
     note in the file header + `99_progress_log.md` that server-side persistence is future work.
- **Capabilities re-homed**: none; new.
- **Tests**: annotations store unit test (round-trip, corrupt JSON tolerated) + panel test
  (add note at playing section, persists across remount via mocked localStorage).
- **Verify**: standard trio.
- **Out of scope**: backend persistence, multi-user, export of notes.

### R4-T7 — Re-render-section action (the primary Review gesture)
- **Goal**: Each annotation card and each section row (hover) gets "Re-render section", wired to the
  EXISTING single-segment rebuild action (the same `handleGenerate(spanIds, voice, onBlocked)` used
  by ScriptView span hover-rebuild). While re-rendering, the section shows the rendering highlight
  (mock: "re-rendering — highlight follows progress, like Studio build view") reusing the
  `renderingSpanIds` set from the shared render-state plumbing.
- **Read first**: `useStudioChapter` (R3-T1) `handleGenerate` + `chapterRenderRenderingSegmentIds`;
  ScriptView's `is-rendering` classes in `ScriptView.css`; mock rerendering row.
- **Create/Modify**: Modify `ReviewStage.tsx`, `FollowAlongPanel.tsx`, `AnnotationsPanel.tsx` —
  ReviewStage consumes the same `useStudioChapter(chapterId)` instance data it needs (extract a
  lighter `useChapterRenderState` from it if mounting the full hook in Review double-fetches; if
  both Studio and Review can't share cleanly in one task, mount the full hook and log the
  optimization for R6).
- **Steps**:
  1. Button → `handleGenerate(sectionSpanIds, effectiveVoice, onBlocked→ConfirmModal)`.
  2. Section row style: rendering state when any of its span ids ∈ `renderingSpanIds`; queued state
     from `queuedSpanIds`.
  3. After completion (job done tick), section becomes playable with fresh audio — verify the
     existing reload path refreshes `scriptViewData`.
  4. Disable when engines disabled (`anyEnginesEnabled` logic — reuse).
- **Capabilities re-homed**: single-segment rebuild (additional entry point; ScriptView keeps its own).
- **Tests**: panel test — button calls generate with the section's span ids; rendering class applied
  when render-state fixture marks spans rendering (socket-driven states built via
  `frontend/src/api/contracts/liveEvents.ts` + `publishStudioSocketMessage` — R3 testing standard).
- **Verify**: standard trio + manual: annotate a section, re-render it, watch highlight then replay.
- **Out of scope**: batch re-render, auto-replay after render.

### R4-T8 — Sweep: player capability parity + mock comparison
- **Goal**: Verify no playback capability vanished (R-C) and the bar matches the mock: hidden when
  empty, full-window width below rail+content, scope chip correct per source, expansion slot present
  but collapsed.
- **Read first**: `02_capability_inventory.md` playback rows; mock PlayerBar.
- **Create/Modify**: fixes only; `99_progress_log.md` notes.
- **Steps**:
  1. Grep audit: `grep -rn "<audio\|new Audio(" frontend/src` → only PlayerBar + recording capture.
  2. Manual matrix: segment play (Studio span), chapter play (Manuscript row), voice preview
     (Voices), Review section play — each shows correct scope chip + title, transport works,
     switching sources stops the previous one.
  3. Dark/light + collapsed-rail layouts: bar spans full window width in all rail states.
  4. Keyboard space in Studio still toggles; no double-audio anywhere.
- **Capabilities re-homed**: n/a (audit).
- **Tests**: none new (fix-driven only).
- **Verify**: standard trio.
- **Out of scope**: waveform, scope-chip cycling interactions, Review v2.

---

## Acceptance checklist (phase boundary)

- [ ] Exactly one `<audio>` element app-wide (PlayerBar); recording capture exempt.
- [ ] PlayerBar hidden with nothing loaded; appears on any play; full window width at the bottom; reserved expansion slot exists (inspect DOM/CSS) with no waveform dep added.
- [ ] Segment playback in Studio: auto-advance across segments preserved, prev/next blocks work, space toggles, highlight follows.
- [ ] Chapter row play and voice preview both route through the bar with correct scope chips; starting one stops the other.
- [ ] Review: follow-along highlights the playing section, auto-scrolls, click-to-play works; limitation (no intra-section timing) is documented in UI copy and progress log.
- [ ] Annotations: add at playing section, persist across reload (localStorage), attach to §N (re-render does not shift them).
- [ ] Re-render section from an annotation: shows rendering highlight, completes, replays with new audio.
- [ ] `useChapterPlayback`/`PlaybackControls` tests were migrated/updated, not deleted (check git diff of `frontend/tests/`).
- [ ] Suite green; dark/light verified on PlayerBar + Review.
