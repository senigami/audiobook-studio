# 009 — Tape CSS + tests

status: todo
workload: W2 — Port the tape to the live PlayerBar (browser-decoded)
blocked-by: 008
blocks: none (W2 done; unblocks W3 via 010)

## Goal

(1) Add the expanded-tape CSS rules to `frontend/src/theme/components.css` — the grow-upward tape region, footer with minimap + zoom + motion toggle + ruler, tokens, glass contrast, reduced-motion handling.

(2) Write vitest tests in `frontend/tests/unit/player/` covering the five observable behaviors: tape open/close, duration-cap guard, reduced-motion forces paged, fixed-grid stability, and single-owner invariant.

This task closes out Workload 2. After it passes, the W2 sign-off check can be completed.

## Why it matters

The CSS is what makes the bar actually grow upward when the tape opens — without it the tape region renders but has no height. The tests lock in the four regressions most costly to miss: cap guard (crash risk above cap), single-owner (ADR-0010 invariant), and the two key state transitions (open/close, reduced-motion). The fixed-grid stability test catches the crawl/shimmer regression if sampling is accidentally re-anchored to the moving window.

## Files

### Edit

- `frontend/src/theme/components.css` — append tape region rules after the existing player rules (currently ending around line 2646; confirm exact end by grep before editing).

### Create

- `frontend/tests/unit/player/WaveformTape.test.tsx` — vitest tests for the tape component (fixed-grid stability, reduced-motion, single-owner).
- `frontend/tests/unit/player/PlayerBarTape.test.tsx` — vitest integration tests for PlayerBar toggle and cap guard.

No source components are edited in this task.

## Target shape / contract

### CSS additions (`components.css`)

Append after the `.waveform-strip` rules under a new comment block. All new classes are prefixed `player-tape-` or `tape-` to avoid collision with existing classes.

```css
/* ==========================================================================
   PlayerBar — Expanded tape region (W2: WaveformTape)
   ========================================================================== */

/* The tape region sits above .player-bar-content inside .player-bar (flex-column,
   position:fixed bottom:0). Adding it as a flex child above the content row causes
   the bar to grow upward naturally — no JS height calculation needed. */
.player-tape-region {
  width: 100%;
  height: 120px;
  min-height: 96px;
  max-height: 180px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 1.5rem;
  border-top: 1px solid var(--border);
  background: var(--surface);
  animation: tape-region-open 0.18s ease-out both;
}

@keyframes tape-region-open {
  from { opacity: 0; height: 0; padding-top: 0; padding-bottom: 0; }
  to   { opacity: 1; height: 120px; padding-top: 8px; padding-bottom: 8px; }
}

/* Reduced motion: skip the grow animation — instant cut. */
@media (prefers-reduced-motion: reduce) {
  .player-tape-region {
    animation: none;
  }
}

/* Tape SVG canvas wrapper — fills available space above footer. */
.tape-canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-sm, 4px);
  background: var(--color-wave-bg, transparent);
}

/* Playhead line — solid accent, never glass-on-glass tint.
   Positioned absolutely inside .tape-canvas-wrapper by WaveformTape. */
.tape-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--color-wave-cursor, var(--accent));
  pointer-events: none;
  z-index: 2;
  border-radius: 1px;
}

/* Tape footer row — minimap + zoom + motion toggle + ruler, below the canvas. */
.tape-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 28px;
}

/* Time ruler row — below canvas, above footer (or inline in footer). */
.tape-ruler {
  position: relative;
  height: 16px;
  flex-shrink: 0;
  overflow: visible;
}

.tape-ruler-tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: var(--type-micro, 10px);
  color: var(--text-muted);
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

/* Minimap strip — thin full-clip overview. */
.tape-minimap {
  flex: 1;
  height: 20px;
  position: relative;
  border-radius: var(--radius-sm, 4px);
  background: var(--surface-alt);
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
}

/* Minimap window rectangle — solid accent border, semi-transparent fill.
   NOT glass-on-glass — visible against surface-alt background. */
.tape-minimap-window {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border: 1px solid var(--accent);
  border-radius: 2px;
  cursor: grab;
  min-width: 4px;
}

.tape-minimap-window:active {
  cursor: grabbing;
}

/* Minimap playhead — 1px vertical line, whole-clip position. */
.tape-minimap-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-wave-cursor, var(--accent));
  pointer-events: none;
  z-index: 3;
}

/* Zoom preset control — cover-slider style, reuses ns-size-* classes from Library.
   Additional tape-specific overrides below. */
.tape-zoom-control {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* Zoom ± buttons — minimum 44pt touch target (HIG). */
.tape-zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  width: 28px;
  height: 28px;
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

/* Active zoom tick dot — solid accent, not glass tint. */
.tape-zoom-dot--active {
  background: var(--accent) !important;
  transform: scale(1.25);
}

/* Disabled zoom tick dot (beyond zoom-in cap). */
.tape-zoom-dot--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Suppress scale transition under reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .tape-zoom-dot {
    transition: none;
  }
  .tape-zoom-dot--active {
    transform: none;
  }
}

/* Motion toggle button — inline in the tape footer. */
.tape-motion-toggle {
  flex-shrink: 0;
  min-width: 44px;
  min-height: 44px;
}

.tape-motion-toggle:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
```

