// ADR-0010: single <audio> owner. This component must NEVER create an
// <audio> element or call new Audio().
/**
 * WaveformTape.tsx
 *
 * The expandable zoomed "tape" view for the global PlayerBar (audio-player.md
 * 1.6.0 §5). Ported from the North-Star mock's `MockWaveTape`
 * (frontend/src/demo/stages/siteMockup/shared.tsx:616-770) — same
 * rendering/interaction logic, fed by a real browser-decoded peak array
 * instead of the mock's synthetic `speechPeakAt`, and bound to the live
 * `playerBus` (`seek`) instead of local mock state.
 *
 * Fixed-grid sampling (spec §5.3, binding): bars are sampled on an absolute
 * time grid (`gridSec = windowSec / BAR_COUNT`) and the row is translated by
 * the sub-bar remainder — bars are NEVER resampled relative to the moving
 * window, which would make the waveform crawl/shimmer.
 *
 * Single-owner note: `usePeaks` decodes audio via `AudioContext` purely for
 * peak extraction. It never creates an `<audio>` element or a
 * `MediaElementSourceNode` bound to the PlayerBar's audio element — playback
 * stays exclusively in the `<audio>` element owned by PlayerBar.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { seek } from '@/store/playerBus';
import { WaveformTapeZoom, snapZoom } from './WaveformTapeZoom';
import { WaveformTapeMinimap } from './WaveformTapeMinimap';
import { TAPE_ZOOM_PRESETS_SEC } from './waveformTapeZoomPresets';
import type { TapeZoomPreset } from './waveformTapeZoomPresets';

// ---------------------------------------------------------------------------
// Exports shared with task 007 (zoom presets) and tests
//
// TAPE_ZOOM_PRESETS_SEC/TapeZoomPreset live in ./waveformTapeZoomPresets.ts
// (not defined here) to avoid an ES module import cycle: this file renders
// <WaveformTapeZoom>, which itself needs these constants at module-eval
// time. Re-exported here so existing call sites that import them from
// './WaveformTape' (the task 006 contract) keep working unchanged.
export { TAPE_ZOOM_PRESETS_SEC };
export type { TapeZoomPreset };
export const PEAKS_COUNT = 4000;

// Re-export so PlayerBar (task 008) and tests can import snapZoom from
// either WaveformTape or WaveformTapeZoom.
export { snapZoom };

// ---------------------------------------------------------------------------
// usePeaks — browser peak provider (Web Audio decode → downsampled number[])

/**
 * Decodes the audio at audioUrl via the Web Audio API into a downsampled
 * `number[]` of length `min(PEAKS_COUNT, rawSampleCount)`, each value in
 * [0, 1] (max absolute sample per bucket). Clips shorter than PEAKS_COUNT
 * raw samples get a peaks array sized to their actual sample count (no
 * zero-padded tail) so the render code's proportional indexing covers the
 * whole clip. Returns null while decoding, the array when ready, or an
 * empty array on error. Re-runs when audioUrl changes.
 *
 * audioEl is accepted per the target contract (task 006) so a future/derived
 * provider can key off the element if needed, but this implementation
 * decodes an independently-fetched buffer — it never touches audioEl itself,
 * preserving the single-owner invariant.
 *
 * suppliedPeaks (task 008): when passed a non-empty array (e.g. from the
 * server-computed peaks sidecar), it is returned directly and the fetch+decode
 * effect below is skipped entirely — no network request, no AudioContext.
 * Existing callers passing nothing (or null/empty) keep decoding exactly as
 * before.
 */
