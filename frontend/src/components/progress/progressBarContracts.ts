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
    /**
     * When true the bar renders as preparing-indeterminate (pulse, no predictive lane)
     * regardless of status. Threaded from the overlay's indeterminate flag for mid-chapter
     * model-load frames (W-MIX-LA 004).
     */
    indeterminate?: boolean | null;
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
    indeterminate,
    onDisplayProgress,
    onDebugSnapshot,
}: SegmentProgressBarInput): PredictiveProgressBarProps & { key: string } => {
    const identity = getSegmentProgressBarKey({ jobId, segmentId });
    const segmentProgress = clamp01(progress);
    // SEGMENT_PENDING: engine not confirmed yet — keep null ETA so the bar is indeterminate.
    // Only seed the default 120s ETA when the engine has confirmed (START_SEGMENT or no code).
    const isSegmentPending = reasonCode === 'SEGMENT_PENDING';
    // isLoadWindow: suppress the 120s fallback ETA and show "Loading voice model…" label.
    // indeterminate:true from the overlay is also a load signal (W-MIX-LA 004).
    const isLoadWindow = isSegmentPending || reasonCode === 'LOADING_MODEL' || indeterminate === true;
    const seededEtaSeconds = typeof etaSeconds === 'number'
        ? etaSeconds
        : (!isLoadWindow && segmentProgress === 0 && (status === 'running' || state === 'processing') ? 120 : undefined);
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
        ...(indeterminate === true ? { indeterminate: true } : {}),
    };
};
