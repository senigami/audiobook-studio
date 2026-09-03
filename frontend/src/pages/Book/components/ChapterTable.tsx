import { useState } from 'react';
import { Reorder } from 'framer-motion';
import { Download, Pause, Play, RefreshCw, Trash2, Video } from 'lucide-react';
import { InlineEdit } from '@/components/forms/InlineEdit';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { StatusOrb } from '@/components/ui/StatusOrb';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { usePlayerBus, loadAndPlay, play, pause } from '@/store/playerBus';
import { deriveChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import { buildChapterAudioUrl } from '@/pages/Book/lib/chapterAudioUrl';
import { pickRelevantJob, isMainQueueSegmentItem } from '@/utils/jobSelection';
import type { Chapter, Job } from '@/types';

const LARGE_CHAPTER_CHAR_THRESHOLD = 50_000;

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

// ---------------------------------------------------------------------------
// Confirm-state shape: each destructive action has its own pending payload.
// ---------------------------------------------------------------------------
type ConfirmState =
  | { kind: 'none' }
  | { kind: 'rebuild'; chapter: Chapter }
  | { kind: 'large'; chapter: Chapter }
  | { kind: 'reset'; chapterId: string }
  | { kind: 'delete'; chapterId: string };

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
  const playerBus = usePlayerBus();
  const [confirmState, setConfirmState] = useState<ConfirmState>({ kind: 'none' });

  // RST-4: guard queue action before invoking the prop.
  const handleQueueWithGuard = (chapter: Chapter) => {
    const isFullyRendered = !!(chapter.has_wav || chapter.has_mp3 || chapter.has_m4a);
    if (isFullyRendered) {
      setConfirmState({ kind: 'rebuild', chapter });
      return;
    }
    if ((chapter.char_count ?? 0) > LARGE_CHAPTER_CHAR_THRESHOLD) {
      setConfirmState({ kind: 'large', chapter });
      return;
    }
    onQueueChapter(chapter);
  };

  const handleSort = () => {
    onReorder([...chapters].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })));
  };

  const confirmOpen = confirmState.kind !== 'none';

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
          const hasChapterAudio = !!(chapter.has_wav || chapter.has_mp3 || chapter.has_m4a);

          // RST-1: progress bar state derived from active job (mirrors ChapterList.tsx:108–131).
          const displayStatus = activeJob?.status;
          const liveRenderBlockIsActive = !!activeJob && (
            !!activeJob.active_segment_id ||
            !!activeJob.active_render_batch_id ||
            typeof activeJob.active_render_batch_progress === 'number'
          );
          const renderGroupCount = activeJob?.render_group_count ?? 0;
          const completedRenderGroups = activeJob?.completed_render_groups ?? 0;
          const activeRenderGroupIndex = activeJob?.active_render_group_index ?? 0;
          const totalRenderWeight = activeJob?.total_render_weight ?? 0;
          const completedRenderWeight = activeJob?.completed_render_weight ?? 0;
          const activeRenderGroupWeight = activeJob?.active_render_group_weight ?? 0;
          const activeGroupProgress = activeRenderGroupIndex > completedRenderGroups
            ? Math.max(0, Math.min(activeJob?.active_segment_progress ?? 0, 1))
            : 0;
          const isGroupedChapterJob = !!activeJob && renderGroupCount > 0 && !isMainQueueSegmentItem(activeJob);
          const weightedGroupedProgress = totalRenderWeight > 0
            ? (((completedRenderWeight + (activeRenderGroupWeight * activeGroupProgress)) / totalRenderWeight) * 0.9)
            : 0;
          const backendGroupedProgress = activeJob?.grouped_progress ?? 0;
          const progressValue = displayStatus === 'finalizing'
            ? 1
            : activeJob
              ? Math.max(activeJob.progress ?? 0, backendGroupedProgress, weightedGroupedProgress)
              : 0;

          // RST-2: player-bus wiring for play/pause affordance.
          const audioPath = chapter.audio_file_path;
          const audioUrl = buildChapterAudioUrl(chapter);
          const isCurrentChapterAudio = audioUrl != null && playerBus.scope === 'chapter' && playerBus.audioUrl === audioUrl;
          const isChapterPlaying = isCurrentChapterAudio && playerBus.playing;

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

              {/* RST-1: progress bar replaces static status cell while a job is active. */}
              <div className="chapter-table__status" onClick={(e) => e.stopPropagation()}>
                {activeJob ? (
                  <div className="chapter-table__progress-bar" data-testid="chapter-table-progress-bar">
                    <PredictiveProgressBar
                      dataTestId={`chapter-list-progress-bar-${chapter.id}`}
                      progress={progressValue}
                      startedAt={activeJob.started_at}
                      etaSeconds={activeJob.eta_seconds}
                      etaBasis={activeJob.eta_basis ?? (activeJob.eta_seconds != null ? 'remaining_from_update' : undefined)}
                      updatedAt={activeJob.updated_at}
                      persistenceKey={activeJob.id}
                      status={displayStatus}
                      state={
                        displayStatus === 'preparing'
                          ? 'preparing'
                          : displayStatus === 'finalizing'
                            ? 'finalizing'
                            : displayStatus === 'running'
                              ? (liveRenderBlockIsActive ? 'running' : 'processing')
                              : (displayStatus === 'error' ? 'failed' : displayStatus as any)
                      }
                      label={displayStatus}
                      predictive={true}
                      allowBackwardProgress={!isGroupedChapterJob}
                      checkpointMode={
                        isGroupedChapterJob
                          ? 'queue'
                          : isMainQueueSegmentItem(activeJob)
                            ? 'segment'
                            : 'default'
                      }
                      transitionTickCount={
                        isGroupedChapterJob ? 12 : isMainQueueSegmentItem(activeJob) ? 3 : 8
                      }
                      backwardTransitionTickCount={2}
                      tickMs={250}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* RST-2: play/pause affordance — only when audio exists and no job running. */}
                    {hasChapterAudio && audioUrl && (
                      <button
                        type="button"
                        className="btn-ghost chapter-table__play-btn"
                        data-testid={`chapter-table-play-btn-${chapter.id}`}
                        aria-label={isChapterPlaying ? 'Pause Chapter Audio' : 'Play Chapter Audio'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCurrentChapterAudio) {
                            if (isChapterPlaying) { pause(); } else { play(); }
                          } else {
                            loadAndPlay({
                              scope: 'chapter',
                              title: chapter.title || 'Chapter Audio',
                              subtitle: `Chapter ${index + 1}`,
                              audioUrl,
                            });
                          }
                        }}
                      >
                        {isChapterPlaying ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                    )}
                    <ActionMenu
                      items={[
                        {
                          label: 'Queue Chapter',
                          icon: RefreshCw,
                          disabled: !anyEnginesEnabled,
                          onClick: () => handleQueueWithGuard(chapter),
                        },
                        {
                          label: 'Export Video Sample',
                          icon: Video,
                          disabled: chapter.audio_status !== 'done',
                          onClick: () => onExportSample(chapter),
                        },
                        // RST-3: download audio menu item when chapter has audio.
                        ...(hasChapterAudio && audioPath
                          ? [{
                            label: 'Download Audio',
                            icon: Download,
                            onClick: () => {
                              const ext = audioPath.substring(audioPath.lastIndexOf('.'));
                              const link = document.createElement('a');
                              link.href = `/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${audioPath}`;
                              link.download = `${chapter.title}${ext}`;
                              link.click();
                            },
                          }]
                          : []),
                        { isDivider: true },
                        {
                          label: 'Reset Audio',
                          icon: RefreshCw,
                          // RST-4: confirm before resetting audio.
                          onClick: () => setConfirmState({ kind: 'reset', chapterId: chapter.id }),
                        },
                        {
                          label: 'Delete Chapter',
                          icon: Trash2,
                          isDestructive: true,
                          // RST-4: confirm before deleting.
                          onClick: () => setConfirmState({ kind: 'delete', chapterId: chapter.id }),
                        },
                      ]}
                    />
                  </div>
                )}
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {/* RST-4: destructive-action confirm modals */}
      <ConfirmModal
        isOpen={confirmOpen && confirmState.kind === 'rebuild'}
        title="Rebuild Chapter Audio?"
        message="This chapter already has rendered audio. Queuing it again will overwrite the existing render. Continue?"
        confirmText="Rebuild"
        onConfirm={() => {
          if (confirmState.kind === 'rebuild') onQueueChapter(confirmState.chapter);
          setConfirmState({ kind: 'none' });
        }}
        onCancel={() => setConfirmState({ kind: 'none' })}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={confirmOpen && confirmState.kind === 'large'}
        title="Large Chapter"
        message={`This chapter has more than ${LARGE_CHAPTER_CHAR_THRESHOLD.toLocaleString()} characters and may take a long time to render. Continue?`}
        confirmText="Queue Anyway"
        onConfirm={() => {
          if (confirmState.kind === 'large') onQueueChapter(confirmState.chapter);
          setConfirmState({ kind: 'none' });
        }}
        onCancel={() => setConfirmState({ kind: 'none' })}
        isDestructive={false}
      />

      <ConfirmModal
        isOpen={confirmOpen && confirmState.kind === 'reset'}
        title="Reset Chapter Audio?"
        message="This will delete the rendered audio for this chapter. This action cannot be undone."
        confirmText="Reset Audio"
        onConfirm={() => {
          if (confirmState.kind === 'reset') onResetAudio(confirmState.chapterId);
          setConfirmState({ kind: 'none' });
        }}
        onCancel={() => setConfirmState({ kind: 'none' })}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={confirmOpen && confirmState.kind === 'delete'}
        title="Delete Chapter?"
        message="This will permanently delete the chapter and all its rendered audio. This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => {
          if (confirmState.kind === 'delete') onDeleteChapter(confirmState.chapterId);
          setConfirmState({ kind: 'none' });
        }}
        onCancel={() => setConfirmState({ kind: 'none' })}
        isDestructive={true}
      />
    </section>
  );
}
