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
 * `duration`); zoom-out is always capped at the widest preset (120s) — the
 * minimap, not this control, owns whole-clip navigation.
 *
 * Visual direction: on screen, the WIDEST preset (120s) sits at the LEFT end
 * of the slider/dots and the TIGHTEST preset (3s) sits at the RIGHT end —
 * "left = zoomed out, right = zoomed in," matching the North-Star mock's
 * `ZoomPresetControl` comment (MockTapeControls.tsx) and the "Zoom out"
 * (left, small glyph) / "Zoom in" (right, large glyph) button placement
 * below. `TAPE_ZOOM_PRESETS_SEC` itself stays in ascending-seconds order
 * (index 0 = 3s ... index LAST = 120s) so `snapZoom` and the cap math keep
 * their natural ascending semantics — only the ON-SCREEN position is
 * inverted, via the `visPos` helper, so index 0 renders at the right.
 */
import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
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
 * Minimum number of real peak samples that must fall within the visible
 * window for a preset to count as showing genuine detail rather than a
 * degenerate near-flat render.
 *
 * This is intentionally NOT "one real sample per rendered bar"
 * (`TAPE_BAR_COUNT` bars / `secs`). An earlier version of this cap required
 * exactly that — gating on `TAPE_BAR_COUNT / secs <= peaksPerSec` — which
 * sounds principled but was unsatisfiable back when `compute_peaks_sidecar`
 * (app/engines/audio_ops.py) fixed the server peak density at
 * `PEAKS_PER_SEC = 8`: no realistic sidecar size could reach the ~60
 * peaks/sec the 3s preset demands (180 bars / 3s). That made the three
 * tightest presets (3s/5s/8s) — and usually 15s too — permanently
 * unreachable for every chapter long enough to need the sidecar (>600s,
 * i.e. most audiobook chapters), even though 7 tick dots rendered as if
 * they were choices.
 *
 * `PEAKS_PER_SEC` is now 60 (bumped from 8 — see that constant's comment in
 * audio_ops.py for the "low resolution tape" root cause and sizing math),
 * which happens to land exactly on parity for the tightest preset (60
 * peaks/sec * 3s = 180 real samples = `TAPE_BAR_COUNT`). This floor is kept
 * anyway — rather than reverting to a strict bars/peaks parity gate — for
 * two reasons: (1) the browser-decode path (`PEAKS_COUNT = 4000` in
 * WaveformTape.tsx, used below `TAPE_DURATION_CAP_SEC`) has a different,
 * much higher density, so a single shared cap must not assume the sidecar's
 * exact rate; (2) the tape's render is nearest-neighbor sampling (see
 * `visiblePeaks` in WaveformTape.tsx) — it never interpolates or invents a
 * value between two real peaks, it just repeats the nearest real one across
 * more bars as you zoom in, so "some repetition" is lower fidelity, not
 * fabrication; the "never fabricate detail" guarantee (audio-player.md
 * §5.2) already holds at every zoom level by construction. What the cap
 * actually needs to prevent is zooming into a window so narrow it contains
 * essentially zero real samples (an accidental flat line).
 * `MIN_SAMPLES_IN_VIEW` is that floor, not a bars/peaks parity requirement.
 */
const MIN_SAMPLES_IN_VIEW = 4;

/**
 * Most-zoomed-in preset index that does not zoom into a window with fewer
 * than `MIN_SAMPLES_IN_VIEW` real peak samples. While peaks are still
 * decoding (`availablePeaks === null`), all presets are enabled (index 0).
 * Zoom-out cap is always LAST_IDX (120s) — never computed, never exceeded.
 */
function computeZoomInCapIdx(availablePeaks: number | null, duration: number): number {
  if (!availablePeaks || duration <= 0) return 0;
  const peaksPerSec = availablePeaks / duration;
  const idx = TAPE_ZOOM_PRESETS_SEC.findIndex((secs) => secs * peaksPerSec >= MIN_SAMPLES_IN_VIEW);
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
  /** Container width in pixels. Currently unused by the cap calc (see
   *  computeZoomInCapIdx) — kept as a prop for call-site/API stability. */
  containerWidthPx: number;
}

export const WaveformTapeZoom: React.FC<WaveformTapeZoomProps> = ({
  windowSec,
  onZoomChange,
  duration,
  availablePeaks,
}) => {
  const idx = Math.max(0, TAPE_ZOOM_PRESETS_SEC.indexOf(windowSec));
  const zoomInCapIdx = computeZoomInCapIdx(availablePeaks, duration);

  // Screen-position mapping (see file header): index 0 (tightest) renders at
  // the right, index LAST_IDX (widest) renders at the left.
  const visPos = (i: number) => LAST_IDX - i;

  const handleChange = (nextIdx: number) => {
    if (nextIdx < zoomInCapIdx) return; // defensive: below the min already enforced by the slider
    onZoomChange(TAPE_ZOOM_PRESETS_SEC[nextIdx]);
  };

  return (
    <div className="ns-size-control" role="group" aria-label="Zoom level" style={{ flexShrink: 0 }}>
      {/*
        Touch-target sizing (44x44pt, HIG) is provided by the invisible
        `.tape-zoom-glyph-hit` hit-area padding (min-width/min-height: 44px,
        player.css) on the <button> itself. The visible glyph is a
        magnifying-glass-minus/plus icon (lucide-react's `ZoomOut`/`ZoomIn`,
        matching the icon convention already used elsewhere in this frontend,
        e.g. TopBar.tsx, BookIdentityLine.tsx) sized independently of the
        button's own min-width/min-height via the icon's `size` prop.
      */}
      <button
        type="button"
        className="ns-size-glyph tape-zoom-glyph-hit"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => handleChange(Math.min(idx + 1, LAST_IDX))}
      >
        <ZoomOut size={16} className="tape-zoom-icon" aria-hidden="true" />
      </button>
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
                left: `calc(7px + ${visPos(i) / LAST_IDX} * (100% - 14px))`,
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
          min={0}
          max={LAST_IDX - zoomInCapIdx}
          step={1}
          value={visPos(idx)}
          onChange={(e) => handleChange(LAST_IDX - Number(e.target.value))}
          aria-label="Zoom level"
          aria-valuemin={0}
          aria-valuemax={LAST_IDX}
          aria-valuenow={visPos(idx)}
          title="Zoom level"
        />
      </div>
      <button
        type="button"
        className="ns-size-glyph tape-zoom-glyph-hit"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => handleChange(Math.max(idx - 1, zoomInCapIdx))}
      >
        <ZoomIn size={20} className="tape-zoom-icon" aria-hidden="true" />
      </button>
    </div>
  );
};
