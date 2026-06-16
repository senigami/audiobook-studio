# 007 — Zoom presets + minimap (real)

status: todo
workload: W2 — Real tape + zoom (browser-decoded)
blocked-by: 006
blocks: 008

## Goal

Port the W0-approved zoom-preset control and minimap to the real `WaveformTape` component. Zoom is a bounded set of discrete snap-point presets (cover-slider style). The minimap is a thin full-clip strip with a draggable rectangle representing the tape's current window — it is the whole-clip navigation surface, distinct from the zoomed detail tape. Both zoom and minimap are self-contained sub-components that live alongside `WaveformTape` and are exported for use by `PlayerBar` (task 008).

## Why it matters

Zoom presets and the minimap are the two interaction surfaces that make the tape useful at long durations. Without zoom the tape always shows the same 30 s window; without the minimap the user has no sense of where they are in the full clip or how to navigate coarsely. Together they complete the overview↔detail relationship that makes the tape learnable (proposal §3).

## Files

- **Edit:** `frontend/src/app/layout/WaveformTape.tsx` — wire zoom preset index into the paged window model; expose a minimap data shape.
- **Create:** `frontend/src/app/layout/WaveformTapeZoom.tsx` — the zoom preset control (cover-slider style).
- **Create:** `frontend/src/app/layout/WaveformTapeMinimap.tsx` — the minimap strip component.

## Target shape / contract

### Zoom preset control (`WaveformTapeZoom.tsx`)

```typescript
// Preset values from 006: TAPE_ZOOM_PRESETS_SEC = [8, 15, 30, 60, 120]
// Index 0 = most zoomed in (8 s across viewport); index 4 = most zoomed out (120 s).

interface WaveformTapeZoomProps {
  presetIndex: number;           // controlled
  onPresetChange: (index: number) => void;
  /** Total clip duration — used to compute the zoom-in cap (native peak resolution). */
  duration: number;
  /** Number of peaks available — sets the maximum zoom-in resolution. Derived from
   *  wavesurfer's decoded peaks array length; passed down from WaveformTape. */
  availablePeaks?: number;
}

export const WaveformTapeZoom: React.FC<WaveformTapeZoomProps> = (props) => { ... };
```

**Cover-slider style:** render preset count as tick dots (5 dots for 5 presets). The active preset is highlighted. A horizontal track connects them with a draggable thumb that snaps to the nearest dot on release. Secondary `-` / `+` buttons at each end step through presets.

**Zoom-in cap:** the most-zoomed-in preset that is valid = the smallest seconds-per-viewport that doesn't magnify past the available peak resolution. Concretely: `validPresetIndex = presets.findIndex(secs => (containerWidthPx / secs) <= (availablePeaks / duration))`. Presets beyond the cap are visually disabled and unselectable. When `availablePeaks` is not yet known, all presets are available (err toward showing more detail).

**Zoom-out cap:** the least-detailed preset is `120 s` (index 4) — that is the hard floor; never zoom out further (no "show whole clip" option on the zoom control). The minimap owns whole-clip navigation.

**Pinch / wheel snap:** attach `onWheel` to the tape container (passed up from `WaveformTape`) — one detent steps one preset. Pinch gesture (trackpad `GestureEvent` or `TouchEvent` scale delta) snaps through presets in the same direction. Each step clamps to `[0, 4]`.

**Keyboard:** `+` / `-` keys on the focused tape region step the preset. This is wired in `WaveformTape.tsx`'s keyboard handler (extended from task 006's ←/→ handler).

**Accessibility:**
- The slider track has `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={4}`, `aria-valuenow={presetIndex}`, `aria-label="Zoom level"`.
- Tick dot labels: `aria-label="8 seconds"` … `"120 seconds"` (the viewport span each preset shows).
- Minimum touch target: 44 × 44 pt for the thumb and ± buttons (HIG).

**Contrast on glass:** the active tick dot and slider thumb use `var(--accent)` as a solid fill — not a glass tint — so they are visible against the translucent player bar surface (proposal §5, "solid accent for the playhead, not glass-on-glass tint").

### Minimap (`WaveformTapeMinimap.tsx`)

```typescript
interface WaveformTapeMinimapProps {
  /** Total clip duration in seconds. */
  duration: number;
  /** Start of the tape's current visible window (seconds). */
  windowStartSec: number;
  /** Width of the tape's current window (seconds = the active preset). */
  windowSec: number;
  /** Called when the user drags the minimap rectangle to a new position. */
  onSeek: (newWindowStartSec: number) => void;
  /** The wavesurfer instance — used to render whole-clip peaks in the minimap strip. */
  wsInstance?: { exportPeaks?: () => number[][] } | null;
}

export const WaveformTapeMinimap: React.FC<WaveformTapeMinimapProps> = (props) => { ... };
```

**Minimap strip:** a thin (`height: ~20 px`) horizontally-spanning bar that shows the entire clip's amplitude shape — either a simplified peak rendering (if `wsInstance.exportPeaks()` is available) or a plain tinted bar as fallback. The whole clip maps to the full width of the minimap.

