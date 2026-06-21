import { Reorder } from 'framer-motion';
import { RefreshCw, Trash2, Video } from 'lucide-react';
import { InlineEdit } from '@/components/forms/InlineEdit';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { StatusOrb } from '@/components/ui/StatusOrb';
import { deriveChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import { pickRelevantJob } from '@/utils/jobSelection';
import type { Chapter, Job } from '@/types';

interface ChapterTableProps {
  chapters: Chapter[];
  jobs: Record<string, Job>;
  selectedChapterId?: string | null;
  onSelectChapter: (chapterId: string) => void;
  onReorder: (chapters: Chapter[]) => void;
  onRenameChapter: (chapterId: string, title: string) => void | Promise<void>;
  onQueueChapter: (chapter: Chapter) => void;
  onResetAudio: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
  onExportSample: (chapter: Chapter) => void;
  anyEnginesEnabled?: boolean;
  /** When provided, clicking a chapter row opens the Chapter Workspace. */
  onOpenChapter?: (chapterId: string) => void;
}

function pickChapterJob(chapter: Chapter, jobs: Record<string, Job>): Job | undefined {
  return pickRelevantJob(
    Object.values(jobs).filter((job) =>
      job.project_id === chapter.project_id &&
      (job.chapter_id === chapter.id || job.chapter_file?.includes(chapter.id)),
    ),
  );
}

export function ChapterTable({
  chapters,
  jobs,
  selectedChapterId,
  onSelectChapter,
  onReorder,
  onRenameChapter,
  onQueueChapter,
  onResetAudio,
  onDeleteChapter,
  onExportSample,
  anyEnginesEnabled = true,
  onOpenChapter,
}: ChapterTableProps) {
  const handleSort = () => {
    onReorder([...chapters].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })));
  };

  return (
    <section className="chapter-table" aria-label="Manuscript chapters">
      <div className="chapter-table__toolbar">
        <h2>Chapters</h2>
        <button type="button" className="btn-ghost" onClick={handleSort} aria-label="Sort A-Z">
          Sort A-Z
        </button>
      </div>

      <div className="chapter-table__header" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Title</span>
        <span role="columnheader">Words</span>
        <span role="columnheader">Stage</span>
        <span role="columnheader">Status</span>
      </div>

      <Reorder.Group
        axis="y"
        values={chapters}
        onReorder={onReorder}
        className="chapter-table__body"
      >
        {chapters.map((chapter, index) => {
          const activeJob = pickChapterJob(chapter, jobs);
          const lifecycle = deriveChapterLifecycle(chapter);
          const queuePending = !activeJob && chapter.audio_status === 'processing';
          const selected = selectedChapterId === chapter.id;

          return (
            <Reorder.Item
              key={chapter.id}
              value={chapter}
              className={selected ? 'chapter-table__row chapter-table__row--selected' : 'chapter-table__row'}
              data-testid={`chapter-table-row-${chapter.id}`}
              onClick={onOpenChapter ? () => onOpenChapter(chapter.id) : undefined}
              style={onOpenChapter ? { cursor: 'pointer' } : undefined}
            >
              <div className="chapter-table__number-cell">
                <button
                  type="button"
                  className="chapter-table__select"
                  onClick={(e) => { e.stopPropagation(); (onOpenChapter ?? onSelectChapter)(chapter.id); }}
                  aria-label={onOpenChapter ? `Open ${chapter.title}` : `Select ${chapter.title}`}
                >
                  <span>{index + 1}</span>
                </button>

                <StatusOrb
                  chap={chapter}
                  activeJob={activeJob}
                  queuePending={queuePending}
                  doneSegments={chapter.done_segments_count}
                  totalSegments={chapter.total_segments_count}
                />
              </div>

              <div className="chapter-table__title">
                {/* Rename is an explicit affordance; stop the row-open click from firing. */}
                <span onClick={(e) => e.stopPropagation()}>
                  <InlineEdit value={chapter.title} onSave={(title) => onRenameChapter(chapter.id, title)} />
                </span>
              </div>

              <div className="chapter-table__words">{chapter.word_count ?? '-'}</div>
              <div className={`chapter-table__pill chapter-table__pill--${lifecycle.toLowerCase()}`}>{lifecycle}</div>
              <div className="chapter-table__status" onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  items={[
                    {
                      label: 'Queue Chapter',
                      icon: RefreshCw,
                      disabled: !anyEnginesEnabled,
                      onClick: () => onQueueChapter(chapter),
                    },
                    {
                      label: 'Export Video Sample',
                      icon: Video,
                      disabled: chapter.audio_status !== 'done',
                      onClick: () => onExportSample(chapter),
                    },
                    { isDivider: true },
                    {
                      label: 'Reset Audio',
                      icon: RefreshCw,
                      onClick: () => onResetAudio(chapter.id),
                    },
                    {
                      label: 'Delete Chapter',
                      icon: Trash2,
                      isDestructive: true,
                      onClick: () => onDeleteChapter(chapter.id),
                    },
                  ]}
                />
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </section>
  );
}
