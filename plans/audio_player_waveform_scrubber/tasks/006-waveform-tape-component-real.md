# 006 — WaveformTape renderer + browser peak provider

status: todo
workload: W2 — Port the tape to the live PlayerBar (browser-decoded)
blocked-by: 005
blocks: 007, 008

## Goal

Port `MockWaveTape` (reference: `frontend/src/demo/stages/siteMockup/shared.tsx:616–770`) into a live `WaveformTape` component bound to the **single** `<audio>` element via `playerBus`. Add a `usePeaks(audioUrl)` browser provider (Web Audio decode → downsampled `number[]`); the tape samples that array on an absolute-time grid instead of `speechPeakAt`. Wire seek and time-reporting through the bus (`seek` at `playerBus.ts:162`, `reportTime` at `:171`). Add rAF interpolation for smooth moving-mode playhead if `timeupdate` (~4 Hz) is too choppy.

**Port, don't re-derive.** The mock's rendering logic, fixed-grid sampling math, paged/moving window computation, click/drag scrub, and ruler are the source of truth. The only changes are: (1) replace `speechPeakAt(t)` with a lookup into a real peak array; (2) bind to the bus instead of mock local state; (3) no second `<audio>` owner ever.

## Why it matters

This is the core rendering primitive for Workload 2. Every other W2 task (zoom presets, minimap, PlayerBar integration) depends on this component. Getting fixed-grid sampling, single-owner binding, and reduced-motion right here means the rest of the stack can be wired in without revisiting fundamentals.

## Files

### Create

- `frontend/src/app/layout/WaveformTape.tsx` — the ported tape component + `usePeaks` hook.

### Read (reference, do not edit)

- `frontend/src/demo/stages/siteMockup/shared.tsx:551–770` — `speechPeakAt`, `MockWaveTape` (fixed-grid sampling at `:638–658`; paged/scroll window math at `:629–635`; ruler at `:667–673`; drag-to-scrub at `:686–710`).
- `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx` — `ZOOM_PRESETS`, `snapZoom` (used by task 007; export `TAPE_ZOOM_PRESETS_SEC` from this file in the same shape).
- `frontend/src/app/layout/WaveformStrip.tsx:20–98` — single-owner wavesurfer binding pattern to replicate (`media: audioEl`, `ws.load(audioUrl)`, destroy on cleanup).
- `frontend/src/store/playerBus.ts` — `seek` (`:162`), `reportTime` (`:171`), `usePlayerBus` (`:202`), `position`/`duration` fields (`:25–26`).

## Target shape / contract

### Props

```typescript
export interface WaveformTapeProps {
  /** The PlayerBar's single <audio> element — must not be null when tape mounts. */
  audioEl: HTMLAudioElement;
  /** Current audio URL — triggers peak re-decode on change. */
  audioUrl: string;
  /** Total duration in seconds from the bus (avoids a race with loadedmetadata). */
  duration: number;
  /**
   * Seconds-of-audio across the viewport (the active zoom preset).
   * Controlled externally by task 007. Default: 30.
   */
  windowSec?: number;
  /**
   * 'paged' (default): playhead sweeps the window; window advances at the edge.
   * 'moving': playhead fixed at center; waveform slides past it.
   * 'paged' is forced when prefers-reduced-motion: reduce is active.
   */
  mode?: 'paged' | 'moving';
  /** Called when user clicks or drags to a new position. Tape also calls bus.seek(). */
  onSeek?: (seconds: number) => void;
  /** Tape pixel height (canvas only, not including ruler). Default 96. */
  height?: number;
}

export const WaveformTape: React.FC<WaveformTapeProps> = (props) => { ... };
```

### `usePeaks(audioUrl, audioEl)` — browser peak provider

```typescript
/**
 * Decodes the audio at audioUrl via Web Audio API → downsampled number[] in [0,1].
 * Returns null while decoding, the array when ready, or an empty array on error.
 * The decode is keyed on audioUrl — re-runs when the URL changes.
 * The peak array length is PEAKS_COUNT (e.g. 4000).
 */
export function usePeaks(audioUrl: string, audioEl: HTMLAudioElement): number[] | null { ... }
```

Implementation: `fetch(audioUrl)` → `arrayBuffer()` → `AudioContext.decodeAudioData()` → walk channels, downsample to `PEAKS_COUNT` buckets (max absolute sample per bucket). Export `PEAKS_COUNT = 4000` so tests and task 007 can reference it.

