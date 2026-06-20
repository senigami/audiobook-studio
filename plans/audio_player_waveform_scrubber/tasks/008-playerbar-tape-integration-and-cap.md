# 008 — PlayerBar tape integration: AudioLines opens tape, motion toggle, duration cap, play-book

status: todo
workload: W2 — Port the tape to the live PlayerBar (browser-decoded)
blocked-by: 007
blocks: 009

## Goal

Wire the task 006/007 components into `PlayerBar.tsx`:

1. **`AudioLines` opens/closes the tape in bar mode** (grows bar upward) and flips wave↔bar in waveform mode.
2. **Paged ↔ moving motion toggle** (moving forced to paged under `prefers-reduced-motion`).
3. **Duration cap** (~10–15 min, tunable): above it the tape is never offered — plain bar, today's behavior, no crash.
4. **"Play book" whole-book affordance**: chapter-sequenced playback at library/book level via `onEnded` advancing chapters.
5. **State resets on `requestId`**: tape-open, zoom-preset, and motion mode all reset when a new source loads.

This task is wiring only — no new visual components are created here. CSS for the grow-upward region is in task 009.

## Why it matters

Without this task the `WaveformTape` component exists but is never rendered. The toggle-behavior change is the user-visible entry point for the whole tape UX. The duration cap is a mandatory safety gate (audit report §E F1): skipping it risks tab crashes on long WAV files during browser-decode. The "Play book" affordance fulfills spec §4.1 (content-owned play affordances at every level).

## Files

### Edit

- `frontend/src/app/layout/PlayerBar.tsx` (currently 266 lines after task 005)

### No other files in this task

CSS for `.player-tape-region` is task 009. Vitest tests are task 009.

## Target shape / contract

### Duration cap constant

```typescript
/**
 * Duration cap in seconds above which the tape is NOT offered (browser-decode safety).
 * Keyed on audio duration alone — never on scope. Start at 600 s (10 min); raise to
 * 900 s (15 min) if device decode is comfortable in practice.
 * When W3 sidecar is available the cap can be lifted per-artifact without touching this.
 */
export const TAPE_DURATION_CAP_SEC = 600;
```

Export so task 009 vitest can import it without hardcoding the threshold.

### New state variables (alongside existing `forceWave` at line 46)

```typescript
/** Whether the expanded tape is open. Meaningful only when !showWave && tapeAvailable.
 *  Resets to false on new source (requestId). */
const [tapeOpen, setTapeOpen] = useState<boolean>(false);

/** Zoom preset value in seconds. Resets to 30 s default on new source. */
const [windowSec, setWindowSec] = useState<TapeZoomPreset>(30);

/**
 * Tape motion mode. 'paged' = playhead sweeps window; 'moving' = playhead fixed at center.
 * 'paged' is forced at render time when prefers-reduced-motion: reduce is active —
 * the stored value may be 'moving' but WaveformTape receives 'paged'.
 */
const [tapeMode, setTapeMode] = useState<'paged' | 'moving'>('paged');
```

`TapeZoomPreset` imported from `./WaveformTape`.

### Reset effect (extend the existing `requestId` effect at line 47)

```typescript
useEffect(() => {
  setForceWave(null);
  setTapeOpen(false);
  setWindowSec(30);         // reset to default zoom
  setTapeMode('paged');     // reset to default motion mode
}, [requestId]);
```

### `usePeaks` call

Call `usePeaks(audioUrl ?? '', audioEl!)` in the component body (import from `./WaveformTape`). Guard: pass `audioEl` only when non-null. The returned `peaks: number[] | null` is threaded into `<WaveformTape>` and `<WaveformTapeMinimap>`.

### `prefers-reduced-motion` guard

Read once at component init time (a ref — does not need to be state):
```typescript
const prefersReducedMotion = useRef(
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
).current;
```

When rendering `<WaveformTape>`, pass `mode={prefersReducedMotion ? 'paged' : tapeMode}`.

### Derived booleans

```typescript
/** True when the loaded clip is short enough for browser-decode tape. */
const tapeAvailable = duration > 0 && duration <= TAPE_DURATION_CAP_SEC;

/** True when the tape is actually open and renderable. */
const tapeRendered = tapeOpen && tapeAvailable && !showWave && audioEl !== null;
```

### Toggle behavior (replace line 257)

Current behavior: `onClick={() => setForceWave(!showWave)}` always toggles representation.

New `handleWaveToggle`:

```typescript
const handleWaveToggle = () => {
  if (tapeAvailable && !showWave) {
    // In bar mode with tape available: open/close the tape
    setTapeOpen(prev => !prev);
  } else {
    // In waveform mode, or tape not available: flip representation as before
    setForceWave(prev => (prev === null ? !showWave : !prev));
  }
};
```

