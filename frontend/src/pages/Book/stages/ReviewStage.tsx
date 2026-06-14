import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Play, MessageSquare, ChevronRight, ChevronLeft } from 'lucide-react';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { api } from '@/api';
import type { ChapterSegment } from '@/types';
import { useReviewPlayback } from './ReviewStage/useReviewPlayback';
import { FollowAlongPanel } from './ReviewStage/FollowAlongPanel';
import { AnnotationsPanel } from './ReviewStage/AnnotationsPanel';

export function ReviewStage() {
  const { bookId, chapters } = useBookDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isReRendering, setIsReRendering] = useState(false);
  const [reRenderError, setReRenderError] = useState<string | null>(null);

  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === resolvedChapterId) || null,
    [chapters, resolvedChapterId],
  );

  const activeSegmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    position,
    duration,
    playChapter,
    seekToSegment,
    togglePlayPause,
    seekBy,
  } = useReviewPlayback({
    chapterId: resolvedChapterId,
    segments,
  });

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

  const activeSegmentIndex = useMemo(() => {
    if (!activeSegmentId) return -1;
    return segments.findIndex((seg) => seg.id === activeSegmentId);
  }, [activeSegmentId, segments]);

  const chapterHasAudio = Boolean(
    selectedChapter?.audio_file_path || selectedChapter?.audio_status === 'done',
  );

  const handlePlayChapterClick = () => {
    if (!selectedChapter || !chapterHasAudio) return;
    const audioUrl = `/api/projects/${bookId}/chapters/${selectedChapter.id}/assets/audio?filename=${encodeURIComponent(selectedChapter.audio_file_path!)}`;
    playChapter(audioUrl, selectedChapter.title);
  };

  const handleChapterSelect = (chapterId: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('chapter', chapterId);
    setSearchParams(nextSearchParams, { replace: true });
  };

  return (
    <section
      className="book-stage-review"
      data-testid="stage-review"
      aria-label="Review Stage"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '12px',
      }}
    >
      {/* Chapter navigation header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--surface)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-button)',
          border: '1px solid var(--border)',
        }}
      >
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          Select Chapter:
        </span>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', flex: 1 }}>
          {chapters.map((ch) => {
            const isSelected = ch.id === resolvedChapterId;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleChapterSelect(ch.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--accent-tint-bg)' : 'var(--surface)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {ch.title}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowAnnotations(!showAnnotations)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            fontSize: '0.7rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-button)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >
          <MessageSquare size={14} />
          <span>Annotations</span>
          {showAnnotations ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        {/* Sidebar panel for FollowAlong controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <FollowAlongPanel
            position={position}
            duration={duration}
            isPlaying={isPlaying}
            togglePlayPause={togglePlayPause}
            seekBy={seekBy}
            chapterTitle={selectedChapter?.title || ''}
            activeSegmentId={activeSegmentId}
            totalSegments={segments.length}
            activeSegmentIndex={activeSegmentIndex}
            onReRenderSegment={handleReRenderSegment}
            isReRendering={isReRendering}
            reRenderError={reRenderError}
          />
          {!isPlaying && selectedChapter && (
            <button
              type="button"
              onClick={handlePlayChapterClick}
              disabled={!chapterHasAudio}
              title={chapterHasAudio ? undefined : 'Render this chapter first'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                background: chapterHasAudio ? 'var(--accent)' : 'var(--surface)',
                color: chapterHasAudio ? 'white' : 'var(--text-muted)',
                border: chapterHasAudio ? 'none' : '1px solid var(--border)',
                borderRadius: 'var(--radius-button)',
                fontWeight: 600,
                fontSize: '0.75rem',
                cursor: chapterHasAudio ? 'pointer' : 'not-allowed',
                opacity: chapterHasAudio ? 1 : 0.5,
              }}
            >
              <Play size={16} fill="currentColor" />
              <span>{chapterHasAudio ? 'Load & Play Chapter' : 'Render this chapter first'}</span>
            </button>
          )}
        </div>

        {/* Central scrolling book panel representing chapter text mapped to segments */}
        <div
          className="review-text-view"
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-panel)',
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {loadingSegments ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>
              Loading segments...
            </div>
          ) : segments.length === 0 ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>
              No segments found for this chapter.
            </div>
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
                  style={{
                    fontSize: '0.75rem',
                    lineHeight: 1.6,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-button)',
                    background: isActive ? 'var(--accent-tint-bg)' : 'transparent',
                    border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                    cursor: 'pointer',
                    fontWeight: isActive ? 600 : 400,
                    transition: 'all 0.15s ease-in-out',
                  }}
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
    </section>
  );
}
