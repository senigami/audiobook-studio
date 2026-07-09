import { Navigate, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { type ReactNode, useEffect, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { setBookIdentity } from '@/app/layout/bookIdentityStore';
import type { Job, SegmentProgress, Settings, Speaker, SpeakerProfile, TtsEngine } from '@/types';
import { BookDataProvider, useBookDataContext } from '@/pages/Book/BookDataContext';
import { BookStage as BookInfoStage } from '@/pages/Book/stages/BookStage';
import { CastingStage } from '@/pages/Book/stages/CastingStage';
import { ContentsStage } from '@/pages/Book/stages/ContentsStage';
import { LexiconStage } from '@/pages/Book/stages/LexiconStage';
import { StudioStage } from '@/pages/Book/stages/StudioStage';
import { ReviewStage } from '@/pages/Book/stages/ReviewStage';
import { PublishStage } from '@/pages/Book/stages/PublishStage';
import { BackupsStage } from '@/pages/Book/stages/BackupsStage';
import { ChapterWorkspaceHeader } from '@/pages/Book/components/ChapterWorkspaceHeader';
import { LexiconPanel } from '@/pages/Book/components/LexiconPanel';
import {
  BOOK_STAGE_LABELS,
  BOOK_STAGES,
  getLastStage,
  isBookStage,
  setLastChapter,
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
  if (stage === 'book') {
    return <BookInfoStage />;
  }
  if (stage === 'contents') {
    return <ContentsStage />;
  }
  if (stage === 'cast') {
    return <CastingStage />;
  }
  if (stage === 'lexicon') {
    return <LexiconStage />;
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

type WorkspaceView = 'studio' | 'review';

// ---------------------------------------------------------------------------
// WorkspacePanel — reusable dockable side panel for the Chapter Workspace.
//
// This is the first of the "dockable workspace panels" pattern.  To add more
// panels (e.g. Cast, Notes), follow the same shape: a toggle button in the
// toolbar row, an open/close boolean in ChapterWorkspace state, and render
// a <WorkspacePanel> beside the stage body.  The pattern intentionally stays
// simple (CSS flex + boolean state) — no plugin registry needed yet.
// ---------------------------------------------------------------------------

interface WorkspacePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function WorkspacePanel({ title, onClose, children }: WorkspacePanelProps) {
  return (
    <aside
      className="workspace-side-panel"
      aria-label={title}
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 'var(--type-caption)',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title} panel`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: '1px solid var(--border)',
            background: 'transparent',
            borderRadius: 'var(--radius-button)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, padding: 'var(--space-3)', minHeight: 0 }}>
        {children}
      </div>
    </aside>
  );
}

/** Chapter Workspace — renders when a chapter is opened from Contents. */
function ChapterWorkspace({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const { chapters } = useBookDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<WorkspaceView>('studio');
  const [lexiconOpen, setLexiconOpen] = useState(false);

  const chapter = chapters.find((c) => c.id === chapterId);
  const chapterTitle = chapter?.title ?? chapterId;

  // Persist the last-opened chapter so Contents can restore it.
  useEffect(() => {
    setLastChapter(bookId, chapterId);
  }, [bookId, chapterId]);

  // Sync the route-level chapterId into ?chapter= so StudioStage and ReviewStage
  // (which read searchParams.get('chapter')) pick up the correct chapter without
  // modification.  Replace rather than push so the extra param doesn't pollute history.
  // Depend only on chapterId: re-fire when the route param changes.
  // searchParams is intentionally omitted — the conditional guard is idempotent,
  // and including setSearchParams in deps would create a re-entrancy loop.
  useEffect(() => {
    if (searchParams.get('chapter') !== chapterId) {
      const next = new URLSearchParams(searchParams);
      next.set('chapter', chapterId);
      setSearchParams(next, { replace: true });
    }
  }, [chapterId]); // intentional: see comment above

  return (
    <section className="chapter-workspace" aria-label={`Chapter workspace: ${chapterTitle}`}>
      <ChapterWorkspaceHeader
        bookId={bookId}
        chapters={chapters}
        activeChapterId={chapterId}
      />

      {/* Toolbar row: Studio/Review toggle + workspace panel toggles */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}
      >
        {/* Studio / Review sub-view toggle */}
        <div className="workspace-view-toggle" role="group" aria-label="Workspace view">
          <button
            type="button"
            className={`workspace-view-toggle__btn${activeView === 'studio' ? ' workspace-view-toggle__btn--active' : ''}`}
            onClick={() => setActiveView('studio')}
            aria-pressed={activeView === 'studio'}
          >
            Studio
          </button>
          <button
            type="button"
            className={`workspace-view-toggle__btn${activeView === 'review' ? ' workspace-view-toggle__btn--active' : ''}`}
            onClick={() => setActiveView('review')}
            aria-pressed={activeView === 'review'}
          >
            Review
          </button>
        </div>

        {/* Dockable panel toggles */}
        <button
          type="button"
          onClick={() => setLexiconOpen((v) => !v)}
          aria-pressed={lexiconOpen}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            padding: '0.3rem 0.6rem',
            border: `1px solid ${lexiconOpen ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-button)',
            background: lexiconOpen ? 'var(--accent-glow)' : 'var(--surface)',
            color: lexiconOpen ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--type-caption)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <BookOpen size={13} aria-hidden="true" />
          Lexicon
        </button>
      </div>

      {/* Sub-view body + optional docked side panels */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: 0,
          border: lexiconOpen ? '1px solid var(--border)' : undefined,
          borderRadius: lexiconOpen ? 'var(--radius-panel)' : undefined,
          overflow: lexiconOpen ? 'hidden' : undefined,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeView === 'studio' ? <StudioStage /> : <ReviewStage />}
        </div>

        {lexiconOpen && (
          <WorkspacePanel title="Lexicon" onClose={() => setLexiconOpen(false)}>
            <LexiconPanel projectId={bookId} />
          </WorkspacePanel>
        )}
      </div>
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