**Window rectangle:** an absolutely-positioned translucent rectangle overlaid on the strip. Its `left` and `width` are proportional: `left = (windowStartSec / duration) * 100%`; `width = (windowSec / duration) * 100%`. Minimum rendered width: 8 px (prevents it from becoming un-grabbable on very short zoom windows relative to a long clip).

**Drag to navigate:** the user drags the rectangle horizontally. On `pointermove`, clamp the new `windowStartSec` to `[0, duration - windowSec]`, then call `onSeek(newStart)` which in turn calls `bus.seek(newStart)` in the parent. The minimap does NOT call `bus.seek` directly — it delegates upward.

**Click outside rectangle:** clicking on the minimap strip outside the current rectangle jumps the tape window to center the clicked position, then calls `onSeek`.

**Accessibility:**
- Container: `role="region"`, `aria-label="Clip overview"`.
- Rectangle: `role="slider"`, `aria-label="Navigate clip position"`, `aria-valuenow` as a percentage string (rounded to nearest integer), keyboard ←/→ steps by one `windowSec` forward/back.
- Minimum touch target for the rectangle: enforce minimum 44 pt on the drag handle region.

**Contrast on glass:** the window rectangle uses `var(--accent)` at 30% opacity for the fill and `var(--accent)` solid for its left/right border handles — visible against the glass surface (same principle as playhead).

**Playhead indicator in minimap:** a 1 px vertical line inside the minimap at the current `position` within the full-clip map (`left = (position / duration) * 100%`). Color: `var(--color-wave-cursor)` (accent). This gives the user a secondary "you are here" marker even when coarsely navigating.

## Steps

1. Export `TAPE_ZOOM_PRESETS_SEC` from `WaveformTape.tsx` (already called for in task 006 step 9) and import it in both new files.
2. Implement `WaveformTapeZoom.tsx`: tick-dot slider, ±  buttons, cover-slider visual, zoom-in cap logic, wheel/pinch handler (exposed as a ref callback for the tape container to attach).
3. Implement `WaveformTapeMinimap.tsx`: full-clip strip (simplified peaks or fallback bar), window rectangle, drag nav, click-outside-rectangle jump, playhead line.
4. Extend `WaveformTape.tsx` to: (a) accept and forward `zoomPresetIndex` to the paged window model (already scaffolded in 006), (b) expose the wavesurfer instance via a ref/callback for the minimap to read peaks, (c) attach `onWheel` for zoom snapping, (d) render `<WaveformTapeMinimap>` below the main tape canvas, (e) render `<WaveformTapeZoom>` in the tape header region.
5. Ensure zoom state is reset to the default preset (index 2 = 30 s) when `requestId` changes — this is managed in `PlayerBar` (task 008) which controls the `zoomPresetIndex` prop.

## Acceptance criteria

- `WaveformTapeZoom` renders 5 tick dots; the active dot is highlighted with `var(--accent)`.
- ± buttons step the preset index by 1, clamped to `[0, 4]`.
- Scrolling the mouse wheel over the tape steps the preset (one detent = one step, direction matches expectation: wheel-down = zoom out).
- A preset at or beyond the zoom-in cap (based on `availablePeaks`) is visually disabled and click/keyboard cannot select it.
- `WaveformTapeMinimap` renders a rectangle whose `width` is proportional to `windowSec / duration`.
- Dragging the minimap rectangle calls `onSeek` with the clamped new `windowStartSec`.
- Clicking outside the rectangle calls `onSeek` to center on the clicked position.
- The minimap playhead line is visible and positioned at `position / duration`.
- Playhead line and window rectangle handles use solid `var(--accent)` — confirmed visually not to disappear on the glass bar background.
- Keyboard `+`/`-` on the focused tape steps zoom; `←`/`→` on the minimap rectangle steps the window.
- `npm -C frontend run build` passes with no TypeScript errors.
- `npm -C frontend run lint` passes on all three files.
- Single-owner grep still passes: `grep -rn '<audio\|new Audio(' frontend/src/` does not match `WaveformTapeZoom.tsx` or `WaveformTapeMinimap.tsx`.

## Out of scope

- PlayerBar integration / toggle / duration cap (task 008).
- CSS for the tape region height and grow-upward layout (task 009).
- Continuous-scroll zoom (never; paged is the only mode).
- Zoom-out past 120 s (hard cap by design).
- Free-floating continuous zoom (discrete presets only).
- Any backend work.

## References

- `frontend/src/app/layout/WaveformTape.tsx` (created in 006) — the component these sub-components plug into.
- `frontend/src/store/playerBus.ts:162` — `seek(seconds)` (called via `onSeek` callback, not directly from minimap).
- `plans/audio_player_scrubbing_waveform_proposal.md §3` — zoom presets, minimap, interaction, contrast on glass.
- `plans/audio_player_scrubbing_waveform_proposal.md §5` — HIG: 44 pt targets, contrast, single-owner.
- `plans/audio_player_scrubbing_waveform_proposal.md §9, decisions 4 & 7` — bounded discrete presets, browser-first.
- `plans/audio_player_waveform_scrubber/00-audit-report.md §F, decision 4` — zoom-in cap = native peak resolution; zoom-out cap before blob.
- `plans/audio_player_waveform_scrubber/01-roadmap.md W2-007` — port W0 zoom + minimap to real component.
