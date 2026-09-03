import React from 'react';
import type { Chapter, Job } from '@/types';
import { type PredictiveProgressBarProps } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { selectSegmentProgressFields } from '@/utils/segmentProgressSelection';
import { useQueueStatusHoldTimer } from '@/hooks/useQueueStatusHoldTimer';

const RECENT_DONE_WINDOW_SECONDS = 60;

const clamp01 = (val: number) => Math.max(0, Math.min(val, 1));

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
  const { heldQueueStatus } = useQueueStatusHoldTimer({
    rawQueueStatus,
    hasChapterAudio,
    audioStatus: chapter.audio_status,
    recentlyFinishedDoneJob,
  });
  const queueStatus = heldQueueStatus ?? rawQueueStatus;
  const effectiveQueueLocked = queueLocked || !!queueStatus || chapter.audio_status === 'processing';
  const isQueued = queueStatus === 'Queued';

  const [heldLiveJob, setHeldLiveJob] = React.useState<Job | undefined>(undefined);
  const heldLiveJobTimerRef = React.useRef<number | null>(null);
  const terminalJobIdBridgedRef = React.useRef<string | null>(null);
  // Remembers the last job that had a non-null active_segment_id so we can
  // patch those fields onto the terminal bridged job (which has null active_segment_id)
  // to keep hasActiveSegment=true and the bar mounted during the handoff hold.
  const lastSegmentActiveJobRef = React.useRef<Job | undefined>(undefined);

  React.useEffect(() => {
    if (generatingJob && ['preparing', 'running', 'finalizing'].includes(generatingJob.status)) {
      if (heldLiveJobTimerRef.current !== null) {
        window.clearTimeout(heldLiveJobTimerRef.current);
        heldLiveJobTimerRef.current = null;
      }
      terminalJobIdBridgedRef.current = null;
      // Track last job with a live active segment.
      if (generatingJob.active_segment_id) {
        lastSegmentActiveJobRef.current = generatingJob;
      }
      setHeldLiveJob(generatingJob);
    } else if (generatingJob?.status === 'done' || generatingJob?.status === 'failed' || generatingJob?.status === 'cancelled') {
      if (terminalJobIdBridgedRef.current !== generatingJob.id) {
        terminalJobIdBridgedRef.current = generatingJob.id;
        // If the terminal job has no active_segment_id (common for done jobs), patch in
        // the last known segment fields so the bar stays mounted during the handoff hold.
        const lastSeg = lastSegmentActiveJobRef.current;
        const bridged: Job = (lastSeg && !generatingJob.active_segment_id)
          ? {
              ...generatingJob,
              active_segment_id: lastSeg.active_segment_id,
              active_segment_progress: 1,
              active_segment_eta_seconds: null,
              active_segment_eta_basis: lastSeg.active_segment_eta_basis,
              active_segment_updated_at: lastSeg.active_segment_updated_at,
            }
          : generatingJob;
        setHeldLiveJob(bridged);
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

  const {
    hasSegmentSupport,
    hasActiveSegment,
    liveSegmentProgressValue,
    selectedSegmentEtaSeconds,
    selectedSegmentEtaBasis,
    selectedSegmentUpdatedAt,
    selectedSegmentStartedAt,
    selectedSegmentReasonCode,
    liveSegmentProgressJob,
  } = selectSegmentProgressFields(liveSegmentProgressJobCandidate);

  const valueSource = !liveSegmentProgressJob
    ? 'no_live_job'
    : 'active_segment_progress';

  const CHUNK_CHAR_LIMIT = 500;
  const block_char_count = activeRenderBatchWeight ?? 0;
  const progressVal = liveSegmentProgressValue;
  const coverageRatio = block_char_count > 0 ? clamp01(block_char_count / CHUNK_CHAR_LIMIT) : 1;
  const evidenceWeightFraction = typeof liveSegmentProgressJob?.confidence === 'number'
    ? liveSegmentProgressJob.confidence
    : coverageRatio * clamp01(progressVal);
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
  };
  return {
    queueStatus, heldQueueStatus, effectiveQueueLocked, isQueued,
    liveSegmentProgressJob, liveSegmentProgressValue, hasChapterAudio,
    generatingSegmentIdsCount, liveSegmentProgressIsRenderBlock,
    segmentProgressBarSelection, selectedSegmentReasonCode
  };
};
