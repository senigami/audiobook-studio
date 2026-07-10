# Test Value Audit — Frontend infra (hooks/store/api/utils/app-layout/demo/i18n) — 2026-07-10

Consolidated from 6 parallel sub-passes (hooks batch 1, hooks batch 2, store+api, utils, app layout+navigation, demo+i18n+test). Every test file was read in full alongside its source, checked against `design-docs/specs/testing-standards.md` (R1-R4 + VACUOUS/MOCKED-OUT/WRONG-SCENARIO/FRAGILE/REAL rubric).

Scope: ~64 files, ~665 total test cases reviewed.

## DEFINITE delete candidates

- `frontend/tests/unit/hooks/useChapterPlayback.handlerLeak.test.tsx` — "calls playerBus.stop() on stopPlayback" (whole file's only test) — stale/misleading: predates the `playerBus` refactor, no longer verifies "clears all audio event handlers" as its own title claims (that logic now lives inside a fully-mocked module), and duplicates `useChapterPlayback.test.tsx`'s "stops playback" test with a weaker assertion.
- `frontend/tests/unit/hooks/useJobs.test.tsx` — `"[W-MIX-LA-004] segment_progress indeterminate=true → isActiveJobPreparing=true → seg-2 in preparing set (not rendering)"` — self-referential: reimplements `useStudioChapter.ts`'s `isActiveJobPreparing` formula as a local const in the test and asserts it against itself; never calls the real `useStudioChapter` code. Its only real assertions duplicate the immediately-preceding test exactly.
- `frontend/tests/unit/hooks/useSegmentHandoffQueue.scriptView.test.tsx` — `"reports A as displayedSegmentId with progress 1.0 after batched A@0.8→B@0, so script highlight stays on A"` — near-verbatim duplicate of the base file's `useSegmentHandoffQueue.test.tsx`'s "sets displayedProgress to 1.0 (not last-seen) when entering COMPLETING state due to segment change" — same setup, same assertions, no ScriptView component actually rendered.
- `frontend/tests/unit/utils/chapterRenderProgress.test.ts` — `"proves equal-length segments produce near-equal chapter progress contribution"` — never imports or calls any exported function from `chapterRenderProgress.ts`; recomputes the formula inline and asserts it against itself. Zero coverage of the real source file.
- `frontend/tests/unit/app/layout/playerRepresentation.test.ts` — five tests in the same `describe('representation choice — integration (forceWave override)')` block: `"forceWave=true overrides regardless of fit"`, `"forceWave=false overrides regardless of fit"`, `"forceWave=null defers to predicate (short clip → waveform)"`, `"forceWave=null defers to predicate (long clip → bar)"`, `"same duration + width produces the same result regardless of any scope context"` — all self-referential (recompute `forceWave ?? fitsLegibly(...)` inline rather than calling an exported function) or trivially-true (a pure function equals itself on identical inputs; "scope" isn't even a parameter of the function). Real coverage of this decision already exists in `PlayerBar.test.tsx`'s "AudioLines toggle" tests, which render the actual component.
- `frontend/tests/unit/demo/styleguide.test.tsx` — `"returns > 50 light entries and > 30 dark entries from real tokens.css"` — the file-level `vi.mock('@/theme/tokens.css?raw', ...)` intercepts this import too, so it never touches real tokens.css; the test's own comment admits this, yet the name still claims real-data counts. Duplicate of two adjacent tests that correctly test the mock.
- `frontend/tests/unit/demo/voiceLabStage.test.tsx` — `"stage has expected id and title"` — asserts hardcoded object-literal constants against themselves; no logic exercised.

## DISCUSS (borderline, needs a human call)

- `hooks/useChapterAnalysis.test.tsx:"handles empty text"` — only asserts initial state (already null pre-interaction); doesn't prove the empty-text branch fired.
- `hooks/useChapterAnalysis.test.tsx:"runs analysis after debounce when text changes"` — **R4 violation**: real unmocked 1s `setTimeout`, test waits via `waitFor(timeout:3000)` on real wall-clock instead of fake timers.
- `hooks/useGlobalQueue.test.tsx` — 5 `.skip`ped tests ("suspends sync during drag", "handles pause/resume toggle", "handles reordering and commit", "handles removal", "handles clear all with confirmation") — skipped since March 2026 (~4 months untouched) due to a real 10s `setTimeout`/act() deadlock. Decide: rewrite with fake timers, move to Playwright E2E, or delete.
- `hooks/useSegmentHandoffQueue.scriptView.test.tsx:"transitions script highlight to B only after onVisualComplete..."` — substantially overlaps base-file coverage of the same hold→mount-at-0→catch-up mechanism; no distinct component exercised. Consolidate or delete alongside its sibling above.
- `store/annotations.test.ts:"updates an existing annotation and updatedAt changes"` — real 5ms `setTimeout` sleep purely to force `Date.now()` to tick between saves; soft R4 violation (fix: `vi.setSystemTime()`).
- `demo/scenes.test.ts:"publishing all frames does not throw"` / `"all published frames can be normalized without error"` — smoke-only (`not.toThrow()`), though they do validate the entire hand-authored fixture dataset against the real production bus.
- `demo/styleguide.test.tsx` — 7 static-presence-only section-heading/label tests (canonical page title, spacing/motion tokens section, Principles/Brand/Iconography/Accessibility/Voice-Pills sections) — each guards a maintained reference doc against silently losing a section, but exercises no logic.
- `i18n/i18n.test.ts:"is a no-op import until explicitly called"` — near-duplicate of the adjacent "creates no instance merely by being imported" test.
- `i18n/useTranslation.test.tsx:"never throws for a missing key"` — subsumed by the specific-value tests around it.
- `app/layout/WaveformTape.test.tsx` — `"exports TAPE_ZOOM_PRESETS_SEC as [8,15,30,60,120]"`, `"exports PEAKS_COUNT as 4000"` — thin constant-pinning, no branch exercised.
- `app/layout/WaveformTape.test.tsx:"existing ArrowLeft/ArrowRight scrub behavior is unaffected by the zoom keyboard extension"` — near-duplicate of the plain ArrowRight/ArrowLeft test above it.
- `app/layout/playerRepresentation.test.ts:"are exported with the spec-defined values"` (PX_PER_SEC_FLOOR=3, DURATION_BOOTSTRAP=30) — thin constant-pinning.

## R4 (real-sleep) timing violations found

- `hooks/useChapterAnalysis.test.tsx` — real 1s debounce timer waited on via `waitFor(timeout:3000)` instead of fake timers (see DISCUSS above).
- `store/annotations.test.ts` — real 5ms sleep to force a timestamp tick (see DISCUSS above).
- No other violations found — `railState`, `useWebSocket`, `useQueueStatusHoldTimer`, `useSegmentHandoffQueue` (all 3 files), `useQueueSync`'s P7 tests, `useVariantActions`'s debounce test, `useDemoTransport`, and `App.test.tsx`'s F15 tests all correctly use `vi.useFakeTimers()`/`vi.advanceTimersByTime(Async)` or explicit microtask drains.

## Notable KEEP (exemplary, called out across sub-passes)

- `hooks/useJobs.test.tsx` (74 of 75 tests), `hooks/useSegmentHandoffQueue.test.tsx` (all 18), `hooks/useSegmentHandoffQueue.debug.test.tsx` (all 3), `store/live-jobs.test.ts` (all 20, incl. two `[W-MIX-LA-004]` R1 revert-check pairs), `store/playerBus.test.ts` (all 22), `api/hydration/index.test.ts` (all 19), `api/lexicon.test.ts` (all 12, explicit R1 revert-check header) — consistently real, contract-typed, no self-referential math.
- `utils/jobUpdateReducer.test.ts`, `utils/queueEventDispatcher.test.ts`, `utils/queueItemEtaSelection.test.ts`, `utils/runtimeDebug.test.ts`, `utils/segmentsProgressProjector.test.ts` — 100% REAL, zero flags across all ~85 tests in these 5 files combined.
- `app/layout/WaveformTapeMinimap.test.tsx` (all 12), `app/layout/WaveformTapeZoom.test.tsx` (all 15) — no boundary mocks, real drag/click/keyboard math throughout.
- `test/App.test.tsx` — 25 tests, all REAL, including F15 retry-banner regression tests and a confirmed-fixed prior crash (`ScriptView.tsx`'s `data?.paragraphs` guard, F14).

## Summary

- **7 DEFINITE** delete candidates, **~16 DISCUSS** items, out of ~665 total tests reviewed.
- **2 real R4 timing violations** (both soft/low-risk, neither gates a bugfix).
- This is a very strong area of the codebase overall — the vast majority of hooks/store/api/utils tests drive real state machines and reducers against contract-typed socket frames (R3-compliant) with correct fake-timer discipline. The deletions cluster narrowly: one stale post-refactor test, three self-referential-math tests, and a small cluster of duplicate/near-duplicate coverage in newer files (`playerRepresentation.test.ts`, `styleguide.test.tsx`, `voiceLabStage.test.tsx`) rather than a systemic problem.
