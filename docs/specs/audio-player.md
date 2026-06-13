# Global Audio Player

```
spec_version: 1.0.0
status: target
created: 2026-06-13
sources:
  - plans/site_experience_north_star.md
  - plans/site_redesign_rollout/06_phase_r4_player_review.md
  - frontend/src/demo/stages/siteMockup/
  - frontend/src/demo/stages/siteMockupStage.tsx
  - frontend/src/pages/ChapterEditor/components/PlaybackControls.tsx
  - frontend/src/pages/ChapterEditor/components/ChapterHeader.tsx
  - frontend/src/hooks/useChapterPlayback.ts
```

> **TL;DR:** Audio in the redesigned app has exactly one owner — a `playerBus` store with a single `<audio>` element living in a full-window bottom `PlayerBar`. Every other surface (the Studio VCR, chapter rows, voice previews, Review follow-along) becomes a client that loads the bus and reads its state; nothing else creates audio. Loading a new source stops the old one. The bar is hidden when nothing is loaded — no false affordance.

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | 2026-06-13 | Initial target contract for the global single-owner audio player (Phase R4) |

---

## 1. Purpose

This spec is the **binding target contract** for the global audio player established by the site redesign: a single `playerBus` store, a single `<audio>` element inside a global `PlayerBar`, and the conversion of every existing ad-hoc player into a bus client.

**Implementation status: target — not yet built.** At the time of writing, `frontend/src/store/playerBus.ts` and `frontend/src/app/layout/PlayerBar.tsx` do not exist; the player bar lives only as a low-fidelity mock in the demo stage (`frontend/src/demo/stages/siteMockup/`, `siteMockupStage.tsx`). The audio surfaces that this spec consolidates still run today as independent players: the Studio VCR (`PlaybackControls.tsx` driven by `useChapterPlayback.ts`, which creates a `new Audio()` per segment), an inline `<audio controls>` in `ChapterHeader.tsx` and in the legacy `ChapterList.tsx` row, and the Voices preview/sample `<audio>` elements in `VariantEditor.tsx`.

Delivery is tracked in **`plans/site_redesign_rollout/06_phase_r4_player_review.md` (Phase R4)**. The canonical owner decisions behind this contract are in `plans/site_experience_north_star.md` ("The global player bar (U16)", the U16 waveform amendment, and decision Q6 — "player bar collapses when empty"; round-2 refinement: HIDDEN, not greyed).

Specs and code are jointly authoritative. When R4 lands, the implementation and this spec must agree; if they disagree, resolve the drift explicitly by changing one or the other in the same PR, and flip `status: target` → `status: active`.

Cross-reference: shell/route placement of the bar is governed by [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md).

---

## 2. Single-owner model

There MUST be exactly **one** owner of audio playback state for the whole app: the `playerBus` store (`frontend/src/store/playerBus.ts`). It exposes a `useSyncExternalStore`-based snapshot so consumers subscribe without prop-drilling, following the existing store pattern (`studioSocketBus.ts` / `live-jobs.ts`).

### 2.1 Bus state

The bus owns the complete audio state:

| Field | Type | Meaning |
|---|---|---|
| `scope` | `'segment' \| 'chapter' \| 'preview' \| null` | What kind of audio is loaded; `null` = nothing loaded (bar hidden) |
| `title` | `string` | Primary label of the loaded source (e.g. `"Ch 7 · Title"`, `"Speaker: text…"`, voice name) |
| `subtitle` | `string \| undefined` | Optional secondary label |
| `audioUrl` | `string \| null` | Source URL of the currently-loaded audio; `null` when nothing is loaded |
| `playing` | `boolean` | Whether the element is currently playing |
| `positionSec` | `number` | Current playhead position in seconds |
| `durationSec` | `number` | Total duration in seconds (from `loadedmetadata`) |
| `queue` | `{ hasPrev: boolean; hasNext: boolean }` | Whether prev/next are available *within the current scope* |
| `requestId` | `number` | Monotonic load token so the PlayerBar element can ignore stale loads |

### 2.2 Bus API

- `loadAndPlay({ scope, title, subtitle?, audioUrl, onEnded?, onPrev?, onNext?, onError? })` — load a new source and begin playback.
- `play()` / `pause()` — transport.
- `seek(seconds)` — move the playhead.
- `stop()` — clear state (`scope → null`, `audioUrl → null`); the bar hides.
- `reportTime(positionSec, durationSec)` — called *by the PlayerBar element* from `timeupdate` / `loadedmetadata`; consumers never call it.
- `notifyEnded()` — dispatched by the element on `ended`; the bus invokes the stored `onEnded` callback.
- `subscribe` / `getSnapshot` / `usePlayerBus()` — subscription surface. `getSnapshot` MUST return a cached object until state actually changes (no re-render storms).

### 2.3 Single-owner invariants

- **Exactly one `<audio>` element exists app-wide**, inside the PlayerBar. Recording-capture components (e.g. voice recording in `VariantEditor`) are the only exemption — capture is not playback.
- **Loading a new source stops the old one by construction.** Because only one element exists, `loadAndPlay` replacing `src` is the stop; there is no second stream to leak.
- The per-load callbacks (`onEnded` / `onPrev` / `onNext` / `onError`) are stored **per load** so the *adapter* owns queue semantics (segment sequencing, wav→mp3 retry). The bus only signals; it does not know what "next segment" means.
- No module other than `playerBus.ts` / `PlayerBar.tsx` may write playback state or own an audio element.

---

