# Global Audio Player

```
spec_version: 1.4.0
status: active
created: 2026-06-13
updated: 2026-06-15
sources:
  - plans/site_experience_north_star.md
  - plans/site_redesign_rollout/06_phase_r4_player_review.md
  - plans/site_redesign_rollout/09_phase_r7_player.md
  - frontend/src/store/playerBus.ts
  - frontend/src/app/layout/PlayerBar.tsx
  - frontend/src/app/layout/WaveformStrip.tsx
  - frontend/src/demo/stages/siteMockup/
```

> **TL;DR:** Audio in the redesigned app has exactly one owner — a `playerBus` store with a single `<audio>` element living in a full-window bottom `PlayerBar`. Every other surface (the Studio VCR, chapter rows, voice previews, Review follow-along) becomes a client that loads the bus and reads its state; nothing else creates audio. Loading a new source stops the old one. The bar is hidden when nothing is loaded — no false affordance. R7 added full VCR transport (prev/skim-back/play/skim-fwd/next) and the Segment↔Chapter scope toggle. **Waveform representation follows scope (U16, affirmed 2026-06-15):** Segment scope renders the wavesurfer.js waveform *inline as the scrub track*; Chapter scope renders a plain seek bar (an hour of speech is a featureless blur). This is the *default* — a far-right toggle lets the user flip waveform ↔ bar on demand (the override resets to the scope default on each new source). When the bar is too narrow for an inline waveform, the segment waveform reflows *above* the controls at reduced height (§5).

## Changelog

| Version | Date       | Change |
|---------|------------|--------|
| 1.0.0   | 2026-06-13 | Initial target contract for the global single-owner audio player (Phase R4) |
| 1.1.0   | 2026-06-14 | R7 shipped: full VCR transport; `skip(deltaSeconds)` bus helper; Segment↔Chapter `altScope`/`switchScope` scope toggle; wavesurfer.js waveform strip (lazy-loaded, toggle persisted, seek-on-click); Review panel transport delegation to bar; `status: target → active` |
| 1.2.0   | 2026-06-15 | **U16 waveform representation rule affirmed (owner):** representation follows scope — Segment scope shows the waveform *inline as the scrub track*; Chapter scope shows a *plain seek bar*; the separate user wave toggle is removed. Responsive exception: when the bar is too narrow, the segment waveform reflows *above* the controls at reduced height. Time is segment-relative in Segment scope. Supersedes the R7 toggleable expansion strip (§5). **Implementation pending** — current code still ships the R7 toggle; tracked as a separate task. |
| 1.3.0   | 2026-06-15 | **U16 scope-driven waveform SHIPPED in the live `PlayerBar`.** Removed the `player-btn-wave` toggle, `playerPrefs.ts` (`load/saveWaveformPref`), and the `player-bar-expansion` slot + `--player-waveform-height`. Segment scope renders `WaveformStrip` inline as the scrub track; chapter/preview scope renders the plain `<input type=range>` slider. Responsive above-reflow implemented via a CSS container query on `.player-bar` (`.player-scrub--wave { order:-1; flex-basis:100% }`), one wavesurfer instance repositioned by flex — not a viewport media query. Single-owner (`<audio>`) invariant preserved. |
| 1.4.0   | 2026-06-15 | **Representation-override toggle re-added (owner).** The scrub representation still *defaults* to scope (segment → waveform, chapter/preview → bar), but a far-right `player-btn-wave` toggle lets the user flip waveform ↔ bar on demand. Override is in-component state (`forceWave: boolean \| null`), reset to the scope default whenever a new source loads (`requestId`). NOT persisted across sessions (no `playerPrefs` resurrection). Time/audio still follow scope; only the scrub *look* is overridable. |

---

## 1. Purpose

This spec is the **binding active contract** for the global audio player established by the site redesign: a single `playerBus` store, a single `<audio>` element inside a global `PlayerBar`, and the conversion of every existing ad-hoc player into a bus client.

