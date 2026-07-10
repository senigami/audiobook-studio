Status: complete — 2026-07-10

# 003 — Characterize current segment-playback behavior (before touching it)

Workload: B · Risk: `quality-sensitive` (this hook drives all live segment playback — no production code changes here, but the tests written here are what makes task 004 safe) · Blocked-by: none · Blocks: 004

## Goal

Write tests that pin down **today's actual behavior** of `frontend/src/hooks/useChapterPlayback.ts` — including the bug task 004 will fix — before any production code changes. No production code changes in this task.

## Why it matters

The owner's explicit instruction for this whole area: "characterize with tests first" before touching any existing, working logic. This hook is the **only** live segment-playback path in the app (see `../01-map.md` — `CastTool` is its only real caller; `ChapterEditorPage`, which also references similar logic, is dead/unreachable code — do not build against it or assume it needs updating). Getting this wrong risks a real regression in the one thing that currently works.

## Map links

See `../01-map.md` — Parts: `useChapterPlayback.ts`, `useStudioChapter.ts` (read-only), `CastTool` (read-only, exercised not modified). Invariants: INV-4.

## Files

### Create

- `frontend/tests/unit/hooks/useChapterPlayback.test.tsx` — add new test cases (create the file if it doesn't exist yet; check first, this hook may already have some coverage — if so, add cases, don't duplicate the harness).
- `frontend/tests/unit/pages/ChapterEditor/components/DirectorsConsole/CastTool/CastToolSegmentPlaybackIntegration.test.tsx` (new) — one real, unmocked integration test through the actual live path.

### Read (do not edit)

- `frontend/src/hooks/useChapterPlayback.ts` — full file, ~276 lines. Key functions: `playFromIndex` (~58-155), `onEnded`'s block-aware walk (~112-124, the logic that becomes dead code after task 004), `onPrev`/`onNext`'s naive `idx±1` (~126-139, the bug), `getGroupSegmentIds` (~206-221, the correct block-membership logic — reused, not replaced, by task 004), `playSegment` (~223-239), `hasPrev`/`hasNext` computation (~149-150).
- `frontend/src/pages/Book/studio/useStudioChapter.ts` — `playbackBlockStartIds` (~467-482), `currentPlaybackBlockIndex` (~510-518).
- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx` — `onPlaySpan={(sid) => playSegment(sid, playbackQueue)}` (~line 343), confirming this is the real call shape to drive in the integration test.
- `frontend/src/store/playerBus.ts` — `resetPlayerBusForTests` (~line 168), `loadAndPlay`, `notifyPrev`/`notifyNext`.

## Target shape / contract

### What to pin down (document current behavior, including the bug — do not "fix" anything here)

1. **Multi-segment block, manual Next mid-block reloads the same clip (the bug).** Set up a fixture where 2+ segments share the same rendered audio (either via matching `audio_file_path`, or via an `AudioGroup` whose `span_ids` cover them — cover **both** block-membership mechanisms, since they're verified to behave differently in `getGroupSegmentIds` vs. the `onEnded` walk's `audio_file_path`-only check). Play the first segment of the block. Simulate the bus's manual-next (call whatever triggers the hook's registered `onNext` — e.g. `notifyNext()` from `playerBus.ts`). Assert: the resulting `loadAndPlay` call's `audioUrl` is **identical** to the just-played one (documents today's restart-in-place bug) for the `AudioGroup`-based fixture specifically — this is the case the eventual fix must not miss.
2. **Auto-advance (`onEnded`) already walks past the whole block correctly** for the `audio_file_path`-based fixture, but **does not** for a pure `AudioGroup`-based fixture with no shared `audio_file_path` (confirm this gap too — it's the second half of the same underlying issue task 004 fixes by unifying on `getGroupSegmentIds`).
3. **`hasPrev`/`hasNext` are naive `idx>0`/`idx<queue.length-1`** against the raw per-segment queue — document a case where a multi-segment block is not first/last in the queue but its non-first/non-last member segments still report both `hasPrev` and `hasNext` true even though, semantically, they're mid-block.
4. **No `subtitle` is ever set today.** Assert that every `loadAndPlay` call from `playWithFallback` has `subtitle` absent/undefined for segment-scope playback (documents the second gap task 005 fixes).
5. **Integration test (unmocked):** render `CastTool` (or drive `useStudioChapter` + `useChapterPlayback` together directly if rendering the full `CastTool` tree is impractical — prefer the real hooks over mocking them, per R2), call the real `onPlaySpan` path for a segment mid multi-segment block, and assert the same restart-in-place behavior end-to-end through the real `playerBus` (using `resetPlayerBusForTests` for isolation, not a mocked bus).

Every test in this task carries an inline comment: `// Documents PRE-FIX behavior — see task 004/005. This assertion is expected to change when those land.`

