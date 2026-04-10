import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { advancePredictiveProgress, buildPredictiveProgressModel } from '../utils/predictiveProgress';

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
    correctionWeightMode?: 'default' | 'queue' | 'segment';
    model?: ReturnType<typeof buildPredictiveProgressModel>;
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
    state?: 'default' | 'queued' | 'preparing' | 'running' | 'processing' | 'finalizing' | 'done' | 'failed' | 'cancelled';
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

const isActiveStatus = (status?: string) => status === 'running' || status === 'processing' || status === 'finalizing';
const isLiveAnimatedStatus = (status?: string) => status === 'running' || status === 'processing';
const isDynamicPresentation = (status?: string) => status === 'running' || status === 'processing';
const isPreparingStatus = (status?: string) => status === 'preparing';
const isFinalizingStatus = (status?: string) => status === 'finalizing';
const isQueuedStatus = (status?: string) => status === 'queued';
const isDoneStatus = (status?: string) => status === 'done';
const isFailedStatus = (status?: string) => status === 'failed';
const isCancelledStatus = (status?: string) => status === 'cancelled';
const isLoadingPresentationStatus = (status?: string) => isPreparingStatus(status) || isFinalizingStatus(status);
const isTerminalStatus = (status?: string) =>
    isQueuedStatus(status) || isDoneStatus(status) || isFailedStatus(status) || isCancelledStatus(status);
const shouldPreserveMountedProgress = (
    status: string | undefined,
    _progress: number,
    startedAt?: number,
    remembered?: number,
) => {
    if (isActiveStatus(status)) return true;
    if (status !== 'preparing') return false;
    if (typeof remembered === 'number' && remembered > 0) return true;
    if (typeof startedAt === 'number' && startedAt > 0) return true;
    return false;
};

const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const formatStatusLabel = (status?: string) => status
    ? status
        .split('_')
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ')
    : '';
