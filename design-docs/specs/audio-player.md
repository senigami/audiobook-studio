# Global Audio Player

```
spec_version: 1.6.8
status: active
created: 2026-06-13
updated: 2026-07-11
sources:
  - design-docs/plans/reference/site_experience_north_star.md
  - design-docs/plans/proposals/audio_player_scrubbing_waveform_proposal.md
  - design-docs/plans/active/audio_player_waveform_scrubber/
  - frontend/src/store/playerBus.ts
  - frontend/src/app/layout/PlayerBar.tsx
  - frontend/src/app/layout/WaveformStrip.tsx
  - frontend/src/demo/stages/siteMockup/   (reference implementation of the tape)
```

> **TL;DR:** Audio has exactly one owner — a `playerBus` store with a single `<audio>` element in a full-window bottom `PlayerBar`. Every other surface is a client that loads the bus and reads its state; nothing else creates audio. The bar is hidden unless audio is loaded, mounted once in the global shell, and persists across every route (§3). The player is **scope-agnostic**: there is no segment/chapter toggle — the scrub representation is decided by **clip duration**. A short clip shows an inline waveform; a long one shows a plain seek bar, and the far-right `AudioLines` toggle then opens an **expandable zoomed "tape"** (§5): a paged-or-moving, click/drag-scrubbable detail view with bounded zoom presets, a minimap, and a `m:ss` time ruler. Playback is *started* by content-owned play affordances (§4.1); the bar is transport for an already-loaded source.

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | 2026-06-13 | Initial target contract for the global single-owner audio player (Phase R4) |
| 1.1.0   | 2026-06-14 | R7 shipped: full VCR transport; `skip(deltaSeconds)`; Segment↔Chapter `altScope`/`switchScope` scope toggle; wavesurfer.js waveform strip; Review transport delegation; `status: target → active` |
| 1.2.0–1.4.0 | 2026-06-15 | U16 scope-driven waveform iterations (waveform inline for segment scope, bar for chapter; far-right representation override). Superseded by 1.6.0. |
| 1.5.0   | 2026-06-16 | Transport + toggle icons standardized on `lucide-react`; mock PlayerBar migrated off glyphs. Canonical control→icon mapping owned by `design-system.md` §9. |
| 1.5.1   | 2026-06-16 | Visibility/persistence contract clarified (§3): keys solely on `audioUrl !== null`, mounted once in the global `AppShell`, persists across **all** routes. Added §4.1 (content-owned play affordances). |
| 1.6.0   | 2026-06-16 | **Scope-agnostic player + scrubbing-waveform tape (§3, §5).** Removed the segment/chapter scope toggle entirely (`altScope`/`switchScope` retired from the bus): representation is now **duration-driven**, not scope-driven, and time is the loaded clip's position/duration. The `AudioLines` toggle, in bar mode, opens an **expandable tape** — paged (default) or moving motion, click+drag scrub, bounded discrete zoom presets (cover-slider style: 8/15/30/60/120 s), a whole-clip minimap, and a smart `m:ss` ruler. Peaks are **browser-decoded below a duration cap, server-sidecar above it** (§5.4; a `data-model.md` change). Annotation is post-V2. Reference implementation: the North-Star mock; live port tracked by `design-docs/plans/active/audio_player_waveform_scrubber/`. |
| 1.6.2   | 2026-07-10 | **Tape + scope-agnostic representation shipped live (§1, §5.4).** The live `PlayerBar` now renders the expandable tape (`WaveformTape`/`WaveformTapeZoom`/`WaveformTapeMinimap`) — plan `design-docs/plans/active/audio_player_completion_004/` closed out the remaining port work. §5.4 corrected: peaks above the duration cap are computed **lazily on first request** by the chapter-asset serving route (`GET .../assets/peaks`), not emitted eagerly at production time by synthesis/assembly — that chokepoint was found to miss this app's default-engine render path entirely. Removed the "long windows use virtualized rendering" line — verified false premise (the tape's fixed-grid sampler and the minimap sampler are already O(visible-bars) regardless of total peak-array length; no windowing is needed or implemented). |
| 1.6.3   | 2026-07-10 | **Peaks sidecar density raised 8→60 peaks/sec (§5.4).** Fixed the tightest-zoom "low resolution" complaint: at 8/sec the 3 s zoom preset only had ~24 real samples to stretch across the tape's 180-bar render budget; at 60/sec it has 180, one real sample per bar. `PEAKS_PER_SEC`/`SIDECAR_VERSION` (1→2) in `app/engines/audio_ops.py`; the version bump makes already-cached low-density sidecars auto-recompute via the existing loader staleness check — no separate migration needed. Confirmed the max-abs-per-bucket aggregation (not RMS/mean) was already correct on both the sidecar and browser-decode paths; density, not algorithm, was the bottleneck. |
| 1.6.1   | 2026-07-10 | Segment-scope playback (`useChapterPlayback.ts`) now sets a plain passive `subtitle` — `"Block N of M"` — on every `loadAndPlay` call, using the block-leader queue index/length the block-queue navigation fix (task 004) already computes. Closes the gap where `PlayerBar`'s generic subtitle rendering (§3) had no data feeding it during segment playback. No PlayerBar changes; richer speaker-labeled text was considered and explicitly deferred (would require threading character/speaker data into the hook). |
| 1.6.4   | 2026-07-10 | **Tape bar count (visual resolution) now scales with the zoom window, not a fixed 180 (§5.3).** Owner report: widening the zoom showed the *same* blocky bar count even though far more real peak detail was available in the wider window (e.g. 7200 real peaks at 120s vs. 180 at 3s, both rendered as 180 bars) — the fixed `TAPE_BAR_COUNT` constant discarded exactly the extra detail a wider zoom exposes. `computeTapeBarCount` (`WaveformTape.tsx`) now grows the rendered bar count toward one real peak per bar as `windowSec` widens, capped by the tape canvas's actual measured pixel width (`containerWidthPx / MIN_SLOT_PX`, floor 2px per bar+gap — never sub-pixel/aliased bars) and a hard ceiling (900) for render cost. Falls back to the old fixed 180 whenever the container width isn't measured yet (first paint, and every jsdom test, which never lays out real pixel widths) — verified live: 180 bars at the 3s preset (unchanged parity) vs. 640 bars at the 120s preset on a 1280px-wide canvas (real chapter, 231s duration). Aggregation stays max-abs-per-bucket and every bar still nearest-neighbor-samples a real peak value — no interpolation, no invented detail — so §5.2's "never fabricate detail" invariant is unaffected; only the lossiness of the existing downsampling changes. |
| 1.6.5   | 2026-07-10 | **Paged-mode playhead jump fixed; minimap bar count now scales like the tape canvas (§5.2, §5.3).** (1) Owner report: the paged-mode playhead visibly stepped instead of gliding, while moving mode was smooth. Root cause (`WaveformTape.tsx`): `position` — the sole input to both modes' playhead x — was updated via a `timeupdate` listener (browsers fire it ~4Hz) in paged mode but via a 60Hz `requestAnimationFrame` loop in moving mode; moving mode's fixed-center playhead only needed to look smooth as the *waveform* scrolled under it; paged mode's *playhead line itself* moves across a static waveform, so the same 4Hz cadence read as a visible jump. Fix: the rAF loop now drives `position` unconditionally in both modes — verified live by sampling the rendered `<line x1>` every animation frame during real playback: paged mode now advances by a small (~1px) delta every ~8-9ms frame, matching moving mode's per-frame cadence (previously that comment split the loop by `effectiveMode !== 'moving'`; the branch is removed). (2) `WaveformTapeMinimap.tsx`'s `MINIMAP_BARS` was a fixed constant (200) for the whole-clip strip, same class of bug as 1.6.4's tape-canvas fix — max-abs-per-bucket compression was thrown away regardless of how many real peaks or container pixels were available. Now reuses `computeTapeBarCount` (moved to `waveformTapeZoomPresets.ts` to avoid a `WaveformTapeMinimap → WaveformTape → WaveformTapeMinimap` import cycle) with `windowSec = duration` (the minimap's "window" is the whole clip), floored at the old 200-bar minimum. Verified live on a real 70s chapter at a 1059px-wide container: bar count went from the old fixed 200 to 529 (`floor(1059 / MIN_SLOT_PX(2))`), i.e. pixel-width-bound rather than arbitrarily capped. Same "never fabricate" invariant (§5.2): still max-abs-per-bucket, still nearest-real-sample per bar. |
| 1.6.6   | 2026-07-10 | **Zoom level, motion mode, and tape open/closed state now persist across a track change (§5.2).** Owner report: opening the tape, picking a zoom level and a motion mode, then playing a different track ought to "stay in the same view" instead of resetting. Root cause (`PlayerBar.tsx`): a single `useEffect` keyed on `requestId` (bumped on every new source) reset `windowSec`→30, `tapeMode`→`'paged'`, and `tapeOpen`→`false` on every track change, alongside the (correctly reset) `forceWave` representation override. Fix: `windowSec`/`tapeMode`/`tapeOpen` were removed from that reset — they are session-scoped preferences that now carry over in-memory for the lifetime of the mounted `PlayerBar` (not persisted to `localStorage`/`sessionStorage`; this repo has no existing sessionStorage convention and a full-reload requirement wasn't part of the ask). Contradicts the superseded "zoom resets to the default on each new source" line in 1.6.0/§5.2, now corrected. `viewStart` (the track-relative scroll position) is deliberately **not** persisted — it is recomputed from the new track's own playhead/duration each time, since an absolute position from one clip doesn't map meaningfully onto a differently-sized one. Verified live (Voice Lab preview queue): opened the tape on a 27s clip, zoomed to the 5s preset and switched motion to "moving," then played a different (35s) preview — the tape stayed open at the same 5s zoom and moving mode. Regression test added: `frontend/tests/unit/app/layout/PlayerBar.test.tsx` › "keeps the zoom level and motion mode set on one track after switching to a different track" (R1 revert-checked: fails on pre-fix code with the tape closing and zoom/mode resetting). |
| 1.6.7   | 2026-07-10 | **Play/Pause no longer flickers the tape; `PlayerBar` docks instead of overlaying content (§3, §5.6).** Two owner-reported bugs, same session. (1) Clicking Play with the tape open visibly "jumped like it's quickly closing and reopening." Root cause (`PlayerBar.tsx`): one combined `useEffect` keyed on `[audioUrl, playing, requestId]` guarded a `.src` reassignment with `audio.src !== audioUrl` — `audio.src` is always a browser-resolved *absolute* URL while `audioUrl` is the bus's relative, unencoded path, so the two are never equal and the guard failed open on every run, including runs triggered by `playing` alone. Reassigning `.src` aborts/reloads the media element, briefly resetting `duration` to 0/NaN, which flipped duration-derived `tapeAvailable`/`showWave` false-then-true and remounted `.player-tape-region`, replaying its mount animation. Fixed by splitting into two effects (new binding rule, §5.6): a source-load effect keyed only on `[audioUrl, requestId]`, and a play/pause effect that never touches `.src`. Verified live (Voices preview): `<audio>.currentTime` now resumes from its paused value (22.2s → 25.2s) on Play instead of resetting; confirmed via a native `HTMLMediaElement.prototype.src` setter spy that the setter fires zero times across a Play→Pause→Play toggle. Regression test added (R1 revert-checked: fails on pre-fix code, 2 unwanted `src` reassignments). (2) `PlayerBar` covered page content instead of pushing it up — reported specifically with the tape open, covering unrelated cards/buttons underneath and making them unclickable. Root cause (`AppShell.tsx` + `player.css`): `.player-bar` was `position: fixed`, and the content `<main>` had a hardcoded `padding-bottom: calc(3rem + 56px)` guessing only the *collapsed* bar's height — never recomputed for the tape's much taller open state. Fixed by docking `PlayerBar` as a real flex sibling of the shell's content row (`position: relative`, `flex-shrink: 0`) inside `AppShell`'s column layout, removing the hardcoded padding entirely; `.shell-grid`'s existing `flex: 1 1 auto; min-height: 0` now shrinks automatically whenever `PlayerBar` grows, and the content column's own `overflow-y: auto` keeps it scrollable. Verified live at desktop and mobile (375px) viewports, tape open and closed: scrolling the content column reveals every card fully, with all buttons clickable, never covered by the bar. |
| 1.6.8   | 2026-07-11 | **Peaks sidecar now emitted proactively at chapter render finalization (§5.4).** Previously the sidecar was lazy-only — computed on first `GET .../assets/peaks` request — so the first open of a freshly rendered long chapter (> the 600 s browser-decode cap) paid the ffmpeg-decode latency before the tape appeared. The orchestrator now writes the sidecar at the single engine-agnostic completion point in `TaskOrchestrator.submit()` (`_emit_chapter_peaks_sidecar`, gated on `task_type == "synthesis"` and reconciliation `scope == "chapter"`), covering BOTH the XTTS remote path and the local `mixed` path without any engine-id branch — addressing the earlier 1.6.2 concern that "a production-time hook missed the default-engine render path" by hooking the orchestrator's universal finalize rather than an engine-specific handler. The compute + cache format is now a **single shared implementation** (`ensure_peaks_sidecar` in `app/engines/audio_ops.py`), reused by both the render hook and the GET route (the route retains its per-WAV-path lock + lock-free fresh fast path; behavior unchanged). The hook is **best-effort/non-blocking** (never delays or fails a render; failures logged and swallowed), fires only for the canonical chapter WAV (never segment re-renders or the assembly m4b), and does **not** backfill existing chapters — the lazy GET route remains the fallback for the back-catalog and any render whose proactive emission failed. Tests: `tests/orchestration/test_peaks_emission_on_finalize.py` (R1 revert-checked: the emit-on-finalize test fails on pre-hook code — no `.peaks.json` written). |

---

## 1. Purpose

This spec is the **binding contract** for the global audio player: a single `playerBus` store, a single `<audio>` element inside a global `PlayerBar`, and the conversion of every ad-hoc player into a bus client.

**Implementation status.** The single-owner model, transport, collapse-when-empty, global persistence, Review delegation, content-owned play affordances, the scope-agnostic representation, and the expandable tape (§3, §5 — including the duration-cap-gated peaks sidecar, §5.4) are all **shipped live**, ported from the North-Star mock reference implementation (`frontend/src/demo/stages/siteMockup/`) by `design-docs/plans/active/audio_player_waveform_scrubber/` (Workloads 0–2) and `design-docs/plans/active/audio_player_completion_004/` (remaining W2 port + W3 peaks sidecar + the segment/block-navigation fix, §6 excepted). Segment-aware **intra-section** follow-along timing (§6) remains explicitly future backend work — see §6.

Specs and code are jointly authoritative. If they disagree, resolve the drift explicitly by changing one or the other, and note it in the changelog.

**Icons (binding):** all controls render as `lucide-react` components — `SkipBack` · `Rewind` · `Play`/`Pause` · `FastForward` · `SkipForward` for transport, `Square` for stop, `AudioLines` for the waveform/tape toggle, `Waves`/`GalleryHorizontalEnd` for the tape motion toggle — never Unicode media glyphs. The canonical control→icon mapping is owned by [design-system.md](design-system.md) §9 Iconography.

Cross-reference: shell/route placement of the bar is governed by [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md).

---

## 2. Single-owner model

There MUST be exactly **one** owner of audio playback state for the whole app: the `playerBus` store (`frontend/src/store/playerBus.ts`). It exposes a `useSyncExternalStore`-based snapshot so consumers subscribe without prop-drilling.

### 2.1 Bus state

| Field | Type | Meaning |
|---|---|---|
| `scope` | `'segment' \| 'chapter' \| 'preview' \| null` | **Informational** kind-of-audio label used by adapters for sequencing semantics and titling; `null` = nothing loaded (bar hidden). It MUST NOT drive scrub representation or any user toggle (that is duration-driven — §5). |
| `title` | `string` | Primary label of the loaded source |
| `subtitle` | `string \| undefined` | Optional secondary label |
| `audioUrl` | `string \| null` | Source URL of the currently-loaded audio; `null` when nothing is loaded |
| `playing` | `boolean` | Whether the element is currently playing |
| `position` | `number` | Current playhead position in seconds |
| `duration` | `number` | Total duration in seconds (from `loadedmetadata`) |
| `queue` | `{ hasPrev: boolean; hasNext: boolean }` | Whether prev/next are available within the current sequence |
| `requestId` | `number` | Monotonic load token so the PlayerBar element can ignore stale loads |
| `seekRequestId` | `number` | Monotonic seek token so the seek effect fires without conflicting with `timeupdate` reporting |

The `altScope` field and the `switchScope()` toggle of earlier versions are **removed** (1.6.0): the player no longer offers switching between a segment and chapter rendering of the same content. A surface that wants chapter-level playback simply loads chapter audio; one that wants a segment loads the segment.

### 2.2 Bus API

- `loadAndPlay({ scope, title, subtitle?, audioUrl, onEnded?, onPrev?, onNext?, onError?, hasPrev?, hasNext? })` — load a new source and begin playback.
- `play()` / `pause()` — transport.
- `seek(seconds)` — move the playhead; increments `seekRequestId`.
- `skip(deltaSeconds)` — `seek(clamp(position + delta, 0, duration))`; skim-back/forward.
- `stop()` — clear state (`audioUrl → null`); the bar hides.
- `reportTime(position, duration)` — called *by the PlayerBar element* from `timeupdate` / `loadedmetadata`; consumers never call it.
- `notifyEnded()` / `notifyError()` / `notifyPrev()` / `notifyNext()` — dispatched by the element; the bus invokes the stored per-load callbacks.
- `subscribe` / `getSnapshot` / `usePlayerBus()` — subscription surface. `getSnapshot` MUST return a cached object until state actually changes.

### 2.3 Single-owner invariants

- **Exactly one `<audio>` element exists app-wide**, inside the PlayerBar. Recording-capture components (e.g. `VariantEditor`) are the only exemption — capture is not playback.
- **Loading a new source stops the old one by construction.** Only one element exists, so `loadAndPlay` replacing `src` is the stop.
- Per-load callbacks (`onEnded`/`onPrev`/`onNext`/`onError`) are stored **per load** so the *adapter* owns queue semantics (segment/chapter sequencing, wav→mp3 retry). The bus only signals.
- No module other than `playerBus.ts` / `PlayerBar.tsx` may write playback state or own an audio element. The conversion is complete when `grep -rn "<audio\|new Audio(" frontend/src` matches only `PlayerBar.tsx` and recording-capture components.

---

## 3. Player bar presentation

The `PlayerBar` (`frontend/src/app/layout/PlayerBar.tsx`) is rendered **once** in the global app shell.

- **Full-window-width bottom dock**, below both the rail and the content column. It spans the full window width in every rail state.
- **VCR transport row:** prev · skim-back (−10 s) · play/pause · skim-fwd (+10 s) · next · stop (secondary, smaller). All `aria-label`-ed; prev/next disabled from `queue.hasPrev/hasNext`.
- **No scope toggle.** There is no segment/chapter switch. Where a passive label is useful, the title/subtitle area carries it; it is not interactive.
- **Scrub representation is DURATION-driven (scope-agnostic):**
  - **Short clip** → the scrub track *is* an inline waveform (the seek surface). "Short" is decided by fit — the whole clip renders legibly at the current bar width (legibility floor ≈ 3 px/sec; bootstrap threshold ≈ a clip that fits, ~≤ 30 s before bar width is known).
  - **Long clip** → a *plain seek slider*; the `AudioLines` toggle opens the expandable tape (§5).
  - A far-right **`AudioLines` toggle** overrides representation: in waveform mode it flips to a plain bar; in bar mode it opens/closes the **tape**. The override (`forceWave` / tape-open state) is session-only and resets to the duration default on each new source (`requestId`).
- **Time** (`m:ss / m:ss`) is the loaded clip's `position / duration` — scope-agnostic (no segment-relative special-casing).
- **Visibility keys SOLELY on playback state, never on the route/screen.** Shown iff `audioUrl !== null`; when nothing is loaded it renders no chrome and removes the content inset (owner Q6). It MUST NOT be shown/hidden based on which page is active.
- **Persists across all navigation.** Mounted **once** in the global `AppShell` (`frontend/src/app/layout/AppShell.tsx`), outside the router outlet, so moving between *any* pages keeps audio playing. It collapses only once `stop()` clears the bus.
- **Docked, not overlaid (1.6.7).** `PlayerBar` is a normal-flow flex sibling of the shell's content row inside `AppShell`'s column layout (`position: relative`, `flex-shrink: 0` — see `.player-bar` in `player.css`), not a `position: fixed` element floating on top of the page. The content row above it (`.shell-grid`, `flex: 1 1 auto; min-height: 0`) shrinks to make room whenever `PlayerBar` grows — including the tape (§5) opening, which is far taller than the collapsed bar — and the content column's own `overflow-y: auto` keeps it scrollable within whatever space remains. This replaces a prior fixed-overlay implementation whose content-area padding was a hardcoded guess at the bar's *collapsed* height only; opening the tape (or any state that made the bar taller) covered content underneath with no way to reach it. There must be no code path that reintroduces a fixed/absolute `PlayerBar` with a hardcoded content-padding offset — the docked-flex mechanism is the binding shape.

---

## 4. Consumers become adapters

Every existing player converts into a thin **bus client**. The audio element and transport move to the PlayerBar; the consumer keeps only its domain logic and feeds the bus.

| Consumer | Today | Becomes |
|---|---|---|
| Studio VCR (`PlaybackControls.tsx` + `useChapterPlayback.ts`) | `new Audio()` per segment; owns sequencing, wav→mp3 fallback, `onended`→next, skim, space-to-play | Keeps sequencing/fallback/skim/highlight; calls `loadAndPlay({ scope:'segment', … })`, drives advance from the bus `onEnded`. The in-page VCR is removed; the PlayerBar is the transport. Public hook shape preserved. |
| Inline chapter player (`ChapterHeader.tsx`, legacy `ChapterList.tsx`) | Native `<audio>` on the row/header | A play button that calls `loadAndPlay({ scope:'chapter', audioUrl, title:'Ch N · Title' })`, reflecting play/pause from `usePlayerBus()`. |
| Voice preview/sample (`VariantEditor.tsx`, Voices callsites) | `<audio>` per preview | `loadAndPlay({ scope:'preview', … })`. Recording capture stays as-is. |
| Review follow-along panel (`FollowAlongPanel.tsx`) | Owned its own transport | Text-tracking + re-render surface only; transport is the global `PlayerBar`. Keeps the chapter label, segment indicator, "Regenerate Segment" + states, a **play** affordance (§4.1), and tap-to-seek. |

**Capability parity is binding:** no playback capability may vanish. VCR transport, playing-segment highlight, space-bar play, chapter-row playback, and preview/sample playback all survive — re-homed, not removed.

### 4.1 Starting playback — content-owned play affordances

The bar is **transport for an already-loaded source**, and it is hidden when nothing is loaded (§3). So the bar can never *start* playback from cold. **Every surface that can originate audio MUST expose its own play affordance** that calls `loadAndPlay`; pressing it loads the bus (which reveals the bar and begins playback).

| Surface | Play affordance | Loads as |
|---|---|---|
| Library / book card | hover ▶ on the cover / resume | the book (chapters sequenced) |
| Chapter row or chapter view | ▶ the chapter | `scope: 'chapter'` |
| Studio (chapter editor) | ▶ play chapter + per-segment ▶ | `scope: 'chapter'` / `'segment'`, sequenced |
| Review (follow-along) | ▶ play chapter + tap a section to play from there | `scope: 'chapter'`/`'segment'`, `seek()` on tap |
| Voices / Voice Lab | preview / sample / test | `scope: 'preview'` |
| Whole book | "Play book" — end to end | book playback (chapters sequenced via `onEnded`) |

- A surface that delegates *ongoing* transport to the bar (e.g. Review) MUST still keep a **start** affordance.
- "Play the book in its entirety" is a first-class entry point; the adapter sequences chapters on the bus `onEnded`.

---

## 5. Scrubbing-waveform tape (duration-adaptive)

The detail/annotation surface for long audio. Design source: `design-docs/plans/proposals/audio_player_scrubbing_waveform_proposal.md`. Reference implementation: the North-Star mock (`MockWaveTape` + `MockTapeControls`).

### 5.1 Inline scrub vs. tape

- The inline scrub track is a **waveform when the whole clip fits legibly** at the current bar width, else a **plain bar** (§3). Decision is **duration-driven, scope-blind**.
- When the inline track is a bar, the far-right **`AudioLines` toggle opens the tape**, which **grows the bar upward** (a taller region above the control row, inside the bar's own footprint — not a floating sheet, not a second audio owner). Closing returns the bar to one row.

### 5.2 Tape interaction

- **Motion — paged by default, moving optional.** *Paged*: the playhead sweeps the window and the window advances one page at the edge (no continuous scroll). *Moving* (opt-in via a footer toggle): the playhead is **fixed at center** and the waveform slides past it. **`prefers-reduced-motion` forces paged** (the moving mode is suppressed) — paged has no continuous motion to violate the setting.
- **Click-to-jump** anywhere on the tape → `seek()`. **Drag-to-scrub** — drag the waveform under the playhead.
- **Minimap** — a thin full-clip strip with a translucent draggable window rectangle whose width reflects the current zoom span. Because the tape never shows the whole clip, the minimap is the whole-clip navigation surface; dragging it is coarse navigation.
- **Zoom — bounded discrete presets** styled as the Library cover-size slider (track + tick dots + accent thumb, **no second-labels**): seconds-of-audio across the viewport `8 / 15 / 30 / 60 / 120` (default 30). Pinch/scroll-wheel-over-tape snaps through presets; the slider is the explicit control. **Zoom-in caps at the available peak resolution** (never fabricate detail); **zoom-out caps before a featureless blob** and never the whole clip (the minimap owns that). **Zoom level, motion mode, and tape open/closed state are session-scoped and persist across a track change** (1.6.6) — they carry over from whatever the user last set for the lifetime of the `PlayerBar` (in-memory, not `localStorage`/`sessionStorage`; does not survive a full page reload). Only the **view position** (`viewStart`) is track-relative and is recomputed fresh from the new track's playhead — it is never meaningful to carry an absolute position across tracks of different length. The scope-blind representation override (`forceWave`, waveform↔bar) still resets per track, since it exists to re-fit the *current* clip's duration.
- **Time ruler** — a row under the tape with `m:ss` tick markers at an **interval chosen intelligently from the zoom level** (≈3 ticks across the viewport: e.g. 2 s ticks at 8 s zoom, 30 s ticks at 120 s zoom), labelling where the user is currently viewing.
- **Contrast on glass** — the playhead line and minimap rectangle use a solid accent, never glass-on-glass tint. Hit/scrub targets are generous.

### 5.3 Rendering — fixed-grid sampling (binding)

The tape renders bars by sampling the peak data on a **fixed absolute-time grid** (`gridSec = windowSec / barCount`), snapping the window's left edge to that grid and translating the bar row by the sub-bar remainder. Samples MUST NOT be anchored to the moving window (i.e. "bar *i* = sample at `viewStart + i/N·windowSec`"): that re-samples a shifting point every frame and makes the waveform crawl/shimmer. Grid-anchored samples are stable per time-bucket, so the shape holds still in paged mode and slides seamlessly in moving mode. (Discovered in the mock; see the proposal.)

`barCount` is **not** a fixed constant — it scales with the active zoom window (`computeTapeBarCount` in `WaveformTape.tsx`, 1.6.4): it grows toward one real peak per bar as `windowSec` widens (more real detail becomes available), capped by the tape canvas's measured pixel width (never rendering a bar+gap slot below 2px — sub-pixel bars alias rather than read as detail) and a hard ceiling for render cost. It falls back to the historical fixed value (180, `TAPE_BAR_COUNT`) whenever the container's pixel width isn't measured yet (first paint, and test environments that never lay out real pixel widths). Every bar still nearest-neighbor-samples a real peak value regardless of `barCount` — this only changes how finely the real peak array is bucketed, never what value a bar shows, so it does not touch the "never fabricate detail" invariant (§5.2).

### 5.4 Peaks data — browser-first, server sidecar later

The tape renders from a **peak array**; where the array comes from is keyed on **duration**, not scope:

- **At or below `TAPE_DURATION_CAP_SEC` (600 s, tunable in `PlayerBar.tsx`):** decode in the browser (Web Audio → downsample to peaks). Zero backend.
- **Above the cap:** browser decode is infeasible (an hour WAV is ~150–300 MB on the wire and ~600 MB decoded PCM/channel — download + memory, not CPU). A **peaks sidecar** — a self-describing, versioned JSON file, `data-model.md`'s "Chapter peaks sidecar" — is served as a sibling of the WAV, re-validated (never served stale) against the WAV's live file stat on every request. The sidecar is produced by **two paths that share one implementation** (`ensure_peaks_sidecar` in `app/engines/audio_ops.py` — the single owner of the cache format's freshness check + atomic write): **(1) proactively at chapter render finalization** — the orchestrator emits it at the single engine-agnostic completion point in `TaskOrchestrator.submit()` (`task_type == "synthesis"`, reconciliation `scope == "chapter"`), which covers BOTH the XTTS remote path and the local `mixed` path without branching on engine id, so a freshly rendered long chapter shows its tape on first open with no compute-on-request latency; and **(2) lazily on first request** by the chapter-asset serving route (`GET /api/projects/{project_id}/chapters/{chapter_id}/assets/peaks?filename=<wav>`) — the fallback that still covers the whole back-catalog, any producer the render hook doesn't pass through, and any render whose proactive emission failed. The render-time hook is **best-effort and non-blocking**: it never delays or fails a render (any compute failure is logged and swallowed), and it does **not** backfill existing chapters. It fires only for the canonical chapter WAV — never segment re-renders (scope `"job"`) nor the book-level assembly m4b (a different `task_type`). Missing/stale/failed → 404, the frontend falls back to browser-decode-or-plain-bar exactly as if the cap were unlifted. No windowed/virtualized rendering is needed: the tape's fixed-grid sampler and the minimap sampler already do O(visible-bars) work per frame regardless of total peak-array length.
- **Sidecar density: 60 peaks/sec** (`PEAKS_PER_SEC` in `app/engines/audio_ops.py`, bumped from an initial 8/sec). At 8/sec, the tightest zoom preset (3 s window, added alongside this change) only had ~24 real samples to nearest-neighbor-stretch across the tape's 180-bar render budget (`TAPE_BAR_COUNT`) — most bars duplicated a neighbor's height instead of showing real detail, reading as "low resolution" even at full zoom. 60/sec gives 180 real samples at the 3 s window, one real sample per rendered bar. Peaks remain **max-abs-per-bucket** (not RMS/mean, which would flatten the waveform's characteristic sharp shape) on both the sidecar (`compute_peaks_sidecar`) and the browser-decode path (`downsampleToPeaks` in `WaveformTape.tsx`) — the density was the only bottleneck, not the aggregation function. Cost: a ~15 min chapter sidecar grows from ~8k peaks (~43 KB JSON) to ~54k peaks (~325 KB JSON) — still one small cached artifact fetched once per chapter open. `SIDECAR_VERSION` was bumped (1→2) alongside the density change; the loader's version check (`_load_or_compute_peaks_sidecar`) treats any mismatch as stale and recomputes, so previously-cached low-density sidecars are transparently replaced on next fetch rather than served stale forever.
- The peak **source** is swappable behind one seam: *if a sidecar exists for the URL, render from it; else browser-decode.* The tape UI is identical either way — adding the sidecar is a source swap, not a rebuild (`usePeaks`'s `suppliedPeaks` parameter, `WaveformTape.tsx`).
- The sidecar's resolution sets the tape's **zoom-in cap** (§5.2).

### 5.5 Annotation — post-V2

Marking edit points on the tape is **out of scope for V2**. An *actionable* chapter-scope mark needs timestamp→segment mapping the backend lacks (§6); rather than ship visual-only bookmarks, the whole annotation workflow is deferred. This spec covers display + navigation only.

### 5.6 Source-load vs. play/pause are separate effects (binding)

`PlayerBar.tsx` MUST NOT reassign the `<audio>` element's `.src` from an effect keyed (even partially) on `playing`. `audio.src` is a DOM getter that always returns a browser-**resolved absolute** URL, while `audioUrl` from the bus is frequently a relative, unencoded path (e.g. `/out/voices/Dark Fantasy/Default/sample.mp3`) — the two strings are structurally never equal, so a guard like `if (audio.src !== audioUrl) audio.src = audioUrl` fails open on every run of the effect it lives in. If that effect's dependency array includes `playing`, every Play/Pause click reassigns `.src`, which aborts and reloads the media element (`currentTime`/`duration` momentarily reset to 0/NaN) — visible live as the tape flickering closed-then-open on every Play click, since `tapeAvailable`/`showWave` are duration-derived. The source load and the play/pause drive MUST be two separate effects: one keyed only on the track identity (`[audioUrl, requestId]`) that sets `.src` unconditionally, and one keyed on `[audioUrl, playing, requestId]` that only calls `.play()`/`.pause()` and never touches `.src`.

---

## 6. Follow-along feed

The bus position drives **Review's follow-along highlight**: the text panel highlights the currently-playing **section (§N)**, dims past sections, and auto-scrolls.

Binding timing constraint: there is **no per-segment timestamp/offset into the assembled chapter WAV**. Follow-along therefore highlights by the **currently-loaded segment** (Review plays via segment-sequenced playback), so the highlight = the playing segment's section. Intra-section highlight and timestamp-anchored annotation are impossible until per-WAV timing data exists on the backend; re-render annotations attach to sections (§N), never timestamps. **Future backend work**, not a player concern.

The `FollowAlongPanel` is a pure text-tracking + re-render surface; transport is the global `PlayerBar`'s responsibility.

Cross-reference: the Review stage contract lives in [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md) §3.2.

---

## 7. Cross-References

- Design source for the tape: `design-docs/plans/proposals/audio_player_scrubbing_waveform_proposal.md`
- Live-port implementation plan: `design-docs/plans/active/audio_player_waveform_scrubber/` (00-audit, 01-roadmap, tasks/)
- Shell composition / where the bar mounts: [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md)
- Iconography (control→icon map): [design-system.md](design-system.md) §9
- Peaks sidecar artifact metadata: [data-model.md](data-model.md)
- Owner decisions (U16 bar, Q6 collapse-when-empty): `design-docs/plans/reference/site_experience_north_star.md`
- Chapter audio status driving availability: [progress-presentation.md](progress-presentation.md)
- Job/queue state behind rendered audio: [queue-jobs.md](queue-jobs.md)
- Single-owner decision: [ADR-0010](../decisions/ADR-0010-single-owner-audio-player.md)
