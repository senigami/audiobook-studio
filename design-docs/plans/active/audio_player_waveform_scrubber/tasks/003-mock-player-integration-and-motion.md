# 003 — Mock player integration and motion

status: done
workload: W0 — Mock prototype (feel-first)
blocked-by: 001, 002
blocks: none (owner sign-off gate)

## Goal

Wire `MockWaveTape` (task 001) and the zoom/minimap controls (task 002) into the
mock `PlayerBar` in `siteMockupStage.tsx` so the full tape experience is
navigable in `#/stage/site-mockup`. The `AudioLines` toggle in the mock bar
changes behavior: when the scrub track is a **bar** (chapter scope or long clip),
clicking the toggle **opens the tape** (growing the bar upward) rather than
flipping to an inline waveform. The tape supports paged motion with a moving
playhead, click-to-jump and drag-to-scrub, zoom presets, and the minimap.
Optionally mirror the tape state into the styleguide U16 specimen
(`StyleguidePage.tsx:1002–1194`) so that specimen stays honest. This is the
owner sign-off milestone for all of Workload 0.

## Why it matters

Tasks 001 and 002 produce the tape and its controls as isolated components. This
task is where they become a coherent, demoable experience that the owner can
evaluate for feel — paged motion, zoom, minimap, grow-upward, scrub — all wired
together and driven by the mock's existing play/pause/seek state. Without this
integration the W0 sign-off cannot happen and the entire workload (W1 spec
rewrite, W2 real tape) is blocked. Every locked decision (proposal §9) is
visible and testable in one place for the first time here.

## Files

- **Modify:** `frontend/src/demo/stages/siteMockupStage.tsx`
  — `PlayerBar` component (lines 571–794). Primary changes are:
    - New state: `tapeOpen` (boolean), `windowSec` (zoom preset).
    - New logic: `AudioLines` toggle in bar mode opens/closes the tape instead
      of flipping `forceWave`.
    - New render: tape region (collapsible div with `MockWaveTape` + minimap +
      zoom row) inserted above the existing control row inside `.nsp-playerbar`.
    - Extend `handleSeek` to also accept time values from tape drag (unified
      handler already suitable; just ensure `MockWaveTape.onSeek` is wired to it).
    - Wire `onWheel` on the tape wrapper for preset-snap zoom.
  — **Do not alter** the rest of `siteMockupStage.tsx` (BookPane, LibraryPane,
    SiteMockupStage, auto-advance timer, etc.).

- **Modify (optional but recommended):** `frontend/src/demo/styleguide/StyleguidePage.tsx`
  — `U16Mock` component (lines 1002–1194). Add the same `tapeOpen` + `windowSec`
  state and wire in the tape so the styleguide specimen stays consistent with the
  mock. This is optional for the sign-off gate but strongly preferred so the two
  surfaces don't diverge.

- **Import from task 001:** `MockWaveTape` from
  `./siteMockup/shared` (already in the import block of `siteMockupStage.tsx`).

- **Import from task 002:** `ZoomPresetControl`, `TapeMinimapStrip`, `ZOOM_PRESETS`,
  `ZoomPreset`, `snapZoom` from
  `./siteMockup/MockTapeControls`.

- **CSS:** no new CSS rules needed here — all tape/zoom/minimap CSS was added
  by tasks 001 and 002. Verify `.nsp-tape-region[aria-hidden]` transitions work
  correctly in the assembled view.

## Target shape / contract

### State additions to `PlayerBar` (siteMockupStage.tsx:571)

```ts
const [tapeOpen, setTapeOpen] = useState(false);
const [windowSec, setWindowSec] = useState<ZoomPreset>(30);   // default preset

// Reset tape state when a new track loads (mirrors forceWave reset at :611)
useEffect(() => { setTapeOpen(false); setWindowSec(30); }, [activeTrack.trackName]);
```

### Updated `AudioLines` toggle logic (currently at :774–790)

The toggle button behavior splits on whether the scrub track is currently
showing an inline waveform or a plain bar:

```ts
// showWave is still: forceWave ?? isSegment  (unchanged)
// NEW: in bar mode, the AudioLines toggle opens/closes the tape instead.
const handleAudioLinesClick = () => {
  if (showWave) {
    // In waveform mode: existing behavior — flip forceWave to switch to bar.
    setForceWave(false);
    setTapeOpen(false);   // close tape if open when flipping to wave
  } else {
    // In bar mode: toggle open/close the tape.
    setTapeOpen(prev => !prev);
  }
};
```

Update the `AudioLines` button:
- `onClick={handleAudioLinesClick}`
- `aria-pressed={tapeOpen}` (when in bar mode; `showWave` (boolean) when in
  wave mode — logic can be `aria-pressed={showWave || tapeOpen}`)
- `aria-label`: `tapeOpen ? 'Close waveform tape' : (showWave ? 'Show progress bar' : 'Open waveform tape')`
- Visual active state: `showWave || tapeOpen` drives the accent tint.