**Single-owner note:** `usePeaks` uses `AudioContext` for decoding only. It MUST NOT create an `<audio>` element or a Web Audio `MediaElementSourceNode` on the PlayerBar's audio element — that would break the single-owner invariant. Decode a separate buffer; playback stays in the `<audio>` element owned by `PlayerBar`.

### Fixed-grid sampling (binding — spec §5.3, mock `:638–658`)

```typescript
const gridSec = windowSec / BAR_COUNT;          // seconds per bar (zoom-only dependency)
const alignedStart = Math.floor(viewStart / gridSec) * gridSec; // snap to grid
const scrollOffset = ((alignedStart - viewStart) / windowSec) * svgW; // (-slot, 0]

// Sample on the FIXED grid — NOT relative to the moving window.
// Bar i → absolute time alignedStart + (i + 0.5) * gridSec → stable per time bucket.
const peaks = Array.from({ length: BAR_COUNT + 1 }, (_, i) => {
  const t = alignedStart + (i + 0.5) * gridSec;
  if (t < 0 || t > duration) return 0;
  if (!peakArray || peakArray.length === 0) return 0;
  const idx = Math.floor((t / duration) * (peakArray.length - 1));
  return peakArray[idx] ?? 0;
});
```

`viewStart` is `Math.floor(position / windowSec) * windowSec` in paged mode, `position - windowSec / 2` in moving mode. The key invariant: `bar i` always samples the same absolute-time bucket regardless of `position` — no crawl/shimmer.

### Paged window model

- `viewStart = Math.floor(position / windowSec) * windowSec` — snaps to page boundaries.
- Playhead x = `((position - viewStart) / windowSec) * svgW`.
- Page turns when `position` crosses `viewStart + windowSec` — no continuous scroll.

### Moving mode

- `viewStart = position - windowSec / 2` — playhead fixed at center.
- SVG `viewBox` translated by `scrollOffset` so bars slide.
- Moving mode is suppressed when `prefers-reduced-motion: reduce` — read via `window.matchMedia('(prefers-reduced-motion: reduce)').matches` at mount time; store as a ref (no re-render needed). If true, force `mode = 'paged'` regardless of prop.

### rAF interpolation (smooth playhead in moving mode)

`timeupdate` fires at ~4 Hz. In moving mode the playhead is fixed, but the bar row must scroll smoothly. Use a `requestAnimationFrame` loop to interpolate the SVG `scrollOffset` between `timeupdate` ticks — read `audioEl.currentTime` directly in the rAF callback (it updates at 60 Hz). Cancel the rAF loop on unmount or when mode switches to paged. In paged mode rAF is not needed (the playhead just moves across the static window).

### Click-to-jump / drag-to-scrub (port from mock `:676–710`)

Port `pointerToTime` and the `mousedown` / global `mousemove` / `mouseup` handlers exactly from `MockWaveTape`. Call `seek(seconds)` (from `playerBus.ts:162`) AND fire `onSeek` prop. Clamp to `[0, duration]`.

### Time ruler (port from mock `:667–673`)

```typescript
const NICE_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const tickInterval = NICE_INTERVALS.find(n => n >= windowSec / 4) ?? 600;
```

Ticks labelled `m:ss` via `fmtClock` (port from mock `:590–594`). Render as absolutely-positioned `<span>` elements in a `.tape-ruler` div below the SVG canvas (CSS in task 009).

### Accessibility

- Root: `role="region"`, `aria-label="Audio tape"`.
- SVG: `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={duration}`, `aria-valuenow={Math.round(position)}`, `aria-label="Waveform tape — click or drag to seek"`.
- `tabIndex={0}` on root; keyboard `←`/`→` calls `seek(position ± 5)`.

### Exports from this module

```typescript
export { WaveformTape };
export { usePeaks };
export const TAPE_ZOOM_PRESETS_SEC = [8, 15, 30, 60, 120] as const;
export type TapeZoomPreset = (typeof TAPE_ZOOM_PRESETS_SEC)[number];
export const PEAKS_COUNT = 4000;
```

`TAPE_ZOOM_PRESETS_SEC` mirrors `ZOOM_PRESETS` from `MockTapeControls.tsx` (same values, task 007 imports from here).

## Steps

