# 03 — Reader frontend (player-piano)

> **Provisional pending Task 1.** Exact Book-tab player module confirmed by
> Task 1's findings.

## Sync engine (data → active group → intra-group %)

- `useChapterTiming(chapterId)` — fetches `GET …/chapters/{id}/timing`, returns
  `{ groups, audioDurationMs } | null` (null on 404 → reader shows an
  "unavailable" state, see fallback note below). **Revised post-implementation
  (2026-07-17 review fix):** no cross-mount cache. The "cache per chapter;
  invalidate on the same signal that currently invalidates the
  waveform/peaks after a render" plan above turned out to have no such
  signal to hook — the peaks sidecar itself has no cross-mount cache, it
  just refetches on every relevant dependency change. Caching this hook
  without a real invalidation signal let a re-rendered chapter's stale
  timing survive across mounts, bypassing the serving route's own
  `audio_generated_at` staleness check. The hook now always fetches fresh on
  mount, matching the peaks sidecar's actual (uncached) behavior.
- `useReaderSync(timing, playerBus)` — given the bus's position, computes:
  - `activeGroup` via **binary search** over `groups` on `start_ms` (groups
    tile gaplessly, so this is exact and O(log n)).
  - `groupProgress` = `(positionMs - active.start_ms) / active.duration_ms`,
    clamped `[0,1]` — this fraction drives the scroll/fade position.
  - `prev` / `next` group refs for the fade neighbours.
- **Player bus correction (Fable H1):** the bus is the app-global
  `frontend/src/store/playerBus.ts`, owned/driven by `app/layout/PlayerBar.tsx`
  — NOT a Book-tab-local player. Its `position`/`duration` are in **seconds**,
  and `seek(seconds)` — the sync engine converts to/from ms at its boundary
  rather than the bus changing units.
  - **Scope gating is mandatory, not optional:** the same global bus is also
    driven by Booth (`useBoothPlayback.ts`), ProjectDetail previews, and
    continuous book playback. `useReaderSync` MUST gate on
    `playerBus.scope === 'chapter' && playerBus.audioUrl === <this chapter's
    audio URL>` before treating bus position as relevant — otherwise the
    reader would track whatever unrelated audio happens to be playing
    elsewhere in the app. When the gate doesn't match, the reader shows an
    idle/not-playing state, not a stale position.
  - Task 1 confirms the exact bus field names (`scope`, `audioUrl` or
    equivalent) and whether the Book tab already establishes this scope when
    its chapter player is active, or whether the reader's mount needs to
    request it.

## ReaderView (the player-piano block)

- Shows a **small scoped window**, not the whole chapter: the active group as
  the focal block, with the immediate neighbours faint/partial for continuity.
- The active group animates into the **upper third** (not dead center),
  **fades in as it becomes active and fades out as it ends**, using Framer
  Motion (the repo already uses framer-motion — follow an existing
  fade/translate example). `groupProgress` drives the vertical position so the
  block eases upward/out as playback advances through it.
- User does **not** scroll. No scrollbar on the reading window. Position is
  entirely playback-driven.
- Respect `prefers-reduced-motion`: fall back to a simple cross-fade / instant
  swap (WCAG / repo a11y expectations).
- No non-speech marker rendering — per `01-timing-contract.md`, only groups
  with rendered speech audio ever appear in the sidecar today.

## Display-state escalation (embedded → full browser → OS fullscreen)

One `ReaderContainer` with three states; the sync engine + ReaderView are
identical across all three (only the container chrome/size changes):

1. **Embedded** — compact card inside the Book page, with an **expand** control.
2. **Expanded (full browser)** — a max-viewport overlay (fixed, top z-index)
   covering the app within the browser window, with a **fullscreen** control and
   a **close/restore** control. Not the OS fullscreen — just fills the browser.
3. **OS fullscreen** — `element.requestFullscreen()` on the container; `Esc`
   exits back to expanded. **Fable confirmed no existing fullscreen helper
   exists anywhere in `frontend/src`** — this is net-new code (a small
   `useFullscreen` hook), not a reuse of an existing pattern. Budget it as new
   work in Task 7, not a quick wire-up.

Entry points (all on the **Book tab**, `frontend/src/pages/Book/` — nowhere in
the chapter editor):
- A **link/button on the main Book page** opening the standalone reader (its own
  route under `frontend/src/app/` routing), sharing the global player bus
  scoped to this chapter.
- The embedded card in the Book view (state 1) as the inline entry.

## Bidirectional seek (click-to-jump)

- **Detail/list → audio + reader:** clicking a group anywhere in the Book
  tab's segment/group detail view calls `playerBus.seek(group.start_ms / 1000)`
  (seconds, per the bus's real unit). Because the reader derives everything
  from bus position, the reader jumps automatically — no separate reader-jump
  call needed. **Invariant: the bus position is the single source of truth**;
  audio, reader, and detail highlight are all pure functions of it.
- **Reader is display-driven, not interactive-scroll:** the reader reflects the
  bus; it does not let the user drag to seek (that stays with the transport /
  waveform). Clicking the active reader block MAY be a convenience seek-to-start
  of that group, but that's optional polish.

## No-timing fallback (Fable correction)

- The original draft said the reader "falls back to the char-count estimate."
  That estimate only exists in Booth's `useBoothPlayback.ts`, which is
  out-of-scope code the reader must not depend on. **Correct fallback: when
  `useChapterTiming` returns null (no sidecar, e.g. chapter rendered before
  this feature shipped), the reader shows an explicit "sync unavailable —
  re-render this chapter to enable read-along" state instead of text**, rather
  than inventing a second estimate implementation. Re-stitching regenerates the
  sidecar for free (§02).

## Chapter editor / Booth: explicitly untouched

- The chapter editor's Booth follow-along (`useBoothPlayback.ts`, estimate-based
  playing-segment highlight) is **out of scope** and stays as-is (owner
  decision). Do not add the reader there and do not change its highlight logic.
- Optional, deferred (NOT part of this plan): if we later want Booth's
  highlight to also use the real sidecar when present, that's a small
  follow-up reusing `useChapterTiming` — noted here only so it isn't forgotten.
