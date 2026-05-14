export interface ProgressLane {
    startedAtMs: number;
    startProgress: number;
    endAtMs: number | null;
}

export interface PredictiveProgressDebugSnapshot {
    memoryKey?: string;
    resolvedCheckpointMode: 'default' | 'queue' | 'segment';
    status?: string;
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    predictive: boolean;
    tickLoopActive: boolean;
    preserveMountedProgress: boolean;
    preserveActiveVisualState: boolean;
    memoryFloor: number;
    displayProgress: number;
    localProgress: number;
    currentLane: ProgressLane | null;
    desiredLane: ProgressLane | null;
    migrationProgress: number | null;
    displayedRemaining: number | null;
    remainingTicks: number | null;
    launchEtaOnly: boolean;
    allowBackwardProgress: boolean;
    lastDisplayWriteSource?: string;
    lastDisplayWriteValue?: number | null;
    transitionTickCount: number;
    backwardTransitionTickCount: number;
    activeTransitionTickCount: number | null;
    isBackwardMigration: boolean;
    tickMs: number;
    migrationDurationMs: number | null;
    migrationElapsedMs: number | null;
    migrationTicksTotal: number | null;
    migrationTicksElapsed: number | null;
    evidenceWeightFraction: number | null;
    incomingProgress: number | null;
    effectiveTargetProgress: number | null;
    currentVisualAtUpdate: number | null;
}

export const buildPredictiveProgressDebugSnapshot = ({
    memoryKey,
    resolvedCheckpointMode,
    status,
    progress,
    startedAt,
    etaSeconds,
    predictive,
    tickLoopActive,
    preserveMountedProgress,
    preserveActiveVisualState,
    memoryFloor,
    displayProgress,
    localProgress,
    currentLane,
    desiredLane,
    migrationProgress,
    displayedRemaining,
    remainingTicks,
    launchEtaOnly,
    allowBackwardProgress,
    lastDisplayWriteSource,
    lastDisplayWriteValue,
    transitionTickCount,
    backwardTransitionTickCount,
    activeTransitionTickCount,
    isBackwardMigration,
    tickMs,
    migrationDurationMs,
    migrationElapsedMs,
    migrationTicksTotal,
    migrationTicksElapsed,
    evidenceWeightFraction,
    incomingProgress,
    effectiveTargetProgress,
    currentVisualAtUpdate,
}: {
    memoryKey?: string;
    resolvedCheckpointMode: 'default' | 'queue' | 'segment';
    status?: string;
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    predictive: boolean;
    tickLoopActive: boolean;
    preserveMountedProgress: boolean;
    preserveActiveVisualState: boolean;
    memoryFloor: number;
    displayProgress: number;
    localProgress: number;
    currentLane: ProgressLane | null;
    desiredLane: ProgressLane | null;
    migrationProgress: number | null;
    displayedRemaining: number | null;
    remainingTicks: number | null;
    launchEtaOnly: boolean;
    allowBackwardProgress: boolean;
    lastDisplayWriteSource?: string;
    lastDisplayWriteValue?: number | null;
    transitionTickCount: number;
    backwardTransitionTickCount: number;
    activeTransitionTickCount: number | null;
    isBackwardMigration: boolean;
    tickMs: number;
    migrationDurationMs: number | null;
    migrationElapsedMs: number | null;
    migrationTicksTotal: number | null;
    migrationTicksElapsed: number | null;
    evidenceWeightFraction: number | null;
    incomingProgress: number | null;
    effectiveTargetProgress: number| null;
    currentVisualAtUpdate: number | null;
}): PredictiveProgressDebugSnapshot => ({
    memoryKey,
    resolvedCheckpointMode,
    status,
    progress,
    startedAt,
    etaSeconds,
    predictive,
    tickLoopActive,
    preserveMountedProgress,
    preserveActiveVisualState,
    memoryFloor,
    displayProgress,
    localProgress,
    currentLane,
    desiredLane,
    migrationProgress,
    displayedRemaining,
    remainingTicks,
    launchEtaOnly,
    allowBackwardProgress,
    lastDisplayWriteSource,
    lastDisplayWriteValue,
    transitionTickCount,
    backwardTransitionTickCount,
    activeTransitionTickCount,
    isBackwardMigration,
    tickMs,
    migrationDurationMs,
    migrationElapsedMs,
    migrationTicksTotal,
    migrationTicksElapsed,
    evidenceWeightFraction,
    incomingProgress,
    effectiveTargetProgress,
    currentVisualAtUpdate,
});
