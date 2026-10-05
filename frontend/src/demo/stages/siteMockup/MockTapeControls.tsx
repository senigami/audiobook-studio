/**
 * MockTapeControls.tsx — zoom preset control and minimap strip for the
 * waveform tape prototype. Both components are pure visual/interaction mocks;
 * no real audio dependency. Live in the North-Star mockup only.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { speechPeakAt } from './shared';

// ---------------------------------------------------------------------------
// Zoom presets

export const ZOOM_PRESETS = [120, 60, 30, 15, 8] as const;
export type ZoomPreset = (typeof ZOOM_PRESETS)[number];

/**
 * Step through zoom presets.
 * 'out' → more seconds visible (larger index, wider window).
 * 'in'  → fewer seconds visible (smaller index, tighter window).
 */
export function snapZoom(current: ZoomPreset, direction: 'in' | 'out'): ZoomPreset {
  const idx = ZOOM_PRESETS.indexOf(current);
  if (direction === 'out') return ZOOM_PRESETS[Math.min(idx + 1, ZOOM_PRESETS.length - 1)];
  return ZOOM_PRESETS[Math.max(idx - 1, 0)];
}

// ---------------------------------------------------------------------------
// InlineWave — the compact scrub waveform for short clips. Uses the SAME
// realistic peaks (speechPeakAt) as the tape so the inline player and the tape
// look consistent (no more "old vs new" mismatch). Static bars across the whole
// clip; the fill tracks the playhead. No paging / ruler — it's just the scrub.

export const InlineWave: React.FC<{ durationSec: number; currentTimeSec: number; height?: number }> = ({
  durationSec,
  currentTimeSec,
  height = 32,
}) => {
  const BARS = 120;
  const barW = 2;
  const gap = 1;
  const viewW = BARS * (barW + gap);
  const playedFrac = durationSec > 0 ? currentTimeSec / durationSec : 0;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${viewW} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      {Array.from({ length: BARS }, (_, i) => {
        const amp = speechPeakAt(((i + 0.5) / BARS) * durationSec);
        const barH = Math.max(2, amp * (height - 6));
        const x = i * (barW + gap);
        const y = (height - barH) / 2;
        const played = i / BARS <= playedFrac;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={1}
            fill={played ? 'var(--color-wave-progress)' : 'var(--color-wave)'}
            opacity={played ? 0.9 : 0.5}
          />
        );
      })}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// ZoomPresetControl

export interface ZoomPresetControlProps {
  windowSec: ZoomPreset;
  onZoomChange: (preset: ZoomPreset) => void;
}