Toggle button (`AudioLines`, currently at lines 254–262) — update three attributes:
- `onClick`: `handleWaveToggle`
- `aria-pressed`: `tapeRendered ? true : showWave`
- `aria-label`: three states:
  - `!showWave && tapeAvailable && tapeOpen` → `"Close tape view"`
  - `!showWave && tapeAvailable && !tapeOpen` → `"Open tape view"`
  - `showWave` → `"Show progress bar"`
  - `!showWave && !tapeAvailable` → `"Show waveform"` (above-cap fallback — same as before)

### Motion toggle button (new, in the tape header or footer)

Add a small toggle button **inside** the `.player-tape-region` (rendered only when the tape is open). Uses lucide `Waves` for moving mode and `GalleryHorizontalEnd` for paged mode (spec §1, "icons binding"):

```tsx
{tapeRendered && (
  <button
    type="button"
    className="player-btn tape-motion-toggle"
    onClick={() => setTapeMode(m => m === 'paged' ? 'moving' : 'paged')}
    aria-label={tapeMode === 'moving' ? 'Switch to paged motion' : 'Switch to moving motion'}
    aria-pressed={tapeMode === 'moving'}
    disabled={prefersReducedMotion}
    title={prefersReducedMotion ? 'Moving motion disabled (reduced motion)' : undefined}
  >
    {tapeMode === 'moving' ? <GalleryHorizontalEnd size={14} /> : <Waves size={14} />}
  </button>
)}
```

Import `Waves` and `GalleryHorizontalEnd` from `lucide-react`.

### Tape rendering (the `player-tape-region` block)

Add above `.player-bar-content` inside `.player-bar`:

```tsx
{tapeRendered && (
  <div className="player-tape-region">
    <WaveformTape
      audioEl={audioEl}
      audioUrl={audioUrl!}
      duration={duration}
      windowSec={windowSec}
      mode={prefersReducedMotion ? 'paged' : tapeMode}
      peaks={peaks}
      onSeek={sec => seek(sec)}
      onZoomChange={setWindowSec}
    />
  </div>
)}
```

The motion toggle button can be rendered inside `.player-tape-region` as a sibling to `<WaveformTape>` or passed as a prop-rendered slot — implementer's choice, as long as it is visually inside the tape region.

### Grow-upward layout

`.player-bar` is `flex-direction: column; position: fixed; bottom: 0`. The `.player-tape-region` is a flex child inserted **above** `.player-bar-content` — the bar grows upward naturally. CSS height and animation are in task 009.

Final `.player-bar` structure:

```tsx
<div className="player-bar" style={{ zIndex: LAYERS.PLAYER_BAR }}>
  <audio ... />                  {/* unchanged — single owner */}
  {tapeRendered && (
    <div className="player-tape-region">
      <WaveformTape ... />
      {/* motion toggle button */}
    </div>
  )}
  <div className="player-bar-content">
    {/* controls, scrub, time, toggle — unchanged structure */}
  </div>
</div>
```

### "Play book" whole-book affordance

Add a `playBook(chapters: ChapterAudioEntry[])` helper (or adapter-level function) that calls `loadAndPlay` with the first chapter and chains `onEnded` to advance:

```typescript
export function playBook(chapters: Array<{ audioUrl: string; title: string }>) {
  let idx = 0;
  const playNext = () => {
    if (idx >= chapters.length) return;
    const ch = chapters[idx];
    idx++;
    loadAndPlay({
      scope: 'chapter',
      title: ch.title,
      audioUrl: ch.audioUrl,
      hasPrev: idx > 1,
      hasNext: idx < chapters.length,
      onEnded: playNext,
      onPrev: () => { idx = Math.max(0, idx - 2); playNext(); },
      onNext: () => { playNext(); },
    });
  };
  playNext();
}
```

Export `playBook` from `playerBus.ts` so library/book-card play affordances can call it. This is additive — it does not change any existing bus behavior. The library card "Play book" button calls `playBook(orderedChapters)`.

**Note:** `playBook` requires chapter audio URLs to be available at the library level. If not yet hydrated, the button is disabled. This is a rendering-layer concern; the bus helper itself always works when called with valid URLs.

### Single-owner invariant

After this task the conversion grep must still pass:

```bash
grep -rn '<audio\|new Audio(' frontend/src/
# Must match only PlayerBar.tsx and recording-capture components.
```

`WaveformTape`, `WaveformTapeZoom`, `WaveformTapeMinimap` must NOT appear. The `usePeaks` hook inside `WaveformTape.tsx` uses `AudioContext`, not `<audio>` — it is exempt.

