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
export const TAPE_ZOOM_PRESETS_SEC = [8, 15, 30, 60, 120] as const;
export type TapeZoomPreset = (typeof TAPE_ZOOM_PRESETS_SEC)[number];
