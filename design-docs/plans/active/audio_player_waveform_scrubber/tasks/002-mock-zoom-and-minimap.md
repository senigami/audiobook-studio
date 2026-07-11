# 002 — Mock zoom presets and minimap

status: done
workload: W0 — Mock prototype (feel-first)
blocked-by: 001
blocks: 003

## Goal

Add two companion controls to the tape prototype: (1) a **bounded discrete
zoom-preset selector** styled after the existing cover-slider (snap dots, five
presets of 8/15/30/60/120 seconds across the viewport), and (2) a **minimap
strip** showing the full synthetic clip as a compressed waveform with a
translucent draggable window rectangle whose width reflects the current zoom
span. Both controls live in a new file
`frontend/src/demo/stages/siteMockup/MockTapeControls.tsx` and are exported for
use by task 003. Zoom state is lifted to the `PlayerBar` component in task 003;
here the components receive it as props.

## Why it matters

The zoom presets and minimap are first-class design decisions locked by the owner
(proposal §9, decisions 4 and F3 from the audit). The minimap is specifically
called out as load-bearing: it makes the overview/detail relationship visible
("the thing that makes pro timelines learnable") and is the only whole-clip
navigation surface — the tape never shows the full clip itself. Designing and
reviewing the feel of these two controls before touching the real app is the
explicit purpose of the mock-first workload. Without them the owner sign-off gate
(003 → W1) cannot be reached.

## Files

- **Create:** `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx`
  — contains `ZoomPresetControl` and `TapeMinimapStrip`; both exported.
- **Reference (do not modify):** `frontend/src/demo/stages/siteMockup/shared.tsx`
  — import `Row`, `Col` from here for layout; `MOCK_PEAKS` from task 001 is
  re-exported from `shared.tsx` and used by `TapeMinimapStrip`.
- **CSS:** add `.nsp-zoom-*` and `.nsp-minimap-*` rules to
  `frontend/src/demo/stages/siteMockup/mockup.css` after the tape rules added
  by task 001.

## Target shape / contract

### Zoom presets

```ts
const ZOOM_PRESETS = [120, 60, 30, 15, 8] as const;  // seconds across viewport
type ZoomPreset = typeof ZOOM_PRESETS[number];
// Note: index 0 = most zoomed-out (120 s); index 4 = most zoomed-in (8 s).
// The slider renders left-to-right from most-zoomed-out to most-zoomed-in.

interface ZoomPresetControlProps {
  windowSec: ZoomPreset;
  onZoomChange: (preset: ZoomPreset) => void;
}
```

**Visual design** — model after the cover-size slider already in the codebase:

- A horizontal row of five circular tick dots (filled vs. outlined to indicate
  the active preset), connected by a thin track line behind them.
- Active dot: `background: var(--accent)`, border `var(--accent)`, size 10 px.
- Inactive dot: `background: var(--surface)`, border `var(--border)`, size 8 px.
  On hover: border `var(--accent)`.
- Track line: 2 px, `var(--border)`.
- Labels below each dot: the preset value in seconds (e.g. "120s", "60s", "30s",
  "15s", "8s"), `var(--type-micro)` size, `var(--text-muted)`.
- Total width: `min-content`; flex-shrink: 0. The full zoom row in the tape
  region should be `display: flex; align-items: center; gap: 8px` with a small
  label "Zoom" at the left (`var(--type-micro)`, `var(--text-muted)`).
- Clicking any dot calls `onZoomChange` with that preset's value.
- Keyboard: the dot row is a `role="radiogroup"` with each dot as
  `role="radio"`, `aria-checked`, and `aria-label="X seconds"`. Left/right
  arrow keys move between presets and call `onZoomChange`.

**Wheel / pinch snapping:**

For the mock, wire `onWheel` on the tape wrapper element (in task 003) to
snap through presets: wheel down (deltaY > 0) increases `windowSec` to the
next larger preset (zoom out); wheel up decreases. Implement a helper:

