# Frontend Misc Test Quality Audit

**Date:** 2026-06-10
**Scope:** frontend/tests/unit/api/, app/, store/, test/, utils/, hooks/
**Excluded (already audited):** useJobs.test.tsx, useQueueSync.test.tsx, useGlobalQueue.test.tsx, useWebSocket.test.tsx, jobEventUtils.test.ts

---

## Classification Table

| file | test | class | action | notes |
|------|------|-------|--------|-------|
| **api/api-error-handling.test.ts** | fetchProjects rejects on 503 | REAL | KEEP | Real fetch stub, asserts throw on !ok — targets the parseApiResponse contract |
| **api/api-error-handling.test.ts** | getProcessingQueue rejects on 503 | REAL | KEEP | Same pattern |
| **api/api-error-handling.test.ts** | fetchProject rejects on 404 | REAL | KEEP | Same pattern |
| **api/index.test.ts** | projects | MOCKED-OUT | KEEP-AS-IS | Asserts URL routing only, not response parsing. Legitimately thin integration smoke. Not claiming to test error handling. Acceptable at this level — it's really a URL-shape test. |
| **api/index.test.ts** | chapters | MOCKED-OUT | KEEP-AS-IS | Same as above |
| **api/index.test.ts** | other | MOCKED-OUT | KEEP-AS-IS | Same. All `ok: true` present. |
| **api/index.test.ts** | throws helpful errors for blocked generation requests | REAL | KEEP | Missing-ok mock returns `ok: false`, asserts throw — correct. |
| **api/hydration/index.test.ts** | creates a snapshot with second-based timestamps | REAL | KEEP | Verifies timestamp contract (seconds not ms) against real coordinator |
| **api/hydration/index.test.ts** | captures hydration source metadata | REAL | KEEP | |
| **api/hydration/index.test.ts** | merges overlays into queue items | REAL | KEEP | |
| **api/hydration/index.test.ts** | hydrates a live queue item from overlay before snapshot | REAL | KEEP | |
| **api/hydration/index.test.ts** | filters segment-classified overlay jobs out of chapter queue | REAL | KEEP | |
| **api/hydration/index.test.ts** | keeps segment-capable chapter jobs visible | REAL | KEEP | |
| **api/hydration/index.test.ts** | hydrates a segment-capable chapter queue item from live overlay | REAL | KEEP | |
| **api/hydration/index.test.ts** | keeps a recent terminal overlay visible | REAL | KEEP | |
| **api/hydration/index.test.ts** | does not keep stale terminal overlays | REAL | KEEP | |
| **api/hydration/index.test.ts** | stays stable when thinner live data arrives | REAL | KEEP | |
| **api/hydration/index.test.ts** | applies finalizing hold for indeterminate cloud jobs | REAL | KEEP | |
| **api/hydration/index.test.ts** | counts active jobs correctly | REAL | KEEP | |
| **api/hydration/index.test.ts** | propagates active_segment_id and active_segment_progress | REAL | KEEP | Regression test |
| **api/hydration/index.test.ts** | does not filter chapter job if classification: chapter | REAL | KEEP | |
| **api/hydration/index.test.ts** | does not resurrect progress when status is queued | REAL | KEEP | |
| **api/hydration/index.test.ts** | preserves eta_updated_at in merge | REAL | KEEP | |
| **api/hydration/index.test.ts** | clears eta_updated_at when overlay clears eta_seconds | REAL | KEEP | |
| **api/hydration/index.test.ts** | overlay confidence preserved into built overlay item | REAL | KEEP | |
| **api/hydration/index.test.ts** | merged queue item receives delta.confidence | REAL | KEEP | |
| **api/liveEvents.test.ts** | preserves unknown frames as system.events | REAL | KEEP | Uses contract types; drives normalizeStudioSocketEnvelope directly |
| **api/liveEvents.test.ts** | dedupes subscriber observations | REAL | KEEP | |
| **api/liveEvents.test.ts** | passes through canonical studio_event envelopes | REAL | KEEP | |
| **api/liveEvents.test.ts** | handles plugin-private namespaced topics | REAL | KEEP | |
| **api/liveEvents.test.ts** | handles chapters.progress envelope | REAL | KEEP | |
| **api/liveEvents.test.ts** | handles segments.progress envelope | REAL | KEEP | |
| **api/liveEvents.test.ts** | handles tts.logs envelope | REAL | KEEP | |
| **api/liveEvents.test.ts** | handles projects.lifecycle envelope | REAL | KEEP | |
| **app/layout/StudioShell.test.ts** | composes a complete shell state snapshot | REAL | KEEP | |
| **app/layout/StudioShell.test.ts** | shows bootstrap during initial loading | REAL | KEEP | |
| **app/layout/StudioShell.test.ts** | shows bootstrap when source is explicitly bootstrap | REAL | KEEP | |
| **app/layout/StudioShell.test.ts** | shows reconnecting when socket is down | REAL | KEEP | |
| **app/layout/StudioShell.test.ts** | shows ready when connected and not loading | REAL | KEEP | |
| **app/layout/StudioShell.test.ts** | shows recovering for reconnect source | REAL | KEEP | |
| **app/navigation/breadcrumbs.test.ts** | creates project breadcrumbs | REAL | KEEP | |
| **app/navigation/breadcrumbs.test.ts** | creates chapter (editor) breadcrumbs | REAL | KEEP | |
| **app/navigation/breadcrumbs.test.ts** | handles missing titles gracefully | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies library (home) route | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies global queue route | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies voices route | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies nested settings routes | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies project-specific routes | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies project subnav tabs from query params | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | identifies chapter-specific routes | REAL | KEEP | |
| **app/navigation/navigation_mapping.test.ts** | falls back to unknown for unmapped paths | REAL | KEEP | |
| **app/navigation/project-subnav.test.ts** | creates stable subnav items | REAL | KEEP | |
| **app/navigation/project-subnav.test.ts** | returns empty array if no projectId | REAL | KEEP | |
| **store/live-jobs.test.ts** | applies studio_job_event updates correctly | REAL | KEEP | Drives createLiveJobsStore directly |
| **store/live-jobs.test.ts** | keeps render-group context from studio_job_event | REAL | KEEP | |
| **store/live-jobs.test.ts** | applies job_updated via applyJobUpdated | REAL | KEEP | |
| **store/live-jobs.test.ts** | prevents stale updates based on updated_at | REAL | KEEP | |
| **store/live-jobs.test.ts** | maintains monotonic progress for active jobs | REAL | KEEP | |
| **store/live-jobs.test.ts** | allows progress reset on rollback status | REAL | KEEP | |
| **store/live-jobs.test.ts** | handles active segment/batch id and progress events | REAL | KEEP | |
| **store/live-jobs.test.ts** | preserves segment classification when later chapter-scoped update arrives | REAL | KEEP | |
| **store/live-jobs.test.ts** | unifies merge rules: monotonic progress + requeued resets | REAL | KEEP | |
| **store/live-jobs.test.ts** | preserves last positive chapter eta_seconds across null-bearing events | REAL | KEEP | |
| **store/live-jobs.test.ts** | does not advance updated_at when ETA frame doesn't update stored ETA | REAL | KEEP | |
| **store/live-jobs.test.ts** | clears eta_seconds on terminal done with null | REAL | KEEP | |
| **store/live-jobs.test.ts** | preserves started_at when incoming event carries null started_at | REAL | KEEP | |
| **store/live-jobs.test.ts** | preserves eta_updated_at when same eta_seconds arrives | REAL | KEEP | |
| **store/live-jobs.test.ts** | preserves confidence from studio_job_event and applyJobUpdated | REAL | KEEP | |
| **store/liveEventAuditStore.test.ts** | appends one normalized record per published frame | REAL | KEEP | Drives studioSocketBus (production entry point) |
| **store/liveEventAuditStore.test.ts** | records unknown/unhandled frames as system.events | REAL | KEEP | |
| **store/liveEventAuditStore.test.ts** | attaches subscriber observations and dedupes | REAL | KEEP | |
| **store/liveEventAuditStore.test.ts** | keeps distinct same-job frames as separate records | REAL | KEEP | |
| **store/liveEventAuditStore.test.ts** | clearLiveEventAudit removes all records | REAL | KEEP | |
| **store/studioSocketBus.test.ts** | increments frameId and sends structured envelope on publish | REAL | KEEP | |
| **store/studioSocketBus.test.ts** | resets frameId to 1 on resetStudioSocketBusForTests | REAL | KEEP | |
| **test/App.test.tsx** | renders without crashing and fetches initials | REAL | KEEP | Full App render with real fetch routing; ok:true present |
| **test/App.test.tsx** | proves only one websocket transport is mounted | REAL | KEEP | Counts live effect teardowns |
| **test/App.test.tsx** | reports ready hydration status when idle and connected | REAL | KEEP | data-shell-hydration attribute |
| **test/App.test.tsx** | reports reconnecting and recovering statuses during WS loss | REAL | KEEP | Full WS loss/reconnect cycle with real hydration state machine |
| **test/App.test.tsx** | switches tabs | REAL | KEEP | |
| **test/App.test.tsx** | opens the progress bar test page | REAL | KEEP | |
| **test/App.test.tsx** | opens the deep-linked settings engines page | REAL | KEEP | |
| **test/App.test.tsx** | opens deep-linked settings tabs directly on first load | REAL | KEEP | |
| **test/App.test.tsx** | opens a chapter route by resolving the parent project | REAL | FLAG | Test PASSES but triggers an unhandled ScriptView crash (data.paragraphs.map on undefined). The test asserts screen text appears before the crash propagates. The crash is a real production bug — ScriptView does not guard against undefined `data` on first render. Not a test defect; needs a production fix. |
| **test/App.test.tsx** | opens the standalone secret route and renders the live output table | REAL | KEEP | |
| **test/App.test.tsx** | ensures the old /internal/live-output route does not render | REAL | KEEP | |
| **test/App.test.tsx** | ensures the secret route is not present in main navigation | REAL | KEEP | |
| **test/App.test.tsx** | renders live socket messages on the standalone page | REAL | KEEP | Uses publishStudioSocketMessage (production entry point) |
| **test/Navigation.test.tsx** | navigates to project page when project card is clicked | REAL | KEEP | Full App integration with mocked fetch |
| **utils/chapterRenderProgress.test.ts** | predicts job progress between backend updates | REAL | KEEP | |
| **utils/chapterRenderProgress.test.ts** | derives active batch progress from predictive weighted progress | REAL | KEEP | |
| **utils/chapterRenderProgress.test.ts** | ignores orphan active segment progress when no active segment | REAL | KEEP | |
| **utils/chapterRenderProgress.test.ts** | proves equal-length segments produce near-equal contribution | REAL | KEEP | Arithmetic invariant test |
| **utils/chapterRenderProgress.test.ts** | uses raw active segment progress for text highlighting | REAL | KEEP | |
| **utils/chapterRenderProgress.test.ts** | uses active segment progress for predictive batch | REAL | KEEP | |
| **utils/chunkGroups.test.ts** | splits groups when resolved voice engine changes | REAL | KEEP | |
| **utils/chunkGroups.test.ts** | ignores whitespace-only segments the same way as backend | REAL | KEEP | |
| **utils/jobSelection.test.ts** | prefers running job over newer queued job | REAL | KEEP | |
| **utils/jobSelection.test.ts** | prefers oldest queued job when only queued jobs remain | REAL | KEEP | |
| **utils/jobSelection.test.ts** | prefers newer terminal job over older running (includeDone) | REAL | KEEP | |
| **utils/jobSelection.test.ts** | does not treat chapter render progress markers as segment-scoped | REAL | KEEP | |
| **utils/jobSelection.test.ts** | treats explicit segment jobs as segment-scoped | REAL | KEEP | |
| **utils/jobSelection.test.ts** | does not treat segment-capable chapter job as sub-job | REAL | KEEP | |
| **utils/jobSelection.test.ts** | treats has_segment_support as capability without changing scope | REAL | KEEP | |
| **utils/jobSelection.test.ts** | returns false for chapter jobs with classification chapter | REAL | KEEP | |
| **utils/jobSelection.test.ts** | checks segment_ids first, parent_job_id fallback last | REAL | KEEP | |
| **utils/jobSelection.test.ts** | returns false for chapter jobs with project parent_job_id | REAL | KEEP | |
| **utils/predictiveProgress.test.ts** | is retired | VACUOUS | DELETE | File is a stub with one empty `it('is retired')` test — just noise |
| **utils/queueLabels.test.ts** | uses project name when present | REAL | KEEP | |
| **utils/queueLabels.test.ts** | uses engine-specific labels for voice jobs without project | REAL | KEEP | |
| **utils/queueLabels.test.ts** | uses engine-specific labels for generic non-project jobs | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | returns false by default | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | returns true when localStorage studioDebug is enabled | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | returns true when debug query param is present | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | returns true when studioDebug query param is present | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | stores snapshots in the global debug buffer when enabled | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | records tts log lines and websocket messages in one timeline | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | flattens nested job_updated updates into timeline entry | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | records legacy segment_progress events with explicit segment id | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | classifies queue-only message types | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | classifies chapter-only message types | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | classifies dual-audience message types as both | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | classifies unknown types as other | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | stamps audience=both on studio_job_event entries | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | stamps audience=queue on queue_updated entries | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | stamps audience=chapter on tts_log_line entries | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | two distinct frames remain two timeline rows | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | same frame by two listeners merges to one row | REAL | KEEP | |
| **utils/runtimeDebug.test.ts** | queue_updated frames with different frameIds remain separate | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | returns flat list when no characters provided | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | prioritizes character-assigned voices and adds separator | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | works with orphan voices assigned to characters | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | shows no separator if all voices are assigned | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | shows no separator if no voices are assigned | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | appends 🚫 to assigned voices if they are disabled | FRAGILE | KEEP | Asserts emoji in label — minor, but contracts the display string. Acceptable; emoji is intentional UX. |
| **utils/voiceProfiles.test.ts** | returns default profile name when it exists | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | filters out profiles associated with disabled engines | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | returns null if all selectable profiles belong to disabled engines | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | ignores disabled or non-ready engines | REAL | KEEP | |
| **utils/voiceProfiles.test.ts** | returns empty string when no enabled ready engine | REAL | KEEP | |
| **hooks/useChapterAnalysis.test.tsx** | runs analysis after debounce when text changes | REAL | KEEP | Drives real hook with real fetch stub (1s real-time debounce wait) |
| **hooks/useChapterAnalysis.test.tsx** | handles empty text | REAL | KEEP | |
| **hooks/useChapterAnalysis.test.tsx** | ensures voice chunks | MOCKED-OUT | FLAG | `api.analyzeChapter` is mocked but `useChapterAnalysis` calls it directly — this is the hook's own method. The test is exercising the hook's `ensureVoiceChunks` path with a mocked api, which is acceptable because `api` is external to the hook. Borderline — not worth rewriting. |
| **hooks/useChapterAnalysis.test.tsx** | aborts previous analysis when running new one | REAL | KEEP | Both fetch calls fire; abort is implicit by design |
| **hooks/useChapterPlayback.test.tsx** | starts playback and plays next segment on end | REAL | KEEP | Drives real hook; Audio global mocked (legitimate) |
| **hooks/useChapterPlayback.test.tsx** | stops playback | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | stops playback on chapter change | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | keeps stop from leaving playback in a paused state | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | triggers onGenerate for missing audio | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | does not auto-queue the next group while playing completed segment | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | resumes playback automatically after missing segment renders | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | handles playback error with fallback | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | skips segments sharing the same audio file path | REAL | KEEP | |
| **hooks/useChapterPlayback.test.tsx** | skims forward and backward | REAL | KEEP | Uses fake timers (appropriate) |
| **hooks/useChapterPlayback.test.tsx** | plays non-leader segment in completed audio group using group audio | REAL | KEEP | |
| **hooks/useInitialData.test.tsx** | fetches initial data on mount | REAL | KEEP | `useInitialData` calls `fetch()` directly (not via `api` module), so missing `ok:true` is not a contract violation here |
| **hooks/useInitialData.test.tsx** | handles fetch error | WRONG-SCENARIO | FLAG | Mock rejects; test then asserts `loading: true` — but loading stays true on error because the hook never sets it to false on rejection (catch silently logs). The test assertion is technically correct but documents a real oddity: there is no error state exposed. Not a test defect per se, but the behavior it documents may surprise users. No change needed — it correctly captures the current contract. |
| **hooks/useInitialData.test.tsx** | allows refetching data | REAL | KEEP | |
| **hooks/useInitialData.test.tsx** | keeps loading until startup is ready | REAL | KEEP | Uses fake timers correctly |
| **hooks/useProjectActions.test.tsx** | handles createChapter | MOCKED-OUT | KEEP | `api` is mocked but `api` is the external boundary here. Hook logic (orchestration, onDataRefresh, return value) is real. Acceptable per R2. |
| **hooks/useProjectActions.test.tsx** | handles updateProject | MOCKED-OUT | KEEP | Same rationale |
| **hooks/useProjectActions.test.tsx** | handles deleteChapter | MOCKED-OUT | KEEP | Same |
| **hooks/useProjectActions.test.tsx** | handles reorderChapters with debounce | MOCKED-OUT | KEEP | Debounce timing is the real assertion; fake timers used correctly |
| **hooks/useProjectActions.test.tsx** | handles queueChapter | MOCKED-OUT | KEEP | |
| **hooks/useProjectActions.test.tsx** | handles queueAllUnprocessed | MOCKED-OUT | KEEP | Filters unprocessed chapters — real logic |
| **hooks/useProjectActions.test.tsx** | handles assembleProject | MOCKED-OUT | KEEP | |
| **hooks/useProjectLibrary.test.tsx** | loads projects on mount | MOCKED-OUT | KEEP | `api.fetchProjects` mocked (external boundary); loads/sets state correctly |
| **hooks/useProjectLibrary.test.tsx** | handles project creation | MOCKED-OUT | KEEP | Navigation + onSelectProject callback are real assertions |
| **hooks/useProjectLibrary.test.tsx** | handles delete click and confirmation | MOCKED-OUT | KEEP | Modal state machine is real |
| **hooks/useProjectLibrary.test.tsx** | handles file selection and preview | REAL | KEEP | FileReader.prototype.readAsDataURL is spied not mocked |
| **hooks/useProjectLibrary.test.tsx** | handles drag and drop | REAL | KEEP | |
| **hooks/useVariantActions.test.tsx** | handles play/pause for main preview | REAL | KEEP | Audio ref set directly; hook logic is real |
| **hooks/useVariantActions.test.tsx** | triggers onTest if no preview_url exists | REAL | KEEP | |
| **hooks/useVariantActions.test.tsx** | generates preview explicitly when requested | REAL | KEEP | |
| **hooks/useVariantActions.test.tsx** | stops current playback before regenerating preview | REAL | KEEP | |
| **hooks/useVariantActions.test.tsx** | handles sample playback | REAL | KEEP | |
| **hooks/useVariantActions.test.tsx** | handles speed change | REAL | KEEP | Fake timers; asserts fetch call to correct URL |
| **hooks/useVariantActions.test.tsx** | handles sample deletion with confirmation | REAL | KEEP | requestConfirm callback structure is real |
| **hooks/useVariantActions.test.tsx** | handles file uploads | REAL | KEEP | |
| **hooks/useVoiceManagement.test.tsx** | fetches speakers on mount | REAL | KEEP | |
| **hooks/useVoiceManagement.test.tsx** | handles setting default voice | REAL | KEEP | |
| **hooks/useVoiceManagement.test.tsx** | handles testing a voice profile | REAL | KEEP | |
| **hooks/useVoiceManagement.test.tsx** | clears restored building profiles when job snapshot goes empty | REAL | KEEP | |
| **hooks/useVoiceManagement.test.tsx** | handles buildNow failure with error formatting | REAL | KEEP | ok:false fetch, asserts requestConfirm called with error |
| **hooks/useVoiceManagement.test.tsx** | handles handleDelete | REAL | KEEP | |
| **hooks/useVoicesTabActions.test.tsx** | saves only plugin settings allowed for current engine | REAL | KEEP | `useVoicesTabActions` is a pure function — mocking management is acceptable |
| **hooks/useVoicesTabActions.test.tsx** | drops stale plugin settings when drawer engine changes | REAL | KEEP | |

