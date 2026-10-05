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
    incomingProgress: number | null;
    effectiveTargetProgress: number | null;
    currentVisualAtUpdate: number | null;
    // ETA confidence model fields (doc 15)
    etaConfidenceW: number | null;
    etaConfidenceBase: number | null;
    etaConfidenceCv: number | null;
    etaEndSmoothed: number | null;
    slopeCappedVsRaw: number | null;
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
    incomingProgress,
    effectiveTargetProgress,
    currentVisualAtUpdate,
    etaConfidenceW,
    etaConfidenceBase,
    etaConfidenceCv,
    etaEndSmoothed,
    slopeCappedVsRaw,
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
    incomingProgress: number | null;
    effectiveTargetProgress: number| null;
    currentVisualAtUpdate: number | null;
    etaConfidenceW?: number | null;
    etaConfidenceBase?: number | null;
    etaConfidenceCv?: number | null;
    etaEndSmoothed?: number | null;
    slopeCappedVsRaw?: number | null;
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
    incomingProgress,
    effectiveTargetProgress,
    currentVisualAtUpdate,
    etaConfidenceW: etaConfidenceW ?? null,
    etaConfidenceBase: etaConfidenceBase ?? null,
    etaConfidenceCv: etaConfidenceCv ?? null,
    etaEndSmoothed: etaEndSmoothed ?? null,
    slopeCappedVsRaw: slopeCappedVsRaw ?? null,
});
