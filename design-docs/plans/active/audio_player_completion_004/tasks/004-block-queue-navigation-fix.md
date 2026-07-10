Status: complete — 2026-07-10

# 004 — Normalize the playback queue to blocks; fix Prev/Next

Workload: B · Risk: `quality-sensitive`, `multi-file` (touches the one live segment-playback path; a mistake here is user-visible immediately) · Blocked-by: 003 · Blocks: 005

## Goal

Fix the real navigation bug found by research: manually-triggered Prev/Next (via the global PlayerBar's Skip buttons → `playerBus`'s `notifyPrev`/`notifyNext`) do naive `idx±1` on a queue of raw segment ids, so pressing Next mid-block reloads the current clip instead of advancing. The **reshaped, simpler fix** (found by an adversarial design pass — do not implement the originally-considered alternative described below): normalize the queue itself to **block-leader** ids, not raw segment ids. This makes the existing naive `idx±1` logic correct as-is and deletes the separate `onEnded` walk entirely.

**Rejected alternative** (do not implement): adding a `findAdjacentBlockIndex(idx, queue, direction)` helper that patches `onPrev`/`onNext` using `audio_file_path` equality while leaving the raw-segment queue in place. This was found to still break for `AudioGroup`-based blocks (segments sharing no `audio_file_path` but belonging to the same rendered clip via an `AudioGroup`) and to leave `hasPrev`/`hasNext` wrong at block boundaries. The block-leader-queue approach below fixes both by construction, with less code.

## Why it matters

This is the one bug users will actually hit today, on the only live segment-playback path.

## Map links

See `../01-map.md` — Parts: `useChapterPlayback.ts`. Invariants: INV-4 (verify explicitly below — `useStudioChapter.ts`'s exports must be unaffected).

## Files

### Edit

- `frontend/src/hooks/useChapterPlayback.ts` (~276 lines)

### Do NOT edit

- `frontend/src/pages/Book/studio/useStudioChapter.ts` — INV-4. Its exports (`playbackQueue`, `playbackBlockStartIds`, `currentPlaybackBlockIndex`, `activePlaybackLabel`, `playSegment`, `startSkim`/`stopSkim`) must be unchanged in shape and behavior. `playSegment`'s exported signature (`(segmentId: string, fullQueue: string[]) => Promise<void>`) must not change — only its *internal* handling of `fullQueue` changes.
- `frontend/src/store/playerBus.ts` — no changes needed or wanted.

## Target shape / contract

### Reuse `getGroupSegmentIds` (~lines 206-221) — do not remove or duplicate its logic

This function is already the correct, single definition of "which segments belong to the same block as this one" — it checks `audioGroups` first, falls back to `chunkGroups`, and handles the case `getGroupSegmentIds` covers that the `onEnded` walk's `audio_file_path`-equality check does not (task 003's `AudioGroup`-based fixture documents the gap this closes).

### Queue normalization in `playSegment` (~lines 223-239)

Before building `playbackQueueRef.current`, map the incoming `fullQueue` (raw per-segment ids) down to one entry per block, using each block's **leader** (first) segment id. A block's membership is `getGroupSegmentIds(idx, fullQueue)` for the block containing `fullQueue[idx]`. Concretely: walk `fullQueue` once, and whenever you encounter a segment id not yet consumed by a prior block's membership set, emit it as a block-leader entry in the new normalized queue and mark the rest of its `getGroupSegmentIds(...)` membership as consumed (skip them — they're not separate queue entries anymore, they're part of the leader's block).

Then: find `segmentId`'s containing block leader (search `fullQueue` for the block whose membership set contains `segmentId`, then take that block's leader) and use the leader's index in the **normalized** queue as the starting index for `playFromIndex`.

### Delete the `onEnded` skip-ahead walk (~lines 112-124)

