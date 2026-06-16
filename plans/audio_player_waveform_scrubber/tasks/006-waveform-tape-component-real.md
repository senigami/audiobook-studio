# 006 — WaveformTape component (real, browser-decoded)

status: todo
workload: W2 — Real tape + zoom (browser-decoded)
blocked-by: 005
blocks: 007, 008

## Goal

Create a new `WaveformTape` React component (`frontend/src/app/layout/WaveformTape.tsx`) that renders a paged, zoomable detail view of the currently-loaded audio using wavesurfer browser-decoded peaks. The component binds to the single existing `<audio>` element (the one owned by PlayerBar) via wavesurfer's `media:` option — exactly as `WaveformStrip` already does — and never spawns a second audio owner.

## Why it matters

This is the core rendering primitive for Workload 2. Every other W2 task (zoom presets, minimap, PlayerBar integration) depends on this component existing and honoring the single-owner invariant. Getting the paged model, playhead, page-advance, bus integration, and reduced-motion behavior right here means the rest of the stack can be wired in without revisiting fundamentals.

## Files

- **Create:** `frontend/src/app/layout/WaveformTape.tsx`
- **Read (for reference, do not edit):** `frontend/src/app/layout/WaveformStrip.tsx` — the existing single-owner binding pattern to replicate
- **Read (for reference, do not edit):** `frontend/src/store/playerBus.ts` — bus API for seek/reportTime/position/requestId

## Target shape / contract

```typescript
interface WaveformTapeProps {
  /** The PlayerBar's single <audio> element — must not be null when tape mounts. */
  audioEl: HTMLAudioElement;
  /** Current audio URL — triggers wavesurfer re-init on change, same as WaveformStrip. */
  audioUrl: string;
  /**
   * Duration in seconds of the loaded clip — passed from PlayerBar (bus.duration).
   * Used to compute total page count, minimap geometry, and zoom-preset bounds.
   * Defaults to audioEl.duration when available; caller must pass it to avoid a
   * race between the tape mount and the audio metadata event.
   */
  duration: number;
  /**
   * Zoom preset index (0 = most zoomed in, 4 = most zoomed out).
   * Controlled externally by 007 zoom-preset control.
   * Defaults to preset index 2 (30 s viewport) when not supplied.
   */
  zoomPresetIndex?: number;
  /**
   * Callback when the user clicks or drags to scrub — tape calls bus.seek()
   * internally AND fires this for any parent state sync (e.g. minimap update).
   */
  onSeek?: (seconds: number) => void;
}

export const WaveformTape: React.FC<WaveformTapeProps> = (props) => { ... };
```

**Paged window model:**
- The tape shows a fixed-width time window of audio (size = current zoom preset, e.g. 30 s).
- A playhead line traverses the window left-to-right as `position` advances.
- When the playhead reaches the window's right edge the window advances one page (teleprompter-style). No continuous scroll.
- The current page is derived from `Math.floor(position / windowSec)`, where `windowSec` is the seconds-across-viewport for the active preset.

**Bus integration (exact line references from `playerBus.ts`):**
- Subscribe to `position` and `duration` via `usePlayerBus()` (line 202).
- `seek` is imported from `playerBus.ts` (line 162) and called on click/drag interactions.
- `reportTime` is NOT called from WaveformTape — only the `<audio>` event handlers in PlayerBar call it (line 171).
- Re-init wavesurfer on `[audioUrl, audioEl]` as `WaveformStrip` does (line 97).

**Single-owner binding (ADR-0010):**
- `WaveSurfer.create({ media: audioEl, ... })` — passing the PlayerBar's existing element.
- `ws.load(audioUrl)` for browser peak decode.
- The component must NEVER call `new Audio()` or create an `<audio>` element.
- On unmount destroy the wavesurfer instance (same cleanup as `WaveformStrip:89–96`).

