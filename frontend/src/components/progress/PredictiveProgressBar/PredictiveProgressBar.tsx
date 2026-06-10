import React, { useState, useEffect, useRef } from 'react';
import {
    clamp01,
    formatStylePercent,
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
    clampSlope,
    type ProgressPresentationState,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';
import {
    buildPredictiveProgressDebugSnapshot,
    type PredictiveProgressDebugSnapshot,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarDebug';
import { useEtaConfidence } from '@/components/progress/PredictiveProgressBar/useEtaConfidence';

export type { PredictiveProgressDebugSnapshot } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarDebug';

export interface PredictiveProgressBarProps {
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
    /**
     * Explicitly allow the bar to move backward on updates. Default is derived from
     * authoritativeFloor. Callers should always pass this explicitly — all production
     * call sites do — rather than relying on the derived default.
     */
    allowBackwardProgress?: boolean;
    transitionTickCount?: number;
    backwardTransitionTickCount?: number;
    tickMs?: number;
    checkpointMode?: 'default' | 'queue' | 'segment';
    state?: ProgressPresentationState;
    onDebugSnapshot?: (snapshot: PredictiveProgressDebugSnapshot) => void;
    /** Fires every animation tick with the bar's live interpolated progress (0–1). */
    onDisplayProgress?: (progress: number) => void;
    dataTestId?: string;
}

const progressMemory = new Map<string, number>();

const PROGRESS_MEMORY_MAX = 100;

const progressMemorySet = (key: string, value: number) => {
    const isNew = !progressMemory.has(key);
    progressMemory.set(key, value);
    if (isNew && progressMemory.size > PROGRESS_MEMORY_MAX) {
        // Map preserves insertion order; delete oldest entries until within cap
        const excess = progressMemory.size - PROGRESS_MEMORY_MAX;
        let count = 0;
        for (const k of progressMemory.keys()) {
            if (count >= excess) break;
            progressMemory.delete(k);
            count++;
        }
    }
};

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
    if (etaBasis === 'remaining_from_update' && typeof etaSeconds === 'number' && etaSeconds >= 0) {
        const anchorSeconds = updatedAt ?? (nowMs / 1000);
        return (anchorSeconds + etaSeconds) * 1000;
    }

    if (typeof estimatedEndAt === 'number' && estimatedEndAt > 0) {
        return estimatedEndAt * 1000;
    }

    if (typeof etaSeconds !== 'number' || etaSeconds < 0) {
        return null;
    }

    if (typeof startedAt === 'number' && startedAt > 0) {
        return (startedAt + etaSeconds) * 1000;
    }

    return nowMs + (etaSeconds * 1000);
};

const getLaneProgress = (startAtMs: number, endAtMs: number | null, startProgress: number, nowMs: number) => {
    if (endAtMs === null) return startProgress;
    const duration = endAtMs - startAtMs;
    if (duration <= 0) return startProgress;
    const t = Math.max(0, Math.min(1, (nowMs - startAtMs) / duration));
    return startProgress + ((0.995 - startProgress) * t);
};

const getRenderedStartAtMs = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number) => {
    if (!currentLane) return nowMs;
    if (!migration) return currentLane.startedAtMs;

    const fromStartAtMs = migration.fromLane.startedAtMs;
    const toStartAtMs = migration.toLane.startedAtMs;

    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return fromStartAtMs + ((toStartAtMs - fromStartAtMs) * t);
};

const getRenderedEndAtMs = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number) => {
    if (!currentLane) return null;
    if (!migration) return currentLane.endAtMs;

    const fromEndAtMs = migration.fromLane.endAtMs;
    const toEndAtMs = migration.toLane.endAtMs;
    if (fromEndAtMs == null || toEndAtMs == null) {
        return toEndAtMs ?? fromEndAtMs ?? null;
    }

    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return fromEndAtMs + ((toEndAtMs - fromEndAtMs) * t);
};

