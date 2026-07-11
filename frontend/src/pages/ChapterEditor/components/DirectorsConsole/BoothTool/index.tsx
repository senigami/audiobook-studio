import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Headphones, MessageSquare, ChevronRight, ChevronLeft } from 'lucide-react';
import type { DirectorsTool } from '../types';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { api } from '@/api';
import type { ChapterSegment } from '@/types';
import { useRenderGroups } from '@/hooks/useRenderGroups';
import { useBoothPlayback } from './useBoothPlayback';
import { FollowAlongPanel } from './FollowAlongPanel';
import { AnnotationsPanel } from './AnnotationsPanel';

/**
 * Booth mode — the listening booth: karaoke highlight, click-to-seek,
 * segment regenerate, and an annotations drawer. Faithful port of
 * `frontend/src/pages/Book/stages/ReviewStage.tsx` (+ its `ReviewStage/`
 * sub-components), minus the redundant `review-chapter-rail` left sidebar —
 * `ChapterWorkspaceHeader` (rendered once, above the whole console) already
 * owns chapter switching. See
 * design-docs/plans/active/directors_console_activation/tasks/004-booth-tool.md.
 *
 * Zero-prop (INV-1): resolves book/chapter context itself via
 * `useBookDataContext()` + `useSearchParams()`, the same pattern as
 * `WriteTool`/`StudioStage`.
 */
