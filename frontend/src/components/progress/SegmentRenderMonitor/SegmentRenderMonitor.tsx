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
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SegmentBlockRow, PHASE_LABEL } from './SegmentBlockRow';
import type { SegmentRenderPhase, SegmentRenderMonitorSegment } from './SegmentBlockRow';

// Task 011: the segment types and the reduced-motion gate now live in
// `SegmentBlockRow.tsx` (the shared block-encoding primitive) — re-exported
// here for back-compat with existing callers/tests importing from this file.
export type { SegmentRenderPhase, SegmentRenderMonitorSegment };

export interface SegmentRenderMonitorProps {
  segments: SegmentRenderMonitorSegment[];
  /** Per-engine concurrency cap — used only for the summary/caption text. */
  cap: number;
  /**
   * Task 010: retry a single segment. Wired by the caller to
   * `api.generateSegments([segmentId])` — the only per-segment (re)generation
   * entry point this repo has today (there is no server-side "retry" verb;
   * re-queuing generation for the same segment id is the real granularity).
   * Omitted entirely (no button rendered) when the caller has no retry path.
   */
  onRetry?: (segmentId: string) => void;
  /**
   * Real render-batch total (`job.render_group_count`) — several consecutive
   * same-character sentences are merged into one synthesis call, so this is
   * almost always smaller than `segments.length`. When present (with
   * `completedRenderGroups`), the "N of M" count/caption/aria-label use these
   * real batch numbers instead of the flat per-row `segments` count — the
   * unit of actual rendering work, not database rows. The char-weighted `%`
   * bar is unaffected by these props (see `charWeightedProgress`, B9/M1).
   */
  renderGroupCount?: number | null;
  /** Real completed-batch count (`job.completed_render_groups`) — paired with `renderGroupCount`. */
  completedRenderGroups?: number | null;
}

// Exported (task 011): the peek strip's eligibility gate on `ActivityPage`
// reuses this same "is there enough segments for the full field to be worth
// expanding into" threshold, rather than a second hardcoded 10.
export const FULL_STRIP_MIN = 10;
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
    // A failed segment contributes zero — failed work is not progress, even
    // partial credit for however far it got before failing.
    if (s.phase === 'rendering') return sum + s.charCount * s.progress;
    return sum;
  }, 0);
  return filled / total;
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
        background: 'var(--action-primary)',
        borderRadius: 2,
      }}
    />
  </div>
);

/**
 * The always-present accessible fallback: one row per segment. This is the
 * real keyboard/screen-reader surface (§7A "Accessibility (dual-layer)") — it
 * is rendered regardless of whether the visual strip shows the full block
 * field or the degraded summary bar.
 *
 * Task 010 (M6): also the keyboard-reachable path to the same detail/retry
 * the block-strip popover offers — the strip's blocks are `aria-hidden`, so
 * this "Details"/"Retry" row action must never be the popover's only door in.
 */
const SegmentAccessibleTable: React.FC<{
  segments: SegmentRenderMonitorSegment[];
  collapsedByDefault: boolean;
  onOpenDetail: (segmentId: string, triggerEl: HTMLElement) => void;
  onRetry?: (segmentId: string) => void;
}> = ({ segments, collapsedByDefault, onOpenDetail, onRetry }) => {
  // Explicit React state rather than the native uncontrolled <details>/<summary>
  // toggle — the native disclosure was reported unclickable in the real running
  // app (owner-verified 2026-08-26) even though it toggles correctly when
  // exercised in isolation; a controlled `<button>` with a visible chevron is a
  // bigger, more reliable target regardless of whatever intercepted the native
  // toggle's click in context.
  const [open, setOpen] = useState(false);

  const table = (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--type-micro)' }}>
      <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Per-batch render status
      </caption>
      <thead>
        <tr>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Index</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>State</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Progress</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Engine</th>
          <th scope="col" style={{ textAlign: 'left', padding: '4px 8px' }}>Actions</th>
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
            <td style={{ padding: '4px 8px' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => onOpenDetail(s.id, e.currentTarget)}
                  style={{
                    fontSize: 'var(--type-micro)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    cursor: 'pointer',
                  }}
                >
                  Details
                </button>
                {s.phase === 'failed' && onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(s.id)}
                    style={{
                      fontSize: 'var(--type-micro)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--action-danger)',
                      background: 'var(--surface)',
                      color: 'var(--action-danger)',
                      cursor: 'pointer',
                    }}
                  >
                    Retry
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Always screen-reader-discoverable and keyboard-navigable: when the visual
  // strip has degraded to a summary bar, keep the table reachable via an
  // explicit toggle button rather than hiding it outright.
  if (!collapsedByDefault) {
    return table;
  }

  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          fontSize: 'var(--type-micro)',
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          padding: 0,
        }}
      >
        <Chevron size={14} strokeWidth={2} aria-hidden="true" />
        Batch detail ({segments.length})
      </button>
      {open && table}
    </div>
  );
};

