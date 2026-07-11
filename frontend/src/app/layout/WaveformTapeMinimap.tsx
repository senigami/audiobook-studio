// ADR-0010: single <audio> owner. This component must NEVER create an
// <audio> element or call new Audio().
/**
 * WaveformTapeMinimap.tsx
 *
 * Whole-clip minimap strip + draggable window rectangle + playhead for the
 * WaveformTape (audio-player.md 1.6.0 §5.2). Ported from the North-Star
 * mock's `TapeMinimapStrip`
 * (frontend/src/demo/stages/siteMockup/MockTapeControls.tsx:103-223),
 * replacing the mock's synthetic `speechPeakAt` samples with the real peak
 * array from task 006's `usePeaks`.
 *
 * Single-owner note: this component never touches an `<audio>` element or
 * calls `bus.seek` directly — all navigation is delegated upward through the
 * `onSeek` prop so the parent (PlayerBar, task 008) stays the sole owner of
 * playback.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { computeTapeBarCount } from './waveformTapeZoomPresets';

// Bug this fixes: MINIMAP_BARS used to be a fixed constant (200) regardless
// of how many real peaks were available or how many pixels the strip
// actually had — same class of bug as the main tape canvas (see
// `computeTapeBarCount` in WaveformTape.tsx), just applied to the WHOLE clip
// instead of the zoom window. The minimap represents the full chapter
// duration, so its natural peaks-per-bar ratio is far sparser than the
// zoomed tape's for any chapter longer than a few minutes — but it should
// still use as much of its available container pixel width as real peak
// data allows, same "never fabricate" invariant (max-abs-per-bucket,
// nearest-real-sample). Reuses `computeTapeBarCount` with `windowSec =
// duration` (the minimap's "window" is the entire clip) so both bar-count
// policies stay in lockstep instead of drifting.
const MINIMAP_MIN_BARS = 200; // floor — matches the old fixed value
const BAR_W = 2;
const BAR_GAP = 1;
const MIN_RECT_WIDTH = 4;
const FALLBACK_AMP = 0.4;

export interface WaveformTapeMinimapProps {
  /** Total clip duration in seconds. */
  duration: number;
  /** Current playback position in seconds. */
  currentTimeSec: number;
  /** Start of the tape's current visible window (seconds). */
  windowStartSec: number;
  /** Width of the tape's current window (seconds = active preset). */
  windowSec: number;
  /** Called when user drags the window rect or clicks outside it. */
  onSeek: (newWindowStartSec: number) => void;
  /** Peak array from usePeaks — renders the whole-clip amplitude shape.
   *  If null (still decoding), render a plain tinted bar as fallback. */
  peaks: number[] | null;
  /** Strip height in pixels. Default 28. */
  height?: number;
}

export const WaveformTapeMinimap: React.FC<WaveformTapeMinimapProps> = ({
  duration,
  currentTimeSec,
  windowStartSec,
  windowSec,
  onSeek,
  peaks,
  height = 28,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  // Container width drives the dynamic bar count below, same measurement
  // pattern as WaveformTape's `containerWidthPx`.
  const [containerWidthPx, setContainerWidthPx] = useState(0);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setContainerWidthPx(el.getBoundingClientRect().width || el.clientWidth || 0);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidthPx(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const availablePeaks = peaks && peaks.length > 0 ? peaks.length : null;
  const minimapBarCount = Math.max(
    MINIMAP_MIN_BARS,
    computeTapeBarCount(availablePeaks, duration, duration, containerWidthPx),
  );
  const viewW = minimapBarCount * (BAR_W + BAR_GAP);

  const clampStart = useCallback(
    (start: number): number => {
      const maxStart = Math.max(0, duration - windowSec);
      return Math.max(0, Math.min(maxStart, start));
    },
    [duration, windowSec],
  );

  const minimapPeaks = Array.from({ length: minimapBarCount }, (_, i) => {
    if (!peaks || peaks.length === 0) return FALLBACK_AMP;
    const idx = Math.floor(((i + 0.5) / minimapBarCount) * (peaks.length - 1));
    return peaks[idx] ?? 0;
  });

  const rectLeft = duration > 0 ? (windowStartSec / duration) * viewW : 0;
  const rectWidth = duration > 0 ? (windowSec / duration) * viewW : viewW;
  const playheadX = duration > 0 ? (currentTimeSec / duration) * viewW : 0;

  // Converts a pointer position to a new window start. A single rule covers
  // both gestures the task describes (§Drag to navigate / §Click outside
  // rectangle): the window is always centered on the pointer's clicked time,
  // clamped to [0, duration - windowSec]. Whether the pointer started inside
  // or outside the current rect doesn't change the formula — it changes only
  // what the user perceives (dragging the rect vs. jumping to a new spot),
  // which naturally falls out of "center on pointer" in both cases. Matches
  // the mock's `pointerToTime`, which uses the same unconditional formula for
  // both mousedown and mousemove (MockTapeControls.tsx:192-201).
  const pointerToPageStart = useCallback(
    (clientX: number): number => {
      const el = svgRef.current;
      if (!el || duration <= 0) return windowStartSec;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const clickedTime = frac * duration;
      return clampStart(clickedTime - windowSec / 2);
    },
    [duration, windowStartSec, windowSec, clampStart],
  );

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true;
    onSeek(pointerToPageStart(e.clientX));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onSeek(pointerToPageStart(e.clientX));
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
  }, [onSeek, pointerToPageStart]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeek(clampStart(windowStartSec + windowSec));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeek(clampStart(windowStartSec - windowSec));
    }
  };

  return (
    <div
      className="nsp-minimap"
      role="region"
      aria-label="Clip overview — drag to navigate"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ minHeight: 44 }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${viewW} ${height}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'ew-resize', touchAction: 'none', display: 'block' }}
      >
        {minimapPeaks.map((amp, i) => {
          const x = i * (BAR_W + BAR_GAP);
          const barH = Math.max(1, amp * (height - 4));
          const y = (height - barH) / 2;
          return (
            <rect
              key={i}
              className="tape-minimap-bar"
              x={x}
              y={y}
              width={BAR_W}
              height={barH}
              rx={0.5}
              fill="var(--color-wave)"
              opacity={0.45}
            />
          );
        })}
        <rect
          className="tape-minimap-window"
          x={rectLeft}
          y={0}
          width={Math.max(rectWidth, MIN_RECT_WIDTH)}
          height={height}
          fill="var(--accent)"
          fillOpacity={0.15}
          stroke="var(--accent)"
          strokeWidth={1}
          rx={1}
        />
        {/*
          Deliberately NOT --color-wave-cursor/--accent: the window rect
          above already uses --accent for both of its vertical edges, and
          this playhead line sits between them. Three same-colored blue
          lines in a 200px-wide strip read as one confusing cluster —
          --text-muted (existing neutral token, themed for both light/dark)
          keeps the playhead visually distinct from the window bounds.
        */}
        <line
          className="tape-minimap-playhead"
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={height}
          stroke="var(--text-muted)"
          strokeWidth={1}
          opacity={0.9}
        />
      </svg>
    </div>
  );
};
