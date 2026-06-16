# 008 — PlayerBar tape integration + duration cap

status: todo
workload: W2 — Real tape + zoom (browser-decoded)
blocked-by: 007
blocks: 009

## Goal

Extend `PlayerBar.tsx` to: (1) change the `AudioLines` toggle behavior so that when the inline scrub track is a **bar** (not a waveform) the toggle **opens/closes the expanded tape** rather than flipping representation, (2) add the **duration safety cap** so that above the cap the tape is never offered and the bar behaves exactly as today, and (3) reset tape open state on `requestId` change alongside the existing `forceWave` reset.

This task is pure wiring — it connects the 006/007 components into the existing PlayerBar surface. No new visual components are created here.

## Why it matters

Without this task the `WaveformTape` component exists but is never rendered. The toggle logic change is the user-visible entry point for the whole tape UX. The duration cap is a mandatory safety gate (Finding F1): skipping it risks tab crashes on long WAV files during the browser-decode phase.

## Files

- **Edit:** `frontend/src/app/layout/PlayerBar.tsx` (currently 266 lines)

No other files are touched in this task. CSS for the grow-upward region lives in task 009.

## Target shape / contract

### Duration cap constant

```typescript
/** Duration cap in seconds above which the tape is NOT offered (browser-decode safety).
 *  Keyed on audio duration alone — never on scope. Tunable: start at 10 min (600 s).
 *  When W3 sidecar is available the cap can be lifted per-artifact without changing this. */
const TAPE_DURATION_CAP_SEC = 600; // 10 minutes — adjust to 900 (15 min) if decode is comfortable
```

This constant should be exported so it can be imported in tests (task 009 vitest).

### State additions

Two new state variables alongside the existing `forceWave` (line 46):

```typescript
/** Whether the expanded tape is currently open. Only meaningful when !showWave.
 *  Resets to false on new source (requestId), same as forceWave. */
const [tapeOpen, setTapeOpen] = useState<boolean>(false);

/** Zoom preset index (0–4). Resets to default (2 = 30 s) on new source. */
const [zoomPresetIndex, setZoomPresetIndex] = useState<number>(2);
```

Reset effect (extend the existing `useEffect(() => { setForceWave(null); }, [requestId])`):

```typescript
useEffect(() => {
  setForceWave(null);
  setTapeOpen(false);
  setZoomPresetIndex(2);
}, [requestId]);
```

### Duration cap guard

A derived boolean, computed after `duration` is known from the bus:

```typescript
/** True when the loaded clip is short enough for browser-decode tape. */
const tapeAvailable = duration > 0 && duration <= TAPE_DURATION_CAP_SEC;
```

When `tapeAvailable` is false: the tape is never rendered, `tapeOpen` is ignored, and the `AudioLines` toggle retains its current behavior (flip `forceWave`) regardless of `showWave`. This ensures above-cap clips behave identically to today's plain bar — no regression, no crash.

### Toggle behavior change (lines 254–262 in current file)

Current behavior: `onClick={() => setForceWave(!showWave)}` always toggles the representation.

New behavior:

```typescript
// When the tape is available AND the inline track is a bar (not a waveform),
// the AudioLines toggle opens/closes the expanded tape instead of flipping representation.
// When the inline track IS a waveform (showWave === true), behavior is unchanged: toggle flips bar/wave.
// When the tape is not available (above cap or duration unknown), always flip forceWave.
const handleWaveToggle = () => {
  if (tapeAvailable && !showWave) {
    setTapeOpen(prev => !prev);
  } else {
    setForceWave(!showWave);
  }
};
```

Toggle button changes:
- `onClick`: change from `() => setForceWave(!showWave)` to `handleWaveToggle`.
- `aria-pressed`: when `!showWave && tapeAvailable`, reflect `tapeOpen` instead of `showWave`.
- `aria-label`: three states — `"Show waveform"` (bar, tape not available), `"Open tape view"` / `"Close tape view"` (bar, tape available), `"Show progress bar"` (waveform mode).

### Tape rendering

Add the `WaveformTape` (with `WaveformTapeZoom` and `WaveformTapeMinimap` composed inside it) below the existing `.player-bar-content` div when `tapeOpen && tapeAvailable && !showWave && audioEl`:

```tsx
{tapeOpen && tapeAvailable && !showWave && audioEl && (
  <div className="player-tape-region" aria-label="Audio tape" role="region">
    <WaveformTape
      audioEl={audioEl}
      audioUrl={audioUrl}
      duration={duration}
      zoomPresetIndex={zoomPresetIndex}
      onSeek={(sec) => seek(sec)}
      onZoomChange={setZoomPresetIndex}
    />
  </div>
)}
```

The `.player-tape-region` CSS class (height ~96–120 px, grow-upward animation) is defined in task 009.

### Grow-upward layout