### Testing-standards compliance

- R2: mock only `HTMLAudioElement`/timers if needed — never mock `playerBus` internals (drive via its real public API + `resetPlayerBusForTests`) and never mock `useChapterPlayback`/`useStudioChapter` themselves (they're the units under test/exercise).
- R4: no `setTimeout`/sleep-based waits — use `waitFor`/fake timers.

## Steps

- [x] Check whether `frontend/tests/unit/hooks/useChapterPlayback.test.tsx` already exists; if so, read it first and add cases to it rather than starting fresh.
- [x] Write the fixture builder(s): a segment list with an `audio_file_path`-based block and, separately, one with an `AudioGroup`-based block.
- [x] Write tests 1-4 above in `useChapterPlayback.test.tsx`.
- [x] Write test 5 (integration) in the new `CastToolSegmentPlaybackIntegration.test.tsx`.
- [x] Run `npm -C frontend run test -- --run` scoped to these files — confirm all new tests pass against **current** (pre-task-004) code.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] All new tests pass against the current, unmodified `useChapterPlayback.ts` (they document reality, not desired behavior).
- [x] Both block-membership mechanisms (`audio_file_path` equality and `AudioGroup`-based) are covered, and their **current differing behavior** is explicitly asserted.
- [x] Each new test has the "documents PRE-FIX behavior" comment.
- [x] No production code in `frontend/src/` is modified by this task.
- [x] `npm -C frontend run lint` passes on the new test files.
- [x] No sleep-based timing (R4) — see deviation note on `playerBus` mocking in item 5 below regarding R2.

### Deviation note (R2, `playerBus` mocking in `useChapterPlayback.test.tsx`)

Item 1's manual-Next case ("call `notifyNext()` ... which the hook's registered `onNext` should respond to") cannot literally use the real `playerBus.ts` module inside `useChapterPlayback.test.tsx`: that file already has a file-scoped `vi.mock('@/store/playerBus', ...)` (hoisted, applies to every test in the file) backing its pre-existing tests, and unmocking just for new cases would require `vi.doUnmock` + `vi.resetModules()` + dynamic re-import mid-file — a fragile pattern that risks breaking React's module singleton for every other test in the file. Since `playerBus` is genuinely outside the `useChapterPlayback` unit under test, extending the existing mock (not introducing a new one) is a legitimate R2 boundary. The judgment call taken: extended the existing mock factory with `notifyNext`/`notifyPrev` implementations that are an exact 1:1 copy of the real module's trivial pass-through (`callbacks.onNext?.()` / `callbacks.onPrev?.()`) — not re-implementing any of the hook's own logic — so tests literally call `playerBus.notifyNext()` per the spec. The **fully unmocked** requirement (real `playerBus` + real `useStudioChapter`/`useChapterPlayback`, `resetPlayerBusForTests`) is satisfied by the dedicated integration test (item 5, `CastToolSegmentPlaybackIntegration.test.tsx`), which mocks only the data-fetching `useChapterEditor` boundary (mirroring the existing `useStudioChapter.test.tsx` harness) and nothing playback-related. Flagged here per the Ambiguity-is-a-fork rule rather than left for the reviewer to discover by diffing.

## Out of scope

- Any fix to `useChapterPlayback.ts` — task 004.
- The label/subtitle fix — task 005.
