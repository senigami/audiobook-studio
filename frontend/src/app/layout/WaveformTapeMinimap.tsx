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
import React, { useRef, useEffect, useCallback } from 'react';

const MINIMAP_BARS = 200;
const BAR_W = 2;
const BAR_GAP = 1;
const VIEW_W = MINIMAP_BARS * (BAR_W + BAR_GAP);
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

  const clampStart = useCallback(
    (start: number): number => {
      const maxStart = Math.max(0, duration - windowSec);
      return Math.max(0, Math.min(maxStart, start));
    },
    [duration, windowSec],
  );

  const minimapPeaks = Array.from({ length: MINIMAP_BARS }, (_, i) => {
    if (!peaks || peaks.length === 0) return FALLBACK_AMP;
    const idx = Math.floor(((i + 0.5) / MINIMAP_BARS) * (peaks.length - 1));
    return peaks[idx] ?? 0;
  });

  const rectLeft = duration > 0 ? (windowStartSec / duration) * VIEW_W : 0;
  const rectWidth = duration > 0 ? (windowSec / duration) * VIEW_W : VIEW_W;
  const playheadX = duration > 0 ? (currentTimeSec / duration) * VIEW_W : 0;

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
        viewBox={`0 0 ${VIEW_W} ${height}`}
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
        <line
          className="tape-minimap-playhead"
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={height}
          stroke="var(--color-wave-cursor, var(--accent))"
          strokeWidth={1}
          opacity={0.9}
        />
      </svg>
    </div>
  );
};
