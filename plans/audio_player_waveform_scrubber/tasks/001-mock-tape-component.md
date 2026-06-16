# 001 — Mock tape component

status: done
workload: W0 — Mock prototype (feel-first)
blocked-by: none
blocks: 002, 003

## Goal

Create `MockWaveTape` — a new SVG-based waveform component that replaces the
sinusoidal `WaveformSvg` for the tape prototype. It renders a **paged window**
of synthetic-but-peak-shaped data (speech bursts + silences) with a **moving
playhead** and page-advance when the playhead reaches the right edge. The
component lives in `shared.tsx` alongside the existing primitives, exports as
`MockWaveTape`, and is self-contained with no real audio dependency. The bar
region **grows upward** when the tape is open, implemented by revealing a taller
container above the player control row.

## Why it matters

The current `WaveformSvg` (shared.tsx:463–501) animates 30 bars with a pure
`Math.sin((i+tick)*0.4)` — uniform, undulating, no speech structure. Designing
the tape interaction against a sinusoid means the prototype will not feel like
real narration; page-advance timing and scrub granularity will be wrong. Finding
F3 (audit report) requires synthetic-but-peak-shaped data — speech-like bursts
separated by short silences — so the prototype reads authentically before any
real audio decode exists. This is the foundation all W0 tasks build on: 002
(zoom + minimap) and 003 (player integration) both accept a `MockWaveTape` prop.

## Files

- **Create/extend:** `frontend/src/demo/stages/siteMockup/shared.tsx`
  — add `MockWaveTape` after the existing `WaveformSvg` (currently ending at
  line 501). Do NOT remove or alter `WaveformSvg`; it is still used elsewhere.
- **Add CSS:** `frontend/src/demo/stages/siteMockup/mockup.css`
  — add tape-region rules after the existing player block (currently ending at
  line 665). The new CSS class family is `.nsp-tape-*`.

## Target shape / contract

### Synthetic peak data

Generate a static array of ~200 amplitude values (0–1 float) that mimic a
narration track: groups of 5–15 high-amplitude bars (speech bursts, values
0.4–1.0) separated by 2–5 low-amplitude bars (pauses/breaths, values 0.02–0.12).
Generate this once at module scope (a plain `const`) — no random seed at render
time; the shape must be deterministic. Example pattern for one burst+pause cycle
(repeat ~15 times with varied lengths to avoid mechanical regularity):

```
[0.55, 0.72, 0.88, 0.95, 0.80, 0.65, 0.70, 0.85, 0.78, 0.60,  // speech burst
 0.05, 0.03, 0.08, 0.04,                                          // pause
 0.60, 0.78, 0.90, 0.85, 0.70, 0.88, 0.75, 0.65,                 // burst
 0.04, 0.06, 0.03,                                                 // breath
 ...]
```

Total length should be ~200 values so that at a 30 s window the bars are not
visually crowded (target ~6–8 bars/sec of audio).

### Props

```ts
interface MockWaveTapeProps {
  /** Total clip duration in seconds (synthetic — drives paging math). */
  durationSec: number;
  /** Current playback position in seconds (drives playhead + page). */
  currentTimeSec: number;
  /** True while playing — drives playhead advance animation. */
  isPlaying: boolean;
  /** Zoom preset: seconds of audio visible across the tape viewport. */
  windowSec: number;       // default 30; controlled by task 002
  /** Called when user clicks or drags to a new position (seconds). */
  onSeek: (newTimeSec: number) => void;
  /** Tape pixel height. Default 104. */
  height?: number;
}
```

### Paging logic

- Current page index: `pageIndex = Math.floor(currentTimeSec / windowSec)`.
- Page start time: `pageStart = pageIndex * windowSec`.
- Page end time: `pageEnd = pageStart + windowSec`.
- Playhead X position: proportional within the page,
  `playheadX = ((currentTimeSec - pageStart) / windowSec) * svgWidth`.
- When `currentTimeSec >= pageEnd`, the next render naturally moves to the
  next page (pageIndex increments). Under `prefers-reduced-motion` this is
  always an instant cut. Without reduced motion it is also an instant cut at
  this stage (no animation needed in W0 — smooth transition can be added in W2).

### SVG rendering

- Map the synthetic peak array to the visible window. Calculate which peak
  indices correspond to `[pageStart, pageEnd]`:
  `firstIdx = Math.floor((pageStart / durationSec) * PEAKS.length)`,
  `lastIdx  = Math.ceil ((pageEnd   / durationSec) * PEAKS.length)`.
- Render bars for `PEAKS.slice(firstIdx, lastIdx)`, scaled to fit `svgWidth`.
- Bar colors: played region (`x < playheadX`) → `var(--color-wave-progress)`;
  unplayed region → `var(--color-wave)`; opacity 0.9 played / 0.55 unplayed.
- Playhead: a vertical `<line>` at `playheadX`, full SVG height, color
  `var(--accent)`, strokeWidth 2, opacity 0.9. It must be visually solid
  (not tinted) to satisfy the "contrast on glass" HIG guardrail (proposal §5).