With a block-leader queue, `playFromIndex(idx+1, queue)` on `onEnded` already lands on the next distinct block — the "walk forward while `audio_file_path` matches" loop is now dead code. Delete it; `onEnded` becomes a direct `playFromIndex(idx + 1, queue)` call (still guarded by `if (!isPlayingRef.current) return`, unchanged).

### Fix `onPrev` — restart-current-block-first semantics (owner-confirmed decision)

Pressing Prev must **restart the current block** on first press; a second press **from the block's start** goes to the previous block. Since the queue only has one entry per block, "restart" means re-invoking `playFromIndex(idx, queue)` (replay the current index) rather than `playFromIndex(idx - 1, queue)`, UNLESS playback is already at/near the block's start — in which case go to `idx - 1`. Use the current segment's playback position within its block (available via `playerBusState.position`, already read elsewhere in this hook) compared against a small threshold (e.g. `< 1.0` second into the block) to decide "already at start → go to `idx - 1`" vs. "not at start → replay `idx`".

```typescript
onPrev: () => {
  if (!isPlayingRef.current) return;
  const atBlockStart = skimStateRef.current.position < 1.0; // tune threshold if needed
  const targetIdx = atBlockStart ? idx - 1 : idx;
  if (targetIdx >= 0) {
    playFromIndex(targetIdx, queue);
  }
},
```

(Adjust variable names to match the surrounding closure — `idx`/`queue` are the same values already captured by the existing `onPrev`/`onNext` closures in `playWithFallback`.)

### Fix `onNext` — now trivially correct

With the block-leader queue, the existing naive shape is already correct:

```typescript
onNext: () => {
  if (!isPlayingRef.current) return;
  const nextIdx = idx + 1;
  if (nextIdx < queue.length) {
    playFromIndex(nextIdx, queue);
  }
},
```

No helper function needed — this is unchanged from today's code, it's correct **because** the queue is now block-normalized, not because the logic itself changed.

### Fix `hasPrev`/`hasNext` (~lines 149-150)

Now trivially correct against the block-leader queue: `hasPrev: idx > 0`, `hasNext: idx < queue.length - 1` — no change needed to these lines themselves, they inherit correctness from the queue normalization.

### `onError`'s advance-on-failure (~line 146) and `getGroupSegmentIds` callers elsewhere in the file

Re-check every other caller of the old raw-segment queue assumption in this file (e.g. the pending-playback retry effect ~157-172, `getGroupSegmentIds` itself) still makes sense against a block-leader queue — `getGroupSegmentIds` is still called with the *original* `segments`/queue data (unchanged), only `playbackQueueRef.current` changes shape. Confirm `getGroupSegmentIds(idx, queue)` when `queue` is now block-leader-only still resolves correctly (it should, since it re-derives group membership from `segmentsRef`/`audioGroupsRef`/`chunkGroupsRef`, not from queue shape) — if it doesn't, that's a real finding to surface, not silently patch around.

## Steps

- [x] Read task 003's new tests in full — they define "current behavior" precisely.
- [x] Implement the block-leader queue normalization in `playSegment`.
- [x] Delete the `onEnded` walk; replace with direct `idx + 1`.
- [x] Implement restart-first `onPrev` using the position threshold.
- [x] Confirm `onNext`/`hasPrev`/`hasNext` need no further changes beyond inheriting queue correctness.
- [x] **R1 revert-check:** `git stash` this task's changes, run task 003's tests, confirm they pass (documenting old behavior) — this is expected since they were written for the pre-fix state. Then `git stash pop`, re-run, and confirm the NEW expected assertions (which you'll update in this same task, see below) now pass and the OLD "documents pre-fix behavior" assertions from task 003 that describe the bug now correctly fail (update those specific assertions in task 003's test file to reflect the fix, in this task, per testing-standards R1 — a bug-fix test must be shown red on the pre-fix code and green after).
- [x] Run the full `frontend/tests/unit/hooks/useChapterPlayback.test.tsx` suite — confirm nothing else regressed.
- [x] Verify INV-4: `useStudioChapter.ts` is untouched; `playSegment`'s exported signature is unchanged.
- [x] `npm -C frontend run build`/`lint`/`test -- --run` all green.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] From task 003's multi-segment-block fixture (both `audio_file_path`-based and `AudioGroup`-based), pressing simulated Next mid-block advances to the **next distinct block**, not a restart of the current one.
- [x] Pressing Prev from mid-block restarts the current block (first press); pressing Prev again from the block's start goes to the previous block.
- [x] `hasPrev`/`hasNext` correctly reflect block-queue position, not raw-segment position.
- [x] Task 003's characterization tests are updated in this same task to assert the corrected behavior, and are **R1 revert-checked**: stash this task's fix, confirm the updated assertions fail against pre-fix code, restore.
- [x] `useStudioChapter.ts` is not modified; `playSegment`'s exported call signature is unchanged (INV-4 holds).
- [x] Full `npm -C frontend run test -- --run` suite green, build/lint clean.