const getRenderedStartProgress = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number) => {
    if (!currentLane) return 0;
    if (!migration) return currentLane.startProgress;

    const fromStartProgress = migration.fromLane.startProgress;
    const toStartProgress = migration.toLane.startProgress;

    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return fromStartProgress + ((toStartProgress - fromStartProgress) * t);
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
    state,
    onDebugSnapshot,
    onDisplayProgress,
    dataTestId,
}) => {
    const presentationState = state ?? status;
    const effectiveAllowBackward = allowBackwardProgress ?? !authoritativeFloor;
    const memoryKey = getProgressMemoryKey(persistenceKey, startedAt);
    const preparingIndeterminate = isPreparingStatus(presentationState);
    const [tickState, forceUpdate] = useState(Date.now());
    const [currentLane, setCurrentLane] = useState<ProgressLane | null>(null);
    const [migration, setMigration] = useState<LaneMigration | null>(null);

    const currentLaneRef = useRef<ProgressLane | null>(null);
    const prevPresentationStateRef = useRef<string | null>(presentationState);
    const migrationRef = useRef<LaneMigration | null>(null);
    const displayProgressRef = useRef<number>(clamp01(progress));
    const doneTransitionRef = useRef<{ startTimeMs: number; durationMs: number; startProgress: number } | null>(null);
    // Set synchronously in render when done state is first detected; cleared in effect after transition is initialized.
    // Ensures isDoneAnimating is false on the first done-render so shouldTick stays true.
    const doneTransitionPendingRef = useRef<boolean>(false);

    const lastDisplayWriteRef = useRef<{ source: string; value: number | null }>({
        source: 'init',
        value: clamp01(progress),
    });

    const isPhaseHandoff = isPreparingStatus(prevPresentationStateRef.current ?? undefined) && !isPreparingStatus(presentationState);

    const lastUpdateMetadataRef = useRef<{
        incomingProgress: number | null;
        effectiveTargetProgress: number | null;
        currentVisualAtUpdate: number | null;
        isBackwardMigration: boolean;
    }>({
        incomingProgress: null,
        effectiveTargetProgress: null,
        currentVisualAtUpdate: null,
        isBackwardMigration: false,
    });

    // ETA confidence model state (doc 15)
    const etaConfidence = useEtaConfidence({ persistenceKey, startedAt, status: presentationState });
    const etaConfidenceStateRef = useRef<{
        w: number;
        base: number;
        cv: number;
        etaEndSmoothed: number | null;
        slopeCappedVsRaw: number | null;
    }>({ w: 0, base: 0.2, cv: 0, etaEndSmoothed: null, slopeCappedVsRaw: null });

    const updateLaneToTarget = (source: string, nextEndAtMs: number | null, nextProgress: number, instant = false) => {
        const nowMs = Date.now();
        const incomingProgress = clamp01(nextProgress);

        const currentVisual = getLaneProgress(
            getRenderedStartAtMs(currentLaneRef.current, migrationRef.current, nowMs),
            getRenderedEndAtMs(currentLaneRef.current, migrationRef.current, nowMs),
            getRenderedStartProgress(currentLaneRef.current, migrationRef.current, nowMs),
            nowMs
        );

        // --- Authoritative floor (backend percent is the position floor) ---
        let effectiveIncomingProgress = incomingProgress;
        if (!effectiveAllowBackward) {
            effectiveIncomingProgress = Math.max(incomingProgress, currentVisual);
            const remembered = getRememberedProgress(memoryKey);
            if (remembered > 0) {
                effectiveIncomingProgress = Math.max(effectiveIncomingProgress, remembered);
            }
        }

        // --- Backward migration detection (for transitionTickCount selection) ---
        const isBackwardMigration = effectiveAllowBackward && incomingProgress < currentVisual - 0.001;
        const activeTransitionTickCount = isBackwardMigration ? backwardTransitionTickCount : transitionTickCount;

        // --- Instant snap (preparing→running phase handoff, or forced) ---
        if (instant) {
            const snapLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: effectiveIncomingProgress,
                endAtMs: nextEndAtMs,
            };
            currentLaneRef.current = snapLane;
            setCurrentLane(snapLane);
            setMigration(null);
            migrationRef.current = null;
            displayProgressRef.current = effectiveIncomingProgress;

            lastUpdateMetadataRef.current = {
                incomingProgress,
                effectiveTargetProgress: effectiveIncomingProgress,
                currentVisualAtUpdate: currentVisual,
                isBackwardMigration: false,
            };
            return;
        }

        // --- ETA confidence model: compute w and smoothed end time ---
        let confidenceW = etaConfidenceStateRef.current.w;
        let confidenceBase = etaConfidenceStateRef.current.base;
        let confidenceCv = etaConfidenceStateRef.current.cv;
        let etaEndSmoothed = etaConfidenceStateRef.current.etaEndSmoothed;

        if (nextEndAtMs !== null) {
            const cs = etaConfidence.update(nextEndAtMs, effectiveIncomingProgress, nowMs);
            confidenceW = cs.w;
            confidenceBase = cs.base;
            confidenceCv = cs.cv;
            etaEndSmoothed = cs.etaEndSmoothed;
            // Apply stall decay if running
            if (isLiveAnimatedStatus(presentationState)) {
                confidenceW = etaConfidence.getStallDecayedW(confidenceW, nowMs);
            }
            etaConfidenceStateRef.current = {
                w: confidenceW,
                base: confidenceBase,
                cv: confidenceCv,
                etaEndSmoothed,
                slopeCappedVsRaw: null, // updated below
            };
        }

        // --- Velocity-continuous lane construction ---
        // Position is always from current visual (no anchor teleport).
        // End time is blended between the current rendered end and the smoothed ETA.
        const currentRenderedEnd = getRenderedEndAtMs(currentLaneRef.current, migrationRef.current, nowMs);

        let newEndAtMs: number | null = null;
        let slopeCappedVsRaw: number | null = null;

        if (etaEndSmoothed !== null && nextEndAtMs !== null) {
            const blendedEnd = currentRenderedEnd !== null
                ? currentRenderedEnd + (etaEndSmoothed - currentRenderedEnd) * confidenceW
                : etaEndSmoothed;
            const clamped = clampSlope(blendedEnd, currentRenderedEnd, effectiveIncomingProgress, nowMs, confidenceW);
            slopeCappedVsRaw = clamped - blendedEnd; // positive = slowed down, negative = sped up
            newEndAtMs = clamped;
        } else if (nextEndAtMs !== null && etaEndSmoothed === null) {
            // No confidence state yet (e.g. first update) — use raw but record it
            newEndAtMs = nextEndAtMs;
        }
        // If nextEndAtMs is null, newEndAtMs stays null (no ETA)

        etaConfidenceStateRef.current.slopeCappedVsRaw = slopeCappedVsRaw;

        const desiredEndAtMs = newEndAtMs;

        if (!currentLaneRef.current) {
            // Initial mount — set the lane directly, no migration
            const initialLane: ProgressLane = {
                startedAtMs: nowMs,
                startProgress: effectiveIncomingProgress,
                endAtMs: desiredEndAtMs,
            };
            currentLaneRef.current = initialLane;
            setCurrentLane(initialLane);
            setMigration(null);
            migrationRef.current = null;
            displayProgressRef.current = effectiveIncomingProgress;

            lastDisplayWriteRef.current = { source, value: effectiveIncomingProgress };
            lastUpdateMetadataRef.current = {
                incomingProgress,
                effectiveTargetProgress: effectiveIncomingProgress,
                currentVisualAtUpdate: currentVisual,
                isBackwardMigration: false,
            };
            return;
        }

        // Velocity-continuous new target lane:
        // startedAtMs = now, startProgress = target position, endAtMs = clamped blended end.
        // For forward migration: floor to effectiveIncomingProgress (backend authoritative floor).
        // For backward migration (allowed): target is incomingProgress.
        const targetStartProgress = isBackwardMigration ? incomingProgress : effectiveIncomingProgress;
        const toLane: ProgressLane = {
            startedAtMs: nowMs,
            startProgress: targetStartProgress,
            endAtMs: desiredEndAtMs,
        };

        const newMigration: LaneMigration = {
            startedAtMs: nowMs,
            durationMs: activeTransitionTickCount * tickMs,
            fromLane: {
                startedAtMs: getRenderedStartAtMs(currentLaneRef.current, migrationRef.current, nowMs),
                startProgress: getRenderedStartProgress(currentLaneRef.current, migrationRef.current, nowMs),
                endAtMs: getRenderedEndAtMs(currentLaneRef.current, migrationRef.current, nowMs),
            },
            toLane,
        };

        setMigration(newMigration);
        migrationRef.current = newMigration;
        displayProgressRef.current = currentVisual;

        lastDisplayWriteRef.current = { source, value: targetStartProgress };
        lastUpdateMetadataRef.current = {
            incomingProgress,
            effectiveTargetProgress: targetStartProgress,
            currentVisualAtUpdate: currentVisual,
            isBackwardMigration,
        };
    };

    const initialNow = Date.now();

    // Detect the first render where presentationState becomes 'done' from an active state.
    // Mark transition pending so isDoneAnimating is false (animation in progress) even before the effect runs.
    // Only set pending when prevPresentationState is an active state (i.e., a real 500ms animation will occur).
    const prevIsDoneActiveTransition = prevPresentationStateRef.current === 'running' ||
        prevPresentationStateRef.current === 'processing' ||
        prevPresentationStateRef.current === 'finalizing';
    if (presentationState === 'done' && !doneTransitionRef.current && prevIsDoneActiveTransition) {
        doneTransitionPendingRef.current = true;
    } else if (presentationState !== 'done') {
        doneTransitionPendingRef.current = false;
    }

    const isDoneAnimating = presentationState === 'done' && !doneTransitionPendingRef.current && (
        !doneTransitionRef.current ||
        (tickState - doneTransitionRef.current.startTimeMs >= doneTransitionRef.current.durationMs)
    );
    const shouldTick = isLiveAnimatedStatus(presentationState) || (presentationState === 'done' && !isDoneAnimating);
    const now = shouldTick ? tickState : initialNow;

    const renderedStartAtMs = getRenderedStartAtMs(currentLane, migration, now);
    const renderedEndAtMs = getRenderedEndAtMs(currentLane, migration, now);
    const renderedStartProgress = getRenderedStartProgress(currentLane, migration, now);

    let displayProgress = getLaneProgress(renderedStartAtMs, renderedEndAtMs, renderedStartProgress, now);
    if (presentationState === 'done' && doneTransitionRef.current) {
        const elapsed = now - doneTransitionRef.current.startTimeMs;
        const duration = doneTransitionRef.current.durationMs;
        if (duration > 0 && elapsed < duration) {
            const t = Math.max(0, Math.min(1, elapsed / duration));
            displayProgress = doneTransitionRef.current.startProgress + (1.0 - doneTransitionRef.current.startProgress) * t;
        } else {
            displayProgress = 1.0;
        }
    }
    if (!effectiveAllowBackward && memoryKey) {
        displayProgress = Math.max(displayProgress, getRememberedProgress(memoryKey));
    }
    displayProgressRef.current = displayProgress;

    useEffect(() => {
        const nowMs = Date.now();

        if (presentationState === 'done') {
            if (!doneTransitionRef.current) {
                const prevActive = prevPresentationStateRef.current && (
                    prevPresentationStateRef.current === 'running' ||
                    prevPresentationStateRef.current === 'processing' ||
                    prevPresentationStateRef.current === 'finalizing'
                );
                doneTransitionRef.current = {
                    startTimeMs: nowMs,
                    durationMs: prevActive ? 500 : 0,
                    startProgress: prevActive ? displayProgressRef.current : 1.0,
                };
            }
            // Clear the pending flag now that the transition object is initialized.
            doneTransitionPendingRef.current = false;
        } else {
            doneTransitionRef.current = null;
            doneTransitionPendingRef.current = false;
        }

        const nextEndAtMs = resolveEndAtMs({
            nowMs,
            startedAt,
            etaSeconds,
            etaBasis,
            estimatedEndAt,
            updatedAt,
        });

        const isTransitionAnimating = presentationState === 'done' && (
            !isDoneAnimating || prevPresentationStateRef.current !== 'done'
        );

        if (!isTransitionAnimating) {
            updateLaneToTarget('prop-sync', nextEndAtMs, progress, isPhaseHandoff);
        }
        prevPresentationStateRef.current = presentationState;
        forceUpdate(nowMs);
    }, [progress, startedAt, etaSeconds, etaBasis, estimatedEndAt, updatedAt, presentationState, isPhaseHandoff, isDoneAnimating]);

    useEffect(() => {
        if (!shouldTick) return;
        const interval = setInterval(() => {
            const nowMs = Date.now();
            forceUpdate(nowMs);

            if (migrationRef.current && nowMs >= migrationRef.current.startedAtMs + migrationRef.current.durationMs) {
                const targetLane = migrationRef.current.toLane;
                currentLaneRef.current = targetLane;
                setCurrentLane(targetLane);
                migrationRef.current = null;
                setMigration(null);
            }
        }, tickMs);
        return () => clearInterval(interval);
    }, [shouldTick, tickMs]);

    const { localProgress, indeterminate } = getProgressInfo({
        presentationState,
        preparingIndeterminate,
        displayProgress,
    });

    const activeTargetLane = migration?.toLane ?? currentLane;
    const displayedRemaining = renderedEndAtMs == null
        ? null
        : Math.max(0, Math.ceil((renderedEndAtMs - now) / 1000));

    const autoFinalizing = isLiveAnimatedStatus(presentationState)
        && localProgress >= 0.995
        && !isDoneStatus(presentationState)
        && !isFailedStatus(presentationState)
        && !isCancelledStatus(presentationState);

    useEffect(() => {
        if (!memoryKey) return;
        if (isTerminalStatus(presentationState)) {
            // Bar has reached a terminal state; evict its own key to avoid unbounded growth
            progressMemory.delete(memoryKey);
            return;
        }
        const currentFloor = !effectiveAllowBackward ? Math.max(getRememberedProgress(memoryKey), displayProgress) : clamp01(displayProgress);
        progressMemorySet(memoryKey, currentFloor);
    }, [memoryKey, displayProgress, effectiveAllowBackward, presentationState]);

    // Fire onDisplayProgress with localProgress — the exact value rendered as the bar width —
    // on every render where it changes. Throttled to 4 decimal places to prevent infinite loops.
    const lastReportedProgressRef = useRef<number | null>(null);
    useEffect(() => {
        if (!onDisplayProgress) return;
        const rounded = Math.round(localProgress * 10000) / 10000;
        if (lastReportedProgressRef.current !== rounded) {
            lastReportedProgressRef.current = rounded;
            onDisplayProgress(localProgress);
        }
    }, [localProgress, onDisplayProgress]);

    const visualState = autoFinalizing ? 'finalizing' : presentationState;
    const displayStatusLabel = presentationState === 'running' && checkpointMode === 'queue'
        ? 'Rendering'
        : formatStatusLabel(presentationState);
    const shouldAnimateWidth = !indeterminate && isActiveStatus(visualState);
    const indeterminateClassName = indeterminate
        ? (visualState === 'finalizing' ? 'progress-bar-finalizing' : preparingIndeterminate ? 'progress-bar-pending' : 'progress-bar-animated')
        : undefined;
    const busyStatusText = getBusyStatusText(presentationState, indeterminate);
    const terminalStatusText = getTerminalStatusText(presentationState);
    const terminalFillStyle = getTerminalFillStyle(presentationState);

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
            remainingTicks: renderedEndAtMs == null ? null : getRemainingTicks(now, renderedEndAtMs),
            launchEtaOnly: false,
            allowBackwardProgress: effectiveAllowBackward,
            lastDisplayWriteSource: lastDisplayWriteRef.current.source,
            lastDisplayWriteValue: lastDisplayWriteRef.current.value,
            transitionTickCount,
            backwardTransitionTickCount,
            activeTransitionTickCount: migration ? Math.round(migration.durationMs / tickMs) : null,
            isBackwardMigration: migration ? lastUpdateMetadataRef.current.isBackwardMigration : false,
            tickMs,
            migrationDurationMs: migration?.durationMs ?? null,
            migrationElapsedMs: migration ? Math.max(0, now - migration.startedAtMs) : null,
            migrationTicksTotal: migration ? Math.round(migration.durationMs / tickMs) : transitionTickCount,
            migrationTicksElapsed: migration ? Math.floor(Math.max(0, now - migration.startedAtMs) / tickMs) : null,
            incomingProgress: lastUpdateMetadataRef.current.incomingProgress,
            effectiveTargetProgress: lastUpdateMetadataRef.current.effectiveTargetProgress,
            currentVisualAtUpdate: lastUpdateMetadataRef.current.currentVisualAtUpdate,
            etaConfidenceW: etaConfidenceStateRef.current.w,
            etaConfidenceBase: etaConfidenceStateRef.current.base,
            etaConfidenceCv: etaConfidenceStateRef.current.cv,
            etaEndSmoothed: etaConfidenceStateRef.current.etaEndSmoothed,
            slopeCappedVsRaw: etaConfidenceStateRef.current.slopeCappedVsRaw,
        }));
    }, [
        onDebugSnapshot, memoryKey, status, progress, startedAt, etaSeconds, predictive,
        effectiveAllowBackward, tickState,
        presentationState, currentLane, migration, activeTargetLane, renderedEndAtMs, tickMs
    ]);

    if (barOnly) {
        return (
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }} data-testid={dataTestId ?? "progress-bar-tiny"}>
                <div
                    key={stablePhaseKey}
                    className={visualState === 'finalizing' ? 'progress-bar-finalizing' : indeterminateClassName}
                    style={{
                        height: '100%',
                        width: indeterminate ? '100%' : (isDoneStatus(visualState) && localProgress < 1.0) ? formatStylePercent(localProgress) : terminalStatusText ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%') : formatStylePercent(localProgress),
                        background: visualState === 'finalizing' ? 'rgba(191, 219, 254, 0.34)' : terminalFillStyle?.background ?? 'var(--accent)',
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: terminalFillStyle?.boxShadow ?? (visualState === 'finalizing' ? '0 0 15px rgba(59, 130, 246, 0.45)' : '0 0 15px var(--accent)'),
                        transition: (shouldAnimateWidth && !isTerminalStatus(visualState)) || (isDoneStatus(visualState) && localProgress < 1.0) ? 'width 0.25s linear' : 'none'
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ width: '100%' }} data-testid={dataTestId ?? "progress-bar"}>
            {(showLabel || showPercent || showEta) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                        {showLabel && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>}
                        {presentationState && (
                            <span style={{
                                fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                                padding: '0.14rem 0.42rem', borderRadius: '999px', border: '1px solid rgba(0,0,0,0.08)',
                                background: presentationState === 'running' || presentationState === 'processing' ? 'rgba(37, 99, 235, 0.10)' : presentationState === 'preparing' ? 'rgba(245, 158, 11, 0.12)' : presentationState === 'finalizing' ? 'rgba(59, 130, 246, 0.10)' : 'rgba(100, 116, 139, 0.10)',
                                color: 'var(--text-secondary)', fontWeight: 800, whiteSpace: 'nowrap',
                            }}>
                                {displayStatusLabel}
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
                        width: indeterminate ? (visualState === 'preparing' ? '0%' : visualState === 'finalizing' ? '100%' : '35%') : (isDoneStatus(visualState) && localProgress < 1.0) ? formatStylePercent(localProgress) : terminalStatusText ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%') : formatStylePercent(localProgress),
                        background: visualState === 'finalizing' ? 'rgba(191, 219, 254, 0.34)' : (indeterminate && preparingIndeterminate ? 'rgba(248, 250, 252, 0.96)' : terminalFillStyle?.background ?? 'var(--accent)'),
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: visualState === 'finalizing' ? '0 0 15px rgba(59, 130, 246, 0.45)' : (indeterminate && preparingIndeterminate ? '0 0 10px rgba(226,232,240,0.45)' : terminalFillStyle?.boxShadow ?? '0 0 15px var(--accent)'),
                        transition: (shouldAnimateWidth && !isTerminalStatus(visualState)) || (isDoneStatus(visualState) && localProgress < 1.0) ? 'width 0.25s linear' : 'none'
                    }}
                />
            </div>
        </div>
    );
};
