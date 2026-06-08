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
    onDisplayProgress,
    onDebugSnapshot,
}: SegmentProgressBarInput): PredictiveProgressBarProps & { key: string } => {
    const identity = getSegmentProgressBarKey({ jobId, segmentId });
    return {
        key: identity,
        dataTestId,
        progress: clamp01(progress),
        persistenceKey: identity,
        status,
        state,
        label,
        predictive: false,
        allowBackwardProgress: true,
        checkpointMode: 'segment',
        transitionTickCount: 3,
        backwardTransitionTickCount: 2,
        tickMs: 250,
        showEta: false,
        evidenceWeightFraction: 1,
        onDisplayProgress,
        onDebugSnapshot,
    };
};