```ts
export function snapZoom(current: ZoomPreset, direction: 'in' | 'out'): ZoomPreset {
  const idx = ZOOM_PRESETS.indexOf(current);
  if (direction === 'out') return ZOOM_PRESETS[Math.min(idx + 1, ZOOM_PRESETS.length - 1)];
  return ZOOM_PRESETS[Math.max(idx - 1, 0)];
}
```

Export `ZOOM_PRESETS`, `ZoomPreset`, `ZoomPresetControl`, and `snapZoom` from
`MockTapeControls.tsx`.

### Minimap strip

```ts
interface TapeMinimapStripProps {
  /** Total clip duration in seconds. */
  durationSec: number;
  /** Current playback position in seconds. */
  currentTimeSec: number;
  /** Width of the tape viewport in seconds (current zoom window span). */
  windowSec: number;
  /** Called when the user drags the window rectangle to a new position.
   *  newTimeSec is the START of the window, clamped to [0, durationSec - windowSec]. */
  onSeek: (newTimeSec: number) => void;
  /** Strip height in pixels. Default 28. */
  height?: number;
}
```

**Visual design:**

- SVG `width="100%"` `height={height}` `preserveAspectRatio="none"`.
- Render ALL bars from the `MOCK_PEAKS` array (imported from `shared.tsx`) at a
  compressed width so the full clip fits in the strip. Target bar width 2 px,
  gap 1 px; scale the SVG viewBox to accommodate all peaks.
- Bar color: `var(--color-wave)`, opacity 0.45. No played/unplayed distinction
  in the minimap — it is purely navigational.
- Window rectangle: a semi-transparent `<rect>` spanning the current page's
  `[pageStart, pageEnd]` mapped to the strip's coordinate space.
  Fill: `var(--accent)`, opacity 0.15; stroke: `var(--accent)`, strokeWidth 1,
  opacity 0.6.
- Window rectangle width: `(windowSec / durationSec) * 100%` of the strip
  width. Window rect left edge: `(pageStart / durationSec) * 100%` of the strip,
  where `pageStart = Math.floor(currentTimeSec / windowSec) * windowSec`.
- Playhead line inside the minimap: a thin vertical line at `currentTimeSec`
  position, color `var(--accent)`, strokeWidth 1, opacity 0.8.

**Drag interaction:**

The user drags the window rectangle to navigate. Attach `onMouseDown` to the
SVG element. On drag: map pointer X to a clip-relative time (same fraction
approach as task 001 click-to-seek), treat the result as the new `pageStart`,
call `onSeek(Math.max(0, Math.min(newTime, durationSec - windowSec)))`.
Snap to page boundaries is NOT required — free-position drag is fine in W0.
Use `useRef` for the dragging flag; wire global `mousemove`/`mouseup` in a
`useEffect` cleanup (same pattern as task 001 drag-to-scrub).

**Minimum tap/drag target:** the strip height is 28 px by default; the `<svg>`
element should have `style={{ cursor: 'ew-resize', touchAction: 'none' }}` so
the grab affordance is clear. The window rect's draggable stroke is at least
44 px effectively wide (because the strip occupies the full bar width).

### Layout in the tape region

The tape region (opened by task 003) will have this vertical layout:

```
┌────────────────────────────────────────────────────────────┐
│  MockWaveTape  (height 104 px)                             │
├────────────────────────────────────────────────────────────┤
│  TapeMinimapStrip (height 28 px)  │  Zoom: [•][o][o][o][o] │
└────────────────────────────────────────────────────────────┘
```

The bottom control bar is a flex row: minimap takes `flex: 1`; zoom control is
`flex-shrink: 0`. Padding `6px 14px`. Divider between tape and control bar:
`1px solid var(--border)`.

### CSS additions

Append to `mockup.css` after the `.nsp-tape-canvas` block (added by task 001):

```css
/* Zoom control */
.nsp-zoom-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.nsp-zoom-track {
  display: flex;
  align-items: center;
  gap: 0;
  position: relative;
}
.nsp-zoom-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, width 0.1s, height 0.1s;
  flex-shrink: 0;
  margin: 0 6px;
}
.nsp-zoom-dot[aria-checked="true"] {
  width: 10px;
  height: 10px;
  background: var(--accent);
  border-color: var(--accent);
}
.nsp-zoom-dot:hover {
  border-color: var(--accent);
}
/* connecting track line behind dots */
.nsp-zoom-track::before {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  height: 2px;
  background: var(--border);
  z-index: 0;
  pointer-events: none;
}

/* Minimap */
.nsp-minimap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-button, 4px);
}

/* Tape bottom bar (minimap + zoom row) */
.nsp-tape-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

@media (prefers-reduced-motion: reduce) {
  .nsp-zoom-dot { transition: none !important; }
}
```

