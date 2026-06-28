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
    // isLoadWindow: show the "Loading voice model…" label during the model-load window.
    // indeterminate:true from the overlay is also a load signal (W-MIX-LA 004).
    const isLoadWindow = isSegmentPending || reasonCode === 'LOADING_MODEL' || indeterminate === true;
    // Never fabricate an ETA. Earlier code seeded a default 120s ETA on the first
    // running-at-0% frame so the bar wouldn't sit dead — but the real engine ETA
    // arrives the very next frame, and the 120s→real collapse over the lane migration
    // produced a velocity spike that made the bar jump to ~12% instead of easing from
    // zero. With no fabricated ETA the bar simply holds at 0 (no countdown) until the
    // engine reports, then coasts from 0 at the true pace. Only use a real ETA.
    const seededEtaSeconds = typeof etaSeconds === 'number' ? etaSeconds : undefined;
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