export const ZoomPresetControl: React.FC<ZoomPresetControlProps> = ({
  windowSec,
  onZoomChange,
}) => {
  // Reuse the Library cover-size slider look (track + tick dots + accent thumb).
  // Slider value = index into ZOOM_PRESETS; left = zoomed out, right = zoomed in.
  const idx = Math.max(0, ZOOM_PRESETS.indexOf(windowSec));
  const last = ZOOM_PRESETS.length - 1;
  return (
    <div className="ns-size-control" role="group" aria-label="Zoom level" style={{ flexShrink: 0 }}>
      <button
        type="button"
        className="ns-size-glyph"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => onZoomChange(ZOOM_PRESETS[0])}
        style={{ width: 9, height: 9 }}
      />
      <div className="ns-size-slider-wrap">
        <div className="ns-size-track" aria-hidden="true" />
        {ZOOM_PRESETS.map((_, i) => (
          <span
            key={i}
            className="ns-size-tick"
            aria-hidden="true"
            style={{ left: `calc(7px + ${i / last} * (100% - 14px))` }}
          />
        ))}
        <input
          type="range"
          className="ns-size-slider"
          min={0}
          max={last}
          step={1}
          value={idx}
          onChange={(e) => onZoomChange(ZOOM_PRESETS[Number(e.target.value)])}
          aria-label="Zoom level"
          title="Zoom level"
        />
      </div>
      <button
        type="button"
        className="ns-size-glyph"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => onZoomChange(ZOOM_PRESETS[last])}
        style={{ width: 15, height: 15 }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// TapeMinimapStrip

export interface TapeMinimapStripProps {
  /** Total clip duration in seconds. */
  durationSec: number;
  /** Current playback position in seconds. */
  currentTimeSec: number;
  /** Width of the tape viewport in seconds (current zoom window span). */
  windowSec: number;
  /** Called when the user drags on the minimap to seek (absolute time in seconds). */
  onSeek: (newTimeSec: number) => void;
  /** Strip height in pixels. Default 28. */
  height?: number;
  /**
   * Matches the tape's motion. 'paged': the window box jumps page-by-page.
   * 'scroll': the window box is centered on the playhead and slides smoothly.
   */
  mode?: 'paged' | 'scroll';
}

export const TapeMinimapStrip: React.FC<TapeMinimapStripProps> = ({
  durationSec,
  currentTimeSec,
  windowSec,
  onSeek,
  height = 28,
  mode = 'paged',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  // Minimap SVG viewBox: each peak gets 3 px wide, 1 px gap
  const barW = 2;
  const barGap = 1;
  // Whole-clip overview: sample the procedural envelope across [0, durationSec].
  const MINIMAP_BARS = 200;
  const minimapPeaks = Array.from({ length: MINIMAP_BARS }, (_, i) =>
    speechPeakAt(((i + 0.5) / MINIMAP_BARS) * durationSec),
  );
  const totalPeaks = MINIMAP_BARS;
  const viewW = totalPeaks * (barW + barGap);
  const viewH = height;

  // Window box geometry — mirrors the tape's motion (audio-player spec §5.2):
  //  - paged: the box snaps to windowSec-sized pages (jumps);
  //  - scroll: the box is centered on the playhead and slides smoothly as it plays.
  const viewStart =
    mode === 'scroll'
      ? currentTimeSec - windowSec / 2
      : Math.floor(currentTimeSec / windowSec) * windowSec;
  const rectLeft = durationSec > 0 ? (viewStart / durationSec) * viewW : 0;
  const rectWidth = durationSec > 0 ? (windowSec / durationSec) * viewW : viewW;

  // Playhead position in minimap (the center of the box in scroll mode).
  const playheadX = durationSec > 0 ? (currentTimeSec / durationSec) * viewW : 0;

  // Pointer → seek to the clicked absolute time (intuitive in both modes).
  const pointerToTime = useCallback(
    (clientX: number): number => {
      const el = svgRef.current;
      if (!el) return currentTimeSec;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.max(0, Math.min(durationSec, frac * durationSec));
    },
    [durationSec, currentTimeSec],
  );

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true;
    onSeek(pointerToTime(e.clientX));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onSeek(pointerToTime(e.clientX));
    };
    const onUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onSeek, pointerToTime]);

  return (
    <div className="nsp-minimap">
      <svg
        ref={svgRef}
        width="100%"
        height={viewH}
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ew-resize', touchAction: 'none', display: 'block' }}
        aria-label="Clip overview — drag to navigate"
      >
        {/* All peaks at compressed scale */}
        {minimapPeaks.map((amp, i) => {
          const x = i * (barW + barGap);
          const barH = Math.max(1, amp * (viewH - 4));
          const y = (viewH - barH) / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={0.5}
              fill="var(--color-wave)"
              opacity={0.45}
            />
          );
        })}
        {/* Window rect */}
        <rect
          x={rectLeft}
          y={0}
          width={Math.max(rectWidth, 4)}
          height={viewH}
          fill="var(--action-primary)"
          fillOpacity={0.15}
          stroke="var(--action-primary)"
          strokeWidth={1}
          strokeOpacity={0.6}
          rx={1}
        />
        {/* Playhead line */}
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={viewH}
          stroke="var(--action-primary)"
          strokeWidth={1}
          opacity={0.8}
        />
      </svg>
    </div>
  );
};