### Tape region render (insert before the existing `.nsp-player-inner` div)

```tsx
{/* Tape region — grows the bar upward when open.
    aria-hidden drives the CSS max-height collapse (from task 001). */}
<div
  className="nsp-tape-region"
  aria-hidden={tapeOpen ? 'false' : 'true'}
>
  {/* Tape canvas — full width, height 104 px */}
  <div
    className="nsp-tape-canvas-wrap"
    onWheel={(e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 'out' : 'in';
      setWindowSec(prev => snapZoom(prev, dir));
    }}
    style={{ padding: '8px 14px 0' }}
  >
    <MockWaveTape
      durationSec={activeTrack.duration}
      currentTimeSec={activeTrack.currentTime}
      isPlaying={activeTrack.isPlaying}
      windowSec={windowSec}
      onSeek={(newTime) =>
        setActiveTrack(prev => ({ ...prev, currentTime: Math.max(0, Math.min(newTime, prev.duration)) }))
      }
      height={104}
    />
  </div>

  {/* Tape footer: minimap + zoom preset control */}
  <div className="nsp-tape-footer">
    <TapeMinimapStrip
      durationSec={activeTrack.duration}
      currentTimeSec={activeTrack.currentTime}
      windowSec={windowSec}
      onSeek={(newTime) =>
        setActiveTrack(prev => ({ ...prev, currentTime: Math.max(0, Math.min(newTime, prev.duration)) }))
      }
      height={28}
    />
    <ZoomPresetControl
      windowSec={windowSec}
      onZoomChange={setWindowSec}
    />
  </div>
</div>
```

### Paged motion verification

At this stage, paged motion is inherently correct if `MockWaveTape` is
implemented per task 001: the playhead moves continuously as `currentTime`
advances (driven by the existing 1s tick at siteMockupStage.tsx:902–917); when
it reaches the right edge of the page window the next render begins a new page
(the component re-derives `pageIndex` from `currentTimeSec / windowSec`). The
effect is: playhead advances across the viewport, then snaps to the left for
the next page — exactly the teleprompter-paging motion described in proposal §3.

Under `prefers-reduced-motion: reduce` the CSS `transition: none` on
`.nsp-tape-region` ensures the grow-upward reveal is instant. The page-advance
itself is already instant (no animation in the SVG re-render).

### Scrub from the tape updates the bar's time display

Because `MockWaveTape.onSeek` and `TapeMinimapStrip.onSeek` both call
`setActiveTrack(prev => ({ ...prev, currentTime: newTime }))`, the existing
`timeText` computation (siteMockupStage.tsx:616–618) automatically shows the
correct time. No extra wiring needed.

### Styleguide U16 specimen (optional, recommended)

In `StyleguidePage.tsx`, `U16Mock` (lines 1002–1194):

1. Add `const [tapeOpen, setTapeOpen] = useState(false)` and
   `const [windowSec, setWindowSec] = useState<ZoomPreset>(30)`.