const BoothToolBody: React.FC = () => {
  const { bookId, chapters, segmentProgress } = useBookDataContext();
  const [searchParams] = useSearchParams();
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isReRendering, setIsReRendering] = useState(false);
  const [reRenderError, setReRenderError] = useState<string | null>(null);
  const [renderGroupsRefreshKey, setRenderGroupsRefreshKey] = useState(0);
  // Polite live-region text, updated only on segment-boundary changes (see
  // the announcement effect below) — not on every playback tick.
  const [announcement, setAnnouncement] = useState('');
  // One-shot auto-play acknowledgment: the segment to pulse, cleared once the
  // pulse animation finishes (or immediately under prefers-reduced-motion).
  const [pulseSegmentId, setPulseSegmentId] = useState<string | null>(null);
  // Manual-scroll smarts (chapter-editor-modes.md §6): suspends the
  // auto-follow scroll while the user is actively scrolling the column
  // themselves.
  const [suspendAutoScroll, setSuspendAutoScroll] = useState(false);

  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === resolvedChapterId) || null,
    [chapters, resolvedChapterId],
  );

  const activeSegmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const textViewRef = useRef<HTMLDivElement | null>(null);
  // True only while WE are driving a scroll (via scrollIntoView) — lets the
  // scroll listener tell "the user scrolled" apart from "our own auto-follow
  // scroll fired a scroll event".
  const isAutoScrollingRef = useRef(false);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnnouncedOrdinalRef = useRef<number | null>(null);
  // Set once, right when autoplay fires on mode entry; consumed by the pulse
  // effect below the first time an active segment resolves.
  const autoplayPulseRef = useRef(false);

  // The "X / N" indicator MUST count render GROUPS (the rendered audio pieces),
  // not raw text segments — showing the segment count misleads the user into
  // thinking there are that many audio pieces. text-processing.md §6: any UI
  // segment count derives from the canonical render-group grouping.
  const { count: renderGroupCount, groupNumberBySegmentId } = useRenderGroups(
    bookId || '',
    resolvedChapterId || '',
    renderGroupsRefreshKey,
  );

  // Stale-response guard: if the user switches chapters quickly, an earlier
  // chapter's fetch can resolve AFTER a later chapter's, silently overwriting
  // `segments` with the wrong chapter's data. Track which chapter id the
  // in-flight fetch was issued for and ignore the response if it no longer
  // matches the current chapter.
  const requestedChapterIdRef = useRef<string | null>(null);

  // Fetch segments when chapter changes
  useEffect(() => {
    if (!resolvedChapterId) return;
    requestedChapterIdRef.current = resolvedChapterId;
    setLoadingSegments(true);
    api.fetchSegments(resolvedChapterId)
      .then((data) => {
        if (requestedChapterIdRef.current !== resolvedChapterId) return;
        setSegments(data || []);
      })
      .catch((err) => {
        console.error('Failed to fetch segments for booth tool:', err);
      })
      .finally(() => {
        if (requestedChapterIdRef.current !== resolvedChapterId) return;
        setLoadingSegments(false);
      });
  }, [resolvedChapterId]);

  const { activeSegmentId, playChapter, seekToSegment, audioUrl: loadedAudioUrl } = useBoothPlayback({
    chapterId: resolvedChapterId,
    segments,
  });

  // S1: progress value (0-100) for the actively re-rendering segment, if available
  const reRenderProgress = useMemo(() => {
    if (!isReRendering || !activeSegmentId) return null;
    const sp = segmentProgress[activeSegmentId];
    return sp != null ? Math.round(sp.progress * 100) : null;
  }, [isReRendering, activeSegmentId, segmentProgress]);

  const handleReRenderSegment = async () => {
    if (!activeSegmentId) return;
    setIsReRendering(true);
    setReRenderError(null);
    try {
      await api.generateSegments([activeSegmentId]);
    } catch (err) {
      console.error('Failed to regenerate segment:', err);
      setReRenderError('Re-render failed. Please try again.');
    } finally {
      setIsReRendering(false);
      setRenderGroupsRefreshKey((k) => k + 1);
    }
  };

  // Manual-scroll smarts: a real scroll event on the reading column that
  // ISN'T one we triggered ourselves means the user is reading around —
  // suspend auto-follow for a grace period rather than yanking them back.
  useEffect(() => {
    const el = textViewRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;
      setSuspendAutoScroll(true);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = setTimeout(() => setSuspendAutoScroll(false), 4000);
    };
    el.addEventListener('scroll', handleScroll);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, []);

  // Scroll active segment into view — suspended while the user is actively
  // scrolling manually (see above).
  useEffect(() => {
    if (suspendAutoScroll) return;
    if (activeSegmentId && activeSegmentRefs.current[activeSegmentId]) {
      isAutoScrollingRef.current = true;
      activeSegmentRefs.current[activeSegmentId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      const clearGuard = window.setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 600);
      return () => window.clearTimeout(clearGuard);
    }
  }, [activeSegmentId, suspendAutoScroll]);

  // The active render-GROUP ordinal (0-based; FollowAlongPanel adds 1 for display),
  // derived from the canonical grouping so the indicator reads "group N / <render groups>".
  const activeSegmentIndex = useMemo(() => {
    if (!activeSegmentId) return -1;
    const groupNumber = groupNumberBySegmentId.get(activeSegmentId);
    if (groupNumber) return groupNumber - 1;
    // Fallback before render-group data loads: map raw segment index → nothing misleading.
    return -1;
  }, [activeSegmentId, groupNumberBySegmentId]);

  // Auto-play acknowledgment: the first time an active segment resolves
  // after autoplay fired on mode entry, pulse it once so entry doesn't feel
  // silent. The pulse itself is a CSS animation gated behind
  // prefers-reduced-motion (theme/components/misc.css).
  useEffect(() => {
    if (autoplayPulseRef.current && activeSegmentId) {
      setPulseSegmentId(activeSegmentId);
      autoplayPulseRef.current = false;
    }
  }, [activeSegmentId]);

  // Polite live-region announcement — fires only when the derived render-group
  // ordinal actually changes (segment-boundary changes), not on every
  // playback-position tick, so it doesn't spam assistive tech.
  useEffect(() => {
    if (!activeSegmentId) return;
    const ordinal = groupNumberBySegmentId.get(activeSegmentId);
    if (ordinal == null || lastAnnouncedOrdinalRef.current === ordinal) return;
    lastAnnouncedOrdinalRef.current = ordinal;
    setAnnouncement(`Segment ${ordinal} of ${renderGroupCount ?? ordinal}`);
  }, [activeSegmentId, groupNumberBySegmentId, renderGroupCount]);

  /**
   * Booth mode has no rendered chapter switcher of its own — `ChapterWorkspaceHeader`
   * already syncs the route/`?chapter=` param this component reads. Entering Booth
   * mode for a chapter that already has rendered audio is now the sole playback
   * trigger, replacing ReviewStage's rail-click-to-play (there is no rail here).
   */
  useEffect(() => {
    if (!selectedChapter || !bookId) return;
    // Only treat audio as available when audio_file_path is a truthy,
    // non-null string — audio_status can read 'done' while the path is
    // still missing (race/stale cache), and force-unwrapping it would
    // silently request `filename=undefined`.
    const audioFilePath = selectedChapter.audio_file_path;
    if (!audioFilePath) return;

    const audioUrl = `/api/projects/${bookId}/chapters/${selectedChapter.id}/assets/audio?filename=${encodeURIComponent(audioFilePath)}`;
    // Don't reload/reset position if this exact audio is already the one
    // loaded on the player bus (e.g. re-entering Booth mode after switching
    // to another tool and back) — reloading would reset playback to 0:00.
    if (loadedAudioUrl === audioUrl) return;
    playChapter(audioUrl, selectedChapter.title);
    autoplayPulseRef.current = true;
    // Re-trigger only when the resolved chapter actually changes.

  }, [selectedChapter?.id, bookId]);

  return (
    <div className="review-main" data-testid="booth-tool">
      {/* Top bar: follow-along controls + annotation toggle */}
      <div className="review-main__topbar">
        <FollowAlongPanel
          activeSegmentId={activeSegmentId}
          totalSegments={renderGroupCount ?? 0}
          activeSegmentIndex={activeSegmentIndex}
          onReRenderSegment={handleReRenderSegment}
          isReRendering={isReRendering}
          reRenderError={reRenderError}
          reRenderProgress={reRenderProgress}
        />
        <button
          type="button"
          onClick={() => setShowAnnotations(!showAnnotations)}
          className="review-main__annotations-toggle"
          aria-pressed={showAnnotations}
          aria-label="Toggle annotations panel"
        >
          <MessageSquare size={14} aria-hidden="true" />
          <span>Annotations</span>
          {showAnnotations ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
        </button>
      </div>

      {/* Body: text view + optional annotations */}
      <div className="review-main__body">
        {/* Central scrolling book panel representing chapter text mapped to segments */}
        <div className="review-text-view" data-testid="review-text-view" ref={textViewRef}>
          {loadingSegments ? (
            <div className="review-text-view__empty">Loading segments...</div>
          ) : segments.length === 0 ? (
            <div className="review-text-view__empty">No segments found for this chapter.</div>
          ) : (
            segments.map((seg) => {
              const isActive = seg.id === activeSegmentId;
              const isPulsing = seg.id === pulseSegmentId;
              const classNames = [
                'review-text-view__segment',
                isActive ? 'review-text-view__segment--active' : '',
                isPulsing ? 'review-text-view__segment--pulse' : '',
              ].filter(Boolean).join(' ');
              return (
                <div
                  key={seg.id}
                  ref={(el) => {
                    activeSegmentRefs.current[seg.id] = el;
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => seekToSegment(seg.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      seekToSegment(seg.id);
                    }
                  }}
                  onAnimationEnd={() => {
                    if (isPulsing) setPulseSegmentId(null);
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={classNames}
                >
                  {seg.text_content}
                </div>
              );
            })
          )}
        </div>

        {/* Side drawer / collapsible panel for Annotations */}
        {showAnnotations && (
          <AnnotationsPanel
            chapterId={resolvedChapterId}
            activeSegmentId={activeSegmentId}
            onSeekToSegment={seekToSegment}
            groupNumberBySegmentId={groupNumberBySegmentId}
          />
        )}
      </div>

      {/* Assistive-tech-only status announcement — segment-boundary changes only */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
};

export const BoothTool: DirectorsTool = {
  id: 'booth',
  label: 'Booth',
  icon: Headphones,
  component: BoothToolBody,
  demoPlaceholder: false,
};