The tape region sits inside `.player-bar` (which is `flex-direction: column` and `position: fixed; bottom: 0`). Adding the tape region as a sibling div above `.player-bar-content` causes the bar to grow upward naturally. The CSS for the tape region (task 009) sets the height and transition. No JavaScript height calculation is needed.

Structure after this task:

```tsx
<div className="player-bar">
  <audio ... />                    {/* unchanged — single owner */}
  {/* tape region — above controls, opens upward */}
  {tapeOpen && tapeAvailable && !showWave && audioEl && (
    <div className="player-tape-region">
      <WaveformTape ... />
    </div>
  )}
  <div className="player-bar-content">
    {/* controls, scrub, time, toggle — unchanged structure */}
  </div>
</div>
```

### Single-owner invariant

`WaveformTape` is rendered only when `audioEl` is non-null (the guard `&& audioEl` in the conditional). `WaveformTape` itself creates no `<audio>` element (enforced in task 006). After this task the conversion grep must still pass:

```bash
grep -rn '<audio\|new Audio(' frontend/src/
# Must match only PlayerBar.tsx and capture-related components.
# WaveformTape.tsx, WaveformTapeZoom.tsx, WaveformTapeMinimap.tsx must NOT appear.
```

## Steps

1. Import `WaveformTape` from `./WaveformTape`, and `TAPE_DURATION_CAP_SEC` constant (or define it here and export it for tests).
2. Add `tapeOpen` and `zoomPresetIndex` state declarations alongside `forceWave` (line 46 area).
3. Extend the `requestId` reset effect to also reset `tapeOpen` and `zoomPresetIndex`.
4. Add the `tapeAvailable` derived boolean after `duration` is read from the bus.
5. Implement `handleWaveToggle` replacing the inline `() => setForceWave(!showWave)`.
6. Update the `AudioLines` toggle button: `onClick`, `aria-pressed`, `aria-label`.
7. Add the `player-tape-region` conditional above `.player-bar-content` inside `.player-bar`.
8. Run the single-owner grep and confirm it passes.
9. Run `npm -C frontend run build` and `npm -C frontend run lint`; fix any issues.

## Acceptance criteria

- `TAPE_DURATION_CAP_SEC` is defined and exported (value 600 or 900; implementation can choose, must match 009 test import).
- When `duration <= TAPE_DURATION_CAP_SEC` and `!showWave`: pressing the `AudioLines` toggle sets `tapeOpen = true` and renders `.player-tape-region` containing `<WaveformTape>`.
- Pressing the toggle again sets `tapeOpen = false` and removes `.player-tape-region` from the DOM.
- When `duration > TAPE_DURATION_CAP_SEC`: toggle does NOT open the tape; it continues to flip `forceWave` (today's behavior). The `.player-tape-region` is never rendered.
- When `showWave === true` (waveform inline mode): toggle flips `forceWave` regardless of cap. Tape is not opened.
- On new `requestId`: `tapeOpen` resets to `false`, `zoomPresetIndex` resets to `2`.
- **Single-owner grep passes:** `grep -rn '<audio\|new Audio(' frontend/src/` matches only `PlayerBar.tsx` and capture components; no tape-related file appears.
- `npm -C frontend run build` passes (no TypeScript errors).
- `npm -C frontend run lint` passes.
- **Running app (preview) sign-off:** opening a chapter under the cap and pressing the AudioLines toggle shows the working tape (paged, playhead moves, zoom control present, minimap present). A clip over the cap shows only the plain bar when the toggle is pressed. Verified by owner in the running app.

## Out of scope

- CSS for the tape region (task 009).
- Vitest tests (task 009).
- Any backend work.
- The fit-based inline rule (`fitsLegibly`) — that is task 005 and is already done before this task.
- Annotation / edit-marking (post-V2).

## References

- `frontend/src/app/layout/PlayerBar.tsx:46–47` — `forceWave` state and `requestId` reset effect (extend both).
- `frontend/src/app/layout/PlayerBar.tsx:121` — `showWave` predicate (unchanged by this task; already updated by 005).
- `frontend/src/app/layout/PlayerBar.tsx:254–262` — `AudioLines` toggle button (the section this task edits).
- `frontend/src/store/playerBus.ts:162` — `seek(seconds)` passed as `onSeek` prop.
- `plans/audio_player_scrubbing_waveform_proposal.md §3` — tape layout (grow-upward), AudioLines toggle opens tape.
- `plans/audio_player_scrubbing_waveform_proposal.md §6` — state model (tapeOpen logic, toggle behavior table).
- `plans/audio_player_scrubbing_waveform_proposal.md §7` — duration cap rationale (download + decode memory).
- `plans/audio_player_scrubbing_waveform_proposal.md §9, decision 9` — safety cap ~10–15 min tunable.
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E, F1` — browser decode cannot scale; mandatory cap.
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E, F4` — single-owner constraint; grep must still pass.
- `plans/audio_player_waveform_scrubber/01-roadmap.md W2 sign-off check` — over-cap stays plain bar; single-owner grep; vitest + build + eslint clean; verify in running app.
