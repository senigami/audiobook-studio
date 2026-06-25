# 007 — Zoom slider + minimap + ruler (port MockTapeControls)

status: todo
workload: W2 — Port the tape to the live PlayerBar (browser-decoded)
blocked-by: 006
blocks: 008

## Goal

Port `ZoomPresetControl`, `TapeMinimapStrip`, and `snapZoom` from `MockTapeControls.tsx` (reference: `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx`) into live sub-components alongside `WaveformTape`. Cover-slider-style zoom (track + tick dots + accent thumb, **no second-labels**, presets `8/15/30/60/120 s`, pinch/wheel snap). Minimap (whole-clip strip from the same peak array + draggable window rect). Smart `m:ss` time ruler (zoom-adaptive interval, ~3 ticks). Zoom-in caps at available peak resolution; zoom-out cap is always 120 s.

**Port, don't re-derive.** `MockTapeControls.tsx` is the reference. The live components replace `speechPeakAt` with the real peak array from task 006's `usePeaks`.

## Why it matters

Zoom and the minimap complete the overview↔detail relationship that makes the tape useful at long durations. Without zoom the tape always shows the same 30 s window; without the minimap the user has no sense of where they are in the full clip or how to navigate coarsely.

## Files

### Create

- `frontend/src/app/layout/WaveformTapeZoom.tsx` — cover-slider zoom preset control.
- `frontend/src/app/layout/WaveformTapeMinimap.tsx` — whole-clip strip + draggable window rectangle.

### Edit

- `frontend/src/app/layout/WaveformTape.tsx` — wire `windowSec` into the paged window model (already prop-ready from task 006); attach `onWheel` for zoom snapping; render `<WaveformTapeMinimap>` and the ruler below the main canvas; accept `onZoomChange` prop; export `snapZoom` from the module.

### Read (reference, do not edit)

- `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx:1–223` — `ZOOM_PRESETS`, `snapZoom`, `ZoomPresetControl`, `TapeMinimapStrip` (full source).
- `frontend/src/app/layout/WaveformTape.tsx` (task 006 output) — `TAPE_ZOOM_PRESETS_SEC`, `PEAKS_COUNT`, `usePeaks`.

## Target shape / contract

### Zoom preset control (`WaveformTapeZoom.tsx`)

Port `ZoomPresetControl` from `MockTapeControls.tsx:34–84`.

```typescript
import { TAPE_ZOOM_PRESETS_SEC, TapeZoomPreset } from './WaveformTape';

export interface WaveformTapeZoomProps {
  /** Currently active preset value in seconds (e.g. 30). */
  windowSec: TapeZoomPreset;
  onZoomChange: (preset: TapeZoomPreset) => void;
  /** Total clip duration — used to compute the zoom-in cap. */
  duration: number;
  /** Number of peaks available from usePeaks — sets the zoom-in resolution cap.
   *  When null (still decoding) all presets are enabled. */
  availablePeaks: number | null;
  /** Container width in pixels — used alongside availablePeaks for the cap calc. */
  containerWidthPx: number;
}

export const WaveformTapeZoom: React.FC<WaveformTapeZoomProps> = (props) => { ... };
```

**Cover-slider visual (port from `MockTapeControls.tsx:38–84`):** same CSS class names as the Library size slider (`ns-size-control`, `ns-size-slider-wrap`, `ns-size-track`, `ns-size-tick`, `ns-size-slider`) — reuse those existing classes so the zoom control matches the library cover-slider look without new CSS. The slider `value` = index into `TAPE_ZOOM_PRESETS_SEC` (0 = 8 s = most zoomed in; 4 = 120 s = most zoomed out).

**No second-labels.** Do not render text labels ("8s", "30s", etc.) next to tick dots. The `aria-label` on the `<input>` suffices for accessibility; visual tick dots only.

**Zoom-in cap:** the most-zoomed-in preset that does not magnify past available peak resolution:
```typescript
// pixels per second at this preset = containerWidthPx / presetSec
// peaks per second = availablePeaks / duration
// valid if: containerWidthPx / presetSec <= availablePeaks / duration
const zoomInCapIdx = availablePeaks && duration > 0
  ? TAPE_ZOOM_PRESETS_SEC.findIndex(
      secs => (containerWidthPx / secs) <= (availablePeaks / duration)
    )
  : 0; // all presets valid while still decoding
```
Presets with index < `zoomInCapIdx` are visually disabled (`.tape-zoom-dot--disabled`, opacity 0.3) and not selectable. The slider `min` is set to `zoomInCapIdx`.

**Zoom-out cap:** always index 4 (120 s) — the hard floor. Never expose "show whole clip" on the zoom control; the minimap owns whole-clip navigation.

