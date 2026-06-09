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
    evidenceWeightFraction?: number;
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
    onDisplayProgress,
    onDebugSnapshot,
}: SegmentProgressBarInput): PredictiveProgressBarProps & { key: string } => {
    const identity = getSegmentProgressBarKey({ jobId, segmentId });
    const segmentProgress = clamp01(progress);
    const seededEtaSeconds = typeof etaSeconds === 'number'
        ? etaSeconds
        : (segmentProgress === 0 && (status === 'running' || state === 'processing') ? 120 : undefined);
    const seededEtaBasis = seededEtaSeconds != null ? (etaBasis ?? 'remaining_from_update') : undefined;
    return {
        key: identity,
        dataTestId,
        progress: segmentProgress,
        persistenceKey: identity,
        status,
        state,
        label,
        predictive: false,
        allowBackwardProgress: false,
        checkpointMode: 'segment',
        transitionTickCount: 3,
        backwardTransitionTickCount: 2,
        tickMs: 250,
        showEta: true,
        etaSeconds: seededEtaSeconds,
        etaBasis: seededEtaBasis,
        updatedAt: updatedAt ?? undefined,
        evidenceWeightFraction: 1,
        onDisplayProgress,
        onDebugSnapshot,
    };
};
