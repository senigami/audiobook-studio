/**
 * SegmentRenderMonitor — "BitTorrent-style" segment block-fill for the Activity
 * queue screen (production, DATA-DRIVEN version).
 *
 * Ports the visual encoding validated by the demo reference implementation
 * (`frontend/src/demo/stages/siteMockup/SegmentRenderStrip.tsx`) but does NOT
 * own any simulation state — it renders whatever `segments`/`cap` it is given.
 * The caller (real hydration or, for now, a fixture) owns the state machine.
 *
 * Binding contract: design-docs/specs/progress-presentation.md §7A/§8 (M1-M3).
 * - M1: the aggregate % is derived from the SAME char-weighted segment array
 *   the blocks render from — never an independently-maintained counter.
 * - M2: a failed/retrying block is distinguishable WITHOUT relying on hue — a
 *   diagonal crosshatch pattern is layered on top of (not instead of) the
 *   danger-tinted border.
 * - M3: `prefers-reduced-motion: reduce` gates the animation at the render
 *   level (no timer/interval is ever started by this component — it has none
 *   to begin with, since it is purely prop-driven — but the CSS animation
 *   classes themselves are suppressed so there is no motion to observe).
 *
 * Degrade-by-count (§7A "Motion & scale"):
 *   < 10 segments   → render nothing (the aggregate bar elsewhere suffices)
 *   10 - ~60        → full block strip
 *   > ~60           → compact "N of M done" summary bar (canvas/virtualization
 *                     for > ~500 is explicitly out of scope for this pass)
 * In every case the accessible segment table is rendered so screen-reader and
 * keyboard users always have the full per-segment detail, even when the
 * visual strip has degraded to a summary bar.
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
}

export interface SegmentRenderMonitorProps {
  segments: SegmentRenderMonitorSegment[];
  /** Per-engine concurrency cap — used only for the summary/caption text. */
  cap: number;
}

const FULL_STRIP_MIN = 10;
const SUMMARY_THRESHOLD = 60;

// ---------------------------------------------------------------------------
// M1 — char-weighted aggregate, derived from the same segment array the
// blocks render from. Never an independent counter.
// ---------------------------------------------------------------------------
export function charWeightedProgress(segments: SegmentRenderMonitorSegment[]): number {
  const total = segments.reduce((sum, s) => sum + s.charCount, 0);
  if (!total) return 0;
  const filled = segments.reduce((sum, s) => {
    if (s.phase === 'done') return sum + s.charCount;
    if (s.phase === 'rendering' || s.phase === 'failed') return sum + s.charCount * s.progress;
    return sum;
  }, 0);
  return filled / total;
}

function useReducedMotion(): boolean {
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
  if (s.phase === 'done') return { ...base, background: 'var(--accent)' };
  if (s.phase === 'failed') {
    return { ...base, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--action-danger)' };
  }
  // rendering — teal track comes from .segment-render-monitor__block--active; the
  // blue inner fill is drawn as a separate child, advancing over it.
  return base;
}

const ProgressBar: React.FC<{ pct: number }> = ({ pct }) => (
  <div
    style={{
      height: 4,
      borderRadius: 2,
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      flex: 1,
    }}
  >
    <div
      style={{
        width: `${pct}%`,
        height: '100%',
        background: 'var(--accent)',
        borderRadius: 2,
      }}
    />
  </div>
);

const PHASE_LABEL: Record<SegmentRenderPhase, string> = {
  preparing: 'Preparing',
  rendering: 'Rendering',
  done: 'Done',
  failed: 'Failed',
};

/**
 * The always-present accessible fallback: one row per segment. This is the
 * real keyboard/screen-reader surface (§7A "Accessibility (dual-layer)") — it
 * is rendered regardless of whether the visual strip shows the full block
 * field or the degraded summary bar.
 */
