import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { advancePredictiveProgress, buildPredictiveProgressModel } from '../utils/predictiveProgress';
import {
    ETA_TICK_MS,
    clamp01,
    formatStatusLabel,
    formatTime,
    getAutoFinalizing,
    getBusyStatusText,
    getEffectiveEtaSeconds,
    getInitialDisplayProgress,
    getMaxVisualStep,
    getProgressInfo,
    getRemainingTicks,
    getSmoothingTicks,
    getTerminalFillStyle,
    getTerminalStatusText,
    isActiveStatus,
    isCancelledStatus,
    isDoneStatus,
    isFailedStatus,
    isLiveAnimatedStatus,
    isLoadingPresentationStatus,
    isPreparingStatus,
    isQueuedStatus,
    isTerminalStatus,
    shouldPreserveMountedProgress,
    type ProgressPresentationState,
} from './predictiveProgressBarHelpers';

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
    model?: ReturnType<typeof buildPredictiveProgressModel>;
    lastDisplayWriteSource?: string;
    lastDisplayWriteValue?: number | null;
}

interface PredictiveProgressBarProps {
    progress: number;
    startedAt?: number;
    etaSeconds?: number;
    persistenceKey?: string;
    label?: string;
    showEta?: boolean;
    status?: string;
    predictive?: boolean;
    authoritativeFloor?: boolean;
    evidenceWeightFraction?: number;
    checkpointMode?: 'default' | 'queue' | 'segment';
    state?: ProgressPresentationState;
    onDebugSnapshot?: (snapshot: PredictiveProgressDebugSnapshot) => void;
}

const progressMemory = new Map<string, number>();
const endTimeMemory = new Map<string, number>();

export const resetPredictiveProgressMemory = (persistenceKey?: string) => {
    if (!persistenceKey) {
        progressMemory.clear();
        endTimeMemory.clear();
        return;
    }

    for (const key of Array.from(progressMemory.keys())) {
        if (key.startsWith(`${persistenceKey}:`)) {
            progressMemory.delete(key);
        }
    }

    for (const key of Array.from(endTimeMemory.keys())) {
        if (key.startsWith(`${persistenceKey}:`)) {
            endTimeMemory.delete(key);
        }
    }
};

const getProgressMemoryKey = (persistenceKey?: string, startedAt?: number) =>
    persistenceKey ? `${persistenceKey}:${startedAt ?? 0}` : undefined;
const getRememberedProgress = (memoryKey?: string) =>
    memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
const getMemoryFloor = (memoryKey: string | undefined, allowBackwardProgress: boolean) =>
    allowBackwardProgress ? 0 : getRememberedProgress(memoryKey);
const hasRememberedActiveRun = (memoryKey?: string, startedAt?: number) =>
    !!(memoryKey && (
        progressMemory.has(memoryKey)
        || endTimeMemory.has(memoryKey)
        || (typeof startedAt === 'number' && startedAt > 0)
    ));

// Grouped chapter progress behavior:
// - Backend progress is authoritative enough to act as a floor, but not so
//   absolute that the UI should hard-snap to each update.
// - Between websocket updates, the bar keeps moving locally from its current
//   displayed value using the current ETA model so it feels continuous.
// - ETA corrections are eased toward a new target end time over multiple ticks.
// - Width transitions stay enabled for active jobs so checkpoint updates remain
//   visually smooth instead of looking like direct sets.