**`snapZoom(current, direction)` — port from `MockTapeControls.tsx:20–24`:**
```typescript
export function snapZoom(current: TapeZoomPreset, direction: 'in' | 'out'): TapeZoomPreset {
  const idx = TAPE_ZOOM_PRESETS_SEC.indexOf(current);
  if (direction === 'out') return TAPE_ZOOM_PRESETS_SEC[Math.min(idx + 1, 4)];
  return TAPE_ZOOM_PRESETS_SEC[Math.max(idx - 1, 0)];
}
export { snapZoom };
```
Export from `WaveformTapeZoom.tsx`; also re-export from `WaveformTape.tsx`.

**Pinch/wheel snap:** `WaveformTape.tsx` receives an `onWheel` handler that calls `snapZoom` and fires `onZoomChange`. One scroll detent = one preset step. Wheel-down = more seconds visible (zoom out). Pinch scale delta < 1 = zoom in; > 1 = zoom out.

**Keyboard:** `+`/`-` on the focused tape container steps the preset. Wire in `WaveformTape.tsx`'s existing keyboard handler (extend the `←`/`→` handler from task 006).

**Accessibility:**
- `<input type="range">`: `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={4}`, `aria-valuenow={currentIdx}`, `aria-label="Zoom level"`.
- Tick dot aria-labels: `aria-label="8 seconds"` … `"120 seconds"` (viewport span per preset).
- Min touch target: 44 × 44 pt for thumb and ± buttons (HIG; use `min-width/min-height: 44px` in CSS token via task 009).

**Contrast on glass:** active tick dot and slider thumb use `var(--accent)` solid fill — not glass-on-glass tint (spec §5.2, proposal §5).

### Minimap (`WaveformTapeMinimap.tsx`)

Port `TapeMinimapStrip` from `MockTapeControls.tsx:103–223`.

```typescript
export interface WaveformTapeMinimapProps {
  /** Total clip duration in seconds. */
  duration: number;
  /** Current playback position in seconds. */
  currentTimeSec: number;
  /** Start of the tape's current visible window (seconds). */
  windowStartSec: number;
  /** Width of the tape's current window (seconds = active preset). */
  windowSec: number;
  /** Called when user drags the window rect or clicks outside it. */
  onSeek: (newWindowStartSec: number) => void;
  /** Peak array from usePeaks — renders the whole-clip amplitude shape.
   *  If null (still decoding), render a plain tinted bar as fallback. */
  peaks: number[] | null;
  /** Strip height in pixels. Default 28. */
  height?: number;
}

export const WaveformTapeMinimap: React.FC<WaveformTapeMinimapProps> = (props) => { ... };
```

**Whole-clip strip (port from `MockTapeControls.tsx:118–120`):** sample the real peak array at `MINIMAP_BARS = 200` evenly-spaced points across `[0, duration]`:
```typescript
const minimapPeaks = Array.from({ length: MINIMAP_BARS }, (_, i) => {
  if (!peaks || peaks.length === 0) return 0.4; // fallback flat bar
  const idx = Math.floor(((i + 0.5) / MINIMAP_BARS) * (peaks.length - 1));
  return peaks[idx] ?? 0;
});
```

**Window rectangle (port from `MockTapeControls.tsx:126–128`):**
```typescript
const pageStart = Math.floor(currentTimeSec / windowSec) * windowSec;
const rectLeft = duration > 0 ? (pageStart / duration) * viewW : 0;
const rectWidth = duration > 0 ? (windowSec / duration) * viewW : viewW;
```
Minimum rendered width: 4 px (prevents un-grabbable rect). Fill: `var(--accent)` at 15% opacity; border: `var(--accent)` solid (1 px) — not glass-on-glass.

**Drag to navigate (port from `MockTapeControls.tsx:134–165`):** `pointerToPageStart` → clamp to `[0, duration - windowSec]` → `onSeek(newStart)`. Minimap does NOT call `bus.seek` directly — delegates upward to parent.

**Click outside rectangle:** clicking on the minimap strip outside the current rectangle centers the clicked position → `onSeek(clickedTime - windowSec/2)` clamped to `[0, duration - windowSec]`.

**Playhead indicator:** 1 px vertical `<line>` at `(currentTimeSec / duration) * viewW`. Color: `var(--color-wave-cursor, var(--accent))`. Gives "you are here" marker during coarse navigation.

**Accessibility:**
- Container: `role="region"`, `aria-label="Clip overview — drag to navigate"`.
- Keyboard `←`/`→` on focused minimap steps window by one `windowSec` forward/back.

### `WaveformTape.tsx` additions (extend task 006 output)

