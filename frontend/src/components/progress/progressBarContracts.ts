import type { PredictiveProgressBarProps } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { clamp01 } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';

export type SegmentProgressBarInput = {
    jobId: string;
    segmentId: string;
    progress: number;
    status?: string;
    state?: PredictiveProgressBarProps['state'];
    label?: string;
    dataTestId?: string;
    etaSeconds?: number | null;
    etaBasis?: PredictiveProgressBarProps['etaBasis'] | null;
    updatedAt?: number | null;
    /** reasonCode from the live event — used to suppress default ETA seeding for SEGMENT_PENDING. */
    reasonCode?: string | null;
    onDisplayProgress?: PredictiveProgressBarProps['onDisplayProgress'];
    onDebugSnapshot?: PredictiveProgressBarProps['onDebugSnapshot'];
};

export const getSegmentProgressBarKey = ({ jobId, segmentId }: Pick<SegmentProgressBarInput, 'jobId' | 'segmentId'>) =>
    `${jobId}:${segmentId}`;

export const buildSegmentProgressBarProps = ({
    jobId,
    segmentId,
    progress,
    status,
    state,
    label = 'Segment Progress',
    dataTestId = 'chapter-header-segment-progress-bar',
    etaSeconds,
    etaBasis,
    updatedAt,
    reasonCode,
    onDisplayProgress,
    onDebugSnapshot,
}: SegmentProgressBarInput): PredictiveProgressBarProps & { key: string } => {
    const identity = getSegmentProgressBarKey({ jobId, segmentId });
    const segmentProgress = clamp01(progress);
    // SEGMENT_PENDING: engine not confirmed yet — keep null ETA so the bar is indeterminate.
    // Only seed the default 120s ETA when the engine has confirmed (START_SEGMENT or no code).
    const isSegmentPending = reasonCode === 'SEGMENT_PENDING';
    const isLoadWindow = isSegmentPending || reasonCode === 'LOADING_MODEL';
    const seededEtaSeconds = typeof etaSeconds === 'number'
        ? etaSeconds
        : (!isSegmentPending && segmentProgress === 0 && (status === 'running' || state === 'processing') ? 120 : undefined);
    const seededEtaBasis = seededEtaSeconds != null ? (etaBasis ?? 'remaining_from_update') : undefined;
    return {
        key: identity,
        dataTestId,
        progress: segmentProgress,
        persistenceKey: identity,
        status,
        state,
        label,
        predictive: true,
        allowBackwardProgress: false,
        checkpointMode: 'segment',
        transitionTickCount: 3,
        backwardTransitionTickCount: 2,
        tickMs: 250,
        showEta: true,
        etaSeconds: seededEtaSeconds,
        etaBasis: seededEtaBasis,
        updatedAt: updatedAt ?? undefined,
        onDisplayProgress,
        onDebugSnapshot,
        ...(isLoadWindow ? { busyLabel: 'Preparing… / Loading voice model…' } : {}),
    };
};