Confirm no class names above already exist in `components.css` by running `grep -n 'tape-' frontend/src/theme/components.css` before appending.

### Vitest tests — testing standards (binding)

From `docs/specs/testing-standards.md`:
- Tests live under `frontend/tests/` (never inside `frontend/src/`); mirror source layout as `frontend/tests/unit/player/`.
- **R2 — Mock boundaries only:** mock wavesurfer.js (external), `window.matchMedia`, `HTMLAudioElement`. Do NOT mock `playerBus` internals — drive the bus through its public API (`loadAndPlay`, `resetPlayerBusForTests`).
- **R4 — No sleep-based timing:** use vitest fake timers and `waitFor` from `@testing-library/react`.
- Assert observable behavior (DOM output, bus state), not internal implementation math.

#### Shared wavesurfer mock (top of each test file that uses WaveformTape)

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

This is a legitimate mock: wavesurfer.js is an external package, outside the unit under test.

---

#### `frontend/tests/unit/player/PlayerBarTape.test.tsx`

Tests 1–4 cover PlayerBar-level behavior.

**Test 1 — Toggle opens tape (under cap):**
```
beforeEach: resetPlayerBusForTests()
Setup: render <PlayerBar />;
  call loadAndPlay({ scope: 'chapter', title: 'Ch 1', audioUrl: '/ch1.mp3',
    duration: 300 }) — note: duration on the bus comes from reportTime; mock
    the HTMLAudioElement's loadedmetadata to fire with duration=300.
Action: click the element with aria-label matching "Open tape view".
Assert: document.querySelector('.player-tape-region') is not null.
```

**Test 2 — Toggle closes tape:**
```
Continuing from Test 1 setup (tape open):
Action: click the toggle again (aria-label now "Close tape view").
Assert: document.querySelector('.player-tape-region') is null.
```

**Test 3 — Duration cap guard (over cap → tape never opened):**
```
beforeEach: resetPlayerBusForTests()
Setup: render <PlayerBar />;
  drive bus to duration > TAPE_DURATION_CAP_SEC — mock loadedmetadata with
  duration=900 (> 600 s cap).
Action: click the AudioLines toggle.
Assert: document.querySelector('.player-tape-region') is null.
Assert: the toggle's aria-label is NOT "Open tape view" (it's "Show waveform" or
  "Show progress bar" — the representation-flip behavior, not tape-open).
Note: import TAPE_DURATION_CAP_SEC from PlayerBar.tsx (or its constants module)
  to avoid hardcoding 600.
```

**Test 4 — Single-owner invariant (static source check):**
```typescript
import tapeSource    from '../../../src/app/layout/WaveformTape.tsx?raw';
import zoomSource    from '../../../src/app/layout/WaveformTapeZoom.tsx?raw';
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

This is a static source check — no render required. It runs in milliseconds and makes the single-owner invariant part of the vitest suite so CI breaks if it is violated.

---

#### `frontend/tests/unit/player/WaveformTape.test.tsx`

Tests 5–6 cover tape component internals.

**Test 5 — Reduced-motion forces paged:**
```
beforeEach:
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

Setup: render <WaveformTape audioEl={mockAudioEl} audioUrl="/ch1.mp3"
  duration={300} windowSec={30} mode="moving" peaks={null} onSeek={vi.fn()} />.

Assert: no element with class "tape-page-transition" is present in the DOM.
Assert: if WaveformTape exposes a data attribute for the active mode (e.g.
  data-tape-mode="paged"), assert it equals "paged" (not "moving").
  If no data attribute, assert there is no element with a "moving" indicator class.

Observable behavior: the component received mode="moving" but renders as paged
  because prefers-reduced-motion: reduce is active.
```

**Test 6 — Fixed-grid sampling stability:**
```
Setup: construct a synthetic peak array of 4000 elements (all 0.5 — uniform).
  Create a WaveformTape test harness (not a full render — can be a unit test of
  the sampling helper exported from WaveformTape if the function is exported, or
  a render test if not).
  Initial position = 10 s, windowSec = 30, duration = 300.

Action: advance position to 25 s (still within the same page [0, 30)).

Assert: the bar heights at each grid index are IDENTICAL before and after the
  position advance. Sampled peak values must not change within a page because the
  grid anchors on absolute time, not relative window position.

Implementation: if WaveformTape exports a pure `sampleGrid(peaks, duration,
  windowSec, viewStart, barCount)` helper, test it directly (no render). If it
  does not export the helper, render the component, capture bar heights from the
  SVG rects before and after a seek within the same page, and compare.

