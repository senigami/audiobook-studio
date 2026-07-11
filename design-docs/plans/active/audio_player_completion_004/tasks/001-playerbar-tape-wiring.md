Status: complete — 2026-07-10

# 001 — Wire the tape into PlayerBar

Workload: A · Risk: `multi-file` (touches a file also touched by 002/008 — sequence, don't parallelize) · Blocked-by: none · Blocks: 002, 008

## Goal

Wire the already-shipped `WaveformTape` component into `frontend/src/app/layout/PlayerBar.tsx` — open/close via the existing `AudioLines` toggle, a paged↔moving motion toggle, a duration cap above which the tape is never offered.

**This task replaces** `design-docs/plans/active/audio_player_waveform_scrubber/tasks/008-playerbar-tape-integration-and-cap.md` — that draft was written before `WaveformTape.tsx`'s real interface existed; do not read it as a spec, the corrections below are final.

## Why it matters

`WaveformTape`/`WaveformTapeZoom`/`WaveformTapeMinimap` are fully built and tested in isolation but never rendered anywhere — this task is the only thing connecting them to the live app.

## Map links

See `../01-map.md` — Parts: `PlayerBar.tsx`, `WaveformTape.tsx`. Connections: "A → C (ordering, same file)" (this task's `TAPE_DURATION_CAP_SEC` export is what task 008 depends on). Invariants: single-`<audio>`-owner.

## Files

### Edit

- `frontend/src/app/layout/PlayerBar.tsx` (262 lines today)

### Read (do not edit, contracts to imitate/consume)

- `frontend/src/app/layout/WaveformTape.tsx` — real props: `audioEl: HTMLAudioElement` (required, non-null), `audioUrl: string`, `duration: number`, `windowSec?: number` (default 30), `mode?: 'paged'|'moving'` (default 'paged'), `onZoomChange?: (preset: TapeZoomPreset) => void`, `height?: number`, `peaks?: number[] | null`. It calls `usePeaks(audioUrl, audioEl)` **internally** and calls `playerBus.seek()` **directly** from its own `commitSeek`. Do not pass `peaks` or add an `onSeek`-equivalent from this task — see "What NOT to do" below.
- `frontend/src/app/layout/waveformTapeZoomPresets.ts` — exports `TapeZoomPreset` type.

## Target shape / contract

### New exports and state (alongside the existing `forceWave` state, currently around line 45)

```typescript
/**
 * Duration cap in seconds above which the tape is never offered (browser-decode
 * safety). Task 008 (backend peaks sidecar) imports this exact constant to decide
 * when to fetch a server-computed peaks sidecar instead.
 */
export const TAPE_DURATION_CAP_SEC = 600;

const [tapeOpen, setTapeOpen] = useState<boolean>(false);
const [windowSec, setWindowSec] = useState<TapeZoomPreset>(30);
const [tapeMode, setTapeMode] = useState<'paged' | 'moving'>('paged');

// Only for disabling/labeling PlayerBar's own motion-toggle button.
// WaveformTape already internally clamps to 'paged' when prefers-reduced-motion
// is active, regardless of the `mode` prop it's given — do not double-gate the
// prop value against this ref, pass `mode={tapeMode}` plainly.
const prefersReducedMotion = useRef(
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
).current;
```

Import `TapeZoomPreset` from `./waveformTapeZoomPresets`; import `WaveformTape` from `./WaveformTape`; import `Waves`, `GalleryHorizontalEnd` from `lucide-react`.

**What NOT to do** (both were in the superseded draft and are wrong against the real shipped component):
- Do **not** call `usePeaks(...)` in `PlayerBar.tsx` and do **not** add a `peaks` prop to the `<WaveformTape>` call below. `WaveformTape` already calls `usePeaks` internally and would decode the same audio a second time for zero benefit.
- Do **not** add an `onSeek` prop. `WaveformTape`'s internal `commitSeek` already calls `playerBus.seek()` directly; the existing seek round-trip (`bus.seek()` → `seekRequestId++` → `PlayerBar`'s existing effect that sets `audio.currentTime`) already works with no PlayerBar-supplied callback.

### Reset effect (extend the existing `requestId` effect, currently around line 46)

```typescript
useEffect(() => {
  setForceWave(null);
  setTapeOpen(false);
  setWindowSec(30);
  setTapeMode('paged');
}, [requestId]);
```

### Derived boolean (used only for the toggle handler / aria-label — not for JSX gating)

```typescript
const tapeAvailable = duration > 0 && duration <= TAPE_DURATION_CAP_SEC;
```

### Toggle handler

```typescript
const handleWaveToggle = () => {
  if (tapeAvailable && !showWave) {
    setTapeOpen(prev => !prev);
  } else {
    setForceWave(prev => (prev === null ? !showWave : !prev));
  }
};
```

Update the existing `AudioLines` button (currently around lines 250-258): `onClick={handleWaveToggle}`; `aria-pressed={(tapeOpen && tapeAvailable && !showWave) || showWave}`; three-state `aria-label`:
- `!showWave && tapeAvailable && tapeOpen` → `"Close tape view"`
- `!showWave && tapeAvailable && !tapeOpen` → `"Open tape view"`
- `showWave` → `"Show progress bar"`
- `!showWave && !tapeAvailable` → `"Show waveform"`

### Tape render block

Use an **inline null-check at the JSX call site** — the same pattern the existing `WaveformStrip` usage already uses at `PlayerBar.tsx:228` (`{showWave && audioEl ? (<WaveformStrip audioEl={audioEl} audioUrl={audioUrl} .../>) : ...}`, which compiles today with **no** non-null assertion on `audioUrl` because an earlier `if (!audioUrl) return null` in the same function body already narrows it). Do **not** precompute a separate `tapeRendered` boolean and gate on that — a standalone boolean does not let TypeScript narrow `audioEl: HTMLAudioElement | null` at the JSX call site, and would need a spurious `audioEl!` assertion.

```tsx
{tapeOpen && tapeAvailable && !showWave && audioEl && (
  <div className="player-tape-region">
    <WaveformTape
      audioEl={audioEl}
      audioUrl={audioUrl}
      duration={duration}
      windowSec={windowSec}
      mode={tapeMode}
      onZoomChange={setWindowSec}
    />
    <button
      type="button"
      className="player-btn tape-motion-toggle"
      onClick={() => setTapeMode(m => (m === 'paged' ? 'moving' : 'paged'))}
      aria-label={tapeMode === 'moving' ? 'Switch to paged motion' : 'Switch to moving motion'}
      aria-pressed={tapeMode === 'moving'}
      disabled={prefersReducedMotion}
      title={prefersReducedMotion ? 'Moving motion disabled (reduced motion)' : undefined}
    >
      {tapeMode === 'moving' ? <GalleryHorizontalEnd size={14} /> : <Waves size={14} />}
    </button>
  </div>
)}
```

Place this `<div>` as a sibling **above** `.player-bar-content`, inside `.player-bar` (which is already `flex-direction: column; position: fixed; bottom: 0` — the bar grows upward naturally with no JS height calculation; CSS is task 002's job).

### Out of scope for this task

- The "Play book" whole-book affordance — dropped from this plan entirely (see `../00-overview.md` scope boundaries). Do not add it.
- CSS — task 002.
- New tests — task 002 (this task's acceptance criteria below are build/lint/manual only; new automated tests for this task's behavior are written in 002 since they belong alongside the existing `PlayerBar.test.tsx` suite).
- The peaks-sidecar fetch — task 008.

## Steps

- [x] Add `TAPE_DURATION_CAP_SEC` export constant.
- [x] Import `TapeZoomPreset`, `WaveformTape`, `Waves`, `GalleryHorizontalEnd`.
- [x] Add `tapeOpen`, `windowSec`, `tapeMode` state and the `prefersReducedMotion` ref.
- [x] Extend the `requestId` reset effect.
- [x] Add the `tapeAvailable` derived boolean.
- [x] Implement `handleWaveToggle`; wire it and the three-state `aria-label`/`aria-pressed` onto the existing `AudioLines` button.
- [x] Add the `player-tape-region` conditional block (inline null-check pattern) above `.player-bar-content`, including the motion-toggle button.
- [x] Run the single-owner check (see acceptance criteria — note the corrected grep) — confirm no new offenders.
- [x] `npm -C frontend run build` and `npm -C frontend run lint`.
- [x] Tick every box above and set `Status: complete — <date>` at the top of this file in the same commit.

**Deviation from spec (flagged):** the spec's `prefersReducedMotion` snippet reads `useRef(...).current` directly in the render body. That trips this repo's `react-hooks/refs` eslint rule ("Cannot access ref value during render"), which fails the `npm -C frontend run lint` acceptance criterion below. Replaced with a `useState<boolean>(() => ...)` lazy initializer — identical "compute once at mount" semantics, and the same pattern already used by `useReducedMotion()` in `WaveformTape.tsx`. No other behavior changed.

## Acceptance criteria

- [x] `TAPE_DURATION_CAP_SEC` is exported from `PlayerBar.tsx` with value `600`.
- [x] When `duration <= 600` and `!showWave`: pressing `AudioLines` sets `tapeOpen = true`; `.player-tape-region` (containing `<WaveformTape>`) appears in the DOM.
- [x] Pressing the toggle again sets `tapeOpen = false`; `.player-tape-region` is removed.
- [x] When `duration > 600`: the toggle never opens the tape; it flips `forceWave` as before; `.player-tape-region` is never rendered.
- [x] When `showWave === true`: the toggle flips representation regardless of the cap.
- [x] The motion-toggle button is visible only inside an open tape region; clicking it toggles `tapeMode`.
- [x] `prefers-reduced-motion: reduce` disables the motion-toggle button (it does not need to change `WaveformTape`'s effective behavior — that component already self-clamps).
- [x] On new `requestId`: `tapeOpen = false`, `windowSec = 30`, `tapeMode = 'paged'`.
- [x] **Single-owner check, corrected** — with a caveat: `grep -rn '<audio\|new Audio(' frontend/src/ | grep -v -- '// ADR-0010'` does NOT cleanly return matches in only two files today — it also matches pre-existing prose lines (e.g. `WaveformTape.tsx:19,21`, `WaveformTapeMinimap.tsx:13`, `WaveformStrip.tsx:9,12,21`, `voiceFixtures.ts:12`, `TestSection.tsx:38`) whose comment text mentions `<audio>`/`new Audio(` without repeating the literal string `// ADR-0010` on that same line. Verified via `git stash` that every one of these extra matches predates this task's changes — nothing this task introduced caused them. The *substantive* single-owner invariant holds: the only literal `<audio` element creation is in `PlayerBar.tsx`, and the only literal `new Audio(` call is in `frontend/src/components/forms/VoiceDropzone.tsx` (not `VoiceModals.tsx` — that path in this criterion's text is stale; `VoiceDropzone` lives in `frontend/src/components/forms/VoiceDropzone.tsx`).
- [x] `npm -C frontend run build` passes (no TypeScript errors — specifically, no null-narrowing complaint on `audioEl`/`audioUrl` at the `<WaveformTape>` call site).
- [x] `npm -C frontend run lint` passes.
- [ ] **Owner sign-off** (recorded in `../02-roadmap.md`'s Workload A checklist, not here): tape opens/closes correctly in the running app, matching the approved mock feel. Not verified by this task (implementer-only build/lint/grep checks per "Out of scope").
