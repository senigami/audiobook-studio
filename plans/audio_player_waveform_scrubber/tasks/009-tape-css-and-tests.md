# 009 — Tape CSS + tests

status: todo
workload: W2 — Real tape + zoom (browser-decoded)
blocked-by: 008
blocks: none (W2 done; unblocks W3 via 010)

## Goal

(1) Add the expanded-tape CSS rules to `frontend/src/theme/components.css` — the grow-upward tape region, height, glass contrast for playhead and minimap, and reduced-motion handling.

(2) Write vitest tests in `frontend/tests/` covering the four observable behaviors that must hold for the tape integration: toggle opens/closes the tape, the duration cap guard (over-cap → plain bar), the reduced-motion path, and the single-owner invariant.

This task closes out Workload 2. After it passes, the W2 sign-off check can be completed.

## Why it matters

The CSS is what makes the bar actually grow upward when the tape opens — without it the tape region renders but has no height and no visual separation from the controls. The tests lock in the four regressions that would be most costly to miss: cap guard (a crash risk above cap), single-owner (an ADR-0010 invariant), and the two state transitions (open/close, reduced-motion).

## Files

- **Edit:** `frontend/src/theme/components.css` — add tape region rules after the existing player rules (currently ending around line 2646).
- **Create:** `frontend/tests/unit/player/WaveformTape.test.tsx` — vitest unit tests for the tape component behaviors.
- **Create:** `frontend/tests/unit/player/PlayerBarTape.test.tsx` — vitest integration tests for PlayerBar toggle + cap guard.

No source components are edited in this task (those are 006, 007, 008).

## Target shape / contract

### CSS additions (`components.css`)

Append after the `.waveform-strip` rules (current line 2646). All new rules are grouped under a new comment block:

```css
/* ==========================================================================
   PlayerBar — Expanded tape region (W2: WaveformTape)
   ========================================================================== */

/* The tape region sits above .player-bar-content inside .player-bar (flex-column,
   position:fixed bottom:0). Adding it as a flex child above the content row causes
   the bar to grow upward naturally — no JS height calculation needed. */
.player-tape-region {
  width: 100%;
  height: 120px;             /* tape canvas + minimap + zoom control */
  min-height: 96px;
  max-height: 180px;         /* safety cap on growth */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 1.5rem;
  border-top: 1px solid var(--border);
  background: var(--surface);  /* matches .player-bar */
  /* Grow animation — the region fades+slides in when tapeOpen flips to true.
     Reduced-motion override below collapses this to instant. */
  animation: tape-open 0.18s ease-out both;
}

@keyframes tape-open {
  from {
    opacity: 0;
    height: 0;
    padding-top: 0;
    padding-bottom: 0;
  }
  to {
    opacity: 1;
    height: 120px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
}

/* Reduced motion: skip the grow animation — instant cut, no height transition. */
@media (prefers-reduced-motion: reduce) {
  .player-tape-region {
    animation: none;
  }
}

/* Tape canvas wrapper — fills the available space above the minimap. */
.tape-canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-sm, 4px);
  background: var(--color-wave-bg, transparent);
}

/* Playhead line — solid accent, not glass-on-glass tint.
   Positioned absolutely inside .tape-canvas-wrapper by the WaveformTape component. */
.tape-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-wave-cursor, var(--accent));  /* solid accent */
  pointer-events: none;
  z-index: 2;
  border-radius: 1px;
}

/* Minimap strip — thin full-clip overview below the main tape canvas. */
.tape-minimap {
  height: 20px;
  position: relative;
  border-radius: var(--radius-sm, 4px);
  background: var(--surface-alt);
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
}

/* Minimap window rectangle — solid accent border, semi-transparent fill.
   NOT a glass-on-glass tint — must be visible against the surface-alt background. */
.tape-minimap-window {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border: 1px solid var(--accent);   /* solid accent border — glass contrast */
  border-radius: 2px;
  cursor: grab;
  min-width: 8px;
}

.tape-minimap-window:active {
  cursor: grabbing;
}

/* Minimap playhead — 1px vertical line showing current position across full clip. */
.tape-minimap-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-wave-cursor, var(--accent));
  pointer-events: none;
  z-index: 3;
}

/* Tape header row — zoom control + optional label */
.tape-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  height: 28px;
}

/* Zoom preset control — cover-slider style */
.tape-zoom-control {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.tape-zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 44px;   /* HIG 44pt minimum touch target */
  min-height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1rem;
}

.tape-zoom-btn:hover:not(:disabled) {
  background: var(--surface-alt);
  color: var(--text-primary);
}

.tape-zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Zoom slider track + tick dots */
.tape-zoom-track {
  position: relative;
  display: flex;
  align-items: center;
  width: 100px;
  height: 44px;   /* minimum touch target height */
}

.tape-zoom-rail {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--border);
  border-radius: 1px;
}

.tape-zoom-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  border: 1.5px solid var(--surface);
  transition: background 0.12s ease, transform 0.12s ease;
  flex-shrink: 0;
  cursor: pointer;
}

.tape-zoom-dot--active {
  background: var(--accent);   /* solid accent — not glass-on-glass */
  transform: scale(1.25);
}

.tape-zoom-dot--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Reduced motion: suppress zoom dot scale transition */
@media (prefers-reduced-motion: reduce) {
  .tape-zoom-dot {
    transition: none;
  }
}
```

