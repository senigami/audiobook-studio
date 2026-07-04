# audio-player task 007 — zoom presets + minimap (code-map queue entry)

Task: `design-docs/plans/active/audio_player_waveform_scrubber/tasks/007-zoom-presets-and-minimap-real.md`.

## Files changed

- `frontend/src/app/layout/WaveformTapeZoom.tsx` — new. Cover-slider zoom preset control, ported from `ZoomPresetControl`/`snapZoom` in `frontend/src/demo/stages/siteMockup/MockTapeControls.tsx`. Exports `WaveformTapeZoom` (props: `windowSec`, `onZoomChange`, `duration`, `availablePeaks`, `containerWidthPx`) and `snapZoom(current, direction)`. Reuses existing `ns-size-*` CSS classes (no new slider-chrome CSS); renders 5 tick dots (`tape-zoom-dot`, `tape-zoom-dot--active`, `tape-zoom-dot--disabled`) with no second-labels. Zoom-in cap computed from `containerWidthPx/secs <= availablePeaks/duration`; zoom-out cap fixed at index 4 (120s). Touch-target sizing intentionally left to task 009 (hook classes `tape-zoom-glyph-hit`/`tape-zoom-slider-hit` added, no inline pixel dimensions, to avoid inflating/breaking the small cover-slider glyph look prematurely).
- `frontend/src/app/layout/WaveformTapeMinimap.tsx` — new. Whole-clip minimap strip + draggable window rectangle + playhead, ported from `TapeMinimapStrip` in the same mock file. Exports `WaveformTapeMinimap` (props: `duration`, `currentTimeSec`, `windowStartSec`, `windowSec`, `onSeek`, `peaks`, `height?`). Samples `MINIMAP_BARS=200` points from the real peak array (flat 0.4 fallback while `peaks` is null). Drag and click-outside-the-rect both resolve through one `pointerToPageStart` formula (center window on pointer, clamped to `[0, duration-windowSec]`) — matches the mock's single unconditional `pointerToTime`, not two distinct formulas. Delegates all navigation via `onSeek`; never calls `bus.seek` directly. Keyboard `←`/`→` steps the window by `windowSec`.
- `frontend/src/app/layout/waveformTapeZoomPresets.ts` — new. Extracted `TAPE_ZOOM_PRESETS_SEC`/`TapeZoomPreset` into their own module to avoid an ES module import cycle (`WaveformTape.tsx` renders `WaveformTapeZoom.tsx`, which needs these constants at module-eval time). `WaveformTape.tsx` re-exports both so existing/task-006 call sites importing them from `./WaveformTape` are unaffected.
- `frontend/src/app/layout/WaveformTape.tsx` — edited. New optional props `onZoomChange?: (preset: TapeZoomPreset) => void` and `peaks?: number[] | null` (falls back to its own internally-decoded `usePeaks` array when `peaks` is omitted). Renders `<WaveformTapeZoom>` above the SVG canvas (only when `onZoomChange` is provided) and `<WaveformTapeMinimap>` below the ruler. Zoom-snap on wheel (wheel-down = zoom out, one detent = one preset step via `snapZoom`) is attached via a **native, non-passive** `addEventListener('wheel', ..., { passive: false })` in a `useEffect` — see the 2026-07-04 correction below for why. Extended the keyboard handler with `+`/`-` (`=`/`_` as shifted-key aliases) for zoom stepping alongside the existing `←`/`→` ±5s scrub. Re-exports `snapZoom` from `./WaveformTapeZoom`. `containerWidthPx` is measured off the SVG ref via `getBoundingClientRect`/`ResizeObserver`.

**Correction (2026-07-04, review-ratchet fixes `33a07698`):** a Fable adversarial review found two
real bugs in the initial version of this file and `WaveformTapeZoom.tsx`, both fixed with zero
prior test coverage on the affected controls:
- `WaveformTapeZoom`'s `+`/`-` buttons were originally ported verbatim from the mock's
  jump-to-extreme `onClick` handlers (`handleChange(LAST_IDX)` / `handleChange(zoomInCapIdx)`),
  contradicting task 007's own acceptance criteria ("± buttons ... step the preset index"). Fixed
  to step by one, clamped to `[zoomInCapIdx, LAST_IDX]`.
- The wheel handler originally used React's `onWheel` JSX prop + `e.preventDefault()` — a silent
  no-op in real browsers, since React 17+ registers `wheel` as passive at the document root (the
  zoom would snap but the page would also scroll). Replaced with the native listener described
  above. jsdom-based tests cannot reproduce this restriction, so the regression test is structural
  (asserts the `addEventListener` call's `{ passive: false }` option), not behavioral.

## Verification

- `npm -C frontend run build` — passes, no TypeScript errors (one type-only-import fix required: `TapeZoomPreset` under `verbatimModuleSyntax`).
- `npm -C frontend run lint` — 0 errors on all 4 touched/created files (2-3 pre-existing `react-refresh/only-export-components` warnings, same class already present across ~15 other files in the repo, not new).
- `npm -C frontend run test -- --run tests/unit/app/layout/WaveformTapeZoom.test.tsx tests/unit/app/layout/WaveformTapeMinimap.test.tsx tests/unit/app/layout/WaveformTape.test.tsx --maxWorkers=1` — 51/51 passed (11 new zoom tests, 12 new minimap tests, 7 new task-007 wiring tests appended to the existing 21-test WaveformTape suite).
- TDD followed: all new/added tests confirmed red before implementation existed, then green after. One implementation bug (`WaveformTapeMinimap`'s `pointerToPageStart` had two dead-code branches computing the identical expression) was caught in a review-adversarial pass and fixed to a single correct formula; re-verified green.
- `grep -rn '<audio\|new Audio(' frontend/src/` — no real usage in either new file (only comment-line ADR-0010 invariant reminders, matching the existing file-header convention).

## Flow impact

Not yet mounted anywhere — `WaveformTape` is not yet rendered by `PlayerBar` (that wiring is task 008, still pending). No behavior change reaches the running app in this change; this is component-level plumbing only, verified via isolated unit tests.