const SegmentAccessibleTable: React.FC<{ segments: SegmentRenderMonitorSegment[]; collapsedByDefault: boolean }> = ({
  segments,
  collapsedByDefault,
}) => {
  const table = (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-micro)' }}>
      <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Per-segment render status
      </caption>
      <thead>
        <tr>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Index</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>State</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Progress</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Engine</th>
        </tr>
      </thead>
      <tbody>
        {segments.map((s, i) => (
          <tr key={s.id}>
            <td style={{ padding: '4px 8px' }}>{i + 1}</td>
            <td style={{ padding: '4px 8px' }}>{PHASE_LABEL[s.phase]}</td>
            <td style={{ padding: '4px 8px' }}>
              {s.phase === 'done' ? '100%' : `${Math.round(s.progress * 100)}%`}
            </td>
            <td style={{ padding: '4px 8px' }}>{s.engineId ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Always screen-reader-discoverable and keyboard-navigable: when the visual
  // strip has degraded to a summary bar, keep the table reachable via a native
  // <details> disclosure rather than hiding it outright.
  if (!collapsedByDefault) {
    return table;
  }

  return (
    <details>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
        Segment detail ({segments.length})
      </summary>
      {table}
    </details>
  );
};

export const SegmentRenderMonitor: React.FC<SegmentRenderMonitorProps> = ({ segments, cap }) => {
  const reduced = useReducedMotion();

  // §7A "Motion & scale": < 10 segments — omit the field entirely.
  if (segments.length < FULL_STRIP_MIN) {
    return null;
  }

  const total = segments.length;
  const doneCount = segments.filter((s) => s.phase === 'done').length;
  const activeCount = segments.filter((s) => s.phase === 'preparing' || s.phase === 'rendering' || s.phase === 'failed').length;
  const failedCount = segments.filter((s) => s.phase === 'failed').length;
  const complete = doneCount === total;
  const pct = Math.round(charWeightedProgress(segments) * 100);
  const isSummary = total > SUMMARY_THRESHOLD;

  const caption = complete
    ? `Render complete · ${total} segments`
    : `${activeCount} rendering in parallel (cap ${cap}) · ${doneCount}/${total} segments`;

  const ariaLabel = complete
    ? `Render complete, ${total} segments`
    : `Rendering ${doneCount} of ${total} segments, ${activeCount} in parallel`;

  return (
    <div className="segment-render-monitor" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Aggregate bar — M1: derived from the same char-weighted segment set below. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ProgressBar pct={pct} />
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>{pct}%</span>
      </div>

      {isSummary ? (
        // > ~60 segments: degrade to a compact "N of M done" summary bar. M2 still
        // applies here ("in every case") — a failed segment must be distinguishable
        // via a non-hue channel, so the same crosshatch pattern used on the full
        // block strip is surfaced as a small badge next to the summary text.
        <div
          role="img"
          aria-label={failedCount > 0 ? `${ariaLabel}, ${failedCount} failed` : ariaLabel}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}
        >
          <span>
            {doneCount} of {total} segments done{!complete ? ` · ${activeCount} in parallel` : ''}
            {failedCount > 0 ? ` · ${failedCount} failed` : ''}
          </span>
          {failedCount > 0 && (
            <span
              aria-hidden="true"
              title={`${failedCount} segment${failedCount === 1 ? '' : 's'} failed`}
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: 2,
                flexShrink: 0,
                background: 'var(--surface)',
                boxShadow: 'inset 0 0 0 1px var(--action-danger)',
                overflow: 'hidden',
              }}
            >
              <span className="segment-render-monitor__crosshatch" style={{ display: 'block', width: '100%', height: '100%' }} />
            </span>
          )}
        </div>
      ) : (
        // 10 - ~60 segments: full block field.
        <div
          role="img"
          aria-label={ariaLabel}
          style={{
            display: 'flex', gap: 0, height: 10, width: '100%',
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
                style={blockStyle(s)}
              >
                {s.phase === 'rendering' && (
                  <div
                    style={{ width: `${s.progress * 100}%`, height: '100%', background: 'var(--accent)' }}
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
      )}

      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{caption}</span>

      {/* Accessible fallback — always present. Collapsed behind <details> once the
          visual strip has degraded to the summary bar; otherwise rendered inline. */}
      <SegmentAccessibleTable segments={segments} collapsedByDefault={isSummary} />
    </div>
  );
};