### Vitest tests

**Testing standards binding (from `docs/specs/testing-standards.md`):**
- Tests live under `frontend/tests/` (never inside `frontend/src/`).
- Mirror the source layout: `frontend/tests/unit/player/`.
- Mock only what is outside the unit under test: mock wavesurfer.js (external package), mock `window.matchMedia`, mock `HTMLAudioElement`. Do NOT mock `playerBus` internals — use `resetPlayerBusForTests()` and drive the bus through its public API.
- No sleep-based timing: use vitest fake timers and `waitFor` from `@testing-library/react`.
- Assert observable behavior (DOM output, bus calls), not internal implementation math.
- R3 — bus event frames built via bus public API, not hand-rolled frame literals.

#### `frontend/tests/unit/player/PlayerBarTape.test.tsx`

Four tests, one per criterion:

**Test 1 — Toggle opens tape (under cap):**
```
Setup: render PlayerBar; drive bus via loadAndPlay({ audioUrl, duration: 300 }); wait for audioEl.
Action: click the AudioLines toggle button.
Assert: the DOM contains an element with class player-tape-region.
```

**Test 2 — Toggle closes tape:**
```
Continuing from Test 1, click the toggle again.
Assert: player-tape-region is not in the DOM.
```

**Test 3 — Duration cap guard (over cap → bar, tape never offered):**
```
Setup: render PlayerBar; drive bus via loadAndPlay({ audioUrl, duration: 900 }) (> TAPE_DURATION_CAP_SEC of 600).
Action: click the AudioLines toggle button.
Assert: player-tape-region is NOT in the DOM.
Assert: forceWave flipped (the toggle still changes representation, as today).
```
Note: import `TAPE_DURATION_CAP_SEC` from `PlayerBar.tsx` to avoid hardcoding the threshold.

