import { Navigate, NavLink, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { setBookIdentity } from '@/app/layout/bookIdentityStore';
import type { Job, SegmentProgress, Settings, Speaker, SpeakerProfile, TtsEngine } from '@/types';
import { BookDataProvider, useBookDataContext } from '@/pages/Book/BookDataContext';
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
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/book/${bookId}/${getLastStage(bookId)}`} replace />;
}

function StagePlaceholder({ stage }: { stage: BookStage }) {
  const { loading, project } = useBookDataContext();

  return (
    <section className="book-stage-placeholder" data-testid={`stage-${stage}`} aria-labelledby={`book-stage-${stage}`}>
      <h1 id={`book-stage-${stage}`}>{BOOK_STAGE_LABELS[stage]}</h1>
      <p>{loading ? 'Loading book...' : `${project?.name || 'Book'} is ready for the R2 pipeline content.`}</p>
    </section>
  );
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
  const { bookId, stage } = useParams<{ bookId: string; stage: string }>();

  if (!bookId) {
    return <Navigate to="/" replace />;
  }

  if (!isBookStage(stage)) {
    return <Navigate to={`/book/${bookId}`} replace />;
  }

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
      <section className="book-layout" aria-label="Book pipeline">
        <nav className="book-stage-tabs" aria-label="Book stages">
          {BOOK_STAGES.map((bookStage) => (
            <NavLink
              key={bookStage}
              to={`/book/${bookId}/${bookStage}`}
              className={({ isActive }) =>
                isActive ? 'book-stage-tabs__link book-stage-tabs__link--active' : 'book-stage-tabs__link'
              }
              onClick={() => setLastStage(bookId, bookStage)}
            >
              {BOOK_STAGE_LABELS[bookStage]}
            </NavLink>
          ))}
        </nav>

        <StagePlaceholder stage={stage} />
      </section>
    </BookDataProvider>
  );
}
