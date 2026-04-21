import React, { useState, useEffect, useRef } from 'react';
import {
    clamp01,
    formatStatusLabel,
    formatTime,
    getBusyStatusText,
    getProgressInfo,
    getRemainingTicks,
    getTerminalFillStyle,
    getTerminalStatusText,
    isActiveStatus,
    isLiveAnimatedStatus,
    isPreparingStatus,
    isTerminalStatus,
    isDoneStatus,
    isFailedStatus,
    isQueuedStatus,
    isCancelledStatus,
    type ProgressPresentationState,
} from './predictiveProgressBarHelpers';
import {
    buildPredictiveProgressDebugSnapshot,
    type PredictiveProgressDebugSnapshot,
} from './predictiveProgressBarDebug';

export type { PredictiveProgressDebugSnapshot } from './predictiveProgressBarDebug';

interface PredictiveProgressBarProps {
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    updatedAt?: number;
    persistenceKey?: string;
    label?: string;
    showEta?: boolean;
    showPercent?: boolean;
    showLabel?: boolean;
    barOnly?: boolean;
    status?: string;
    etaBasis?: 'remaining_from_update' | 'total_from_start';
    estimatedEndAt?: number;
    predictive?: boolean;
    /** @deprecated Use allowBackwardProgress instead */
    authoritativeFloor?: boolean;
    /** Explicitly allow the bar to move backward on updates. Default is derived from authoritativeFloor (false). */
    allowBackwardProgress?: boolean;
    transitionTickCount?: number;
    backwardTransitionTickCount?: number;
    tickMs?: number;
    checkpointMode?: 'default' | 'queue' | 'segment';
    evidenceWeightFraction?: number;
    state?: ProgressPresentationState;
    onDebugSnapshot?: (snapshot: PredictiveProgressDebugSnapshot) => void;
}

const progressMemory = new Map<string, number>();

export const resetPredictiveProgressMemory = (persistenceKey?: string) => {
    if (!persistenceKey) {
        progressMemory.clear();
        return;
    }
    for (const key of Array.from(progressMemory.keys())) {
        if (key.startsWith(`${persistenceKey}:`)) {
            progressMemory.delete(key);
        }
    }
};

const getProgressMemoryKey = (persistenceKey?: string, startedAt?: number) =>
    persistenceKey ? `${persistenceKey}:${startedAt ?? 0}` : undefined;
const getRememberedProgress = (memoryKey?: string) =>
    memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;

type ProgressLane = {
    startedAtMs: number;
    startProgress: number;
    endAtMs: number | null;
};

type LaneMigration = {
    startedAtMs: number;
    durationMs: number;
    fromLane: ProgressLane;
    toLane: ProgressLane;
};

const resolveEndAtMs = ({
    nowMs,
    startedAt,
    etaSeconds,
    etaBasis,
    estimatedEndAt,
    updatedAt,
}: {
    nowMs: number;
    startedAt?: number;
    etaSeconds?: number;
    etaBasis?: 'remaining_from_update' | 'total_from_start';
    estimatedEndAt?: number;
    updatedAt?: number;
}) => {
    if (typeof estimatedEndAt === 'number' && estimatedEndAt > 0) {
        return estimatedEndAt * 1000;
    }

    if (typeof etaSeconds !== 'number' || etaSeconds < 0) {
        return null;
    }

    if (etaBasis === 'remaining_from_update') {
        const anchorSeconds = updatedAt ?? (nowMs / 1000);
        return (anchorSeconds + etaSeconds) * 1000;
    }
    
    if (typeof startedAt === 'number' && startedAt > 0) {
        return (startedAt + etaSeconds) * 1000;
    }

    return nowMs + (etaSeconds * 1000);
};

const getLaneProgress = (lane: ProgressLane, nowMs: number) => {
    if (lane.endAtMs === null) return lane.startProgress;
    const duration = lane.endAtMs - lane.startedAtMs;
    if (duration <= 0) return 0.995;
    const t = Math.max(0, Math.min(1, (nowMs - lane.startedAtMs) / duration));
    return lane.startProgress + ((0.995 - lane.startProgress) * t);
};

const getRenderedProgress = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number, fallback: number) => {
    if (!currentLane) return fallback;
    if (!migration) return getLaneProgress(currentLane, nowMs);
    const oldValue = getLaneProgress(migration.fromLane, nowMs);
    const desiredValue = getLaneProgress(migration.toLane, nowMs);
    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return oldValue + ((desiredValue - oldValue) * t);
};