export const PredictiveProgressBar: React.FC<PredictiveProgressBarProps> = ({
    progress,
    startedAt,
    etaSeconds,
    persistenceKey,
    label = "Progress",
    showEta = true,
    status,
    predictive = true,
    authoritativeFloor = false,
    evidenceWeightFraction = 1,
    checkpointMode,
    state,
    onDebugSnapshot,
}) => {
    const presentationState = state ?? status;
    const memoryKey = getProgressMemoryKey(persistenceKey, startedAt);
    const preserveActiveVisualState = hasRememberedActiveRun(memoryKey, startedAt);
    const rememberedProgress = getRememberedProgress(memoryKey);
    const preserveMountedProgress = shouldPreserveMountedProgress(presentationState, startedAt, rememberedProgress);
    const initialDisplayProgress = getInitialDisplayProgress({
        progress,
        startedAt,
        rememberedProgress,
        status: presentationState,
    });
    const preparingIndeterminate = isPreparingStatus(presentationState);
    const [now, setNow] = useState(Date.now());
    const [currentEndTime, setCurrentEndTime] = useState<number | null>(null);
    const [displayProgress, setDisplayProgress] = useState(() => initialDisplayProgress);
    const lastTickRef = useRef(Date.now());
    const displayProgressRef = useRef(initialDisplayProgress);
    const displayedRemainingRef = useRef<number | null>(null);
    const currentEndTimeRef = useRef<number | null>(null);
    const targetEndTimeRef = useRef<number | null>(null);
    const lastRunAnchorRef = useRef<string | null>(null);
    const pendingRunAnchorRef = useRef<string | null>(null);
    const launchSnapshotRef = useRef<{
        runAnchor: string;
        status?: string;
        progress: number;
        startedAt?: number;
        etaSeconds?: number;
        checkpointMode: 'default' | 'queue' | 'segment';
        evidenceWeightFraction: number;
    } | null>(null);
    const lastDisplayWriteRef = useRef<{ source: string; value: number | null }>({
        source: 'init',
        value: initialDisplayProgress,
    });
    const resolvedCheckpointMode = checkpointMode ?? (authoritativeFloor ? 'queue' : 'default');
    const runAnchor = `${persistenceKey ?? 'none'}:${startedAt ?? 0}`;
    const launchSnapshot = launchSnapshotRef.current;
    const previousPresentationStateRef = useRef<typeof presentationState>(presentationState);
    const currentLaunchSnapshot = {
        runAnchor,
        status: state ?? status,
        progress: clamp01(progress),
        startedAt,
        etaSeconds,
        checkpointMode: resolvedCheckpointMode,
        evidenceWeightFraction,
    };
    const preferLaunchEtaOnly = !launchSnapshot;
    const tickLoopActive = isLiveAnimatedStatus(presentationState);
    const allowBackwardProgress = !authoritativeFloor;
    const handoffResetPendingRef = useRef(false);
    const handoffResetArmedAtRef = useRef<number | null>(null);
    const [handoffResetVisible, setHandoffResetVisible] = useState(false);
    const loadingToDynamicHandoff = (
        isLoadingPresentationStatus(previousPresentationStateRef.current)
        && isLiveAnimatedStatus(presentationState)
    ) || (
        launchSnapshot?.status === 'preparing'
        && isLiveAnimatedStatus(presentationState)
    );
    const resetHandoffState = () => {
        currentEndTimeRef.current = null;
        targetEndTimeRef.current = null;
        setCurrentEndTime(null);
        writeDisplayProgress('handoff-reset', 0);
    };
    const [debugTick, setDebugTick] = useState<{
        lastTickAt: number;
        dtSeconds: number;
        tickElapsedSeconds: number | null;
        effectiveEtaSeconds: number | null;
        smoothingTicks: number | null;
        maxVisualStep: number | null;
        targetFloor: number | null;
        nextProgress: number | null;
        etaProgressBasis?: number | null;
        visibleProgress?: number | null;
        launchEtaOnly?: boolean;
        allowBackwardProgress?: boolean;
        modelAuthoritativeProgress?: number | null;
        modelDisplayedProgress?: number | null;
        modelEstimatedRemainingSeconds?: number | null;
        modelActualRemainingSeconds?: number | null;
        modelRefinedRemainingSeconds?: number | null;
        modelVelocityPerSecond?: number | null;
        correctionWeightMode?: 'default' | 'queue' | 'segment';
        model?: ReturnType<typeof buildPredictiveProgressModel>;
        lastDisplayWriteSource?: string;
        lastDisplayWriteValue?: number | null;
    }>({
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
        launchEtaOnly: preferLaunchEtaOnly,
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

    const writeDisplayProgress = (
        source: string,
        nextValue: number | ((previous: number) => number),
    ) => {
        setDisplayProgress(previous => {
            const resolved = typeof nextValue === 'function'
                ? (nextValue as (previous: number) => number)(previous)
                : nextValue;
            lastDisplayWriteRef.current = { source, value: resolved };
            return resolved;
        });
    };

    useEffect(() => {
        if (!memoryKey) return;
        progressMemory.set(memoryKey, allowBackwardProgress ? clamp01(displayProgress) : Math.max(getRememberedProgress(memoryKey), displayProgress));
    }, [memoryKey, displayProgress, allowBackwardProgress]);

    useEffect(() => {
        if (!memoryKey || currentEndTime === null) return;
        endTimeMemory.set(memoryKey, currentEndTime);
    }, [memoryKey, currentEndTime]);

    useEffect(() => {
        displayProgressRef.current = displayProgress;
    }, [displayProgress]);

    useEffect(() => {
        previousPresentationStateRef.current = presentationState;
    }, [presentationState]);

    useEffect(() => {
        if (lastRunAnchorRef.current === runAnchor) {
            return;
        }
        lastRunAnchorRef.current = runAnchor;
        pendingRunAnchorRef.current = runAnchor;
        launchSnapshotRef.current = currentLaunchSnapshot;
        lastTickRef.current = Date.now();
        const initialEndTime = etaSeconds
            ? (startedAt ? (startedAt * 1000) + (etaSeconds * 1000) : Date.now() + (etaSeconds * 1000))
            : null;
        const rememberedEndTime = memoryKey ? endTimeMemory.get(memoryKey) ?? null : null;
        const seededEndTime = rememberedEndTime ?? initialEndTime;
        currentEndTimeRef.current = seededEndTime;
        targetEndTimeRef.current = initialEndTime;
        setCurrentEndTime(seededEndTime);
        writeDisplayProgress('run-anchor-init', loadingToDynamicHandoff
            ? 0
            : initialDisplayProgress);
    }, [etaSeconds, initialDisplayProgress, loadingToDynamicHandoff, memoryKey, progress, runAnchor, startedAt]);

    useLayoutEffect(() => {
        if (!loadingToDynamicHandoff || handoffResetVisible) {
            return;
        }
        handoffResetArmedAtRef.current = Date.now();
        handoffResetPendingRef.current = true;
        setHandoffResetVisible(true);
        resetHandoffState();
    }, [loadingToDynamicHandoff]);

    useEffect(() => {
        lastTickRef.current = Date.now();
        if (!isLiveAnimatedStatus(presentationState)) {
            return;
        }
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 250);
        return () => clearInterval(interval);
    }, [presentationState]);

    useEffect(() => {
        if (presentationState === 'finalizing') {
            writeDisplayProgress('finalizing-sync', 0);
            return;
        }
        if (handoffResetPendingRef.current || handoffResetVisible) {
            handoffResetPendingRef.current = false;
            resetHandoffState();
            return;
        }
        if (!preserveMountedProgress && !preserveActiveVisualState) {
            writeDisplayProgress('inactive-sync', 0);
            return;
        }
        const memoryFloor = getMemoryFloor(memoryKey, allowBackwardProgress);
        if (!predictive || !startedAt || !etaSeconds) {
            writeDisplayProgress('non-predictive-sync', prev => {
                const target = clamp01(progress);
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                return allowBackwardProgress
                    ? clamp01(prev + (gap * 0.35))
                    : Math.max(memoryFloor, clamp01(prev + (gap * 0.35)));
            });
            return;
        }
        if (allowBackwardProgress) {
            writeDisplayProgress('direct-sync', clamp01(progress));
            return;
        }
        if (authoritativeFloor) {
            writeDisplayProgress('authoritative-floor-sync', prev => Math.max(prev, memoryFloor, clamp01(progress)));
        }
    }, [allowBackwardProgress, authoritativeFloor, etaSeconds, handoffResetVisible, memoryKey, predictive, presentationState, preserveActiveVisualState, preserveMountedProgress, progress, startedAt]);

    useEffect(() => {
        const tickNow = now;
        const dt = Math.max(0.05, (tickNow - lastTickRef.current) / 1000);
        lastTickRef.current = tickNow;

        if (presentationState === 'finalizing') {
            writeDisplayProgress('finalizing-tick', 0);
            setDebugTick(prev => ({
                ...prev,
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: startedAt ? Math.max(0, (tickNow / 1000) - startedAt) : null,
                effectiveEtaSeconds: null,
                smoothingTicks: null,
                maxVisualStep: null,
                targetFloor: 0,
                nextProgress: 0,
                correctionWeightMode: resolvedCheckpointMode,
                model: undefined,
            }));
            return;
        }
        if (handoffResetVisible) {
            const armedAt = handoffResetArmedAtRef.current;
            if (armedAt !== null && tickNow <= armedAt + ETA_TICK_MS) {
                setDebugTick(prev => ({
                    ...prev,
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: startedAt ? Math.max(0, (tickNow / 1000) - startedAt) : null,
                    effectiveEtaSeconds: null,
                    smoothingTicks: null,
                    maxVisualStep: null,
                    targetFloor: 0,
                    nextProgress: 0,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: undefined,
                }));
                return;
            }
            handoffResetArmedAtRef.current = null;
            setHandoffResetVisible(false);
            resetHandoffState();
            setDebugTick(prev => ({
                ...prev,
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: startedAt ? Math.max(0, (tickNow / 1000) - startedAt) : null,
                effectiveEtaSeconds: null,
                smoothingTicks: null,
                maxVisualStep: null,
                targetFloor: 0,
                nextProgress: 0,
                correctionWeightMode: resolvedCheckpointMode,
                model: undefined,
            }));
            return;
        }
        if (!isLiveAnimatedStatus(presentationState)) {
            const next = clamp01(Math.max(getRememberedProgress(memoryKey), clamp01(progress)));
            writeDisplayProgress('static-status-sync', next);
            setDebugTick(prev => ({
                ...prev,
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: null,
                effectiveEtaSeconds: null,
                smoothingTicks: null,
                maxVisualStep: null,
                targetFloor: next,
                nextProgress: next,
                correctionWeightMode: resolvedCheckpointMode,
                model: undefined,
            }));
            return;
        }
        if (!preserveMountedProgress && !preserveActiveVisualState) {
            setDebugTick(prev => ({
                ...prev,
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: null,
                effectiveEtaSeconds: null,
                smoothingTicks: null,
                maxVisualStep: null,
                targetFloor: null,
                nextProgress: 0,
                correctionWeightMode: resolvedCheckpointMode,
                model: undefined,
            }));
            return;
        }
        if (!predictive) {
            writeDisplayProgress('non-predictive-tick', prev => {
                const target = clamp01(progress);
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                const correctionWindow = gap > 0 ? 0.45 : 0.7;
                const correctionFraction = Math.min(1, dt / correctionWindow);
                const next = clamp01(prev + (gap * correctionFraction));
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: null,
                    effectiveEtaSeconds: null,
                    smoothingTicks: null,
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor: target,
                    nextProgress: next,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: undefined,
                });
                return next;
            });
            return;
        }
        if (!startedAt || !etaSeconds) {
            const next = clamp01(progress);
            writeDisplayProgress('missing-timing-sync', next);
            setDebugTick({
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: null,
                effectiveEtaSeconds: null,
                smoothingTicks: null,
                maxVisualStep: getMaxVisualStep(dt),
                targetFloor: next,
                nextProgress: next,
                correctionWeightMode: resolvedCheckpointMode,
                model: undefined,
            });
            return;
        }

        const runAnchor = `${persistenceKey ?? 'none'}:${startedAt ?? 0}`;
        const memoryFloor = getMemoryFloor(memoryKey, allowBackwardProgress);
        const effectiveEtaSeconds = getEffectiveEtaSeconds(startedAt, etaSeconds, tickNow, currentEndTimeRef.current);
        if (pendingRunAnchorRef.current === runAnchor) {
            pendingRunAnchorRef.current = null;
            writeDisplayProgress('pending-run-anchor', prev => {
                const launchProgress = loadingToDynamicHandoff ? 0 : initialDisplayProgress;
                const next = authoritativeFloor
                    ? Math.max(prev, clamp01(launchProgress))
                    : clamp01(launchProgress);
                const pendingRemainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: Math.max(0, (tickNow / 1000) - startedAt),
                    effectiveEtaSeconds,
                    smoothingTicks: getSmoothingTicks({
                        checkpointMode: resolvedCheckpointMode,
                        authoritativeFloor,
                        smoothingProgressBasis,
                        remainingTicks: pendingRemainingTicks,
                    }),
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor: clamp01(launchProgress),
                    nextProgress: next,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: buildPredictiveProgressModel({
                        authoritativeProgress: authoritativeFloor ? Math.max(clamp01(progress), memoryFloor) : progress,
                        displayedProgress: next,
                        elapsedSeconds: Math.max(0, (tickNow / 1000) - startedAt),
                        etaSeconds: effectiveEtaSeconds,
                        priorProgressBasis: authoritativeFloor ? Math.max(clamp01(progress), memoryFloor) : undefined,
                        correctionWeightMode: resolvedCheckpointMode,
                        evidenceWeightFraction,
                        preferLaunchEtaOnly,
                    }),
                });
                return next;
            });
            return;
        }

        writeDisplayProgress(authoritativeFloor ? 'predictive-tick-authoritative' : 'predictive-tick', prev => {
            if (authoritativeFloor) {
                const targetFloor = clamp01(progress);
                const base = Math.max(prev, clamp01(progress));
                const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
                const next = advancePredictiveProgress({
                    authoritativeProgress: progress,
                    displayedProgress: base,
                    elapsedSeconds: elapsed,
                    etaSeconds: effectiveEtaSeconds,
                    deltaSeconds: dt,
                    priorProgressBasis: base,
                    correctionWeightMode: resolvedCheckpointMode,
                    evidenceWeightFraction,
                    preferLaunchEtaOnly,
                });
                const shouldCompleteNow = (
                    progress >= 0.995
                    || (
                        currentEndTimeRef.current !== null
                        && currentEndTimeRef.current <= tickNow + ETA_TICK_MS
                        && Math.max(targetFloor, next.nextProgress) >= 0.98
                    )
                );
                if (shouldCompleteNow) {
                    const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                    setDebugTick({
                        lastTickAt: tickNow,
                        dtSeconds: dt,
                        tickElapsedSeconds: elapsed,
                        effectiveEtaSeconds,
                        smoothingTicks: getSmoothingTicks({
                            checkpointMode: resolvedCheckpointMode,
                            authoritativeFloor: true,
                            smoothingProgressBasis,
                            remainingTicks,
                        }),
                        maxVisualStep: getMaxVisualStep(dt),
                        targetFloor,
                        nextProgress: 1,
                        correctionWeightMode: resolvedCheckpointMode,
                        model: next,
                    });
                    return 1;
                }
                const cappedNext = Math.min(next.nextProgress, base + getMaxVisualStep(dt));
                const finalNext = clamp01(Math.max(base, cappedNext));
                const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: elapsed,
                    effectiveEtaSeconds,
                    smoothingTicks: getSmoothingTicks({
                        checkpointMode: resolvedCheckpointMode,
                        authoritativeFloor: true,
                        smoothingProgressBasis,
                        remainingTicks,
                    }),
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor,
                    nextProgress: finalNext,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: next,
                });
                return finalNext;
            }
            const elapsed = Math.max(0, (tickNow / 1000) - startedAt);
            const next = advancePredictiveProgress({
                authoritativeProgress: progress,
                displayedProgress: prev,
                elapsedSeconds: elapsed,
                etaSeconds: effectiveEtaSeconds,
                deltaSeconds: dt,
                preferLaunchEtaOnly,
            })
            if (
                progress >= 0.995
                || (
                    currentEndTimeRef.current !== null
                    && currentEndTimeRef.current <= tickNow + ETA_TICK_MS
                    && Math.max(progress, next.nextProgress) >= 0.98
                )
            ) {
                const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: elapsed,
                    effectiveEtaSeconds,
                    smoothingTicks: getSmoothingTicks({
                        checkpointMode: resolvedCheckpointMode,
                        authoritativeFloor: false,
                        smoothingProgressBasis,
                        remainingTicks,
                    }),
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor: Math.max(progress, next.nextProgress),
                    nextProgress: 1,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: next,
                });
                return 1
            }
                const liveProgress = clamp01(progress);
                const forwardDelta = Math.max(0, liveProgress - prev);
                const correctionBoost = Math.max(getMaxVisualStep(dt), forwardDelta * 0.15);
                const cappedNext = Math.min(next.nextProgress, prev + correctionBoost)
                const finalNext = allowBackwardProgress
                    ? clamp01(Math.max(prev, cappedNext))
                    : Math.max(prev, clamp01(progress), cappedNext)
            const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
            setDebugTick({
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: elapsed,
                effectiveEtaSeconds,
                smoothingTicks: getSmoothingTicks({
                    checkpointMode: resolvedCheckpointMode,
                    authoritativeFloor: false,
                    smoothingProgressBasis,
                    remainingTicks,
                }),
                maxVisualStep: getMaxVisualStep(dt),
                targetFloor: allowBackwardProgress ? clamp01(cappedNext) : clamp01(progress),
                nextProgress: finalNext,
                correctionWeightMode: resolvedCheckpointMode,
                model: next,
            });
            return finalNext
        });

    }, [now, progress, startedAt, etaSeconds, predictive, presentationState, authoritativeFloor, preserveActiveVisualState, preserveMountedProgress, resolvedCheckpointMode, evidenceWeightFraction, loadingToDynamicHandoff, handoffResetVisible, allowBackwardProgress]);

    const memoryFloor = getMemoryFloor(memoryKey, allowBackwardProgress);
    const { localProgress, indeterminate } = getProgressInfo({
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
        currentEndTime: currentEndTimeRef.current,
        authoritativeFloor,
        resolvedCheckpointMode,
        evidenceWeightFraction,
        preferLaunchEtaOnly,
    });
    const displayedRemaining = currentEndTime === null
        ? null
        : Math.max(0, Math.ceil((currentEndTime - now) / 1000));
    const queueRemainingFloor = authoritativeFloor && startedAt && etaSeconds
        ? Math.max(0, Math.ceil(Math.max(0, 1 - localProgress) * etaSeconds))
        : null;
    const syncedDisplayedRemaining = queueRemainingFloor === null
        ? displayedRemaining
        : (displayedRemaining === null ? queueRemainingFloor : Math.max(displayedRemaining, queueRemainingFloor));
    const smoothingProgressBasis = Math.max(clamp01(progress), localProgress);
    const autoFinalizing = getAutoFinalizing({
        presentationState,
        localProgress,
        now,
        startedAt,
        etaSeconds,
        syncedDisplayedRemaining,
    });
    const visualState = autoFinalizing ? 'finalizing' : presentationState;

    useEffect(() => {
        if (visualState === 'finalizing') {
            currentEndTimeRef.current = null;
            targetEndTimeRef.current = null;
            setCurrentEndTime(null);
            return;
        }
        if (handoffResetPendingRef.current) {
            handoffResetPendingRef.current = false;
            resetHandoffState();
            return;
        }
        if (!predictive || ((!preserveMountedProgress && !preserveActiveVisualState))) {
            currentEndTimeRef.current = null;
            targetEndTimeRef.current = null;
            setCurrentEndTime(null);
            return;
        }
        if (!startedAt || !etaSeconds) {
            return;
        }
        const elapsed = Math.max(0, (Date.now() / 1000) - startedAt);
        const rememberedProgress = getRememberedProgress(memoryKey);
        const effectiveDisplayedProgress = Math.max(displayProgressRef.current, rememberedProgress);
        const etaProgressBasis = authoritativeFloor ? Math.max(clamp01(progress), effectiveDisplayedProgress) : progress;
        const model = buildPredictiveProgressModel({
            authoritativeProgress: etaProgressBasis,
            displayedProgress: effectiveDisplayedProgress,
            elapsedSeconds: elapsed,
            etaSeconds,
            priorProgressBasis: authoritativeFloor ? etaProgressBasis : undefined,
            correctionWeightMode: resolvedCheckpointMode,
            evidenceWeightFraction,
            preferLaunchEtaOnly,
        });
        const nextTargetEndTime = Date.now() + (model.refinedRemainingSeconds * 1000);
        const rememberedEndTime = memoryKey ? (endTimeMemory.get(memoryKey) ?? null) : null;
        targetEndTimeRef.current = nextTargetEndTime;
        if (currentEndTimeRef.current === null) {
            const seededEndTime = rememberedEndTime ?? nextTargetEndTime;
            currentEndTimeRef.current = seededEndTime;
            setCurrentEndTime(seededEndTime);
        }
    }, [progress, startedAt, etaSeconds, predictive, status, memoryKey, preserveActiveVisualState, preserveMountedProgress, authoritativeFloor, evidenceWeightFraction, resolvedCheckpointMode, visualState, loadingToDynamicHandoff, handoffResetVisible]);

    useEffect(() => {
        if (visualState === 'finalizing') {
            setCurrentEndTime(null);
            return;
        }
        if (loadingToDynamicHandoff) {
            resetHandoffState();
            return;
        }
        if (!predictive || ((!preserveMountedProgress && !preserveActiveVisualState))) {
            setCurrentEndTime(null);
            return;
        }
        if (!startedAt || !etaSeconds) {
            return;
        }
        const targetEndTime = targetEndTimeRef.current;
        const currentEndTime = currentEndTimeRef.current;

        if (targetEndTime === null) {
            setCurrentEndTime(null);
            return;
        }

        if (currentEndTime === null) {
            currentEndTimeRef.current = targetEndTime;
            setCurrentEndTime(targetEndTime);
            return;
        }

        const deltaMs = targetEndTime - currentEndTime;
        const remainingTicks = getRemainingTicks(now, currentEndTime);
        const smoothingTicks = getSmoothingTicks({
            checkpointMode: resolvedCheckpointMode,
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
        const nextEndTime = currentEndTime + nudgeMs;

        currentEndTimeRef.current = nextEndTime;
        setCurrentEndTime(nextEndTime);
    }, [now, predictive, startedAt, etaSeconds, presentationState, preserveActiveVisualState, preserveMountedProgress, authoritativeFloor, progress, resolvedCheckpointMode, visualState, loadingToDynamicHandoff, handoffResetVisible]);

    const shouldAnimateWidth = !indeterminate && isActiveStatus(visualState);
    const indeterminateClassName = indeterminate
        ? (visualState === 'finalizing'
            ? 'progress-bar-finalizing'
            : preparingIndeterminate
            ? 'progress-bar-pending'
            : 'progress-bar-animated')
        : undefined;
    const prepStyleIndeterminate = visualState === 'preparing' || visualState === 'finalizing';
    const indeterminateWidth = prepStyleIndeterminate ? '100%' : '35%';
    const busyStatusText = getBusyStatusText(visualState, indeterminate);
    const terminalStatusText = getTerminalStatusText(visualState);
    const terminalFillStyle = getTerminalFillStyle(visualState);

    useEffect(() => {
        displayedRemainingRef.current = syncedDisplayedRemaining;
    }, [syncedDisplayedRemaining]);

    useEffect(() => {
        if (!onDebugSnapshot) return;
        const snapshot: PredictiveProgressDebugSnapshot = {
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
            memoryFloor: getRememberedProgress(memoryKey),
            displayProgress,
            localProgress,
            currentEndTime,
            targetEndTime: targetEndTimeRef.current,
            displayedRemaining,
            syncedDisplayedRemaining,
            remainingTicks: currentEndTime === null ? null : getRemainingTicks(now, currentEndTime),
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
            launchEtaOnly: preferLaunchEtaOnly,
            allowBackwardProgress,
            modelAuthoritativeProgress: debugTick.model?.authoritativeProgress ?? null,
            modelDisplayedProgress: debugTick.model?.displayedProgress ?? null,
            modelEstimatedRemainingSeconds: debugTick.model?.estimatedRemainingSeconds ?? null,
            modelActualRemainingSeconds: debugTick.model?.actualRemainingSeconds ?? null,
            modelRefinedRemainingSeconds: debugTick.model?.refinedRemainingSeconds ?? null,
            modelVelocityPerSecond: debugTick.model?.velocityPerSecond ?? null,
            correctionWeightMode: debugTick.correctionWeightMode,
            model: debugTick.model,
            lastDisplayWriteSource: lastDisplayWriteRef.current.source,
            lastDisplayWriteValue: lastDisplayWriteRef.current.value,
        };
        onDebugSnapshot(snapshot);
    }, [
        onDebugSnapshot,
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
        displayProgress,
        localProgress,
        currentEndTime,
        displayedRemaining,
        syncedDisplayedRemaining,
        currentEndTime,
        now,
        debugTick,
        preferLaunchEtaOnly,
        allowBackwardProgress,
    ]);

    return (
        <div style={{ width: '100%' }} data-testid="progress-bar">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                    {visualState ? (
                        <span
                            style={{
                                fontSize: '0.58rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                padding: '0.14rem 0.42rem',
                                borderRadius: '999px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                background: visualState === 'running' || visualState === 'processing'
                                    ? 'rgba(37, 99, 235, 0.10)'
                                    : visualState === 'preparing'
                                    ? 'rgba(245, 158, 11, 0.12)'
                                    : visualState === 'finalizing'
                                    ? 'rgba(59, 130, 246, 0.10)'
                                    : 'rgba(100, 116, 139, 0.10)',
                                color: 'var(--text-secondary)',
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {formatStatusLabel(visualState)}
                        </span>
                    ) : null}
                </div>
                {showEta && syncedDisplayedRemaining !== null && !terminalStatusText && !busyStatusText ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {Math.round(localProgress * 100)}%
                        </span>
                        <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--accent)',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums'
                        }}>
                            ETA: {formatTime(syncedDisplayedRemaining)}
                        </span>
                    </div>
                ) : (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)' }}>
                        {terminalStatusText ?? busyStatusText ?? `${Math.round(localProgress * 100)}%`}
                    </span>
                )}
            </div>
            <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                    className={visualState === 'finalizing' ? 'progress-bar-finalizing' : indeterminateClassName}
                    style={{
                        height: '100%',
                    width: loadingToDynamicHandoff
                        || handoffResetVisible
                            ? '0%'
                            : indeterminate
                            ? indeterminateWidth
                            : visualState === 'finalizing'
                            ? '100%'
                            : terminalStatusText
                            ? (isDoneStatus(visualState) || isFailedStatus(visualState) ? '100%' : '0%')
                            : `${localProgress * 100}%`,
                        background: visualState === 'finalizing'
                            ? 'rgba(191, 219, 254, 0.34)'
                            : indeterminate && preparingIndeterminate
                            ? 'rgba(248, 250, 252, 0.96)'
                            : terminalFillStyle?.background ?? 'var(--accent)',
                        opacity: terminalStatusText && (isQueuedStatus(visualState) || isCancelledStatus(visualState)) ? 0.55 : 1,
                        boxShadow: visualState === 'finalizing'
                            ? '0 0 15px rgba(59, 130, 246, 0.45)'
                            : indeterminate && preparingIndeterminate
                            ? '0 0 10px rgba(226,232,240,0.45)'
                            : terminalFillStyle?.boxShadow ?? '0 0 15px var(--accent)',
                        // This bar updates on a ~250ms loop, so the width transition
                        // should stay close to that cadence: long enough to soften
                        // visible snaps, but short enough to avoid visible lag.
                        transition: loadingToDynamicHandoff || handoffResetVisible
                            ? 'none'
                            : shouldAnimateWidth && !isTerminalStatus(visualState)
                            ? 'width 0.25s linear'
                            : 'none'
                    }}
                />
            </div>
        </div>
    );
};
