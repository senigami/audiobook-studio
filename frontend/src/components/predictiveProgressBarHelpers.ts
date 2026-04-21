import type React from 'react';

export type ProgressPresentationState =
    | 'default'
    | 'queued'
    | 'preparing'
    | 'running'
    | 'processing'
    | 'finalizing'
    | 'done'
    | 'failed'
    | 'cancelled';

export const isActiveStatus = (status?: string) => status === 'running' || status === 'processing' || status === 'finalizing';
export const isLiveAnimatedStatus = (status?: string) => status === 'running' || status === 'processing';
export const isPreparingStatus = (status?: string) => status === 'preparing';
export const isFinalizingStatus = (status?: string) => status === 'finalizing';
export const isQueuedStatus = (status?: string) => status === 'queued';
export const isDoneStatus = (status?: string) => status === 'done';
export const isFailedStatus = (status?: string) => status === 'failed';
export const isCancelledStatus = (status?: string) => status === 'cancelled';
export const isLoadingPresentationStatus = (status?: string) => isPreparingStatus(status) || isFinalizingStatus(status);
export const isTerminalStatus = (status?: string) =>
    isQueuedStatus(status) || isDoneStatus(status) || isFailedStatus(status) || isCancelledStatus(status);

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatStatusLabel = (status?: string) => status
    ? status
        .split('_')
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    : '';

export const ETA_TICK_MS = 250;

export const getRemainingTicks = (nowMs: number, endTimeMs: number | null) =>
    endTimeMs === null
        ? 1
        : Math.max(1, Math.ceil(Math.max(0, endTimeMs - nowMs) / ETA_TICK_MS));

export const getProgressInfo = ({
    presentationState,
    preparingIndeterminate,
    displayProgress,
}: {
    presentationState?: string;
    preparingIndeterminate: boolean;
    displayProgress: number;
}) => {
    if (isDoneStatus(presentationState) || isFailedStatus(presentationState)) {
        return { localProgress: 1, indeterminate: false };
    }
    if (isFinalizingStatus(presentationState)) {
        return { localProgress: 0, indeterminate: true };
    }
    if (isQueuedStatus(presentationState) || isCancelledStatus(presentationState)) {
        return { localProgress: 0, indeterminate: false };
    }
    if (preparingIndeterminate) {
        return { localProgress: 0, indeterminate: true };
    }

    return {
        localProgress: clamp01(displayProgress),
        indeterminate: false,
    };
};

export const getAutoFinalizing = ({
    presentationState,
    localProgress,
    now,
    estimatedEndAt,
    displayedRemaining,
}: {
    presentationState?: string;
    localProgress: number;
    now: number;
    estimatedEndAt?: number | null;
    displayedRemaining: number | null;
}) => {
    let normalizedLaunchEtaExpired = false;
    const nowSeconds = now / 1000;

    if (typeof estimatedEndAt === 'number' && estimatedEndAt > 0) {
        normalizedLaunchEtaExpired = nowSeconds >= estimatedEndAt;
    }

    return isLiveAnimatedStatus(presentationState)
        && (localProgress >= 0.995 || normalizedLaunchEtaExpired || (displayedRemaining !== null && displayedRemaining <= 0))
        && !isDoneStatus(presentationState)
        && !isFailedStatus(presentationState)
        && !isCancelledStatus(presentationState);
};

export const getBusyStatusText = (visualState: string | undefined, indeterminate: boolean) =>
    visualState === 'finalizing'
        ? 'Finalizing...'
        : indeterminate
        ? 'Working...'
        : null;

export const getTerminalStatusText = (visualState: string | undefined) =>
    isDoneStatus(visualState)
        ? 'Complete'
        : isFailedStatus(visualState)
        ? 'Error'
        : isCancelledStatus(visualState)
        ? 'Cancelled'
        : isQueuedStatus(visualState)
        ? 'Queued'
        : null;

export const getTerminalFillStyle = (visualState: string | undefined): React.CSSProperties | null =>
    isDoneStatus(visualState)
        ? {
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.82) 0%, rgba(34, 197, 94, 0.98) 100%)',
            boxShadow: '0 0 15px rgba(34, 197, 94, 0.45)',
        }
        : isFailedStatus(visualState)
        ? {
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.82) 0%, rgba(185, 28, 28, 0.98) 100%)',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.40)',
        }
        : isQueuedStatus(visualState) || isCancelledStatus(visualState)
        ? {
            background: 'rgba(148, 163, 184, 0.12)',
            boxShadow: 'none',
        }
        : null;
