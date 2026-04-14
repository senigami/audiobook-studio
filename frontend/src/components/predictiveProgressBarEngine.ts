import { advancePredictiveProgress, buildPredictiveProgressModel } from '../utils/predictiveProgress';
import { clamp01, getMaxVisualStep, getRemainingTicks, getSmoothingTicks, ETA_TICK_MS } from './predictiveProgressBarHelpers';

export interface PredictiveTickDebugState {
    lastTickAt: number;
    dtSeconds: number;
    tickElapsedSeconds: number | null;
    effectiveEtaSeconds: number | null;
    smoothingTicks: number | null;
    maxVisualStep: number | null;
    targetFloor: number | null;
    nextProgress: number | null;
    correctionWeightMode?: 'default' | 'queue' | 'segment';
    model?: ReturnType<typeof buildPredictiveProgressModel>;
}

interface SharedTickArgs {
    tickNow: number;
    dt: number;
    startedAt: number;
    effectiveEtaSeconds: number;
    progress: number;
    checkpointMode: 'default' | 'queue' | 'segment';
    smoothingProgressBasis: number;
    currentEndTime: number | null;
}

export const buildPredictiveTargetModel = ({
    authoritativeProgress,
    displayedProgress,
    elapsedSeconds,
    etaSeconds,
    priorProgressBasis,
    checkpointMode,
    evidenceWeightFraction,
    preferLaunchEtaOnly,
}: {
    authoritativeProgress: number;
    displayedProgress: number;
    elapsedSeconds: number;
    etaSeconds: number;
    priorProgressBasis?: number;
    checkpointMode: 'default' | 'queue' | 'segment';
    evidenceWeightFraction: number;
    preferLaunchEtaOnly: boolean;
}) => {
    const model = buildPredictiveProgressModel({
        authoritativeProgress,
        displayedProgress,
        elapsedSeconds,
        etaSeconds,
        priorProgressBasis,
        correctionWeightMode: checkpointMode,
        evidenceWeightFraction,
        preferLaunchEtaOnly,
    });
    return {
        model,
        nextTargetEndTime: Date.now() + (model.refinedRemainingSeconds * 1000),
    };
};

export const buildPendingRunAnchorTick = ({
    tickNow,
    dt,
    startedAt,
    effectiveEtaSeconds,
    launchProgress,
    progress,
    memoryFloor,
    checkpointMode,
    authoritativeFloor,
    evidenceWeightFraction,
    preferLaunchEtaOnly,
    smoothingProgressBasis,
    currentEndTime,
    previousDisplayProgress,
}: SharedTickArgs & {
    launchProgress: number;
    memoryFloor: number;
    authoritativeFloor: boolean;
    evidenceWeightFraction: number;
    preferLaunchEtaOnly: boolean;
    previousDisplayProgress: number;
}) => {
    const nextProgress = authoritativeFloor
        ? Math.max(previousDisplayProgress, clamp01(launchProgress))
        : clamp01(launchProgress);
    const remainingTicks = getRemainingTicks(tickNow, currentEndTime);
    return {
        nextProgress,
        debugTick: {
            lastTickAt: tickNow,
            dtSeconds: dt,
            tickElapsedSeconds: Math.max(0, (tickNow / 1000) - startedAt),
            effectiveEtaSeconds,
            smoothingTicks: getSmoothingTicks({
                checkpointMode,
                authoritativeFloor,
                smoothingProgressBasis,
                remainingTicks,
            }),
            maxVisualStep: getMaxVisualStep(dt),
            targetFloor: clamp01(launchProgress),
            nextProgress,
            correctionWeightMode: checkpointMode,
            model: buildPredictiveProgressModel({
                authoritativeProgress: authoritativeFloor ? Math.max(clamp01(progress), memoryFloor) : progress,
                displayedProgress: nextProgress,
                elapsedSeconds: Math.max(0, (tickNow / 1000) - startedAt),
                etaSeconds: effectiveEtaSeconds,
                priorProgressBasis: authoritativeFloor ? Math.max(clamp01(progress), memoryFloor) : undefined,
                correctionWeightMode: checkpointMode,
                evidenceWeightFraction,
                preferLaunchEtaOnly,
            }),
        } satisfies PredictiveTickDebugState,
    };
};

