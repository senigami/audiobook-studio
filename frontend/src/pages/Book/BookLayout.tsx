import { Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { setBookIdentity } from '@/app/layout/bookIdentityStore';
import type { Job, SegmentProgress, Settings, Speaker, SpeakerProfile, TtsEngine } from '@/types';
import { BookDataProvider, useBookDataContext } from '@/pages/Book/BookDataContext';
import { CastingStage } from '@/pages/Book/stages/CastingStage';
import { ContentsStage } from '@/pages/Book/stages/ContentsStage';
import { StudioStage } from '@/pages/Book/stages/StudioStage';
import { PublishStage } from '@/pages/Book/stages/PublishStage';
import { BackupsStage } from '@/pages/Book/stages/BackupsStage';
import {
  BOOK_STAGE_LABELS,
  BOOK_STAGES,
  getLastStage,
  isBookStage,
  setLastStage,
  type BookStage,
} from '@/pages/Book/lib/stages';

interface BookLayoutProps {
  jobs?: Record<string, Job>;
  segmentProgress?: Record<string, SegmentProgress>;
  speakerProfiles?: SpeakerProfile[];
  speakers?: Speaker[];
  settings?: Partial<Settings>;
  engines?: TtsEngine[];
  refreshTrigger?: number;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
  onOpenQueue?: () => void;
}

export function BookIndexRedirect() {
  const { bookId } = useParams<{ bookId: string }>();

  if (!bookId) {
    return <Navigate to="/library" replace />;
  }

  return <Navigate to={`/book/${bookId}/${getLastStage(bookId)}`} replace />;
}

function StageContent({ stage }: { stage: BookStage }) {
  if (stage === 'contents') {
    return <ContentsStage />;
  }
  if (stage === 'cast') {
    return <CastingStage />;
  }
  if (stage === 'publish') {
    return <PublishStage />;
  }
  if (stage === 'backups') {
    return <BackupsStage />;
  }
  return null;
}

function BookIdentityPublisher() {
  const {
    actions,
    chapters,
    jobs,
    project,
    totalRuntime,
    totalPredicted,
    projectVoiceStatus,
  } = useBookDataContext();

  useEffect(() => {
    if (!project) {
      setBookIdentity(null);
      return;
    }

    setBookIdentity({
      id: project.id,
      title: project.name,
      author: project.author,
      series: project.series,
      coverUrl: project.cover_image_path,
      runtimeSeconds: totalRuntime,
      predictedSeconds: totalPredicted,
      chapters,
      jobs,
      anyEnginesEnabled: projectVoiceStatus.enabled,
      actions: {
        onQueueChapter: (chapter) => void actions.handleQueueChapter(chapter.id),
        onResetAudio: (chapterId) => void actions.handleResetChapterAudio(chapterId),
        onDeleteChapter: (chapterId) => void actions.handleDeleteChapter(chapterId),
      },
    });

    return () => setBookIdentity(null);
  }, [actions, chapters, jobs, project, totalRuntime, totalPredicted, projectVoiceStatus.enabled]);

  return null;
}

/** Chapter Workspace — renders when a chapter is opened from Contents. */
function ChapterWorkspace({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const navigate = useNavigate();
  const { chapters } = useBookDataContext();

  const chapter = chapters.find((c) => c.id === chapterId);
  const chapterTitle = chapter?.title ?? chapterId;

  const handleBack = () => {
    navigate(`/book/${bookId}/contents`);
  };

  return (
    <section className="chapter-workspace" aria-label={`Chapter workspace: ${chapterTitle}`}>
      <div className="chapter-workspace__header">
        <button
          type="button"
          className="chapter-workspace__back"
          onClick={handleBack}
          aria-label="Back to Contents"
        >
          <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
          Contents
        </button>
        <span className="chapter-workspace__separator" aria-hidden="true">·</span>
        <span className="chapter-workspace__title">{chapterTitle}</span>
      </div>

      {/* Phase 1 placeholder: render StudioStage as the workspace body.
          Phase 2 will merge Review into this surface. */}
      <StudioStage />
    </section>
  );
}

export function BookLayout({
  jobs = {},
  segmentProgress = {},
  speakerProfiles = [],
  speakers = [],
  settings,
  engines = [],
  refreshTrigger = 0,
  segmentUpdate,
  chapterUpdate,
  onOpenQueue,
}: BookLayoutProps) {
  const { bookId, stage, chapterId } = useParams<{ bookId: string; stage: string; chapterId?: string }>();
  const [searchParams] = useSearchParams();

  if (!bookId) {
    return <Navigate to="/library" replace />;
  }

  // Chapter workspace route: /book/:bookId/chapter/:chapterId
  const isChapterWorkspace = Boolean(chapterId);

  if (!isChapterWorkspace && !isBookStage(stage)) {
    return <Navigate to={`/book/${bookId}`} replace />;
  }

  // Preserve the active chapter across stage switches when using the legacy
  // ?chapter= param (StudioStage still reads it). Book-level stages ignore
  // this param harmlessly, so we carry it on all tabs.
  const chapterParam = searchParams.get('chapter');
  const stageHref = (s: BookStage) =>
    chapterParam ? `/book/${bookId}/${s}?chapter=${encodeURIComponent(chapterParam)}` : `/book/${bookId}/${s}`;

  return (
    <BookDataProvider
      jobs={jobs}
      segmentProgress={segmentProgress}
      speakerProfiles={speakerProfiles}
      speakers={speakers}
      settings={settings}
      engines={engines}
      refreshTrigger={refreshTrigger}
      segmentUpdate={segmentUpdate}
      chapterUpdate={chapterUpdate}
      onOpenQueue={onOpenQueue}
    >
      <BookIdentityPublisher />
      <section className="book-layout" aria-label="Book">
        {/* Book-level tab bar — hidden when the chapter workspace is open */}
        {!isChapterWorkspace && (
          <nav className="book-stage-tabs" aria-label="Book tabs">
            {BOOK_STAGES.map((bookStage) => (
              <NavLink
                key={bookStage}
                to={stageHref(bookStage)}
                className={({ isActive }) =>
                  isActive ? 'book-stage-tabs__link book-stage-tabs__link--active' : 'book-stage-tabs__link'
                }
                onClick={() => setLastStage(bookId, bookStage)}
              >
                {BOOK_STAGE_LABELS[bookStage]}
              </NavLink>
            ))}
          </nav>
        )}

        {isChapterWorkspace ? (
          <ChapterWorkspace bookId={bookId} chapterId={chapterId!} />
        ) : (
          <StageContent stage={stage as BookStage} />
        )}
      </section>
    </BookDataProvider>
  );
}