This test guards against the crawl/shimmer regression (spec §5.3; audit report F3).
```

**Teardown (both test files):**
```typescript
afterEach(() => {
  resetPlayerBusForTests();
  vi.restoreAllMocks();
});
```

## Steps

1. Run `grep -n 'tape-\|player-tape' frontend/src/theme/components.css` — confirm no name collisions.
2. Append CSS rules to `components.css` after the existing player rules under the new comment block.
3. Create `frontend/tests/unit/player/` directory if it does not exist.
4. Write `PlayerBarTape.test.tsx` with tests 1–4.
5. Write `WaveformTape.test.tsx` with tests 5–6 and the wavesurfer mock.
6. Run `npm -C frontend run test -- --run frontend/tests/unit/player/` — confirm all tests pass. Fix any failures.
7. Run `npm -C frontend run build` — confirm no CSS parse errors and no TypeScript errors.
8. Run `npm -C frontend run lint` — confirm clean.
9. **W2 sign-off:** verify in the running app per the acceptance criteria below.

## Acceptance criteria

**CSS:**
- `.player-tape-region` renders at ~120 px height when present in the DOM.
- The bar grows upward: `.player-tape-region` appears above `.player-bar-content`, not below.
- `.tape-playhead` uses `var(--color-wave-cursor, var(--accent))` — solid, never glass-on-glass tint.
- `.tape-minimap-window` border is `var(--accent)` solid.
- `@media (prefers-reduced-motion: reduce)` block: `.player-tape-region { animation: none }` is present.
- No existing CSS class names in `components.css` are collided or overwritten.
- `npm -C frontend run build` passes (Vite does not error on the new CSS).
- `npm -C frontend run lint` passes on `components.css`.

**Tests:**
- All 6 tests pass: `npm -C frontend run test -- --run frontend/tests/unit/player/`.
- Test 1: `.player-tape-region` appears in DOM after toggle click (under-cap clip, duration=300).
- Test 2: `.player-tape-region` is removed after a second toggle click.
- Test 3: `.player-tape-region` is absent when `duration > TAPE_DURATION_CAP_SEC`; toggle changes aria-label to a representation-flip label, not "Open tape view".
- Test 4: `WaveformTape.tsx`, `WaveformTapeZoom.tsx`, `WaveformTapeMinimap.tsx` source does not contain `<audio` or `new Audio(`.
- Test 5: no page-transition class / "moving" indicator in the DOM when `prefers-reduced-motion: reduce` is mocked, even when `mode="moving"` is passed.
- Test 6: bar sample values are identical before and after advancing `position` within the same page — no crawl/shimmer.
- No sleep-based timing: only `waitFor` / vitest fake timers used.
- `playerBus` internals are NOT mocked: bus is driven via `loadAndPlay`, `resetPlayerBusForTests`.

**Running app sign-off (W2 complete):**
- Open a chapter under the duration cap; press the `AudioLines` toggle → tape opens (tape canvas with waveform bars, moving playhead, minimap with window rect, zoom dots, motion toggle button).
- Play audio — playhead moves across the tape; at the window edge the page advances (in paged mode).
- Click the motion toggle → moving mode: playhead stays fixed at center, waveform scrolls past it.
- Drag the minimap rectangle — tape window jumps to the new position.
- Step through zoom presets — the tape window changes size accordingly; ruler ticks update.
- Press `AudioLines` again → tape closes, bar returns to one row.
- Open a clip **over the cap** (mock a long duration or use a long chapter) → toggle does NOT open the tape; flips representation as before.
- Set `prefers-reduced-motion: reduce` (via OS or browser DevTools) → tape opens/closes instantly (no grow animation); motion toggle is disabled; tape is always paged.
- Single-owner grep: `grep -rn '<audio\|new Audio(' frontend/src/` — tape component files do not appear.
- `npm -C frontend run build` + `npm -C frontend run lint` + `npm -C frontend run test -- --run` all green.

## Out of scope

- W3 work: peaks sidecar, source-swap, cap lift, virtualization (tasks 010–012).
- Annotation / edit-marking — post-V2.
- Any backend changes.
- Persisting zoom preset or motion mode across sessions (resets on new source by design).

## References

- `frontend/src/theme/components.css:2355–2646` (approx.) — existing player CSS to append after; exact end line by `grep -n 'waveform-strip' components.css`
- `frontend/src/theme/tokens.css:199–208` — `--color-wave-*` tokens (light mode)
- `frontend/src/theme/tokens.css:327–333` — `--color-wave-*` dark overrides
- `frontend/src/app/layout/PlayerBar.tsx` — source of `TAPE_DURATION_CAP_SEC` export (task 008)
- `frontend/src/store/playerBus.ts:210–216` — `resetPlayerBusForTests()` for test teardown
- `docs/specs/audio-player.md` 1.6.0 §5.2 (tape interaction: contrast on glass, reduced-motion forces paged, paged↔moving toggle); §5.3 (fixed-grid sampling — stability invariant)
- `docs/specs/testing-standards.md` — R1 (revert-check for bug-fix tests), R2 (mock boundaries only), R4 (no sleep-based timing); test location rule (`frontend/tests/`)
- `plans/audio_player_waveform_scrubber/01-roadmap.md` — W2 sign-off check (the complete sign-off criteria this task closes)
- `plans/audio_player_waveform_scrubber/00-audit-report.md §E` — F4 (single-owner grep must pass), F5 (reduced motion free under paged-default), F3 (fixed-grid stability / crawl-shimmer regression)
