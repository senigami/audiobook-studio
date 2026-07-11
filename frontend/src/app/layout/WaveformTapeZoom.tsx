// ADR-0010: single <audio> owner. This component must NEVER create an
// <audio> element or call new Audio().
/**
 * WaveformTapeZoom.tsx
 *
 * Cover-slider zoom preset control for the WaveformTape (audio-player.md
 * 1.6.0 §5.2). Ported from the North-Star mock's `ZoomPresetControl`
 * (frontend/src/demo/stages/siteMockup/MockTapeControls.tsx:34-132), reusing
 * the same Library cover-size slider CSS classes (`ns-size-*`) so the zoom
 * control matches that look without any new CSS for the slider chrome.
 *
 * Bounded discrete presets (spec §5.2, 00-audit-report.md §F decision 4):
 * zoom-in is capped by available peak resolution (`availablePeaks`,
 * `containerWidthPx`, `duration`); zoom-out is always capped at the widest
 * preset (120s) — the minimap, not this control, owns whole-clip navigation.
 */
import React from 'react';
import { TAPE_ZOOM_PRESETS_SEC } from './waveformTapeZoomPresets';
import type { TapeZoomPreset } from './waveformTapeZoomPresets';

const LAST_IDX = TAPE_ZOOM_PRESETS_SEC.length - 1;

/**
 * Step through zoom presets.
 * 'out' → more seconds visible (larger index, wider window).
 * 'in'  → fewer seconds visible (smaller index, tighter window).
 */
export function snapZoom(current: TapeZoomPreset, direction: 'in' | 'out'): TapeZoomPreset {
  const idx = TAPE_ZOOM_PRESETS_SEC.indexOf(current);
  if (direction === 'out') return TAPE_ZOOM_PRESETS_SEC[Math.min(idx + 1, LAST_IDX)];
  return TAPE_ZOOM_PRESETS_SEC[Math.max(idx - 1, 0)];
}

/**
 * Most-zoomed-in preset index that does not magnify past available peak
 * resolution. While peaks are still decoding (`availablePeaks === null`),
 * all presets are enabled (index 0). Zoom-out cap is always LAST_IDX (120s)
 * — never computed, never exceeded.
 */
function computeZoomInCapIdx(
  availablePeaks: number | null,
  duration: number,
  containerWidthPx: number,
): number {
  if (!availablePeaks || duration <= 0) return 0;
  const peaksPerSec = availablePeaks / duration;
  const idx = TAPE_ZOOM_PRESETS_SEC.findIndex((secs) => containerWidthPx / secs <= peaksPerSec);
  return idx === -1 ? LAST_IDX : idx;
}

export interface WaveformTapeZoomProps {
  /** Currently active preset value in seconds (e.g. 30). */
  windowSec: TapeZoomPreset;
  onZoomChange: (preset: TapeZoomPreset) => void;
  /** Total clip duration — used to compute the zoom-in cap. */
  duration: number;
  /** Number of peaks available from usePeaks — sets the zoom-in resolution cap.
   *  When null (still decoding) all presets are enabled. */
  availablePeaks: number | null;
  /** Container width in pixels — used alongside availablePeaks for the cap calc. */
  containerWidthPx: number;
}

export const WaveformTapeZoom: React.FC<WaveformTapeZoomProps> = ({
  windowSec,
  onZoomChange,
  duration,
  availablePeaks,
  containerWidthPx,
}) => {
  const idx = Math.max(0, TAPE_ZOOM_PRESETS_SEC.indexOf(windowSec));
  const zoomInCapIdx = computeZoomInCapIdx(availablePeaks, duration, containerWidthPx);

  const handleChange = (nextIdx: number) => {
    if (nextIdx < zoomInCapIdx) return; // defensive: below the min already enforced by the slider
    onZoomChange(TAPE_ZOOM_PRESETS_SEC[nextIdx]);
  };

  return (
    <div className="ns-size-control" role="group" aria-label="Zoom level" style={{ flexShrink: 0 }}>
      {/*
        Touch-target sizing (44x44pt, HIG) for the thumb and +/- buttons is
        deliberately NOT hard-coded here as inline pixel dimensions — the
        task file assigns that to task 009's CSS tokens ("use
        min-width/min-height: 44px in CSS token via task 009"), and inflating
        the glyph elements' visible box here would break the small
        cover-slider look this control is ported to match (spec: "reuse
        those existing classes so the zoom control matches the library
        cover-slider look"). `.tape-zoom-glyph-hit`/`.tape-zoom-slider-hit`
        are hook classes task 009 targets for the invisible 44x44 hit-area
        padding; no chrome to visually show yet.
      */}
      <button
        type="button"
        className="ns-size-glyph tape-zoom-glyph-hit"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => handleChange(Math.min(idx + 1, LAST_IDX))}
      />
      <div className="ns-size-slider-wrap">
        <div className="ns-size-track" aria-hidden="true" />
        {TAPE_ZOOM_PRESETS_SEC.map((secs, i) => {
          const disabled = i < zoomInCapIdx;
          const active = i === idx;
          return (
            <span
              key={secs}
              className={[
                'ns-size-tick',
                'tape-zoom-dot',
                disabled ? 'tape-zoom-dot--disabled' : '',
                active ? 'tape-zoom-dot--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${secs} seconds`}
              style={{
                left: `calc(7px + ${i / LAST_IDX} * (100% - 14px))`,
                opacity: disabled ? 0.3 : undefined,
                background: active ? 'var(--accent)' : undefined,
              }}
            />
          );
        })}
        <input
          type="range"
          className="ns-size-slider tape-zoom-slider-hit"
          role="slider"
          min={zoomInCapIdx}
          max={LAST_IDX}
          step={1}
          value={idx}
          onChange={(e) => handleChange(Number(e.target.value))}
          aria-label="Zoom level"
          aria-valuemin={0}
          aria-valuemax={LAST_IDX}
          aria-valuenow={idx}
          title="Zoom level"
        />
      </div>
      <button
        type="button"
        className="ns-size-glyph tape-zoom-glyph-hit"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => handleChange(Math.max(idx - 1, zoomInCapIdx))}
      />
    </div>
  );
};
