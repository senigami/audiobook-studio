import React, { useCallback } from 'react';
import { RefreshCw, Zap, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, Copy, MoreVertical } from 'lucide-react';
import type { Chapter, Job } from '@/types';
import { PredictiveProgressBar, type PredictiveProgressBarProps } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';
import { hasSegmentProgressCapability } from '@/utils/jobSelection';
import { useSegmentHandoffQueue } from '@/hooks/useSegmentHandoffQueue';

const RECENT_DONE_WINDOW_SECONDS = 60;

const clamp01 = (val: number) => Math.max(0, Math.min(val, 1));

const getSegmentProvenanceFields = (job?: Job): Record<string, any> | null => {
  const provenance = (job as any)?.segmentProgressSocketProvenance;
  return provenance?.selectedFields ?? null;
};

export const useChapterStatus = (
  chapter: Chapter,
  job?: Job,
  generatingJob?: Job,
  queuePending: boolean = false,
  generatingSegmentIdsCount: number = 0,
  queueLocked: boolean = false,
  _activeRenderBatchIdFromPage?: string | null,
  activeRenderBatchWeight?: number | null
) => {
  const hasChapterAudio = !!(chapter.has_wav || chapter.has_mp3 || chapter.has_m4a);
  const recentlyFinishedDoneJob = !!(job?.status === 'done' && job?.finished_at && ((Date.now() / 1000) - job.finished_at) <= RECENT_DONE_WINDOW_SECONDS);
  const liveSegmentProgressIsRenderBlock = !!generatingJob && (
    !!generatingJob.active_segment_id ||
    !!generatingJob.active_render_batch_id ||
    typeof generatingJob.active_render_batch_progress === 'number'
  );
  const rawQueueStatus = queuePending
    ? 'Queued'
    : job?.status === 'queued'
      ? 'Queued'
      : job?.status === 'preparing'
        ? 'Preparing'
      : job?.status === 'running'
          ? (job.active_segment_id || job.active_render_batch_id || typeof job.active_render_batch_progress === 'number'
              ? 'Rendering'
              : 'Processing')
          : job?.status === 'finalizing'
            ? 'Finalizing'
            : generatingSegmentIdsCount > 0
              ? 'Processing'
            : chapter?.audio_status === 'processing'
              ? 'Processing'
              : recentlyFinishedDoneJob && !hasChapterAudio
                ? 'Finalizing'
                : null;
  const [heldQueueStatus, setHeldQueueStatus] = React.useState<string | null>(null);
  const releaseHoldTimerRef = React.useRef<number | null>(null);
  const lastActiveQueueStatusRef = React.useRef<string | null>(null);
  const holdUntilRef = React.useRef<number>(0);
  const queueStatus = heldQueueStatus ?? rawQueueStatus;
  const effectiveQueueLocked = queueLocked || !!queueStatus || chapter.audio_status === 'processing';
  const isQueued = queueStatus === 'Queued';

  const [heldLiveJob, setHeldLiveJob] = React.useState<Job | undefined>(undefined);
  const heldLiveJobTimerRef = React.useRef<number | null>(null);
  const terminalJobIdBridgedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (generatingJob && ['preparing', 'running', 'finalizing'].includes(generatingJob.status)) {
      if (heldLiveJobTimerRef.current !== null) {
        window.clearTimeout(heldLiveJobTimerRef.current);
        heldLiveJobTimerRef.current = null;
      }
      terminalJobIdBridgedRef.current = null;
      setHeldLiveJob(generatingJob);
    } else if (generatingJob?.status === 'done' || generatingJob?.status === 'failed' || generatingJob?.status === 'cancelled') {
      if (terminalJobIdBridgedRef.current !== generatingJob.id) {
        terminalJobIdBridgedRef.current = generatingJob.id;
        setHeldLiveJob(generatingJob);
        if (heldLiveJobTimerRef.current !== null) {
          window.clearTimeout(heldLiveJobTimerRef.current);
        }
        heldLiveJobTimerRef.current = window.setTimeout(() => {
          setHeldLiveJob(undefined);
          heldLiveJobTimerRef.current = null;
        }, 1500);
      }
    } else if (!generatingJob && heldLiveJob) {
      if (heldLiveJobTimerRef.current === null) {
        heldLiveJobTimerRef.current = window.setTimeout(() => {
          setHeldLiveJob(undefined);
          heldLiveJobTimerRef.current = null;
        }, 1500);
      }
    }
  }, [generatingJob, heldLiveJob]);

  React.useEffect(() => {
    return () => {
      if (heldLiveJobTimerRef.current !== null) {
        window.clearTimeout(heldLiveJobTimerRef.current);
      }
    };
  }, []);

  const liveSegmentProgressJobCandidate = generatingJob && !['done', 'failed', 'cancelled'].includes(generatingJob.status)
    ? generatingJob
    : (heldLiveJob && ['done', 'failed', 'cancelled'].includes(heldLiveJob.status) && !(recentlyFinishedDoneJob && !hasChapterAudio) ? heldLiveJob : undefined);

  const hasSegmentSupport = liveSegmentProgressJobCandidate
    ? hasSegmentProgressCapability(liveSegmentProgressJobCandidate)
    : false;

  const segmentProvenanceFields = getSegmentProvenanceFields(liveSegmentProgressJobCandidate);
  const directActiveSegmentId = typeof liveSegmentProgressJobCandidate?.active_segment_id === 'string' && liveSegmentProgressJobCandidate.active_segment_id.length > 0
    ? liveSegmentProgressJobCandidate.active_segment_id
    : null;
  const provenanceActiveSegmentId = typeof segmentProvenanceFields?.activeSegmentId === 'string' && segmentProvenanceFields.activeSegmentId.length > 0
    ? segmentProvenanceFields.activeSegmentId
    : null;
  const selectedActiveSegmentId = directActiveSegmentId ?? provenanceActiveSegmentId;
  const directActiveSegmentProgress = directActiveSegmentId && typeof liveSegmentProgressJobCandidate?.active_segment_progress === 'number'
    ? clamp01(liveSegmentProgressJobCandidate.active_segment_progress)
    : null;
  const provenanceActiveSegmentProgress = typeof segmentProvenanceFields?.activeSegmentProgress === 'number'
    ? clamp01(segmentProvenanceFields.activeSegmentProgress)
    : null;
  const selectedActiveSegmentProgress = directActiveSegmentProgress ?? provenanceActiveSegmentProgress;
  const hasActiveSegment = hasSegmentSupport
    && !!selectedActiveSegmentId
    && typeof selectedActiveSegmentProgress === 'number';
  const liveSegmentProgressValue = hasActiveSegment
    ? selectedActiveSegmentProgress
    : 0;
  const selectedSegmentEtaSeconds = directActiveSegmentId && typeof liveSegmentProgressJobCandidate?.active_segment_eta_seconds === 'number'
    ? liveSegmentProgressJobCandidate.active_segment_eta_seconds
    : (typeof segmentProvenanceFields?.etaSeconds === 'number' ? segmentProvenanceFields.etaSeconds : null);
  const selectedSegmentEtaBasis = directActiveSegmentId && typeof liveSegmentProgressJobCandidate?.active_segment_eta_basis === 'string'
    ? liveSegmentProgressJobCandidate.active_segment_eta_basis
    : (typeof segmentProvenanceFields?.eta_basis === 'string' ? segmentProvenanceFields.eta_basis : null);
  const selectedSegmentUpdatedAt = directActiveSegmentId && typeof liveSegmentProgressJobCandidate?.active_segment_updated_at === 'number'
    ? liveSegmentProgressJobCandidate.active_segment_updated_at
    : (typeof segmentProvenanceFields?.updatedAt === 'number' ? segmentProvenanceFields.updatedAt : null);
  const selectedSegmentStartedAt = typeof segmentProvenanceFields?.started_at === 'number'
    ? segmentProvenanceFields.started_at
    : null;
  const selectedSegmentReasonCode = typeof segmentProvenanceFields?.reasonCode === 'string'
    ? segmentProvenanceFields.reasonCode
    : liveSegmentProgressJobCandidate?.reason_code;
  const liveSegmentProgressJob = hasActiveSegment && liveSegmentProgressJobCandidate
    ? {
        ...liveSegmentProgressJobCandidate,
        active_segment_id: selectedActiveSegmentId,
        active_segment_progress: selectedActiveSegmentProgress,
        active_segment_eta_seconds: selectedSegmentEtaSeconds,
        active_segment_eta_basis: selectedSegmentEtaBasis,
        active_segment_updated_at: selectedSegmentUpdatedAt,
      } as Job
    : undefined;

  React.useEffect(() => {
    if (releaseHoldTimerRef.current !== null) {
      window.clearTimeout(releaseHoldTimerRef.current);
      releaseHoldTimerRef.current = null;
    }

    if (rawQueueStatus) {
      lastActiveQueueStatusRef.current = rawQueueStatus;
      holdUntilRef.current = Date.now() + 400;
      if (heldQueueStatus !== rawQueueStatus) {
        setHeldQueueStatus(rawQueueStatus);
      }
      return;
    }

    const shouldBridge = !hasChapterAudio
      && chapter.audio_status !== 'done'
      && holdUntilRef.current > Date.now()
      && !!lastActiveQueueStatusRef.current;

    if (shouldBridge) {
      const bridged = recentlyFinishedDoneJob ? 'Finalizing' : lastActiveQueueStatusRef.current;
      if (heldQueueStatus !== bridged) {
        setHeldQueueStatus(bridged);
      }
      const remainingMs = Math.max(0, holdUntilRef.current - Date.now());
      releaseHoldTimerRef.current = window.setTimeout(() => {
        setHeldQueueStatus(null);
        releaseHoldTimerRef.current = null;
      }, remainingMs);
      return;
    }

    if (heldQueueStatus !== null) {
      setHeldQueueStatus(null);
    }
  }, [rawQueueStatus, hasChapterAudio, chapter.audio_status, recentlyFinishedDoneJob, heldQueueStatus]);

  React.useEffect(() => () => {
    if (releaseHoldTimerRef.current !== null) {
      window.clearTimeout(releaseHoldTimerRef.current);
    }
  }, []);

  const valueSource = !liveSegmentProgressJob
    ? 'no_live_job'
    : 'active_segment_progress';

  const CHUNK_CHAR_LIMIT = 500;
  const block_char_count = activeRenderBatchWeight ?? 0;
  const progressVal = liveSegmentProgressValue;
  const coverageRatio = block_char_count > 0 ? clamp01(block_char_count / CHUNK_CHAR_LIMIT) : 1;
  const isSegmentStartAtZero = hasSegmentSupport && (
    selectedSegmentReasonCode === 'segment_start' ||
    selectedSegmentReasonCode === 'START_SEGMENT' ||
    selectedSegmentReasonCode === 'START_SYNTHESIS'
  ) && progressVal === 0;
  const evidenceWeightFraction = typeof liveSegmentProgressJob?.confidence === 'number'
    ? liveSegmentProgressJob.confidence
    : (isSegmentStartAtZero ? 1.0 : coverageRatio * clamp01(progressVal));
  const selectedEtaSource = !liveSegmentProgressJob
    ? 'none'
    : hasActiveSegment
      ? (liveSegmentProgressJob.active_segment_eta_seconds != null ? 'active_segment_eta_seconds' : 'none')
      : (liveSegmentProgressJob.eta_seconds != null ? 'eta_seconds' : 'none');
  const selectedUpdatedAtSource = !liveSegmentProgressJob
    ? 'none'
    : hasActiveSegment
      ? (liveSegmentProgressJob.active_segment_updated_at != null ? 'active_segment_updated_at' : 'none')
      : (liveSegmentProgressJob.updated_at != null ? 'updated_at' : 'none');
  const segmentProgressBarSelection = {
    dataTestId: "chapter-header-segment-progress-bar",
    barMounted: !!liveSegmentProgressJob,
    selectedJobId: liveSegmentProgressJob?.id ?? null,
    selectedJobStatus: liveSegmentProgressJob?.status ?? null,
    selectedJobProgress: liveSegmentProgressJob?.progress ?? null,
    selectedActiveSegmentId: (hasSegmentSupport && liveSegmentProgressJob?.active_segment_id) || null,
    selectedActiveSegmentProgress: (hasSegmentSupport && typeof liveSegmentProgressJob?.active_segment_progress === 'number')
      ? liveSegmentProgressJob.active_segment_progress
      : null,
    selectedEtaSeconds: (hasSegmentSupport && liveSegmentProgressJob?.active_segment_id)
      ? (selectedSegmentEtaSeconds ?? null)
      : null,
    selectedEtaBasis: (hasSegmentSupport && liveSegmentProgressJob?.active_segment_id)
      ? (selectedSegmentEtaBasis ?? (selectedSegmentEtaSeconds != null ? 'remaining_from_update' : null)) as PredictiveProgressBarProps['etaBasis'] | null
      : null,
    selectedStartedAt: selectedSegmentStartedAt,
    selectedUpdatedAt: (hasSegmentSupport && liveSegmentProgressJob?.active_segment_id)
      ? (selectedSegmentUpdatedAt ?? null)
      : null,
    liveSegmentProgressValue,
    liveSegmentProgressIsRenderBlock: false,
    activeRenderBatchId: (hasSegmentSupport && liveSegmentProgressJob?.active_segment_id) || null,
    activeRenderBatchProgress: hasSegmentSupport ? (liveSegmentProgressJob?.active_segment_progress ?? null) : null,
    renderGroupCount: hasSegmentSupport ? (liveSegmentProgressJob?.render_group_count ?? null) : null,
    valueSource,
    progressSource: valueSource,
    selectedEtaSource,
    selectedUpdatedAtSource,
    evidenceWeightFraction,
    isSegmentStartAtZero
  };
  return {
    queueStatus, heldQueueStatus, effectiveQueueLocked, isQueued,
    liveSegmentProgressJob, liveSegmentProgressValue, hasChapterAudio,
    generatingSegmentIdsCount, liveSegmentProgressIsRenderBlock,
    segmentProgressBarSelection
  };
};