export function usePeaks(
  audioUrl: string,
  _audioEl: HTMLAudioElement,
  suppliedPeaks?: number[] | null,
): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const hasSuppliedPeaks = !!suppliedPeaks && suppliedPeaks.length > 0;

  useEffect(() => {
    if (hasSuppliedPeaks) return;

    let cancelled = false;
    setPeaks(null);

    if (!audioUrl) {
      setPeaks([]);
      return;
    }

    (async () => {
      try {
        const res = await fetch(audioUrl);
        const arrayBuffer = await res.arrayBuffer();
        const AudioContextCtor =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) {
          if (!cancelled) setPeaks([]);
          return;
        }
        const ctx = new AudioContextCtor();
        try {
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          if (cancelled) return;
          setPeaks(downsampleToPeaks(audioBuffer, PEAKS_COUNT));
        } finally {
          void ctx.close?.();
        }
      } catch {
        if (!cancelled) setPeaks([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, hasSuppliedPeaks]);

  return hasSuppliedPeaks ? (suppliedPeaks as number[]) : peaks;
}

/**
 * Downsample all channels of an AudioBuffer to at most `count` buckets (max
 * abs sample per bucket).
 *
 * When the clip has fewer raw samples than `count`, the returned array is
 * sized to the ACTUAL raw sample count instead of zero-padding out to
 * `count` — every raw sample already fits within budget, so there is no
 * need to downsample, and no artificial silent tail is introduced. This
 * matters because `WaveformTape` indexes into the returned array
 * proportionally over its FULL length (`idx = (t/duration) * (length-1)`),
 * so a padded tail would stretch the real audio into a fraction of the
 * visible window and flatline the rest, even though that "silence" doesn't
 * exist in the source audio.
 */
function downsampleToPeaks(audioBuffer: AudioBuffer, count: number): number[] {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  if (length === 0 || channels === 0) return new Array(count).fill(0);

  const bucketCount = Math.min(count, length);
  const samplesPerBucket = Math.max(1, Math.floor(length / bucketCount));
  const peaks: number[] = new Array(bucketCount).fill(0);

  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < bucketCount; i++) {
      const start = i * samplesPerBucket;
      const end = Math.min(length, start + samplesPerBucket);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }
      if (max > peaks[i]) peaks[i] = max;
    }
  }

  return peaks;
}

// ---------------------------------------------------------------------------
// Format helpers

/** Format seconds as m:ss (minutes uncapped, e.g. 65:09). */
function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Layout constants (mirrors MockWaveTape)

const BAR_W = 5;
const GAP = 2;
const SLOT = BAR_W + GAP;
const BAR_COUNT = 180;
const SVG_W = BAR_COUNT * SLOT;
const RULER_H = 18;
const NICE_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function useReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  return reduced;
}

// ---------------------------------------------------------------------------
// WaveformTape

export interface WaveformTapeProps {
  /** The PlayerBar's single <audio> element — must not be null when tape mounts. */
  audioEl: HTMLAudioElement;
  /** Current audio URL — triggers peak re-decode on change. */
  audioUrl: string;
  /** Total duration in seconds from the bus (avoids a race with loadedmetadata). */
  duration: number;
  /**
   * Seconds-of-audio across the viewport (the active zoom preset).
   * Controlled externally by task 007. Default: 30.
   */
  windowSec?: number;
  /**
   * 'paged' (default): playhead sweeps the window; window advances at the edge.
   * 'moving': playhead fixed at center; waveform slides past it.
   * 'paged' is forced when prefers-reduced-motion: reduce is active.
   */
  mode?: 'paged' | 'moving';
  /** Called when user clicks or drags to a new position. Tape also calls bus.seek(). */
  onSeek?: (seconds: number) => void;
  /** Tape pixel height (canvas only, not including ruler). Default 96. */
  height?: number;
  /**
   * Called when the zoom preset changes (wheel, keyboard +/-, or the
   * WaveformTapeZoom slider). Task 007 — the actual `windowSec` value is
   * controlled by the parent (PlayerBar, task 008).
   */
  onZoomChange?: (preset: TapeZoomPreset) => void;
  /**
   * Peak array supplied by the parent (e.g. PlayerBar's peaks-sidecar fetch,
   * task 008), fed into `usePeaks` as `suppliedPeaks` so BOTH the tape canvas
   * and the minimap render from it directly, skipping the internal
   * fetch+decode entirely. When omitted (or an empty array), this component
   * falls back to its own internally-decoded `peakArray` (from
   * `usePeaks(audioUrl, audioEl, peaks)` above) for both.
   */
  peaks?: number[] | null;
}