1. Create `WaveformTape.tsx`. Add the ADR-0010 comment at the top of the file: `// ADR-0010: single <audio> owner. This component must NEVER create an <audio> element or call new Audio().`
2. Implement `usePeaks`: fetch → arrayBuffer → `decodeAudioData` → downsample. Return `null` while pending.
3. Implement the paged window math, fixed-grid sampling (port from mock `:629–658`), and bar rendering SVG.
4. Implement moving mode: `viewStart = position - windowSec/2`, rAF loop reading `audioEl.currentTime`.
5. Implement the playhead line (SVG `<line>`) and played/unplayed bar coloring.
6. Implement the ruler row (port from mock `:667–673`).
7. Implement click-to-jump and drag-to-scrub (port from mock `:676–710`).
8. Add `prefers-reduced-motion` guard: if true, override `mode` to `'paged'` and skip rAF.
9. Add keyboard handler (`←`/`→` ±5 s); add `aria-*` attributes per accessibility contract.
10. Export `WaveformTape`, `usePeaks`, `TAPE_ZOOM_PRESETS_SEC`, `TapeZoomPreset`, `PEAKS_COUNT`.
11. Run the single-owner grep: `grep -rn '<audio\|new Audio(' frontend/src/` — `WaveformTape.tsx` must not appear.
12. Run `npm -C frontend run build` and `npm -C frontend run lint` — fix all issues.

## Acceptance criteria

- `frontend/src/app/layout/WaveformTape.tsx` exists and exports `WaveformTape`, `usePeaks`, `TAPE_ZOOM_PRESETS_SEC`, `PEAKS_COUNT`.
- **Single-owner grep passes:** `grep -rn '<audio\|new Audio(' frontend/src/` does NOT match `WaveformTape.tsx`. No `<audio>` element or `new Audio()` call anywhere in the file.
- `usePeaks` decodes via `AudioContext` only — no `<audio>` or `MediaElementSourceNode` created.
- Fixed-grid sampling: bar `i` samples absolute time `alignedStart + (i+0.5)*gridSec`, not `viewStart + i/N*windowSec`. Shape is stable as `position` advances within a page (bars don't crawl).
- Paged mode: advancing `position` past `viewStart + windowSec` causes `pageStart` to snap to the next page — no continuous scroll.
- Moving mode: playhead stays at center; bar row scrolls. rAF loop active during playback; cancelled on unmount.
- `prefers-reduced-motion: reduce` → mode is forced to `'paged'`; no rAF scroll loop.
- Click at x = 50% of tape width calls `seek` with ≈ `viewStart + windowSec / 2`.
- Drag calls `seek` continuously with clamped values.
- Keyboard `←`/`→` calls `seek(position ± 5)`.
- Ruler ticks show `m:ss` labels at a zoom-adaptive interval (~3 ticks across viewport).
- `npm -C frontend run build` passes with no TypeScript errors.
- `npm -C frontend run lint` passes.

## Out of scope

- Zoom preset control UI — task 007.
- Minimap — task 007.
- PlayerBar integration / toggle / duration cap — task 008.
- CSS for grow-upward region — task 009.
- Vitest tests for the tape — task 009.
- Any backend work.
- Annotation / edit-marking — post-V2.

## References

- `frontend/src/demo/stages/siteMockup/shared.tsx:551–770` — `speechPeakAt` (`:575`), `MockWaveTape` (`:616`); fixed-grid sampling (`:638–658`); paged/scroll math (`:629–635`); ruler (`:667–673`); drag-to-scrub (`:686–710`)
- `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx` — `ZOOM_PRESETS = [120, 60, 30, 15, 8]` (note: reversed vs. export order; `TAPE_ZOOM_PRESETS_SEC` is `[8, 15, 30, 60, 120]`)
- `frontend/src/app/layout/WaveformStrip.tsx:20–98` — single-owner wavesurfer binding (reference shape; tape does not use wavesurfer's renderer — it renders its own SVG bars)
- `frontend/src/store/playerBus.ts:162` — `seek(seconds)`
- `frontend/src/store/playerBus.ts:171` — `reportTime` (owned by PlayerBar, NOT called from tape)
- `frontend/src/store/playerBus.ts:202` — `usePlayerBus()`
- `docs/specs/audio-player.md` 1.6.0 §5.2 (tape interaction), §5.3 (fixed-grid sampling — binding), §5.4 (browser peak provider)
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E` — F4 (single-owner), F5 (reduced motion is free under paged-default)
- `plans/audio_player_waveform_scrubber/01-roadmap.md` — "Port, don't re-derive"; W2-006 description; architecture clarified section (fixed-grid binding)
- `docs/specs/audio-player.md §2.3` — single-owner invariants; conversion grep
- `docs/decisions/ADR-0010-single-owner-audio-player.md` — single `<audio>` invariant