export const ChapterTopBar: React.FC<{
  title?: string;
  setTitle?: (title: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSaveWav?: () => void;
  onSaveMp3?: () => void;
  exportingFormat?: 'wav' | 'mp3' | null;
}> = ({
  title, setTitle, onPrev, onNext, onSaveWav, onSaveMp3, exportingFormat
}) => {
  const [exportOpen, setExportOpen] = React.useState(false);

  return (
    <header className="chapter-header" style={{
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 0',
      background: 'var(--bg)', flexShrink: 0, width: '100%'
    }}>
      <div className="chapter-header__nav" style={{ display: 'flex', gap: '0.35rem' }}>
        <button
          onClick={onPrev}
          disabled={!onPrev}
          className="btn-ghost"
          style={{
            padding: '0.4rem',
            opacity: !onPrev ? 0.3 : 1,
            cursor: !onPrev ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px'
          }}
          title="Save & Previous Chapter"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={onNext}
          disabled={!onNext}
          className="btn-ghost"
          style={{
            padding: '0.4rem',
            opacity: !onNext ? 0.3 : 1,
            cursor: !onNext ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px'
          }}
          title="Save & Next Chapter"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="chapter-header__main" style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {typeof title === 'string' && setTitle && (
              <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-label="Chapter Title"
                  style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '0.55rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                  }}
              />
          )}
      </div>

      <div className="chapter-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {(onSaveWav || onSaveMp3) && (
              <div style={{ position: 'relative' }}>
                  <button
                      onClick={() => setExportOpen(!exportOpen)}
                      className="btn-ghost"
                      style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border)' }}
                      title="Export Audio Options"
                  >
                      {exportingFormat ? <RefreshCw size={18} className="animate-spin" /> : <MoreVertical size={18} />}
                  </button>
                  {exportOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setExportOpen(false)} />
                        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', zIndex: 100, minWidth: '160px', padding: '0.5rem' }}>
                            {onSaveWav && (
                                <button onClick={() => { setExportOpen(false); onSaveWav(); }} disabled={exportingFormat !== null} className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.85rem' }}>
                                    Export WAV
                                </button>
                            )}
                            {onSaveMp3 && (
                                <button onClick={() => { setExportOpen(false); onSaveMp3(); }} disabled={exportingFormat !== null} className="btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.85rem' }}>
                                    Export MP3
                                </button>
                            )}
                        </div>
                      </>
                  )}
              </div>
          )}
      </div>
    </header>
  );
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
        {status.hasChapterAudio && (
            <div className="chapter-header__audio" style={{ display: 'flex', alignItems: 'center' }}>
                {(() => {
                    const audioPath = chapter.audio_file_path;
                    if (!audioPath) {
                      return (
                        <audio controls key={chapter.id} style={{ height: '32px', maxWidth: '300px' }}>
                            <source src={`/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=chapter.mp3`} />
                            <source src={`/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=chapter.wav`} />
                        </audio>
                      );
                    }
                    const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
                    const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');

                    return (
                        <audio controls key={chapter.id} style={{ height: '32px', maxWidth: '300px' }}>
                            <source src={`/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${audioPath}`} />
                            {audioPath !== wavPath && <source src={`/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${wavPath}`} />}
                            {audioPath !== mp3Path && <source src={`/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${mp3Path}`} />}
                        </audio>
                    );
                })()}
            </div>
        )}

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

        {onCopyDebugState && (
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
            <div style={{
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

        {status.liveSegmentProgressJob && (
            <div style={{ width: '180px', minWidth: '180px' }}>
                {(() => {
                    // Use handoff-queue values so the bar stays mounted until visual 100%
                    // before swapping to the next segment.
                    const displayedJobId = handoff.displayedJobId || status.liveSegmentProgressJob.id;
                    const displayedSegmentId = handoff.displayedSegmentId || status.liveSegmentProgressJob.active_segment_id || 'none';
                    const displayedProgress = handoff.displayedProgress;
                    const displayedEtaSeconds = handoff.displayedEtaSeconds !== undefined
                        ? handoff.displayedEtaSeconds
                        : status.segmentProgressBarSelection.selectedEtaSeconds;
                    const displayedEtaBasis = handoff.displayedEtaBasis !== undefined
                        ? handoff.displayedEtaBasis
                        : status.segmentProgressBarSelection.selectedEtaBasis;
                    const displayedUpdatedAt = handoff.displayedUpdatedAt !== undefined
                        ? handoff.displayedUpdatedAt
                        : status.segmentProgressBarSelection.selectedUpdatedAt;

                    const progressBarConfig = buildSegmentProgressBarProps({
                        jobId: displayedJobId,
                        segmentId: displayedSegmentId,
                        progress: displayedProgress,
                        status: status.liveSegmentProgressJob.status,
                        etaSeconds: displayedEtaSeconds,
                        etaBasis: displayedEtaBasis as any,
                        updatedAt: displayedUpdatedAt,
                        state: status.liveSegmentProgressJob.status === 'preparing'
                            ? (status.segmentProgressBarSelection.isSegmentStartAtZero ? 'processing' : 'preparing')
                            : status.liveSegmentProgressJob.status === 'finalizing'
                                ? 'finalizing'
                                : status.liveSegmentProgressJob.status === 'running'
                                    ? (status.liveSegmentProgressIsRenderBlock ? 'running' : 'processing')
                                    : (status.liveSegmentProgressJob.status === 'error' ? 'failed' : status.liveSegmentProgressJob.status as any),
                        onDisplayProgress: handleDisplayProgress,
                        onDebugSnapshot: onProgressBarDebugSnapshot,
                    });
                    const { key, ...progressBarProps } = progressBarConfig;
                    return <PredictiveProgressBar key={key} {...progressBarProps} />;
                })()}
            </div>
        )}

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
                {saving ? <RefreshCw size={14} className="animate-spin" /> : (hasUnsavedChanges ? <AlertTriangle size={14} /> : <CheckCircle size={14} color="var(--success)" />)}
                {saving ? 'Saving...' : (hasUnsavedChanges ? 'Unsaved' : 'Saved')}
            </span>
        </div>
    </>
  );
};