**Implementation status: active — fully shipped as of Phase R7.** `frontend/src/store/playerBus.ts` and `frontend/src/app/layout/PlayerBar.tsx` implement the full contract including VCR transport, scope toggle, and waveform. The Review stage `FollowAlongPanel` is a text-tracking and re-render surface only; it delegates all transport to the global `PlayerBar`.

Delivery phases: R4 (core playerBus + PlayerBar + adapters + Review playback), R7 (VCR skim, scope toggle, waveform). Canonical owner decisions: `plans/site_experience_north_star.md` (U16, U16 waveform amendment, Q6 collapse-when-empty) and ADR-0010.

Specs and code are jointly authoritative. If they disagree, resolve the drift explicitly by changing one or the other, and note it in the changelog.

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
| `altScope` | `AltScope \| undefined` | Optional second source the user can switch to via `switchScope()`. When present, the bar renders a pill toggle instead of a passive badge. `AltScope` = `{ scope, audioUrl, title?, subtitle? }` |
| `playing` | `boolean` | Whether the element is currently playing |
| `positionSec` | `number` | Current playhead position in seconds |
| `durationSec` | `number` | Total duration in seconds (from `loadedmetadata`) |
| `queue` | `{ hasPrev: boolean; hasNext: boolean }` | Whether prev/next are available *within the current scope* |
| `requestId` | `number` | Monotonic load token so the PlayerBar element can ignore stale loads |
| `seekRequestId` | `number` | Monotonic seek token so the PlayerBar seek effect fires correctly without conflicting with `timeupdate` reporting |

### 2.2 Bus API

- `loadAndPlay({ scope, title, subtitle?, audioUrl, altScope?, onEnded?, onPrev?, onNext?, onError?, hasPrev?, hasNext? })` — load a new source and begin playback. Optionally registers an `altScope` to enable the scope toggle.
- `play()` / `pause()` — transport.
- `seek(seconds)` — move the playhead; increments `seekRequestId` so the element effect fires.
- `skip(deltaSeconds)` — `seek(clamp(position + delta, 0, duration))`; used for skim-back/skim-forward.
- `switchScope()` — swap the active `{scope, audioUrl, title, subtitle}` with the registered `altScope`; bumps `requestId` so the bar reloads. No-op when `altScope` is undefined.
- `stop()` — clear state (`scope → null`, `audioUrl → null`); the bar hides.
- `reportTime(positionSec, durationSec)` — called *by the PlayerBar element* from `timeupdate` / `loadedmetadata`; consumers never call it.
- `notifyEnded()` / `notifyError()` / `notifyPrev()` / `notifyNext()` — dispatched by the element; the bus invokes the stored per-load callbacks.
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
- **VCR transport row:** ⏮ prev · ⏪ skim-back(−10 s) · ▶/⏸ play-pause · ⏩ skim-fwd(+10 s) · ⏭ next · ⏹ stop (secondary, smaller). All buttons are `aria-label`-ed; prev/next are disabled from `queue.hasPrev/hasNext`.
- **Scope toggle** (when `altScope` is set): a two-pill inline toggle (e.g. `chapter | segment`) replaces the passive scope badge. The active pill is highlighted; tapping the inactive pill calls `switchScope()` which swaps the loaded audio. When only one scope is available, the passive `player-scope-badge` renders instead.
- **Scrub track follows scope (U16, shipped 2026-06-15):**
  - **Segment scope** → the scrub track *is* the inline wavesurfer.js waveform (a ≤ engine-char-limit segment is a few seconds of speech, whose waveform has readable structure worth seeing/annotating). Clicking it seeks within the segment.
  - **Chapter scope** → a *plain seek slider* (no waveform). An hour of narration is a near-uniform amplitude carpet that carries no navigable information, so the waveform is intentionally omitted here.
  - Representation **defaults** to scope, but a far-right **`player-btn-wave` toggle** lets the user flip waveform ↔ bar on demand (override is session-only state, reset to the scope default on each new source). Unlike the R7 toggle, it is *not* persisted and does *not* gate an above-the-row expansion strip — it just swaps the inline scrub representation. See §5.
