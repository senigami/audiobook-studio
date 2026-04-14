import type { PredictiveTickDebugState } from './predictiveProgressBarEngine';

export interface PredictiveProgressDebugSnapshot {
    memoryKey?: string;
    resolvedCheckpointMode: 'default' | 'queue' | 'segment';
    status?: string;
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    predictive: boolean;
    authoritativeFloor: boolean;
    tickLoopActive: boolean;
    preserveMountedProgress: boolean;
    preserveActiveVisualState: boolean;
    memoryFloor: number;
    displayProgress: number;
    localProgress: number;
    currentEndTime: number | null;
    targetEndTime: number | null;
    displayedRemaining: number | null;
    syncedDisplayedRemaining: number | null;
    remainingTicks: number | null;
    lastTickAt: number;
    dtSeconds: number;
    tickElapsedSeconds: number | null;
    effectiveEtaSeconds: number | null;
    smoothingTicks: number | null;
    maxVisualStep: number | null;
    targetFloor: number | null;
    nextProgress: number | null;
    etaProgressBasis: number | null;
    visibleProgress: number | null;
    launchEtaOnly: boolean;
    allowBackwardProgress: boolean;
    modelAuthoritativeProgress?: number | null;
    modelDisplayedProgress?: number | null;
    modelEstimatedRemainingSeconds?: number | null;
    modelActualRemainingSeconds?: number | null;
    modelRefinedRemainingSeconds?: number | null;
    modelVelocityPerSecond?: number | null;
    correctionWeightMode?: 'default' | 'queue' | 'segment';
    model?: PredictiveTickDebugState['model'];
    lastDisplayWriteSource?: string;
    lastDisplayWriteValue?: number | null;
}

export const createInitialDebugTickState = ({
    initialDisplayProgress,
    launchEtaOnly,
    allowBackwardProgress,
    resolvedCheckpointMode,
}: {
    initialDisplayProgress: number;
    launchEtaOnly: boolean;
    allowBackwardProgress: boolean;
    resolvedCheckpointMode: 'default' | 'queue' | 'segment';
}): PredictiveTickDebugState & {
    etaProgressBasis: null;
    visibleProgress: null;
    launchEtaOnly: boolean;
    allowBackwardProgress: boolean;
    modelAuthoritativeProgress: null;
    modelDisplayedProgress: null;
    modelEstimatedRemainingSeconds: null;
    modelActualRemainingSeconds: null;
    modelRefinedRemainingSeconds: null;
    modelVelocityPerSecond: null;
    lastDisplayWriteSource: 'init';
    lastDisplayWriteValue: number;
} => ({
    lastTickAt: Date.now(),
    dtSeconds: 0,
    tickElapsedSeconds: null,
    effectiveEtaSeconds: null,
    smoothingTicks: null,
    maxVisualStep: null,
    targetFloor: null,
    nextProgress: null,
    etaProgressBasis: null,
    visibleProgress: null,
    launchEtaOnly,
    allowBackwardProgress,
    modelAuthoritativeProgress: null,
    modelDisplayedProgress: null,
    modelEstimatedRemainingSeconds: null,
    modelActualRemainingSeconds: null,
    modelRefinedRemainingSeconds: null,
    modelVelocityPerSecond: null,
    correctionWeightMode: resolvedCheckpointMode,
    model: undefined,
    lastDisplayWriteSource: 'init',
    lastDisplayWriteValue: initialDisplayProgress,
});

export const buildPredictiveProgressDebugSnapshot = ({
    memoryKey,
    resolvedCheckpointMode,
    status,
    progress,
    startedAt,
    etaSeconds,
    predictive,
    authoritativeFloor,
    tickLoopActive,
    preserveMountedProgress,
    preserveActiveVisualState,
    memoryFloor,
    displayProgress,
    localProgress,
    currentEndTime,
    targetEndTime,
    displayedRemaining,
    syncedDisplayedRemaining,
    remainingTicks,
    debugTick,
    launchEtaOnly,
    allowBackwardProgress,
    lastDisplayWriteSource,
    lastDisplayWriteValue,
}: {
    memoryKey?: string;
    resolvedCheckpointMode: 'default' | 'queue' | 'segment';
    status?: string;
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    predictive: boolean;
    authoritativeFloor: boolean;
    tickLoopActive: boolean;
    preserveMountedProgress: boolean;
    preserveActiveVisualState: boolean;
    memoryFloor: number;
    displayProgress: number;
    localProgress: number;
    currentEndTime: number | null;
    targetEndTime: number | null;
    displayedRemaining: number | null;
    syncedDisplayedRemaining: number | null;
    remainingTicks: number | null;
    debugTick: PredictiveTickDebugState;
    launchEtaOnly: boolean;
    allowBackwardProgress: boolean;
    lastDisplayWriteSource?: string;
    lastDisplayWriteValue?: number | null;
}): PredictiveProgressDebugSnapshot => ({
    memoryKey,
    resolvedCheckpointMode,
    status,
    progress,
    startedAt,
    etaSeconds,
    predictive,
    authoritativeFloor,
    tickLoopActive,
    preserveMountedProgress,
    preserveActiveVisualState,
    memoryFloor,
    displayProgress,
    localProgress,
    currentEndTime,
    targetEndTime,
    displayedRemaining,
    syncedDisplayedRemaining,
    remainingTicks,
    lastTickAt: debugTick.lastTickAt,
    dtSeconds: debugTick.dtSeconds,
    tickElapsedSeconds: debugTick.tickElapsedSeconds,
    effectiveEtaSeconds: debugTick.effectiveEtaSeconds,
    smoothingTicks: debugTick.smoothingTicks,
    maxVisualStep: debugTick.maxVisualStep,
    targetFloor: debugTick.targetFloor,
    nextProgress: debugTick.nextProgress,
    etaProgressBasis: debugTick.model?.authoritativeProgress ?? null,
    visibleProgress: debugTick.model?.displayedProgress ?? null,
    launchEtaOnly,
    allowBackwardProgress,
    modelAuthoritativeProgress: debugTick.model?.authoritativeProgress ?? null,
    modelDisplayedProgress: debugTick.model?.displayedProgress ?? null,
    modelEstimatedRemainingSeconds: debugTick.model?.estimatedRemainingSeconds ?? null,
    modelActualRemainingSeconds: debugTick.model?.actualRemainingSeconds ?? null,
    modelRefinedRemainingSeconds: debugTick.model?.refinedRemainingSeconds ?? null,
    modelVelocityPerSecond: debugTick.model?.velocityPerSecond ?? null,
    correctionWeightMode: debugTick.correctionWeightMode,
    model: debugTick.model,
    lastDisplayWriteSource,
    lastDisplayWriteValue,
});
