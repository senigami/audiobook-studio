/**
 * waveformTapeZoomPresets.ts
 *
 * Shared zoom-preset constants for the tape (audio-player.md 1.6.0 §5.2).
 * Extracted into their own module so `WaveformTape.tsx` and
 * `WaveformTapeZoom.tsx` can both depend on the same values without an ES
 * module import cycle (WaveformTape renders WaveformTapeZoom, and
 * WaveformTapeZoom needs these constants) — a cycle would otherwise leave
 * one side reading `undefined` mid-evaluation depending on import order.
 *
 * `WaveformTape.tsx` re-exports these so existing/task-006 call sites that
 * import `TAPE_ZOOM_PRESETS_SEC`/`TapeZoomPreset` from `./WaveformTape`
 * continue to work unchanged.
 */
export const TAPE_ZOOM_PRESETS_SEC = [3, 5, 8, 15, 30, 60, 120] as const;
export type TapeZoomPreset = (typeof TAPE_ZOOM_PRESETS_SEC)[number];

/**
 * Number of bars actually sampled/rendered across the tape canvas
 * (`BAR_COUNT` in WaveformTape.tsx). Shared here — rather than imported from
 * WaveformTape.tsx — for the same import-cycle reason as the presets above.
 *
 * NOT used by WaveformTapeZoom's zoom-in cap (see `computeZoomInCapIdx` /
 * `MIN_SAMPLES_IN_VIEW` in WaveformTapeZoom.tsx for why a bars-vs-peaks
 * parity requirement doesn't work as a cap). Kept here purely for the tape
 * canvas's own fixed-grid sampling.
 */
export const TAPE_BAR_COUNT = 180;

// ---------------------------------------------------------------------------
// computeTapeBarCount — shared bar-count-vs-available-pixels/peaks policy
//
// Lives here (not in WaveformTape.tsx) for the same import-cycle reason as
// the constants above: WaveformTapeMinimap.tsx also needs this function (to
// scale its own bar count to its container width — audio-player.md §5.4),
// and WaveformTape.tsx renders <WaveformTapeMinimap>, so a
// WaveformTapeMinimap -> WaveformTape import would cycle back.
// `WaveformTape.tsx` re-exports this so existing call sites/tests that import
// it from './WaveformTape' keep working unchanged.
const MIN_SLOT_PX = 2; // floor pixel width per bar+gap on screen
const MAX_BAR_COUNT = 900; // hard render-cost ceiling

export function computeTapeBarCount(
  availablePeaks: number | null,
  duration: number,
  windowSec: number,
  containerWidthPx: number,
): number {
  if (!containerWidthPx) return TAPE_BAR_COUNT;
  const pixelCap = Math.max(TAPE_BAR_COUNT, Math.floor(containerWidthPx / MIN_SLOT_PX));
  if (!availablePeaks || duration <= 0) return Math.min(TAPE_BAR_COUNT, pixelCap);
  const peaksPerSec = availablePeaks / duration;
  const dataTarget = Math.round(windowSec * peaksPerSec);
  const target = Math.max(TAPE_BAR_COUNT, dataTarget);
  return Math.min(target, pixelCap, MAX_BAR_COUNT);
}
