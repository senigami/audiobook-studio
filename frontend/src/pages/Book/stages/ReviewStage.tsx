import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessageSquare, ChevronRight, ChevronLeft } from 'lucide-react';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { api } from '@/api';
import type { ChapterSegment } from '@/types';
import { useRenderGroups } from '@/hooks/useRenderGroups';
import { useReviewPlayback } from './ReviewStage/useReviewPlayback';
import { FollowAlongPanel } from './ReviewStage/FollowAlongPanel';
import { AnnotationsPanel } from './ReviewStage/AnnotationsPanel';

export function ReviewStage() {
  const { bookId, chapters, segmentProgress } = useBookDataContext();
  const { chapterId: routeChapterId } = useParams<{ chapterId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isReRendering, setIsReRendering] = useState(false);
  const [reRenderError, setReRenderError] = useState<string | null>(null);
  const [renderGroupsRefreshKey, setRenderGroupsRefreshKey] = useState(0);

  // The resolved chapter: prefer the route param, fall back to ?chapter= param, then first chapter.
  const resolvedChapterId =
    routeChapterId || searchParams.get('chapter') || chapters[0]?.id || null;

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === resolvedChapterId) || null,
    [chapters, resolvedChapterId],
  );

  const activeSegmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // The "X / N" indicator MUST count render GROUPS (the rendered audio pieces),
  // not raw text segments — showing the segment count (e.g. 9) misleads the user
  // into thinking there are that many audio pieces. text-processing.md §6: any
  // UI segment count derives from the canonical render-group grouping.
  const { count: renderGroupCount, groupNumberBySegmentId } = useRenderGroups(
    bookId || '',
    resolvedChapterId || '',
    renderGroupsRefreshKey,
  );

  // Fetch segments when chapter changes
  useEffect(() => {
    if (!resolvedChapterId) return;
    setLoadingSegments(true);
    api.fetchSegments(resolvedChapterId)
      .then((data) => {
        setSegments(data || []);
      })
      .catch((err) => {
        console.error('Failed to fetch segments for review stage:', err);
      })
      .finally(() => {
        setLoadingSegments(false);
      });
  }, [resolvedChapterId]);

  const {
    activeSegmentId,
    isPlaying,
    playChapter,
    seekToSegment,
  } = useReviewPlayback({
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

  // Scroll active segment into view
  useEffect(() => {
    if (activeSegmentId && activeSegmentRefs.current[activeSegmentId]) {
      activeSegmentRefs.current[activeSegmentId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeSegmentId]);

  // The active render-GROUP ordinal (0-based; FollowAlongPanel adds 1 for display),
  // derived from the canonical grouping so the indicator reads "group N / <render groups>".
  const activeSegmentIndex = useMemo(() => {
    if (!activeSegmentId) return -1;
    const groupNumber = groupNumberBySegmentId.get(activeSegmentId);
    if (groupNumber) return groupNumber - 1;
    // Fallback before render-group data loads: map raw segment index → nothing misleading.
    return -1;
  }, [activeSegmentId, groupNumberBySegmentId]);

  /**
   * Navigate to a chapter and immediately load + play it.
   * Selecting a chapter in the left rail is the sole entry point for playback —
   * no separate "Load & Play" button is needed.
   */
  const handleChapterSelect = (chapterId: string) => {
    // Navigate the workspace to the selected chapter so the header switcher and
    // route stay in sync.  The ChapterWorkspace useEffect will sync ?chapter= from
    // the route param automatically.
    navigate(`/book/${bookId}/chapter/${chapterId}`);

    // If the chapter has audio, trigger playback immediately.
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    const hasAudio = Boolean(chapter.audio_file_path || chapter.audio_status === 'done');
    if (!hasAudio) return;

    const audioUrl = `/api/projects/${bookId}/chapters/${chapter.id}/assets/audio?filename=${encodeURIComponent(chapter.audio_file_path!)}`;

    // Best-effort altScope: use the first rendered segment URL if one exists.
    // Segments for the newly selected chapter may not be loaded yet; when they
    // arrive the play state is already wired through playerBus, so this is fine.
    const firstRenderedSeg = segments.find(
      (s) => s.audio_status === 'done' && s.audio_file_path,
    );
    const segmentAltScope = firstRenderedSeg
      ? {
          audioUrl: `/api/projects/${bookId}/chapters/${chapter.id}/assets/audio?filename=${encodeURIComponent(firstRenderedSeg.audio_file_path!)}`,
          title: `Segment ${firstRenderedSeg.segment_order + 1}`,
          subtitle: chapter.title,
        }
      : undefined;

    playChapter(audioUrl, chapter.title, segmentAltScope);
  };

  return (
    <section
      className="book-stage-review"
      data-testid="stage-review"
      aria-label="Review Stage"
    >
      {/* Left sidebar: vertical chapter list */}
      <aside className="review-chapter-rail" aria-label="Chapter list">
        <div className="review-chapter-rail__header">
          <span className="review-chapter-rail__label">Chapters</span>
        </div>
        <div className="review-chapter-rail__list" role="listbox" aria-label="Select a chapter">
          {chapters.map((ch) => {
            const isSelected = ch.id === resolvedChapterId;
            const chHasAudio = Boolean(ch.audio_file_path || ch.audio_status === 'done');
            return (
              <button
                key={ch.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleChapterSelect(ch.id)}
                className={`review-chapter-rail__item${isSelected ? ' review-chapter-rail__item--selected' : ''}${isPlaying && isSelected ? ' review-chapter-rail__item--playing' : ''}`}
                title={chHasAudio ? `Play ${ch.title}` : `${ch.title} — render first`}
              >
                <span className="review-chapter-rail__item-title">{ch.title}</span>
                {!chHasAudio && (
                  <span className="review-chapter-rail__item-badge" aria-label="Not rendered">
                    ·
                  </span>
                )}
                {isPlaying && isSelected && (
                  <span className="review-chapter-rail__item-badge review-chapter-rail__item-badge--playing" aria-label="Now playing">
                    ▶
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main area: follow-along playback */}
      <div className="review-main">
        {/* Top bar: follow-along controls + annotation toggle */}
        <div className="review-main__topbar">
          <FollowAlongPanel
            chapterTitle={selectedChapter?.title || ''}
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
          <div className="review-text-view" data-testid="review-text-view">
            {loadingSegments ? (
              <div className="review-text-view__empty">Loading segments...</div>
            ) : segments.length === 0 ? (
              <div className="review-text-view__empty">No segments found for this chapter.</div>
            ) : (
              segments.map((seg) => {
                const isActive = seg.id === activeSegmentId;
                return (
                  <div
                    key={seg.id}
                    ref={(el) => {
                      activeSegmentRefs.current[seg.id] = el;
                    }}
                    onClick={() => seekToSegment(seg.id)}
                    className={`review-text-view__segment${isActive ? ' review-text-view__segment--active' : ''}`}
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
            />
          )}
        </div>
      </div>
    </section>
  );
}
