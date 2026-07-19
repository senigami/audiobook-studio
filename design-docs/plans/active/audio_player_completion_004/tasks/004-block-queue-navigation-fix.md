Status: complete — 2026-07-10

# 004 — Normalize the playback queue to blocks; fix Prev/Next

Workload: B · DONE.

Fixed the real navigation bug (manual Next mid-block reloaded the current clip) by normalizing `useChapterPlayback.ts`'s playback queue to one entry per block (block-leader segment id, via `getGroupSegmentIds`) instead of raw per-segment ids — this makes the existing naive `idx±1` `onNext` logic correct as-is and lets `hasPrev`/`hasNext` inherit correctness for free. Deleted the now-dead `onEnded` audio_file_path-equality walk. Implemented restart-current-block-first `onPrev` semantics (owner-confirmed): first press restarts the block, a second press from the block's start goes to the previous block, using playback position vs. a 1.0s threshold. Rejected an alternative (patching `idx±1` with an adjacency helper instead of normalizing the queue) — verified it would still break for `AudioGroup`-based blocks. `useStudioChapter.ts` untouched; `playSegment`'s exported signature unchanged (INV-4 holds). Task 003's characterization tests updated in this same change and R1 revert-checked (fail on pre-fix code, pass after).

Real finding surfaced during implementation: `getGroupSegmentIds(idx, queue)` silently truncates membership when called against the new block-leader queue (it filters *its own* `queue` arg) — fixed via a `blockMembersRef: Map<leaderId, string[]>` captured once in `buildBlockQueue`, read by `playFromIndex` instead of re-deriving from the reduced queue.

Flagged for reviewer (kept for traceability, not re-flagging as new): one pre-existing test (`'skips segments sharing the same audio file path'`) changed meaning as a direct consequence of deleting the `onEnded` walk — block membership is now defined solely by `getGroupSegmentIds` (chunkGroups/audioGroups), so two segments sharing only a raw `audio_file_path` with no covering group no longer count as one block. If backend batching can genuinely produce that shape in production, it's a real behavior change worth the owner's attention, not just a test-following exercise.

See `status.json` for commit `0de95392`.
