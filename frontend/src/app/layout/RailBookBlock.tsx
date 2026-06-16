import { useSyncExternalStore } from 'react';
import { NavLink, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { RefreshCw, Trash2 } from 'lucide-react';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { StatusOrb } from '@/components/ui/StatusOrb';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import {
  getBookIdentitySnapshot,
  subscribeBookIdentity,
} from '@/app/layout/bookIdentityStore';
import { BOOK_STAGE_LABELS, BOOK_STAGES, type BookStage } from '@/pages/Book/lib/stages';
import { pickRelevantJob } from '@/utils/jobSelection';
import type { Chapter, Job } from '@/types';

function getActiveStage(pathname: string): BookStage | null {
  const stage = pathname.split('/').filter(Boolean)[2];
  return BOOK_STAGES.includes(stage as BookStage) ? stage as BookStage : null;
}

function pickChapterJob(chapter: Chapter, projectId: string, jobs: Record<string, Job>): Job | undefined {
  return pickRelevantJob(
    Object.values(jobs).filter((job) =>
      job.project_id === projectId &&
      (job.chapter_id === chapter.id || job.chapter_file?.includes(chapter.id)),
    ),
  );
}

interface RailBookBlockProps {
  compact?: boolean;
}

export function RailBookBlock({ compact = false }: RailBookBlockProps) {
  const match = useMatch('/book/:bookId/*');
  const location = useLocation();
  const navigate = useNavigate();
  const identity = useSyncExternalStore(
    subscribeBookIdentity,
    getBookIdentitySnapshot,
    getBookIdentitySnapshot,
  );

  if (!match || !identity) {
    return null;
  }

  // Collapsed: show a single centred book cover thumbnail beneath the Library icon.
  if (compact) {
    return (
      <div
        className="rail-book-block rail-book-block--collapsed"
        title={identity.title}
        onClick={() => navigate(`/book/${identity.id}/publish`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/book/${identity.id}/publish`); }}
        aria-label={`Open ${identity.title}`}
      >
        <span className="rail-book-block__cover-compact" aria-hidden="true">
          {identity.coverUrl ? <img src={identity.coverUrl} alt="" /> : null}
        </span>
      </div>
    );
  }

  const activeStage = getActiveStage(location.pathname);
  const showChapters = activeStage === 'studio';
  const chapters = identity.chapters || [];
  const jobs = identity.jobs || {};
  const actions = identity.actions || {};
  const activeChapterId = showChapters
    ? new URLSearchParams(location.search).get('chapter') ?? chapters[0]?.id ?? null
    : null;

  return (
    <section className="rail-book-block" aria-label="Current book">
      {/* Book title row */}
      <button
        type="button"
        className="rail-book-block__header"
        onClick={() => navigate(`/book/${identity.id}/publish`)}
      >
        <span className="rail-book-block__cover" aria-hidden="true">
          {identity.coverUrl ? <img src={identity.coverUrl} alt="" /> : null}
        </span>
        <span className="rail-book-block__title">{identity.title}</span>
      </button>

      {/* Stage links — indented under tree line */}
      <div className="rail-book-block__stages" aria-label="Book stages">
        {BOOK_STAGES.map((stage) => (
          <div key={stage} className="rail-book-block__stage-group">
            <NavLink
              to={`/book/${identity.id}/${stage}`}
              className={({ isActive }) =>
                isActive ? 'rail-book-block__stage rail-book-block__stage--active' : 'rail-book-block__stage'
              }
            >
              {BOOK_STAGE_LABELS[stage]}
            </NavLink>

            {/* Studio expands its chapters inline, between Studio and Review. */}
            {stage === 'studio' && showChapters ? (
              <div className="rail-book-block__chapters" aria-label="Studio chapters">
                {chapters.map((chapter, index) => {
            const activeJob = pickChapterJob(chapter, identity.id, jobs);
            const queuePending = !activeJob && chapter.audio_status === 'processing';
            const selected = activeChapterId === chapter.id;

            return (
              <div
                key={chapter.id}
                className={selected
                  ? 'rail-book-block__chapter-wrap rail-book-block__chapter-wrap--active'
                  : 'rail-book-block__chapter-wrap'}
                data-testid={`rail-book-row-${chapter.id}`}
              >
                <button
                  type="button"
                  className={selected
                    ? 'rail-book-block__chapter rail-book-block__chapter--active'
                    : 'rail-book-block__chapter'}
                  onClick={() => navigate(`/book/${identity.id}/studio?chapter=${chapter.id}`)}
                  aria-label={`${index + 1}. ${chapter.title}`}
                >
                  <div className="rail-book-block__chapter-main">
                    <StatusOrb
                      chap={chapter}
                      activeJob={activeJob}
                      queuePending={queuePending}
                      doneSegments={chapter.done_segments_count}
                      totalSegments={chapter.total_segments_count}
                      size={15}
                    />
                    <span className="rail-book-block__chapter-index">{index + 1}.</span>
                    <span className="rail-book-block__chapter-title">{chapter.title}</span>
                  </div>
                </button>

                {selected ? (
                  <div className="rail-book-block__chapter-actions">
                    <ActionMenu
                      items={[
                        {
                          label: 'Queue',
                          icon: RefreshCw,
                          disabled: identity.anyEnginesEnabled === false,
                          onClick: () => actions.onQueueChapter?.(chapter),
                        },
                        {
                          label: 'Reset audio',
                          icon: RefreshCw,
                          onClick: () => actions.onResetAudio?.(chapter.id),
                        },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          isDestructive: true,
                          onClick: () => actions.onDeleteChapter?.(chapter.id),
                        },
                      ]}
                    />
                  </div>
                ) : null}

                {activeJob ? (
                  <div
                    className="rail-book-block__progress"
                    data-testid={`rail-book-progress-${chapter.id}`}
                  >
                    <PredictiveProgressBar
                      progress={activeJob.progress}
                      startedAt={activeJob.started_at}
                      etaSeconds={activeJob.eta_seconds}
                      etaBasis={activeJob.eta_basis}
                      updatedAt={activeJob.updated_at}
                      persistenceKey={activeJob.id}
                      status={activeJob.status}
                      state={activeJob.status === 'error' ? 'failed' : activeJob.status as any}
                      label={activeJob.status}
                      predictive
                      allowBackwardProgress
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
    </section>
  );
}