export const buildAuthoritativePredictiveTick = ({
    tickNow,
    dt,
    startedAt,
    effectiveEtaSeconds,
    progress,
    checkpointMode,
    smoothingProgressBasis,
    currentEndTime,
    previousDisplayProgress,
    evidenceWeightFraction,
    preferLaunchEtaOnly,
}: SharedTickArgs & {
    previousDisplayProgress: number;
    evidenceWeightFraction: number;
    preferLaunchEtaOnly: boolean;
}) => {
    const targetFloor = clamp01(progress);
    const base = Math.max(previousDisplayProgress, targetFloor);
    const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
    const model = advancePredictiveProgress({
        authoritativeProgress: progress,
        displayedProgress: base,
        elapsedSeconds: elapsed,
        etaSeconds: effectiveEtaSeconds,
        deltaSeconds: dt,
        priorProgressBasis: base,
        correctionWeightMode: checkpointMode,
        evidenceWeightFraction,
        preferLaunchEtaOnly,
    });
    const shouldCompleteNow = (
        progress >= 0.995
        || (
            currentEndTime !== null
            && currentEndTime <= tickNow + ETA_TICK_MS
            && Math.max(targetFloor, model.nextProgress) >= 0.98
        )
    );
    const remainingTicks = getRemainingTicks(tickNow, currentEndTime);
    if (shouldCompleteNow) {
        return {
            nextProgress: 1,
            debugTick: {
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: elapsed,
                effectiveEtaSeconds,
                smoothingTicks: getSmoothingTicks({
                    checkpointMode,
                    authoritativeFloor: true,
                    smoothingProgressBasis,
                    remainingTicks,
                }),
                maxVisualStep: getMaxVisualStep(dt),
                targetFloor,
                nextProgress: 1,
                correctionWeightMode: checkpointMode,
                model,
            } satisfies PredictiveTickDebugState,
        };
    }
    const cappedNext = Math.min(model.nextProgress, base + getMaxVisualStep(dt));
    const nextProgress = clamp01(Math.max(base, cappedNext));
    return {
        nextProgress,
        debugTick: {
            lastTickAt: tickNow,
            dtSeconds: dt,
            tickElapsedSeconds: elapsed,
            effectiveEtaSeconds,
            smoothingTicks: getSmoothingTicks({
                checkpointMode,
                authoritativeFloor: true,
                smoothingProgressBasis,
                remainingTicks,
            }),
            maxVisualStep: getMaxVisualStep(dt),
            targetFloor,
            nextProgress,
            correctionWeightMode: checkpointMode,
            model,
        } satisfies PredictiveTickDebugState,
    };
};

export const buildFlexiblePredictiveTick = ({
    tickNow,
    dt,
    startedAt,
    effectiveEtaSeconds,
    progress,
    checkpointMode,
    smoothingProgressBasis,
    currentEndTime,
    previousDisplayProgress,
    allowBackwardProgress,
    preferLaunchEtaOnly,
}: SharedTickArgs & {
    previousDisplayProgress: number;
    allowBackwardProgress: boolean;
    preferLaunchEtaOnly: boolean;
}) => {
    const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
    const model = advancePredictiveProgress({
        authoritativeProgress: progress,
        displayedProgress: previousDisplayProgress,
        elapsedSeconds: elapsed,
        etaSeconds: effectiveEtaSeconds,
        deltaSeconds: dt,
        preferLaunchEtaOnly,
    });
    const remainingTicks = getRemainingTicks(tickNow, currentEndTime);
    if (
        progress >= 0.995
        || (
            currentEndTime !== null
            && currentEndTime <= tickNow + ETA_TICK_MS
            && Math.max(progress, model.nextProgress) >= 0.98
        )
    ) {
        return {
            nextProgress: 1,
            debugTick: {
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: elapsed,
                effectiveEtaSeconds,
                smoothingTicks: getSmoothingTicks({
                    checkpointMode,
                    authoritativeFloor: false,
                    smoothingProgressBasis,
                    remainingTicks,
                }),
                maxVisualStep: getMaxVisualStep(dt),
                targetFloor: Math.max(progress, model.nextProgress),
                nextProgress: 1,
                correctionWeightMode: checkpointMode,
                model,
            } satisfies PredictiveTickDebugState,
        };
    }
    const liveProgress = clamp01(progress);
    const forwardDelta = Math.max(0, liveProgress - previousDisplayProgress);
    const correctionBoost = Math.max(getMaxVisualStep(dt), forwardDelta * 0.15);
    const cappedNext = Math.min(model.nextProgress, previousDisplayProgress + correctionBoost);
    const nextProgress = allowBackwardProgress
        ? clamp01(Math.max(previousDisplayProgress, cappedNext))
        : Math.max(previousDisplayProgress, liveProgress, cappedNext);
    return {
        nextProgress,
        debugTick: {
            lastTickAt: tickNow,
            dtSeconds: dt,
            tickElapsedSeconds: elapsed,
            effectiveEtaSeconds,
            smoothingTicks: getSmoothingTicks({
                checkpointMode,
                authoritativeFloor: false,
                smoothingProgressBasis,
                remainingTicks,
            }),
            maxVisualStep: getMaxVisualStep(dt),
            targetFloor: allowBackwardProgress ? clamp01(cappedNext) : liveProgress,
            nextProgress,
            correctionWeightMode: checkpointMode,
            model,
        } satisfies PredictiveTickDebugState,
    };
};

export const nudgeCurrentEndTime = ({
    now,
    targetEndTime,
    currentEndTime,
    checkpointMode,
    authoritativeFloor,
    smoothingProgressBasis,
}: {
    now: number;
    targetEndTime: number;
    currentEndTime: number;
    checkpointMode: 'default' | 'queue' | 'segment';
    authoritativeFloor: boolean;
    smoothingProgressBasis: number;
}) => {
    const deltaMs = targetEndTime - currentEndTime;
    const remainingTicks = getRemainingTicks(now, currentEndTime);
    const smoothingTicks = getSmoothingTicks({
        checkpointMode,
        authoritativeFloor,
        smoothingProgressBasis,
        remainingTicks,
    });
    const minimumCatchupMs = Math.ceil(Math.abs(deltaMs) / smoothingTicks);
    const minimumNudgeMs = authoritativeFloor ? 60 : 150;
    const maxPerTickMs = Math.max(minimumNudgeMs, minimumCatchupMs);
    const nudgeMs = deltaMs > 0
        ? Math.min(deltaMs, maxPerTickMs)
        : Math.max(deltaMs, -maxPerTickMs);
    return currentEndTime + nudgeMs;
};
