import React, { useCallback } from 'react';
import { RefreshCw, Zap, CheckCircle, Pencil, Copy, Play, Pause } from 'lucide-react';
import { usePlayerBus, loadAndPlay, play, pause } from '@/store/playerBus';
import type { Chapter } from '@/types';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';
import { useSegmentHandoffQueue, recordExternalHandoffEvent } from '@/hooks/useSegmentHandoffQueue';
import { useDevMode } from '@/utils/devMode';
import { useChapterStatus } from '@/pages/ChapterEditor/components/useChapterStatus';

/** Tiny helper that records bar mount/unmount transitions into the handoff debug ring. */
const BarMountInstrumentation: React.FC<{
  mounted: boolean;
  hasLiveJob: boolean;
  hasPending: boolean;
  displayedSegmentId: string;
}> = ({ mounted, hasLiveJob, hasPending, displayedSegmentId }) => {
  const prevRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    if (prevRef.current !== null && prevRef.current !== mounted) {
      recordExternalHandoffEvent(mounted ? 'bar_mounted' : 'bar_unmounted', {
        hasLiveJob,
        hasPending,
        displayed: displayedSegmentId,
      });
    }
    prevRef.current = mounted;
  }, [mounted, hasLiveJob, hasPending, displayedSegmentId]);
  return null;
};