- Bar width: aim for 4–6 px; gap between bars: 2 px. Use `preserveAspectRatio="none"` and let `width="100%"` handle scaling.

### Click-to-seek

Attach `onClick` to the wrapping `<div>` that maps `clientX` to a time
within the current page's window (same pattern as `handleSeek` in
`siteMockupStage.tsx:593–598`). Call `onSeek(newTimeSec)`.

### Drag-to-scrub (basic, W0)

Attach `onMouseDown` → set a dragging flag → `onMouseMove` on the window →
`onMouseUp` clears the flag. While dragging, map pointer X to a page-relative
time and call `onSeek`. Use `useRef` for the dragging flag; do not use component
state (avoids extra re-renders during drag). A `useEffect` cleanup ensures the
global mouse listeners are removed on unmount.

### Grow-upward layout

The component itself is just the SVG tape. The grow-upward behavior is
controlled by the parent `PlayerBar` in task 003 (wrapping `MockWaveTape` in a
collapsible region above the control row). Do NOT implement open/close toggle
logic in `MockWaveTape` itself — keep it a pure display/interaction component.

### CSS classes

Add to `mockup.css`:

```css
/* Tape region — grows the player bar upward */
.nsp-tape-region {
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--surface-alt);
  transition: max-height 0.18s ease, opacity 0.18s ease;
}
.nsp-tape-region[aria-hidden="true"] {
  max-height: 0 !important;
  opacity: 0;
  pointer-events: none;
}
.nsp-tape-region[aria-hidden="false"] {
  max-height: 160px;
  opacity: 1;
}
.nsp-tape-canvas {
  display: block;
  width: 100%;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
}

@media (prefers-reduced-motion: reduce) {
  .nsp-tape-region { transition: none !important; }
}
```

## Steps

1. Open `shared.tsx`. After line 501 (end of `WaveformSvg`), add the
   `MOCK_PEAKS` constant (the static synthetic peak array ~200 values).

2. Below `MOCK_PEAKS`, add the `MockWaveTapeProps` interface and the
   `MockWaveTape` component. Implement paging, playhead rendering, bar
   coloring, click-to-seek, and drag-to-scrub as described above.
   Export `MockWaveTape` from the module (add to existing named exports).

3. Open `mockup.css`. After the `@media (prefers-reduced-motion: reduce)`
   block at line 657–665, append the `.nsp-tape-region` / `.nsp-tape-canvas`
   CSS rules.

4. Run `npm -C frontend run build` from the repo root to confirm no TypeScript
   or build errors are introduced. Fix any type errors before marking done.

5. Run `npm -C frontend run lint` (eslint on changed files) and fix any
   warnings flagged for the new code.

6. Manual visual check: start the demo Vite dev server (`npm -C frontend run dev`),
   navigate to `#/stage/site-mockup`. At this stage `MockWaveTape` is not yet
   wired into the mock PlayerBar (that is task 003), so the check here is to
   import it temporarily in a nearby location or inspect via a standalone test
   render — confirm bars are peak-shaped (bursts + silences visible), playhead
   line is solid accent color, click fires `onSeek`.

## Acceptance criteria

- `MockWaveTape` is exported from `shared.tsx` with the exact props interface
  above.
- `MOCK_PEAKS` has ≥ 180 values; the data visually alternates between speech
  burst clusters and silence valleys (no uniform sinusoid shape).
- Paging: advancing `currentTimeSec` past `windowSec` moves to a new page; the
  playhead stays within `[0, svgWidth]` at all times.
- Playhead line color is `var(--accent)`, solid (not translucent), strokeWidth ≥ 2.
- Bars left of playhead use `var(--color-wave-progress)`; bars right use
  `var(--color-wave)`.
- Click on the tape calls `onSeek` with a value in `[0, durationSec]`.
- Dragging calls `onSeek` on every `mousemove` event while the mouse button is
  held.
- `npm -C frontend run build` exits 0 with no TypeScript errors on changed files.
- eslint reports no new errors or warnings for the new code.

## Out of scope

- Zoom preset controls (task 002).
- Minimap strip (task 002).
- Wiring `MockWaveTape` into the mock `PlayerBar` (task 003).
- Animation/easing on page-advance (deferred to W2 real implementation).
- Keyboard accessibility for scrub (covered in W2 task 009).
- Real audio decode, wavesurfer, or any `<audio>` element.

## References

- Audit report finding F3 (synthetic-but-peak-shaped data requirement):
  `plans/audio_player_waveform_scrubber/00-audit-report.md` §E
- Existing `WaveformSvg` source of truth: `shared.tsx:463–501`
- Proposal §3 (paged motion, playhead, click+drag, grow-upward):
  `plans/audio_player_scrubbing_waveform_proposal.md`
- Proposal §5 HIG guardrails (contrast on glass, targets ≥ 44 pt):
  `plans/audio_player_scrubbing_waveform_proposal.md`
- Roadmap W0 task 001: `plans/audio_player_waveform_scrubber/01-roadmap.md`
- `handleSeek` pattern: `siteMockupStage.tsx:593–598`
- CSS reduced-motion block: `mockup.css:657–665`
