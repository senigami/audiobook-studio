import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { ChapterTimingGroup } from '@/api/contracts/chapterTiming';

export interface ReaderViewProps {
  activeGroup: ChapterTimingGroup | null;
  prev: ChapterTimingGroup | null;
  next: ChapterTimingGroup | null;
  /** 0 to 1, intra-group playback fraction — drives the "player-piano" ease upward/out. */
  groupProgress: number;
  isTrackingThisChapter: boolean;
  /** Resolves a segment id to its display text; ReaderView doesn't fetch/own segment text itself. */
  segmentTextById: (segmentId: string) => string;
  /**
   * Optional convenience seek-to-start of the active group (03-reader-frontend.md
   * "Bidirectional seek" — "Clicking the active reader block MAY be a
   * convenience seek-to-start of that group"). ReaderView stays display-driven:
   * it never seeks itself, it only reports the click — the caller decides what
   * "seek" means (e.g. `playerBus.seek(activeGroup.start_ms / 1000)`).
   */
  onActiveBlockClick?: () => void;
}

// How far (px) the active block eases upward as groupProgress goes 0 -> 1, and how
// far a freshly-mounted block starts below its resting position on entry.
const EXIT_TRANSLATE_PX = 56;
const ENTER_TRANSLATE_PX = 24;
// Neighbours are faint/partial for continuity, never full opacity.
const NEIGHBOR_OPACITY = 0.35;

const WINDOW_STYLE: CSSProperties = {
  display: 'grid',
  // Three rows so the focal (active) block's row sits at ~1/3 from the top
  // regardless of container size (an actual layout split, not margin math
  // that would break at different container heights).
  gridTemplateRows: '1fr auto 2fr',
  height: '100%',
  overflow: 'hidden',
  // No scrollbar / manual scroll: position is entirely playback-driven.
  overflowY: 'hidden',
};

const CENTERED_MESSAGE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  textAlign: 'center',
  padding: '1.5rem',
};

const NEIGHBOR_STYLE: CSSProperties = {
  textAlign: 'center',
  padding: '0 1.5rem',
  color: 'var(--text-muted)',
  opacity: NEIGHBOR_OPACITY,
};

const ACTIVE_BLOCK_STYLE: CSSProperties = {
  textAlign: 'center',
  padding: '0 1.5rem',
  color: 'var(--text-primary)',
  fontWeight: 500,
};

function groupText(group: ChapterTimingGroup, segmentTextById: (segmentId: string) => string): string {
  return group.segment_ids.map(segmentTextById).join(' ');
}

/**
 * The "player-piano" focal block (synced-reader plan, `03-reader-frontend.md`
 * "ReaderView"). Shows a small scoped window, not the whole chapter: the
 * active group as the focal block with prev/next rendered faint for
 * continuity. `ReaderContainer` renders this identically across all three
 * display states — only the surrounding chrome/size changes there.
 */
export function ReaderView({
  activeGroup,
  prev,
  next,
  groupProgress,
  isTrackingThisChapter,
  segmentTextById,
  onActiveBlockClick,
}: ReaderViewProps) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  if (!isTrackingThisChapter) {
    return (
      <div className="reader-view reader-view--idle" data-testid="reader-idle" style={CENTERED_MESSAGE_STYLE}>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Not playing. Press play to follow along.</p>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div
        className="reader-view reader-view--unavailable"
        data-testid="reader-unavailable"
        style={CENTERED_MESSAGE_STYLE}
      >
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Sync unavailable — re-render this chapter to enable read-along.
        </p>
      </div>
    );
  }

  const activeText = groupText(activeGroup, segmentTextById);
  const prevText = prev ? groupText(prev, segmentTextById) : null;
  const nextText = next ? groupText(next, segmentTextById) : null;

  // groupProgress drives the active block continuously toward its exit
  // position/opacity as playback advances through it (the "eases upward and
  // out" effect) — a continuous function of groupProgress, not discrete
  // snap points.
  const activeY = -(groupProgress * EXIT_TRANSLATE_PX);
  const activeOpacity = 1 - groupProgress * 0.85;
  // Only a real cursor affordance when a click handler is actually wired —
  // ReaderView stays a plain display block (no implied interactivity) when
  // the caller omits onActiveBlockClick.
  const activeBlockStyle: CSSProperties = onActiveBlockClick
    ? { ...ACTIVE_BLOCK_STYLE, cursor: 'pointer' }
    : ACTIVE_BLOCK_STYLE;

  return (
    <div className="reader-view" data-testid="reader-view" style={WINDOW_STYLE}>
      <div style={{ ...NEIGHBOR_STYLE, alignSelf: 'end' }} aria-hidden="true">
        {prevText}
      </div>

      {reduceMotion ? (
        // prefers-reduced-motion: reduce -> simple instant swap, no position/opacity animation.
        <div
          key={activeGroup.group_id}
          data-testid="reader-active-block"
          data-animated="false"
          style={activeBlockStyle}
          onClick={onActiveBlockClick}
        >
          {activeText}
        </div>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeGroup.group_id}
            data-testid="reader-active-block"
            data-animated="true"
            style={activeBlockStyle}
            onClick={onActiveBlockClick}
            initial={{ opacity: 0, y: ENTER_TRANSLATE_PX }}
            animate={{ opacity: activeOpacity, y: activeY }}
            exit={{ opacity: 0, y: -EXIT_TRANSLATE_PX }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {activeText}
          </motion.div>
        </AnimatePresence>
      )}

      <div style={{ ...NEIGHBOR_STYLE, alignSelf: 'start' }} aria-hidden="true">
        {nextText}
      </div>
    </div>
  );
}
