/**
 * SegmentPeekStrip — Level 2 of the render-monitor progressive-disclosure
 * ladder (`10-phase2-render-monitor.md` "Placement"): a narrow, condensed
 * block row that auto-appears below the chapter/job header once ≥2 segments
 * are concurrently rendering, and expands inline (no navigation, no modal)
 * to the full `SegmentRenderMonitor` field on click/tap.
 *
 * Reuses `SegmentBlockRow` — the same char-weighted block encoding as the
 * full field — at a condensed scale rather than a second implementation.
 */
import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import { SegmentBlockRow } from './SegmentBlockRow';
import type { SegmentRenderMonitorSegment } from './SegmentBlockRow';

export interface SegmentPeekStripProps {
  /** One entry per render batch — never per sentence/span (glossary.md 1.1.0). */
  segments: SegmentRenderMonitorSegment[];
  /** Count of batches currently rendering in parallel — the auto-appear trigger's basis. */
  activeCount: number;
  onExpand: () => void;
  onDismiss: () => void;
}

const PEEK_STRIP_HEIGHT = 5;

export const SegmentPeekStrip: React.FC<SegmentPeekStripProps> = ({ segments, activeCount, onExpand, onDismiss }) => {
  const total = segments.length;
  const doneCount = segments.filter((s) => s.phase === 'done').length;
  const failedCount = segments.filter((s) => s.phase === 'failed').length;
  const ariaLabel = failedCount > 0
    ? `${activeCount} batches rendering in parallel, ${doneCount} of ${total} done, ${failedCount} failed — condensed view`
    : `${activeCount} batches rendering in parallel, ${doneCount} of ${total} done — condensed view`;

  return (
    <div
      className="segment-peek-strip"
      style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Expand batch render detail — ${ariaLabel}`}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
        }}
      >
        {/* min-width: 0 breaks the flex-item default of sizing to content
            (min-width: auto) — without it, a high segment count's summed
            block minWidths (SegmentBlockRow's per-block floor) inflate this
            span's own intrinsic size and the block row bleeds past the card
            instead of being clipped by the overflow:hidden below it. */}
        <span style={{ flex: 1, minWidth: 0, borderRadius: 3, overflow: 'hidden', display: 'block' }}>
          <SegmentBlockRow segments={segments} height={PEEK_STRIP_HEIGHT} ariaLabel={ariaLabel} />
        </span>
        {/* Explicit disclosure affordance (owner feedback: the bare block row
            read as an unexplained bar rather than an expand control) — a
            chevron makes the click-to-expand behavior self-evident. */}
        <ChevronRight size={14} strokeWidth={2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss batch render peek strip"
        style={{
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 6px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
};