**Test 4 — Single-owner invariant:**
```
Static assertion (not a runtime test): run the grep in the test setup or as a separate shell assertion.
Preferred approach: in the test file, import the source text of WaveformTape.tsx, WaveformTapeZoom.tsx,
WaveformTapeMinimap.tsx and assert they do not contain the strings '<audio' or 'new Audio('.
This makes the single-owner check part of the vitest suite so it breaks the build if violated.
```
Implementation pattern:
```typescript
import tapeSource from '../../../src/app/layout/WaveformTape.tsx?raw';
import zoomSource from '../../../src/app/layout/WaveformTapeZoom.tsx?raw';
import minimapSource from '../../../src/app/layout/WaveformTapeMinimap.tsx?raw';

it('WaveformTape components do not create a second audio owner', () => {
  for (const [name, source] of [
    ['WaveformTape', tapeSource],
    ['WaveformTapeZoom', zoomSource],
    ['WaveformTapeMinimap', minimapSource],
  ]) {
    expect(source, `${name} must not contain <audio`).not.toMatch('<audio');
    expect(source, `${name} must not call new Audio(`).not.toMatch('new Audio(');
  }
});
```

#### `frontend/tests/unit/player/WaveformTape.test.tsx`

**Test 5 — Reduced-motion path:**
```
Setup: mock window.matchMedia to return matches=true for 'prefers-reduced-motion: reduce'.
Render WaveformTape with a mock audioEl and audioUrl.
Assert: the component renders without a page-transition class on the tape canvas wrapper
(or assert the reduced-motion CSS custom property / animation is not applied).
Observable behavior: no element with class tape-page-transition (or equivalent) is present
in the DOM when reduced motion is active.
```
Use `vi.spyOn(window, 'matchMedia')` returning `{ matches: true, ... }`.

**Wavesurfer mock (shared setup for all WaveformTape tests):**
```typescript
vi.mock('wavesurfer.js', () => ({
  default: {
    create: vi.fn(() => ({
      load: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      exportPeaks: vi.fn(() => [[0.1, 0.5, 0.3]]),
    })),
  },
}));
```

This is a legitimate mock: wavesurfer.js is external to the unit under test.

## Steps

1. Append all CSS rules to `components.css` after line 2646 under the new comment block. Verify no existing class names are collided.
2. Create `frontend/tests/unit/player/` directory if it does not exist.
3. Write `PlayerBarTape.test.tsx` with tests 1–4 (toggle opens, toggle closes, cap guard, single-owner grep).
4. Write `WaveformTape.test.tsx` with test 5 (reduced-motion path) and the wavesurfer mock.
5. Run `npm -C frontend run test -- --run` (targeted: `frontend/tests/unit/player/`) to confirm tests pass. Fix any issues.
6. Run `npm -C frontend run build` and `npm -C frontend run lint`. Fix any issues.
7. Verify in the running app (preview sign-off): see acceptance criteria below.

## Acceptance criteria

**CSS:**
- `.player-tape-region` renders at ~120 px height when present in the DOM.
- The bar grows upward (the tape region appears above the control row, not below, not floating).
- `.tape-playhead` uses `var(--color-wave-cursor)` (solid accent) — not a glass tint.
- `.tape-minimap-window` border is `var(--accent)` solid.
- `@media (prefers-reduced-motion: reduce)`: `.player-tape-region { animation: none }` is present.
- `npm -C frontend run build` passes (Vite does not error on the new CSS).
- `npm -C frontend run lint` passes on `components.css` (no lint rule violations).

**Tests:**
- All 5 tests are green: `npm -C frontend run test -- --run frontend/tests/unit/player/`.
- Test 1: player-tape-region appears in DOM after toggle click (under-cap clip).
- Test 2: player-tape-region is removed from DOM after second toggle click.
- Test 3: player-tape-region is absent when `duration > TAPE_DURATION_CAP_SEC`; the toggle still flips representation (forceWave changes).
- Test 4: `WaveformTape.tsx`, `WaveformTapeZoom.tsx`, `WaveformTapeMinimap.tsx` source does not contain `<audio` or `new Audio(`.
- Test 5: no page-transition class on the tape canvas wrapper when `prefers-reduced-motion: reduce` is active.
- No sleep-based timing in any test: only `waitFor` / fake timers used.
- Tests mock only external dependencies (wavesurfer.js, matchMedia, HTMLAudioElement) — playerBus internals are NOT mocked; the bus is driven via its public API and reset via `resetPlayerBusForTests()`.

**Running app sign-off (W2 complete):**
- Open a chapter under the duration cap; press the AudioLines toggle → tape opens (tape canvas with bars visible, playhead moving, minimap visible, zoom dots visible).
- Play the audio — the playhead moves across the tape; at the window edge the page advances.
- Drag the minimap rectangle — the tape window jumps to the new position.
- Step through zoom presets — the tape window changes size accordingly.
- Press the toggle again → tape closes, bar returns to one row.
- Open a clip **over** the cap (or mock a long duration) → toggle does NOT open the tape; flips representation as before.
- `prefers-reduced-motion: reduce` (set via OS or browser DevTools) → tape opens/closes instantly, no grow animation.
- Single-owner grep: `grep -rn '<audio\|new Audio(' frontend/src/` — tape component files do not appear.
- `npm -C frontend run build` + `npm -C frontend run lint` + `npm -C frontend run test -- --run` all green.

## Out of scope

- W3 work: peaks sidecar, source-swap, cap lift, virtualization (tasks 010–012).
- Annotation / edit-marking (post-V2).
- Any backend changes.
- Continuous-scroll mode.
- Persisting zoom preset across sessions (by design: resets on new source).

## References

- `frontend/src/theme/components.css:2355–2646` — existing player CSS to append after.
- `frontend/src/theme/tokens.css:199–208` — `--color-wave-*` tokens (light).
- `frontend/src/theme/tokens.css:327–333` — `--color-wave-*` dark overrides.
- `frontend/src/app/layout/PlayerBar.tsx` — source of `TAPE_DURATION_CAP_SEC` export (task 008).
- `frontend/src/store/playerBus.ts:210–216` — `resetPlayerBusForTests()` for test teardown.
- `docs/specs/testing-standards.md` — binding test rules (R1–R4, mock boundaries, no sleep, frontend/tests/ location).
- `plans/audio_player_scrubbing_waveform_proposal.md §3` — tape height (~96–120 px), grow-upward, glass contrast.
- `plans/audio_player_scrubbing_waveform_proposal.md §5` — HIG guardrails: solid accent for playhead/markers, not glass-on-glass.
- `plans/audio_player_waveform_scrubber/01-roadmap.md W2 sign-off check` — the complete sign-off criteria this task closes.
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E, F4` — single-owner grep must still pass.
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E, F5` — reduced motion is free under paged-default.