## 3. Player bar presentation

The `PlayerBar` (`frontend/src/app/layout/PlayerBar.tsx`) is rendered **once** in the app shell.

- **Full-window-width bottom dock**, below both the rail and the content column (it is *not* part of the rail). It spans the full window width in every rail state (full, collapsed, mobile).
- **Compact transport by default:** prev / play-pause / next / stop, a seek slider, `m:ss / m:ss` time, the title, and the scope chip — a single ~40px row.
- **Scope chip** shows what is loaded (`segment` / `chapter` / `preview`, presented as a human label like `"Chapter 7 · segment 14"`). It is the at-a-glance answer to "what am I hearing?" In v1 it displays the current scope; cycling/click-through behavior is reserved (see §5 and the R4 out-of-scope notes).
- **Hidden entirely when nothing is loaded** (`audioUrl === null`): the bar renders no visible chrome and removes the content inset — it is HIDDEN, not greyed out. This is deliberate (owner Q6, round-2 refinement): a disabled-looking bar is a false affordance.
- When visible, the content area gets bottom padding/inset so the bar never covers content.
- **Persists within a book while navigating:** moving between stages (Manuscript ↔ Studio ↔ Review …) keeps audio playing. The bar collapses to nothing only in surfaces with no audio context (Library, Settings) once `stop()` clears the bus.

---

## 4. Consumers become adapters

Every existing player converts into a thin **bus client**. The audio element and transport move to the PlayerBar; the consumer keeps only its domain logic and feeds the bus.

| Consumer | Today | Becomes |
|---|---|---|
| Studio VCR (`PlaybackControls.tsx` + `useChapterPlayback.ts`) | Creates `new Audio()` per segment; owns sequencing, wav→mp3 fallback, `onended`→next, skim, space-to-play | Keeps all sequencing/fallback/skim/highlight logic; calls `loadAndPlay({ scope:'segment', … })` and drives advance from the bus `onEnded` callback. The in-page VCR is removed; the PlayerBar is the transport. Public hook shape (`playSegment`, `stopPlayback`, `togglePause`, `seekTo`, `isPlaying`, `playingSegmentId`, …) is preserved. |
| Inline chapter player (`ChapterHeader.tsx`, legacy `ChapterList.tsx` `<audio controls>`) | Native `<audio>` on the chapter row/header | A play button that calls `loadAndPlay({ scope:'chapter', audioUrl:<chapter asset url>, title:'Ch N · Title' })`, reusing the exact asset `src`; the button reflects play/pause from `usePlayerBus()`. |
| Voice preview/sample (`VariantEditor.tsx` and Voices preview callsites) | `<audio>` elements per preview | `loadAndPlay({ scope:'preview', title:<voice name> })`. Only the playback path converts; **recording capture stays as-is** (capture is not playback). |

The conversion is complete when `grep -rn "<audio\|new Audio(" frontend/src` matches only `PlayerBar.tsx` and recording-capture components.

**Capability parity is binding:** no playback capability may vanish in the conversion. VCR transport (play/pause/stop/prev/next/seek/skim), playing-segment highlight, space-bar play, chapter-row playback, and voice preview/sample playback all survive — re-homed, not removed (R4-T3/T4/T8).

---

## 5. Waveform (future / not R4)

A user-toggleable **waveform strip** is a planned extension of the bar (owner U16 amendment): an Audacity-style strip that expands the bar's height when on, with the toggle state persisted as a user preference. The decided library is **wavesurfer.js** (decode + peak cache + seek-on-click).

Binding for R4: **reserve the height-expansion slot now, add no dependency.** The PlayerBar includes an empty `player-bar-expansion` slot div governed by a CSS height variable (CSS only), collapsed by default. The mock (`siteMockupStage.tsx` PlayerBar) shows the toggle and the expanded strip for layout reference.

**Status: future — explicitly out of scope for R4.** No `wavesurfer.js` dependency is added until the waveform feature is scheduled; the reserved slot exists only so the bar's geometry does not change when it lands.

---

## 6. Follow-along feed

The bus position is the data source for **Review's follow-along highlight**. Review's text panel highlights the currently-playing **section (§N)**, dims past sections, and auto-scrolls the current one into view.

Important timing constraint (investigated, binding): there is **no per-segment timestamp/offset into the assembled chapter WAV**. Follow-along therefore highlights by **currently-loaded segment scope** — Review plays audio through the same segment-sequenced playback as Studio (`scope:'segment'`), so the highlight = the playing segment's section. Intra-section (sub-position) highlight is impossible until per-WAV timing data exists on the backend; Review UI copy must state this, and re-render annotations attach to sections (§N), never to timestamps. This is **future backend work**, not a player concern.

Cross-reference: the Review stage contract and its follow-along/annotation/re-render responsibilities live in [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md) §3.2 (Review). Phase R4 (`06_phase_r4_player_review.md`, R4-T5–T7) is the delivery vehicle.

---

## 7. Cross-References

- Shell composition, where the bar mounts, and book-stage routing: [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md)
- Phase R4 delivery plan (playerBus, PlayerBar, adapters, Review): `plans/site_redesign_rollout/06_phase_r4_player_review.md`
- Owner decisions (U16 player bar, U16 waveform amendment, Q6 collapse-when-empty): `plans/site_experience_north_star.md`
- Chapter audio status / progress presentation that drives playback availability: [progress-presentation.md](progress-presentation.md)
- Job/queue state behind rendered audio: [queue-jobs.md](queue-jobs.md)