- **Time** (`m:ss / m:ss`) in the right section of the content row. Time is **segment-relative in Segment scope** (e.g. `0:03 / 0:06`) and **chapter-relative in Chapter scope** (e.g. `2:14 / 28:10`).
- **Hidden entirely when nothing is loaded** (`audioUrl === null`): the bar renders no visible chrome and removes the content inset. This is deliberate (owner Q6, round-2 refinement): a disabled-looking bar is a false affordance.
- When visible, the content area gets bottom padding/inset so the bar never covers content.
- **Persists within a book while navigating:** moving between stages keeps audio playing. The bar collapses to nothing only once `stop()` clears the bus.

---

## 4. Consumers become adapters

Every existing player converts into a thin **bus client**. The audio element and transport move to the PlayerBar; the consumer keeps only its domain logic and feeds the bus.

| Consumer | Today | Becomes |
|---|---|---|
| Studio VCR (`PlaybackControls.tsx` + `useChapterPlayback.ts`) | Creates `new Audio()` per segment; owns sequencing, wav→mp3 fallback, `onended`→next, skim, space-to-play | Keeps all sequencing/fallback/skim/highlight logic; calls `loadAndPlay({ scope:'segment', … })` and drives advance from the bus `onEnded` callback. The in-page VCR is removed; the PlayerBar is the transport. Public hook shape (`playSegment`, `stopPlayback`, `togglePause`, `seekTo`, `isPlaying`, `playingSegmentId`, …) is preserved. |
| Inline chapter player (`ChapterHeader.tsx`, legacy `ChapterList.tsx` `<audio controls>`) | Native `<audio>` on the chapter row/header | A play button that calls `loadAndPlay({ scope:'chapter', audioUrl:<chapter asset url>, title:'Ch N · Title' })`, reusing the exact asset `src`; the button reflects play/pause from `usePlayerBus()`. |
| Voice preview/sample (`VariantEditor.tsx` and Voices preview callsites) | `<audio>` elements per preview | `loadAndPlay({ scope:'preview', title:<voice name> })`. Only the playback path converts; **recording capture stays as-is** (capture is not playback). |
| Review follow-along panel (`FollowAlongPanel.tsx`) | Previously rendered its own circular play/prev/next transport, competing with the global bar | **Delegation model (R7):** the panel is now a text-tracking and re-render surface only. Transport is provided exclusively by the global `PlayerBar`. The panel keeps: chapter label, segment indicator (active segment index / total), "Regenerate Segment" button + progress/error states, and tap-to-seek (dispatches `seek()` to the bus on segment click via `ReviewStage`). |

The conversion is complete when `grep -rn "<audio\|new Audio(" frontend/src` matches only `PlayerBar.tsx` and recording-capture components.

**Capability parity is binding:** no playback capability may vanish in the conversion. VCR transport (play/pause/stop/prev/next/seek/skim), playing-segment highlight, space-bar play, chapter-row playback, and voice preview/sample playback all survive — re-homed, not removed.

---

## 5. Waveform — representation follows scope (U16, affirmed 2026-06-15)

The **waveform is the inline scrub track in Segment scope**, rendered with **wavesurfer.js** (lazy-imported via dynamic `import()` so it does not bloat the entry chunk). It is **not** a user-toggled overlay. The rule:

- **Segment scope** → wavesurfer waveform occupies the scrub-track position in the control row (between transport and the trailing controls), at the row's height (~32 px). It is the seek surface.
- **Chapter scope** → no waveform; a plain seek slider occupies the scrub-track position (§3).
- **Representation override.** Representation is decided by scope by default, but a far-right `player-btn-wave` toggle flips waveform ↔ bar on demand. The override is in-component state (`forceWave: boolean | null`), reset to the scope default whenever a new source loads (`requestId`). The R7 `loadWaveformPref`/`saveWaveformPref` *persistence* and the on-demand `player-bar-expansion` strip remain **removed** — the toggle now just swaps the inline scrub representation; it does not open an above-the-row strip (the only above-the-row case is the narrow-width responsive reflow, §5.1).