**Reduced motion:**
- Read `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at init time (or via a CSS media query).
- When true: page-advance is instant (no transition CSS class applied to the page region).
- When false (default): page-advance may use a brief CSS transition (e.g. `opacity` flash or a 120ms slide), but this is purely cosmetic — implement the instant cut first and layer transitions later.
- Because paged is the default motion model, there is no continuous-scroll mode to suppress (Finding F5 — reduced motion is free under paged-default).

**Click-to-jump:** translate click x-offset within the tape container to a position in seconds, call `seek(seconds)`.

**Drag-to-scrub:** `mousedown` + `mousemove` + `mouseup` (pointer events preferred for touch compat). While dragging, the tape shifts the audio under the playhead — compute delta-x to delta-seconds and call `seek(currentPos + deltaSec)`. Clamp to `[0, duration]`.

**Accessibility:**
- Root element: `role="region"` with `aria-label="Audio tape"`.
- Tab-indexable: keyboard `←`/`→` arrows call `seek` by ±5 s (or a small fixed nudge).
- The tape canvas is `aria-hidden="true"` (purely visual, seek is on the container).

## Steps

1. Scaffold `WaveformTape.tsx` with the props interface, empty component body, and the ADR-0010 comment block copied from `WaveformStrip.tsx`.
2. Implement wavesurfer init in a `useEffect` on `[audioUrl, audioEl]`: lazy-import wavesurfer, call `WaveSurfer.create({ media: audioEl, ... })`, `ws.load(audioUrl)`. Destroy on cleanup.
3. Implement paged window model: derive `windowSec` from `zoomPresetIndex` (constants array: `[8, 15, 30, 60, 120]`), derive `pageStartSec = Math.floor(position / windowSec) * windowSec`, expose `pageStartSec` + `windowSec` as refs/state.
4. Implement the moving playhead: a positioned `<div>` (or SVG line) absolutely positioned within the tape container, `left = ((position - pageStartSec) / windowSec) * 100 + '%'`.
5. Implement click-to-jump on the tape container `onClick`.
6. Implement drag-to-scrub via pointer events on the tape container.
7. Wire `prefers-reduced-motion`: when true skip any page-transition class.
8. Add `role`, `aria-label`, `tabIndex`, and keyboard `←`/`→` handler.
9. Export `WaveformTape` and `TAPE_ZOOM_PRESETS_SEC` (the `[8, 15, 30, 60, 120]` array) from the module so 007 can import the constants.

## Acceptance criteria

- The component file exists at `frontend/src/app/layout/WaveformTape.tsx` and exports `WaveformTape` and `TAPE_ZOOM_PRESETS_SEC`.
- **Single-owner grep passes:** `grep -rn '<audio\|new Audio(' frontend/src/` must match only `PlayerBar.tsx` and capture-related components — `WaveformTape.tsx` must not appear in the results. This check must be documented as a criterion and verified manually or in CI.
- `WaveformTape` accepts `audioEl` and `audioUrl` and creates a wavesurfer instance bound via `media: audioEl`, never creating its own `<audio>`.
- Page-advance fires when `position` crosses a window boundary (verifiable by advancing `position` past `windowSec` and observing `pageStartSec` updating).
- Click-to-jump: clicking at x = 50% of the tape width calls `seek` with a value ≈ `pageStartSec + windowSec / 2`.
- Drag-to-scrub: pointer-drag left calls `seek` with a decreasing value.
- `prefers-reduced-motion: reduce` — page-advance applies no transition class.
- Keyboard `←`/`→` calls `seek` with the adjusted position.
- `npm -C frontend run build` passes with no TypeScript errors on this file.
- `npm -C frontend run lint` passes on this file.

## Out of scope

- Zoom preset control UI (that is task 007).
- Minimap (that is task 007).
- PlayerBar integration / toggle / duration cap (that is task 008).
- CSS for the tape region height and grow-upward animation (that is task 009).
- Any backend work.
- Continuous-scroll mode.
- Annotation / edit-marking (post-V2).

## References

- `frontend/src/app/layout/WaveformStrip.tsx:48–87` — single-owner wavesurfer binding pattern (the model to replicate).
- `frontend/src/store/playerBus.ts:162` — `seek(seconds)`.
- `frontend/src/store/playerBus.ts:171` — `reportTime` (owned by PlayerBar, NOT called from tape).
- `frontend/src/store/playerBus.ts:25` — `position` field.
- `frontend/src/store/playerBus.ts:202` — `usePlayerBus()`.
- `plans/audio_player_scrubbing_waveform_proposal.md §3` — paged model, interaction, minimap, zoom.
- `plans/audio_player_scrubbing_waveform_proposal.md §5` — HIG guardrails (targets ≥ 44 pt, contrast, single-owner).
- `plans/audio_player_scrubbing_waveform_proposal.md §9, decision 5` — paged by default.
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E` — F4 (single-owner), F5 (reduced motion).
- ADR-0010 / `docs/specs/audio-player.md §2` — single `<audio>` element invariant.
