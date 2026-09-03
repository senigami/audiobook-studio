import { useSyncExternalStore } from 'react';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import type { Chapter, Job } from '@/types';
import {
  getBookIdentitySnapshot,
  subscribeBookIdentity,
} from '@/app/layout/bookIdentityStore';
import { BOOK_STAGE_LABELS, BOOK_STAGES } from '@/pages/Book/lib/stages';

interface RailBookBlockProps {
  compact?: boolean;
}

// Ambient "N of M chapters done" / "N rendering" glance — persona fast-follow
// (Oliver/deadline-editor finding, contextual-left-nav sign-off round 4):
// removing the rail's permanent chapter list also removed the only place to
// see render progress without opening the Contents page. Mirrors
// ChapterWorkspaceHeader's isChapterFullyRendered/rendering criteria.
function summarizeChapterProgress(
  chapters: Chapter[] | undefined,
  jobs: Record<string, Job> | undefined,
): { done: number; total: number; rendering: number } | null {
  if (!chapters || chapters.length === 0) return null;
  let done = 0;
  let rendering = 0;
  for (const chapter of chapters) {
    const total = chapter.total_segments_count;
    const doneSegments = chapter.done_segments_count;
    const fullyRendered =
      chapter.audio_status === 'done' ||
      (typeof total === 'number' && typeof doneSegments === 'number' && total > 0 && doneSegments >= total);
    if (fullyRendered) {
      done += 1;
      continue;
    }
    const hasActiveJob = jobs
      ? Object.values(jobs).some(
          (job) =>
            job.project_id === chapter.project_id &&
            (job.chapter_id === chapter.id || job.chapter_file?.includes(chapter.id)) &&
            (job.status === 'queued' || job.status === 'preparing' || job.status === 'running' || job.status === 'finalizing'),
        )
      : false;
    if (hasActiveJob || chapter.audio_status === 'processing') {
      rendering += 1;
    }
  }
  return { done, total: chapters.length, rendering };
}

export function RailBookBlock({ compact = false }: RailBookBlockProps) {
  const match = useMatch('/book/:bookId/*');
  const navigate = useNavigate();
  const identity = useSyncExternalStore(
    subscribeBookIdentity,
    getBookIdentitySnapshot,
    getBookIdentitySnapshot,
  );

  if (!match || !identity) {
    return null;
  }

  const progress = summarizeChapterProgress(identity.chapters, identity.jobs);

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

      {progress && (
        <p className="rail-book-block__progress" aria-label={`${progress.done} of ${progress.total} chapters done${progress.rendering > 0 ? `, ${progress.rendering} rendering` : ''}`}>
          <span>{progress.done} of {progress.total} done</span>
          {progress.rendering > 0 && (
            <span className="rail-book-block__progress-rendering">{progress.rendering} rendering</span>
          )}
        </p>
      )}

      {/* Stage links — fixed set, no chapter expansion */}
      <div className="rail-book-block__stages" aria-label="Book stages">
        {BOOK_STAGES.map((stage) => (
          <NavLink
            key={stage}
            to={`/book/${identity.id}/${stage}`}
            className={({ isActive }) =>
              isActive ? 'rail-book-block__stage rail-book-block__stage--active' : 'rail-book-block__stage'
            }
          >
            {BOOK_STAGE_LABELS[stage]}
          </NavLink>
        ))}
      </div>
    </section>
  );
}
