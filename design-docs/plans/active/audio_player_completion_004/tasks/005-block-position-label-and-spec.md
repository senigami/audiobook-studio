Status: complete — 2026-07-10

# 005 — Passive block-position label + spec sync

Workload: B · Risk: `none` · Blocked-by: 004 · Blocks: none (Workload B done after this)

## Goal

Show a plain "Block N of M" passive label in the global `PlayerBar` while segment audio plays, using data the block-leader queue (task 004) already has. Then bump `design-docs/specs/audio-player.md` and log the change.

**Owner-confirmed decision (do not re-derive or ask again):** the label is **plain block count only** (e.g. `"Block 2 of 7"`) — not the richer speaker-labeled preview text (`activePlaybackLabel` in `useStudioChapter.ts`), which was explicitly rejected for this pass because it would require threading character/speaker data into `useChapterPlayback` as a new parameter — out of scope.

## Why it matters

`PlayerBar.tsx` already renders a `subtitle` field generically (no changes needed there) — the data for a block-position label already exists one layer up but is never passed down. This closes that gap with the smallest possible change.

## Map links

See `../01-map.md` — Parts: `useChapterPlayback.ts` (edited), `PlayerBar.tsx` (read-only, confirm it needs no change). Invariants: INV-4.

## Files

### Edit

- `frontend/src/hooks/useChapterPlayback.ts` — the `loadAndPlay` calls inside `playWithFallback` (~lines 108-151, exact line numbers shifted by task 004's edits — re-locate before editing).
- `design-docs/specs/audio-player.md` (currently `spec_version: 1.6.0`).
- `wiki/Changelog.md` (dated entry, per this repo's CLAUDE.md convention).

### Read (confirm, do not edit)

- `frontend/src/app/layout/PlayerBar.tsx:214` (or wherever it is after task 001's edits) — confirms `subtitle` is already rendered generically. If task 001 somehow moved/renamed this, re-verify before assuming zero changes are needed here.

## Target shape / contract

Using the block-leader queue from task 004 (index `idx`, length `queue.length`), pass a computed label as `subtitle` into each `loadAndPlay` call in `playWithFallback`:

```typescript
subtitle: `Block ${idx + 1} of ${queue.length}`,
```

Wire this alongside the existing `title: seg.text_content || ...` field in the same `loadAndPlay({...})` call object — no new function, no new prop threading beyond this one line, no changes to `useStudioChapter.ts` or `PlayerBar.tsx`.

### Spec update

Bump `design-docs/specs/audio-player.md`'s `spec_version` from `1.6.0` to `1.6.1` (patch — this documents an existing-behavior gap closing, not a new capability the player itself gained; if reviewing the spec's own versioning convention suggests otherwise, follow the spec's own stated rule). Add a changelog row describing: segment-scope playback now surfaces a passive `"Block N of M"` subtitle in the global bar (§3/§4.1, "where a passive label is useful, the title/subtitle area carries it").

### Changelog

Add a dated entry to `wiki/Changelog.md` per this repo's existing convention (read a recent entry there for the expected format/tone).

## Steps

- [x] Re-locate the `loadAndPlay` calls in `playWithFallback` after task 004's edits.
- [x] Add the `subtitle` field using the block-leader queue's `idx`/`queue.length`.
- [x] Bump `audio-player.md`'s spec_version + changelog row.
- [x] Add the `wiki/Changelog.md` entry.
- [x] `npm -C frontend run build`/`lint`/`test -- --run` all green.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

## Acceptance criteria

- [x] Playing a segment from the Cast tool shows `"Block N of M"` (or equivalent plain phrasing) as the bar's subtitle.
- [x] `PlayerBar.tsx` required zero changes (confirm via `git diff` showing no edits to that file in this task).
- [x] `audio-player.md` spec_version bumped with an accurate changelog row.
- [x] `wiki/Changelog.md` has a new dated entry.
- [x] Full frontend suite green — **1 pre-existing failure unrelated to this task**: `tests/unit/demo/styleguide.test.tsx` fails in isolation too (StyleguidePage.tsx principles-heading duplication assertion), touches neither `useChapterPlayback.ts` nor any file this task edited; not fixed here (out of scope / not introduced by this change). All other 218 files / 1816 tests passed.
- [ ] **Owner sign-off** (recorded in `../02-roadmap.md`'s Workload B checklist): correct block navigation + label visible in the running app. *(Not verifiable by an automated agent — left for the owner.)*
