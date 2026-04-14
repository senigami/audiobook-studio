import type React from 'react';
import { buildPredictiveProgressModel } from '../utils/predictiveProgress';

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

export const shouldPreserveMountedProgress = (
    status: string | undefined,
    startedAt?: number,
    rememberedProgress = 0,
) => {
    if (isActiveStatus(status)) return true;
    if (status !== 'preparing') return false;
    if (rememberedProgress > 0) return true;
    return typeof startedAt === 'number' && startedAt > 0;
};

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

export const getMaxVisualStep = (dtSeconds: number) => Math.max(0.006, Math.min(0.012, dtSeconds * 0.012));

export const ETA_TICK_MS = 250;
const ETA_SMOOTHING_MAX_SECONDS = 3;
const EARLY_QUEUE_ETA_SMOOTHING_MAX_SECONDS = 5;
const QUEUE_ETA_SMOOTHING_MAX_SECONDS = 4;
const ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
const EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((EARLY_QUEUE_ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
const QUEUE_ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((QUEUE_ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
export const EARLY_QUEUE_PROGRESS_THRESHOLD = 0.2;

export const getRemainingTicks = (nowMs: number, endTimeMs: number | null) =>
    endTimeMs === null
        ? 1
        : Math.max(1, Math.ceil(Math.max(0, endTimeMs - nowMs) / ETA_TICK_MS));

export const getCappedSmoothingTicks = (baseTicks: number, remainingTicks: number) =>
    Math.max(1, Math.min(baseTicks, remainingTicks));

export const getSmoothingTickBudget = ({
    checkpointMode,
    authoritativeFloor,
    smoothingProgressBasis,
    remainingTicks,
}: {
    checkpointMode: 'default' | 'queue' | 'segment';
    authoritativeFloor: boolean;
    smoothingProgressBasis: number;
    remainingTicks: number;
}) => {
    if (checkpointMode === 'segment') {
        const baseTicks = 2;
        return { baseTicks, cappedTicks: getCappedSmoothingTicks(baseTicks, remainingTicks) };
    }
    if (!authoritativeFloor) {
        const baseTicks = ETA_MAX_SMOOTHING_TICKS;
        return { baseTicks, cappedTicks: getCappedSmoothingTicks(baseTicks, remainingTicks) };
    }
    const baseTicks = smoothingProgressBasis < EARLY_QUEUE_PROGRESS_THRESHOLD
        ? EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS
        : QUEUE_ETA_MAX_SMOOTHING_TICKS;
    return { baseTicks, cappedTicks: getCappedSmoothingTicks(baseTicks, remainingTicks) };
};

export const getEffectiveEtaSeconds = (
    startedAt: number,
    fallbackEtaSeconds: number,
    nowMs: number,
    currentEndTimeMs: number | null,
) => {
    if (currentEndTimeMs === null) return fallbackEtaSeconds;
    const elapsedSeconds = Math.max(0, (nowMs / 1000) - startedAt);
    const remainingSeconds = Math.max(0, (currentEndTimeMs - nowMs) / 1000);
    return Math.max(1, elapsedSeconds + remainingSeconds);
};

export const getInitialDisplayProgress = ({
    progress,
    startedAt,
    rememberedProgress,
    status,
}: {
    progress: number;
    startedAt?: number;
    rememberedProgress: number;
    status?: string;
}) => {
    const baseProgress = clamp01(progress);
    if (status === 'finalizing') return 1;
    if (!shouldPreserveMountedProgress(status, startedAt, rememberedProgress)) return 0;
    return Math.max(baseProgress, rememberedProgress);
};

export const getProgressInfo = ({
    loadingToDynamicHandoff,
    presentationState,
    preparingIndeterminate,
    preserveMountedProgress,
    preserveActiveVisualState,
    predictive,
    startedAt,
    etaSeconds,
    allowBackwardProgress,
    memoryFloor,
    displayProgress,
    progress,
    now,
    currentEndTime,
    authoritativeFloor,
    resolvedCheckpointMode,
    evidenceWeightFraction,
    preferLaunchEtaOnly,
}: {
    loadingToDynamicHandoff: boolean;
    presentationState?: string;
    preparingIndeterminate: boolean;
    preserveMountedProgress: boolean;
    preserveActiveVisualState: boolean;
    predictive: boolean;
    startedAt?: number;
    etaSeconds?: number;
    allowBackwardProgress: boolean;
    memoryFloor: number;
    displayProgress: number;
    progress: number;
    now: number;
    currentEndTime: number | null;
    authoritativeFloor: boolean;
    resolvedCheckpointMode: 'default' | 'queue' | 'segment';
    evidenceWeightFraction: number;
    preferLaunchEtaOnly: boolean;
}) => {
    if (loadingToDynamicHandoff) {
        return { remaining: null, localProgress: 0, indeterminate: false };
    }
    if (isDoneStatus(presentationState) || isFailedStatus(presentationState)) {
        return { remaining: null, localProgress: 1, indeterminate: false };
    }
    if (isFinalizingStatus(presentationState)) {
        return { remaining: null, localProgress: 0, indeterminate: true };
    }
    if (isQueuedStatus(presentationState) || isCancelledStatus(presentationState)) {
        return { remaining: null, localProgress: 0, indeterminate: false };
    }
    if (preparingIndeterminate) {
        return { remaining: null, localProgress: 0, indeterminate: true };
    }
    if (!preserveMountedProgress && !preserveActiveVisualState) {
        return { remaining: null, localProgress: 0, indeterminate: false };
    }
    if (!predictive) {
        return {
            remaining: null,
            localProgress: Math.max(memoryFloor, clamp01(displayProgress)),
            indeterminate: false,
        };
    }
    if (!startedAt || !etaSeconds) {
        return { remaining: null, localProgress: Math.max(memoryFloor, displayProgress), indeterminate: false };
    }

    const visibleProgress = allowBackwardProgress ? clamp01(displayProgress) : Math.max(memoryFloor, clamp01(displayProgress));
    const elapsed = Math.max(0, (now / 1000) - startedAt);
    const etaProgressBasis = authoritativeFloor ? Math.max(visibleProgress, clamp01(progress)) : progress;
    const effectiveEtaSeconds = getEffectiveEtaSeconds(startedAt, etaSeconds, now, currentEndTime);
    const model = buildPredictiveProgressModel({
        authoritativeProgress: etaProgressBasis,
        displayedProgress: visibleProgress,
        elapsedSeconds: elapsed,
        etaSeconds: effectiveEtaSeconds,
        priorProgressBasis: authoritativeFloor ? etaProgressBasis : undefined,
        correctionWeightMode: resolvedCheckpointMode,
        evidenceWeightFraction,
        preferLaunchEtaOnly,
    });

    return {
        remaining: Math.max(0, Math.floor(model.refinedRemainingSeconds)),
        localProgress: visibleProgress,
        indeterminate: false,
    };
};

export const getAutoFinalizing = ({
    presentationState,
    localProgress,
    now,
    startedAt,
    etaSeconds,
    syncedDisplayedRemaining,
}: {
    presentationState?: string;
    localProgress: number;
    now: number;
    startedAt?: number;
    etaSeconds?: number;
    syncedDisplayedRemaining: number | null;
}) => {
    const launchEtaExpired = startedAt != null && etaSeconds != null
        ? (now / 1000) >= (startedAt + etaSeconds)
        : false;
    return isLiveAnimatedStatus(presentationState)
        && (localProgress >= 0.995 || launchEtaExpired || (syncedDisplayedRemaining !== null && syncedDisplayedRemaining <= 0))
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
