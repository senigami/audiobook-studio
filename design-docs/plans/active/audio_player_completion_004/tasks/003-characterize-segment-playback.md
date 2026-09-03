Status: complete — 2026-07-10

# 003 — Characterize current segment-playback behavior (before touching it)

Workload: B · DONE. No production code changed by this task (by design).

Added characterization tests pinning down `useChapterPlayback.ts`'s pre-fix behavior in `frontend/tests/unit/hooks/useChapterPlayback.test.tsx` and a new `CastToolSegmentPlaybackIntegration.test.tsx`: (1) manual Next mid-block reloads the same clip instead of advancing (the bug, covering both `audio_file_path`-based and `AudioGroup`-based block fixtures — verified to behave differently); (2) `onEnded` auto-advance already walks correctly for `audio_file_path`-based blocks but not `AudioGroup`-based ones; (3) `hasPrev`/`hasNext` are naive per-segment `idx` checks, wrong at block boundaries; (4) no `subtitle` is ever set. Every assertion carries a "documents PRE-FIX behavior" comment. These tests are what task 004's fix is revert-checked against.

Deviation (R2, documented inline in the original task file, kept here for traceability): the manual-Next case extends the file's existing `playerBus` mock with an exact 1:1 pass-through of `notifyNext`/`notifyPrev` rather than unmocking mid-file; the fully-unmocked requirement is satisfied instead by the dedicated integration test.

See `status.json` for commit `51da0a1a`.