/**
 * Anchored per-segment detail popover (task 010, design doc "Select block →
 * inline popover detail"). Positioning follows the same lightweight,
 * container-relative `getBoundingClientRect` pattern as the selection popover
 * in `ScriptView.tsx` (no dedicated popover primitive exists in this repo to
 * reuse instead — this stays local to the file rather than inventing a new
 * shared component for a single caller).
 *
 * Not `aria-hidden` — only the decorative block field is. This is a real,
 * screen-reader-visible dialog when open.
 */
const SegmentDetailPopover: React.FC<{
  segment: SegmentRenderMonitorSegment;
  index: number;
  elapsedSeconds: number | null;
  top: number;
  left: number;
  onRetry?: () => void;
  onClose: () => void;
}> = ({ segment, index, elapsedSeconds, top, left, onRetry, onClose }) => (
  <div
    role="dialog"
    aria-label={`Batch ${index + 1} detail`}
    className="segment-render-monitor__popover"
    style={{ position: 'absolute', top, left, transform: 'translateX(-50%)', zIndex: 1000 }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <strong style={{ fontSize: 'var(--type-micro)' }}>Batch {index + 1}</strong>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close batch detail"
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--type-micro)' }}
      >
        ✕
      </button>
    </div>
    <dl style={{ margin: '4px 0 0', fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
      <div><dt style={{ display: 'inline' }}>Phase: </dt><dd style={{ display: 'inline', margin: 0 }}>{PHASE_LABEL[segment.phase]}</dd></div>
      <div><dt style={{ display: 'inline' }}>Engine: </dt><dd style={{ display: 'inline', margin: 0 }}>{segment.engineId ?? '—'}</dd></div>
      <div>
        <dt style={{ display: 'inline' }}>Elapsed: </dt>
        <dd style={{ display: 'inline', margin: 0 }}>{elapsedSeconds != null ? `${elapsedSeconds}s` : '—'}</dd>
      </div>
      {segment.phase === 'failed' && (
        <div><dt style={{ display: 'inline' }}>Reason: </dt><dd style={{ display: 'inline', margin: 0 }}>{segment.reasonCode ?? 'unknown'}</dd></div>
      )}
    </dl>
    {segment.phase === 'failed' && onRetry && (
      <button
        type="button"
        onClick={onRetry}
        style={{
          marginTop: 8,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--action-danger)',
          background: 'var(--surface)',
          color: 'var(--action-danger)',
          cursor: 'pointer',
          fontSize: 'var(--type-micro)',
        }}
      >
        Retry
      </button>
    )}
  </div>
);

export const SegmentRenderMonitor: React.FC<SegmentRenderMonitorProps> = ({
  segments,
  cap,
  onRetry,
  renderGroupCount,
  completedRenderGroups,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Task 010 — "elapsed time" for the detail popover/table. `ActiveSegmentMapEntry`
  // carries no started_at timestamp on the wire, so there is no true server-tracked
  // per-segment duration to show; this tracks only the time THIS client has
  // observed the segment in a non-terminal working state (rendering/failed) as a
  // client-side proxy, reset once the segment returns to preparing or reaches done.
  const segmentStartTimesRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const starts = segmentStartTimesRef.current;
    const liveIds = new Set(segments.map((s) => s.id));
    segments.forEach((s) => {
      if (s.phase === 'rendering' || s.phase === 'failed') {
        if (!starts.has(s.id)) starts.set(s.id, Date.now());
      } else {
        starts.delete(s.id);
      }
    });
    Array.from(starts.keys()).forEach((id) => {
      if (!liveIds.has(id)) starts.delete(id);
    });
  }, [segments]);

  const [popover, setPopover] = useState<{ segmentId: string; top: number; left: number } | null>(null);

  const openPopoverFor = (segmentId: string, triggerEl: HTMLElement | null) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const triggerRect = triggerEl?.getBoundingClientRect();
    if (containerRect && triggerRect) {
      setPopover({
        segmentId,
        top: triggerRect.top - containerRect.top - 8,
        left: triggerRect.left - containerRect.left + triggerRect.width / 2,
      });
    } else {
      setPopover({ segmentId, top: 0, left: 0 });
    }
  };
  const closePopover = () => setPopover(null);
  const handleRetry = (segmentId: string) => {
    onRetry?.(segmentId);
    closePopover();
  };

  useEffect(() => {
    if (!popover) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closePopover();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [popover]);

  const total = segments.length;
  const doneCount = segments.filter((s) => s.phase === 'done').length;
  // Only segments actually in-flight right now count as "rendering in
  // parallel". Reads `inFlight` rather than the phase: since #237 a
  // partially-rendered-but-idle batch also reports 'rendering', and counting
  // it here would overstate how many renders are actually running. Falls back
  // to the phase for the per-span path, which sets no `inFlight`.
  const activeCount = segments.filter((s) => s.inFlight ?? s.phase === 'rendering').length;
  const failedCount = segments.filter((s) => s.phase === 'failed').length;
  const complete = total > 0 && doneCount === total;
  const pct = Math.round(charWeightedProgress(segments) * 100);
  const isSummary = total > SUMMARY_THRESHOLD;

  // The "N of M" the user reads (caption/aria-label/summary text) is the real
  // render-batch count when the caller has it — several database rows
  // (segments) are merged into one synthesis call, so `segments.length` is
  // the row count, not the count of things actually being rendered. Falls
  // back to the raw segment count when batch data isn't available (older job
  // data, or a code path with none). This is purely a label/count concern —
  // degrade-by-count, the aria-live milestone cadence, `complete`/`allSettled`,
  // and the char-weighted `%` bar all stay derived from the real `segments`
  // array (B9/M1), unaffected by this substitution.
  const hasRenderGroupData =
    typeof renderGroupCount === 'number' && renderGroupCount > 0 && typeof completedRenderGroups === 'number';
  const displayTotal = hasRenderGroupData ? renderGroupCount : total;
  const displayDoneCount = hasRenderGroupData ? completedRenderGroups : doneCount;
  // Glossary (design-docs/specs/glossary.md 1.1.0, owner ruling): "batch" is
  // the only granularity ever shown here — the caller (useSegmentInventory)
  // now hands this component one row per render batch, never per sentence,
  // so the unit word is always "batches" regardless of which count source
  // (renderGroupCount prop vs. segments.length) produced the number.
  const displayUnit = 'batches';

  // ---------------------------------------------------------------------
  // §7A "Accessibility (dual-layer)" — a milestone-only aria-live region.
  // The block field above is a decoration layer (aria-hidden); this is the
  // *other* half of the dual-layer contract: chapter start/complete and
  // coarse threshold counts, NEVER a per-segment/per-tick announcement
  // (that would spam a screen-reader user for the entire render duration).
  // Threshold cadence is proportional to segment count — every 10 segments
  // or every 25%, whichever is coarser (fewer announcements) — so small
  // renders don't get spammed either.
  // ---------------------------------------------------------------------
  const [announcement, setAnnouncement] = useState('');
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const lastThresholdRef = useRef(0);
  // A job is settled (for announcement purposes) once every segment has
  // reached a terminal state (done or failed) — a permanently-failed
  // segment still ends the render, so completion must still be announced.
  const allSettled = total > 0 && doneCount + failedCount === total;

  useEffect(() => {
    if (total < FULL_STRIP_MIN) return;

    if (!startedRef.current) {
      startedRef.current = true;
      setAnnouncement('Rendering started');
    }

    if (allSettled) {
      if (!completedRef.current) {
        completedRef.current = true;
        setAnnouncement(
          failedCount > 0
            ? `Rendering complete, ${failedCount} batch${failedCount === 1 ? '' : 'es'} failed`
            : 'Rendering complete',
        );
      }
      return;
    }

    // Threshold cadence is based on the raw segment-count fraction (matching
    // the "25 of 60" example), not the char-weighted display percentage.
    const countPct = (doneCount / total) * 100;
    const thresholdStep = Math.max(25, Math.ceil((10 / total) * 100));
    const threshold = Math.floor(countPct / thresholdStep) * thresholdStep;
    if (threshold > 0 && threshold !== lastThresholdRef.current) {
      lastThresholdRef.current = threshold;
      setAnnouncement(`${doneCount} of ${total} batches complete`);
    }
  }, [total, doneCount, allSettled, failedCount]);

  // §7A "Motion & scale": < 10 segments — omit the field entirely.
  if (segments.length < FULL_STRIP_MIN) {
    return null;
  }

  const caption = complete
    ? `Render complete · ${displayTotal} ${displayUnit}`
    : `${activeCount} rendering in parallel (cap ${cap}) · ${displayDoneCount}/${displayTotal} ${displayUnit}`;

  const ariaLabel = complete
    ? `Render complete, ${displayTotal} ${displayUnit}`
    : `Rendering ${displayDoneCount} of ${displayTotal} ${displayUnit}, ${activeCount} in parallel`;

  const popoverSegment = popover ? segments.find((s) => s.id === popover.segmentId) ?? null : null;
  const popoverIndex = popover ? segments.findIndex((s) => s.id === popover.segmentId) : -1;
  const popoverElapsedSeconds = popover
    ? (() => {
        const start = segmentStartTimesRef.current.get(popover.segmentId);
        return start != null ? Math.max(0, Math.round((Date.now() - start) / 1000)) : null;
      })()
    : null;

  return (
    <div
      ref={containerRef}
      className="segment-render-monitor"
      style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}
    >
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
            {displayDoneCount} of {displayTotal} {displayUnit} done{!complete ? ` · ${activeCount} in parallel` : ''}
            {failedCount > 0 ? ` · ${failedCount} failed` : ''}
          </span>
          {failedCount > 0 && (
            <span
              aria-hidden="true"
              title={`${failedCount} batch${failedCount === 1 ? '' : 'es'} failed`}
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
        // 10 - ~60 segments: full block field. Task 011 — shared with the
        // peek strip's condensed row via `SegmentBlockRow` (no second
        // implementation of the block encoding).
        <SegmentBlockRow
          segments={segments}
          height={10}
          ariaLabel={ariaLabel}
          onBlockClick={openPopoverFor}
        />
      )}

      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{caption}</span>

      {/* Accessible fallback — always present. Collapsed behind <details> once the
          visual strip has degraded to the summary bar; otherwise rendered inline.
          Task 010 (M6): also the keyboard-reachable "Details"/"Retry" path — the
          only door in for keyboard/screen-reader users, since the block field
          above is aria-hidden. */}
      <SegmentAccessibleTable
        segments={segments}
        collapsedByDefault={isSummary}
        onOpenDetail={openPopoverFor}
        onRetry={onRetry ? handleRetry : undefined}
      />

      {/* Task 010 — per-segment detail popover. Not aria-hidden: only the
          decorative block field above stays aria-hidden. */}
      {popoverSegment && popoverIndex >= 0 && (
        <SegmentDetailPopover
          segment={popoverSegment}
          index={popoverIndex}
          elapsedSeconds={popoverElapsedSeconds}
          top={popover!.top}
          left={popover!.left}
          onRetry={onRetry && popoverSegment.phase === 'failed' ? () => handleRetry(popoverSegment.id) : undefined}
          onClose={closePopover}
        />
      )}

      {/* §7A dual-layer a11y — milestone-only announcement (start / coarse
          thresholds / completion). Never updated per-segment. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
};