## Steps

1. Add `TAPE_DURATION_CAP_SEC` export constant at the top of `PlayerBar.tsx`.
2. Import `TapeZoomPreset`, `usePeaks` from `./WaveformTape`; import `WaveformTape`; import `Waves`, `GalleryHorizontalEnd` from `lucide-react`.
3. Add `tapeOpen`, `windowSec`, `tapeMode` state and the `prefersReducedMotion` ref.
4. Extend the `requestId` reset effect to also reset `tapeOpen`, `windowSec`, `tapeMode`.
5. Call `usePeaks(audioUrl ?? '', audioEl!)` (guard when `audioEl` is null — pass empty string and handle gracefully).
6. Add `tapeAvailable` and `tapeRendered` derived booleans.
7. Implement `handleWaveToggle`.
8. Update the `AudioLines` toggle button (`onClick`, `aria-pressed`, `aria-label`).
9. Add the `player-tape-region` conditional (with `<WaveformTape>` and motion toggle) above `.player-bar-content`.
10. Add `playBook` to `playerBus.ts` and export it.
11. Run the single-owner grep — confirm `WaveformTape.tsx` et al. do not appear.
12. Run `npm -C frontend run build` and `npm -C frontend run lint`.

## Acceptance criteria

- `TAPE_DURATION_CAP_SEC` is defined and exported from `PlayerBar.tsx` (or a co-located constants module imported by both `PlayerBar.tsx` and task 009 tests).
- When `duration <= TAPE_DURATION_CAP_SEC` and `!showWave`: pressing `AudioLines` sets `tapeOpen = true`; `.player-tape-region` with `<WaveformTape>` appears in the DOM.
- Pressing the toggle again sets `tapeOpen = false`; `.player-tape-region` is removed.
- When `duration > TAPE_DURATION_CAP_SEC`: toggle does NOT open the tape; it flips `forceWave` (today's behavior). `.player-tape-region` is never rendered.
- When `showWave === true` (inline waveform mode): toggle flips representation regardless of cap.
- Motion toggle button is visible inside the tape region; clicking it toggles `tapeMode` between `'paged'` and `'moving'`.
- `prefers-reduced-motion: reduce` → `<WaveformTape>` always receives `mode="paged"` regardless of `tapeMode`; motion toggle button is disabled.
- On new `requestId`: `tapeOpen = false`, `windowSec = 30`, `tapeMode = 'paged'`.
- `playBook` is exported from `playerBus.ts` and sequences chapters via `onEnded`.
- **Single-owner grep passes:** `grep -rn '<audio\|new Audio(' frontend/src/` matches only `PlayerBar.tsx` and capture components. Tape-related files do not appear.
- `npm -C frontend run build` passes (no TypeScript errors).
- `npm -C frontend run lint` passes.
- **Running app sign-off (by owner):** opening a chapter under the cap and pressing `AudioLines` shows the tape (paged, playhead moves, zoom dots, minimap, motion toggle). A clip over the cap shows only the plain bar when toggled. Pressing the motion toggle switches between paged and moving. `prefers-reduced-motion` forces paged.

## Out of scope

- CSS for the tape region — task 009.
- Vitest tests — task 009.
- Any backend work.
- The fit-based inline rule (`fitsLegibly`) — task 005, already done.
- Annotation / edit-marking — post-V2.

## References

- `frontend/src/app/layout/PlayerBar.tsx:46–47` — `forceWave` state and `requestId` reset effect (extend both)
- `frontend/src/app/layout/PlayerBar.tsx:121` — `showWave` predicate (updated by task 005; unchanged here)
- `frontend/src/app/layout/PlayerBar.tsx:254–262` — `AudioLines` toggle button (the section this task edits)
- `frontend/src/store/playerBus.ts:96–118` — `loadAndPlay` (shape for `playBook` to call)
- `frontend/src/store/playerBus.ts:162` — `seek(seconds)` passed as `onSeek` prop
- `docs/specs/audio-player.md` 1.6.0 §1 (icon binding: `Waves`, `GalleryHorizontalEnd` for motion toggle); §3 (`AudioLines` opens tape in bar mode; grow-upward; no scope toggle); §4.1 (content-owned play affordances, "Play book" first-class); §5.2 (paged↔moving toggle; prefers-reduced-motion forces paged)
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E` — F1 (browser decode cannot scale; mandatory cap), F4 (single-owner constraint)
- `plans/audio_player_waveform_scrubber/00-audit-report.md §F` — locked decision 5 (grow upward), decision 7 (duration cap ~10–15 min tunable)
- `plans/audio_player_waveform_scrubber/01-roadmap.md` — W2-008 description; W2 sign-off check
