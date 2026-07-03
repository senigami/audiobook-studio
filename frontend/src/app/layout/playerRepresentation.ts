/**
 * Duration-driven scrub representation decision for the global PlayerBar.
 *
 * Per audio-player.md 1.6.0 §3/§5.1, the inline scrub track is a waveform
 * when the whole clip fits legibly at the current bar width, else a plain
 * bar. This decision is duration-driven and scope-blind: it must never
 * inspect playerBus `scope`.
 */

/** Minimum pixels-per-second required for the inline waveform to read legibly. */
export const PX_PER_SEC_FLOOR = 3; // px/sec

/**
 * Bootstrap duration threshold used before the bar's measured width is known
 * (e.g. on first render). Below this threshold the waveform is shown; at or
 * above it the bar is shown until a real width measurement arrives.
 */
export const DURATION_BOOTSTRAP = 120; // seconds

/**
 * Returns true when the whole audio clip renders at or above the legibility floor
 * at the given bar width. When barWidthPx is 0 or not yet measured, falls back
 * to a duration-only bootstrap comparison.
 *
 * Duration-driven and scope-blind: does not inspect playerBus `scope`.
 * A 90-second chapter clip and a 90-second segment clip produce the same result.
 */
export function fitsLegibly(durationSec: number, barWidthPx: number): boolean {
  if (durationSec <= 0) return true;          // zero/unknown duration → show waveform
  if (barWidthPx <= 0) {                      // width not yet measured → bootstrap
    return durationSec <= DURATION_BOOTSTRAP;
  }
  return (barWidthPx / durationSec) >= PX_PER_SEC_FLOOR;
}