### 5.1 Responsive exception (waveform above, only when narrow)

When the bar is too narrow to fit transport + an inline waveform + the trailing controls on one line (container query on the bar; not a viewport media query), the **segment** waveform reflows to a strip **above** the control row, at **reduced height** (~24 px — shorter than the inline track). The control row then keeps transport + scope toggle + time and may wrap so nothing clips. Chapter scope has no above-strip (it has no waveform at any width). This is the *only* case where the waveform appears above the controls — the old on-demand pop-above behavior is gone.

### 5.2 Wavesurfer wiring (unchanged from R7)

- **Seek-on-click**: `wavesurfer.on('seek')` maps the fractional position to `bus.seek(fraction * duration)`.
- **Position reflection**: `playerBus.position` changes are reflected to `wavesurfer.seekTo(position / duration)` so the cursor tracks playback.
- **Peak decoding**: wavesurfer decodes the audio client-side via Web Audio, downsamples to peaks, and caches them per URL. A ≤ engine-char-limit segment decodes near-instantly.

### 5.3 Implementation status

**SHIPPED (2026-06-15).** `PlayerBar.tsx` picks the scrub track from `showWave = forceWave ?? (scope === 'segment')`: when true it renders `WaveformStrip` inline (in `.player-scrub--wave` → `.player-waveform-inline`, 32 px); otherwise the plain `.player-progress-slider`. `forceWave` is the override set by the far-right `player-btn-wave` toggle and reset to `null` (scope default) on each new source via a `requestId` effect. The responsive above-reflow is a CSS container query on `.player-bar` in `components.css` (`@container (max-width: 720px)` sets `.player-scrub--wave { order:-1; flex-basis:100% }` and drops the waveform to 24 px) — one wavesurfer instance, repositioned by flex order, no second audio owner. The `player-bar-expansion` slot, `--player-waveform-height`, and `utils/playerPrefs.ts` persistence were removed (the toggle is session-only). The styleguide U16 specimen (`frontend/src/demo/styleguide/StyleguidePage.tsx`) demonstrates the same behavior.

---

## 6. Follow-along feed

The bus position is the data source for **Review's follow-along highlight**. Review's text panel highlights the currently-playing **section (§N)**, dims past sections, and auto-scrolls the current one into view.

Important timing constraint (investigated, binding): there is **no per-segment timestamp/offset into the assembled chapter WAV**. Follow-along therefore highlights by **currently-loaded segment scope** — Review plays audio through the same segment-sequenced playback as Studio (`scope:'segment'`), so the highlight = the playing segment's section. Intra-section (sub-position) highlight is impossible until per-WAV timing data exists on the backend; Review UI copy must state this, and re-render annotations attach to sections (§N), never to timestamps. This is **future backend work**, not a player concern.

The Review follow-along panel (`FollowAlongPanel`) is a pure text-tracking + re-render surface; it no longer owns or renders transport controls. Transport is the global `PlayerBar`'s responsibility per the single-owner contract.

Cross-reference: the Review stage contract and its follow-along/annotation/re-render responsibilities live in [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md) §3.2 (Review).

---

## 7. Cross-References

- Shell composition, where the bar mounts, and book-stage routing: [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md)
- Phase R4 delivery plan (playerBus, PlayerBar, adapters, Review): `plans/site_redesign_rollout/06_phase_r4_player_review.md`
- Phase R7 delivery plan (VCR, scope toggle, waveform, Review delegation): `plans/site_redesign_rollout/09_phase_r7_player.md`
- Owner decisions (U16 player bar, U16 waveform amendment, Q6 collapse-when-empty): `plans/site_experience_north_star.md`
- Chapter audio status / progress presentation that drives playback availability: [progress-presentation.md](progress-presentation.md)
- Job/queue state behind rendered audio: [queue-jobs.md](queue-jobs.md)
- Single-owner decision: [ADR-0010](../decisions/ADR-0010-single-owner-audio-player.md)