- Accept new props: `onZoomChange: (preset: TapeZoomPreset) => void`, `peaks: number[] | null` (received from parent `PlayerBar` which calls `usePeaks`).
- Render `<WaveformTapeZoom>` in a header row above the SVG canvas.
- Render `<WaveformTapeMinimap>` below the SVG canvas.
- Attach `onWheel` to the SVG element for zoom snapping.
- `containerWidthPx` measured by reading the tape SVG element's `offsetWidth` (already available from the SVG ref).

## Steps

1. Create `WaveformTapeZoom.tsx`: port `ZoomPresetControl` from `MockTapeControls.tsx:34–84`; use `ns-size-*` classes; add zoom-in cap logic; add `snapZoom` export; add keyboard/wheel hook.
2. Create `WaveformTapeMinimap.tsx`: port `TapeMinimapStrip` from `MockTapeControls.tsx:103–223`; replace `speechPeakAt` calls with real peak array lookups; add click-outside-rectangle jump.
3. Edit `WaveformTape.tsx`: add `onZoomChange` and `peaks` props; render `<WaveformTapeZoom>` above canvas; render `<WaveformTapeMinimap>` below; wire `onWheel`; re-export `snapZoom`.
4. Confirm zoom resets to default preset (index 2, 30 s) on `requestId` change — this is controlled in `PlayerBar` (task 008 via `setZoomPresetIndex(2)` in the reset effect); document as a dependency.
5. Run `npm -C frontend run build` and `npm -C frontend run lint` on all three files.
6. Run the single-owner grep and confirm none of the three new files appear.

## Acceptance criteria

- `WaveformTapeZoom` renders 5 tick dots; the active dot is highlighted with `var(--accent)` solid fill.
- ± buttons and slider step the preset index, clamped to `[0, 4]`.
- A preset at or beyond the zoom-in cap (based on `availablePeaks` / `containerWidthPx` / `duration`) is visually disabled (opacity 0.3) and cannot be selected.
- No second-labels (text "8s", "30s", etc.) render next to the tick dots.
- Scrolling the mouse wheel over the tape steps the preset (wheel-down = zoom out / more seconds visible).
- `WaveformTapeMinimap` renders a rectangle whose width is proportional to `windowSec / duration`.
- Dragging the minimap rectangle calls `onSeek` with the clamped new `windowStartSec`.
- Clicking outside the minimap rectangle calls `onSeek` to center on the clicked position.
- The minimap playhead line is visible and positioned at `position / duration`.
- Playhead line and window rectangle border use solid `var(--accent)` — not glass tint.
- Keyboard `+`/`-` on focused tape steps zoom; `←`/`→` on focused minimap steps the window.
- `npm -C frontend run build` passes with no TypeScript errors on all three files.
- `npm -C frontend run lint` passes on all three files.
- Single-owner grep passes: `grep -rn '<audio\|new Audio(' frontend/src/` does NOT match `WaveformTapeZoom.tsx` or `WaveformTapeMinimap.tsx`.

## Out of scope

- PlayerBar integration / toggle / duration cap — task 008.
- CSS for the tape region height and grow-upward layout — task 009.
- Continuous-scroll zoom — never; paged is the only tape motion mode (moving mode = playhead fixed, bars scroll, but the zoom window does not continuously expand).
- Zoom-out past 120 s — hard cap by design.
- Any backend work.

## References

- `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx:1–223` — full source of `ZOOM_PRESETS`, `snapZoom`, `ZoomPresetControl`, `TapeMinimapStrip` (the reference to port from)
- `frontend/src/app/layout/WaveformTape.tsx` (task 006) — `TAPE_ZOOM_PRESETS_SEC`, `PEAKS_COUNT`, `usePeaks`, `TapeZoomPreset`
- `frontend/src/store/playerBus.ts:162` — `seek(seconds)` (called via `onSeek`, not directly from minimap)
- `design-docs/specs/audio-player.md` 1.6.0 §5.2 — zoom presets (cover-slider, no second-labels, 8/15/30/60/120 s, pinch/wheel snap, zoom-in cap, zoom-out cap); minimap (draggable window rect, whole-clip nav surface); ruler (zoom-adaptive interval ~3 ticks); contrast on glass (solid accent)
- `design-docs/plans/audio_player_waveform_scrubber/00-audit-report.md §F` — locked decisions: decision 4 (bounded discrete presets, zoom-in cap = native peak resolution, zoom-out cap before blob)
- `design-docs/plans/audio_player_waveform_scrubber/01-roadmap.md` — "Port, don't re-derive"; W2-007 description
- `design-docs/specs/testing-standards.md` — R2 (mock boundaries), R4 (no sleep-based timing)