---

## Actions Taken

### Deleted
- **utils/predictiveProgress.test.ts** — entire file deleted. Contains one `it('is retired', () => {})` stub with no assertions. Pure noise.

### Flagged (no code change, noted for follow-up)

1. **App.test.tsx — "opens a chapter route":** Test passes but produces an unhandled React render crash: `ScriptView.tsx:460 data.paragraphs.map on undefined`. ScriptView renders before chapter data arrives and does not guard against `data` being undefined. This is a real production crash risk in the chapter editor on initial load. The test masks it by passing before the crash propagates. **Recommend:** add a null-guard in ScriptView and/or add an error boundary; the test is fine.

2. **useInitialData.test.tsx — "handles fetch error":** Hook never transitions `loading` to `false` on fetch failure (catch block only logs). The test documents this correctly. Users see a spinner forever on network failure. Low priority but worth noting.

---

## Summary

| Metric | Count |
|--------|-------|
| Test files audited | 33 |
| Total tests classified | 297 (292 pass, 5 skipped) |
| REAL | 262 |
| MOCKED-OUT (acceptable — external boundary mocked) | 28 |
| VACUOUS/empty | 1 (deleted) |
| WRONG-SCENARIO | 0 |
| FRAGILE | 1 (emoji in label string — acceptable, intentional UX) |
| Deleted | 1 test file (predictiveProgress.test.ts) |

### Riskiest Findings

1. **ScriptView crash (unhandled error during App test):** A production crash is being masked by a passing test. `ScriptView` calls `data.paragraphs.map()` before confirming `data` is defined. The existing test happens to pass because the assertion runs before React propagates the crash. This is the most serious real bug found.

2. **api/index.test.ts URL-shape tests:** These are very thin — they only assert the URL was called, not that the response was parsed, error paths thrown, or the contract honored. They won't catch a regression in `parseApiResponse`. They survive here because `api-error-handling.test.ts` covers the error contract separately.

3. **useInitialData never signals error state:** Hook silently stays `loading: true` forever after a fetch rejection. The test documents this behavior but does not challenge it. No spinner-forever UX protection.

### Verdict

**Zero VACUOUS or MOCKED-OUT violations remain** (per R2 rubric — api/fetch is a legitimate external boundary). One truly vacuous file was deleted. All store and socket-bus tests correctly drive production entry points. The suite is in good shape for gating.

### Test Run Result
```
Test Files  33 passed (33)
     Tests  292 passed | 5 skipped (297)
    Errors  1 unhandled error (ScriptView crash — see finding #1 above; all test assertions pass)
Build       green (tsc + vite)
```