const getMaxVisualStep = (dtSeconds: number) => Math.max(0.006, Math.min(0.012, dtSeconds * 0.012));
const ETA_TICK_MS = 250;
const ETA_SMOOTHING_MAX_SECONDS = 3;
const EARLY_QUEUE_ETA_SMOOTHING_MAX_SECONDS = 5;
const QUEUE_ETA_SMOOTHING_MAX_SECONDS = 4;
const EARLY_QUEUE_PROGRESS_THRESHOLD = 0.2;
const ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
const EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((EARLY_QUEUE_ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
const QUEUE_ETA_MAX_SMOOTHING_TICKS = Math.max(1, Math.round((QUEUE_ETA_SMOOTHING_MAX_SECONDS * 1000) / ETA_TICK_MS));
const PROGRESS_MAX_SMOOTHING_TICKS = ETA_MAX_SMOOTHING_TICKS;
const getRemainingTicks = (nowMs: number, endTimeMs: number | null) =>
    endTimeMs === null
        ? 1
        : Math.max(1, Math.ceil(Math.max(0, endTimeMs - nowMs) / ETA_TICK_MS));
const getCappedSmoothingTicks = (baseTicks: number, remainingTicks: number) =>
    Math.max(1, Math.min(baseTicks, remainingTicks));
const hasRememberedActiveRun = (memoryKey?: string, startedAt?: number) =>
    !!(memoryKey && (
        progressMemory.has(memoryKey)
        || endTimeMemory.has(memoryKey)
        || (typeof startedAt === 'number' && startedAt > 0)
    ));
const getEffectiveEtaSeconds = (
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

const getInitialDisplayProgress = (
    progress: number,
    startedAt?: number,
    etaSeconds?: number,
    persistenceKey?: string,
    predictive?: boolean,
    status?: string,
) => {
    // Contract for queue/project progress:
    // 1. Always start from the authoritative backend progress that already reflects
    //    completed chapter work, including partial renders and resumed jobs.
    // 2. Never jump forward on mount just because startedAt/eta imply more elapsed time.
    // 3. After mount, animate locally from the current displayed position using ETA as a
    //    pacing hint. Real backend updates should recalculate the remaining time model, not
    //    teleport the bar to a new percentage.
    // 4. While a job is active, the displayed bar should be monotonic: corrections change
    //    future pace, but they should not visually move the bar backward.
    // 5. Segment-scoped bars follow the same smoothing rule, but their source progress is
    //    segment progress rather than chapter/job progress.
    const baseProgress = clamp01(progress);
    const remembered = progressMemory.get(getProgressMemoryKey(persistenceKey, startedAt) || '');
    if (status === 'finalizing') return 1;
    if (!shouldPreserveMountedProgress(status, baseProgress, startedAt, remembered)) return 0;
    if (!predictive || !startedAt || !etaSeconds) return Math.max(baseProgress, remembered ?? 0);
    return Math.max(baseProgress, remembered ?? 0);
};

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
    const rememberedProgress = memoryKey ? (progressMemory.get(memoryKey) ?? undefined) : undefined;
    const preserveMountedProgress = shouldPreserveMountedProgress(presentationState, progress, startedAt, rememberedProgress);
    const preparingIndeterminate = isPreparingStatus(presentationState);
    const [now, setNow] = useState(Date.now());
    const [currentEndTime, setCurrentEndTime] = useState<number | null>(null);
    const [displayProgress, setDisplayProgress] = useState(() => getInitialDisplayProgress(progress, startedAt, etaSeconds, persistenceKey, predictive, presentationState));
    const lastTickRef = useRef(Date.now());
    const displayProgressRef = useRef(getInitialDisplayProgress(progress, startedAt, etaSeconds, persistenceKey, predictive, presentationState));
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
    const isLaunchSnapshot = !launchSnapshot
        || launchSnapshot.runAnchor !== currentLaunchSnapshot.runAnchor
        || launchSnapshot.status !== currentLaunchSnapshot.status
        || launchSnapshot.progress !== currentLaunchSnapshot.progress
        || launchSnapshot.startedAt !== currentLaunchSnapshot.startedAt
        || launchSnapshot.etaSeconds !== currentLaunchSnapshot.etaSeconds
        || launchSnapshot.checkpointMode !== currentLaunchSnapshot.checkpointMode
        || launchSnapshot.evidenceWeightFraction !== currentLaunchSnapshot.evidenceWeightFraction;
    const preferLaunchEtaOnly = isLaunchSnapshot;
    const tickLoopActive = isDynamicPresentation(presentationState);
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
        setDisplayProgress(0);
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
        correctionWeightMode?: 'default' | 'queue' | 'segment';
        model?: ReturnType<typeof buildPredictiveProgressModel>;
    }>({
        lastTickAt: Date.now(),
        dtSeconds: 0,
        tickElapsedSeconds: null,
        effectiveEtaSeconds: null,
        smoothingTicks: null,
        maxVisualStep: null,
        targetFloor: null,
        nextProgress: null,
        correctionWeightMode: resolvedCheckpointMode,
        model: undefined,
    });

    useEffect(() => {
        if (!memoryKey) return;
        progressMemory.set(memoryKey, allowBackwardProgress ? clamp01(displayProgress) : Math.max(progressMemory.get(memoryKey) ?? 0, displayProgress));
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
        setDisplayProgress(loadingToDynamicHandoff
            ? 0
            : getInitialDisplayProgress(
                progress,
                startedAt,
                etaSeconds,
                persistenceKey,
                predictive,
                presentationState,
            ));
    }, [progress, startedAt, etaSeconds, persistenceKey, predictive, presentationState, loadingToDynamicHandoff]);

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
        if (!isDynamicPresentation(presentationState)) {
            return;
        }
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 250);
        return () => clearInterval(interval);
    }, [presentationState]);

    useEffect(() => {
        if (presentationState === 'finalizing') {
            setDisplayProgress(0);
            return;
        }
        if (handoffResetPendingRef.current || handoffResetVisible) {
            handoffResetPendingRef.current = false;
            resetHandoffState();
            return;
        }
        if (!preserveMountedProgress && !preserveActiveVisualState) {
            setDisplayProgress(0);
            return;
        }
        const memoryFloor = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
        if (allowBackwardProgress && clamp01(progress) < displayProgressRef.current) {
            setDisplayProgress(clamp01(progress));
            return;
        }
        if (!predictive || !startedAt || !etaSeconds) {
            setDisplayProgress(prev => {
                const target = clamp01(progress);
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                return allowBackwardProgress
                    ? clamp01(prev + (gap * 0.35))
                    : Math.max(memoryFloor, clamp01(prev + (gap * 0.35)));
            });
            return;
        }
        if (authoritativeFloor) {
            setDisplayProgress(prev => Math.max(prev, memoryFloor, clamp01(progress)));
        }
    }, [progress, startedAt, etaSeconds, predictive, presentationState, authoritativeFloor, preserveActiveVisualState, preserveMountedProgress, loadingToDynamicHandoff, allowBackwardProgress]);

    useEffect(() => {
        const tickNow = now;
        const dt = Math.max(0.05, (tickNow - lastTickRef.current) / 1000);
        lastTickRef.current = tickNow;

        if (presentationState === 'finalizing') {
            setDisplayProgress(0);
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
            const next = clamp01(Math.max(memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0, clamp01(progress)));
            setDisplayProgress(next);
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
            setDisplayProgress(prev => {
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
            setDisplayProgress(next);
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
        const memoryFloor = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
        const effectiveEtaSeconds = getEffectiveEtaSeconds(startedAt, etaSeconds, tickNow, currentEndTimeRef.current);
        if (pendingRunAnchorRef.current === runAnchor) {
            pendingRunAnchorRef.current = null;
            setDisplayProgress(prev => {
                const launchProgress = loadingToDynamicHandoff
                    ? 0
                    : getInitialDisplayProgress(
                        progress,
                        startedAt,
                        etaSeconds,
                        persistenceKey,
                        predictive,
                        status,
                    );
                const next = authoritativeFloor
                    ? Math.max(prev, memoryFloor, launchProgress)
                    : clamp01(launchProgress);
                const pendingRemainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: Math.max(0, (tickNow / 1000) - startedAt),
                    effectiveEtaSeconds,
                    smoothingTicks: resolvedCheckpointMode === 'segment'
                        ? getCappedSmoothingTicks(2, pendingRemainingTicks)
                        : authoritativeFloor
                        ? getCappedSmoothingTicks(smoothingProgressBasis < EARLY_QUEUE_PROGRESS_THRESHOLD ? EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS : QUEUE_ETA_MAX_SMOOTHING_TICKS, pendingRemainingTicks)
                        : getCappedSmoothingTicks(ETA_MAX_SMOOTHING_TICKS, pendingRemainingTicks),
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor: Math.max(memoryFloor, clamp01(launchProgress)),
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

        setDisplayProgress(prev => {
            if (authoritativeFloor) {
                const targetFloor = Math.max(memoryFloor, clamp01(progress));
                const base = Math.max(prev, memoryFloor);
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
                        smoothingTicks: resolvedCheckpointMode === 'segment'
                            ? getCappedSmoothingTicks(2, remainingTicks)
                            : getCappedSmoothingTicks(smoothingProgressBasis < EARLY_QUEUE_PROGRESS_THRESHOLD ? EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS : QUEUE_ETA_MAX_SMOOTHING_TICKS, remainingTicks),
                        maxVisualStep: getMaxVisualStep(dt),
                        targetFloor,
                        nextProgress: 1,
                        correctionWeightMode: resolvedCheckpointMode,
                        model: next,
                    });
                    return 1;
                }
                if (prev < targetFloor) {
                    const gapToTarget = targetFloor - prev;
                    const minimumCatchupStep = gapToTarget / PROGRESS_MAX_SMOOTHING_TICKS;
                    const catchupCandidate = prev + Math.max(getMaxVisualStep(dt), minimumCatchupStep);
                    const finalNext = clamp01(Math.max(base, Math.min(targetFloor, catchupCandidate), next.nextProgress));
                    const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                    setDebugTick({
                        lastTickAt: tickNow,
                        dtSeconds: dt,
                        tickElapsedSeconds: elapsed,
                        effectiveEtaSeconds,
                        smoothingTicks: resolvedCheckpointMode === 'segment'
                            ? getCappedSmoothingTicks(2, remainingTicks)
                            : smoothingProgressBasis < EARLY_QUEUE_PROGRESS_THRESHOLD
                            ? getCappedSmoothingTicks(EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS, remainingTicks)
                            : getCappedSmoothingTicks(QUEUE_ETA_MAX_SMOOTHING_TICKS, remainingTicks),
                        maxVisualStep: getMaxVisualStep(dt),
                        targetFloor,
                        nextProgress: finalNext,
                        correctionWeightMode: resolvedCheckpointMode,
                        model: next,
                    });
                    return finalNext;
                }
                const finalNext = clamp01(Math.max(base, targetFloor, next.nextProgress));
                const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: elapsed,
                    effectiveEtaSeconds,
                        smoothingTicks: resolvedCheckpointMode === 'segment'
                            ? getCappedSmoothingTicks(2, remainingTicks)
                            : smoothingProgressBasis < EARLY_QUEUE_PROGRESS_THRESHOLD
                            ? getCappedSmoothingTicks(EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS, remainingTicks)
                            : getCappedSmoothingTicks(QUEUE_ETA_MAX_SMOOTHING_TICKS, remainingTicks),
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
            if (clamp01(progress) < prev) {
                const nextProgress = clamp01(progress);
                const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
                setDebugTick({
                    lastTickAt: tickNow,
                    dtSeconds: dt,
                    tickElapsedSeconds: elapsed,
                    effectiveEtaSeconds,
                    smoothingTicks: getCappedSmoothingTicks(ETA_MAX_SMOOTHING_TICKS, remainingTicks),
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor: nextProgress,
                    nextProgress,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: next,
                });
                return nextProgress;
            }
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
                    smoothingTicks: resolvedCheckpointMode === 'segment'
                        ? getCappedSmoothingTicks(2, remainingTicks)
                        : getCappedSmoothingTicks(ETA_MAX_SMOOTHING_TICKS, remainingTicks),
                    maxVisualStep: getMaxVisualStep(dt),
                    targetFloor: Math.max(progress, next.nextProgress),
                    nextProgress: 1,
                    correctionWeightMode: resolvedCheckpointMode,
                    model: next,
                });
                return 1
            }
            const cappedNext = Math.min(next.nextProgress, prev + getMaxVisualStep(dt))
            const finalNext = allowBackwardProgress
                ? clamp01(Math.min(cappedNext, clamp01(progress)))
                : Math.max(prev, memoryFloor, cappedNext)
            const remainingTicks = getRemainingTicks(tickNow, currentEndTimeRef.current);
            setDebugTick({
                lastTickAt: tickNow,
                dtSeconds: dt,
                tickElapsedSeconds: elapsed,
                effectiveEtaSeconds,
                smoothingTicks: getCappedSmoothingTicks(ETA_MAX_SMOOTHING_TICKS, remainingTicks),
                maxVisualStep: getMaxVisualStep(dt),
                targetFloor: allowBackwardProgress ? clamp01(progress) : Math.max(memoryFloor, clamp01(progress)),
                nextProgress: finalNext,
                correctionWeightMode: resolvedCheckpointMode,
                model: next,
            });
            return finalNext
        });

    }, [now, progress, startedAt, etaSeconds, predictive, presentationState, authoritativeFloor, preserveActiveVisualState, preserveMountedProgress, resolvedCheckpointMode, evidenceWeightFraction, loadingToDynamicHandoff, allowBackwardProgress]);

    const getProgressInfo = () => {
        const memoryFloor = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
    if (loadingToDynamicHandoff) {
        return { remaining: null, localProgress: 0, indeterminate: false };
    }
    if (isDoneStatus(presentationState)) {
        return { remaining: null, localProgress: 1, indeterminate: false };
    }
    if (isFailedStatus(presentationState)) {
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

        const visibleProgress = Math.max(memoryFloor, clamp01(displayProgress));
        const elapsed = Math.max(0, (now / 1000) - startedAt);
        const etaProgressBasis = authoritativeFloor ? Math.max(visibleProgress, clamp01(progress)) : progress;
        const effectiveEtaSeconds = getEffectiveEtaSeconds(startedAt, etaSeconds, now, currentEndTimeRef.current);
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
            indeterminate: false
        };
    };

    const { localProgress, indeterminate } = getProgressInfo();
    const smoothingProgressBasis = Math.max(clamp01(progress), localProgress);
    const autoFinalizing = isLiveAnimatedStatus(presentationState)
        && localProgress >= 0.995
        && !isDoneStatus(presentationState)
        && !isFailedStatus(presentationState)
        && !isCancelledStatus(presentationState);
    const visualState = autoFinalizing ? 'finalizing' : presentationState;
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
    const busyStatusText = visualState === 'finalizing'
        ? 'Finalizing...'
        : indeterminate
        ? 'Working...'
        : null;
    const terminalStatusText = isDoneStatus(visualState)
        ? 'Complete'
        : isFailedStatus(visualState)
        ? 'Error'
        : isCancelledStatus(visualState)
        ? 'Cancelled'
        : isQueuedStatus(visualState)
        ? 'Queued'
        : null;
    const terminalFillStyle = isDoneStatus(visualState)
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
        const rememberedProgress = memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0;
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
    }, [progress, startedAt, etaSeconds, predictive, status, memoryKey, preserveActiveVisualState, preserveMountedProgress, authoritativeFloor, evidenceWeightFraction, resolvedCheckpointMode, visualState, loadingToDynamicHandoff]);

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
        const smoothingTicks = resolvedCheckpointMode === 'segment'
            ? getCappedSmoothingTicks(2, remainingTicks)
            : authoritativeFloor
            ? getCappedSmoothingTicks(smoothingProgressBasis < EARLY_QUEUE_PROGRESS_THRESHOLD ? EARLY_QUEUE_ETA_MAX_SMOOTHING_TICKS : QUEUE_ETA_MAX_SMOOTHING_TICKS, remainingTicks)
            : getCappedSmoothingTicks(ETA_MAX_SMOOTHING_TICKS, remainingTicks);
        const minimumCatchupMs = Math.ceil(Math.abs(deltaMs) / smoothingTicks);
        const minimumNudgeMs = authoritativeFloor ? 60 : 150;
        const maxPerTickMs = Math.max(minimumNudgeMs, minimumCatchupMs);
        const nudgeMs = deltaMs > 0
            ? Math.min(deltaMs, maxPerTickMs)
            : Math.max(deltaMs, -maxPerTickMs);
        const nextEndTime = currentEndTime + nudgeMs;

        currentEndTimeRef.current = nextEndTime;
        setCurrentEndTime(nextEndTime);
    }, [now, predictive, startedAt, etaSeconds, presentationState, preserveActiveVisualState, preserveMountedProgress, authoritativeFloor, progress, resolvedCheckpointMode, visualState, loadingToDynamicHandoff]);

    const displayedRemaining = currentEndTime === null
        ? null
        : Math.max(0, Math.ceil((currentEndTime - now) / 1000));
    const queueRemainingFloor = authoritativeFloor && startedAt && etaSeconds
        ? Math.max(0, Math.ceil(Math.max(0, 1 - localProgress) * etaSeconds))
        : null;
    const syncedDisplayedRemaining = queueRemainingFloor === null
        ? displayedRemaining
        : (displayedRemaining === null ? queueRemainingFloor : Math.max(displayedRemaining, queueRemainingFloor));

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
            memoryFloor: memoryKey ? (progressMemory.get(memoryKey) ?? 0) : 0,
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
            correctionWeightMode: debugTick.correctionWeightMode,
            model: debugTick.model,
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