## Implementation notes (deviations flagged for reviewer)

- **Real finding surfaced per the file's own instruction (line 87 above):** `getGroupSegmentIds(idx, queue)`, when called with the *block-leader* queue (as `playFromIndex` did at its two original call sites, for `playingSegmentIds` highlighting and missing-audio detection), silently truncates to just the leader itself — `getGroupSegmentIds` filters *its `queue` argument* by group membership, and a block-leader queue no longer contains the other members. Fixed by capturing full per-block membership once in `buildBlockQueue` (into a `blockMembersRef: Map<leaderId, string[]>`) and having `playFromIndex` read from that map instead of re-deriving membership from the (now-reduced) `queue` parameter. `getGroupSegmentIds` itself is unchanged and still the single definition of block membership, used only inside `buildBlockQueue`.
- **`playSegment`'s toggle-pause guard resolves to the block leader early:** since a non-leader `segmentId` now starts playback at its block's leader, the existing `if (playingSegmentId === segmentId) togglePause()` guard was updated to compare against the resolved leader id instead of the raw requested id — otherwise re-clicking the same non-leader span would restart playback instead of toggling pause (playingSegmentId is always a leader id post-fix, so it would never equal a non-leader segmentId).
- **Two pre-existing tests outside the task's named scope needed updating as a direct, correct consequence of the fix** (not part of task 003's "characterization (pre-fix)" describe block, which was the only test scope named in this task's Steps):
  - `useChapterPlayback.test.tsx`: `'skips segments sharing the same audio file path'` → renamed to `'does not skip ahead past segments that merely share an audio_file_path outside any chunk/audio group'`. Its fixture passes `chunkGroups: []` and no `audioGroups`, so s1/s2 sharing an `audio_file_path` was previously caught only by the now-deleted `onEnded` raw-equality walk — an independent grouping signal from `getGroupSegmentIds`. Per this task's explicit instruction to delete that walk as "dead code," block membership is now defined solely by `getGroupSegmentIds` (chunkGroups/audioGroups); this test's scenario no longer counts as one block. **Flagging this for reviewer attention**: if segments can genuinely share a real rendered `audio_file_path` in production without being in the same frontend-computed chunkGroup/audioGroup (e.g. backend batching drifting from the frontend's `buildChunkGroups` heuristic), this is a real behavior change, not just a test-following exercise.
  - `useChapterPlayback.test.tsx`: `'plays a non-leader segment in a completed audio group using the group audio path'` → renamed to `'starts playback from the block leader when a non-leader segment in a completed audio group is requested'`; `playingSegmentId` expectation changed from `'s2'` (the exact non-leader id requested) to `'s1'` (its block leader) — the direct, intended consequence of "use the leader's index in the normalized queue as the starting index for `playFromIndex`" (line 42 above).
  - `CastToolSegmentPlaybackIntegration.test.tsx`'s single test was updated the same way as task 003's named scope (Next mid-block now lands on `'s3'`, a genuinely different clip, instead of restarting `'s2'`).