## Steps

1. Create `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx`.
   - Add `'use client'` header only if required by the build; otherwise omit.
   - Import `React`, `{ useState, useRef, useEffect }` from `'react'`.
   - Import `{ Row }` from `'./shared'`.
   - Import `{ MOCK_PEAKS }` from `'./shared'` (task 001 must be complete first).
   - Define and export `ZOOM_PRESETS`, `ZoomPreset`, `snapZoom`.
   - Implement and export `ZoomPresetControl`.
   - Implement and export `TapeMinimapStrip`.

2. Open `mockup.css` and append the `.nsp-zoom-*`, `.nsp-minimap`,
   `.nsp-tape-footer` CSS blocks after the tape rules from task 001.

3. Run `npm -C frontend run build` — fix any TypeScript errors.

4. Run `npm -C frontend run lint` — fix any eslint warnings in the new file.

5. Manual visual check: temporarily render both new components inside
   `siteMockupStage.tsx` or `StyleguidePage.tsx` with hardcoded props to confirm:
   - Zoom preset dots render correctly; active dot is filled accent; clicking
     cycles through presets and dot updates.
   - Minimap renders compressed bars; window rect appears at the correct
     proportional position; dragging the window calls `onSeek`.
   - No console errors.

## Acceptance criteria

- `MockTapeControls.tsx` exports: `ZOOM_PRESETS`, `ZoomPreset` (type),
  `ZoomPresetControl`, `TapeMinimapStrip`, `snapZoom`.
- `ZOOM_PRESETS` is `[120, 60, 30, 15, 8]` (exactly these five values).
- `snapZoom('out')` from preset 30 returns 60; `snapZoom('in')` returns 15;
  `snapZoom('in')` from 8 returns 8 (clamped); `snapZoom('out')` from 120
  returns 120 (clamped).
- `ZoomPresetControl`: five dots render, active dot has `aria-checked="true"`,
  clicking a dot fires `onZoomChange` with its preset value. Keyboard left/right
  arrows navigate presets.
- `TapeMinimapStrip`: window rect width equals `(windowSec / durationSec)` of
  the strip width within ±2 px rounding; dragging calls `onSeek` with a value
  in `[0, durationSec - windowSec]`.
- `npm -C frontend run build` exits 0 on changed files.
- eslint reports no new errors or warnings for the new file.
- Visual: zoom dots follow the cover-slider aesthetic (round dots on a track
  line, tick labels); minimap shows compressed-but-readable peak shape.

## Out of scope

- Pinch-gesture zoom (trackpad pinch); wheel snap is sufficient for W0.
- Persisting zoom preset across page reloads.
- Wiring the controls into the mock `PlayerBar` (task 003).
- Any connection to real audio decode, wavesurfer, or `<audio>`.
- Touchscreen drag on the minimap (mouse-only is sufficient for W0).

## References

- Proposal §3 (zoom bounded discrete presets, presets "8/15/30/60/120 s",
  pinch/wheel snaps, minimap = full-clip strip + draggable window rect):
  `design-docs/plans/audio_player_scrubbing_waveform_proposal.md`
- Locked decision F4 in audit: `design-docs/plans/audio_player_waveform_scrubber/00-audit-report.md` §F
- Roadmap W0 task 002: `design-docs/plans/audio_player_waveform_scrubber/01-roadmap.md`
- `MOCK_PEAKS` and `MockWaveTape` from task 001: `shared.tsx` (after line 501)
- `Row/Col` primitives: `shared.tsx:26–48`
- Cover-slider aesthetic precedent: existing cover-size slider in the mockup
  (search `siteMockupStage.tsx` for the size-slider component for visual
  reference)