export const WaveformTape: React.FC<WaveformTapeProps> = ({
  audioEl,
  audioUrl,
  duration,
  windowSec = 30,
  mode = 'paged',
  onSeek,
  height = 96,
  onZoomChange,
  peaks,
}) => {
  const peakArray = usePeaks(audioUrl, audioEl, peaks);
  // usePeaks already resolves the effective source: it returns `peaks` when a
  // non-empty array is supplied, otherwise the internally decoded array. The
  // minimap must render from that same resolved source — reading the raw
  // `peaks` prop here instead would feed the minimap a bare `null`/`[]` (the
  // common under-cap case, where PlayerBar passes `sidecarPeaks === null`),
  // collapsing it to flat fallback bars while the canvas shows the real
  // decoded shape.
  const minimapPeaks = peakArray;
  const reducedMotion = useReducedMotion();
  const effectiveMode: 'paged' | 'moving' = reducedMotion ? 'paged' : mode;

  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Position tracked locally, driven by timeupdate-rate reportTime via a
  // rAF loop reading audioEl.currentTime directly for smooth moving-mode
  // scrolling (timeupdate is ~4Hz; rAF reads the element at 60Hz).
  const [position, setPosition] = useState(() => audioEl.currentTime || 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // In moving mode we need smooth scrolling between timeupdate ticks, so we
    // poll audioEl.currentTime every animation frame. In paged mode the
    // window is static within a page, so a per-frame poll isn't needed —
    // but we still track position from the element for the playhead x.
    if (effectiveMode !== 'moving') {
      // Keep position in sync at timeupdate rate via a lightweight listener.
      const onTimeUpdate = () => setPosition(audioEl.currentTime || 0);
      audioEl.addEventListener('timeupdate', onTimeUpdate);
      setPosition(audioEl.currentTime || 0);
      return () => {
        audioEl.removeEventListener('timeupdate', onTimeUpdate);
      };
    }

    const loop = () => {
      setPosition(audioEl.currentTime || 0);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [audioEl, effectiveMode]);

  // --- Window math (the visible [viewStart, viewEnd] span) -----------------
  const viewStart =
    effectiveMode === 'moving'
      ? position - windowSec / 2
      : Math.floor(position / windowSec) * windowSec;
  const viewEnd = viewStart + windowSec;

  const svgH = Math.max(24, height - RULER_H);

  // --- Fixed-grid sampling (binding — spec §5.3) ---------------------------
  // Sample on a FIXED absolute-time grid (gridSec), NOT relative to the
  // moving window — otherwise every bar re-samples a shifting point each
  // tick and the shape "crawls". Grid-aligned samples are stable per time
  // bucket; the row is then translated by a sub-bar offset so moving mode
  // glides seamlessly.
  const gridSec = windowSec / BAR_COUNT; // seconds per bar (zoom-only dependency)
  const alignedStart = Math.floor(viewStart / gridSec) * gridSec; // snap to grid
  const scrollOffset = ((alignedStart - viewStart) / windowSec) * SVG_W; // (-slot, 0]

  const visiblePeaks = Array.from({ length: BAR_COUNT + 1 }, (_, i) => {
    const t = alignedStart + (i + 0.5) * gridSec; // FIXED grid time → stable value
    if (t < 0 || t > duration) return 0;
    if (!peakArray || peakArray.length === 0) return 0;
    const idx = Math.floor((t / duration) * (peakArray.length - 1));
    return peakArray[idx] ?? 0;
  });

  // Playhead X in SVG coords (fixed at center in moving mode)
  const playheadFrac =
    effectiveMode === 'moving' ? 0.5 : windowSec > 0 ? (position - viewStart) / windowSec : 0;
  const playheadX = Math.max(0, Math.min(SVG_W, playheadFrac * SVG_W));

  // Smart time ruler: pick a "nice" interval so ~3 ticks fall in the
  // viewport, labelled with the m:ss of where the user is currently viewing.
  const tickInterval = NICE_INTERVALS.find((n) => n >= windowSec / 4) ?? 600;
  const ticks: number[] = [];
  const firstTick = Math.ceil((viewStart + 0.001) / tickInterval) * tickInterval;
  for (let t = firstTick; t < viewEnd - 0.001; t += tickInterval) {
    if (t >= 0 && t <= duration) ticks.push(t);
  }

  // --- Pointer → time helper ------------------------------------------------
  const pointerToTime = useCallback(
    (clientX: number): number => {
      const el = svgRef.current;
      if (!el) return position;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = viewStart + frac * windowSec;
      return Math.max(0, Math.min(duration, newTime));
    },
    [position, viewStart, windowSec, duration],
  );

  const commitSeek = useCallback(
    (seconds: number) => {
      seek(seconds);
      onSeek?.(seconds);
    },
    [onSeek],
  );

  // --- Click-to-jump / drag-to-scrub ---------------------------------------
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true;
    commitSeek(pointerToTime(e.clientX));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      commitSeek(pointerToTime(e.clientX));
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
  }, [pointerToTime, commitSeek]);

  // --- Zoom stepping (task 007) ---------------------------------------------
  // windowSec is controlled externally; this component only ever proposes a
  // new preset via onZoomChange (wheel / keyboard / WaveformTapeZoom slider).
  const stepZoom = useCallback(
    (direction: 'in' | 'out') => {
      if (!onZoomChange) return;
      const current = (TAPE_ZOOM_PRESETS_SEC as readonly number[]).includes(windowSec)
        ? (windowSec as TapeZoomPreset)
        : 30;
      onZoomChange(snapZoom(current, direction));
    },
    [onZoomChange, windowSec],
  );

  // Container width for the zoom-in cap calc (peaks-per-pixel resolution).
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

  // --- Pinch/wheel zoom snap (spec §5.2): one detent = one preset step.
  // Wheel-down (deltaY > 0) = zoom out (more seconds visible).
  //
  // React registers `wheel` at the document root as a PASSIVE listener
  // (React 17+), so `e.preventDefault()` inside a React onWheel handler is a
  // silent no-op in real browsers — the zoom would snap AND the page would
  // scroll. A native, non-passive listener attached directly to the SVG node
  // is required to actually suppress page scroll while zooming.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !onZoomChange) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      stepZoom(e.deltaY > 0 ? 'out' : 'in');
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, [onZoomChange, stepZoom]);

  // --- Keyboard scrub (±5s) + zoom step (+/-) -------------------------------
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      commitSeek(Math.max(0, Math.min(duration, position - 5)));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      commitSeek(Math.max(0, Math.min(duration, position + 5)));
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      stepZoom('out');
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      stepZoom('in');
    }
  };

  return (
    <div
      ref={rootRef}
      className="tape"
      role="region"
      aria-label="Audio tape"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {onZoomChange && (
        <WaveformTapeZoom
          windowSec={(TAPE_ZOOM_PRESETS_SEC as readonly number[]).includes(windowSec) ? (windowSec as TapeZoomPreset) : 30}
          onZoomChange={onZoomChange}
          duration={duration}
          availablePeaks={peakArray && peakArray.length > 0 ? peakArray.length : null}
          containerWidthPx={containerWidthPx}
        />
      )}
      <svg
        ref={svgRef}
        className="tape-canvas"
        width="100%"
        height={svgH}
        viewBox={`0 0 ${SVG_W} ${svgH}`}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(position)}
        aria-label="Waveform tape — click or drag to seek"
      >
        {visiblePeaks.map((amp, i) => {
          const x = i * SLOT + scrollOffset;
          const barH = Math.max(2, amp * (svgH - 8));
          const y = (svgH - barH) / 2;
          const isPlayed = x + BAR_W < playheadX;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={BAR_W}
              height={barH}
              rx={2}
              fill={isPlayed ? 'var(--color-wave-progress)' : 'var(--color-wave)'}
              opacity={isPlayed ? 0.9 : 0.55}
            />
          );
        })}
        <line
          x1={playheadX}
          y1={0}
          x2={playheadX}
          y2={svgH}
          stroke="var(--accent)"
          strokeWidth={2}
          opacity={0.9}
        />
      </svg>
      <div className="tape-ruler" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className="tape-tick"
            style={{ left: `${((t - viewStart) / windowSec) * 100}%` }}
          >
            {fmtClock(t)}
          </span>
        ))}
      </div>
      <WaveformTapeMinimap
        duration={duration}
        currentTimeSec={position}
        windowStartSec={viewStart}
        windowSec={windowSec}
        onSeek={commitSeek}
        peaks={minimapPeaks}
      />
    </div>
  );
};