2. Add a simulated `currentTimeSec` state driven by a `useEffect` timer that
   increments by 1s while `isPlaying` is true (same pattern as the main mock).
   Use an initial value of 134 s (matching the mock's starting state) and a
   `durationSec` of 1690 (matching `activeTrack.duration` in the mock).
3. Replace the static `WaveformSVG` inline scrub with conditional logic:
   - When `showWave && !tapeOpen`: existing `WaveformSVG` inline (unchanged).
   - When `!showWave`: plain seek bar (unchanged).
   - When `tapeOpen`: render the tape region (same structure as above).
4. Wire `AudioLines` toggle with `handleAudioLinesClick` same as the mock.
5. Import `MockWaveTape`, `ZoomPresetControl`, `TapeMinimapStrip`, `ZOOM_PRESETS`,
   `ZoomPreset`, `snapZoom` from the appropriate relative paths.

If time-boxed, ship U16 update as a follow-on; the sign-off gate is
`#/stage/site-mockup`, not the styleguide.

## Steps

1. Open `siteMockupStage.tsx`. Add the import for `MockWaveTape` to the
   existing `shared` import line (or add a new import from `./siteMockup/shared`
   if `MockWaveTape` is a new named export).

2. Add the import for `ZoomPresetControl`, `TapeMinimapStrip`, `ZOOM_PRESETS`,
   `ZoomPreset`, `snapZoom` from `'./siteMockup/MockTapeControls'`.

3. Inside the `PlayerBar` component, add `tapeOpen` and `windowSec` state after
   the `forceWave` state (lines 610–612). Add the reset `useEffect` keyed on
   `activeTrack.trackName`.

4. Replace the `onClick` handler on the `AudioLines` button with the new
   `handleAudioLinesClick` function. Update `aria-pressed` and `aria-label`
   as specified above.

5. In the JSX returned by `PlayerBar`, insert the tape region `<div>` above the
   `.nsp-player-inner` div. The `.nsp-playerbar` div (currently line 654)
   already has `containerType: 'inline-size'` — preserve that.

6. Run `npm -C frontend run build`. Fix any TypeScript or import errors.

7. Run `npm -C frontend run lint`. Fix any warnings.

8. Start the demo Vite dev server (`npm -C frontend run dev`) and navigate to
   `#/stage/site-mockup`. Perform the visual/interaction checklist:
   a. With the track in **chapter** scope: click `AudioLines` — the tape region
      grows upward (animated expand), revealing `MockWaveTape` + minimap + zoom.
   b. Press play — watch the playhead move across the tape; wait for a page
      advance (playhead snaps to left, new page of bars appears).
   c. Click on the tape — time jumps; minimap window rect updates.
   d. Drag on the tape — time scrubs continuously; minimap tracks.
   e. Drag the minimap window rect — time jumps; tape page updates.
   f. Click a zoom dot — bars change density (fewer/more bars per page).
   g. Scroll wheel over the tape — zoom snaps to adjacent preset.
   h. Click `AudioLines` again — tape collapses (animated close).
   i. Switch to **segment** scope — tape closes; `AudioLines` now flips inline
      waveform ↔ bar (existing behavior, unchanged).
   j. Enable OS Reduce Motion — tape open/close is instant; page-advance is
      instant.

9. (Optional) Update `StyleguidePage.tsx:1002–1194` as described. Run build +
   lint again; verify `#/styleguide` loads without errors.

## Acceptance criteria

- Navigating to `#/stage/site-mockup`, opening chapter scope, and clicking
  `AudioLines` reveals the tape region with `MockWaveTape`, `TapeMinimapStrip`,
  and `ZoomPresetControl` fully rendered.
- While playing, the playhead moves across the tape and advances pages at the
  window edge.
- Click-to-jump on the tape updates `activeTrack.currentTime` and the time
  display.
- Drag-to-scrub on the tape fires `onSeek` continuously and updates display.
- Drag on the minimap rectangle navigates to the correct approximate time.
- Zoom dot click changes the number of bars visible on the tape (more bars for
  larger `windowSec`, fewer bars for smaller).
- Scroll wheel over the tape snaps `windowSec` through presets.
- Clicking `AudioLines` while tape is open collapses it (tape is hidden).
- In **segment** scope, `AudioLines` toggle still flips inline waveform ↔ bar
  (existing behavior is not broken).
- `forceWave` and `tapeOpen` both reset to their defaults when `activeTrack.trackName`
  changes (verified by switching tracks via the library pane).
- `aria-label` on the `AudioLines` button correctly describes the toggle action
  in each state.
- Under `prefers-reduced-motion: reduce`, the tape open/close reveal has no
  CSS transition (instant).
- `npm -C frontend run build` exits 0 on all changed files.
- eslint reports no new errors or warnings for changed files.
- No JavaScript console errors at `#/stage/site-mockup` during normal interaction.

## Out of scope

- Keyboard accessibility for tape scrub (deferred to W2 task 009).
- Touchscreen / pinch-gesture zoom (mouse-only for W0).
- Persisting tape state (open/closed, zoom level) across browser sessions.
- Integration with the real `PlayerBar.tsx` in `frontend/src/app/layout/`
  (that is Workload 2, task 008).
- The `forceWave` flip-back-to-wave path from tape mode is not required in W0
  (the toggle in bar mode only opens/closes the tape; the waveform flip is
  segment-scope only).
- Annotation / edit-marking (post-V2, explicitly excluded).
- Real audio decode, wavesurfer, or any `<audio>` element.

## References

- Proposal §3 (tape layout, paged motion, grow-upward, click+drag, minimap,
  zoom presets): `design-docs/plans/audio_player_scrubbing_waveform_proposal.md`
- Proposal §5 HIG guardrails (aria-label, contrast, Reduce Motion):
  `design-docs/plans/audio_player_scrubbing_waveform_proposal.md`
- Proposal §6 state model (`AudioLines` toggle dual behavior):
  `design-docs/plans/audio_player_scrubbing_waveform_proposal.md`
- Locked decisions F3/F4/F5 (audit): `design-docs/plans/audio_player_waveform_scrubber/00-audit-report.md` §F
- Roadmap W0 sign-off check (gates W1): `design-docs/plans/audio_player_waveform_scrubber/01-roadmap.md`
- `PlayerBar` in mock: `siteMockupStage.tsx:571–794`
- `handleSeek`: `siteMockupStage.tsx:593–598`
- `forceWave` + reset effect: `siteMockupStage.tsx:610–612`
- `AudioLines` toggle button: `siteMockupStage.tsx:774–790`
- Auto-advance timer: `siteMockupStage.tsx:902–917`
- `U16Mock` in styleguide: `StyleguidePage.tsx:1002–1194`
- `MockWaveTape` from task 001: `shared.tsx` (after line 501)
- `ZoomPresetControl`, `TapeMinimapStrip`, `snapZoom` from task 002:
  `siteMockup/MockTapeControls.tsx`
- Tape CSS classes from tasks 001 + 002: `mockup.css`