export const PredictiveProgressBar: React.FC<PredictiveProgressBarProps> = ({
    progress,
    startedAt,
    etaSeconds,
    persistenceKey,
    label = "Progress",
    showEta = true,
    showPercent = true,
    showLabel = true,
    barOnly = false,
    status,
    etaBasis = 'total_from_start',
    estimatedEndAt,
    updatedAt,
    predictive = true,
    authoritativeFloor = false,
    allowBackwardProgress,
    transitionTickCount = 8,
    backwardTransitionTickCount = 2,
    tickMs = 250,
    checkpointMode,
    evidenceWeightFraction, // No-op for compatibility
    state,
    onDebugSnapshot,
}) => {
    const presentationState = state ?? status;
    const effectiveAllowBackward = allowBackwardProgress ?? !authoritativeFloor;
    const memoryKey = getProgressMemoryKey(persistenceKey, startedAt);
    const preparingIndeterminate = isPreparingStatus(presentationState);
    const [now, setNow] = useState(Date.now());
    const [currentLane, setCurrentLane] = useState<ProgressLane | null>(null);
    const [migration, setMigration] = useState<LaneMigration | null>(null);
    const [displayProgress, setDisplayProgress] = useState(clamp01(progress));

    const currentLaneRef = useRef<ProgressLane | null>(null);
    const prevPresentationStateRef = useRef<string | null>(presentationState);
    const migrationRef = useRef<LaneMigration | null>(null);
    const displayProgressRef = useRef<number>(displayProgress);

    const lastDisplayWriteRef = useRef<{ source: string; value: number | null }>({
        source: 'init',
        value: clamp01(progress),
    });

    const isPhaseHandoff = isPreparingStatus(prevPresentationStateRef.current ?? undefined) && !isPreparingStatus(presentationState);

    const lastUpdateMetadataRef = useRef<{
        incomingProgress: number | null;
        effectiveTargetProgress: number | null;
        evidenceWeightFraction: number | null;
        currentVisualAtUpdate: number | null;
    }>({
        incomingProgress: null,
        effectiveTargetProgress: null,
        evidenceWeightFraction: null,
        currentVisualAtUpdate: null,
    });

    const updateLaneToTarget = (source: string, nextEndAtMs: number | null, nextProgress: number, instant = false) => {
        const nowMs = Date.now();
        const currentVisual = getRenderedProgress(currentLaneRef.current, migrationRef.current, nowMs, displayProgressRef.current);
        const activeCurrentEndAtMs = migrationRef.current?.toLane.endAtMs ?? currentLaneRef.current?.endAtMs ?? null;

        const incomingProgress = clamp01(nextProgress);

        if (instant) {
            const snapLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: incomingProgress,
                endAtMs: nextEndAtMs,
            };
            currentLaneRef.current = snapLane;
            setCurrentLane(snapLane);
            setMigration(null);
            migrationRef.current = null;
            displayProgressRef.current = incomingProgress;
            setDisplayProgress(incomingProgress);

            lastUpdateMetadataRef.current = {
                incomingProgress,
                effectiveTargetProgress: incomingProgress,
                evidenceWeightFraction: 1,
                currentVisualAtUpdate: currentVisual
            };
            return;
        }

        const confidence = clamp01(evidenceWeightFraction ?? 1);
        const weightedTargetProgress = currentVisual + ((incomingProgress - currentVisual) * confidence);

        let targetProgress = weightedTargetProgress;
        if (!effectiveAllowBackward) {
            targetProgress = Math.max(currentVisual, getRememberedProgress(memoryKey), weightedTargetProgress);
        }

        const isBackwardMigration = effectiveAllowBackward && targetProgress < currentVisual - 0.001;
        const activeTransitionTickCount = isBackwardMigration ? backwardTransitionTickCount : transitionTickCount;

        if (!currentLaneRef.current) {
            // Initial mount
            const desiredLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: targetProgress,
                endAtMs: nextEndAtMs,
            };
            currentLaneRef.current = desiredLane;
            setCurrentLane(desiredLane);
            setMigration(null);
            migrationRef.current = null;
            
            displayProgressRef.current = targetProgress;
            setDisplayProgress(targetProgress);
        } else {
            const desiredLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: targetProgress,
                endAtMs: nextEndAtMs,
            };
            const newMigration: LaneMigration = {
                startedAtMs: nowMs,
                durationMs: activeTransitionTickCount * tickMs,
                fromLane: { 
                    startedAtMs: nowMs, 
                    startProgress: currentVisual, 
                    endAtMs: activeCurrentEndAtMs 
                },
                toLane: desiredLane,
            };
            setMigration(newMigration);
            migrationRef.current = newMigration;
            
            // No direct snap. Preserve currentVisual.
            displayProgressRef.current = currentVisual;
            setDisplayProgress(currentVisual);
        }
        
        lastDisplayWriteRef.current = { source, value: targetProgress };
        lastUpdateMetadataRef.current = {
            incomingProgress,
            effectiveTargetProgress: targetProgress,
            evidenceWeightFraction: confidence,
            currentVisualAtUpdate: currentVisual
        };
    };

    useEffect(() => {
        const nextEndAtMs = resolveEndAtMs({
            nowMs: Date.now(),
            startedAt,
            etaSeconds,
            etaBasis,
            estimatedEndAt,
            updatedAt,
        });

        updateLaneToTarget('prop-sync', nextEndAtMs, progress, isPhaseHandoff);
        prevPresentationStateRef.current = presentationState;
    }, [progress, startedAt, etaSeconds, etaBasis, estimatedEndAt, updatedAt, presentationState, isPhaseHandoff]);

    useEffect(() => {
        if (!isLiveAnimatedStatus(presentationState)) return;
        const interval = setInterval(() => {
            const nowMs = Date.now();
            setNow(nowMs);
            
            if (migrationRef.current && nowMs >= migrationRef.current.startedAtMs + migrationRef.current.durationMs) {
                const targetLane = migrationRef.current.toLane;
                currentLaneRef.current = targetLane;
                setCurrentLane(targetLane);
                migrationRef.current = null;
                setMigration(null);
            }

            const currentVisual = getRenderedProgress(currentLaneRef.current, migrationRef.current, nowMs, displayProgressRef.current);
            displayProgressRef.current = currentVisual;
            setDisplayProgress(currentVisual);
        }, tickMs);
        return () => clearInterval(interval);
    }, [presentationState, tickMs]);

    const { localProgress, indeterminate } = getProgressInfo({
        presentationState,
        preparingIndeterminate,
        displayProgress,
    });

    const activeTargetLane = migration?.toLane ?? currentLane;
    const displayedRemaining = activeTargetLane?.endAtMs == null
        ? null
        : Math.max(0, Math.ceil((activeTargetLane.endAtMs - now) / 1000));

    const autoFinalizing = isLiveAnimatedStatus(presentationState)
        && (localProgress >= 0.995 || (displayedRemaining !== null && displayedRemaining <= 0))
        && !isDoneStatus(presentationState)
        && !isFailedStatus(presentationState)
        && !isCancelledStatus(presentationState);

    useEffect(() => {
        if (!memoryKey) return;
        const currentFloor = !effectiveAllowBackward ? Math.max(getRememberedProgress(memoryKey), displayProgress) : clamp01(displayProgress);
        progressMemory.set(memoryKey, currentFloor);
    }, [memoryKey, displayProgress, effectiveAllowBackward]);

    const visualState = autoFinalizing ? 'finalizing' : presentationState;
    const shouldAnimateWidth = !indeterminate && isActiveStatus(visualState);
    const indeterminateClassName = indeterminate
        ? (visualState === 'finalizing' ? 'progress-bar-finalizing' : preparingIndeterminate ? 'progress-bar-pending' : 'progress-bar-animated')
        : undefined;
    const busyStatusText = getBusyStatusText(visualState, indeterminate);
    const terminalStatusText = getTerminalStatusText(visualState);
    const terminalFillStyle = getTerminalFillStyle(visualState);

    // Deriving a stable phase key forces a remount on broad mode transitions (preparing -> active),
    // which prevents the browser from trying to animate widthRegressions from 100% back to 0.
    const stablePhaseKey = indeterminate
        ? (visualState === 'preparing' ? 'preparing-indeterminate' : 'finalizing-indeterminate')
        : (isActiveStatus(visualState) || visualState === 'running' ? 'determinate-active' : 'terminal');

    useEffect(() => {
        if (!onDebugSnapshot) return;
        onDebugSnapshot(buildPredictiveProgressDebugSnapshot({
            memoryKey,
            resolvedCheckpointMode: checkpointMode ?? (effectiveAllowBackward ? 'default' : 'queue'),
            status,
            progress,
            startedAt,
            etaSeconds,
            predictive,
            tickLoopActive: isLiveAnimatedStatus(presentationState),
            preserveMountedProgress: true,
            preserveActiveVisualState: true,
            memoryFloor: getRememberedProgress(memoryKey),
            displayProgress,
            localProgress,
            currentLane,
            desiredLane: migration?.toLane ?? null,
            migrationProgress: migration ? clamp01((now - migration.startedAtMs) / migration.durationMs) : null,
            displayedRemaining,
            remainingTicks: activeTargetLane?.endAtMs == null ? null : getRemainingTicks(now, activeTargetLane.endAtMs),
            launchEtaOnly: false,
            allowBackwardProgress: effectiveAllowBackward,
            lastDisplayWriteSource: lastDisplayWriteRef.current.source,
            lastDisplayWriteValue: lastDisplayWriteRef.current.value,
            transitionTickCount,
            backwardTransitionTickCount,
            activeTransitionTickCount: migration ? Math.round(migration.durationMs / tickMs) : null,
            isBackwardMigration: migration ? (migration.toLane.startProgress < migration.fromLane.startProgress - 0.001) : false,
            tickMs,
            migrationDurationMs: migration?.durationMs ?? null,
            migrationElapsedMs: migration ? Math.max(0, now - migration.startedAtMs) : null,
            migrationTicksTotal: migration ? Math.round(migration.durationMs / tickMs) : transitionTickCount,
            migrationTicksElapsed: migration ? Math.floor(Math.max(0, now - migration.startedAtMs) / tickMs) : null,
            evidenceWeightFraction: lastUpdateMetadataRef.current.evidenceWeightFraction,
            incomingProgress: lastUpdateMetadataRef.current.incomingProgress,
            effectiveTargetProgress: lastUpdateMetadataRef.current.effectiveTargetProgress,
            currentVisualAtUpdate: lastUpdateMetadataRef.current.currentVisualAtUpdate,
        }));
    }, [
        onDebugSnapshot, memoryKey, status, progress, startedAt, etaSeconds, predictive, 
        effectiveAllowBackward, displayProgress, localProgress, displayedRemaining, now, 
        presentationState, currentLane, migration, activeTargetLane, tickMs
    ]);

    if (barOnly) {
        return (
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }} data-testid="progress-bar-tiny">
                <div
                    key={stablePhaseKey}
                    className={visualState === 'finalizing' ? 'progress-bar-finalizing' : indeterminateClassName}
                    style={{
                        height: '100%',
                        width: indeterminate ? '100%' : visualState === 'finalizing' ? '100%' : terminalStatusText ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%') : `${localProgress * 100}%`,
                        background: visualState === 'finalizing' ? 'rgba(191, 219, 254, 0.34)' : terminalFillStyle?.background ?? 'var(--accent)',
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: terminalFillStyle?.boxShadow ?? (visualState === 'finalizing' ? '0 0 15px rgba(59, 130, 246, 0.45)' : '0 0 15px var(--accent)'),
                        transition: (shouldAnimateWidth && !isTerminalStatus(visualState)) ? 'width 0.25s linear' : 'none'
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }} data-testid="progress-bar">
            {(showLabel || showPercent || showEta) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                        {showLabel && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>}
                        {visualState && (
                            <span style={{
                                fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                                padding: '0.14rem 0.42rem', borderRadius: '999px', border: '1px solid rgba(0,0,0,0.08)',
                                background: visualState === 'running' || visualState === 'processing' ? 'rgba(37, 99, 235, 0.10)' : visualState === 'preparing' ? 'rgba(245, 158, 11, 0.12)' : visualState === 'finalizing' ? 'rgba(59, 130, 246, 0.10)' : 'rgba(100, 116, 139, 0.10)',
                                color: 'var(--text-secondary)', fontWeight: 800, whiteSpace: 'nowrap',
                            }}>
                                {formatStatusLabel(visualState)}
                            </span>
                        )}
                    </div>
                    <div>
                        {showEta && displayedRemaining !== null && !terminalStatusText && !busyStatusText ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {showPercent && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{Math.round(localProgress * 100)}%</span>}
                                <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    ETA: {formatTime(displayedRemaining)}
                                </span>
                            </div>
                        ) : (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>
                                {terminalStatusText ?? busyStatusText ?? (showPercent ? `${Math.round(localProgress * 100)}%` : '')}
                            </span>
                        )}
                    </div>
                </div>
            )}
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                    key={stablePhaseKey}
                    className={visualState === 'finalizing' ? 'progress-bar-finalizing' : indeterminateClassName}
                    style={{
                        height: '100%',
                        width: indeterminate ? (visualState === 'preparing' || visualState === 'finalizing' ? '100%' : '35%') : visualState === 'finalizing' ? '100%' : terminalStatusText ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%') : `${localProgress * 100}%`,
                        background: visualState === 'finalizing' ? 'rgba(191, 219, 254, 0.34)' : (indeterminate && preparingIndeterminate ? 'rgba(248, 250, 252, 0.96)' : terminalFillStyle?.background ?? 'var(--accent)'),
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: visualState === 'finalizing' ? '0 0 15px rgba(59, 130, 246, 0.45)' : (indeterminate && preparingIndeterminate ? '0 0 10px rgba(226,232,240,0.45)' : terminalFillStyle?.boxShadow ?? '0 0 15px var(--accent)'),
                        transition: (shouldAnimateWidth && !isTerminalStatus(visualState)) ? 'width 0.25s linear' : 'none'
                    }}
                />
            </div>
        </div>
    );
};
