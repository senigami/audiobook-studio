/**
 * SegmentBlockRow — the shared char-weighted block-encoding primitive behind
 * both the full `SegmentRenderMonitor` field (Level 3) and the condensed
 * "peek strip" (Level 2, task 011). Extracted so the two surfaces render the
 * same block encoding at two scales rather than shipping a second
 * implementation of it (task 011 acceptance criterion).
 *
 * Owns: the `SegmentRenderMonitorSegment`/`SegmentRenderPhase` types (the
 * canonical source — `SegmentRenderMonitor.tsx` re-exports them for
 * back-compat), the reduced-motion gate (M3), and the per-segment fill style.
 * Does NOT own: the aggregate bar, the accessible table, the popover, or the
 * milestone aria-live region — those stay full-field-only concerns in
 * `SegmentRenderMonitor.tsx`.
 */
import React, { useEffect, useState } from 'react';

export type SegmentRenderPhase = 'preparing' | 'rendering' | 'done' | 'failed';

export interface SegmentRenderMonitorSegment {
  id: string;
  /** Character count — drives block width (a manuscript map, not render time). */
  charCount: number;
  phase: SegmentRenderPhase;
  /** 0..1, meaningful while phase === 'rendering' (or partially credited on 'failed'). */
  progress: number;
  engineId?: string;
  /** `ActiveSegmentMapEntry.reason_code` (task 008/010) — surfaced verbatim in the
   * per-segment detail popover/table row; only meaningful for failed segments. */
  reasonCode?: string;
}

export const PHASE_LABEL: Record<SegmentRenderPhase, string> = {
  preparing: 'Preparing',
  rendering: 'Rendering',
  done: 'Done',
  failed: 'Failed',
};

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function blockStyle(s: SegmentRenderMonitorSegment): React.CSSProperties {
  const base: React.CSSProperties = {
    flexGrow: s.charCount,
    flexBasis: 0,
    minWidth: 6, // §7A: ~6px minimum in production (the demo uses 3px for its narrow panel)
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  };
  if (s.phase === 'preparing') return { ...base, background: 'var(--accent-tint-bg)' };
  if (s.phase === 'done') return { ...base, background: 'var(--action-primary)' };
  if (s.phase === 'failed') {
    return { ...base, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--action-danger)' };
  }
  // rendering — teal track comes from .segment-render-monitor__block--active; the
  // blue inner fill is drawn as a separate child, advancing over it.
  return base;
}

export interface SegmentBlockRowProps {
  segments: SegmentRenderMonitorSegment[];
  /** Row height in px — the full field uses 10, the condensed peek strip uses a
   * few px per the design doc's "a narrow (a few px tall) condensed block row". */
  height: number;
  ariaLabel: string;
  /**
   * Per-block click (task 010's popover entry point). Omitted for the peek
   * strip, which is not per-block interactive — the whole row is one click
   * target there (wrapped by the caller), not this component's concern.
   */
  onBlockClick?: (segmentId: string, el: HTMLElement) => void;
}

export const SegmentBlockRow: React.FC<SegmentBlockRowProps> = ({ segments, height, ariaLabel, onBlockClick }) => {
  const reduced = useReducedMotion();

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      style={{
        display: 'flex', gap: 0, height, width: '100%',
        borderRadius: 3, overflow: 'hidden', background: 'var(--surface-alt)',
      }}
    >
      {segments.map((s) => {
        const titleState = s.phase === 'rendering' ? `rendering ${Math.round(s.progress * 100)}%` : PHASE_LABEL[s.phase].toLowerCase();
        const activeClass = s.phase === 'rendering' && !reduced ? 'segment-render-monitor__block--active' : undefined;
        const prepClass = s.phase === 'preparing' && !reduced ? 'segment-render-monitor__block--preparing' : undefined;
        return (
          <div
            key={s.id}
            aria-hidden="true"
            title={`Segment · ${s.charCount} chars · ${titleState}`}
            className={activeClass ?? prepClass}
            style={{ ...blockStyle(s), cursor: onBlockClick ? 'pointer' : undefined }}
            // Task 010 — mouse/tap entry point for the detail popover (full field
            // only). This field stays `aria-hidden` (decorative); the identical
            // detail/retry action is reachable via SegmentAccessibleTable's
            // "Details"/"Retry" buttons (M6), so this click handler is never the
            // only way in.
            onClick={onBlockClick ? (e) => onBlockClick(s.id, e.currentTarget) : undefined}
          >
            {s.phase === 'rendering' && (
              <div
                style={{ width: `${s.progress * 100}%`, height: '100%', background: 'var(--action-primary)' }}
              />
            )}
            {s.phase === 'failed' && (
              // M2 — non-hue failure cue: a diagonal crosshatch pattern layered
              // over the block, in addition to (not instead of) the danger border.
              <div
                className="segment-render-monitor__crosshatch"
                style={{ width: '100%', height: '100%' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
