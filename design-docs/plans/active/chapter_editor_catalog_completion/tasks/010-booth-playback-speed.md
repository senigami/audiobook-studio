# Task 010 — Playback speed control (playerBus field, zero prior art)

Status: pending

Risk: multi-file (touches the global `playerBus` store consumed everywhere, plus the single owned `<audio>` element in `PlayerBar.tsx`)

## Goal

Add a genuinely new playback-speed control (0.5×–2×) to the app: a `playbackRate` field on `playerBus`, wired to the one owned `<audio>` element in `PlayerBar.tsx` (ADR-0010), a UI control to change it, and persistence so the chosen speed survives a page reload.

## Why this matters

`chapter-editor-modes.md` §6 lists "Speed 0.5–2×" as living in Booth's transport, alongside karaoke highlight and tap-to-seek — currently there is zero implementation of this anywhere in the app. Grep for `playbackRate`/`PlaybackSpeed`/"0.5...2x" across `frontend/src` returns no hits. This is clean, additive work, but it touches the single-owner audio architecture (ADR-0010), so it must be done at the `playerBus`/`PlayerBar` level, not bolted onto Booth in isolation.

## Exact files

- `frontend/src/store/playerBus.ts` — add `playbackRate` to `PlayerBusState`/`IDLE_STATE`, add `setPlaybackRate()`.
- `frontend/src/app/layout/PlayerBar.tsx` — sync `audio.playbackRate` from bus state, add the UI control.
- New: `frontend/src/utils/playbackRatePreference.ts` — localStorage-backed preference helper (see pattern below).
- `frontend/tests/unit/store/playerBus.test.ts` — extend with `setPlaybackRate` coverage.
- `frontend/tests/unit/app/layout/PlayerBar.test.tsx` — extend with the sync-effect and UI-control coverage.
- (Only if the executor's live-check favors a Booth-local control instead of/in addition to the global one — see step 4 below) `frontend/src/pages/ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx`.

## Current shape (verified)

- Zero prior art anywhere: grepping `frontend/src` for `playbackRate`, `PlaybackSpeed`, and `playback speed` returns no matches.
- `PlayerBusState` (`playerBus.ts:9-20`) has fields `scope | title | subtitle | audioUrl | playing | position | duration | queue | requestId | seekRequestId` only — no `playbackRate`.
- ADR-0010 (`design-docs/decisions/ADR-0010-single-owner-audio-player.md`) establishes: exactly one `<audio>` element exists, living in `PlayerBar`; nothing else instantiates an audio element or calls `.play()` on its own; every other player is a thin adapter dispatching to the bus. Any new playback attribute (rate included) must be applied at `PlayerBar`'s owned `<audio>` element, not duplicated elsewhere.
- `PlayerBar.tsx`'s existing `<audio>`-syncing effects: `audio.src`/`.play()`/`.pause()` at lines 118-135 (keyed on `audioUrl, playing, requestId`), and a dedicated seek effect at lines 139-145 (keyed on `seekRequestId`). No analogous effect exists for a rate property.
- **The "Wave toggle" is NOT a persistence pattern to copy.** `PlayerBar.tsx`'s `forceWave`/`tapeOpen` state (lines 55-59) is transient per-source UI state — it explicitly resets to `null`/`false` on every new track load via the `requestId` effect (lines 76-81). It is not written to `localStorage` anywhere in that file. Playback speed is a durable user preference (should persist across tracks and reloads), so this is the wrong model to imitate.
- **Correct pattern to imitate:** `frontend/src/utils/railState.ts` — plain functions (`isRailCollapsed`/`setRailCollapsed`, `getRailWidth`/`setRailWidth`) wrapping `localStorage.getItem`/`setItem` in try/catch, each paired with a `useSyncExternalStore`-based hook (`useRailCollapsed`) over a private listener `Set`. This is the shape to copy for a new `playbackRatePreference.ts`.
- Booth mode has no dedicated transport bar of its own beyond `FollowAlongPanel.tsx` (which shows only a segment-count indicator + "Regenerate Segment" button, `FollowAlongPanel.tsx:16-110`) — all real transport (play/pause/seek/skip) is owned by the global `PlayerBar`, consistent with ADR-0010.

## Target shape

1. Add `playbackRate: number` to `PlayerBusState` and `IDLE_STATE` (default `1`), plus an exported `setPlaybackRate(rate: number): void` following the existing `setState()` pattern used by `play`/`pause` (`playerBus.ts:106-112`). Seed the initial value from the new preference helper (module-scope read, guarded like `railState.ts`'s try/catch — safe under SSR/test environments where `localStorage` may be unavailable).
2. New `frontend/src/utils/playbackRatePreference.ts`, mirroring `railState.ts`: `getPlaybackRatePreference(): number` / `setPlaybackRatePreference(rate: number): void` around a `localStorage` key (e.g. `studio-playback-rate`), try/catch guarded. Clamp to whatever fixed step set the UI control exposes (recommend `[0.75, 1, 1.25, 1.5, 2]` as a practical default within the design doc's stated `0.5–2×` range — pick the concrete steps and keep the clamp function and the UI control's options in sync).
3. In `PlayerBar.tsx`, add a `useEffect` keyed on `state.playbackRate` (and `audioEl`) that sets `audio.playbackRate = state.playbackRate`. Unlike the wave toggle, do **not** reset this on `requestId` change — a new track loading should keep the user's chosen speed.
4. Add a UI control to `PlayerBar.tsx` (e.g. a small cycling button showing "1×"/"1.25×"/etc., or a compact `<select>`) placed near the existing `player-btn-wave` toggle (`PlayerBar.tsx:338-354`), calling `setPlaybackRate(next)` and `setPlaybackRatePreference(next)` together on change.
   **Open call for whoever executes this task:** the design doc frames speed as living in Booth's transport specifically, but `playerBus` is global state and ADR-0010 makes `PlayerBar` the sole transport surface — putting the control there makes it available from every mode/page (Booth, Book review, Voices preview, etc.), which is the architecturally consistent default. Prefer `PlayerBar` unless a live click-through of Booth mode shows the control is unreasonably far from the reading column; if a Booth-local control is added instead or in addition, it must call the same `setPlaybackRate` action rather than inventing a second rate state — do not create two sources of truth for speed.
5. Ensure `PlayerBar` (or the `playerBus` module itself) seeds `playbackRate` from `getPlaybackRatePreference()` once at load, so a returning user's chosen speed is restored after a reload, not reset to `1`.

## Steps

1. Write `frontend/src/utils/playbackRatePreference.ts`, copying `railState.ts`'s try/catch + `useSyncExternalStore` shape.
2. Add `playbackRate` to `PlayerBusState`/`IDLE_STATE` in `playerBus.ts`, seeded from the new preference helper; add and export `setPlaybackRate()`.
3. Extend `frontend/tests/unit/store/playerBus.test.ts` (follow its existing per-action test style, e.g. the `loadAndPlay sets audioUrl...` test) with cases for: default `playbackRate` is `1` (or the persisted value) on fresh state, `setPlaybackRate` updates state and notifies subscribers.
4. In `PlayerBar.tsx`, add the `audio.playbackRate` sync effect and the UI control; call `setPlaybackRatePreference` on every change.
5. Extend `frontend/tests/unit/app/layout/PlayerBar.test.tsx` with assertions that the rendered `<audio>` element's `.playbackRate` reflects `playerBus.playbackRate` after `setPlaybackRate`, and that the new control is present, labeled, and keyboard-operable.
6. Live-verify: play any audio, change speed via the new control, confirm an audible rate change; reload the page, confirm the previously chosen speed is restored (not reset to 1×).

## Acceptance criteria

- [ ] `PlayerBusState` carries a `playbackRate` field (default `1` or the persisted value) and `setPlaybackRate()` is exported and covered by a `playerBus.test.ts` test.
- [ ] The one owned `<audio>` element in `PlayerBar.tsx` has its `.playbackRate` kept in sync with `playerBus.playbackRate` — no second `<audio>` element or independent rate state introduced anywhere (ADR-0010 stays intact).
- [ ] A visible, keyboard-operable UI control changes the rate; its default location is the global `PlayerBar` per the recommendation above, unless the executor's live-check justifies a Booth-local addition (documented in the task's completion notes either way).
- [ ] The chosen rate survives a full page reload via `localStorage`, following `railState.ts`'s try/catch pattern (no crash if storage is unavailable).
- [ ] Loading a new audio source does not reset the rate to 1× (this is the property that distinguishes it from the non-persisted "Wave toggle" behavior it must NOT imitate).
- [ ] `npm -C frontend run test -- --run` clean.
- [ ] Live-verify: change speed, confirm an audible effect on real playback, not just a state assertion.

## Map links

Part G in `01-map.md` ("a new shared `playbackRate` field on `frontend/src/store/playerBus.ts` (currently absent entirely)"). Workload 4, task 010 (`[G-speed]`, independent) in `02-roadmap.md`. Governed by ADR-0010 (single-owner audio player) for where the `<audio>` element and control may live.

## Dependencies

None. Parallel-safe with every other task in this plan (roadmap: "010, 011 → independent, parallel-safe with everything").

## Out of scope

- Do not build the annotation gutter (009) or margin pins (011) here.
- Do not add a per-segment or per-scope speed override — one global rate on `playerBus`, matching the existing single-source-of-truth model; the design doc specifies a transport-level control, not a per-line one.
- Do not touch `WaveformStrip`/`WaveformTape` peak-rendering logic — a rate change must not require re-decoding or re-rendering waveform peaks.