export const ChapterScriptToolbar: React.FC<{
  chapter: Chapter;
  saving: boolean;
  hasUnsavedChanges: boolean;
  submitting: boolean;
  queueLabel?: string;
  queueTitle?: string;
  onQueue: () => void;
  onStopAll: () => void;
  onCopyDebugState?: () => void;
  onCommitSourceText?: () => void;
  canCommitSourceText?: boolean;
  onSegmentDisplayProgress?: (progress: number) => void;
  onProgressBarDebugSnapshot?: (snapshot: any) => void;
  status: ReturnType<typeof useChapterStatus>;
  /** Optional: lifted handoff queue state from the page so one instance drives both
   *  the header bar AND the script text highlight.  When absent the toolbar creates
   *  its own internal instance (used by existing tests). */
  handoffState?: ReturnType<typeof useSegmentHandoffQueue>;
}> = ({
  chapter, saving, hasUnsavedChanges, submitting, queueLabel = 'Queue', queueTitle = 'Queue Chapter',
  onQueue, onStopAll, onCopyDebugState, onCommitSourceText, canCommitSourceText, onSegmentDisplayProgress,
  onProgressBarDebugSnapshot, status, handoffState
}) => {
  const devMode = useDevMode();
  const playerBus = usePlayerBus();
  // Segment handoff queue: defer the bar swap until the outgoing bar visually reaches 100%.
  // When the page lifts the hook (handoffState provided), use that instance so the script
  // view's active-segment highlight shares the same display state. The internal hook must
  // still be called unconditionally (rules of hooks), so it gets an inert sentinel input
  // in that case — keeping it a no-op with no pending state or safety timers.
  const liveJob = status.liveSegmentProgressJob;
  const internalHandoff = useSegmentHandoffQueue(handoffState
    ? { jobId: '', segmentId: 'none', progress: 0 }
    : {
      jobId: liveJob?.id ?? '',
      segmentId: liveJob?.active_segment_id ?? 'none',
      progress: status.liveSegmentProgressValue,
      status: liveJob?.status,
      etaSeconds: status.segmentProgressBarSelection.selectedEtaSeconds,
      etaBasis: status.segmentProgressBarSelection.selectedEtaBasis,
      updatedAt: status.segmentProgressBarSelection.selectedUpdatedAt,
    });
  const handoff = handoffState ?? internalHandoff;

  // Forward display progress to both the caller and the handoff queue.
  // The handoff queue's notifyDisplayProgress internally detects visual completion
  // (≥99.9%) and fires onVisualComplete when appropriate.
  const handleDisplayProgress = useCallback((progress: number) => {
    onSegmentDisplayProgress?.(progress);
    handoff.notifyDisplayProgress(progress);
  }, [onSegmentDisplayProgress, handoff]);

  return (
    <>
        {status.hasChapterAudio && (() => {
            const audioPath = chapter.audio_file_path || 'chapter.wav';
            const audioUrl = `/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${encodeURIComponent(audioPath)}`;
            const isCurrentChapterAudio = playerBus.scope === 'chapter' && playerBus.audioUrl === audioUrl;
            const isChapterPlaying = isCurrentChapterAudio && playerBus.playing;

            return (
                <div className="chapter-header__audio" style={{ display: 'flex', alignItems: 'center' }}>
                    <button
                        onClick={() => {
                            if (isCurrentChapterAudio) {
                                if (isChapterPlaying) {
                                    pause();
                                } else {
                                    play();
                                }
                            } else {
                                loadAndPlay({
                                    scope: 'chapter',
                                    title: chapter.title || 'Chapter Audio',
                                    subtitle: 'Preview',
                                    audioUrl,
                                });
                            }
                        }}
                        className="btn-ghost"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem',
                        }}
                        title={isChapterPlaying ? 'Pause Chapter Audio' : 'Play Chapter Audio'}
                    >
                        {isChapterPlaying ? <Pause size={14} /> : <Play size={14} />}
                        {isChapterPlaying ? 'Pause' : 'Play Audio'}
                    </button>
                </div>
            );
        })()}

        <button
            onClick={onQueue}
            disabled={status.effectiveQueueLocked}
            className="btn-primary"
            style={{
                padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                opacity: status.effectiveQueueLocked ? 0.3 : 1,
                cursor: status.effectiveQueueLocked ? 'not-allowed' : 'pointer'
            }}
            title={status.effectiveQueueLocked ? "Already processing" : queueTitle}
        >
            {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
            {queueLabel}
        </button>

        {canCommitSourceText && onCommitSourceText && (
            <button
                onClick={onCommitSourceText}
                className="btn-primary"
                style={{
                    padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                    background: 'var(--success)', border: '1px solid var(--success-muted)'
                }}
                title="Commit Source Text changes and resync segments"
            >
                <CheckCircle size={14} />
                Commit Changes
            </button>
        )}

        {onCopyDebugState && devMode && (
            <button
                onClick={onCopyDebugState}
                className="btn-ghost"
                style={{
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px'
                }}
                title="Copy debug state"
            >
                <Copy size={14} />
                Debug
            </button>
        )}

        {!status.liveSegmentProgressJob && status.queueStatus && (
            // Before any segment has an active_segment_id (real cold start / model
            // load), the animated PredictiveProgressBar below never mounts — this
            // static pill is the only load-window indicator, so it must pulse
            // (shared .is-running/calm-pulse class) rather than sit frozen.
            // Queued (nothing active yet) stays still on purpose.
            <div
                className={status.queueStatus === 'Preparing' ? 'is-running' : undefined}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '999px',
                    background: status.isQueued ? 'var(--accent)' : 'var(--accent-tint)',
                    color: status.isQueued ? 'white' : 'var(--accent)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    border: '1px solid var(--accent)',
                    boxShadow: status.isQueued ? '0 0 0 1px var(--accent-glow)' : 'none'
                }}>
                {status.queueStatus}
            </div>
        )}

        {(() => {
            // H4 (spec §7): bar must stay mounted through the handoff COMPLETING/HOLD phase
            // even after liveSegmentProgressJob goes undefined at end-of-chapter.
            const barMountGate = !!(
                status.liveSegmentProgressJob ||
                handoff.hasPending ||
                handoff.displayedSegmentId !== 'none'
            );

            // Guard: don't mount an empty bar in idle (no job, no pending, sentinel displayed).
            if (!barMountGate) return null;

            return (
                <div style={{ width: '180px', minWidth: '180px' }}>
                    {(() => {
                        // Null-safe props: handoff values take priority; fall back to live job when present.
                        const displayedJobId = handoff.displayedJobId || status.liveSegmentProgressJob?.id || '';
                        const displayedSegmentId = handoff.displayedSegmentId !== 'none'
                            ? handoff.displayedSegmentId
                            : (status.liveSegmentProgressJob?.active_segment_id || 'none');
                        // When the handoff is still showing the sentinel (hasn't processed the new segment yet),
                        // prefer the live job's progress so the bar doesn't flash 0% before the handoff flushes.
                        const displayedProgress = (handoff.displayedSegmentId !== 'none' || !status.liveSegmentProgressJob)
                            ? handoff.displayedProgress
                            : status.liveSegmentProgressValue;
                        // Treat null the same as undefined for ETA/basis/updatedAt: a null
                        // handoff value means the handoff is in a sentinel/transition state
                        // (displayedEtaSeconds not yet populated from the incoming segment).
                        // Fall through to the live selection so the bar receives the correct
                        // segment-scoped ETA on the very first render rather than seeding the
                        // 120s fallback and blending to the wrong value.
                        const displayedEtaSeconds = (handoff.displayedEtaSeconds !== undefined && handoff.displayedEtaSeconds !== null)
                            ? handoff.displayedEtaSeconds
                            : status.segmentProgressBarSelection.selectedEtaSeconds;
                        const displayedEtaBasis = (handoff.displayedEtaBasis !== undefined && handoff.displayedEtaBasis !== null)
                            ? handoff.displayedEtaBasis
                            : status.segmentProgressBarSelection.selectedEtaBasis;
                        const displayedUpdatedAt = (handoff.displayedUpdatedAt !== undefined && handoff.displayedUpdatedAt !== null)
                            ? handoff.displayedUpdatedAt
                            : status.segmentProgressBarSelection.selectedUpdatedAt;

                        // When mounted purely via handoff (no live job), use 'running' so the
                        // predictive lane keeps animating and firing onDisplayProgress feedback.
                        const liveJobStatus = status.liveSegmentProgressJob?.status ?? 'running';
                        const progressBarConfig = buildSegmentProgressBarProps({
                            jobId: displayedJobId,
                            segmentId: displayedSegmentId,
                            progress: displayedProgress,
                            status: liveJobStatus,
                            etaSeconds: displayedEtaSeconds,
                            etaBasis: displayedEtaBasis as any,
                            updatedAt: displayedUpdatedAt,
                            reasonCode: status.selectedSegmentReasonCode,
                            indeterminate: status.liveSegmentProgressJob?.indeterminate ?? null,
                            // Non-load-window state is purely job-status-driven. The
                            // SEGMENT_PENDING/indeterminate load window forces 'preparing'
                            // inside buildSegmentProgressBarProps (the explicit-trigger model),
                            // so zero progress is never used to infer the bar's phase here.
                            state: liveJobStatus === 'preparing'
                                ? 'preparing'
                                : liveJobStatus === 'finalizing'
                                    ? 'finalizing'
                                    : liveJobStatus === 'running'
                                        ? (status.liveSegmentProgressIsRenderBlock ? 'running' : 'processing')
                                        : (liveJobStatus === 'error' ? 'failed' : liveJobStatus as any),
                            onDisplayProgress: handleDisplayProgress,
                            onDebugSnapshot: onProgressBarDebugSnapshot,
                        });
                        const { key, ...progressBarProps } = progressBarConfig;
                        return <PredictiveProgressBar key={key} {...progressBarProps} />;
                    })()}
                </div>
            );
        })()}

        <BarMountInstrumentation
            mounted={!!(status.liveSegmentProgressJob || handoff.hasPending || handoff.displayedSegmentId !== 'none')}
            hasLiveJob={!!status.liveSegmentProgressJob}
            hasPending={handoff.hasPending}
            displayedSegmentId={handoff.displayedSegmentId}
        />

        {(status.generatingSegmentIdsCount > 0 || chapter?.audio_status === 'processing') && (
            <button
                onClick={onStopAll}
                className="btn-ghost"
                style={{
                    padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: 'var(--error)',
                    border: '1px solid var(--error-muted)', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}
            >
                Stop All
            </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-light)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.8rem', color: saving ? 'var(--warning)' : (hasUnsavedChanges ? 'var(--accent)' : 'var(--success-text)'), display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {saving ? <RefreshCw size={14} className="animate-spin" /> : (hasUnsavedChanges ? <Pencil size={14} /> : <CheckCircle size={14} color="var(--success)" />)}
                {saving ? 'Saving...' : (hasUnsavedChanges ? 'Unsaved' : 'Saved')}
            </span>
        </div>
    </>
  );
};
